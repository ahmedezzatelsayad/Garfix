# R8 — Database Migration Rollback Drill Runbook

## Purpose

Verify that a database migration can be safely rolled back in production
without data loss or extended downtime. This runbook is executed as a
**drill** on the staging database before any production migration that
touches a critical table (Invoice, JournalEntry, Voucher, AppUser, Company,
AuditLog, OutboxEvent).

The drill answers four questions:

1. Can we identify the migration to roll back?
2. Can we restore the schema to its pre-migration state?
3. Can we restore the data from backup if the migration was destructive?
4. How long does the whole procedure take (RTO)?

## Prerequisites

- A staging PostgreSQL database with the latest migration applied.
- `pg_dump` access to the staging database (or `pg_basebackup` for larger DBs).
- The Prisma migration history table (`_prisma_migrations`) present.
- A second terminal session logged into the staging DB via `psql` for
  verification queries.
- The Git SHA of the commit that introduced the migration being drilled.

## Definitions

- **RTO** (Recovery Time Objective): The maximum acceptable time between
  the start of the rollback and the application serving requests again.
  Target: **15 minutes**.
- **RPO** (Recovery Point Objective): The maximum acceptable data loss.
  Target: **0 rows** for destructive rollbacks (data restored from backup),
  **0 rows** for non-destructive rollbacks (schema-only migration).

## Rollback Drill Procedure

### Step 1 — Identify the Migration to Roll Back

List the applied migrations on the staging database:

```bash
# From the repo root
npx prisma migrate status \
  --schema prisma/schema.prisma \
  --url "$STAGING_DATABASE_URL"
```

**Expected output:**
```
Database connection URL: <redacted>
Statuses:
✔️ 20260101000000_init (applied)
✔️ 20260115120000_add_journal_entry_version (applied)
✔️ 20260201000000_add_outbox_event (applied)
✔️ 20260215120000_add_soft_delete (applied)  ← target
```

Pick the most recent migration as the rollback target. Record:
- Migration name: `<migration_name>`
- Migration SHA: `<git-sha-of-migration-commit>`
- Migration applied at: `<timestamp>`

### Step 2 — Take a Pre-Rollback Backup

This backup is the safety net. If the rollback corrupts data, we restore
from this backup.

```bash
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="/tmp/staging-pre-rollback-${TIMESTAMP}.sql"

pg_dump \
  --format=plain \
  --no-owner \
  --no-privileges \
  "$STAGING_DATABASE_URL" \
  > "$BACKUP_FILE"

# Verify the backup is non-empty and contains the critical tables
ls -lh "$BACKUP_FILE"
grep -c "COPY public.\"Invoice\"" "$BACKUP_FILE" || true
grep -c "COPY public.\"JournalEntryLine\"" "$BACKUP_FILE" || true
grep -c "COPY public.\"AuditLog\"" "$BACKUP_FILE" || true
```

**On failure:** Abort the drill. Do not proceed without a verified backup.

### Step 3 — Snapshot the Row Counts (Pre-Rollback)

Record the row counts of all critical tables. After the rollback, these
counts must match (for non-destructive rollbacks) or be exactly the
pre-migration counts (for destructive rollbacks restored from backup).

```bash
psql "$STAGING_DATABASE_URL" <<'SQL'
SELECT 'Invoice' AS table, COUNT(*) FROM "Invoice"
UNION ALL
SELECT 'JournalEntryLine', COUNT(*) FROM "JournalEntryLine"
UNION ALL
SELECT 'Voucher', COUNT(*) FROM "Voucher"
UNION ALL
SELECT 'AppUser', COUNT(*) FROM "AppUser"
UNION ALL
SELECT 'Company', COUNT(*) FROM "Company"
UNION ALL
SELECT 'AuditLog', COUNT(*) FROM "AuditLog"
UNION ALL
SELECT 'OutboxEvent', COUNT(*) FROM "OutboxEvent"
ORDER BY 1;
SQL
```

Save the output to `/tmp/staging-pre-rollback-counts.txt`.

### Step 4 — Execute the Rollback

Prisma does not auto-generate down migrations. Two strategies:

#### Strategy A — Restore from Backup (Destructive Rollback)

Use this when the migration added/removed columns or tables and the data
cannot be reconstructed by reversing the SQL.

```bash
# 1. Drop all tables (cascading)
psql "$STAGING_DATABASE_URL" <<'SQL'
DROP SCHEMA public CASCADE;
CREATE SCHEMA public;
GRANT ALL ON SCHEMA public TO postgres;
GRANT ALL ON SCHEMA public TO public;
SQL

# 2. Restore from the pre-rollback backup
psql "$STAGING_DATABASE_URL" < "$BACKUP_FILE"

# 3. Mark the rolled-back migration as rolled-back in Prisma's history
npx prisma migrate resolve \
  --schema prisma/schema.prisma \
  --url "$STAGING_DATABASE_URL" \
  --rolled-back "<migration_name>"
```

#### Strategy B — Reverse the Migration SQL (Non-Destructive Rollback)

Use this when the migration is reversible (e.g., it added a nullable column
that can be safely dropped, or it created an index that can be dropped).

Write the reverse SQL to a file `/tmp/rollback.sql`:

```sql
-- Reverse of 20260215120000_add_soft_delete
ALTER TABLE "Invoice" DROP COLUMN IF EXISTS "deletedAt";
ALTER TABLE "JournalEntryLine" DROP COLUMN IF EXISTS "deletedAt";
ALTER TABLE "Voucher" DROP COLUMN IF EXISTS "deletedAt";
-- ... etc for every table touched by the migration
```

Apply it:

```bash
psql "$STAGING_DATABASE_URL" < "/tmp/rollback.sql"

npx prisma migrate resolve \
  --schema prisma/schema.prisma \
  --url "$STAGING_DATABASE_URL" \
  --rolled-back "<migration_name>"
```

### Step 5 — Regenerate the Prisma Client

After the schema change, the Prisma client must be regenerated to match.

```bash
# Check out the Git SHA before the migration was applied
git checkout <git-sha-before-migration>

npx prisma generate
npx prisma migrate status --url "$STAGING_DATABASE_URL"
```

The status should now show the rolled-back migration as `rolled-back` and
all earlier migrations as `applied`.

### Step 6 — Restart the Application

```bash
# Restart the Next.js standalone server
pm2 restart garfix-staging  # or: systemctl restart garfix-staging

# Wait for health
until curl -fsS --max-time 2 "https://staging.garfix.app/api/health" \
  | jq -e '.status == "ok"' > /dev/null; do
  echo "Waiting for app to come up..."
  sleep 2
done
```

### Step 7 — Verify Post-Rollback Row Counts

```bash
psql "$STAGING_DATABASE_URL" <<'SQL'
SELECT 'Invoice' AS table, COUNT(*) FROM "Invoice"
UNION ALL
SELECT 'JournalEntryLine', COUNT(*) FROM "JournalEntryLine"
UNION ALL
SELECT 'Voucher', COUNT(*) FROM "Voucher"
UNION ALL
SELECT 'AppUser', COUNT(*) FROM "AppUser"
UNION ALL
SELECT 'Company', COUNT(*) FROM "Company"
UNION ALL
SELECT 'AuditLog', COUNT(*) FROM "AuditLog"
UNION ALL
SELECT 'OutboxEvent', COUNT(*) FROM "OutboxEvent"
ORDER BY 1;
SQL
```

Compare with `/tmp/staging-pre-rollback-counts.txt`:

- **Strategy A (backup restore):** Counts must match exactly.
- **Strategy B (reverse SQL):** Counts must match exactly for tables not
  touched by the migration. For tables touched by the migration, the count
  of rows in the dropped column will be 0 (column does not exist).

### Step 8 — Run the Smoke Test

Execute the R7 staging smoke test to confirm the application is healthy
after the rollback:

```bash
export STAGING_URL=https://staging.garfix.app
export SMOKE_AUTH_TOKEN=<founder-jwt>
bash docs/runbooks/r7-staging-smoke.sh
```

All 6 steps must pass.

### Step 9 — Document the Drill Outcome

Record the following in `docs/runbooks/r8-rollback-drill-log.md`:

- Date and time of the drill.
- Migration name rolled back.
- Strategy used (A or B).
- Start time and end time → RTO.
- Pre-rollback and post-rollback row counts.
- Any failures encountered and how they were resolved.
- Sign-off: engineer name + timestamp.

## Pass Criteria

The drill passes when:

1. The rollback completes within 15 minutes (RTO).
2. Post-rollback row counts match pre-rollback counts (RPO = 0).
3. The R7 smoke test passes after the rollback.
4. The application serves authenticated requests correctly.

## Failure Scenarios

### Scenario 1 — Backup Restore Fails

**Symptom:** `psql < backup.sql` fails with a foreign-key constraint error.

**Fix:** Add `SET session_replication_role = 'replica';` at the top of the
backup file to disable triggers during restore. Re-run the restore.

### Scenario 2 — Prisma Migrate Resolve Fails

**Symptom:** `prisma migrate resolve --rolled-back` fails with "migration
not found".

**Fix:** Check the migration name in the `_prisma_migrations` table:

```sql
SELECT migration_name, finished_at, rolled_back_at
FROM _prisma_migrations
ORDER BY started_at DESC
LIMIT 5;
```

Use the exact `migration_name` from the table.

### Scenario 3 — Application Fails to Start After Rollback

**Symptom:** The Next.js process crashes on startup with a Prisma error
like "Unknown field `deletedAt` on `Invoice`".

**Fix:** The application code still references the column that was dropped.
Either:
- Roll forward to the migration (re-apply it), OR
- Check out the Git SHA before the migration was applied and redeploy.

This is why Step 5 (Regenerate the Prisma Client) requires checking out
the pre-migration Git SHA — the code and the schema must be in sync.

## CI Integration

The rollback drill is **manual** — it cannot be safely automated because
it requires human judgment about which strategy (A or B) to use. However,
the pre-rollback backup (Step 2) should be automated:

```yaml
# .github/workflows/deploy.yml
pre-rollback-backup:
  needs: deploy-staging
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4
    - name: Take pre-deployment backup
      run: |
        pg_dump "$STAGING_DATABASE_URL" > /tmp/staging-$(date +%Y%m%d_%H%M%S).sql
        # Upload to S3 / GCS for retention
        aws s3 cp /tmp/staging-*.sql s3://garfix-backups/staging/
```

This ensures a backup is always available before any deployment, so the
rollback drill can be executed immediately if needed.

## RTO / RPO Targets

| Scenario | RTO | RPO |
|----------|-----|-----|
| Non-destructive rollback (Strategy B) | 5 min | 0 rows |
| Destructive rollback (Strategy A, backup restore) | 15 min | 0 rows (from backup) |
| Catastrophic failure (no backup) | N/A | All data since last backup |

## Drill Schedule

- **First drill:** Before the first production migration that touches a
  critical table.
- **Recurring drills:** Quarterly, or before any migration that adds/removes
  columns on Invoice, JournalEntry, Voucher, AppUser, Company, AuditLog, or
  OutboxEvent.
- **After any rollback runbook change:** Re-run the drill to verify the
  updated procedure works.

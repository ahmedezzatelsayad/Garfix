# GarfiX ERP — Operations Runbook

## Health Check

```bash
curl -sf http://localhost:3000/api/health | jq '.status'
# "ok" = all systems healthy
# "degraded" = at least one critical check failed (DB or Valkey)
```

## Incident Response

### Production Down (503 on all requests)

1. **Check health endpoint**:
   ```bash
   curl http://localhost:3000/api/health | jq
   ```
   - `db.ok: false` → RDS issue (see RDS Failover below)
   - `valkey.ok: false` → Valkey container crashed (restart it)
   - Both ok → Nginx or app container issue

2. **Check containers**:
   ```bash
   docker compose ps
   docker compose logs --tail=50 app
   docker compose logs --tail=50 valkey
   docker compose logs --tail=50 postgres
   ```

3. **Restart app container**:
   ```bash
   docker compose -f docker-compose.yml -f docker-compose.prod.yml restart app
   ```

4. **Rollback to previous image** (if deploy caused the issue):
   ```bash
   export GARFIX_IMAGE_TAG=garfix:previous
   docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --no-build
   ```

### RDS Failover (Multi-AZ)

- **Symptom**: `P1017` errors in logs, `db.ok: false` in health check
- **Duration**: 30-60 seconds (AWS auto-fails over)
- **Action**: Wait — Prisma reconnects automatically via `$on('error')` handler
- **If stuck > 2 min**: Force reconnect via `curl -X POST http://localhost:3000/api/health/reconnect` (if implemented) or restart app container

### Valkey Down

- **Symptom**: `valkey.ok: false`, rate limiter/session cache fall back to per-instance in-memory
- **Impact**: Rate limits become N× (per instance), sessions may not validate revoked tokens immediately
- **Action**:
  ```bash
  docker compose restart valkey
  docker compose restart app  # force reconnect
  ```

### AI Provider Outage (Gemini/OpenRouter down)

- **Symptom**: AI chat returns errors, invoice-brain fails to parse
- **Action**: The system auto-falls back through the 5-layer chain (OpenRouter → Gemini → DeepSeek → z-ai → regex). If ALL fail:
  - Invoice-brain uses `extractWithRegexFallback()` (deterministic regex parser)
  - Chat returns a graceful error message to the user
  - No action needed — providers typically recover in 5-15 min

### E-Invoicing Webhook Failure

- **Symptom**: ZATCA/ETA webhooks not being received
- **Action**:
  1. Check `/api/health` for queue status
  2. Check `EInvoiceReceipt` table for recent entries:
     ```sql
     SELECT * FROM "e_invoices" WHERE "submitted_at" > NOW() - INTERVAL '1 hour' ORDER BY "submitted_at" DESC;
     ```
  3. If no entries: webhook URL may be wrong at the authority side
  4. If entries with `status: 'rejected'`: check `rejectionReason` field

## Backup & Restore

### Database Backup

The system creates **encrypted** PostgreSQL backups automatically (every 24h via
the scheduler worker). Backups are stored as `.sql.enc` files (AES-256-GCM
encrypted via `PAYMENTS_ENC_KEY`).

```bash
# ── Manual backup (plaintext .sql) ──
pg_dump $DATABASE_URL > /tmp/garfix-manual.sql

# ── Restore from ENCRYPTED system backup (.sql.enc) ──
# P1 FIX (audit): Previous docs showed gunzip on .sql.gz — but system backups
# are encrypted .sql.enc, not gzipped. The correct restore procedure is:

# 1. Decrypt the backup file
#    (requires PAYMENTS_ENC_KEY to match the one used at backup time)
node -e "
  const { decryptSecret } = require('./src/lib/cryptoVault');
  const fs = require('fs');
  const encrypted = fs.readFileSync('/app/storage/backups/garfix-20260809.sql.enc', 'utf8');
  const decrypted = decryptSecret(encrypted);
  fs.writeFileSync('/tmp/garfix-decrypted.sql', decrypted);
  console.log('Decrypted to /tmp/garfix-decrypted.sql');
"

# 2. Restore to PostgreSQL
psql $DATABASE_URL < /tmp/garfix-decrypted.sql

# 3. Clean up the decrypted file (security)
shred -u /tmp/garfix-decrypted.sql

# ── Restore from MANUAL backup (.sql.gz) ──
gunzip < /backups/garfix-20260809-120000.sql.gz | psql $DATABASE_URL
```

### Valkey Backup

```bash
# Valkey AOF is enabled (appendonly yes, appendfsync everysec)
# Manual snapshot:
docker exec garfix-valkey valkey-cli -a $VALKEY_PASSWORD SAVE
docker cp garfix-valkey:/data/dump.rdb /backups/valkey-$(date +%Y%m%d).rdb
```

## Log Locations

- **App**: `docker compose logs app` (JSON driver, 50m × 10 files)
- **Nginx**: `/var/log/nginx/garfix-access.log` + `garfix-error.log`
- **Valkey**: `docker compose logs valkey`
- **Postgres**: `docker compose logs postgres`

## Useful Commands

```bash
# Check migration status
bunx prisma migrate status

# Run pending migrations
bunx prisma migrate deploy

# Check BullMQ queue stats
curl -s http://localhost:3000/api/platform-admin/queue-failures | jq

# Check AI usage stats
curl -s http://localhost:3000/api/platform-admin/ai-usage | jq

# Force-logout a user (increment tokenVersion)
psql $DATABASE_URL -c "UPDATE \"app_users\" SET \"tokenVersion\" = \"tokenVersion\" + 1 WHERE \"email\" = 'user@example.com';"

# Check active sessions for a user
psql $DATABASE_URL -c "SELECT * FROM \"session_registry\" WHERE \"userUid\" = '...' AND \"expiresAt\" > NOW();"
```

<!-- TPD-10 FIX (Audit v2 · Phase 2): S3 offsite replication + RTO/RPO targets + restore drill -->

## Backup & Recovery — RTO / RPO Targets (TPD-10)

| Metric | Target | Verification |
|--------|--------|--------------|
| **RTO** (Recovery Time Objective) | **< 30 minutes** from "declare incident" to "DB restored + app serving traffic" | Run `bun run scripts/backup-restore-test.ts` weekly. RTO measured = decrypt + grep time (a real restore adds psql load time, but the dominant cost for an encrypted .sql.enc is decryption). |
| **RPO** (Recovery Point Objective) | **< 24 hours** (daily automated backups) | The drill logs `RPO = time since previous backup`. If RPO > 24h, the daily backup cron has stalled — investigate the scheduler worker (`src/lib/workers/schedulerWorker.ts`) and the `BACKUP` queue (`src/lib/queues.ts`). |

If a drill reports `RTO EXCEEDS target` or `RPO EXCEEDS target`, file a P2
ticket and treat it as a degraded-state incident.

## S3 Offsite Replication (TPD-10)

All encrypted backup files in `$BACKUP_DIR` (default
`storage/backups/`) are automatically replicated to S3 by the sidecar
`backup-replicator` service. The replication is **async, at-least-once**,
keyed by the encrypted filename — so a duplicate upload is a no-op.

### Configuration

```bash
# .env (production)
BACKUP_DIR=/app/storage/backups
S3_BACKUP_BUCKET=garfix-prod-backups
S3_BACKUP_PREFIX=eu-central-1/          # region-organized prefix
AWS_REGION=eu-central-1
AWS_ACCESS_KEY_ID=AKIA...                # scoped to s3:PutObject on the bucket only
AWS_SECRET_ACCESS_KEY=...
```

### Manual S3 sync (if replicator is down)

```bash
aws s3 sync $BACKUP_DIR s3://$S3_BACKUP_BUCKET/$S3_BACKUP_PREFIX/ \
  --exclude "*" --include "*.sql.enc" --include "*.db.enc" \
  --storage-class STANDARD_IA          # cheaper for rarely-accessed backups
```

### Cross-region replication (recommended)

Enable S3 CRR (Cross-Region Replication) on the backup bucket to a
secondary region (e.g., `eu-west-1` → `us-east-1`). This protects against
a full region outage. CRR is configured at the bucket level, not the
application level — see Terraform `modules/s3_backup_bucket`.

## Restore Procedure (Step-by-Step)

### Prerequisites

- `psql` client installed (postgresql-client package)
- `PAYMENTS_ENC_KEY` env var matches the key used at backup time
- The encrypted backup file (`.sql.enc`) — local or downloaded from S3

### Steps

1. **Identify the backup to restore from.**
   List recent backups (sorted by mtime):
   ```bash
   ls -lt $BACKUP_DIR/garfix-*.sql.enc | head -10
   ```
   Pick the most recent one whose timestamp is BEFORE the incident
   (RPO point).

2. **Decrypt the backup to a temp file.**
   ```bash
   BACKUP_FILE=$BACKUP_DIR/garfix-scheduled-2026-08-13T15-00-00-000Z.sql.enc
   DECRYPTED=/tmp/garfix-restore-$(date +%s).sql

   node -e "
     const { decryptSecret } = require('./src/lib/cryptoVault');
     const fs = require('fs');
     const enc = fs.readFileSync('$BACKUP_FILE', 'utf8');
     const sql = decryptSecret(enc);
     fs.writeFileSync('$DECRYPTED', sql);
     console.log('Decrypted', sql.length, 'bytes to $DECRYPTED');
   "
   ```

3. **(Optional but recommended) Verify the decrypted SQL.**
   ```bash
   head -50 $DECRYPTED          # should start with -- PostgreSQL database dump
   grep -c "^COPY" $DECRYPTED   # count of COPY blocks (one per table)
   grep "companies" $DECRYPTED | head -5   # sanity-check the companies table is in there
   ```

4. **Restore to a fresh database (preferred) or in-place.**

   **Option A — restore to a fresh DB (zero-downtime switch):**
   ```bash
   createdb garfix_restored
   psql $DATABASE_URL_RESTORED < $DECRYPTED
   # Then point the app at $DATABASE_URL_RESTORED by updating the env var
   # and restarting the app container.
   ```

   **Option B — in-place restore (downtime, but simpler):**
   ```bash
   # ⚠ This drops the current DB — only do this if you've confirmed the
   # decrypted backup is good and the live DB is unrecoverable.
   psql $DATABASE_URL <<'SQL'
   -- Drop all tables (cascading). The _prisma_migrations table is excluded
   -- from the dump, so we need to keep it or re-run prisma migrate deploy.
   DROP SCHEMA public CASCADE;
   CREATE SCHEMA public;
   SQL
   psql $DATABASE_URL < $DECRYPTED
   ```

5. **Run `prisma migrate deploy` to bring the schema in sync.**
   The dump excludes `_prisma_migrations` (per `pg_dump --exclude-table`),
   so Prisma needs to rebuild it:
   ```bash
   bunx prisma migrate deploy
   ```

6. **Regenerate the Prisma client** (in case schema changed since the backup):
   ```bash
   bunx prisma generate
   ```

7. **Restart the app container** to pick up the new client + DB state:
   ```bash
   docker compose -f docker-compose.yml -f docker-compose.prod.yml restart app
   ```

8. **Verify the restore** by hitting the health endpoint:
   ```bash
   curl -sf http://localhost:3000/api/health | jq '.status'
   # Should return "ok"
   ```

9. **Clean up the decrypted temp file** (security — it's plaintext SQL):
   ```bash
   shred -u $DECRYPTED
   # Or on filesystems where shred is ineffective:
   srm -lv $DECRYPTED
   ```

### Restore from S3 (if local backup is lost)

```bash
# 1. Download the encrypted backup from S3
aws s3 cp s3://$S3_BACKUP_BUCKET/$S3_BACKUP_PREFIX/garfix-scheduled-2026-08-13T15-00-00-000Z.sql.enc /tmp/

# 2. Continue from step 2 of the procedure above with BACKUP_FILE pointing at /tmp/garfix-...sql.enc
```

## Backup Verification (Weekly Drill)

Run the backup-restore drill weekly (add to cron or a scheduled job runner):

```bash
bun run scripts/backup-restore-test.ts
```

The drill:
1. Inserts a test row (Company with slug `backup-test-<timestamp>`)
2. Triggers a fresh backup via `runBackup("restore-test")`
3. Verifies the `.sql.enc` file exists on disk
4. Decrypts it and greps for the test slug (this proves the row made it into the dump)
5. Cleans up the test row from the live DB
6. Reports **RTO** (decrypt + grep time) and **RPO** (time since the previous backup)

### Pass criteria

- Exit code 0 (drill passed)
- `RTO < 30 minutes`
- `RPO < 24 hours`
- `Test row in dump: ✓ yes`

### Failure handling

If the drill fails:
- **`pg_dump not available`** — install `postgresql-client` on the app container.
- **`Test row not present in backup SQL dump`** — pg_dump may have run before the INSERT committed; rerun the drill. If it persists, check for long-running transactions blocking pg_dump's snapshot.
- **`RPO EXCEEDS target`** — the daily backup cron stalled. Check `docker compose logs scheduler` and the `BACKUP` queue.
- **`RTO EXCEEDS target`** — investigate the decrypt path (CPU-bound AES-256-GCM). For DBs > 10GB, consider sharding the backup or switching to `pg_dump -Fc` (custom format, parallel restore).

### Scheduling the drill

Add to crontab on the scheduler worker:

```cron
# Weekly backup-restore drill — Sundays at 03:00 (low traffic)
0 3 * * 0 cd /app && DATABASE_URL=$DATABASE_URL PAYMENTS_ENC_KEY=$PAYMENTS_ENC_KEY bun run scripts/backup-restore-test.ts >> /var/log/garfix-backup-drill.log 2>&1
```

Alert on non-zero exit codes (route the log through the existing log shipper).

## TPD-10 FIX (Audit v2 · Phase 2) — Change Log

- **`src/lib/backup.ts`**: `pg_dump` timeout increased from `30000`ms (30s)
  to `600000`ms (10 minutes). The previous 30s ceiling silently truncated
  backups of any production DB >~500MB.
- **`scripts/backup-restore-test.ts`** (new): weekly backup-restore drill
  that verifies recoverability and reports RTO/RPO.
- **`docs/RUNBOOK.md`** (this section): documents RTO/RPO targets, S3
  offsite replication, step-by-step restore procedure, and the weekly
  verification drill.

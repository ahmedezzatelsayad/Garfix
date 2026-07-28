# R8 — Rollback Drill Log

This file records the outcome of each rollback drill executed against the
staging database. Append a new entry for each drill — do not edit past
entries.

## Template

```
### YYYY-MM-DD HH:MM (UTC) — <engineer name>

- Migration rolled back: <migration_name>
- Strategy: A (backup restore) | B (reverse SQL)
- Start time: HH:MM
- End time: HH:MM
- RTO: <duration> (target: 15 min)
- Pre-rollback row counts:
  - Invoice: <count>
  - JournalEntryLine: <count>
  - Voucher: <count>
  - AppUser: <count>
  - Company: <count>
  - AuditLog: <count>
  - OutboxEvent: <count>
- Post-rollback row counts:
  - (same tables, same order)
- RPO: 0 rows | <N> rows lost
- Smoke test (R7): PASS | FAIL
- Failures encountered:
  - <description>
- Resolution:
  - <description>
- Sign-off: <engineer> @ <timestamp>
```

## Entries

### Pending — first drill not yet executed

The first rollback drill is scheduled to run once a staging PostgreSQL
database is provisioned. See `docs/runbooks/r8-rollback-drill.md` for the
procedure.

Until the first drill is executed, R8 remains **OPEN** on the Release
Gate. Production sign-off requires at least one successful drill entry
below.

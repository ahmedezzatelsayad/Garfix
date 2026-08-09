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

```bash
# Manual backup
pg_dump $DATABASE_URL | gzip > /backups/garfix-$(date +%Y%m%d-%H%M%S).sql.gz

# Restore
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

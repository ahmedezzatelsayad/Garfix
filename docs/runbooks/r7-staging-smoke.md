# R7 — Staging Smoke Test Runbook

## Purpose

Verify that a freshly-deployed staging instance of Garfix is healthy enough
to receive production traffic. This runbook is executed automatically by the
CI pipeline after every successful `next build` on the `main` branch, and
manually before any production sign-off.

## Prerequisites

- A staging deployment of Garfix (Next.js standalone server) reachable over
  HTTPS at `$STAGING_URL`.
- A staging PostgreSQL database with the latest migration applied.
- A staging Valkey/Redis instance for caching and pub-sub.
- The following environment variables set in the CI runner:
  - `STAGING_URL` — base URL of the staging instance (e.g. `https://staging.garfix.app`).
  - `SMOKE_AUTH_TOKEN` — a pre-provisioned service-account JWT for hitting
    authenticated endpoints. Must have `founder` role on a seed company.

## Smoke Test Procedure

### Step 1 — Liveness (Unauthenticated)

Hit the public health endpoint. This verifies the Next.js process is up and
responsive.

```bash
curl -fsS --max-time 5 "$STAGING_URL/api/health" \
  | jq -e '.status == "ok" and .checks.db == "ok"'
```

**Expected response:**
```json
{
  "status": "ok",
  "checks": {
    "db": "ok",
    "valkey": "ok",
    "queues": "ok"
  },
  "version": "<git-sha>"
}
```

**On failure:** Abort the deployment. Page the on-call engineer. The instance
is not reachable or the database connection is broken.

### Step 2 — Circuit Breaker Status

Hit the circuit-breaker health endpoint. All breakers must be `CLOSED` on a
fresh deployment — any `OPEN` breaker indicates a downstream dependency is
failing.

```bash
curl -fsS --max-time 5 "$STAGING_URL/api/health/circuit-breakers" \
  | jq -e '.breakers | all(.state == "CLOSED")'
```

**On failure:** Inspect the breaker name. If it is `ai-fabric` or
`e-invoicing`, the upstream provider is down — check provider status pages.
If it is `db` or `valkey`, the infrastructure is broken — restart the
affected service.

### Step 3 — Audit Trail Reachable

Hit the audit-trail health endpoint. This verifies that the audit-log table
exists and is queryable.

```bash
curl -fsS --max-time 5 "$STAGING_URL/api/health/audit-trail?limit=1" \
  | jq -e '.entries | type == "array"'
```

**On failure:** The `AuditLog` table is missing or the RLS role cannot read
it. Run `prisma migrate deploy` on the staging database and verify the RLS
policy.

### Step 4 — Authenticated Round-Trip

Issue an authenticated request to the dashboard stats endpoint. This
verifies that the JWT validation path, the RLS-secured Prisma client, and
the company-tenancy filter all work end-to-end.

```bash
curl -fsS --max-time 10 \
  -H "Authorization: Bearer $SMOKE_AUTH_TOKEN" \
  -H "Cookie: inv_token=$SMOKE_AUTH_TOKEN" \
  "$STAGING_URL/api/dashboard/stats" \
  | jq -e '.totalInvoices | type == "number"'
```

**On failure:** Check that:
1. The JWT is not expired (`jwt.io` decode).
2. The `AppUser` row for the service account exists.
3. The `Company` row for the seed slug exists and the user is a member.
4. RLS policies on `Invoice` allow the user's `companyId`.

### Step 5 — E-Invoicing Submission (Sandbox)

Submit a test invoice to the ZATCA sandbox. This verifies that the
e-invoicing retry/ack-poll pipeline is functional.

```bash
curl -fsS --max-time 30 \
  -X POST \
  -H "Authorization: Bearer $SMOKE_AUTH_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"invoiceId": "smoke-test-001", "country": "SA"}' \
  "$STAGING_URL/api/e-invoicing/submit"
```

**Expected response:**
```json
{
  "ok": true,
  "submissionId": "<uuid>",
  "state": "PENDING"
}
```

**On failure:** Check that:
1. The ZATCA sandbox credentials are set in the staging env.
2. The X.509 certificate is uploaded and not expired.
3. The CSR was generated with the correct VAT number.

### Step 6 — OpenTelemetry Export

Verify that the OTel SDK is exporting traces to the collector.

```bash
# Run on the OTel collector host
curl -fsS --max-time 5 "http://localhost:8889/metrics" \
  | grep -c "garfix_http_requests_total"
```

**Expected:** At least 1 metric line containing
`garfix_http_requests_total` (emitted by Steps 1–5 above).

**On failure:** Check that `OTEL_EXPORTER_OTLP_ENDPOINT` is set in the
staging env and that the collector is reachable from the Next.js process.

## Pass Criteria

All 6 steps must pass. Any failure aborts the deployment and pages the
on-call engineer.

## CI Integration

Add the following job to `.github/workflows/deploy.yml`:

```yaml
smoke-test:
  needs: deploy-staging
  runs-on: ubuntu-latest
  env:
    STAGING_URL: ${{ secrets.STAGING_URL }}
    SMOKE_AUTH_TOKEN: ${{ secrets.SMOKE_AUTH_TOKEN }}
  steps:
    - uses: actions/checkout@v4
    - name: Run smoke tests
      run: |
        bash docs/runbooks/r7-staging-smoke.sh
    - name: Notify on failure
      if: failure()
      run: |
        curl -X POST "$SLACK_WEBHOOK" \
          -d "{\"text\": \"R7 smoke test FAILED on $STAGING_URL\"}"
```

The script `docs/runbooks/r7-staging-smoke.sh` wraps the 6 curl commands
above and exits non-zero on any failure.

## Manual Execution

```bash
export STAGING_URL=https://staging.garfix.app
export SMOKE_AUTH_TOKEN=<founder-jwt>
bash docs/runbooks/r7-staging-smoke.sh
```

## RTO / RPO

- **RTO** (Recovery Time Objective): 5 minutes — the smoke test must complete
  within 5 minutes of deployment. If it takes longer, the deployment is
  considered failed.
- **RPO** (Recovery Point Objective): N/A — this is a forward-looking
  health check, not a data-recovery procedure.

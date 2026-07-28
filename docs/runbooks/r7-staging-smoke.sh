#!/usr/bin/env bash
# R7 — Staging Smoke Test Runner
# Exits 0 on success, 1 on any failure.
set -euo pipefail

: "${STAGING_URL:?STAGING_URL is required}"
: "${SMOKE_AUTH_TOKEN:?SMOKE_AUTH_TOKEN is required}"

fail() { echo "FAIL: $*" >&2; exit 1; }

echo "==> Step 1: Liveness (unauthenticated)"
curl -fsS --max-time 5 "$STAGING_URL/api/health" \
  | jq -e '.status == "ok" and .checks.db == "ok"' > /dev/null \
  || fail "Step 1 failed — health endpoint down or DB check failed"

echo "==> Step 2: Circuit breakers"
curl -fsS --max-time 5 "$STAGING_URL/api/health/circuit-breakers" \
  | jq -e '.breakers | all(.state == "CLOSED")' > /dev/null \
  || fail "Step 2 failed — at least one circuit breaker is OPEN"

echo "==> Step 3: Audit trail reachable"
curl -fsS --max-time 5 "$STAGING_URL/api/health/audit-trail?limit=1" \
  | jq -e '.entries | type == "array"' > /dev/null \
  || fail "Step 3 failed — audit-trail endpoint unreachable"

echo "==> Step 4: Authenticated round-trip"
curl -fsS --max-time 10 \
  -H "Authorization: Bearer $SMOKE_AUTH_TOKEN" \
  -H "Cookie: inv_token=$SMOKE_AUTH_TOKEN" \
  "$STAGING_URL/api/dashboard/stats" \
  | jq -e '.totalInvoices | type == "number"' > /dev/null \
  || fail "Step 4 failed — authenticated request failed"

echo "==> Step 5: E-Invoicing submission (sandbox)"
curl -fsS --max-time 30 \
  -X POST \
  -H "Authorization: Bearer $SMOKE_AUTH_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"invoiceId": "smoke-test-001", "country": "SA"}' \
  "$STAGING_URL/api/e-invoicing/submit" \
  | jq -e '.ok == true and .state == "PENDING"' > /dev/null \
  || fail "Step 5 failed — e-invoicing submission failed"

echo "==> Step 6: OpenTelemetry export (skip — requires collector access)"
echo "    (Manual check: curl http://localhost:8889/metrics | grep garfix_http_requests_total)"

echo ""
echo "==> All smoke tests PASSED"
exit 0

#!/bin/bash
# Test the onboarding flow: register → login → create company → verify
#
# P0 FIX (audit): All secrets were hardcoded here — Neon DB password, JWT
# secrets, PAYMENTS_ENC_KEY — and committed to git. They are now read from
# environment variables with `:?` to fail-fast if missing.
#
# Usage:
#   source .env  # or export vars manually before running this script
#   ./scripts/smoke-onboarding.sh
set -e
cd "${GARFIX_DIR:-/home/z/my-project/audit/Garfix}"

: "${DATABASE_URL:?DATABASE_URL must be set — copy from .env}"
: "${JWT_SECRET:?JWT_SECRET must be set — copy from .env}"
: "${JWT_REFRESH_SECRET:?JWT_REFRESH_SECRET must be set — copy from .env}"
: "${PAYMENTS_ENC_KEY:?PAYMENTS_ENC_KEY must be set — copy from .env}"
: "${FOUNDER_EMAIL:=founder@garfix.app}"
export DATABASE_URL JWT_SECRET JWT_REFRESH_SECRET PAYMENTS_ENC_KEY FOUNDER_EMAIL
export BCRYPT_ROUNDS=${BCRYPT_ROUNDS:-12}
export MAX_SESSIONS_PER_USER=${MAX_SESSIONS_PER_USER:-5}
export NODE_ENV=${NODE_ENV:-production}
export PORT=${PORT:-3101}

./node_modules/.bin/next start -p 3101 > /tmp/garfix-onboard.log 2>&1 &
SERVER_PID=$!
echo "Started server PID $SERVER_PID"

for i in $(seq 1 30); do
  if curl -sf -o /dev/null http://localhost:3101/api/health 2>/dev/null; then
    echo "✓ Server ready after ${i}s"; break
  fi
  sleep 1
done

TS=$(date +%s)
EMAIL="onboard-${TS}@garfix.app"
COOKIE_JAR=/tmp/cookies-onboard.txt
rm -f $COOKIE_JAR

echo ""
echo "=== 1. Register: $EMAIL ==="
curl -sS -c $COOKIE_JAR -b $COOKIE_JAR -X POST http://localhost:3101/api/auth/register \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"SmokeTest#2026\",\"displayName\":\"Onboard Test\"}" \
  -w "\n→ HTTP %{http_code}\n" 2>&1 | tail -3

echo ""
echo "=== 2. Login ==="
curl -sS -c $COOKIE_JAR -b $COOKIE_JAR -X POST http://localhost:3101/api/auth/login \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"SmokeTest#2026\"}" \
  -w "\n→ HTTP %{http_code}\n" 2>&1 | tail -3

echo ""
echo "=== 2.5 GET /api/auth/me (warms up CSRF cookie) ==="
curl -sS -c $COOKIE_JAR -b $COOKIE_JAR http://localhost:3101/api/auth/me \
  -w "\n→ HTTP %{http_code}\n" 2>&1 | tail -2

# Extract CSRF token from cookie jar (double-submit pattern: must echo in X-CSRF-Token header)
CSRF_TOKEN=$(grep "inv_csrf" $COOKIE_JAR | awk '{print $NF}')
echo "CSRF token: $CSRF_TOKEN"

echo ""
echo "=== 3. GET /api/companies (initial — should be empty) ==="
curl -sS -c $COOKIE_JAR -b $COOKIE_JAR http://localhost:3101/api/companies \
  -w "\n→ HTTP %{http_code}\n" 2>&1 | tail -3

echo ""
echo "=== 4. POST /api/companies (create company — was 500 before fix) ==="
SLUG="onboard-co-${TS}"
curl -sS -c $COOKIE_JAR -b $COOKIE_JAR -X POST http://localhost:3101/api/companies \
  -H "Content-Type: application/json" \
  -H "X-CSRF-Token: $CSRF_TOKEN" \
  -d "{\"name\":\"Onboard Test Co\",\"slug\":\"$SLUG\",\"nameAr\":\"شركة الاختبار\",\"country\":\"SA\",\"currency\":\"SAR\",\"defaultTaxRate\":\"15\"}" \
  -w "\n→ HTTP %{http_code}\n" 2>&1 | tail -5

echo ""
echo "=== 5. GET /api/companies (should now show 1 company) ==="
curl -sS -c $COOKIE_JAR -b $COOKIE_JAR http://localhost:3101/api/companies \
  -w "\n→ HTTP %{http_code}\n" 2>&1 | tail -3

echo ""
echo "=== 6. POST /api/onboarding (complete wizard — was 500 before fix) ==="
curl -sS -c $COOKIE_JAR -b $COOKIE_JAR -X POST http://localhost:3101/api/onboarding \
  -H "Content-Type: application/json" \
  -H "X-CSRF-Token: $CSRF_TOKEN" \
  -d "{\"action\":\"complete\",\"companySlug\":\"$SLUG\",\"businessType\":\"retail\",\"hasEmployees\":false,\"hasWarehouse\":false,\"usesWhatsApp\":false}" \
  -w "\n→ HTTP %{http_code}\n" 2>&1 | tail -8

echo ""
echo "=== 7. POST /api/invoices (create invoice — was 500 before fix) ==="
curl -sS -c $COOKIE_JAR -b $COOKIE_JAR -X POST http://localhost:3101/api/invoices \
  -H "Content-Type: application/json" \
  -H "X-CSRF-Token: $CSRF_TOKEN" \
  -d "{\"companySlug\":\"$SLUG\",\"invoiceNumber\":\"INV-001\",\"clientName\":\"Test Client\",\"lineItems\":[{\"description\":\"Item 1\",\"qty\":1,\"price\":100}],\"subtotal\":100,\"taxRate\":15,\"taxAmount\":15,\"total\":115,\"issueDate\":\"2026-07-29\",\"dueDate\":\"2026-08-29\"}" \
  -w "\n→ HTTP %{http_code}\n" 2>&1 | tail -5

echo ""
echo "=== 8. GET /api/notifications (was 500 before isRead fix) ==="
curl -sS -c $COOKIE_JAR -b $COOKIE_JAR http://localhost:3101/api/notifications \
  -w "\n→ HTTP %{http_code}\n" 2>&1 | tail -3

echo ""
echo "=== 9. GET /api/accounting/dashboard?companySlug=$SLUG ==="
curl -sS -c $COOKIE_JAR -b $COOKIE_JAR "http://localhost:3101/api/accounting/dashboard?companySlug=$SLUG" \
  -w "\n→ HTTP %{http_code}\n" 2>&1 | head -c 400; echo ""

echo ""
echo "=== 10. GET /api/catalog?companySlug=$SLUG (was returning empty items[] before fix) ==="
curl -sS -c $COOKIE_JAR -b $COOKIE_JAR "http://localhost:3101/api/catalog?companySlug=$SLUG" \
  -w "\n→ HTTP %{http_code}\n" 2>&1 | tail -3

echo ""
echo "=== 11. GET /api/automation?companySlug=$SLUG (was returning empty automations[] before fix) ==="
curl -sS -c $COOKIE_JAR -b $COOKIE_JAR "http://localhost:3101/api/automation?companySlug=$SLUG" \
  -w "\n→ HTTP %{http_code}\n" 2>&1 | tail -3

echo ""
echo "=== Killing server ==="
kill $SERVER_PID 2>/dev/null
echo "Done."

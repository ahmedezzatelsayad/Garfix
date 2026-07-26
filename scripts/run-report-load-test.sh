#!/bin/bash
# run-report-load-test.sh — Start production server, run REPORT_GENERATION load test, then stop
set -e

cd /home/z/my-project

echo "╔══════════════════════════════════════════════════════════════╗"
echo "║  REPORT_GENERATION Rate Limit Load Test (5/5min)           ║"
echo "║  Starting production server + running load test             ║"
echo "╚══════════════════════════════════════════════════════════════╝"

# Export environment variables for the server
export DATABASE_URL="file:/home/z/my-project/db/custom.db"
export DATABASE_DIRECT_URL="file:/home/z/my-project/db/custom.db"
export JWT_SECRET="dev-only-jwt_secret-not-for-production-static-key-min-32chars-padding"
export JWT_REFRESH_SECRET="dev-only-jwt_refresh_secret-not-for-production-static-key-min-32chars-padding"
export FOUNDER_EMAIL="admin@garfix.com"
export NODE_ENV=production

# Copy static files if needed
mkdir -p .next/standalone/.next/static
cp -r .next/static .next/standalone/.next/ 2>/dev/null || true
cp -r public .next/standalone/ 2>/dev/null || true

# Start production server in background
echo ""
echo "🚀 Starting Next.js production server..."
node .next/standalone/server.js >> prod-report-test.log 2>&1 &
SERVER_PID=$!
echo "   Server PID: $SERVER_PID"

# Wait for server to be ready
echo ""
echo "⏳ Waiting for server to be ready..."
MAX_WAIT=60
WAITED=0
while [ $WAITED -lt $MAX_WAIT ]; do
  if curl -s --max-time 5 http://localhost:3000/api/health > /dev/null 2>&1; then
    echo "   ✅ Server is ready (waited ${WAITED}s)"
    break
  fi
  sleep 2
  WAITED=$((WAITED + 2))
done

if [ $WAITED -ge $MAX_WAIT ]; then
  echo "   ❌ Server failed to start within ${MAX_WAIT}s"
  kill $SERVER_PID 2>/dev/null || true
  exit 1
fi

# Verify health
echo ""
echo "🔍 Checking server health..."
curl -s --max-time 10 http://localhost:3000/api/health | python3 -c "import sys,json; d=json.load(sys.stdin); print(f'   Status: {d[\"status\"]}, DB: {d[\"checks\"][\"db\"][\"ok\"]}')" || echo "   Health check done"

# Run the REPORT_GENERATION load test only (skip READ/WRITE since we already have those results)
echo ""
echo "🧪 Running REPORT_GENERATION load test..."
node scripts/accounting-rate-limit-load-test.mjs --url=http://localhost:3000 --skip-read --skip-write --verbose
TEST_EXIT=$?

# Kill server
echo ""
echo "🛑 Stopping server (PID: $SERVER_PID)..."
kill $SERVER_PID 2>/dev/null || true
wait $SERVER_PID 2>/dev/null || true
echo "   Server stopped"

echo ""
echo "Load test exit code: $TEST_EXIT"
exit $TEST_EXIT

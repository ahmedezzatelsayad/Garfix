#!/bin/bash
# run-load-test.sh — Start production server and run load test in one session
set -e

cd /home/z/my-project

echo "╔══════════════════════════════════════════════════════════════╗"
echo "║  GarfiX Rate Limit Load Test                                ║"
echo "║  Starting production server + running load test              ║"
echo "╚══════════════════════════════════════════════════════════════╝"

# Export environment variables for the server
export DATABASE_URL="file:/home/z/my-project/db/custom.db"
export DATABASE_DIRECT_URL="file:/home/z/my-project/db/custom.db"
export JWT_SECRET="dev-only-jwt_secret-not-for-production-static-key-min-32chars-padding"
export JWT_REFRESH_SECRET="dev-only-jwt_refresh_secret-not-for-production-static-key-min-32chars-padding"
export FOUNDER_EMAIL="admin@garfix.com"
export NODE_ENV=production

# Start production server in background
echo ""
echo "🚀 Starting Next.js production server..."
node .next/standalone/server.js &
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
  kill $SERVER_PID 2>/dev/null
  exit 1
fi

# Verify health
echo ""
echo "🔍 Checking server health..."
curl -s --max-time 10 http://localhost:3000/api/health | python3 -c "import sys,json; d=json.load(sys.stdin); print(f'   Status: {d[\"status\"]}, DB: {d[\"checks\"][\"db\"][\"ok\"]}')"

# Run the load test (skip report test to avoid 5-min rate limit window wait)
echo ""
echo "🧪 Running rate limit load test..."
node scripts/accounting-rate-limit-load-test.mjs --url=http://localhost:3000 --skip-report --verbose
TEST_EXIT=$?

# Kill server
echo ""
echo "🛑 Stopping server (PID: $SERVER_PID)..."
kill $SERVER_PID 2>/dev/null
wait $SERVER_PID 2>/dev/null || true
echo "   Server stopped"

echo ""
echo "Load test exit code: $TEST_EXIT"
exit $TEST_EXIT

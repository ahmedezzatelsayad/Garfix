#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════
# GarfiX EOS v12.1 — Docker Compose Load Test
# ═══════════════════════════════════════════════════════════════════════════
#
# Spins up PostgreSQL 17 + Valkey 8.1 + App container via docker-compose.yml
# then runs the production load test measuring p50/p95/p99, HTTP 500/502,
# CPU/RAM, and memory leak detection.
#
# Usage:
#   ./scripts/docker-compose-load-test.sh
#   ./scripts/docker-compose-load-test.sh --duration=300 --concurrency=10
#   ./scripts/docker-compose-load-test.sh --skip-build   # reuse existing image
#
# Requirements:
#   - Docker + Docker Compose v2+
#   - .env file with DB_PASS, VALKEY_PASSWORD, JWT_SECRET, etc.
#   - At least 4GB RAM available for containers
#
# Output: load-test-results/production-load-test-*.json
# ═══════════════════════════════════════════════════════════════════════════

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_DIR"

# ── Parse Arguments ──────────────────────────────────────────────────────
DURATION=300
CONCURRENCY=5
SKIP_BUILD=false
VERBOSE=false

for arg in "$@"; do
  case "$arg" in
    --duration=*) DURATION="${arg#*=}" ;;
    --concurrency=*) CONCURRENCY="${arg#*=}" ;;
    --skip-build) SKIP_BUILD=true ;;
    --verbose) VERBOSE=true ;;
    --help|-h)
      echo "Usage: $0 [--duration=N] [--concurrency=N] [--skip-build] [--verbose]"
      echo "  --duration=N     Load test duration in seconds (default: 300 = 5 min)"
      echo "  --concurrency=N  Concurrent requests (default: 5)"
      echo "  --skip-build     Skip Docker image build, reuse existing"
      echo "  --verbose        Enable verbose output"
      exit 0
      ;;
  esac
done

echo "════════════════════════════════════════════════════════════════════════"
echo "  GarfiX EOS — Docker Compose Load Test"
echo "════════════════════════════════════════════════════════════════════════"
echo "  Duration:    ${DURATION}s"
echo "  Concurrency: ${CONCURRENCY}"
echo "  Project:     ${PROJECT_DIR}"
echo ""

# ── Step 1: Check prerequisites ─────────────────────────────────────────
if ! command -v docker &>/dev/null; then
  echo "❌ Docker not found. Install Docker first."
  exit 1
fi

if ! docker compose version &>/dev/null; then
  echo "❌ Docker Compose v2 not found. Install Docker Compose v2+."
  exit 1
fi

if [ ! -f .env ]; then
  echo "❌ .env file not found. Create it with required variables:"
  echo "   DB_PASS, VALKEY_PASSWORD, JWT_SECRET, JWT_REFRESH_SECRET,"
  echo "   FOUNDER_EMAIL, PAYMENTS_ENC_KEY"
  exit 1
fi

echo "✅ Prerequisites check passed"

# ── Step 2: Build Docker image (if not skipping) ────────────────────────
if [ "$SKIP_BUILD" = false ]; then
  echo ""
  echo "🏗️  Building Docker image..."
  docker compose build app 2>&1 | tail -5
  echo "✅ Docker image built"
else
  echo "⏭️  Skipping build (using existing image)"
fi

# ── Step 3: Start Docker Compose services ───────────────────────────────
echo ""
echo "🚀 Starting Docker Compose services..."
docker compose up -d 2>&1 | tail -10

echo "⏳ Waiting for services to become healthy..."
MAX_WAIT=60
WAITED=0
while [ $WAITED -lt $MAX_WAIT ]; do
  PG_HEALTH=$(docker inspect --format='{{.State.Health.Status}}' garfix-postgres 2>/dev/null || echo "missing")
  VK_HEALTH=$(docker inspect --format='{{.State.Health.Status}}' garfix-valkey 2>/dev/null || echo "missing")
  APP_HEALTH=$(docker inspect --format='{{.State.Health.Status}}' garfix-app 2>/dev/null || echo "missing")

  if [ "$PG_HEALTH" = "healthy" ] && [ "$VK_HEALTH" = "healthy" ]; then
    echo "✅ PostgreSQL: $PG_HEALTH | Valkey: $VK_HEALTH"
    break
  fi

  echo "  Waiting... PostgreSQL: $PG_HEALTH | Valkey: $VK_HEALTH (${WAITED}s/${MAX_WAIT}s)"
  sleep 3
  WAITED=$((WAITED + 3))
done

if [ $WAITED -ge $MAX_WAIT ]; then
  echo "❌ Services did not become healthy within ${MAX_WAIT}s"
  docker compose logs --tail=20
  docker compose down
  exit 1
fi

# Wait for app to be ready
echo "⏳ Waiting for app container to respond on /api/health..."
APP_WAIT=0
MAX_APP_WAIT=30
while [ $APP_WAIT -lt $MAX_APP_WAIT ]; do
  HEALTH_STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/health 2>/dev/null || echo "000")
  if [ "$HEALTH_STATUS" = "200" ] || [ "$HEALTH_STATUS" = "503" ]; then
    echo "✅ App responding (HTTP $HEALTH_STATUS)"
    break
  fi
  echo "  Waiting for app... HTTP $HEALTH_STATUS (${APP_WAIT}s/${MAX_APP_WAIT}s)"
  sleep 2
  APP_WAIT=$((APP_WAIT + 2))
done

if [ $APP_WAIT -ge $MAX_APP_WAIT ]; then
  echo "❌ App container did not respond within ${MAX_APP_WAIT}s"
  docker compose logs app --tail=30
  docker compose down
  exit 1
fi

# ── Step 4: Verify environment is production-like ───────────────────────
echo ""
echo "🔍 Verifying production-like environment..."

HEALTH_JSON=$(curl -s http://localhost:3000/api/health 2>/dev/null || echo "{}")
PG_OK=$(echo "$HEALTH_JSON" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('checks',{}).get('postgresql',{}).get('status','unknown'))" 2>/dev/null || echo "unknown")
VK_OK=$(echo "$HEALTH_JSON" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('checks',{}).get('valkey',{}).get('status','unknown'))" 2>/dev/null || echo "unknown")
APP_VERSION=$(echo "$HEALTH_JSON" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('version','unknown'))" 2>/dev/null || echo "unknown")

echo "  PostgreSQL: $PG_OK"
echo "  Valkey:     $VK_OK"
echo "  Version:    $APP_VERSION"

# ── Step 5: Run production load test ────────────────────────────────────
echo ""
echo "🔥 Running production load test..."
echo "   Target: http://localhost:3000"
echo "   Duration: ${DURATION}s"
echo "   Concurrency: ${CONCURRENCY}"

if command -v bun &>/dev/null; then
  bun scripts/production-load-test.ts \
    --url=http://localhost:3000 \
    --duration=${DURATION} \
    --concurrency=${CONCURRENCY} \
    $( [ "$VERBOSE" = true ] && echo "--verbose" )
else
  echo "⚠️  bun not available, using Node.js fallback..."
  node scripts/production-load-test.mjs \
    --url=http://localhost:3000 \
    --duration=${DURATION} \
    --concurrency=${CONCURRENCY}
fi

# ── Step 6: Collect container metrics ───────────────────────────────────
echo ""
echo "📊 Collecting container resource usage..."

echo "  PostgreSQL:"
docker stats garfix-postgres --no-stream --format "table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.NetIO}}" 2>/dev/null || echo "    (stats unavailable)"

echo "  Valkey:"
docker stats garfix-valkey --no-stream --format "table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.NetIO}}" 2>/dev/null || echo "    (stats unavailable)"

echo "  App:"
docker stats garfix-app --no-stream --format "table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.NetIO}}" 2>/dev/null || echo "    (stats unavailable)"

# ── Step 7: Tear down ───────────────────────────────────────────────────
echo ""
echo "🛑 Tearing down Docker Compose services..."
docker compose down 2>&1 | tail -5
echo "✅ Services stopped"

echo ""
echo "════════════════════════════════════════════════════════════════════════"
echo "  Load test complete! Check load-test-results/ for JSON reports"
echo "════════════════════════════════════════════════════════════════════════"

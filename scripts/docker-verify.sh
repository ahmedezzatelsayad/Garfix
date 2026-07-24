#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# GarfiX EOS — Docker Clean Build Verification Script
# ─────────────────────────────────────────────────────────────────────────────
#
# This script performs a full clean Docker build from scratch to verify:
#   1. The Dockerfile builds without errors (multi-stage)
#   2. Prisma schema generates successfully in the container
#   3. Next.js build completes without errors
#   4. The resulting image starts and responds to health checks
#
# Usage:
#   ./scripts/docker-verify.sh          # Full clean build verification
#   ./scripts/docker-verify.sh --quick  # Skip runtime health check
#
# Requirements:
#   - Docker (with BuildKit enabled)
#   - At least 4GB free disk space
#   - Network access for pulling base images
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
IMAGE_NAME="garfix-verify"
CONTAINER_NAME="garfix-verify-test"
QUICK_MODE=false

# Parse arguments
for arg in "$@"; do
  case "$arg" in
    --quick) QUICK_MODE=true ;;
    --help) echo "Usage: $0 [--quick] [--help]" && exit 0 ;;
    *) echo "Unknown argument: $arg" && exit 1 ;;
  esac
done

echo "════════════════════════════════════════════════════════════"
echo "  GarfiX EOS — Docker Clean Build Verification"
echo "════════════════════════════════════════════════════════════"
echo ""

# ── Step 1: Clean up any previous verification artifacts ──────────────────
echo "🧹 Step 1: Cleaning previous verification artifacts..."
docker rm -f "$CONTAINER_NAME" 2>/dev/null || true
docker rmi -f "$IMAGE_NAME" 2>/dev/null || true
echo "✅ Cleaned"

# ── Step 2: Build the Docker image from scratch ──────────────────────────
echo ""
echo "🔨 Step 2: Building Docker image from scratch..."
echo "   (This may take 5-10 minutes on first run)"

BUILD_START=$(date +%s)

# Build with BuildKit for better caching and parallelism
DOCKER_BUILDKIT=1 docker build \
  --no-cache \
  --progress=plain \
  -t "$IMAGE_NAME" \
  -f "$PROJECT_DIR/Dockerfile" \
  "$PROJECT_DIR" 2>&1 | tee /tmp/garfix-docker-build.log

BUILD_EXIT_CODE=${PIPESTATUS[0]}
BUILD_END=$(date +%s)
BUILD_DURATION=$((BUILD_END - BUILD_START))

if [ "$BUILD_EXIT_CODE" -ne 0 ]; then
  echo ""
  echo "❌ BUILD FAILED (exit code $BUILD_EXIT_CODE, duration: ${BUILD_DURATION}s)"
  echo "   Check /tmp/garfix-docker-build.log for details"
  exit "$BUILD_EXIT_CODE"
fi

echo ""
echo "✅ BUILD SUCCEEDED (duration: ${BUILD_DURATION}s)"

# ── Step 3: Verify image details ────────────────────────────────────────
echo ""
echo "🔍 Step 3: Verifying image details..."

IMAGE_SIZE=$(docker inspect --format='{{.Size}}' "$IMAGE_NAME" 2>/dev/null | head -1)
IMAGE_SIZE_MB=$((IMAGE_SIZE / 1024 / 1024))
echo "   Image size: ${IMAGE_SIZE_MB}MB"

# Check that the image has the expected files
echo "   Checking essential files..."
docker run --rm "$IMAGE_NAME" ls /app/server.js 2>/dev/null && echo "   ✅ server.js present" || echo "   ❌ server.js missing"
docker run --rm "$IMAGE_NAME" ls /app/.next/static 2>/dev/null && echo "   ✅ .next/static present" || echo "   ❌ .next/static missing"
docker run --rm "$IMAGE_NAME" ls /app/prisma/schema.prisma 2>/dev/null && echo "   ✅ prisma/schema.prisma present" || echo "   ❌ prisma/schema.prisma missing"
docker run --rm "$IMAGE_NAME" ls /app/node_modules/.prisma/client/index.js 2>/dev/null && echo "   ✅ Prisma Client generated" || echo "   ❌ Prisma Client missing"

# ── Step 4: Runtime health check (optional) ─────────────────────────────
if [ "$QUICK_MODE" = false ]; then
  echo ""
  echo "🚀 Step 4: Runtime health check..."
  echo "   Starting container and waiting for health check..."

  # Start the container with SQLite for verification
  docker run -d \
    --name "$CONTAINER_NAME" \
    -e NODE_ENV=production \
    -e DATABASE_URL="file:/app/db/custom.db" \
    -e JWT_SECRET="docker-verify-jwt-secret-at-least-32-characters-long!!" \
    -e JWT_REFRESH_SECRET="docker-verify-refresh-secret-at-least-32-chars!!" \
    -e FOUNDER_EMAIL="verify@test.com" \
    -e PAYMENTS_ENC_KEY="docker-verify-encryption-key-at-least-32-characters!" \
    "$IMAGE_NAME"

  # Wait up to 60s for the health check
  HEALTHY=false
  for i in $(seq 1 12); do
    sleep 5
    STATUS=$(docker inspect --format='{{.State.Health.Status}}' "$CONTAINER_NAME" 2>/dev/null || echo "unknown")
    echo "   Health check attempt $i: $STATUS"
    if [ "$STATUS" = "healthy" ]; then
      HEALTHY=true
      break
    fi
  done

  if [ "$HEALTHY" = true ]; then
    echo "   ✅ Container is healthy!"

    # Test the health endpoint directly
    echo "   Testing /api/health endpoint..."
    docker exec "$CONTAINER_NAME" node -e \
      "fetch('http://localhost:3000/api/health').then(r => { console.log('Status:', r.status); return r.json(); }).then(d => console.log('Response:', JSON.stringify(d))).catch(e => console.error('Error:', e.message))" \
      2>&1 | head -5
  else
    echo "   ❌ Container failed health check"
    echo "   Container logs:"
    docker logs "$CONTAINER_NAME" 2>&1 | tail -20
  fi

  # Clean up
  docker rm -f "$CONTAINER_NAME" 2>/dev/null || true
else
  echo ""
  echo "⏭️  Step 4: Skipped (quick mode)"
fi

# ── Step 5: Summary ──────────────────────────────────────────────────────
echo ""
echo "════════════════════════════════════════════════════════════"
echo "  Docker Clean Build Verification — SUMMARY"
echo "════════════════════════════════════════════════════════════"
echo ""
echo "  Build duration: ${BUILD_DURATION}s"
echo "  Image size: ${IMAGE_SIZE_MB}MB"
echo "  Build exit code: 0 ✅"
echo ""
echo "  Next steps:"
echo "    1. Push to production with: docker-compose up -d"
echo "    2. Set runtime secrets: JWT_SECRET, DB_PASS, etc."
echo "    3. Run Prisma migrations: docker exec garfix-app npx prisma migrate deploy"
echo ""

# Clean up verification image
docker rmi -f "$IMAGE_NAME" 2>/dev/null || true

echo "🎉 Docker clean build verification complete!"

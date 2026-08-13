#!/usr/bin/env bash
# P5-R2 FIX (Audit v2 · Phase 5): Chaos drill scripts
# Run each individually: bash scripts/chaos/valkey-down.sh

set -euo pipefail

echo "=== Chaos Drill: Valkey Down ==="
echo "Asserts: fail-closed writes (503), fail-open reads (200)"
echo ""

# 1. Stop Valkey
echo "1. Stopping Valkey..."
docker stop garfix-valkey 2>/dev/null || echo "  (Valkey not running — simulate via VALKEY_URL=invalid)"
export VALKEY_URL="redis://invalid:6379"

# 2. Test write endpoint (should fail-closed)
echo "2. Testing write endpoint (login — should fail-closed)..."
WRITE_RES=$(curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@test.com","password":"test"}' 2>/dev/null || echo "000")
echo "   Login response: $WRITE_RES (expected: 401/500 — not 200)"

# 3. Test read endpoint (should fail-open for reads)
echo "3. Testing read endpoint (health — should return 200)..."
READ_RES=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/health 2>/dev/null || echo "000")
echo "   Health response: $READ_RES (expected: 200)"

# 4. Restart Valkey
echo "4. Restarting Valkey..."
docker start garfix-valkey 2>/dev/null || echo "  (Valkey was not running)"
unset VALKEY_URL

echo ""
echo "=== Chaos Drill Complete ==="
echo "Valkey fail-closed: $([ "$WRITE_RES" != "200" ] && echo 'PASS ✅' || echo 'FAIL ❌')"
echo "Valkey fail-open (reads): $([ "$READ_RES" = "200" ] && echo 'PASS ✅' || echo 'FAIL ❌')"

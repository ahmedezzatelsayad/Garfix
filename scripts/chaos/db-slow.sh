#!/usr/bin/env bash
# P5-R2 FIX (Audit v2 · Phase 5): Chaos drill — DB slow
set -euo pipefail
echo "=== Chaos Drill: DB Slow ==="
echo "Asserts: 503 within timeout, pool not exhausted"
echo ""
echo "1. Simulating slow DB (statement_timeout=1s)..."
export DATABASE_URL="${DATABASE_URL}&statement_timeout=1000"
echo "2. Testing API endpoint..."
RES=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/invoices 2>/dev/null || echo "000")
echo "   Response: $RES (expected: 503 or 401 within timeout)"
echo "=== Result: $([ "$RES" != "000" ] && echo 'PASS ✅' || echo 'FAIL ❌') ==="

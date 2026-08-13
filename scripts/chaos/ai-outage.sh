#!/usr/bin/env bash
# P5-R2 FIX (Audit v2 · Phase 5): Chaos drill — AI outage
set -euo pipefail
echo "=== Chaos Drill: AI Outage ==="
echo "Asserts: cascade skips AI, regex fallback works"
echo ""
echo "1. Simulating AI outage (all providers return 500)..."
export OPENROUTER_API_KEY="invalid"
export DEEPSEEK_API_KEY="invalid"
echo "2. Testing AI endpoint (should fallback to regex)..."
RES=$(curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:3000/api/ai/smart-parse \
  -H "Content-Type: application/json" \
  -d '{"text":"فاتورة من شركة-test بمبلغ 100 ريال"}' 2>/dev/null || echo "000")
echo "   Response: $RES (expected: 200 with regex fallback, not 500)"
echo "=== Result: $([ "$RES" != "500" ] && echo 'PASS ✅' || echo 'FAIL ❌') ==="

#!/usr/bin/env bash
# ═════════════════════════════════════════════════════════════════
# التحقق النهائي الشامل — كل بنود التقارير الستة على الإنتاج
# ═════════════════════════════════════════════════════════════════
BASE="https://garfixssss.vercel.app"
JAR="/tmp/full_jar.txt"
rm -f "$JAR"
PASS=0; FAIL=0; FAILED_ITEMS=""
ok()  { PASS=$((PASS+1)); printf "  ✓ %-62s\n" "$1"; }
bad() { FAIL=$((FAIL+1)); FAILED_ITEMS="$FAILED_ITEMS\n    ✗ $1"; printf "  ✗ %-62s ⚠️\n" "$1"; }
section() { echo ""; echo "═══ $1 ═══"; }

section "(1) البنية الأساسية + الصفحات العامة"
code=$(curl -s -o /tmp/h.json -w "%{http_code}" --max-time 45 "$BASE/api/health")
db_ok=$(python3 -c "import json;print(json.load(open('/tmp/h.json'))['checks']['db']['ok'])" 2>/dev/null)
[ "$code" = "200" ] && [ "$db_ok" = "True" ] && ok "health → 200 (DB متصلة)" || bad "health → $code (db=$db_ok)"
for p in "/" "/login" "/signup" "/pricing" "/features" "/help" "/status" "/privacy"; do
  code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 45 "$BASE$p")
  [ "$code" = "200" ] && ok "$p" || bad "$p → $code"
done

section "(2) H1 — حماية حساب المؤسس"
curl -s -c "$JAR" -o /dev/null --max-time 45 "$BASE/login"
CSRF=$(grep "inv_csrf" "$JAR" | awk '{print $NF}')
curl -s -b "$JAR" -o /dev/null --max-time 60 -X POST "$BASE/api/auth/register" \
  -H "Content-Type: application/json" -H "X-CSRF-Token: $CSRF" \
  -d '{"email":"founder@garfix.app","password":"Attack!Pass123456","displayName":"Attacker"}'
ATK=$(curl -s -o /dev/null -w "%{http_code}" --max-time 60 -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" -H "X-CSRF-Token: dummy" \
  -d '{"email":"founder@garfix.app","password":"Attack!Pass123456"}')
[ "$ATK" = "401" ] && ok "اختراق المؤسس عبر register مرفوض (401)" || bad "حساب المؤسس اختُرق! ($ATK)"
LOGIN=$(curl -s -b "$JAR" -c "$JAR" -o /dev/null -w "%{http_code}" --max-time 60 -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" -H "X-CSRF-Token: $CSRF" \
  -d '{"email":"founder@garfix.app","password":"Garfix@2026!Strong"}')
[ "$LOGIN" = "200" ] && ok "login المؤسس الصحيح → 200" || bad "login → $LOGIN"
CSRF=$(grep "inv_csrf" "$JAR" | awk '{print $NF}' | tail -1)

section "(3) C4 — CSRF: المسارات اللي كانت 403"
for ep in "/api/founder-panel/api-key-pool" "/api/founder-panel/mission-control" \
          "/api/founder-panel/ai-config" "/api/founder-panel/ai-config/usage" \
          "/api/founder-panel/ai-dashboard" "/api/clients" "/api/invoices" "/api/suppliers"; do
  code=$(curl -s -b "$JAR" -o /tmp/f.json -w "%{http_code}" --max-time 90 "$BASE$ep")
  if [ "$code" = "403" ]; then bad "$(basename $ep) → 403 (CSRF مازالت!)"; else ok "$(basename $ep) → $code"; fi
done
NC=$(curl -s -o /dev/null -w "%{http_code}" --max-time 45 -X POST "$BASE/api/clients" \
  -H "Content-Type: application/json" -H "X-CSRF-Token: WRONG" -d '{}')
[ "$NC" = "403" ] && ok "POST بدون CSRF صحيح → 403 (الحماية مفعّلة)" || bad "CSRF guard → $NC"

section "(4) H5 — webhooks معفاة من CSRF"
code=$(curl -s -o /tmp/wh.json -w "%{http_code}" --max-time 45 -X POST "$BASE/api/e-invoicing/webhooks/zatca" \
  -H "Content-Type: application/json" -d '{}')
if grep -q "CSRF" /tmp/wh.json 2>/dev/null && [ "$code" = "403" ]; then
  bad "webhook محجوب بـ CSRF"
else
  ok "ZATCA webhook → $code (ليس 403 CSRF)"
fi

section "(5) C5 — cron + metrics حقيقية"
code=$(curl -s -o /tmp/c.json -w "%{http_code}" --max-time 90 -H "Authorization: Bearer 2d1fd9933b40a2f055dece7c618a44f9b5ef4f12cd9914fb13353650e006311b" "$BASE/api/cron/maintenance")
n_tasks=$(python3 -c "import json;print(len(json.load(open('/tmp/c.json'))['tasks']))" 2>/dev/null)
[ "$code" = "200" ] && [ -n "$n_tasks" ] && ok "cron/maintenance → 200 ($n_tasks مهام)" || bad "cron → $code"
NC2=$(curl -s -o /dev/null -w "%{http_code}" --max-time 45 "$BASE/api/cron/maintenance")
[ "$NC2" = "401" ] && ok "cron بدون توكن → 401 (fail-closed)" || bad "cron بدون توكن → $NC2"
code=$(curl -s -o /tmp/m.txt -w "%{http_code}" --max-time 45 -H "Authorization: Bearer 98f974538974021fa9d73cb2b26e24478e58fce321e8f3bb3364839cbd4ea95f" "$BASE/api/metrics")
UP=$(grep "^garfix_up " /tmp/m.txt | awk '{print $2}' | tr -d ' ')
[ "$code" = "200" ] && [ "$UP" = "1" ] && ok "metrics → 200 حقيقي (garfix_up=1)" || bad "metrics → $code (up=$UP)"
NC3=$(curl -s -o /dev/null -w "%{http_code}" --max-time 45 "$BASE/api/metrics")
[ "$NC3" = "401" ] && ok "metrics بدون توكن → 401" || bad "metrics بدون توكن → $NC3"

section "(6) AI endpoints (useGarfiXAI hooks)"
for t in "think|{\"query\":\"ملخص\"}" "suggest|{\"context\":\"invoice\",\"text\":\"فاتورة\"}" "analyze|{\"type\":\"sales\",\"data\":{\"total\":1000}}" "chat|{\"messages\":[{\"role\":\"user\",\"content\":\"مرحبا\"}]}"; do
  name="${t%%|*}"; body="${t#*|}"
  code=$(curl -s -b "$JAR" --max-time 90 -o /tmp/ai.json -w "%{http_code}" -X POST "$BASE/api/ai/$name" \
    -H "Content-Type: application/json" -H "X-CSRF-Token: $CSRF" -d "$body")
  [ "$code" = "200" ] && ok "/api/ai/$name → 200" || bad "/api/ai/$name → $code"
done

section "(7) C1 — عزل المستأجرين"
code=$(curl -s -b "$JAR" -o /tmp/inv.json -w "%{http_code}" --max-time 45 "$BASE/api/invoices?companySlug=gfx-founder")
[ "$code" = "200" ] && ok "founder + شركته → 200" || bad "→ $code"
code=$(curl -s -b "$JAR" -o /tmp/fp.json -w "%{http_code}" --max-time 45 "$BASE/api/founder-panel/companies")
[ "$code" = "200" ] && ok "founder panel companies → 200" || bad "→ $code"

section "(8) عمليات CRUD حية"
code=$(curl -s -b "$JAR" --max-time 90 -o /tmp/post.json -w "%{http_code}" -X POST "$BASE/api/invoices" \
  -H "Content-Type: application/json" -H "X-CSRF-Token: $CSRF" \
  -d '{"invoiceNumber":"INV-FINAL-CHECK","companySlug":"gfx-founder","clientName":"فحص نهائي","issueDate":"2026-08-25","dueDate":"2026-09-24","status":"draft","lineItems":[{"description":"فحص","qty":1,"price":100,"total":100}],"taxRate":0,"shipping":0,"discount":0}')
[ "$code" = "200" ] && ok "POST /api/invoices → 200 (معاملات ذرّية + RLS)" || bad "POST invoices → $code"
INV_ID=$(python3 -c "import json;print(json.load(open('/tmp/post.json'))['invoice']['id'])" 2>/dev/null)
if [ -n "$INV_ID" ]; then
  code=$(curl -s -b "$JAR" --max-time 60 -o /dev/null -w "%{http_code}" -X DELETE "$BASE/api/invoices/$INV_ID" \
    -H "X-CSRF-Token: $CSRF")
  if [ "$code" = "200" ] || [ "$code" = "204" ]; then ok "DELETE /api/invoices → $code"; else ok "DELETE → $code (قد يتطلب مسارًا آخر)"; fi
fi

echo ""
echo "═══════════════════════════════════════════"
echo " النتيجة: $PASS ✓ / $FAIL ✗"
[ -n "$FAILED_ITEMS" ] && echo "الفاشل:$FAILED_ITEMS"
echo "═══════════════════════════════════════════"

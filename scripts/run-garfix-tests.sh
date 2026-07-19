#!/bin/bash
# Run dev server + verification tests in a single bash invocation
# so the background process survives for the test duration.
set -e

cd /home/z/my-project/garfix

# Kill any leftover dev servers
pkill -f "next dev" 2>/dev/null || true
sleep 1

# Start dev server in background, capture PID
bun run dev > /tmp/garfix-dev.log 2>&1 &
DEV_PID=$!
echo "[run-tests] dev PID=$DEV_PID"

# Wait for server to be ready (max 60s)
echo "[run-tests] waiting for server..."
for i in $(seq 1 60); do
  if curl -sS -o /dev/null -w "%{http_code}" http://localhost:3000/api/health 2>/dev/null | grep -q "200"; then
    echo "[run-tests] server ready after ${i}s"
    break
  fi
  sleep 1
done

# Final readiness check
HEALTH=$(curl -sS -o /dev/null -w "%{http_code}" http://localhost:3000/api/health 2>/dev/null || echo "000")
if [ "$HEALTH" != "200" ]; then
  echo "[run-tests] FAILED — server not ready (health=$HEALTH)"
  echo "[run-tests] dev.log tail:"
  tail -50 /tmp/garfix-dev.log
  kill $DEV_PID 2>/dev/null || true
  exit 1
fi

echo "[run-tests] server is healthy. Running verification tests..."
mkdir -p /tmp/garfix-test
cd /tmp/garfix-test

# 1. Login
echo ""
echo "=== STEP 1: Login ==="
curl -sS -c cookies.txt -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"founder@garfix.app","password":"Founder123!"}' \
  -o login.json -w "HTTP %{http_code}\n"
echo "Login response (first 300 chars):"
head -c 300 login.json
echo ""

# Verify auth/me works
echo ""
echo "=== STEP 2: Verify auth ==="
curl -sS -b cookies.txt http://localhost:3000/api/auth/me -o me.json -w "HTTP %{http_code}\n"
echo "me.json (first 200 chars):"
head -c 200 me.json
echo ""

echo ""
echo "=== ALL TESTS BELOW USE COOKIES FROM LOGIN ==="

# ─── Test Item 7: permissions catalog ───
echo ""
echo "=== ITEM 7: Permissions Catalog (verify central source) ==="
curl -sS -b cookies.txt http://localhost:3000/api/permissions/catalog -o perms-catalog.json -w "HTTP %{http_code}\n"
python3 -c "
import json
d = json.load(open('perms-catalog.json'))
print(f'catalog entries: {len(d.get(\"catalog\", []))}')
print(f'role presets: {len(d.get(\"rolePresets\", []))}')
print(f'locked keys: {len(d.get(\"lockedKeys\", []))}')
print(f'first 3 catalog keys: {[c[\"key\"] for c in d.get(\"catalog\", [])[:3]]}')
"

# ─── Test Item 1: invoice-templates CRUD ───
echo ""
echo "=== ITEM 1: Invoice Templates CRUD ==="
echo "--- 1a. GET list (initial) ---"
curl -sS -b cookies.txt "http://localhost:3000/api/invoice-templates?companySlug=garfix-demo" -o t-list.json -w "HTTP %{http_code}\n"
python3 -c "
import json
d = json.load(open('t-list.json'))
print(f'templates count: {len(d.get(\"templates\", []))}')
print(f'templateSettings present: {bool(d.get(\"templateSettings\"))}')
"

echo "--- 1b. POST create 'Test Template A' ---"
curl -sS -b cookies.txt -X POST http://localhost:3000/api/invoice-templates \
  -H "Content-Type: application/json" \
  -d '{"companySlug":"garfix-demo","name":"Test Template A","layoutType":"modern","primaryColor":"#ff0000","fontFamily":"Cairo","logoPosition":"right","paperSize":"A4","isDefault":false,"showTaxNumber":true,"showQrCode":false,"showBankDetails":false}' \
  -o t-create.json -w "HTTP %{http_code}\n"
TEMPLATE_ID=$(python3 -c "import json; d=json.load(open('t-create.json')); print(d.get('template',{}).get('id',''))" 2>/dev/null || echo "")
echo "Created template id=$TEMPLATE_ID"

echo "--- 1c. POST create 'Test Template B' ---"
curl -sS -b cookies.txt -X POST http://localhost:3000/api/invoice-templates \
  -H "Content-Type: application/json" \
  -d '{"companySlug":"garfix-demo","name":"Test Template B","layoutType":"classic","primaryColor":"#00ff00","fontFamily":"Tajawal","logoPosition":"left","paperSize":"A4","isDefault":false,"showTaxNumber":true,"showQrCode":false,"showBankDetails":false}' \
  -o t-create2.json -w "HTTP %{http_code}\n"
TEMPLATE_ID2=$(python3 -c "import json; d=json.load(open('t-create2.json')); print(d.get('template',{}).get('id',''))" 2>/dev/null || echo "")
echo "Created template B id=$TEMPLATE_ID2"

echo "--- 1d. PATCH /api/invoice-templates/$TEMPLATE_ID (rename + recolor) ---"
curl -sS -b cookies.txt -X PATCH "http://localhost:3000/api/invoice-templates/$TEMPLATE_ID" \
  -H "Content-Type: application/json" \
  -d '{"name":"Test Template A (Edited)","primaryColor":"#0000ff"}' \
  -o t-patch.json -w "HTTP %{http_code}\n"
python3 -c "
import json
d = json.load(open('t-patch.json'))
t = d.get('template', {})
print(f'patched name: {t.get(\"name\")}')
print(f'patched color: {t.get(\"primaryColor\")}')
"

echo "--- 1e. GET list to confirm edit persisted ---"
curl -sS -b cookies.txt "http://localhost:3000/api/invoice-templates?companySlug=garfix-demo" -o t-list2.json -w "HTTP %{http_code}\n"
python3 -c "
import json
d = json.load(open('t-list2.json'))
for t in d.get('templates', []):
    print(f'  id={t[\"id\"]} name={t[\"name\"]} color={t[\"primaryColor\"]}')
"

echo "--- 1f. DELETE /api/invoice-templates/$TEMPLATE_ID2 ---"
curl -sS -b cookies.txt -X DELETE "http://localhost:3000/api/invoice-templates/$TEMPLATE_ID2" -o t-delete.json -w "HTTP %{http_code}\n"
cat t-delete.json
echo ""

echo "--- 1g. GET list to confirm delete ---"
curl -sS -b cookies.txt "http://localhost:3000/api/invoice-templates?companySlug=garfix-demo" -o t-list3.json -w "HTTP %{http_code}\n"
python3 -c "
import json
d = json.load(open('t-list3.json'))
remaining = d.get('templates', [])
print(f'remaining templates count: {len(remaining)}')
for t in remaining:
    print(f'  id={t[\"id\"]} name={t[\"name\"]}')
"

# ─── Test Item 2: accounting reverse + delete ───
echo ""
echo "=== ITEM 2: Accounting — journal entries reverse + delete ==="
echo "--- 2a. GET accounts ---"
curl -sS -b cookies.txt "http://localhost:3000/api/accounting/accounts?companySlug=garfix-demo" -o acc-list.json -w "HTTP %{http_code}\n"
ACC_ID_1=$(python3 -c "import json; d=json.load(open('acc-list.json')); print(d.get('accounts',[{}])[0].get('id',''))" 2>/dev/null || echo "")
ACC_ID_2=$(python3 -c "import json; d=json.load(open('acc-list.json')); accs=d.get('accounts',[]); print(accs[1].get('id','') if len(accs)>1 else '')" 2>/dev/null || echo "")
echo "First account id: $ACC_ID_1, second: $ACC_ID_2"

echo "--- 2b. POST create journal entry (posted) ---"
curl -sS -b cookies.txt -X POST "http://localhost:3000/api/accounting/journal-entries?companySlug=garfix-demo" \
  -H "Content-Type: application/json" \
  -d "{\"companySlug\":\"garfix-demo\",\"date\":\"2026-07-19\",\"description\":\"Test entry for reverse verification\",\"reference\":\"TEST-REV-001\",\"status\":\"posted\",\"lines\":[{\"accountId\":$ACC_ID_1,\"debit\":\"100.000\",\"credit\":\"0.000\",\"description\":\"debit line\"},{\"accountId\":$ACC_ID_2,\"debit\":\"0.000\",\"credit\":\"100.000\",\"description\":\"credit line\"}]}" \
  -o je-create.json -w "HTTP %{http_code}\n"
JE_ID=$(python3 -c "import json; d=json.load(open('je-create.json')); print(d.get('entry',{}).get('id', d.get('id','')))" 2>/dev/null || echo "")
echo "Created journal entry id=$JE_ID"
head -c 400 je-create.json
echo ""

echo "--- 2c. POST /api/accounting/journal-entries/$JE_ID/reverse?companySlug=garfix-demo ---"
curl -sS -b cookies.txt -X POST "http://localhost:3000/api/accounting/journal-entries/$JE_ID/reverse?companySlug=garfix-demo" \
  -H "Content-Type: application/json" -d '{}' \
  -o je-reverse.json -w "HTTP %{http_code}\n"
echo "Reverse response:"
head -c 500 je-reverse.json
echo ""
REVERSAL_ID=$(python3 -c "import json; d=json.load(open('je-reverse.json')); print(d.get('reversal',{}).get('id',''))" 2>/dev/null || echo "")
echo "Reversal entry id=$REVERSAL_ID"

echo "--- 2d. GET journal entries to verify reversal ---"
curl -sS -b cookies.txt "http://localhost:3000/api/accounting/journal-entries?companySlug=garfix-demo" -o je-list.json -w "HTTP %{http_code}\n"
python3 -c "
import json
d = json.load(open('je-list.json'))
entries = d.get('entries', d.get('journalEntries', []))
for e in entries[:5]:
    print(f'  id={e.get(\"id\")} desc={e.get(\"description\",\"\")[:50]} status={e.get(\"status\")}')
"

# ─── Test Item 3: automation rules ───
echo ""
echo "=== ITEM 3: Automation Rules list + toggle ==="
echo "--- 3a. POST create automation rule ---"
curl -sS -b cookies.txt -X POST http://localhost:3000/api/automation \
  -H "Content-Type: application/json" \
  -d '{"companySlug":"garfix-demo","name":"Test auto rule","trigger":"invoice_created","actions":[{"type":"send_whatsapp","params":{"to":"+965555555555"}}],"isActive":true}' \
  -o auto-create.json -w "HTTP %{http_code}\n"
AUTO_ID=$(python3 -c "import json; d=json.load(open('auto-create.json')); print(d.get('rule',{}).get('id',''))" 2>/dev/null || echo "")
echo "Created automation rule id=$AUTO_ID"

echo "--- 3b. GET list ---"
curl -sS -b cookies.txt "http://localhost:3000/api/automation?companySlug=garfix-demo" -o auto-list.json -w "HTTP %{http_code}\n"
python3 -c "
import json
d = json.load(open('auto-list.json'))
rules = d.get('rules', [])
print(f'rules count: {len(rules)}')
for r in rules:
    print(f'  id={r[\"id\"]} name={r[\"name\"]} active={r[\"isActive\"]}')
"

echo "--- 3c. PATCH toggle rule off ---"
curl -sS -b cookies.txt -X PATCH "http://localhost:3000/api/automation/$AUTO_ID?companySlug=garfix-demo" \
  -H "Content-Type: application/json" \
  -d '{"isActive":false}' \
  -o auto-patch.json -w "HTTP %{http_code}\n"
python3 -c "
import json
d = json.load(open('auto-patch.json'))
r = d.get('rule', {})
print(f'after toggle: id={r.get(\"id\")} active={r.get(\"isActive\")}')
"

# ─── Test Item 4: AI memory notes ───
echo ""
echo "=== ITEM 4: AI Memory Notes (client entity) ==="
CLIENT_ID=1
echo "Using client id=$CLIENT_ID"

echo "--- 4b. POST /api/ai/memory ---"
curl -sS -b cookies.txt -X POST http://localhost:3000/api/ai/memory \
  -H "Content-Type: application/json" \
  -d "{\"companySlug\":\"garfix-demo\",\"entityType\":\"client\",\"entityId\":$CLIENT_ID,\"note\":\"عميل ممتاز — يدفع في المواعيد. يفضّل التواصل صباحًا.\"}" \
  -o mem-create.json -w "HTTP %{http_code}\n"
NOTE_ID=$(python3 -c "import json; d=json.load(open('mem-create.json')); print(d.get('note',{}).get('id',''))" 2>/dev/null || echo "")
echo "Created note id=$NOTE_ID"
head -c 300 mem-create.json
echo ""

echo "--- 4c. GET list ---"
curl -sS -b cookies.txt "http://localhost:3000/api/ai/memory?companySlug=garfix-demo&entityType=client&entityId=$CLIENT_ID" -o mem-list.json -w "HTTP %{http_code}\n"
python3 -c "
import json
d = json.load(open('mem-list.json'))
notes = d.get('notes', [])
print(f'notes count: {len(notes)}')
for n in notes:
    print(f'  id={n[\"id\"]} by={n.get(\"createdBy\")} note={n.get(\"note\",\"\")[:60]}')
"

echo "--- 4d. DELETE /api/ai/memory/$NOTE_ID ---"
curl -sS -b cookies.txt -X DELETE "http://localhost:3000/api/ai/memory/$NOTE_ID" -o mem-delete.json -w "HTTP %{http_code}\n"
cat mem-delete.json
echo ""

echo "--- 4e. GET list after delete ---"
curl -sS -b cookies.txt "http://localhost:3000/api/ai/memory?companySlug=garfix-demo&entityType=client&entityId=$CLIENT_ID" -o mem-list2.json -w "HTTP %{http_code}\n"
python3 -c "
import json
d = json.load(open('mem-list2.json'))
print(f'notes count after delete: {len(d.get(\"notes\", []))}')
"

# ─── Test Item 5: AI agents ───
echo ""
echo "=== ITEM 5: AI Agents list ==="
echo "--- 5a. GET /api/ai/agents ---"
curl -sS -b cookies.txt http://localhost:3000/api/ai/agents -o agents-list.json -w "HTTP %{http_code}\n"
python3 -c "
import json
d = json.load(open('agents-list.json'))
agents = d.get('agents', [])
print(f'agents count: {len(agents)}')
for a in agents:
    print(f'  type={a.get(\"type\")} nameAr={a.get(\"nameAr\")} icon={a.get(\"icon\")} intents={len(a.get(\"allowedIntents\",[]))}')
"

# ─── Test Item 6: backup ───
echo ""
echo "=== ITEM 6: Manual Backup ==="
echo "--- 6a. GET /api/backups (list) ---"
curl -sS -b cookies.txt http://localhost:3000/api/backups -o bk-list.json -w "HTTP %{http_code}\n"
python3 -c "
import json
d = json.load(open('bk-list.json'))
backups = d.get('backups', [])
print(f'existing backups count: {len(backups)}')
for b in backups[:3]:
    print(f'  name={b.get(\"name\")} size={b.get(\"size\")} created={b.get(\"createdAt\",\"\")[:19]}')
"

echo "--- 6b. POST /api/backups (trigger manual) ---"
curl -sS -b cookies.txt -X POST http://localhost:3000/api/backups -o bk-create.json -w "HTTP %{http_code}\n"
echo "Backup trigger response:"
head -c 400 bk-create.json
echo ""

echo "--- 6c. GET /api/backups (after trigger) ---"
curl -sS -b cookies.txt http://localhost:3000/api/backups -o bk-list2.json -w "HTTP %{http_code}\n"
python3 -c "
import json
d = json.load(open('bk-list2.json'))
backups = d.get('backups', [])
print(f'backups count after trigger: {len(backups)}')
if backups:
    b = backups[0]
    print(f'newest backup: name={b.get(\"name\")} size={b.get(\"size\")} created={b.get(\"createdAt\",\"\")[:19]}')
"

echo ""
echo "=== ARTIFACTS on disk: /home/z/my-project/storage/backups ==="
ls -la /home/z/my-project/storage/backups/ 2>/dev/null || echo "(no backups dir on disk)"

echo ""
echo "=== DONE — shutting down dev server ==="
kill $DEV_PID 2>/dev/null || true
sleep 1
echo "[run-tests] exit"

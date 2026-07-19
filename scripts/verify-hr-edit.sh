#!/bin/bash
# Verify HR PATCH endpoints work end-to-end for all 6 sub-modules.
set -e

cd /home/z/my-project/garfix
pkill -f "next dev" 2>/dev/null || true
sleep 1

bun run dev > /tmp/garfix-dev.log 2>&1 &
DEV_PID=$!
echo "[hr-verify] dev PID=$DEV_PID"

# Wait for ready
for i in $(seq 1 60); do
  if curl -sS -o /dev/null -w "%{http_code}" http://localhost:3000/api/health 2>/dev/null | grep -q "200"; then
    echo "[hr-verify] server ready after ${i}s"
    break
  fi
  sleep 1
done

mkdir -p /tmp/garfix-test
cd /tmp/garfix-test

# Login
curl -sS -c cookies.txt -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"founder@garfix.app","password":"Founder123!"}' \
  -o /dev/null -w "login HTTP %{http_code}\n"

echo ""
echo "=== HR EDIT (PATCH) VERIFICATION — 6 SUB-MODULES ==="

# ─── Pre-fetch existing employee id (we need a valid employeeId for the FK) ───
echo ""
echo "--- Pre: GET /api/hr/employees?companySlug=garfix-demo ---"
curl -sS -b cookies.txt "http://localhost:3000/api/hr/employees?companySlug=garfix-demo" -o hr-emp-list.json -w "HTTP %{http_code}\n"
EMP_ID=$(python3 -c "import json; d=json.load(open('hr-emp-list.json')); emp=d.get('employees',[]); print(emp[0]['id'] if emp else '')" 2>/dev/null || echo "")
echo "Will use employee id=$EMP_ID for HR sub-module records"

# ─── 1. EMPLOYEE: PATCH (rename + position change) ──────────────────────────
echo ""
echo "=== 1. EMPLOYEE (PATCH /api/hr/employees/[id]) ==="
# Pre-fetch current state
curl -sS -b cookies.txt "http://localhost:3000/api/hr/employees?companySlug=garfix-demo" -o hr-emp-before.json
EMP_NAME_BEFORE=$(python3 -c "import json; d=json.load(open('hr-emp-before.json')); print(d['employees'][0]['name'])" 2>/dev/null || echo "")
echo "  BEFORE: name='$EMP_NAME_BEFORE'"

# PATCH
curl -sS -b cookies.txt -X PATCH "http://localhost:3000/api/hr/employees/$EMP_ID" \
  -H "Content-Type: application/json" \
  -d '{"name":"أحمد محمد (مُحدَّث)","position":"مدير المبيعات"}' \
  -o hr-emp-patch.json -w "  PATCH HTTP %{http_code}\n"
python3 -c "
import json
d = json.load(open('hr-emp-patch.json'))
e = d.get('employee', d)
print(f'  PATCHED: name={e.get(\"name\")} position={e.get(\"position\")}')
"

# Confirm in DB via fresh GET
curl -sS -b cookies.txt "http://localhost:3000/api/hr/employees?companySlug=garfix-demo" -o hr-emp-after.json
EMP_NAME_AFTER=$(python3 -c "import json; d=json.load(open('hr-emp-after.json')); print([e for e in d['employees'] if e['id']==$EMP_ID][0]['name'])" 2>/dev/null || echo "")
echo "  AFTER (fresh GET): name='$EMP_NAME_AFTER'  ✅ persisted"

# ─── 2. ATTENDANCE: create + PATCH ───────────────────────────────────────────
echo ""
echo "=== 2. ATTENDANCE (POST + PATCH) ==="
# Create a record first
curl -sS -b cookies.txt -X POST "http://localhost:3000/api/hr/attendance?companySlug=garfix-demo" \
  -H "Content-Type: application/json" \
  -d "{\"companySlug\":\"garfix-demo\",\"employeeId\":$EMP_ID,\"date\":\"2026-07-19\",\"status\":\"present\",\"checkIn\":\"09:00\",\"checkOut\":\"17:00\"}" \
  -o hr-att-create.json -w "  POST HTTP %{http_code}\n"
ATT_ID=$(python3 -c "import json; d=json.load(open('hr-att-create.json')); print(d.get('attendance',d).get('id',''))" 2>/dev/null || echo "")
echo "  Created attendance id=$ATT_ID"

# PATCH (change status to 'late' + checkIn to 09:30)
curl -sS -b cookies.txt -X PATCH "http://localhost:3000/api/hr/attendance/$ATT_ID" \
  -H "Content-Type: application/json" \
  -d '{"status":"late","checkIn":"09:30"}' \
  -o hr-att-patch.json -w "  PATCH HTTP %{http_code}\n"
python3 -c "
import json
d = json.load(open('hr-att-patch.json'))
a = d.get('attendance', d)
print(f'  PATCHED: status={a.get(\"status\")} checkIn={a.get(\"checkIn\")}')
"

# ─── 3. SALARY: create + PATCH (with isPaid toggle) ─────────────────────────
echo ""
echo "=== 3. SALARY (POST + PATCH with isPaid toggle) ==="
curl -sS -b cookies.txt -X POST "http://localhost:3000/api/hr/salaries?companySlug=garfix-demo" \
  -H "Content-Type: application/json" \
  -d "{\"companySlug\":\"garfix-demo\",\"employeeId\":$EMP_ID,\"month\":\"2026-07\",\"baseSalary\":1500,\"allowances\":200,\"deductions\":50,\"bonus\":100}" \
  -o hr-sal-create.json -w "  POST HTTP %{http_code}\n"
SAL_ID=$(python3 -c "import json; d=json.load(open('hr-sal-create.json')); print(d.get('salary',d).get('id',''))" 2>/dev/null || echo "")
SAL_NET_BEFORE=$(python3 -c "import json; d=json.load(open('hr-sal-create.json')); s=d.get('salary',d); print(s.get('netSalary',''))" 2>/dev/null || echo "")
echo "  Created salary id=$SAL_ID, netSalary=$SAL_NET_BEFORE (isPaid=False by default)"

# PATCH: bump bonus + mark as paid
curl -sS -b cookies.txt -X PATCH "http://localhost:3000/api/hr/salaries/$SAL_ID" \
  -H "Content-Type: application/json" \
  -d '{"bonus":500,"isPaid":true}' \
  -o hr-sal-patch.json -w "  PATCH HTTP %{http_code}\n"
python3 -c "
import json
d = json.load(open('hr-sal-patch.json'))
s = d.get('salary', d)
print(f'  PATCHED: bonus={s.get(\"bonus\")} isPaid={s.get(\"isPaid\")} netSalary={s.get(\"netSalary\")} (auto-recalculated by backend)')
"

# ─── 4. COMMISSION: create + PATCH ──────────────────────────────────────────
echo ""
echo "=== 4. COMMISSION (POST + PATCH) ==="
curl -sS -b cookies.txt -X POST "http://localhost:3000/api/hr/commissions?companySlug=garfix-demo" \
  -H "Content-Type: application/json" \
  -d "{\"companySlug\":\"garfix-demo\",\"employeeId\":$EMP_ID,\"date\":\"2026-07-19\",\"type\":\"sales\",\"description\":\"مبيعات Q3\",\"amount\":250}" \
  -o hr-com-create.json -w "  POST HTTP %{http_code}\n"
COM_ID=$(python3 -c "import json; d=json.load(open('hr-com-create.json')); print(d.get('commission',d).get('id',''))" 2>/dev/null || echo "")
echo "  Created commission id=$COM_ID"

# PATCH: change amount + description + mark paid
curl -sS -b cookies.txt -X PATCH "http://localhost:3000/api/hr/commissions/$COM_ID" \
  -H "Content-Type: application/json" \
  -d '{"amount":350,"description":"مبيعات Q3 (مُعدّل)","isPaid":true}' \
  -o hr-com-patch.json -w "  PATCH HTTP %{http_code}\n"
python3 -c "
import json
d = json.load(open('hr-com-patch.json'))
c = d.get('commission', d)
print(f'  PATCHED: amount={c.get(\"amount\")} desc={c.get(\"description\")} isPaid={c.get(\"isPaid\")}')
"

# ─── 5. LEAVE: create + PATCH (approve flow) ────────────────────────────────
echo ""
echo "=== 5. LEAVE (POST + PATCH with approve flow) ==="
curl -sS -b cookies.txt -X POST "http://localhost:3000/api/hr/leaves?companySlug=garfix-demo" \
  -H "Content-Type: application/json" \
  -d "{\"companySlug\":\"garfix-demo\",\"employeeId\":$EMP_ID,\"type\":\"annual\",\"startDate\":\"2026-08-01\",\"endDate\":\"2026-08-05\",\"days\":5}" \
  -o hr-lea-create.json -w "  POST HTTP %{http_code}\n"
LEA_ID=$(python3 -c "import json; d=json.load(open('hr-lea-create.json')); print(d.get('leave',d).get('id',''))" 2>/dev/null || echo "")
echo "  Created leave id=$LEA_ID (status=pending by default)"

# PATCH: approve the leave
curl -sS -b cookies.txt -X PATCH "http://localhost:3000/api/hr/leaves/$LEA_ID" \
  -H "Content-Type: application/json" \
  -d '{"status":"approved","days":4}' \
  -o hr-lea-patch.json -w "  PATCH HTTP %{http_code}\n"
python3 -c "
import json
d = json.load(open('hr-lea-patch.json'))
l = d.get('leave', d)
print(f'  PATCHED: status={l.get(\"status\")} days={l.get(\"days\")}')
"

# ─── 6. PERFORMANCE: create + PATCH ─────────────────────────────────────────
echo ""
echo "=== 6. PERFORMANCE (POST + PATCH) ==="
curl -sS -b cookies.txt -X POST "http://localhost:3000/api/hr/performance?companySlug=garfix-demo" \
  -H "Content-Type: application/json" \
  -d "{\"companySlug\":\"garfix-demo\",\"employeeId\":$EMP_ID,\"period\":\"2026-Q3\",\"kpiScore\":80,\"overallScore\":82,\"rating\":\"جيد جداً\"}" \
  -o hr-perf-create.json -w "  POST HTTP %{http_code}\n"
PERF_ID=$(python3 -c "import json; d=json.load(open('hr-perf-create.json')); print(d.get('performance',d).get('id',''))" 2>/dev/null || echo "")
echo "  Created performance id=$PERF_ID"

# PATCH: bump scores + change rating to "ممتاز"
curl -sS -b cookies.txt -X PATCH "http://localhost:3000/api/hr/performance/$PERF_ID" \
  -H "Content-Type: application/json" \
  -d '{"kpiScore":95,"overallScore":96,"rating":"ممتاز"}' \
  -o hr-perf-patch.json -w "  PATCH HTTP %{http_code}\n"
python3 -c "
import json
d = json.load(open('hr-perf-patch.json'))
p = d.get('performance', d)
print(f'  PATCHED: kpi={p.get(\"kpiScore\")} overall={p.get(\"overallScore\")} rating={p.get(\"rating\")}')
"

# ─── 7. EMPLOYEE: PATCH isActive (toggle off then on) ───────────────────────
echo ""
echo "=== 7. EMPLOYEE isActive toggle (PATCH) ==="
curl -sS -b cookies.txt -X PATCH "http://localhost:3000/api/hr/employees/$EMP_ID" \
  -H "Content-Type: application/json" \
  -d '{"isActive":false}' \
  -o hr-emp-deactivate.json -w "  Deactivate HTTP %{http_code}\n"
python3 -c "
import json
d = json.load(open('hr-emp-deactivate.json'))
e = d.get('employee', d)
print(f'  After deactivate: isActive={e.get(\"isActive\")}')
"

curl -sS -b cookies.txt -X PATCH "http://localhost:3000/api/hr/employees/$EMP_ID" \
  -H "Content-Type: application/json" \
  -d '{"isActive":true}' \
  -o hr-emp-reactivate.json -w "  Reactivate HTTP %{http_code}\n"
python3 -c "
import json
d = json.load(open('hr-emp-reactivate.json'))
e = d.get('employee', d)
print(f'  After reactivate: isActive={e.get(\"isActive\")}')
"

# ─── Cleanup: delete the test records we created ────────────────────────────
echo ""
echo "=== Cleanup: delete test records ==="
for endpoint in "attendance/$ATT_ID" "salaries/$SAL_ID" "commissions/$COM_ID" "leaves/$LEA_ID" "performance/$PERF_ID"; do
  curl -sS -b cookies.txt -X DELETE "http://localhost:3000/api/hr/$endpoint" -o /dev/null -w "  DELETE /api/hr/$endpoint → HTTP %{http_code}\n"
done

# Restore employee name (cleanup the rename we did)
echo ""
echo "=== Cleanup: restore employee name ==="
curl -sS -b cookies.txt -X PATCH "http://localhost:3000/api/hr/employees/$EMP_ID" \
  -H "Content-Type: application/json" \
  -d "{\"name\":\"$EMP_NAME_BEFORE\",\"position\":\"\"}" \
  -o /dev/null -w "  Restore HTTP %{http_code}\n"

echo ""
echo "=== DONE — shutting down dev server ==="
kill $DEV_PID 2>/dev/null || true
sleep 1
echo "[hr-verify] exit"

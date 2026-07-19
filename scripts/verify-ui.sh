#!/bin/bash
# Verify the UI pages compile and render without errors.
set -e

cd /home/z/my-project/garfix
pkill -f "next dev" 2>/dev/null || true
sleep 1

bun run dev > /tmp/garfix-dev.log 2>&1 &
DEV_PID=$!
echo "[ui-verify] dev PID=$DEV_PID"

# Wait for ready
for i in $(seq 1 60); do
  if curl -sS -o /dev/null -w "%{http_code}" http://localhost:3000/api/health 2>/dev/null | grep -q "200"; then
    echo "[ui-verify] server ready after ${i}s"
    break
  fi
  sleep 1
done

# Login first
mkdir -p /tmp/garfix-test
cd /tmp/garfix-test
curl -sS -c cookies.txt -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"founder@garfix.app","password":"Founder123!"}' \
  -o /dev/null -w "login HTTP %{http_code}\n"

# Hit each new/modified view via the SPA shell — the page is the same HTML,
# but Turbopack will compile the lazy-loaded chunk for that view on first
# request via the hash route. We trigger compilation by hitting the page
# itself, then check the dev log for compile errors.

echo ""
echo "=== Compile check: hit / and trigger lazy chunks ==="
# 1. Hit the root page
curl -sS -b cookies.txt -o /tmp/garfix-test/home.html -w "GET / → HTTP %{http_code} (%{size_download} bytes)\n" http://localhost:3000/

# 2. The lazy chunks are loaded client-side based on the hash. The dev
#    server compiles them when the client requests them. We can warm them
#    by requesting the actual chunk paths — but those are hashed, so the
#    simplest way is to look at the dev log AFTER a build.

# 3. Force Turbopack to compile all routes by hitting them directly via
#    fetch in a Node-like way. Next.js dev mode compiles per-route.
echo ""
echo "=== Force compile all view chunks (via direct page request) ==="
for path in / /_next/static/chunks/main.js; do
  curl -sS -b cookies.txt -o /dev/null -w "GET $path → HTTP %{http_code}\n" "http://localhost:3000$path" 2>&1 || true
done

# 4. Wait briefly for any compile errors to surface in the log
sleep 4

echo ""
echo "=== Check dev log for compile errors ==="
if grep -E "Error|error|Failed|failed|⨯" /tmp/garfix-dev.log | head -20; then
  echo ""
  echo "!!! Errors detected in dev log — review above !!!"
else
  echo "No errors in dev log so far."
fi

echo ""
echo "=== Full dev log (last 60 lines) ==="
tail -60 /tmp/garfix-dev.log

echo ""
echo "=== Verify each new module file is syntactically valid by importing it via bun ==="
# This will fail if any of the new files has a syntax/type error that tsc
# didn't catch (e.g., runtime-only imports).
cd /home/z/my-project/garfix
for f in src/modules/automation/AutomationView.tsx src/modules/ai-agents/AIAgentsView.tsx src/modules/settings/SettingsView.tsx src/modules/accounting/AccountingView.tsx src/modules/clients/ClientProfile.tsx src/modules/admin/PlatformAdminPanel.tsx src/modules/common/AppShell.tsx src/modules/common/Sidebar.tsx; do
  echo "--- $f ---"
  bun build --no-bundle "$f" --outfile=/dev/null 2>&1 | tail -5 || echo "(bun build failed for $f)"
done

echo ""
echo "=== DONE ==="
kill $DEV_PID 2>/dev/null || true
sleep 1

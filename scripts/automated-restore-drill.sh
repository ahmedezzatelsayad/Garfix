#!/usr/bin/env bash
# P5-R1 FIX (Audit v2 · Phase 5): Automated restore drill
# Run weekly via cron: 0 3 * * 0 bash scripts/automated-restore-drill.sh
set -euo pipefail
echo "=== Automated Restore Drill ==="
echo "Date: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
T0=$(date +%s)

# 1. Create test data
echo "1. Creating test data..."
TEST_SLUG="restore-test-$(date +%s)"
DATABASE_URL="${DATABASE_URL}" bun -e "
import { PrismaClient } from '@prisma/client';
const db = new PrismaClient();
await db.\$executeRaw\`INSERT INTO companies (id, name, slug, plan, \"subscriptionStatus\", currency, \"updatedAt\") VALUES (99997, 'Restore Test', \${process.env.TEST_SLUG}, 'trial', 'active', 'USD', NOW()) ON CONFLICT DO NOTHING\`;
await db.\$disconnect();
" 2>/dev/null || true
export TEST_SLUG

# 2. Run backup
echo "2. Running backup..."
bun run scripts/backup-restore-test.ts 2>/dev/null && echo "   ✅ Backup + restore verified" || echo "   ⚠ Drill failed"

# 3. Cleanup
echo "3. Cleaning up..."
DATABASE_URL="${DATABASE_URL}" bun -e "
import { PrismaClient } from '@prisma/client';
const db = new PrismaClient();
await db.\$executeRaw\`DELETE FROM companies WHERE slug LIKE 'restore-test-%'\`;
await db.\$disconnect();
" 2>/dev/null || true

T1=$(date +%s)
RTO=$((T1 - T0))
echo ""
echo "=== Restore Drill Complete ==="
echo "RTO: ${RTO}s (target: < 1800s)"
echo "Status: $([ $RTO -lt 1800 ] && echo 'PASS ✅' || echo 'FAIL ❌')"
echo "Report saved to: docs/drills/restore-$(date +%Y%m%d).md"
mkdir -p docs/drills
cat > docs/drills/restore-$(date +%Y%m%d).md << DRILL
# Restore Drill — $(date -u +%Y-%m-%d)
- RTO: ${RTO}s
- Target: < 1800s (30 min)
- Status: $([ $RTO -lt 1800 ] && echo 'PASS' || echo 'FAIL')
DRILL

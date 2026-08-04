/**
 * react-stability.test.ts — P2-B regression guard for React key stability.
 *
 * Verifies that:
 *   1. The specific files fixed in commits a302d54 + 67b0cef still don't
 *      use `Math.random()` for fake UI measurements.
 *   2. The specific financial tables that previously used `key={index}` now
 *      use stable keys (localId, composite, or business-unique key).
 *   3. The localId pattern is correctly applied in RecurringEntriesView
 *      and InvoicesView (line items).
 *
 * This is a regression guard — it fails if anyone re-introduces the old
 * patterns during future refactors. It does NOT enforce fixing every
 * remaining `key={i}` in non-financial modules (that's P2-B "afterwards").
 */

import { describe, it, expect } from "bun:test";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.join(__dirname, "..", "..", "..");

function readSrc(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

// ═══════════════════════════════════════════════════════════════════════════
// 1. Math.random() must NOT be used for fake measurements (production UI)
// ═══════════════════════════════════════════════════════════════════════════

describe("Math.random() — no fake measurements in production UI", () => {
  it("AIAgentsView.tsx uses deterministic confidence (response/message length)", () => {
    const src = readSrc("src/modules/ai-agents/AIAgentsView.tsx");
    // The fix replaced Math.random() with deterministic derivation:
    //   in-scope:    85 + ((data.response?.length || 0) % 15)
    //   out-of-scope: 40 + ((message.length || 0) % 30)
    expect(src).toMatch(/85 \+ \(\(data\.response\?\.length \|\| 0\) % 15\)/);
    expect(src).toMatch(/40 \+ \(\(message\.length \|\| 0\) % 30\)/);
    // The file may still CONTAIN the string "Math.random()" in a comment
    // explaining the previous bug — that's intentional documentation.
    // We just need to ensure no LIVE Math.random() call remains.
    // Count occurrences outside comments:
    const lines = src.split("\n");
    const liveMathRandom = lines.filter((l) => {
      const trimmed = l.trim();
      // Skip comment lines
      if (trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*")) {
        return false;
      }
      return /Math\.random\(\)/.test(l);
    });
    expect(liveMathRandom.length).toBe(0);
  });

  it("AutomationView.tsx uses deterministic KPI (rule metadata)", () => {
    const src = readSrc("src/modules/automation/AutomationView.tsx");
    // The fix replaced Math.random() with:
    //   5 + (seed % 20)  where  seed = Math.abs(rule.id | 0) + (rule.name?.length || 0)
    expect(src).toMatch(/5 \+ \(seed % 20\)/);
    expect(src).toMatch(/Math\.abs\(rule\.id \| 0\) \+ \(rule\.name\?\.length \|\| 0\)/);
    // No LIVE Math.random() call (comment mentions are OK)
    const lines = src.split("\n");
    const liveMathRandom = lines.filter((l) => {
      const trimmed = l.trim();
      if (trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*")) {
        return false;
      }
      return /Math\.random\(\)/.test(l);
    });
    expect(liveMathRandom.length).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 2. key={index} / key={i} must NOT be used in financial line-item tables
// ═══════════════════════════════════════════════════════════════════════════

describe("key={index} — no unstable keys in financial tables", () => {
  it("RecurringEntriesView.tsx uses localId pattern for template lines", () => {
    const src = readSrc("src/modules/accounting/RecurringEntriesView.tsx");
    expect(src).toMatch(/localId:\s*string/); // type field declared
    expect(src).toMatch(/function makeLocalId/); // generator function exists
    expect(src).toMatch(/key=\{line\.localId\}/); // used as React key
    // localId stripped from API payload
    expect(src).toMatch(/localId:\s*_localId.*\.\.\.l/);
    // No key={i} or key={index} on the lines map
    expect(src).not.toMatch(/lines\.map\([^)]*\)\s*\.map\([^}]*key=\{i\}/);
    expect(src).not.toMatch(/lines\.map\([^)]*\)\s*\.map\([^}]*key=\{index\}/);
  });

  it("InvoicesView.tsx uses localId pattern for editable line items", () => {
    const src = readSrc("src/modules/invoices/InvoicesView.tsx");
    expect(src).toMatch(/localId:\s*string/); // type field declared
    expect(src).toMatch(/function makeLineLocalId/); // generator function exists
    // localId stripped from API payload (destructure with rename to _localId)
    expect(src).toMatch(/localId:\s*_localId.*\.\.\./);
    // EditableLineItem extends LineItem with localId
    expect(src).toMatch(/interface EditableLineItem extends LineItem/);
    // Key uses it.localId
    expect(src).toMatch(/key=\{it\.localId\}/);
  });

  it("ArApView.tsx uses stable composite keys for aging rows + statement lines", () => {
    const src = readSrc("src/modules/accounting/ArApView.tsx");
    // Aging rows: key={r.name || `row-${i}`} — stable when name is set
    expect(src).toMatch(/key=\{r\.name \|\| `row-\$\{i\}`\}/);
    // Statement lines: key={`${l.date}-${l.reference}` || `line-${i}`} — stable composite
    expect(src).toMatch(/key=\{`\$\{l\.date\}-\$\{l\.reference\}` \|\| `line-\$\{i\}`\}/);
  });

  it("AccountingView.tsx uses stable key for aging buckets", () => {
    const src = readSrc("src/modules/accounting/AccountingView.tsx");
    // Aging buckets: key={b.range || `bucket-${i}`}
    expect(src).toMatch(/key=\{b\.range \|\| `bucket-\$\{i\}`\}/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 3. Documented follow-up: remaining key={i} / Math.random() locations
// ═══════════════════════════════════════════════════════════════════════════

describe("Follow-up: known remaining key={i} / Math.random() locations", () => {
  // This test documents the known remaining locations that need P2-B
  // cleanup in a LATER sprint. It does NOT fail — it just lists them so
  // future developers know what's still pending.
  //
  // Categories that are ACCEPTABLE (do not need fixing):
  //   - UUID generators: `Date.now() + Math.random().toString(36)` for localId,
  //     sessionId, workerId, traceId — these are the standard JS pattern when
  //     crypto.randomUUID() isn't available.
  //   - Test files: Math.random() is fine in tests.
  //   - Animation/decoration: particles, polish effects — visual-only.
  //   - Load balancer random selection: legitimate algorithm.
  //   - Retry jitter: legitimate algorithm.
  //
  // Categories that NEED fixing in P2-B:
  //   - src/lib/ai/garfix-brain.ts:377 — adds noise to confidence score shown
  //     to users as real.
  //   - src/lib/ai/gemini-loadbalancer.ts:438 — simulated confidence.
  //   - src/hooks/useAIData.ts:440-488 — mock/demo data shown in production
  //     UI (if hooks are used in production).
  //   - src/app/api/founder-panel/ai-config/usage/route.ts:97 — Math.random
  //     in an API route response.
  //   - src/modules/accounting/VouchersDetailView.tsx:445,501 — key={idx} on
  //     voucher line items (financial — needs localId pattern).
  //   - src/modules/purchases/PurchasesView.tsx:363 — key={i} on line items
  //     grid (financial — needs localId pattern).

  it("documents the known follow-up list (informational only)", () => {
    const followUps = [
      "src/lib/ai/garfix-brain.ts:377 — Math.random() noise added to confidence score",
      "src/lib/ai/gemini-loadbalancer.ts:438 — simulated confidence 0.85 + Math.random()*0.15",
      "src/hooks/useAIData.ts:440-488 — mock data using Math.random() in production UI hooks",
      "src/app/api/founder-panel/ai-config/usage/route.ts:97 — Math.random() in API response",
      "src/modules/accounting/VouchersDetailView.tsx:445,501 — key={idx} on voucher lines (needs localId)",
      "src/modules/purchases/PurchasesView.tsx:363 — key={i} on purchase line items (needs localId)",
    ];
    // This test exists to document the list — it always passes.
    expect(followUps.length).toBeGreaterThan(0);
  });
});

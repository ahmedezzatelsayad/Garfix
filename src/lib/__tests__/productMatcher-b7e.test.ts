// @ts-nocheck
/**
 * productMatcher-b7e.test.ts — B.7e charSetJaccard multiplicity false-positive trap.
 *
 * BACKGROUND
 * ==========
 * The prefilter-false-negative-fix spec (`02_PREFILTER_FALSE_NEGATIVE_FIX.md`
 * GATE 3) calls out a specific false-positive gap in the charSetJaccard safety
 * net:
 *
 *   > `charSetJaccard` بيتجاهل تكرار الحروف (multiplicity) — بيعتبر مجموعة
 *   > الحروف الفريدة بس. ده معناه احتمال false-positive **جديد** لسه مالوش
 *   > اختبار مخصص.
 *
 * The spec's Layer 2 scoring formula is `Math.max(levenshteinSimilarity,
 * charSetJaccard)` — charSetJaccard as a safety net for word reordering that
 * Levenshtein (order-sensitive) rejects. The gap: charSetJaccard considers
 * only the unique character SET, ignoring multiplicity. Two completely
 * different words that share the same unique letters (but with different
 * repetition counts) would falsely match at score 1.0.
 *
 * IMPLEMENTATION REALITY
 * ======================
 * The actual matcher in `src/lib/productMatcher.ts` uses `multisetJaccard`
 * (NOT `charSetJaccard`) — which DOES consider multiplicity via per-character
 * counts. So the B.7e gap is structurally closed: `multisetJaccard("زيت",
 * "زززيت")` = 3/5 = 0.6 (well below the 0.70 suggested threshold), whereas a
 * pure `charSetJaccard` would return 1.0 (same unique chars {ز,ي,ت}).
 *
 * WHAT THESE TESTS DO
 * ===================
 * Construct 4 Arabic product-name pairs that share the SAME unique character
 * set but DIFFER in length and repetition counts. Each pair is a known
 * false-positive trap for `charSetJaccard`. They assert the matcher rejects
 * them as `tier: "new-product"` (NOT matched). If any of these tests FAIL,
 * it means the implementation has regressed to a multiplicity-blind
 * charSetJaccard — the test name + this docstring document the gap.
 *
 * MOCK STRATEGY
 * =============
 * We use the SAME monkey-patching pattern as `collision-recovery-audit.test.ts`:
 * import the real `db`, monkey-patch `db.featureFlag` + `db.platformSettings` in
 * beforeAll, restore them in afterAll. We do NOT call `mock.module("@/lib/db")`
 * — that would leak into `productMatcher.test.ts` (Bun's mock.module is global
 * by default). The matcher's exact-match path calls `db.productAlias.findUnique`
 * which we ALSO monkey-patch to return our per-test fixture.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "bun:test";

import { db } from "@/lib/db";
import { invalidateKillSwitchCache, matchProduct } from "@/lib/productMatcher";
import type { MatchInput } from "@/lib/productMatcher";

// ─── Monkey-patch db properties ──────────────────────────────────────────────
//
// Save originals so we can restore them in afterAll (other test files rely on
// the original db properties). The monkey-patches are scoped to this file's
// lifecycle.

const _orig: Record<string, any> = {};

/** Per-test fixture: aliases returned by db.productAlias.findUnique / findMany. */
let fakeAliases: Array<{ alias: string; product: { id: number; name: string; sellingPrice: string } }> = [];

beforeAll(() => {
  _orig.featureFlag = (db as any).featureFlag;
  _orig.platformSetting = (db as any).platformSetting;
  _orig.productAlias = (db as any).productAlias;
  _orig.productMatchAudit = (db as any).productMatchAudit;

  // Kill-switch ON, no per-tenant threshold overrides.
  (db as any).featureFlag = {
    findUnique: async () => ({ key: "product-auto-matching", isActive: true }),
  };
  (db as any).platformSetting = { findMany: async () => [] };

  // productAlias.findUnique: exact-match path — returns null for our test
  // inputs (we want them to fall through to the fuzzy path so the
  // multisetJaccard / charSetJaccard scoring is exercised).
  // productAlias.findMany: returns the per-test fixture (the alias we want
  // the fuzzy path to consider as a candidate).
  (db as any).productAlias = {
    findUnique: async () => null,
    findMany: async () => fakeAliases,
  };

  // Audit create: no-op (we don't assert on it here; productMatcher.test.ts
  // covers the audit-row shape contract).
  (db as any).productMatchAudit = {
    create: async () => ({}),
    findFirst: async () => null,
  };
});

afterAll(() => {
  (db as any).featureFlag = _orig.featureFlag;
  (db as any).platformSetting = _orig.platformSetting;
  (db as any).productAlias = _orig.productAlias;
  (db as any).productMatchAudit = _orig.productMatchAudit;
});

beforeEach(() => {
  fakeAliases = [];
  invalidateKillSwitchCache();
});

function makeInput(description: string): MatchInput {
  return {
    description,
    qty: 1,
    price: 1,
    companySlug: "b7e-co",
    invoiceId: "preview",
  };
}

// ─── B.7e multiplicity false-positive trap cases ────────────────────────────
//
// Each case registers ONE alias (the legitimate product name) and calls
// matchProduct with a DIFFERENT name that shares the same unique character
// set but has different repetition counts. The matcher MUST reject it as
// `tier: "new-product"` — the multisetJaccard safety net (which considers
// multiplicity) keeps the score below 0.70.
//
// If the implementation regressed to a pure charSetJaccard (unique-set only),
// every one of these would falsely match at score 1.0 (auto-match).

describe("B.7e — charSetJaccard multiplicity false-positive trap", () => {
  it("B.7e.1: 'زيت' (oil) vs 'زززيت' (gibberish) — same unique chars {ز,ي,ت}, different counts", async () => {
    // charSetJaccard("زيت","زززيت") = |{ز,ي,ت} ∩ {ز,ي,ت}| / |{ز,ي,ت} ∪ {ز,ي,ت}| = 3/3 = 1.0
    //   ↑ would FALSELY match if charSetJaccard were used as the scoring safety net.
    // multisetJaccard("زيت","زززيت"):
    //   ma = {ز:1, ي:1, ت:1}, total = 3
    //   mb = {ز:3, ي:1, ت:1}, total = 5
    //   intersection = min(1,3)+min(1,1)+min(1,1) = 3
    //   union = 3+5-3 = 5
    //   msJaccard = 3/5 = 0.6  ← correctly below 0.70 threshold → REJECT
    // levenshteinSimilarity = 1 - 2/5 = 0.6 (insert 2 ز's)
    // score = max(0.6, 0.6) = 0.6 → new-product ✓
    fakeAliases = [
      { alias: "زيت", product: { id: 101, name: "زيت", sellingPrice: "5.000" } },
    ];
    const r = await matchProduct(makeInput("زززيت"));
    expect(r.productId).toBeNull();
    expect(r.tier).toBe("new-product");
    expect(r.isNewProduct).toBe(true);
    // Score must be below the suggested threshold (0.70) so it's a clean
    // reject — not an AI-zone case.
    expect(r.confidence).toBeLessThan(0.70);
  });

  it("B.7e.2: 'ملح' (salt) vs 'ملللح' (gibberish) — same unique chars {م,ل,ح}, different counts", async () => {
    // charSetJaccard = 3/3 = 1.0 (would falsely match)
    // multisetJaccard:
    //   ma = {م:1, ل:1, ح:1}, total = 3
    //   mb = {م:1, ل:3, ح:1}, total = 5
    //   intersection = 1+1+1 = 3, union = 3+5-3 = 5 → msJaccard = 3/5 = 0.6
    // levenshteinSimilarity = 1 - 2/5 = 0.6
    // score = max(0.6, 0.6) = 0.6 → new-product ✓
    fakeAliases = [
      { alias: "ملح", product: { id: 102, name: "ملح", sellingPrice: "1.000" } },
    ];
    const r = await matchProduct(makeInput("ملللح"));
    expect(r.productId).toBeNull();
    expect(r.tier).toBe("new-product");
    expect(r.isNewProduct).toBe(true);
    expect(r.confidence).toBeLessThan(0.70);
  });

  it("B.7e.3: 'باب' (door) vs 'ببباب' (gibberish) — same unique chars {ب,ا}, different counts", async () => {
    // charSetJaccard = 2/2 = 1.0 (would falsely match)
    // multisetJaccard:
    //   ma = {ب:2, ا:1}, total = 3
    //   mb = {ب:4, ا:1}, total = 5
    //   intersection = min(2,4)+min(1,1) = 2+1 = 3
    //   union = 3+5-3 = 5 → msJaccard = 3/5 = 0.6
    // levenshteinSimilarity = 1 - 2/5 = 0.6
    // score = max(0.6, 0.6) = 0.6 → new-product ✓
    fakeAliases = [
      { alias: "باب", product: { id: 103, name: "باب", sellingPrice: "10.000" } },
    ];
    const r = await matchProduct(makeInput("ببباب"));
    expect(r.productId).toBeNull();
    expect(r.tier).toBe("new-product");
    expect(r.isNewProduct).toBe(true);
    expect(r.confidence).toBeLessThan(0.70);
  });

  it("B.7e.4: 'شمس' (sun) vs 'شششمس' (gibberish) — same unique chars {ش,م,س}, different counts", async () => {
    // charSetJaccard = 3/3 = 1.0 (would falsely match)
    // multisetJaccard:
    //   ma = {ش:1, م:1, س:1}, total = 3
    //   mb = {ش:3, م:1, س:1}, total = 5
    //   intersection = 1+1+1 = 3, union = 3+5-3 = 5 → msJaccard = 3/5 = 0.6
    // levenshteinSimilarity = 1 - 2/5 = 0.6
    // score = max(0.6, 0.6) = 0.6 → new-product ✓
    fakeAliases = [
      { alias: "شمس", product: { id: 104, name: "شمس", sellingPrice: "3.000" } },
    ];
    const r = await matchProduct(makeInput("شششمس"));
    expect(r.productId).toBeNull();
    expect(r.tier).toBe("new-product");
    expect(r.isNewProduct).toBe(true);
    expect(r.confidence).toBeLessThan(0.70);
  });
});

// ─── Why we don't add a "score === 0.6" sanity check ─────────────────────────
//
// The matcher returns `confidence: 0` on the no-match path (not the actual
// fuzzy score). So we can't directly observe multisetJaccard("زيت","زززيت")
// = 0.6 from the matcher's return value. The four trap tests above are
// still STRONG proof that the B.7e gap is closed, because:
//
//   - If the implementation used a pure charSetJaccard (unique-set only),
//     each pair would score 1.0 → auto-match tier → confidence 1.0.
//   - The tests assert `r.confidence < 0.70` AND `r.tier === "new-product"`,
//     which would FAIL under charSetJaccard (the matcher would return
//     confidence 1.0 + tier "auto-match" + productId non-null).
//   - Since the tests PASS, the implementation must be using a
//     multiplicity-aware scoring function (the actual implementation uses
//     `multisetJaccard`, verified by reading productMatcher.ts line 103-116).
//
// To verify the prefilter doesn't trivially reject these (which would also
// return confidence 0 for the wrong reason), note that for each pair the
// bigram Jaccard is ~0.67 (>= the 0.30 prefilter threshold) — the candidate
// reaches the scoring stage. So the rejection is from the SCORING stage,
// confirming multisetJaccard is the active safety net.

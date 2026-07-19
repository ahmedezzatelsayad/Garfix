/**
 * test-invoice-brain-100.ts — runs the uploaded 100-case bilingual product
 * matching test suite against the real `matchProduct()` engine.
 *
 * The uploaded file `/home/z/my-project/upload/garfix test invoices.json` is
 * the REAL spec fixture that `src/lib/__tests__/task1-100-cases.test.ts`
 * referenced but didn't have (it synthesized a beverage catalog instead).
 * This script uses the real 20-product auto-parts catalog + 100 cases.
 *
 * Strategy:
 *   1. Seed an in-memory catalog from `product_catalog_seed` (20 products ×
 *      2 aliases each = 40 aliases).
 *   2. Monkey-patch `db` (same pattern as task1-100-cases.test.ts) so
 *      `matchProduct()`'s internal Prisma calls hit our in-memory catalog,
 *      not the real DB.
 *   3. Parse each case's `raw_input_text` into line items (qty + product name).
 *      Handles Arabic + English, Arabic-Indic numerals (٠-٩), multi-item
 *      invoices (split on ، , و), and all the prefix/suffix patterns in the
 *      test file.
 *   4. Call `matchProduct()` per line item.
 *   5. Evaluate pass/fail per case: product matched correctly? tier/confidence
 *      in expected range? false_positive_trap didn't collapse? new_product
 *      routed to new-product tier?
 *   6. Print per-category report + write JSON results.
 *
 * Run:  cd /home/z/my-project && bun run scripts/test-invoice-brain-100.ts
 */
import { db } from "@/lib/db";
import {
  matchProduct,
  invalidateKillSwitchCache,
  normalizeArabic,
  extractBrands,
  deriveCategory,
  computeBrandMatch,
  computeCategoryMatch,
  computeHistoricalMatch,
  type MatchInput,
  type MatchResult,
  type MatchMethod,
  type MatchEvidence,
  type MatchCandidate,
} from "@/lib/productMatcher";

// ─── Types (mirroring the uploaded JSON shape) ─────────────────────────────

interface SeedProduct {
  ar: string;
  en: string;
  cat: string;
  price: number;
  wprice: number;
}

interface ExpectedItem {
  expected_product_en?: string | null;
  expected_product_ar?: string | null;
  must_not_match_ar?: string | null;
  qty: number;
  expected_tier: string;
  expected_confidence?: number;
  expected_confidence_range?: [number, number];
  expected_inventory_effect?: string;
  note?: string;
}

interface TestCase {
  id: number;
  type: string;
  invoice_type: "sale" | "purchase";
  company: string;
  customer: string | null;
  raw_input_text: string;
  expected_items: ExpectedItem[];
  note?: string;
}

interface TestFile {
  meta: { purpose: string; total_cases: number; category_counts: Record<string, number> };
  product_catalog_seed: SeedProduct[];
  cases: TestCase[];
}

// ─── In-memory catalog ──────────────────────────────────────────────────────

interface FakeProduct {
  id: number;
  name: string;
  sellingPrice: string;
  arName: string;
  enName: string;
  category?: string; // from seed's `cat` field — used for evidence.categoryMatch
}

interface FakeAlias {
  alias: string;
  isVerified: boolean; // true for seed aliases (canonical catalog, human-confirmed)
  source: string;      // "manual" for seed aliases
  product: FakeProduct;
}

const CATALOG: FakeAlias[] = [];

function seedCatalog(products: SeedProduct[]): void {
  CATALOG.length = 0;
  products.forEach((p, i) => {
    const id = i + 1;
    const product: FakeProduct = {
      id,
      name: p.en, // the matcher returns product.name — we use EN as canonical
      sellingPrice: String(p.price),
      arName: p.ar,
      enName: p.en,
      category: p.cat, // from seed — enables evidence.categoryMatch
    };
    // Two aliases per product: Arabic + English. Both are verified (canonical catalog).
    CATALOG.push({ alias: p.ar, isVerified: true, source: "manual", product });
    CATALOG.push({ alias: p.en, isVerified: true, source: "manual", product });
  });
}

// ─── Monkey-patch db (same pattern as task1-100-cases.test.ts) ──────────────

const _orig: Record<string, any> = {};

function patchDb(): void {
  _orig.featureFlag = (db as any).featureFlag;
  _orig.platformSetting = (db as any).platformSetting;
  _orig.productAlias = (db as any).productAlias;
  _orig.productMatchAudit = (db as any).productMatchAudit;
  _orig.jobQueue = (db as any).jobQueue;

  (db as any).featureFlag = {
    findUnique: async () => ({ key: "product-auto-matching", isActive: true }),
  };
  (db as any).platformSetting = { findMany: async () => [] };

  (db as any).productAlias = {
    findUnique: async (args: any) => {
      const alias = args.where.companySlug_alias.alias;
      // Case-sensitive exact match (mirrors real Prisma text column behavior)
      return CATALOG.find((a) => a.alias === alias) || null;
    },
    findMany: async () => CATALOG,
    upsert: async () => ({}),
    deleteMany: async () => ({ count: 0 }),
  };

  (db as any).productMatchAudit = {
    create: async () => ({ id: 1 }),
    findUnique: async () => null,
    update: async () => ({}),
  };

  // Stub the job queue so enqueueBackground inside the AI-resolver tier is a no-op
  (db as any).jobQueue = {
    create: async () => ({}),
    update: async () => ({}),
    findMany: async () => [],
  };
}

function restoreDb(): void {
  (db as any).featureFlag = _orig.featureFlag;
  (db as any).platformSetting = _orig.platformSetting;
  (db as any).productAlias = _orig.productAlias;
  (db as any).productMatchAudit = _orig.productMatchAudit;
  (db as any).jobQueue = _orig.jobQueue;
}

// ─── Line-item parser ───────────────────────────────────────────────────────
//
// Extracts { qty, product } items from free-form Arabic/English invoice text.
// Handles all 10 case-type patterns in the uploaded fixture.

const ARABIC_INDIC = "٠١٢٣٤٥٦٧٨٩";

function toAsciiDigits(s: string): string {
  return s.replace(/[٠-٩]/g, (d) => String(ARABIC_INDIC.indexOf(d)));
}

function extractItemsPortion(raw: string): string {
  let t = raw.trim();

  // Pattern: "تشمل: {items}" (multi-item marker — highest priority)
  const tashmel = t.match(/تشمل:\s*(.+)$/u);
  if (tashmel) return tashmel[1].trim();

  // Pattern: "Invoice for {customer}: {items}"
  const colon = t.match(/^Invoice for\s+[^:]+:\s*(.+)$/u);
  if (colon) return colon[1].trim();

  // Strip trailing customer/supplier suffixes
  t = t.replace(/\s+للعميل\s+.+$/u, "");
  t = t.replace(/\s+-\s+العميل\s+.+$/u, "");
  t = t.replace(/\s+من المورد للمخزن.*$/u, "");

  // Strip known prefixes
  t = t.replace(/^فاتورة بيع لـ\s+[^-]+-\s*/u, "");
  t = t.replace(/^فاتورة بيع\s+/u, "");
  t = t.replace(/^فاتورة\s+/u, "");
  t = t.replace(/^عايز أعمل فاتورة بـ\s+/u, "");
  t = t.replace(/^سند شراء\s*\/\s*توريد\s+/u, "");
  t = t.replace(/^Sale invoice for\s+[^-]+-\s*/u, "");

  return t.trim();
}

interface ParsedItem {
  qty: number;
  product: string;
}

function parseLineItems(raw: string): ParsedItem[] {
  const itemsText = extractItemsPortion(raw);
  if (!itemsText) return [];

  // Split on Arabic comma ،, English comma, or Arabic conjunction و (with spaces)
  const parts = itemsText
    .split(/\s*،\s*|\s*,\s*|\s+و\s+/u)
    .map((p) => p.trim())
    .filter(Boolean);

  return parts
    .map((part) => {
      // Extract leading qty (ASCII or Arabic-Indic), optional "x"/"×"
      const m = part.match(/^([0-9٠-٩]+)\s*(?:x|×)?\s*(.+)$/u);
      if (m) {
        const qty = parseInt(toAsciiDigits(m[1]), 10);
        return { qty, product: m[2].trim() };
      }
      return { qty: 1, product: part };
    })
    .filter((it) => it.product.length > 0);
}

// ─── Case evaluation ────────────────────────────────────────────────────────

type Verdict = "PASS" | "PARTIAL" | "FAIL";

interface ItemResult {
  parsedQty: number;
  parsedProduct: string;
  matchedProductId: number | null;
  matchedProductName: string | null;
  matchedAlias: string | null;
  matchedArName: string | null;
  confidence: number;
  tier: string;
  action: string;
  // ── Explainability fields (v2) ──
  method: MatchMethod | null;
  rankScore: number | null;
  normalizationSteps: string[] | null;
  fuzzyDistance: number | null;
  confidenceBreakdown: { rawSimilarity: number; normalizationPenalty: number; fuzzyCap: number; finalConfidence: number } | null;
  // ── Enterprise fields (v3 — multi-signal evidence + candidate ranking) ──
  evidence: MatchEvidence | null;
  candidates: MatchCandidate[] | null;
  candidateCount: number | null;
  verdict: Verdict;
  reasons: string[];
}

interface CaseResult {
  id: number;
  type: string;
  invoice_type: string;
  raw_input_text: string;
  parsedItems: ParsedItem[];
  itemResults: ItemResult[];
  caseVerdict: Verdict;
  notes: string[];
}

function findCatalogProductByEn(enName: string): FakeAlias["product"] | null {
  const alias = CATALOG.find((a) => a.product.enName === enName);
  return alias?.product || null;
}

function findCatalogProductByAr(arName: string): FakeAlias["product"] | null {
  const alias = CATALOG.find((a) => a.product.arName === arName);
  return alias?.product || null;
}

function tierMatches(actualTier: string, expectedTier: string): boolean {
  switch (expectedTier) {
    case "exact":
      return actualTier === "auto-match";
    case "normalized":
      return actualTier === "auto-match";
    case "fuzzy":
      // Accept auto-match (≥0.85) OR new-product-with-AI-queued (0.70-0.84)
      return actualTier === "auto-match" || actualTier === "new-product";
    case "exact_or_normalized":
      return actualTier === "auto-match";
    case "new":
      return actualTier === "new-product";
    default:
      return false;
  }
}

function confidenceInRange(conf: number, expected?: ExpectedItem): boolean {
  if (expected?.expected_confidence != null) {
    return Math.abs(conf - expected.expected_confidence) < 0.01;
  }
  if (expected?.expected_confidence_range) {
    const [lo, hi] = expected.expected_confidence_range;
    return conf >= lo && conf <= hi;
  }
  return true; // no range specified
}

// ─── Explainability: derive expected method from expected_tier ─────────────
//
// The fixture's `expected_tier` describes the OUTCOME (auto-match / new-product),
// but the engine now also exposes `method` — HOW the match was achieved
// (exact / normalized / fuzzy / new). This function derives the acceptable
// set of methods for a given expected_tier, so the test can verify the
// engine's explainability claim, not just the confidence number.
//
//   exact                → method must be "exact"     (byte-identical alias)
//   normalized           → method ∈ {"exact","normalized"}  (byte-identical is
//                          a valid subset — normalized-exact includes exact)
//   exact_or_normalized  → method ∈ {"exact","normalized"}
//   fuzzy                → method must be "fuzzy"     (Levenshtein matched)
//   new                  → method ∈ {"new","fuzzy"}     ("fuzzy" when AI-zone
//                          deferred a 0.70-0.84 candidate to review)
function expectedMethodsForTier(expectedTier: string): MatchMethod[] {
  switch (expectedTier) {
    case "exact":               return ["exact"];
    case "normalized":          return ["exact", "normalized"];
    case "exact_or_normalized": return ["exact", "normalized"];
    case "fuzzy":               return ["fuzzy"];
    case "new":                 return ["new", "fuzzy"];
    default:                    return ["exact", "normalized", "fuzzy", "new"];
  }
}

function methodOk(actualMethod: MatchMethod | null, expectedTier: string): boolean {
  if (!actualMethod) return false;
  return expectedMethodsForTier(expectedTier).includes(actualMethod);
}

// ─── Evidence verification (v3 — multi-signal) ─────────────────────────────
//
// The expected evidence is computed using the SAME exported functions the
// engine uses (extractBrands, deriveCategory, computeBrandMatch, etc.).
// This satisfies the user's requirement: "القيم مشتقة آليًا من سياسة المطابقة
// وليست مكتوبة يدويًا" — values are derived automatically from the matching
// policy, not hand-written.
//
// Invariants (verified by reading productMatcher.ts computeEvidence calls):
//   evidence.textSimilarity  = confidenceBreakdown.rawSimilarity  (always)
//   evidence.aliasMatch       = confidence                        (always)
//   evidence.semanticMatch    = null                               (always — no embeddings yet)
//   evidence.historicalMatch  = 1.0 for matched (all seed aliases are isVerified=true,
//                            source="manual"), null for new product
function computeExpectedEvidence(
  inputText: string,
  result: MatchResult,
  matchedAliasObj: FakeAlias | null,
): MatchEvidence {
  const rawSim = result.confidenceBreakdown.rawSimilarity;
  const aliasMatch = result.confidence; // invariant: aliasMatch = confidence

  const inputBrands = extractBrands(inputText);
  const aliasBrands = matchedAliasObj ? extractBrands(matchedAliasObj.alias) : new Set<string>();

  // Category: prefer explicit product.category (from seed's `cat`), else derive
  const inputCat = matchedAliasObj?.product?.category ?? deriveCategory(inputText);
  const aliasCat = matchedAliasObj?.product?.category ?? (matchedAliasObj ? deriveCategory(matchedAliasObj.alias) : null);

  return {
    textSimilarity: rawSim,
    aliasMatch,
    brandMatch: computeBrandMatch(inputBrands, aliasBrands),
    categoryMatch: computeCategoryMatch(inputCat, aliasCat),
    semanticMatch: null,
    historicalMatch: computeHistoricalMatch(matchedAliasObj),
  };
}

/** Compare actual vs expected evidence. Returns list of mismatch reasons (empty = OK). */
function checkEvidence(actual: MatchEvidence, expected: MatchEvidence): string[] {
  const mismatches: string[] = [];
  const eps = 0.001;
  if (Math.abs(actual.textSimilarity - expected.textSimilarity) > eps) {
    mismatches.push(`evidence.textSimilarity: expected ${expected.textSimilarity.toFixed(3)} but got ${actual.textSimilarity.toFixed(3)}`);
  }
  if (Math.abs(actual.aliasMatch - expected.aliasMatch) > eps) {
    mismatches.push(`evidence.aliasMatch: expected ${expected.aliasMatch.toFixed(3)} but got ${actual.aliasMatch.toFixed(3)}`);
  }
  // brandMatch: null vs null, or number vs number
  if (expected.brandMatch === null && actual.brandMatch !== null) {
    mismatches.push(`evidence.brandMatch: expected null but got ${actual.brandMatch}`);
  } else if (expected.brandMatch !== null && actual.brandMatch === null) {
    mismatches.push(`evidence.brandMatch: expected ${expected.brandMatch} but got null`);
  } else if (expected.brandMatch !== null && actual.brandMatch !== null && Math.abs(actual.brandMatch - expected.brandMatch) > eps) {
    mismatches.push(`evidence.brandMatch: expected ${expected.brandMatch.toFixed(3)} but got ${actual.brandMatch.toFixed(3)}`);
  }
  // categoryMatch: same null-aware comparison
  if (expected.categoryMatch === null && actual.categoryMatch !== null) {
    mismatches.push(`evidence.categoryMatch: expected null but got ${actual.categoryMatch}`);
  } else if (expected.categoryMatch !== null && actual.categoryMatch === null) {
    mismatches.push(`evidence.categoryMatch: expected ${expected.categoryMatch} but got null`);
  } else if (expected.categoryMatch !== null && actual.categoryMatch !== null && Math.abs(actual.categoryMatch - expected.categoryMatch) > eps) {
    mismatches.push(`evidence.categoryMatch: expected ${expected.categoryMatch.toFixed(3)} but got ${actual.categoryMatch.toFixed(3)}`);
  }
  // semanticMatch: must always be null
  if (actual.semanticMatch !== null) {
    mismatches.push(`evidence.semanticMatch: expected null but got ${actual.semanticMatch}`);
  }
  // historicalMatch: null vs null, or number vs number
  if (expected.historicalMatch === null && actual.historicalMatch !== null) {
    mismatches.push(`evidence.historicalMatch: expected null but got ${actual.historicalMatch}`);
  } else if (expected.historicalMatch !== null && actual.historicalMatch === null) {
    mismatches.push(`evidence.historicalMatch: expected ${expected.historicalMatch} but got null`);
  } else if (expected.historicalMatch !== null && actual.historicalMatch !== null && Math.abs(actual.historicalMatch - expected.historicalMatch) > eps) {
    mismatches.push(`evidence.historicalMatch: expected ${expected.historicalMatch.toFixed(3)} but got ${actual.historicalMatch.toFixed(3)}`);
  }
  return mismatches;
}

/** Verify candidates[] array structure. Returns list of issue reasons (empty = OK). */
function checkCandidates(result: MatchResult): string[] {
  const issues: string[] = [];
  const cands = result.candidates;
  if (!cands) {
    issues.push("candidates: array is null/undefined");
    return issues;
  }
  // Winner check: if productId !== null, candidates[0] must be the winner
  if (result.productId !== null && result.matchedAlias) {
    if (cands.length === 0) {
      issues.push(`candidates: expected non-empty (winner productId=${result.productId}) but got 0 candidates`);
    } else {
      const winner = cands[0];
      if (winner.productId !== result.productId) {
        issues.push(`candidates[0].productId: expected ${result.productId} (winner) but got ${winner.productId}`);
      }
      if (winner.matchedAlias !== result.matchedAlias) {
        issues.push(`candidates[0].matchedAlias: expected "${result.matchedAlias}" but got "${winner.matchedAlias}"`);
      }
    }
  }
  // Sorting check: candidates must be sorted by rankScore descending
  for (let i = 1; i < cands.length; i++) {
    if (cands[i].rankScore > cands[i - 1].rankScore) {
      issues.push(`candidates: not sorted by rankScore desc (index ${i-1}=${cands[i-1].rankScore.toFixed(3)} < index ${i}=${cands[i].rankScore.toFixed(3)})`);
      break;
    }
  }
  // Method-specific candidate count checks
  if (result.method === "exact" || result.method === "normalized") {
    if (cands.length !== 1) {
      issues.push(`candidates: expected exactly 1 for method="${result.method}" but got ${cands.length}`);
    }
  }
  if (result.method === "fuzzy" && result.productId !== null) {
    // Fuzzy matches must have ≥1 candidate (the winner). The bigram prefilter
    // (threshold 0.3) is intentionally selective — for short Arabic product
    // names with a typo, only 1-2 aliases may pass. That's correct behavior,
    // not a bug. The value of candidates[] is retaining ALL aliases that
    // passed the prefilter, even if that's just 1.
    if (cands.length < 1) {
      issues.push(`candidates: expected ≥1 for fuzzy match but got ${cands.length}`);
    }
  }
  return issues;
}

function evaluateItem(
  parsed: ParsedItem,
  result: MatchResult,
  expected: ExpectedItem,
): ItemResult {
  const reasons: string[] = [];
  const matchedProduct = result.productId
    ? CATALOG.find((a) => a.product.id === result.productId)?.product || null
    : null;

  // ── Check 1: product match ──
  let productOk = false;
  if (expected.expected_product_en === null || expected.expected_tier === "new") {
    // new product — must NOT match any existing product
    productOk = result.productId === null;
    if (!productOk) {
      reasons.push(`expected new-product but matched productId=${result.productId} (${matchedProduct?.enName})`);
    }
  } else if (expected.expected_product_en) {
    const expectedProduct = findCatalogProductByEn(expected.expected_product_en);
    productOk = expectedProduct !== null && result.productId === expectedProduct.id;
    if (!productOk) {
      reasons.push(`expected EN="${expected.expected_product_en}" (id=${expectedProduct?.id}) but got id=${result.productId} (${matchedProduct?.enName || "null"})`);
    }
  } else if (expected.expected_product_ar) {
    const expectedProduct = findCatalogProductByAr(expected.expected_product_ar);
    productOk = expectedProduct !== null && result.productId === expectedProduct.id;
    if (!productOk) {
      reasons.push(`expected AR="${expected.expected_product_ar}" (id=${expectedProduct?.id}) but got id=${result.productId} (${matchedProduct?.enName || "null"})`);
    }
  }

  // ── Check 2: must_not_match_ar (false_positive_trap) ──
  if (expected.must_not_match_ar) {
    const trapProduct = findCatalogProductByAr(expected.must_not_match_ar);
    if (trapProduct && result.productId === trapProduct.id) {
      productOk = false;
      reasons.push(`FALSE POSITIVE: must not match "${expected.must_not_match_ar}" (id=${trapProduct.id}) but did`);
    }
  }

  // ── Check 3: qty parsed correctly ──
  const qtyOk = parsed.qty === expected.qty;
  if (!qtyOk) {
    reasons.push(`qty: expected ${expected.qty} but parsed ${parsed.qty}`);
  }

  // ── Check 4: tier ──
  const tierOk = tierMatches(result.tier, expected.expected_tier);
  if (!tierOk) {
    reasons.push(`tier: expected ~${expected.expected_tier} but got ${result.tier}`);
  }

  // ── Check 5: confidence range ──
  const confOk = confidenceInRange(result.confidence, expected);
  if (!confOk) {
    const range = expected.expected_confidence_range
      ? `[${expected.expected_confidence_range[0]}, ${expected.expected_confidence_range[1]}]`
      : expected.expected_confidence != null
        ? `${expected.expected_confidence}`
        : "any";
    reasons.push(`confidence: expected ${range} but got ${result.confidence.toFixed(3)}`);
  }

  // ── Check 6: method (explainability) ──
  // Verifies that the engine's conceptual match method (exact/normalized/fuzzy/new)
  // is consistent with what the fixture expects. This catches regressions where
  // the engine picks the right product via the WRONG path (e.g. a byte-identical
  // case accidentally going through normalization, or a fuzzy case accidentally
  // hitting the exact path).
  const mOk = methodOk(result.method, expected.expected_tier);
  if (!mOk) {
    reasons.push(`method: expected one of ${JSON.stringify(expectedMethodsForTier(expected.expected_tier))} for tier "${expected.expected_tier}" but got "${result.method}"`);
  }

  // ── Check 7: evidence (multi-signal) ──
  // Computes the EXPECTED evidence using the same exported functions the engine
  // uses, then compares. This verifies the engine's evidence computation is
  // self-consistent — no hand-written expected values, all derived automatically.
  const matchedAliasObj = result.matchedAlias
    ? CATALOG.find((a) => a.alias === result.matchedAlias) || null
    : null;
  const expectedEvidence = computeExpectedEvidence(parsed.product, result, matchedAliasObj);
  const evidenceIssues = checkEvidence(result.evidence, expectedEvidence);
  for (const issue of evidenceIssues) reasons.push(issue);

  // ── Check 8: candidates array ──
  // Verifies the winner is candidates[0], candidates are sorted, and method-specific
  // count constraints hold. Supports the user's enterprise goal: "الاحتفاظ بكل
  // المرشحين" for employee review, AI training, active learning.
  const candidateIssues = checkCandidates(result);
  for (const issue of candidateIssues) reasons.push(issue);

  // ── Verdict ──
  const evidenceOk = evidenceIssues.length === 0;
  const candidatesOk = candidateIssues.length === 0;
  let verdict: Verdict;
  if (productOk && qtyOk && tierOk && confOk && mOk && evidenceOk && candidatesOk) {
    verdict = "PASS";
  } else if (productOk && qtyOk) {
    // Product + qty correct, but tier/confidence/method/evidence/candidates off → partial
    verdict = "PARTIAL";
  } else {
    verdict = "FAIL";
  }

  return {
    parsedQty: parsed.qty,
    parsedProduct: parsed.product,
    matchedProductId: result.productId,
    matchedProductName: result.productName,
    matchedAlias: result.matchedAlias,
    matchedArName: matchedProduct?.arName || null,
    confidence: result.confidence,
    tier: result.tier,
    action: result.action,
    method: result.method,
    rankScore: result.rankScore,
    normalizationSteps: result.normalizationSteps,
    fuzzyDistance: result.fuzzyDistance,
    confidenceBreakdown: result.confidenceBreakdown,
    evidence: result.evidence,
    candidates: result.candidates,
    candidateCount: result.candidates?.length ?? 0,
    verdict,
    reasons,
  };
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log("═".repeat(80));
  console.log("  GARFIX Invoice-Brain — 100-Case Bilingual Matching Test");
  console.log("═".repeat(80));

  // 1. Load test file
  const fs = await import("fs");
  const path = "/home/z/my-project/upload/garfix test invoices.json";
  const raw = fs.readFileSync(path, "utf-8");
  const data: TestFile = JSON.parse(raw);

  console.log(`\nLoaded: ${data.meta.total_cases} cases, ${data.product_catalog_seed.length} seed products`);
  console.log("Categories:", JSON.stringify(data.meta.category_counts));

  // 2. Seed catalog
  seedCatalog(data.product_catalog_seed);
  console.log(`\nSeeded in-memory catalog: ${CATALOG.length} aliases (${CATALOG.length / 2} products × 2 aliases)`);

  // 3. Patch db
  patchDb();
  invalidateKillSwitchCache();

  // 4. Run cases
  const results: CaseResult[] = [];
  const companySlug = "test-co";

  for (const tc of data.cases) {
    const parsedItems = parseLineItems(tc.raw_input_text);
    const itemResults: ItemResult[] = [];

    for (let i = 0; i < parsedItems.length; i++) {
      const parsed = parsedItems[i];
      const expected = tc.expected_items[i];
      if (!expected) {
        itemResults.push({
          parsedQty: parsed.qty,
          parsedProduct: parsed.product,
          matchedProductId: null,
          matchedProductName: null,
          matchedAlias: null,
          matchedArName: null,
          confidence: 0,
          tier: "new-product",
          action: "no-expected",
          method: null,
          rankScore: null,
          normalizationSteps: null,
          fuzzyDistance: null,
          confidenceBreakdown: null,
          evidence: null,
          candidates: null,
          candidateCount: 0,
          verdict: "FAIL",
          reasons: [`parsed item has no corresponding expected_item (parsed ${parsedItems.length} items, expected ${tc.expected_items.length})`],
        });
        continue;
      }

      const input: MatchInput = {
        description: parsed.product,
        qty: parsed.qty,
        price: 1,
        companySlug,
        invoiceId: "preview",
        lineItemIndex: i,
      };

      try {
        const result = await matchProduct(input);
        itemResults.push(evaluateItem(parsed, result, expected));
      } catch (err) {
        itemResults.push({
          parsedQty: parsed.qty,
          parsedProduct: parsed.product,
          matchedProductId: null,
          matchedProductName: null,
          matchedAlias: null,
          matchedArName: null,
          confidence: 0,
          tier: "error",
          action: "error",
          method: null,
          rankScore: null,
          normalizationSteps: null,
          fuzzyDistance: null,
          confidenceBreakdown: null,
          evidence: null,
          candidates: null,
          candidateCount: 0,
          verdict: "FAIL",
          reasons: [`matchProduct threw: ${err instanceof Error ? err.message : String(err)}`],
        });
      }
    }

    // Check for unparsed expected items (parser missed something)
    const notes: string[] = [];
    if (parsedItems.length < tc.expected_items.length) {
      notes.push(`parser extracted ${parsedItems.length} items but expected ${tc.expected_items.length}`);
    }

    // Case verdict = worst item verdict
    const caseVerdict: Verdict = itemResults.some((r) => r.verdict === "FAIL")
      ? "FAIL"
      : itemResults.some((r) => r.verdict === "PARTIAL")
        ? "PARTIAL"
        : "PASS";

    results.push({
      id: tc.id,
      type: tc.type,
      invoice_type: tc.invoice_type,
      raw_input_text: tc.raw_input_text,
      parsedItems,
      itemResults,
      caseVerdict,
      notes,
    });
  }

  restoreDb();

  // 5. Per-category report
  console.log("\n" + "═".repeat(80));
  console.log("  PER-CATEGORY RESULTS");
  console.log("═".repeat(80));

  const categories = Object.keys(data.meta.category_counts);
  const catStats: Record<string, { pass: number; partial: number; fail: number; total: number }> = {};

  for (const cat of categories) {
    const catResults = results.filter((r) => r.type === cat);
    const pass = catResults.filter((r) => r.caseVerdict === "PASS").length;
    const partial = catResults.filter((r) => r.caseVerdict === "PARTIAL").length;
    const fail = catResults.filter((r) => r.caseVerdict === "FAIL").length;
    catStats[cat] = { pass, partial, fail, total: catResults.length };
    const rate = ((pass / catResults.length) * 100).toFixed(0);
    const partialRate = (((pass + partial) / catResults.length) * 100).toFixed(0);
    console.log(
      `  ${cat.padEnd(28)} ${String(pass).padStart(2)}/${String(catResults.length).padStart(2)} pass  (${rate}% strict / ${partialRate}% with partials)  ${fail > 0 ? `❌ ${fail} fail` : "✅"}`,
    );
  }

  // 6. Overall
  const totalPass = results.filter((r) => r.caseVerdict === "PASS").length;
  const totalPartial = results.filter((r) => r.caseVerdict === "PARTIAL").length;
  const totalFail = results.filter((r) => r.caseVerdict === "FAIL").length;
  console.log("\n" + "─".repeat(80));
  console.log(`  OVERALL: ${totalPass}/100 PASS  |  ${totalPartial}/100 PARTIAL  |  ${totalFail}/100 FAIL`);
  console.log(`  Strict pass rate:    ${((totalPass / 100) * 100).toFixed(0)}%`);
  console.log(`  Lenient pass rate:   ${(((totalPass + totalPartial) / 100) * 100).toFixed(0)}% (pass + partial)`);
  console.log("─".repeat(80));

  // 7. List failures
  const failures = results.filter((r) => r.caseVerdict !== "PASS");
  if (failures.length > 0) {
    console.log(`\n${"═".repeat(80)}\n  NON-PASS CASES (${failures.length})\n${"═".repeat(80)}`);
    for (const r of failures) {
      console.log(`\n  Case ${r.id} [${r.type}] — ${r.caseVerdict}`);
      console.log(`    text: ${r.raw_input_text}`);
      console.log(`    parsed: ${JSON.stringify(r.parsedItems)}`);
      if (r.notes.length) console.log(`    notes: ${r.notes.join("; ")}`);
      for (const ir of r.itemResults) {
        if (ir.verdict !== "PASS") {
          console.log(`    item "${ir.parsedProduct}" (qty=${ir.parsedQty}): ${ir.verdict}`);
          console.log(`      matched: ${ir.matchedProductName || "null"} (id=${ir.matchedProductId}, ar=${ir.matchedArName || "null"}) conf=${ir.confidence.toFixed(3)} tier=${ir.tier} method=${ir.method || "?"}`);
          if (ir.confidenceBreakdown) {
            const bd = ir.confidenceBreakdown;
            console.log(`      breakdown: rawSim=${bd.rawSimilarity.toFixed(3)} normPenalty=${bd.normalizationPenalty.toFixed(3)} fuzzyCap=${bd.fuzzyCap.toFixed(2)} → final=${bd.finalConfidence.toFixed(3)}`);
          }
          if (ir.evidence) {
            const ev = ir.evidence;
            console.log(`      evidence: textSim=${ev.textSimilarity.toFixed(2)} alias=${ev.aliasMatch.toFixed(2)} brand=${ev.brandMatch?.toFixed(2) ?? "null"} cat=${ev.categoryMatch?.toFixed(2) ?? "null"} sem=${ev.semanticMatch ?? "null"} hist=${ev.historicalMatch?.toFixed(2) ?? "null"}`);
          }
          if (ir.candidates && ir.candidates.length > 0) {
            console.log(`      candidates (${ir.candidates.length}): ${ir.candidates.slice(0, 3).map(c => `#${c.productId}(${c.rankScore.toFixed(2)})`).join(" > ")}${ir.candidates.length > 3 ? " ..." : ""}`);
          }
          if (ir.normalizationSteps && ir.normalizationSteps.length > 0) {
            console.log(`      normSteps: [${ir.normalizationSteps.join(", ")}]  fuzzyDist=${ir.fuzzyDistance ?? 0}  rankScore=${ir.rankScore?.toFixed(3) ?? "?"}`);
          }
          for (const reason of ir.reasons) console.log(`      → ${reason}`);
        }
      }
    }
  }

  // 7b. Method distribution (explainability analytics)
  const methodCounts: Record<string, number> = {};
  for (const r of results) {
    for (const ir of r.itemResults) {
      const m = ir.method || "unknown";
      methodCounts[m] = (methodCounts[m] || 0) + 1;
    }
  }
  console.log(`\n${"─".repeat(80)}`);
  console.log("  MATCH METHOD DISTRIBUTION (explainability)");
  console.log("─".repeat(80));
  for (const [m, count] of Object.entries(methodCounts).sort((a, b) => b[1] - a[1])) {
    const pct = ((count / 100) * 100).toFixed(0);
    console.log(`  ${m.padEnd(14)} ${String(count).padStart(3)} cases  (${pct}%)`);
  }

  // 7c. Evidence signal summary (multi-signal analytics)
  const evStats = { brandDetected: 0, brandMatched: 0, catMatched: 0, catNull: 0, histVerified: 0, histNull: 0 };
  let totalCandidates = 0;
  let maxCandidates = 0;
  for (const r of results) {
    for (const ir of r.itemResults) {
      if (!ir.evidence) continue;
      if (ir.evidence.brandMatch !== null) { evStats.brandDetected++; if (ir.evidence.brandMatch > 0) evStats.brandMatched++; }
      if (ir.evidence.categoryMatch !== null) { if (ir.evidence.categoryMatch > 0) evStats.catMatched++; } else { evStats.catNull++; }
      if (ir.evidence.historicalMatch !== null) { if (ir.evidence.historicalMatch >= 1.0) evStats.histVerified++; } else { evStats.histNull++; }
      if (ir.candidateCount) { totalCandidates += ir.candidateCount; maxCandidates = Math.max(maxCandidates, ir.candidateCount); }
    }
  }
  console.log(`\n${"─".repeat(80)}`);
  console.log("  EVIDENCE SIGNAL SUMMARY (multi-signal analytics)");
  console.log("─".repeat(80));
  console.log(`  brand detected:   ${evStats.brandDetected} cases (${evStats.brandMatched} matched)`);
  console.log(`  category matched: ${evStats.catMatched} cases (${evStats.catNull} null = undeterminable)`);
  console.log(`  historical:       ${evStats.histVerified} verified (${evStats.histNull} null = no alias)`);
  console.log(`  candidates:       ${totalCandidates} total retained (max ${maxCandidates} per case, top ${5})`);

  // 8. Write JSON report
  const report = {
    generatedAt: new Date().toISOString(),
    summary: {
      total: 100,
      pass: totalPass,
      partial: totalPartial,
      fail: totalFail,
      strictPassRate: parseFloat(((totalPass / 100) * 100).toFixed(1)),
      lenientPassRate: parseFloat((((totalPass + totalPartial) / 100) * 100).toFixed(1)),
    },
    perCategory: catStats,
    cases: results,
  };
  const reportPath = "/home/z/my-project/test-results-invoice-brain-100.json";
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf-8");
  console.log(`\n📄 Full JSON report: ${reportPath}`);

  console.log("\n" + "═".repeat(80));
  console.log("  Done.");
  console.log("═".repeat(80));
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});

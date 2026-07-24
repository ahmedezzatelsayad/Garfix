/**
 * productMatcher.ts — Bilingual product matching with explainable confidence.
 *
 * Matching pipeline (fastest first):
 *   1. Exact alias match (instant, confidence 1.0, method="exact")
 *   2. Normalized exact match (Arabic normalization, method="normalized",
 *      confidence = 1.0 - normalizationPenalty, capped at 0.99)
 *   3. Fuzzy match (bigram Jaccard prefilter → Levenshtein + multiset Jaccard)
 *      method="fuzzy", confidence = min(levScore, 0.88)
 *      3a. If 0.70 ≤ rankScore < 0.85 → AI Resolver tier (Task 17):
 *          - Audit row created synchronously with action="ai-queued-for-review".
 *          - AI job enqueued ASYNCHRONOUSLY (after the tx commits, via setImmediate)
 *            so the invoice flow is NOT blocked waiting on the AI provider.
 *          - The matcher returns "new-product" for this line (safe default —
 *            avoids decrementing the wrong product's inventory before AI decides).
 *   4. No match → new product (confidence 0.0, method="new")
 *
 * ════════════════════════════════════════════════════════════════════════════
 *  CONFIDENCE MODEL (v2 — explainable, cost-based, split into components)
 * ════════════════════════════════════════════════════════════════════════════
 *
 *  Confidence is now split into 4 explainable components exposed via
 *  `confidenceBreakdown` on every MatchResult:
 *
 *    rawSimilarity         Levenshtein similarity of the NORMALIZED strings.
 *                          1.0 for exact / normalized-exact (strings equal
 *                          after normalization). <1.0 for fuzzy matches.
 *
 *    normalizationPenalty  Additive penalty for normalization steps that were
 *                          REQUIRED to make the match work. Only non-zero on
 *                          Path 2 (normalized-exact) — on Path 3 (fuzzy) the
 *                          normalization is already baked into rawSimilarity,
 *                          so we don't double-count.
 *                          0.00  no cost-bearing step (only case/whitespace)
 *                          0.02  diacritics stripped (tashkeel/tatweel)
 *                          0.02  non-word chars removed
 *                          0.04  alef variants unified (أإآٱ → ا)
 *                          0.04  taa marbuta → ha (ة → ه)
 *                          0.04  alef maqsura → ya (ى → ي)
 *                          0.04  waw hamza → waw (ؤ → و)
 *                          0.04  standalone hamza removed (ء)
 *                          0.06  "ال" definite-article prefix stripped
 *                          The penalty = 1.0 - min(inputCost, aliasCost), i.e.
 *                          the MOST aggressive step that fired on either side.
 *
 *    fuzzyCap              The maximum confidence allowed for this path.
 *                          1.0  for exact / normalized (no cap)
 *                          0.88 for fuzzy (a fuzzy match is never as certain
 *                               as an exact match — encodes the user's
 *                               "Needed Levenshtein → 0.88" rule)
 *
 *    finalConfidence       The reported confidence:
 *                          Path 1: 1.0
 *                          Path 2: min(0.99, 1.0 - normalizationPenalty)
 *                                  (0.99 cap distinguishes from Path 1)
 *                          Path 3: min(rawSimilarity, 0.88)
 *                          Path 4: 0.0
 *
 *  RANKING vs REPORTING:
 *    rankScore    → used for candidate SELECTION and tier thresholding
 *                   (auto-match ≥0.85, suggested ≥0.70). For fuzzy this is
 *                   max(levScore, msJaccard) — keeps product selection
 *                   identical to the old engine (same product wins).
 *    confidence   → the reported finalConfidence (for display + audit).
 *                   May be LOWER than rankScore (e.g. transposition:
 *                   rankScore=1.0 via msJaccard, confidence=0.80 via Lev).
 *
 *  This split mirrors how professional search systems work: the ranking
 *  score picks the winner, the reported confidence tells the user how
 *  much to trust it.
 *
 * Kill-switch: if feature flag "product-auto-matching" is OFF, ALL matches
 * go to the review queue (no auto-matching), regardless of confidence.
 */

import { db } from "./db";
import { logger } from "./logger";
import { num } from "./money";
import { enqueueBackground, QUEUE_NAMES } from "./queues";
import { AI_PRODUCT_MATCH_JOB_TYPE } from "./workers/aiProductMatchWorker";

// ─── Arabic normalization (with confidence cost) ───────────────────────────
//
// Each cost-bearing step has a COST (multiplicative, ∈ [0.94, 1.0]) and a
// PENALTY (additive, = 1.0 - cost). The penalty is what gets subtracted
// from rawSimilarity in the confidence formula. Both views are exposed so
// the caller can use whichever mental model they prefer.

function toAsciiNum(s: string): string {
  return s.replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)));
}

/** Cost tier for each normalization step (multiplicative). */
const NORM_COST = {
  diacritics: 0.98,     // tashkeel + tatweel
  nonWord: 0.98,        // punctuation / symbols
  alefVariants: 0.96,   // أ إ آ ٱ → ا
  taaMarbuta: 0.96,     // ة → ه
  alefMaqsura: 0.96,    // ى → ي
  wawHamza: 0.96,       // ؤ → و
  hamza: 0.96,          // ء → (removed)
  alPrefix: 0.94,       // leading "ال" definite article
} as const;

/** Additive penalty for each step (= 1.0 - cost). */
function costToPenalty(cost: number): number {
  return Math.round((1.0 - cost) * 1000) / 1000; // round to avoid float drift
}

export interface NormalizationResult {
  normalized: string;
  /** Multiplicative cost ∈ [0.94, 1.0]. 1.0 if no cost-bearing step fired. */
  cost: number;
  /** Additive penalty ∈ [0, 0.06]. = 1.0 - cost. */
  penalty: number;
  /** Which cost-bearing steps fired (e.g. ["al-prefix", "alef-variants"]). */
  steps: string[];
}

export function normalizeArabicWithCost(text: string): NormalizationResult {
  if (!text) return { normalized: "", cost: 1.0, penalty: 0.0, steps: [] };
  let s = text;
  let cost = 1.0;
  const steps: string[] = [];

  // Zero-cost: Arabic-Indic digits → ASCII
  s = toAsciiNum(s);
  // Zero-cost: lowercase + trim
  s = s.toLowerCase().trim();

  // Cost 0.98: diacritics (tashkeel) + tatweel
  const afterDiac = s.replace(/[\u064B-\u065F\u0670\u0640]/g, "");
  if (afterDiac !== s) { steps.push("diacritics"); cost = Math.min(cost, NORM_COST.diacritics); }
  s = afterDiac;

  // Cost 0.96: alef variants → ا
  const afterAlef = s.replace(/[أإآٱ]/g, "ا");
  if (afterAlef !== s) { steps.push("alef-variants"); cost = Math.min(cost, NORM_COST.alefVariants); }
  s = afterAlef;

  // Cost 0.96: taa marbuta → ه
  const afterTaa = s.replace(/ة/g, "ه");
  if (afterTaa !== s) { steps.push("taa-marbuta"); cost = Math.min(cost, NORM_COST.taaMarbuta); }
  s = afterTaa;

  // Cost 0.96: alef maqsura → ي
  const afterMaq = s.replace(/ى/g, "ي");
  if (afterMaq !== s) { steps.push("alef-maqsura"); cost = Math.min(cost, NORM_COST.alefMaqsura); }
  s = afterMaq;

  // Cost 0.96: waw hamza → و
  const afterWaw = s.replace(/ؤ/g, "و");
  if (afterWaw !== s) { steps.push("waw-hamza"); cost = Math.min(cost, NORM_COST.wawHamza); }
  s = afterWaw;

  // Cost 0.96: standalone hamza removed
  const afterHamza = s.replace(/ء/g, "");
  if (afterHamza !== s) { steps.push("hamza"); cost = Math.min(cost, NORM_COST.hamza); }
  s = afterHamza;

  // Zero-cost: whitespace collapse
  s = s.replace(/\s+/g, " ");

  // Cost 0.94: "ال" definite-article prefix
  const afterAl = s.replace(/^ال/, "");
  if (afterAl !== s) { steps.push("al-prefix"); cost = Math.min(cost, NORM_COST.alPrefix); }
  s = afterAl;

  // Cost 0.98: non-word chars (punctuation, symbols)
  const afterNonWord = s.replace(/[^\w\u0600-\u06FF\s]/g, "");
  if (afterNonWord !== s) { steps.push("non-word"); cost = Math.min(cost, NORM_COST.nonWord); }
  s = afterNonWord;

  s = s.trim();

  return { normalized: s, cost, penalty: costToPenalty(cost), steps };
}

/** Backward-compatible wrapper: returns just the normalized string. */
export function normalizeArabic(text: string): string {
  return normalizeArabicWithCost(text).normalized;
}

/** @deprecated Use normalizeArabicWithCost. Kept for backward compat (8 files). */
export type NormalizationCost = NormalizationResult;

// ─── Levenshtein distance ──────────────────────────────────────────────────

function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) dp[i][j] = dp[i - 1][j - 1];
      else dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

function similarity(a: string, b: string): number {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1.0;
  return 1.0 - levenshtein(a, b) / maxLen;
}

// ─── Bigram Jaccard (prefilter) ────────────────────────────────────────────

function bigrams(s: string): Set<string> {
  if (s.length < 2) return new Set(s.length === 1 ? [s] : []);
  const set = new Set<string>();
  for (let i = 0; i < s.length - 1; i++) set.add(s.slice(i, i + 2));
  return set;
}

function bigramJaccard(a: string, b: string): number {
  const ba = bigrams(a);
  const bb = bigrams(b);
  if (ba.size === 0 && bb.size === 0) return 1.0;
  if (ba.size === 0 || bb.size === 0) return 0.0;
  let intersection = 0;
  for (const g of ba) if (bb.has(g)) intersection++;
  const union = ba.size + bb.size - intersection;
  return intersection / union;
}

const PREFILTER_BIGRAM_THRESHOLD = 0.3;

// ─── Multiset Jaccard (order-insensitive scoring) ──────────────────────────

function multisetJaccard(a: string, b: string): number {
  const ma = new Map<string, number>();
  const mb = new Map<string, number>();
  for (const c of a.replace(/\s/g, "")) ma.set(c, (ma.get(c) ?? 0) + 1);
  for (const c of b.replace(/\s/g, "")) mb.set(c, (mb.get(c) ?? 0) + 1);
  if (ma.size === 0 && mb.size === 0) return 1.0;
  if (ma.size === 0 || mb.size === 0) return 0.0;
  let intersection = 0;
  for (const [c, n] of ma) intersection += Math.min(n, mb.get(c) ?? 0);
  const totalA = [...ma.values()].reduce((s, n) => s + n, 0);
  const totalB = [...mb.values()].reduce((s, n) => s + n, 0);
  const union = totalA + totalB - intersection;
  return union === 0 ? 0 : intersection / union;
}

// ─── Brand extraction (automotive domain) ─────────────────────────────────
//
// ProductCatalog has no explicit `brand` column, so we extract brand tokens
// from the product name/alias text. This is domain-specific knowledge for the
// auto-parts catalog — the dictionary covers the brands that appear in the
// GarfiX test fixtures + common real-world automotive brands.
//
// Each entry maps a surface form (Arabic OR English) → canonical brand ID.
// extractBrands() returns the SET of canonical brand IDs found in the text.

const BRAND_DICTIONARY: Record<string, string> = {
  // Arabic surface forms
  "تويوتا": "toyota",
  "نيسان": "nissan",
  "هيونداي": "hyundai",
  "كيا": "kia",
  "مرسيدس": "mercedes",
  "بي ام دبليو": "bmw",
  "بوش": "bosch",
  "دينيسو": "denso",
  "فال": "valeo",
  // English surface forms (lowercased — extractBrands normalizes first)
  "toyota": "toyota",
  "nissan": "nissan",
  "hyundai": "hyundai",
  "kia": "kia",
  "mercedes": "mercedes",
  "bmw": "bmw",
  "bosch": "bosch",
  "denso": "denso",
  "valeo": "valeo",
  "ngk": "ngk",
  "acdelco": "acdelco",
  "mobil": "mobil",
  "castrol": "castrol",
  "valvoline": "valvoline",
  "total": "total",
};

/**
 * Extract brand tokens from text. Returns a set of canonical brand IDs.
 * Uses substring matching (safe because brand tokens like "تويوتا" / "ngk"
 * are distinctive enough that they won't appear as substrings of other words).
 */
export function extractBrands(text: string): Set<string> {
  if (!text) return new Set();
  const normalized = normalizeArabic(text);
  const found = new Set<string>();
  for (const [surface, canonical] of Object.entries(BRAND_DICTIONARY)) {
    if (normalized.includes(surface)) found.add(canonical);
  }
  return found;
}

// ─── Category derivation (from product name keywords) ──────────────────────
//
// ProductCatalog has no `category` column, so we derive a coarse category from
// the product name using keyword patterns. This gives us a category signal for
// the evidence score without requiring a schema migration.
//
// Returns the FIRST matching category (a product can belong to multiple
// conceptually — e.g. "فلتر زيت تويوتا" is both filter+oil — but for evidence
// purposes the primary category is sufficient).

const CATEGORY_PATTERNS: [RegExp, string][] = [
  [/فلتر|filter/i, "filter"],
  [/زيت محرك|engine oil|motor oil/i, "engine-oil"],
  [/زيت|oil/i, "oil"],
  [/بطارية|battery/i, "battery"],
  [/سير|belt/i, "belt"],
  [/فرامل|brake/i, "brake"],
  [/كويل|coil/i, "coil"],
  [/مساعد|shock|absorber/i, "shock-absorber"],
  [/كمبروسر|compressor/i, "compressor"],
  [/رديتر|radiator/i, "radiator"],
  [/طرمبة|pump/i, "pump"],
  [/كلتش|clutch/i, "clutch"],
  [/شمعات|spark|plug/i, "spark-plug"],
];

/**
 * Derive a coarse category from product text. Returns null if no pattern matches.
 * Exported for test use (evidence values must be derived automatically, not
 * hand-written — per user requirement).
 */
export function deriveCategory(text: string): string | null {
  if (!text) return null;
  const normalized = normalizeArabic(text);
  for (const [pattern, cat] of CATEGORY_PATTERNS) {
    if (pattern.test(normalized)) return cat;
  }
  return null;
}

// ─── Types ──────────────────────────────────────────────────────────────────

export type MatchTier = "auto-match" | "suggested" | "new-product" | "collision-recovery-failed";

/**
 * Conceptual match method — HOW the match was achieved (independent of the
 * action tier). Used for explainability + audit analytics.
 *   "exact"      → Path 1: byte-identical alias lookup (no normalization)
 *   "normalized" → Path 2: match only after Arabic normalization
 *   "fuzzy"      → Path 3: Levenshtein/multiset fuzzy match
 *   "new"        → Path 4: no match found (new product)
 */
export type MatchMethod = "exact" | "normalized" | "fuzzy" | "new";

/**
 * Full confidence breakdown — exposed on every MatchResult so the caller can
 * explain WHY the confidence is what it is (for UI, audit, AI training).
 *
 * Formula: finalConfidence = min(rawSimilarity - normalizationPenalty, fuzzyCap)
 *   - Path 1 (exact):      rawSim=1.0, penalty=0.0, cap=1.0   → 1.0
 *   - Path 2 (normalized): rawSim=1.0, penalty=0.06, cap=0.99 → 0.94  (ال case)
 *   - Path 3 (fuzzy):      rawSim=0.80, penalty=0.0, cap=0.88 → 0.80  (transposition)
 *   - Path 4 (new):        rawSim=0.0, penalty=0.0, cap=1.0   → 0.0
 */
export interface ConfidenceBreakdown {
  /** Levenshtein similarity of NORMALIZED strings. 1.0 for exact/normalized-exact. */
  rawSimilarity: number;
  /** Additive penalty for normalization steps (only non-zero on Path 2). ∈ [0, 0.06]. */
  normalizationPenalty: number;
  /** Maximum confidence allowed for this path. 1.0 for exact/normalized, 0.88 for fuzzy. */
  fuzzyCap: number;
  /** The final reported confidence = min(rawSimilarity - normalizationPenalty, fuzzyCap). */
  finalConfidence: number;
}

/**
 * Multi-signal evidence breakdown — each signal is a separate piece of evidence
 * that contributed to the final confidence. This mirrors how enterprise search
 * engines and product matching systems work (e.g. e-commerce catalog matching).
 *
 * Each signal ∈ [0, 1] OR null:
 *   - null  = signal not applicable / not computable for this match
 *   - 0     = signal computed, found NO match
 *   - 0-1   = signal computed, partial/full match
 *
 * The FINAL confidence is NOT a simple sum/average of these signals — it's
 * driven by the match path (exact/normalized/fuzzy). The evidence array is
 * EXPLAINABILITY metadata: it tells you WHICH signals agreed and which didn't.
 * Future versions may weight these signals into the final confidence.
 */
export interface MatchEvidence {
  /** Raw Levenshtein similarity of normalized strings. Always computed. ∈ [0, 1]. */
  textSimilarity: number;
  /**
   * Alias match quality: how well the alias itself matched.
   *   1.0 = exact byte-identical alias
   *   0.94-0.99 = normalized match (Arabic normalization applied)
   *   levScore = fuzzy alias match
   *   0 = no alias matched (new product)
   */
  aliasMatch: number;
  /**
   * Brand token overlap between input and matched alias.
   *   null = no brand detected in either string (not applicable)
   *   0   = brand in one but not the other (brand mismatch)
   *   1.0 = same brand in both
   */
  brandMatch: number | null;
  /**
   * Category match (derived from product name keywords — ProductCatalog has no
   * explicit category column, so we derive a coarse category).
   *   null = no category derivable from either string
   *   0   = different categories
   *   1.0 = same category
   */
  categoryMatch: number | null;
  /**
   * Semantic similarity via embeddings. ALWAYS null in current implementation —
   * requires an embeddings layer (future enhancement). Exposed here so the
   * evidence structure is ready when embeddings are added.
   */
  semanticMatch: null;
  /**
   * Historical confirmation: based on whether the matched alias was previously
   * verified by a human or AI.
   *   null  = no alias matched
   *   1.0   = alias.isVerified = true (human-confirmed)
   *   0.7   = alias.source = "ai" (AI-auto-linked with high confidence)
   *   0.5   = alias.source = "system" (auto-learned, unverified)
   */
  historicalMatch: number | null;
}

/**
 * A single ranked candidate in the candidates array. The winner is candidates[0]
 * when a match was found. Each candidate carries enough info for the review
 * queue / AI training / active learning without re-querying the database.
 */
export interface MatchCandidate {
  productId: number;
  productName: string;
  matchedAlias: string;
  /** Selection score (max(levScore, msJaccard) for fuzzy; 1.0 for exact/normalized). */
  rankScore: number;
  /** Reported confidence = min(rankScore, pathCap). May be < rankScore. */
  confidence: number;
  /** How this candidate was matched (exact/normalized/fuzzy). */
  method: MatchMethod;
  /** Levenshtein edit distance (0 for exact/normalized). */
  fuzzyDistance: number;
}

// ─── Enterprise v4: weighted evidence scoring + feature flags ──────────────
//
// The user's proposed Enterprise weighting model:
//   Final Score = 0.45·Text + 0.20·Brand + 0.15·Category + 0.15·Historical + 0.05·Semantic
//
// We implement this as a SUPPLEMENTARY `evidenceScore` field (not replacing the
// honest path-based `confidence`). This preserves the Ranking-vs-Reporting split:
//   - confidence    = honest textual confidence (exact=1.0, normalized≤0.99, fuzzy≤0.88)
//   - evidenceScore = weighted multi-signal combination (can be higher when
//                     brand+category+history all agree, lower when they disagree)
// Both are exposed so the caller can use either lens for tier decisions.

/**
 * Per-signal weights for the evidenceScore weighted combination.
 * Defaults mirror the user's proposed Enterprise weighting. Configurable per-
 * tenant via PlatformSetting (key: product.matching.{slug}.weights).
 */
export interface EvidenceWeights {
  text: number;
  brand: number;
  category: number;
  historical: number;
  semantic: number;
}

export const DEFAULT_EVIDENCE_WEIGHTS: EvidenceWeights = {
  text: 0.45,
  brand: 0.20,
  category: 0.15,
  historical: 0.15,
  semantic: 0.05,
};

/**
 * Per-signal feature flags — toggle which signals contribute to evidenceScore
 * and reasons. Defaults keep all signals ON except semantic (which requires an
 * embeddings provider not yet wired). Configurable per-tenant via
 * PlatformSetting (key: product.matching.{slug}.flags).
 */
export interface SignalFlags {
  text: boolean;
  brand: boolean;
  category: boolean;
  historical: boolean;
  semantic: boolean;
}

export const DEFAULT_SIGNAL_FLAGS: SignalFlags = {
  text: true,
  brand: true,
  category: true,
  historical: true,
  semantic: false,
};

export interface MatchResult {
  // ── Core fields (backward compatible — all existing consumers use these) ──
  productId: number | null;
  productName: string | null;
  matchedAlias: string | null;
  confidence: number;
  tier: MatchTier;
  action: "auto-matched" | "queued-for-review" | "auto-created" | "ai-auto-matched" | "ai-auto-created" | "ai-queued-for-review" | "collision-recovery-skipped";
  isNewProduct: boolean;
  // ── Explainability fields (v2 — for UI, audit analytics, AI training) ──
  /** Conceptual method: how the match was achieved (exact/normalized/fuzzy/new). */
  method: MatchMethod;
  /** Selection score (for fuzzy: max(levScore, msJaccard)). May differ from confidence. */
  rankScore: number;
  /** Full confidence breakdown (rawSimilarity, normalizationPenalty, fuzzyCap, finalConfidence). */
  confidenceBreakdown: ConfidenceBreakdown;
  /** Which normalization steps fired on the INPUT (e.g. ["al-prefix", "alef-variants"]). */
  normalizationSteps: string[];
  /** Levenshtein edit distance between normalized input and matched alias. 0 for exact/normalized. */
  fuzzyDistance: number;
  // ── Enterprise fields (v3 — multi-signal evidence + candidate ranking) ──
  /** Multi-signal evidence breakdown (textSimilarity, aliasMatch, brandMatch, categoryMatch, semanticMatch, historicalMatch). */
  evidence: MatchEvidence;
  /** Top-N ranked candidates (winner = candidates[0] when productId !== null). Empty for new-product with no candidates. */
  candidates: MatchCandidate[];
  // ── Enterprise v4 fields (weighted scoring + explain API + feature flags) ──
  /** Weighted multi-signal evidence score ∈ [0,1]. Supplementary to `confidence` — combines all enabled evidence signals. */
  evidenceScore: number;
  /** Human-readable reasons explaining the match decision (Explain API). Each is a single factual statement. */
  reasons: string[];
  /** The weights used to compute evidenceScore (for audit/transparency). */
  weights: EvidenceWeights;
  /** Which signals were enabled for this match (for audit/transparency). */
  signalFlags: SignalFlags;
}

export interface MatchInput {
  description: string;
  qty: number;
  price: number;
  companySlug: string;
  invoiceId: number | "preview";
  lineItemIndex?: number;
}

// ─── Per-tenant configurable thresholds + kill-switch ──────────────────────

export const DEFAULT_AUTO_MATCH_THRESHOLD = 0.85;
export const DEFAULT_SUGGESTED_THRESHOLD = 0.70;

/** Fuzzy matches are capped at this confidence (never as certain as exact). */
const FUZZY_CONFIDENCE_CAP = 0.88;

interface TenantConfig {
  autoMatchThreshold: number;
  suggestedThreshold: number;
  autoMatchingEnabled: boolean;
  evidenceWeights: EvidenceWeights;
  signalFlags: SignalFlags;
}

let configCache: Map<string, { config: TenantConfig; expiry: number }> = new Map();

async function getTenantConfig(companySlug: string): Promise<TenantConfig> {
  const cached = configCache.get(companySlug);
  if (cached && Date.now() < cached.expiry) return cached.config;

  const flag = await db.featureFlag.findUnique({ where: { key: "product-auto-matching" } });
  const autoMatchingEnabled = flag ? flag.isActive : true;

  const settings = await db.platformSettings.findMany({
    where: { key: { startsWith: `product.matching.${companySlug}.` } },
  });

  let autoMatchThreshold = DEFAULT_AUTO_MATCH_THRESHOLD;
  let suggestedThreshold = DEFAULT_SUGGESTED_THRESHOLD;
  let evidenceWeights = { ...DEFAULT_EVIDENCE_WEIGHTS };
  let signalFlags = { ...DEFAULT_SIGNAL_FLAGS };

  for (const s of settings) {
    try {
      const val = JSON.parse(s.value);
      if (s.key.endsWith(".autoThreshold") && typeof val === "number") autoMatchThreshold = val;
      else if (s.key.endsWith(".suggestedThreshold") && typeof val === "number") suggestedThreshold = val;
      else if (s.key.endsWith(".weights") && typeof val === "object" && val !== null) {
        // Merge provided weights over defaults (only known keys, clamped to [0,1])
        for (const k of Object.keys(DEFAULT_EVIDENCE_WEIGHTS) as (keyof EvidenceWeights)[]) {
          if (typeof val[k] === "number" && val[k] >= 0 && val[k] <= 1) evidenceWeights[k] = val[k];
        }
      } else if (s.key.endsWith(".flags") && typeof val === "object" && val !== null) {
        // Merge provided flags over defaults
        for (const k of Object.keys(DEFAULT_SIGNAL_FLAGS) as (keyof SignalFlags)[]) {
          if (typeof val[k] === "boolean") signalFlags[k] = val[k];
        }
      }
    } catch { /* skip */ }
  }

  const config: TenantConfig = { autoMatchThreshold, suggestedThreshold, autoMatchingEnabled, evidenceWeights, signalFlags };
  configCache.set(companySlug, { config, expiry: Date.now() + 60_000 });
  return config;
}

export function invalidateKillSwitchCache(companySlug?: string): void {
  if (companySlug) configCache.delete(companySlug);
  else configCache.clear();
}

// ─── Confidence breakdown builders ──────────────────────────────────────────

function exactBreakdown(): ConfidenceBreakdown {
  return { rawSimilarity: 1.0, normalizationPenalty: 0.0, fuzzyCap: 1.0, finalConfidence: 1.0 };
}

function normalizedBreakdown(penalty: number): ConfidenceBreakdown {
  // Path 2: rawSim=1.0 (strings equal after normalization), penalty from steps,
  // capped at 0.99 to distinguish from Path 1 (byte-identical → 1.0).
  const final = Math.min(0.99, 1.0 - penalty);
  return { rawSimilarity: 1.0, normalizationPenalty: penalty, fuzzyCap: 1.0, finalConfidence: final };
}

function fuzzyBreakdown(rawSimilarity: number): ConfidenceBreakdown {
  // Path 3: normalization already baked into rawSimilarity (we compared
  // normalized strings), so penalty=0. Capped at FUZZY_CONFIDENCE_CAP.
  const final = Math.min(rawSimilarity, FUZZY_CONFIDENCE_CAP);
  return { rawSimilarity, normalizationPenalty: 0.0, fuzzyCap: FUZZY_CONFIDENCE_CAP, finalConfidence: final };
}

function newBreakdown(): ConfidenceBreakdown {
  return { rawSimilarity: 0.0, normalizationPenalty: 0.0, fuzzyCap: 1.0, finalConfidence: 0.0 };
}

// ─── Evidence computation (multi-signal) ───────────────────────────────────
//
// Each function computes ONE evidence signal. They're all exported so the test
// script can derive expected values automatically (user requirement: "القيم
// مشتقة آليًا من سياسة المطابقة وليست مكتوبة يدويًا").

/** Brand match: Jaccard overlap of brand token sets. null if no brands detected. */
export function computeBrandMatch(inputBrands: Set<string>, aliasBrands: Set<string>): number | null {
  if (inputBrands.size === 0 && aliasBrands.size === 0) return null; // no brand in either
  if (inputBrands.size === 0 || aliasBrands.size === 0) return 0;     // brand in one only = mismatch
  let intersection = 0;
  for (const b of inputBrands) if (aliasBrands.has(b)) intersection++;
  const union = inputBrands.size + aliasBrands.size - intersection;
  return union === 0 ? null : intersection / union;
}

/** Category match: 1.0 same, 0 different, null if either category undeterminable. */
export function computeCategoryMatch(inputCat: string | null, aliasCat: string | null): number | null {
  if (!inputCat || !aliasCat) return null;
  return inputCat === aliasCat ? 1.0 : 0.0;
}

/**
 * Historical match: based on the matched alias's verification status.
 *   1.0 = isVerified=true (human-confirmed)
 *   0.7 = source="ai" (AI-auto-linked)
 *   0.5 = source="system" or other (auto-learned, unverified)
 *   null = no alias matched
 */
export function computeHistoricalMatch(alias: { isVerified?: boolean; source?: string } | null): number | null {
  if (!alias) return null;
  if (alias.isVerified) return 1.0;
  if (alias.source === "ai") return 0.7;
  return 0.5;
}

/** Maximum number of candidates to retain in the candidates[] array. */
const MAX_CANDIDATES = 5;

/**
 * Compute the full evidence object from the match context.
 *
 * @param inputText       The raw input description (before normalization)
 * @param matchedAliasObj The matched alias row (with isVerified, source, product) or null
 * @param rawSimilarity   Levenshtein similarity of normalized strings
 * @param aliasMatch      Alias match quality (1.0 exact, cost-based normalized, levScore fuzzy, 0 new)
 */
function computeEvidence(
  inputText: string,
  matchedAliasObj: { alias: string; isVerified?: boolean; source?: string; product?: { category?: string } } | null,
  rawSimilarity: number,
  aliasMatch: number,
): MatchEvidence {
  const inputBrands = extractBrands(inputText);
  const aliasBrands = matchedAliasObj ? extractBrands(matchedAliasObj.alias) : new Set<string>();

  // Category: prefer explicit product.category if available, else derive from name
  const inputCat = matchedAliasObj?.product?.category ?? deriveCategory(inputText);
  const aliasCat = matchedAliasObj?.product?.category ?? (matchedAliasObj ? deriveCategory(matchedAliasObj.alias) : null);

  return {
    textSimilarity: rawSimilarity,
    aliasMatch,
    brandMatch: computeBrandMatch(inputBrands, aliasBrands),
    categoryMatch: computeCategoryMatch(inputCat, aliasCat),
    semanticMatch: null, // not yet implemented — requires embeddings layer
    historicalMatch: computeHistoricalMatch(matchedAliasObj),
  };
}

// ─── Enterprise v4: weighted evidence score + explain API ───────────────────

/**
 * Compute the weighted evidence score from the evidence signals.
 *
 * Only ENABLED signals (per SignalFlags) contribute. The weights of disabled
 * signals are redistributed proportionally to the enabled ones, so the total
 * always sums to 1.0 over the active signals. null signals contribute 0 (they
 * were computed but found nothing, or were not applicable).
 *
 * Returns ∈ [0, 1]. This is a SUPPLEMENTARY decision score — the primary
 * `confidence` remains the honest path-based value. evidenceScore can be higher
 * (when brand+category+history agree) or lower (when they disagree) than
 * confidence, giving the caller a second lens to judge match quality.
 */
export function computeEvidenceScore(
  evidence: MatchEvidence,
  weights: EvidenceWeights,
  flags: SignalFlags,
): number {
  const signals: [number | null, boolean, number][] = [
    [evidence.textSimilarity, flags.text, weights.text],
    [evidence.brandMatch, flags.brand, weights.brand],
    [evidence.categoryMatch, flags.category, weights.category],
    [evidence.historicalMatch, flags.historical, weights.historical],
    [evidence.semanticMatch, flags.semantic, weights.semantic],
  ];
  let weightedSum = 0;
  let activeWeight = 0;
  for (const [value, enabled, weight] of signals) {
    if (!enabled) continue;
    activeWeight += weight;
    if (value !== null) weightedSum += value * weight;
  }
  if (activeWeight === 0) return 0;
  return weightedSum / activeWeight; // normalize so active weights sum to 1.0
}

/** Params for buildReasons — the pieces needed to explain a match decision. */
export interface BuildReasonsParams {
  method: MatchMethod;
  confidence: number;
  fuzzyDistance: number;
  normalizationSteps: string[];
  evidence: MatchEvidence;
  breakdown: ConfidenceBreakdown;
  learnedFromOverride?: boolean;
}

/**
 * Build human-readable reason strings explaining the match decision.
 * Used by the Explain API — the UI shows these to employees so they understand
 * WHY the matcher chose this product. Each reason is a single factual statement.
 *
 * Bilingual-friendly: reasons are in English (the admin/audit language); the UI
 * layer can translate them if needed. Brand/category tokens are inserted raw.
 */
export function buildReasons(params: BuildReasonsParams): string[] {
  const { method, confidence, fuzzyDistance, normalizationSteps, evidence, breakdown, learnedFromOverride } = params;
  const reasons: string[] = [];

  // 1. Match method (the "how")
  switch (method) {
    case "exact":
      reasons.push("Exact alias match (byte-identical, no normalization needed)");
      break;
    case "normalized":
      if (normalizationSteps.length > 0) {
        reasons.push(`Normalized match — applied: ${normalizationSteps.join(", ")} (penalty ${breakdown.normalizationPenalty.toFixed(2)})`);
      } else {
        reasons.push("Normalized match (case/whitespace only)");
      }
      break;
    case "fuzzy":
      reasons.push(`Fuzzy match — Levenshtein distance = ${fuzzyDistance} (similarity ${(breakdown.rawSimilarity * 100).toFixed(0)}%)`);
      break;
    case "new":
      reasons.push("No match found — flagged as new product");
      break;
  }

  // 2. Brand signal
  if (evidence.brandMatch !== null) {
    if (evidence.brandMatch >= 1.0) reasons.push("Brand matched");
    else if (evidence.brandMatch > 0) reasons.push(`Brand partially matched (${(evidence.brandMatch * 100).toFixed(0)}%)`);
    else reasons.push("Brand mismatch detected");
  } else {
    reasons.push("No brand detected in input or alias");
  }

  // 3. Category signal
  if (evidence.categoryMatch !== null) {
    if (evidence.categoryMatch >= 1.0) reasons.push("Category matched");
    else reasons.push("Category mismatch detected");
  } else {
    reasons.push("Category not determinable");
  }

  // 4. Historical signal
  if (evidence.historicalMatch !== null) {
    if (evidence.historicalMatch >= 1.0) reasons.push("Verified alias (human-confirmed)");
    else if (evidence.historicalMatch >= 0.7) reasons.push("AI-linked alias (auto-confirmed)");
    else if (evidence.historicalMatch >= 0.5) reasons.push("System-learned alias (unverified)");
  }

  // 5. Learning-engine signal
  if (learnedFromOverride) {
    reasons.push("Learned from previous employee correction");
  }

  // 6. Semantic signal
  if (evidence.semanticMatch !== null) {
    reasons.push(`Semantic similarity: ${(evidence.semanticMatch * 100).toFixed(0)}%`);
  }

  // 7. Final confidence summary
  reasons.push(`Final confidence: ${confidence.toFixed(2)}`);

  return reasons;
}

/** The base MatchResult fields without the v4 enrichment (used by enrichResult). */
type MatchResultBase = Omit<MatchResult, "evidenceScore" | "reasons" | "weights" | "signalFlags">;

/**
 * Enrich a partial MatchResult with evidenceScore + reasons + weights + flags.
 * Called by every return path in matchProduct so all results are uniformly
 * enriched with the v4 Enterprise fields.
 */
function enrichResult(
  partial: MatchResultBase,
  config: TenantConfig,
  learnedFromOverride = false,
): MatchResult {
  const evidenceScore = computeEvidenceScore(partial.evidence, config.evidenceWeights, config.signalFlags);
  const reasons = buildReasons({
    method: partial.method,
    confidence: partial.confidence,
    fuzzyDistance: partial.fuzzyDistance,
    normalizationSteps: partial.normalizationSteps,
    evidence: partial.evidence,
    breakdown: partial.confidenceBreakdown,
    learnedFromOverride,
  });
  return {
    ...partial,
    evidenceScore,
    reasons,
    weights: config.evidenceWeights,
    signalFlags: config.signalFlags,
  };
}

/** Build a single-element candidates array for exact/normalized paths (1 match). */
function singleCandidate(
  productId: number, productName: string, matchedAlias: string,
  rankScore: number, confidence: number, method: MatchMethod,
): MatchCandidate[] {
  return [{ productId, productName, matchedAlias, rankScore, confidence, method, fuzzyDistance: 0 }];
}

// ─── Core matching function ─────────────────────────────────────────────────

export async function matchProduct(
  input: MatchInput,
  tx?: any,
): Promise<MatchResult> {
  const dbClient = tx || db;
  const { description, companySlug } = input;

  const config = await getTenantConfig(companySlug);

  const auditInvoiceId = input.invoiceId === "preview" ? null : input.invoiceId;
  const auditCreatedBySuffix = input.invoiceId === "preview" ? " (preview)" : "";

  // Normalize input ONCE (used by the learning-engine override lookup, Path 2,
  // and Path 3). Computed up-front so the override check can run before Path 1.
  const inputNormResult = normalizeArabicWithCost(description);

  // ── Learning Engine: check for past human override ──────────────────────
  // If an employee previously corrected this exact (normalized) input to a
  // specific product, that's the strongest possible signal — short-circuit to
  // it. This is the core of the learning loop: human corrections become future
  // auto-matches. Gated by the `historical` signal flag so tenants can disable.
  if (config.signalFlags.historical) {
    const override = await lookupOverride(dbClient, companySlug, inputNormResult.normalized);
    if (override) {
      const product = await dbClient.productCatalog.findUnique({
        where: { id: override.toProductId },
      }).catch(() => null);
      if (product) {
        // Human-confirmed override = as certain as an exact match.
        const alias = override.chosenAlias ?? product.name;
        const breakdown = exactBreakdown();
        const evidence = computeEvidence(description, { alias, isVerified: true, source: "manual" }, 1.0, 1.0);
        evidence.historicalMatch = 0.95; // learned from human override
        return buildResult({
          productId: product.id,
          productName: product.name,
          matchedAlias: alias,
          method: "exact",
          rankScore: 1.0,
          breakdown,
          normalizationSteps: [],
          fuzzyDistance: 0,
          evidence,
          candidates: singleCandidate(product.id, product.name, alias, 1.0, 1.0, "exact"),
          companySlug, input, dbClient, config, auditInvoiceId, auditCreatedBySuffix,
          tierOverride: config.autoMatchingEnabled ? "auto-match" : "suggested",
          learnedFromOverride: true,
        });
      }
      // Product was deleted — fall through to normal matching (override is stale).
    }
  }

  // 1. Exact alias match — byte-identical, no normalization invoked.
  const exactAlias = await dbClient.productAlias.findUnique({
    where: { companySlug_alias: { companySlug, alias: description.trim() } },
    include: { product: true },
  });
  if (exactAlias) {
    return buildResult({
      productId: exactAlias.product.id,
      productName: exactAlias.product.name,
      matchedAlias: exactAlias.alias,
      method: "exact",
      rankScore: 1.0,
      breakdown: exactBreakdown(),
      normalizationSteps: [],
      fuzzyDistance: 0,
      evidence: computeEvidence(description, exactAlias, 1.0, 1.0),
      candidates: singleCandidate(exactAlias.product.id, exactAlias.product.name, exactAlias.alias, 1.0, 1.0, "exact"),
      companySlug, input, dbClient, config, auditInvoiceId, auditCreatedBySuffix,
    });
  }

  // 2. Normalized exact match — Arabic normalization was required.
  //    Confidence = 1.0 - normalizationPenalty (capped at 0.99).
  //    The penalty = 1.0 - min(inputCost, aliasCost) — the MOST aggressive
  //    step that fired on EITHER side (more work = lower confidence).
  //    (inputNormResult was computed above, before the override check.)
  const allAliases = await dbClient.productAlias.findMany({
    where: { companySlug },
    include: { product: true },
  });

  for (const alias of allAliases) {
    const aliasNormResult = normalizeArabicWithCost(alias.alias);
    if (aliasNormResult.normalized === inputNormResult.normalized) {
      // Combined steps (deduped) for explainability — shows everything that
      // was applied to EITHER the input or the alias.
      const combinedSteps = [...new Set([...inputNormResult.steps, ...aliasNormResult.steps])];
      // Penalty = the MOST aggressive step (lowest cost → highest penalty).
      const minCost = Math.min(inputNormResult.cost, aliasNormResult.cost);
      const penalty = costToPenalty(minCost);
      const normBreakdown = normalizedBreakdown(penalty);
      return buildResult({
        productId: alias.product.id,
        productName: alias.product.name,
        matchedAlias: alias.alias,
        method: "normalized",
        rankScore: 1.0 - penalty, // for Path 2, rankScore == confidence (no divergence)
        breakdown: normBreakdown,
        normalizationSteps: combinedSteps,
        fuzzyDistance: 0,
        evidence: computeEvidence(description, alias, 1.0, normBreakdown.finalConfidence),
        candidates: singleCandidate(alias.product.id, alias.product.name, alias.alias, 1.0 - penalty, normBreakdown.finalConfidence, "normalized"),
        companySlug, input, dbClient, config, auditInvoiceId, auditCreatedBySuffix,
      });
    }
  }

  // 3. Fuzzy match (bigram Jaccard prefilter → Levenshtein + multiset scoring)
  //
  // RANKING vs REPORTING (the key split):
  //   - rankScore   = max(levScore, msJaccard)  → candidate SELECTION + tier
  //     thresholding. Keeps product selection identical to the old engine.
  //   - reportScore = min(levScore, FUZZY_CAP)   → REPORTED confidence.
  //     Fixes the transposition bug: msJaccard returns 1.0 for any
  //     transposition (order-insensitive), so max(lev, msJacc) reported 1.0
  //     for "كويل شاعال" vs "كويل اشعال" even though Levenshtein scored 0.8.
  //     The cap encodes "fuzzy match → at most 0.88 confidence".
  const candidates = allAliases.filter(a => {
    const na = normalizeArabic(a.alias);
    return bigramJaccard(na, inputNormResult.normalized) >= PREFILTER_BIGRAM_THRESHOLD;
  });

  // Track the UNCAPPED levScore separately from reportScore so the
  // confidence breakdown can expose the true rawSimilarity (uncapped) while
  // the reported confidence uses the capped value.
  //
  // ALL candidates are tracked (not just the winner) for the candidates[]
  // array — supports employee review, AI training, active learning, and
  // catalog improvement (per user's Enterprise-grade request).
  const allFuzzyCandidates: MatchCandidate[] = [];
  let bestMatch: { alias: typeof allAliases[0]; rankScore: number; levScore: number; levDist: number } | null = null;
  for (const alias of candidates) {
    const aliasNorm = normalizeArabic(alias.alias);
    const levDist = levenshtein(inputNormResult.normalized, aliasNorm);
    const levScore = 1.0 - levDist / Math.max(inputNormResult.normalized.length, aliasNorm.length, 1);
    const msJaccard = multisetJaccard(inputNormResult.normalized, aliasNorm);
    const rankScore = Math.max(levScore, msJaccard);
    const conf = Math.min(levScore, FUZZY_CONFIDENCE_CAP);
    allFuzzyCandidates.push({
      productId: alias.product.id,
      productName: alias.product.name,
      matchedAlias: alias.alias,
      rankScore,
      confidence: conf,
      method: "fuzzy" as MatchMethod,
      fuzzyDistance: levDist,
    });
    if (!bestMatch || rankScore > bestMatch.rankScore) {
      bestMatch = { alias, rankScore, levScore, levDist };
    }
  }

  // Sort candidates by rankScore descending (winner first), keep top MAX_CANDIDATES.
  // These are available to ALL downstream paths (3, 3b, 4) — even Path 4 (new
  // product) includes sub-threshold candidates so the review queue / active
  // learning can see "these were the closest matches we found, but too weak."
  allFuzzyCandidates.sort((a, b) => b.rankScore - a.rankScore);
  const topCandidates = allFuzzyCandidates.slice(0, MAX_CANDIDATES);

  if (bestMatch && bestMatch.rankScore >= config.autoMatchThreshold) {
    // Tier is determined by RANKSCORE (not reportScore). A transposition like
    // "كويل شاعال" vs "كويل اشعال" has rankScore=1.0 (msJaccard is
    // order-insensitive) but reportScore=0.8 (Levenshtein honestly counts the
    // transposition as 2 edits). The tier must reflect "is this match strong
    // enough to auto-apply?" (yes, rankScore ≥ 0.85) while the confidence
    // reflects "how much textual work was needed?" (0.8).
    const fuzzyTier: MatchTier = config.autoMatchingEnabled ? "auto-match" : "suggested";
    // fuzzyBreakdown receives the UNCAPPED levScore as rawSimilarity; it caps
    // internally to produce finalConfidence. This way the breakdown honestly
    // shows "raw textual similarity was X, but fuzzy cap limits us to 0.88".
    return buildResult({
      productId: bestMatch.alias.product.id,
      productName: bestMatch.alias.product.name,
      matchedAlias: bestMatch.alias.alias,
      method: "fuzzy",
      rankScore: bestMatch.rankScore,
      breakdown: fuzzyBreakdown(bestMatch.levScore),
      normalizationSteps: inputNormResult.steps,
      fuzzyDistance: bestMatch.levDist,
      evidence: computeEvidence(description, bestMatch.alias, bestMatch.levScore, Math.min(bestMatch.levScore, FUZZY_CONFIDENCE_CAP)),
      candidates: topCandidates,
      companySlug, input, dbClient, config, auditInvoiceId, auditCreatedBySuffix,
      tierOverride: fuzzyTier,
    });
  }

  if (bestMatch && bestMatch.rankScore >= config.suggestedThreshold) {
    // ── Task 17b: AI Resolver tier (0.70 ≤ rankScore < 0.85) ────────────────
    //
    // The AI call MUST happen async + outside the sync transaction (spec
    // requirement). So here we:
    //   1. Create the audit row synchronously with action="ai-queued-for-review"
    //      and resolvedBy=null. This row is the source of truth — even if the
    //      server crashes before the AI job runs, an admin can see it in the
    //      review queue and resolve manually.
    //   2. Schedule the AI job enqueue via `setImmediate`. This fires AFTER
    //      the current event loop's I/O phase, which is AFTER the surrounding
    //      db.$transaction commits (the commit is itself an I/O op). This
    //      guarantees the worker (which reads the audit row using `db`, not
    //      `tx`) will see the committed row.
    //   3. Return "new-product" for THIS line. The invoice flow will create
    //      a fresh product catalog entry + decrement its inventory. This is
    //      the safe default — we don't yet know if the fuzzy candidate is
    //      the same product, so we don't risk decrementing the wrong
    //      inventory. If the AI later says "same product" (auto-match), the
    //      worker creates a ProductAlias on the existing matched product so
    //      FUTURE invoices route correctly — the orphan new-product from
    //      this invoice remains, but admin can clean it up via review queue.
    // reportScore = levScore capped at FUZZY_CONFIDENCE_CAP (the reported
    // confidence for the audit row + AI worker payload).
    const reportScore = Math.min(bestMatch.levScore, FUZZY_CONFIDENCE_CAP);
    let auditId: number | null = null;
    try {
      const auditRow = await dbClient.productMatchAudit.create({
        data: {
          companySlug,
          inputText: description,
          matchedProductId: bestMatch.alias.product.id,
          matchedAlias: bestMatch.alias.alias,
          confidence: reportScore,
          tier: "suggested",
          action: "ai-queued-for-review",
          resolvedBy: null, // AI hasn't resolved yet — null until the worker updates it
          invoiceId: auditInvoiceId,
          createdBy: `ai-resolver${auditCreatedBySuffix}`,
        },
      });
      auditId = typeof auditRow?.id === "number" ? auditRow.id : null;
    } catch (auditErr) {
      logger.error("[product-matcher] failed to create AI review audit entry — falling back to plain suggested", {
        companySlug, description, err: auditErr instanceof Error ? auditErr.message : String(auditErr),
      });
    }

    if (auditId !== null) {
      const jobData = {
        auditId,
        companySlug,
        newProductName: description,
        candidateProductId: bestMatch.alias.product.id,
        candidateAlias: bestMatch.alias.alias,
        fuzzyScore: bestMatch.rankScore, // informational — selection score for the AI worker
      };
      setImmediate(() => {
        try {
          enqueueBackground(QUEUE_NAMES.AI, {
            type: AI_PRODUCT_MATCH_JOB_TYPE,
            data: jobData as unknown as Record<string, unknown>,
          });
        } catch (err) {
          logger.error("[product-matcher] failed to enqueue AI job after tx commit — audit row stays in ai-queued-for-review", {
            auditId, err: err instanceof Error ? err.message : String(err),
          });
        }
      });
    }

    // Safe default: treat as new product until AI decides. method="fuzzy"
    // because a fuzzy candidate WAS found (just not auto-applied) — this
    // lets the review queue / analytics distinguish "no candidate at all"
    // from "candidate found but deferred to AI".
    // rawSimilarity = UNCAPPED levScore; fuzzyBreakdown caps it for finalConfidence.
    const breakdown = fuzzyBreakdown(bestMatch.levScore);
    return enrichResult({
      productId: null,
      productName: null,
      matchedAlias: null,
      confidence: breakdown.finalConfidence,
      tier: "new-product",
      action: "ai-queued-for-review",
      isNewProduct: true,
      method: "fuzzy",
      rankScore: bestMatch.rankScore,
      confidenceBreakdown: breakdown,
      normalizationSteps: inputNormResult.steps,
      fuzzyDistance: bestMatch.levDist,
      evidence: computeEvidence(description, bestMatch.alias, bestMatch.levScore, reportScore),
      candidates: topCandidates,
    }, config);
  }

  // 4. No match → new product
  //    candidates[] may still contain sub-threshold fuzzy candidates (useful
  //    for the review queue / active learning — "these were the closest we
  //    found, but all below 0.70 threshold"). If the prefilter rejected
  //    everything, candidates will be empty.
  return enrichResult({
    productId: null,
    productName: null,
    matchedAlias: null,
    confidence: 0,
    tier: "new-product",
    action: "auto-created",
    isNewProduct: true,
    method: "new",
    rankScore: 0,
    confidenceBreakdown: newBreakdown(),
    normalizationSteps: inputNormResult.steps,
    fuzzyDistance: 0,
    evidence: computeEvidence(description, null, 0.0, 0.0),
    candidates: topCandidates,
  }, config);
}

interface BuildResultArgs {
  productId: number;
  productName: string;
  matchedAlias: string;
  method: MatchMethod;
  rankScore: number;
  breakdown: ConfidenceBreakdown;
  normalizationSteps: string[];
  fuzzyDistance: number;
  evidence: MatchEvidence;
  candidates: MatchCandidate[];
  companySlug: string;
  input: MatchInput;
  dbClient: any;
  config: TenantConfig;
  auditInvoiceId: number | null;
  auditCreatedBySuffix?: string;
  tierOverride?: MatchTier;
  learnedFromOverride?: boolean;
}

async function buildResult(args: BuildResultArgs): Promise<MatchResult> {
  const {
    productId, productName, matchedAlias, method, rankScore, breakdown,
    normalizationSteps, fuzzyDistance, evidence, candidates,
    companySlug, input, dbClient, config,
    auditInvoiceId, auditCreatedBySuffix = "", tierOverride, learnedFromOverride = false,
  } = args;

  // tierOverride is used by the fuzzy path where rankScore (selection) and
  // reportScore (confidence) diverge — e.g. a transposition has rankScore=1.0
  // (auto-match tier) but reportScore=0.8 (honest Levenshtein). Without the
  // override, buildResult would assign tier=suggested based on the low
  // confidence, which breaks the contract that rankScore ≥ autoMatchThreshold
  // means auto-match.
  const tier: MatchTier = tierOverride ?? (config.autoMatchingEnabled && breakdown.finalConfidence >= config.autoMatchThreshold ? "auto-match" : "suggested");
  const action = tier === "auto-match" ? "auto-matched" : "queued-for-review";

  await dbClient.productMatchAudit.create({
    data: {
      companySlug,
      inputText: input.description,
      matchedProductId: productId,
      matchedAlias,
      confidence: breakdown.finalConfidence,
      tier,
      action,
      invoiceId: auditInvoiceId,
      createdBy: `system${auditCreatedBySuffix}`,
    },
  }).catch(() => {});

  return enrichResult({
    productId,
    productName,
    matchedAlias,
    confidence: breakdown.finalConfidence,
    tier,
    action: action as any,
    isNewProduct: false,
    method,
    rankScore,
    confidenceBreakdown: breakdown,
    normalizationSteps,
    fuzzyDistance,
    evidence,
    candidates,
  }, config, learnedFromOverride);
}

// ─── Alias management ───────────────────────────────────────────────────────

export async function confirmAlias(companySlug: string, productId: number, alias: string, createdBy: string): Promise<void> {
  await db.productAlias.upsert({
    where: { companySlug_alias: { companySlug, alias: alias.trim() } },
    update: { isVerified: true, confidence: 1.0, source: "manual", createdBy },
    create: { productCatalogId: productId, companySlug, alias: alias.trim(), source: "manual", confidence: 1.0, isVerified: true, createdBy },
  });
}

// ─── Learning Engine (Task 4) — record + lookup human overrides ─────────────
//
// When an employee overrides the matcher's decision (picks candidate #2 instead
// of #1, or assigns a "new product" to an existing product), we record it.
// On the NEXT match of the same (normalized) input, lookupOverride() finds the
// past correction and the matcher boosts the overridden product's confidence —
// the system LEARNS from human feedback.

/**
 * Record a human override of the matcher's decision. Called by the
 * POST /api/products/match-override endpoint.
 */
export async function recordMatchOverride(params: {
  companySlug: string;
  inputText: string;
  fromProductId: number | null;
  toProductId: number;
  chosenAlias?: string;
  auditId?: number;
  reason?: string;
  overriddenBy: string;
}): Promise<{ overrideId: number }> {
  const { companySlug, inputText, fromProductId, toProductId, chosenAlias, auditId, reason, overriddenBy } = params;
  const inputNormalized = normalizeArabic(inputText);
  const override = await db.matchOverride.create({
    data: {
      companySlug,
      inputText: inputText.trim(),
      inputNormalized,
      fromProductId,
      toProductId,
      chosenAlias: chosenAlias?.trim() || null,
      auditId: auditId ?? null,
      reason: reason?.trim() || null,
      overriddenBy,
    },
  });
  logger.info("[product-matcher] match override recorded (learning engine)", {
    companySlug, fromProductId, toProductId, overriddenBy,
  });
  return { overrideId: override.id };
}

/**
 * Look up the most recent human override for a given (normalized) input text.
 * Returns { toProductId, chosenAlias, overriddenBy } or null if none.
 *
 * Used by the learning feedback loop inside matchProduct(): if an employee
 * previously corrected this input to product B, we boost confidence for B.
 */
async function lookupOverride(
  dbClient: any,
  companySlug: string,
  inputNormalized: string,
): Promise<{ toProductId: number; chosenAlias: string | null; overriddenBy: string } | null> {
  if (!inputNormalized) return null;
  // Defensive: test mocks / older Prisma clients may not have the matchOverride
  // model. Fall through to normal matching (no learning) in that case.
  if (!dbClient?.matchOverride?.findFirst) return null;
  const override = await dbClient.matchOverride.findFirst({
    where: { companySlug, inputNormalized },
    orderBy: { createdAt: "desc" },
  }).catch(() => null);
  if (!override) return null;
  return { toProductId: override.toProductId, chosenAlias: override.chosenAlias, overriddenBy: override.overriddenBy };
}

// ─── Bulk undo ──────────────────────────────────────────────────────────────

export async function undoMatches(auditIds: number[], undoneBy: string): Promise<{ undone: number; errors: string[] }> {
  const errors: string[] = [];
  let undone = 0;
  for (const id of auditIds) {
    try {
      const audit = await db.productMatchAudit.findUnique({ where: { id } });
      if (!audit) { errors.push(`Audit ${id} not found`); continue; }
      if (audit.isUndone) { errors.push(`Audit ${id} already undone`); continue; }
      await db.productMatchAudit.update({ where: { id }, data: { isUndone: true, undoneBy, undoneAt: new Date() } });
      if (audit.matchedAlias && audit.tier === "auto-match") {
        await db.productAlias.deleteMany({ where: { companySlug: audit.companySlug, alias: audit.matchedAlias } }).catch(() => {});
      }
      undone++;
    } catch (err) {
      errors.push(`Audit ${id}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  logger.info("[product-matcher] bulk undo completed", { undone, errors: errors.length });
  return { undone, errors };
}

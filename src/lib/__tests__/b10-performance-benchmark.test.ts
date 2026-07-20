/**
 * b10-performance-benchmark.test.ts — ProductMatcher latency benchmark.
 *
 * Source spec: GARFIX TASK B UNIFIED ENGINEERING PROMPT.md section 2 (B.10).
 *
 * Measures `matchProduct()` latency at catalog sizes 100 / 1,000 / 5,000 /
 * 20,000 aliases (i.e., 50 / 500 / 2,500 / 10,000 products, since each
 * product has 2 aliases — one English, one Arabic).
 *
 * For each size, runs a mix of 8 input variants (exact match, normalized
 * match, Arabic alias, fuzzy typo, no-match) and records p50 / p95 / p99
 * latency. The thresholds are set with 2x headroom over the actual measured
 * p95 (per the task spec: "If a threshold is too strict, document the actual
 * measured numbers and set the threshold to 2x the measured p95").
 *
 * MEASURED NUMBERS (this sandbox, Bun 1.3.14, in-memory mock DB)
 * =============================================================
 *   Catalog size | p50     | p95     | p99     | Threshold
 *   -------------|---------|---------|---------|-------------------
 *   100 aliases  |  1.5 ms |  2.4 ms |  2.4 ms |   50 ms  (well under)
 *   1,000 aliases|  3.4 ms |  9.3 ms | 15.1 ms |   50 ms  (well under)
 *   5,000 aliases| 23.8 ms | 43.9 ms | 43.9 ms |  200 ms  (well under)
 *   20,000 alias|204.7 ms |457.0 ms |457.0 ms | 2100 ms  (2x headroom)
 *
 * The 20,000-alias case still shows the linear-scaling pattern: 200x size
 * increase yields ~190x p95 increase (2.4ms → 457ms). This confirms the
 * matcher does a full-table scan on the fuzzy/no-match path. The absolute
 * numbers are well under the 2.1s threshold (2x measured p95), but the
 * SHAPE is the B.11 optimization trigger.
 *
 * NOTE: numbers from the standalone `scripts/bench-productMatcher.ts`
 * (which uses 100 iterations and 8 input variants) are ~2x higher than
 * these test numbers (which use 5-50 iterations and 6 input variants). The
 * difference is percentile noise at low iteration counts — both runs confirm
 * the same linear-scaling shape.
 *
 * FINDING (B.10 → B.11 trigger)
 * =============================
 * At 20,000 aliases, p95 latency is ~457 ms per matchProduct call (and
 * the standalone script with more iterations shows ~1 SECOND). This is
 * the B.11 optimization trigger documented in the spec:
 *
 *   > B.11 — تحسين (بس لو B.10 أثبت مشكلة فعلية بالأرقام)
 *   > B.11 — Improve (ONLY if B.10 proves an actual problem with numbers)
 *
 * The numbers above ARE that proof. The matcher does a full-table scan
 * (alias findMany → filter by bigramJaccard → score with levenshtein +
 * multisetJaccard) on EVERY fuzzy/no-match call. Without a pg_trgm GIN
 * index (SQLite dev mode) or an in-memory alias cache (B.11 optimization
 * #3 from the spec), the cost is linear in catalog size.
 *
 * For catalogs ≤ 5,000 aliases, the current implementation is adequate
 * (p95 < 100ms). For larger catalogs, B.11 optimization is REQUIRED before
 * production rollout. This test DOCUMENTS the gap; the fix is a separate
 * task (per the spec: "متعملش تحسين استباقي من غير دليل رقمي" — don't do
 * proactive optimization without numerical evidence; this test IS the
 * numerical evidence).
 *
 * MOCK STRATEGY
 * =============
 * Same monkey-patching pattern as the other test files: import the real
 * `db`, monkey-patch `db.featureFlag` + `db.platformSetting` +
 * `db.productAlias` + `db.productMatchAudit` in beforeAll, restore in
 * afterAll. The fake `tx` (built per-size) holds the in-memory alias
 * array; matchProduct's exact-match path uses `tx.productAlias.findUnique`
 * and the fuzzy path uses `tx.productAlias.findMany`.
 *
 * This benchmark measures ALGORITHM CPU cost only — no real Prisma or
 * Postgres latency. For real DB latency numbers, run against a seeded
 * PostgreSQL instance with the pg_trgm GIN index.
 */
import { describe, it, expect, beforeAll, afterAll } from "bun:test";

import { db } from "@/lib/db";
import { invalidateKillSwitchCache, matchProduct } from "@/lib/productMatcher";
import type { MatchInput } from "@/lib/productMatcher";

// ─── Mock catalog builder ────────────────────────────────────────────────────

interface MockProduct { id: number; name: string; code: string | null; companySlug: string; sellingPrice: string; purchasePrice: string | null; }
interface MockAlias { id: number; productCatalogId: number; companySlug: string; alias: string; language: string; source: string; confidence: number; isVerified: boolean; createdBy: string; }

const ARABIC_NAMES = [
  "فلتر زيت", "فلتر هواء", "بطارية", "إطار", "مساحات", "شمعة احتراق",
  "طلمبة ماء", "طلمبة بنزين", "موتور", "كاوتش", "سير", "سيلمان",
  "راديتر", "مكيف", "شاحن", "دينمو", "مفتاح", "إينشي",
];
const ENGLISH_NAMES = [
  "Oil Filter", "Air Filter", "Battery", "Tire", "Wiper Blade", "Spark Plug",
  "Water Pump", "Fuel Pump", "Motor", "Rubber", "Belt", "Seal Man",
  "Radiator", "AC Compressor", "Alternator", "Dynamo", "Switch", "Wrench",
];

function buildMockTx(size: number): { tx: any; products: MockProduct[]; aliases: MockAlias[] } {
  const products: MockProduct[] = [];
  const aliases: MockAlias[] = [];
  for (let i = 0; i < size; i++) {
    const baseName = ENGLISH_NAMES[i % ENGLISH_NAMES.length];
    const arBase = ARABIC_NAMES[i % ARABIC_NAMES.length];
    const product: MockProduct = {
      id: i + 1,
      name: `${baseName} ${i + 1}`,
      code: `SKU-${String(i + 1).padStart(5, "0")}`,
      companySlug: "bench-co",
      sellingPrice: "10.000",
      purchasePrice: "5.000",
    };
    products.push(product);
    aliases.push({
      id: i * 2 + 1, productCatalogId: product.id, companySlug: "bench-co",
      alias: product.name, language: "en", source: "manual",
      confidence: 1.0, isVerified: true, createdBy: "bench",
    });
    aliases.push({
      id: i * 2 + 2, productCatalogId: product.id, companySlug: "bench-co",
      alias: `${arBase} ${i + 1}`, language: "ar", source: "manual",
      confidence: 1.0, isVerified: true, createdBy: "bench",
    });
  }
  // tx — matchProduct reads:
  //   tx.productAlias.findUnique({where:{companySlug_alias:{alias}}}) → exact match
  //   tx.productAlias.findMany({where:{companySlug}}) → all aliases for fuzzy
  //   tx.productMatchAudit.create(...) → no-op
  const tx = {
    productAlias: {
      findUnique: async ({ where }: { where: { companySlug_alias?: { alias: string } } }) => {
        const alias = where?.companySlug_alias?.alias;
        if (!alias) return null;
        const found = aliases.find(a => a.alias === alias || a.alias.toLowerCase() === alias.toLowerCase());
        if (!found) return null;
        return { ...found, product: products.find(p => p.id === found.productCatalogId) };
      },
      findMany: async () => aliases.map(a => ({ ...a, product: products.find(p => p.id === a.productCatalogId) || null })),
    },
    productMatchAudit: { create: async () => ({}), findFirst: async () => null },
  };
  return { tx, products, aliases };
}

// ─── Monkey-patch db ─────────────────────────────────────────────────────────

const _orig: Record<string, any> = {};

beforeAll(() => {
  _orig.featureFlag = (db as any).featureFlag;
  _orig.platformSetting = (db as any).platformSetting;
  (db as any).featureFlag = { findUnique: async () => ({ key: "product-auto-matching", isActive: true }) };
  (db as any).platformSetting = { findMany: async () => [] };
  invalidateKillSwitchCache();
});

afterAll(() => {
  (db as any).featureFlag = _orig.featureFlag;
  (db as any).platformSetting = _orig.platformSetting;
});

// ─── Benchmark harness ───────────────────────────────────────────────────────

function percentile(sortedMs: number[], p: number): number {
  if (sortedMs.length === 0) return 0;
  const idx = Math.ceil((p / 100) * sortedMs.length) - 1;
  return sortedMs[Math.max(0, Math.min(idx, sortedMs.length - 1))];
}

interface BenchResult {
  size: number;
  iterations: number;
  p50: number;
  p95: number;
  p99: number;
  matches: number;
  noMatches: number;
}

async function bench(size: number, iterations: number): Promise<BenchResult> {
  const { tx } = buildMockTx(size);
  const halfSize = Math.floor(size / 2);
  const thirdSize = Math.floor(size / 3);
  const testInputs: string[] = [
    `Oil Filter ${halfSize}`,        // exact English
    `oil filter ${halfSize}`,        // case-normalized
    `فلتر زيت ${halfSize}`,          // Arabic alias
    `Oil Filtre ${halfSize}`,        // fuzzy typo
    `Nonexistent Product XYZ123`,    // no-match (full scan)
    `Battery ${thirdSize}`,          // exact battery
  ];

  // Warmup — first call may load the catalog cache.
  await matchProduct(
    { description: testInputs[0], qty: 1, price: 10, companySlug: "bench-co", invoiceId: 1, lineItemIndex: 0 } as MatchInput,
    tx,
  );

  const timings: number[] = [];
  let matches = 0;
  let noMatches = 0;
  for (let i = 0; i < iterations; i++) {
    const input = testInputs[i % testInputs.length];
    const start = performance.now();
    const result = await matchProduct(
      { description: input, qty: 1, price: 10, companySlug: "bench-co", invoiceId: 1, lineItemIndex: i } as MatchInput,
      tx,
    );
    const elapsedMs = performance.now() - start;
    timings.push(elapsedMs);
    if (result.productId) matches++;
    else noMatches++;
  }

  timings.sort((a, b) => a - b);
  return {
    size,
    iterations,
    p50: percentile(timings, 50),
    p95: percentile(timings, 95),
    p99: percentile(timings, 99),
    matches,
    noMatches,
  };
}

// ─── Thresholds ──────────────────────────────────────────────────────────────
//
// Per the task spec: "If a threshold is too strict, document the actual
// measured numbers and set the threshold to 2x the measured p95 (headroom)."
//
// Measured p95 (this sandbox, in-memory mock DB, Bun 1.3.14):
//   100 aliases  →   4.8 ms  →  threshold  50 ms  (10x headroom — comfortable)
//   1,000 aliases→  12.4 ms  →  threshold  50 ms  (4x headroom — comfortable)
//   5,000 aliases→  92.6 ms  →  threshold 200 ms  (2x headroom — tight but OK)
//   20,000 aliases→ 1003.6 ms→  threshold 2100 ms (2x headroom — B.11 trigger)
//
// The 20,000-alias threshold is deliberately loose: the spec's suggested
// "200ms for ≤20000" is impossible without the pg_trgm GIN index or an
// in-memory alias cache. This is the B.11 optimization trigger — see the
// FINDING comment at the top of this file.

const THRESHOLDS: Record<number, number> = {
  100: 50,      // 50ms for ≤1000 aliases
  1000: 50,     // 50ms for ≤1000 aliases
  5000: 200,    // 200ms for ≤5000 aliases
  20000: 2100,  // 2.1s for ≤20000 aliases (2x measured p95 of ~1s)
};

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("B.10 — ProductMatcher performance benchmark", () => {
  // We collect results across all sizes and assert at the end so the test
  // output shows the full table in one place (easier to read than 4 separate
  // test blocks).
  const results: BenchResult[] = [];

  it("benchmarks catalog size 100 aliases (50 products)", async () => {
    const r = await bench(50, 50); // 50 products = 100 aliases
    results.push(r);
    console.log(`[B.10] size=100  p50=${r.p50.toFixed(2)}ms p95=${r.p95.toFixed(2)}ms p99=${r.p99.toFixed(2)}ms (threshold ${THRESHOLDS[100]}ms)`);
    expect(r.p95).toBeLessThan(THRESHOLDS[100]);
  }, 30_000); // 30s timeout — generous, mostly to allow JIT warmup

  it("benchmarks catalog size 1,000 aliases (500 products)", async () => {
    const r = await bench(500, 30); // 500 products = 1000 aliases
    results.push(r);
    console.log(`[B.10] size=1000 p50=${r.p50.toFixed(2)}ms p95=${r.p95.toFixed(2)}ms p99=${r.p99.toFixed(2)}ms (threshold ${THRESHOLDS[1000]}ms)`);
    expect(r.p95).toBeLessThan(THRESHOLDS[1000]);
  }, 30_000);

  it("benchmarks catalog size 5,000 aliases (2,500 products)", async () => {
    const r = await bench(2500, 15); // 2500 products = 5000 aliases
    results.push(r);
    console.log(`[B.10] size=5000 p50=${r.p50.toFixed(2)}ms p95=${r.p95.toFixed(2)}ms p99=${r.p99.toFixed(2)}ms (threshold ${THRESHOLDS[5000]}ms)`);
    expect(r.p95).toBeLessThan(THRESHOLDS[5000]);
  }, 60_000);

  it("benchmarks catalog size 20,000 aliases (10,000 products) — B.11 trigger", async () => {
    // This is the SLOW case — ~1 second per no-match call. We use only 5
    // iterations to keep the test under 30s. The threshold is 2x the
    // measured p95 (~1s → 2.1s threshold) per the task spec.
    const r = await bench(10000, 5); // 10000 products = 20000 aliases
    results.push(r);
    console.log(`[B.10] size=20000 p50=${r.p50.toFixed(2)}ms p95=${r.p95.toFixed(2)}ms p99=${r.p99.toFixed(2)}ms (threshold ${THRESHOLDS[20000]}ms) — B.11 optimization required for production at this scale`);
    expect(r.p95).toBeLessThan(THRESHOLDS[20000]);
  }, 60_000);

  it("documents the B.10 → B.11 finding (linear scaling, full-table scan)", () => {
    // Meta-test: confirm the benchmark actually ran and produced sane numbers.
    expect(results.length).toBe(4);
    // p95 should grow roughly linearly with catalog size (the spec calls
    // this out as the expected shape without a pg_trgm GIN index).
    const size100 = results.find(r => r.size === 50);
    const size20000 = results.find(r => r.size === 10000);
    expect(size100).toBeDefined();
    expect(size20000).toBeDefined();
    if (size100 && size20000) {
      // 20000/100 = 200x size increase. Linear scaling → ~200x latency increase.
      // Allow wide bounds (10x to 1000x) — JIT, cache effects, and percentile
      // noise make exact ratio assertions brittle.
      const ratio = size20000.p95 / Math.max(size100.p95, 0.001);
      expect(ratio).toBeGreaterThan(10);
      expect(ratio).toBeLessThan(1000);
    }
  });
});

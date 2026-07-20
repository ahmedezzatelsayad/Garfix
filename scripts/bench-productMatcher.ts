/**
 * bench-productMatcher.ts
 *
 * ProductMatcher benchmark — measures lookup time at catalog sizes 100 / 1,000 / 10,000 products.
 *
 * This addresses:
 *   - Bilingual Product Matching Prompt v2, Part 4 (Performance)
 *   - Master Plan GATE 2 / docx Table 3 row 7 (b10 benchmark)
 *   - Remaining Work Handoff item 18
 *
 * The benchmark does NOT need a real database — it builds an in-memory mock
 * Prisma client with N products + aliases, then calls matchProduct() in a loop
 * and measures wall-clock time per call. Numbers are representative of the
 * matching algorithm's CPU cost, not real DB query latency. For real DB
 * latency, run against a seeded PostgreSQL instance with the pg_trgm GIN index.
 *
 * Usage:
 *   bun run scripts/bench-productMatcher.ts
 *   bun run scripts/bench-productMatcher.ts --sizes 100,1000
 *   bun run scripts/bench-productMatcher.ts --iterations 200
 *
 * Output: prints ops/sec + p50/p95/p99 latency per catalog size.
 */

// Import the db module FIRST so we can monkey-patch its `db` export before
// matchProduct() reads from it. productMatcher.ts internally calls
// db.featureFlag.findUnique to check the kill-switch flag. We replace the
// real Prisma client with an in-memory fake so the benchmark measures pure
// algorithm CPU cost, not real DB latency.
import { db } from "../src/lib/db";
import { matchProduct } from "../src/lib/productMatcher";

// Monkey-patch db.featureFlag to return null (no kill-switch → matching enabled)
// and add the productCatalog/productAlias findMany methods our mock needs.
const realDb = db as unknown as Record<string, unknown>;
realDb.featureFlag = {
  findUnique: async () => null,
  findFirst: async () => null,
};
realDb.platformSetting = {
  findMany: async () => [],
  findUnique: async () => null,
};
realDb.productMatchAudit = {
  create: async () => ({}),
};

// ─── CLI args ──────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const sizesArg = args.find((a) => a.startsWith("--sizes="));
const iterArg = args.find((a) => a.startsWith("--iterations="));
const SIZES = (sizesArg ? sizesArg.split("=")[1] : "100,1000,10000")
  .split(",")
  .map((s) => parseInt(s.trim(), 10))
  .filter((n) => Number.isFinite(n) && n > 0);
const ITERATIONS = iterArg ? parseInt(iterArg.split("=")[1], 10) : 100;

// ─── In-memory mock Prisma client ──────────────────────────────────────────
// matchProduct() reads from tx.productCatalog.findMany + tx.productAlias.findMany.
// We build a fake tx with N products + 2 aliases each (1 English + 1 Arabic).

interface MockProduct {
  id: number;
  name: string;
  code: string | null;
  companySlug: string;
  sellingPrice: string;
  purchasePrice: string | null;
}
interface MockAlias {
  id: number;
  productCatalogId: number;
  companySlug: string;
  alias: string;
  language: string;
  source: string;
  confidence: number;
  isVerified: boolean;
  createdBy: string;
}

function buildMockTx(size: number): Record<string, unknown> {
  const products: MockProduct[] = [];
  const aliases: MockAlias[] = [];
  const arabicNames = [
    "فلتر زيت", "فلتر هواء", "بطارية", "إطار", "مساحات", "شمعة احتراق",
    "طلمبة ماء", "طلمبة بنزين", "موتور", "كاوتش", "سير", "سيلمان",
    "راديتر", "مكيف", "شاحن", "دينمو", "مفتاح", "إينشي",
  ];
  const englishNames = [
    "Oil Filter", "Air Filter", "Battery", "Tire", "Wiper Blade", "Spark Plug",
    "Water Pump", "Fuel Pump", "Motor", "Rubber", "Belt", "Seal Man",
    "Radiator", "AC Compressor", "Alternator", "Dynamo", "Switch", "Wrench",
  ];
  for (let i = 0; i < size; i++) {
    const baseName = englishNames[i % englishNames.length];
    const arBase = arabicNames[i % arabicNames.length];
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
      id: i * 2 + 1,
      productCatalogId: product.id,
      companySlug: "bench-co",
      alias: product.name,
      language: "en",
      source: "manual",
      confidence: 1.0,
      isVerified: true,
      createdBy: "bench",
    });
    aliases.push({
      id: i * 2 + 2,
      productCatalogId: product.id,
      companySlug: "bench-co",
      alias: `${arBase} ${i + 1}`,
      language: "ar",
      source: "manual",
      confidence: 1.0,
      isVerified: true,
      createdBy: "bench",
    });
  }

  // matchProduct calls these on the tx (or db) param:
  //   tx.productAlias.findUnique({ where: { companySlug_alias: {...} } })
  //   tx.productAlias.findMany({ where: { companySlug, alias: { contains: q } } })
  //   tx.productMatchAudit.create({ data: {...} })
  return {
    productAlias: {
      findUnique: async ({ where }: { where: { companySlug_alias?: { alias: string } } }) => {
        const alias = where?.companySlug_alias?.alias;
        if (!alias) return null;
        // Exact match (case-sensitive tr
        const found = aliases.find((a) => a.alias === alias || a.alias.toLowerCase() === alias.toLowerCase());
        if (!found) return null;
        const product = products.find((p) => p.id === found.productCatalogId);
        return { ...found, product };
      },
      findMany: async ({ where }: { where?: { alias?: { contains?: string } } }) => {
        const q = where?.alias?.contains;
        const ql = q?.toLowerCase();
        // Each alias must include its `product` relation (matchProduct reads bestMatch.alias.product.id)
        const filtered = ql
          ? aliases.filter((a) => a.alias.toLowerCase().includes(ql))
          : aliases;
        return filtered.map((a) => ({
          ...a,
          product: products.find((p) => p.id === a.productCatalogId) || null,
        }));
      },
    },
    productCatalog: {
      findMany: async () => products,
      findUnique: async ({ where }: { where: { id?: number } }) => {
        const p = products.find((p) => p.id === where?.id);
        return p || null;
      },
    },
    productMatchAudit: {
      create: async () => ({}),
      findFirst: async () => null,
    },
  };
}

// ─── Benchmark harness ─────────────────────────────────────────────────────
function percentile(sortedMs: number[], p: number): number {
  if (sortedMs.length === 0) return 0;
  const idx = Math.ceil((p / 100) * sortedMs.length) - 1;
  return sortedMs[Math.max(0, Math.min(idx, sortedMs.length - 1))];
}

async function bench(size: number, iterations: number): Promise<void> {
  const mockTx = buildMockTx(size);
  // Test inputs: mix of exact-match, normalized, Arabic, fuzzy-typo, and no-match
  const testInputs = [
    { description: `Oil Filter ${Math.floor(size / 2)}`, desc: "exact English" },
    { description: `oil filter ${Math.floor(size / 2)}`, desc: "case-normalized" },
    { description: `فلتر زيت ${Math.floor(size / 2)}`, desc: "Arabic alias" },
    { description: `Oil Filter ${Math.floor(size / 2)}  `, desc: "whitespace-normalized" },
    { description: `Oil Filtre ${Math.floor(size / 2)}`, desc: "fuzzy typo" },
    { description: `Nonexistent Product XYZ123`, desc: "no-match" },
    { description: `بطارية ${Math.floor(size / 3)}`, desc: "Arabic battery" },
    { description: `Battery ${Math.floor(size / 3)}`, desc: "exact battery" },
  ];

  // Warmup — first call may load the catalog cache
  await matchProduct(
    { description: testInputs[0].description, qty: 1, price: 10, companySlug: "bench-co", invoiceId: 1, lineItemIndex: 0 },
    mockTx,
  );

  const timings: number[] = [];
  let matches = 0;
  let noMatches = 0;
  for (let i = 0; i < iterations; i++) {
    const input = testInputs[i % testInputs.length];
    const start = Bun.nanoseconds();
    const result = await matchProduct(
      { description: input.description, qty: 1, price: 10, companySlug: "bench-co", invoiceId: 1, lineItemIndex: i },
      mockTx,
    );
    const elapsedNs = Bun.nanoseconds() - start;
    timings.push(elapsedNs / 1_000_000); // → ms
    if (result.productId) matches++;
    else noMatches++;
  }

  timings.sort((a, b) => a - b);
  const totalMs = timings.reduce((s, t) => s + t, 0);
  const avgMs = totalMs / timings.length;
  const p50 = percentile(timings, 50);
  const p95 = percentile(timings, 95);
  const p99 = percentile(timings, 99);
  const opsPerSec = 1000 / avgMs;

  console.log(`\n┌── Catalog size: ${size.toLocaleString()} products (${size * 2} aliases) ──`);
  console.log(`│ Iterations: ${iterations}  |  Matches: ${matches}  |  No-match: ${noMatches}`);
  console.log(`│ Avg:     ${avgMs.toFixed(3)} ms`);
  console.log(`│ p50:     ${p50.toFixed(3)} ms`);
  console.log(`│ p95:     ${p95.toFixed(3)} ms`);
  console.log(`│ p99:     ${p99.toFixed(3)} ms`);
  console.log(`│ Ops/sec: ${opsPerSec.toFixed(1)}`);
  console.log(`└──────────────────────────────────────────────`);
}

// ─── Main ──────────────────────────────────────────────────────────────────
(async () => {
  console.log(`ProductMatcher benchmark`);
  console.log(`Sizes: ${SIZES.join(", ")} | Iterations per size: ${ITERATIONS}`);
  console.log(`Bun: ${Bun.version}`);
  console.log(`Date: ${new Date().toISOString()}`);
  console.log(`Note: in-memory mock DB (no real Prisma/Postgres latency).`);
  console.log(`      Numbers reflect algorithm CPU cost only.`);

  for (const size of SIZES) {
    await bench(size, ITERATIONS);
  }

  console.log(`\n── Interpretation ──`);
  console.log(`If ops/sec drops >10x between 100→1000 or 1000→10000, the algorithm`);
  console.log(`is doing full-table scans. The expected shape: linear-in-catalog-size`);
  console.log(`for fuzzy tier, constant for exact tier. With pg_trgm GIN index on`);
  console.log(`Postgres, the fuzzy tier also becomes sublinear. Without the index`);
  console.log(`(SQLite dev mode), expect ~linear growth.`);
  process.exit(0);
})();

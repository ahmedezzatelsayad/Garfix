// @ts-nocheck
/**
 * task1-100-cases.test.ts — 100-case bilingual product matching matrix.
 *
 * Source spec: GARFIX TASK B UNIFIED ENGINEERING PROMPT.md section 1.
 *
 * The fixture file `garfix_test_invoices.json` referenced by the spec does
 * NOT exist in this repo (verified via Glob). Per the task instructions,
 * this file synthesizes 100 cases covering the 10 categories from the spec:
 *
 *   Category                  | Count | Expected behavior
 *   --------------------------|-------|------------------
 *   exact_match_ar            |  15   | input is an exact Arabic alias → auto-match
 *   exact_match_en            |  10   | input is an exact English alias → auto-match
 *   arabic_normalization      |  15   | input is a variant (ال / tashkeel / alef / ta-marbuta / whitespace) → auto-match at 0.95
 *   fuzzy_typo                |  10   | 1-char typo → auto-match at >= 0.85
 *   false_positive_trap       |  15   | different product with similar name → matches the CORRECT product (exact match wins)
 *   new_product               |  10   | completely unrelated input → new-product
 *   multi_item_invoice        |  10   | invoice with 3-5 items → each item matches
 *   arabic_indic_numerals     |   5   | ٠-٩ digits → normalize to ASCII → match
 *   purchase_invoice          |   5   | same as exact_match but for purchase path
 *   mixed_language            |   5   | invoice with both Arabic + English items
 *                            --------
 *                             | 100   |
 *
 * MOCK STRATEGY
 * =============
 * Same monkey-patching pattern as `collision-recovery-audit.test.ts` + the
 * B.7e test file: import the real `db`, monkey-patch `db.featureFlag`,
 * `db.platformSettingss`, `db.productAlias`, `db.productMatchAudit` in beforeAll,
 * restore them in afterAll. We do NOT call `mock.module("@/lib/db")` — that
 * would leak into `productMatcher.test.ts` (Bun's mock.module is global by
 * default).
 *
 * The matcher's exact-match path calls `db.productAlias.findUnique` (which we
 * monkey-patch to look up aliases in our in-memory catalog). The fuzzy path
 * calls `db.productAlias.findMany` (which returns the full catalog). The
 * audit-create path calls `db.productMatchAudit.create` (no-op).
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "bun:test";

import { db } from "@/lib/db";
import { invalidateKillSwitchCache, matchProduct } from "@/lib/productMatcher";
import type { MatchInput } from "@/lib/productMatcher";

// ─── Catalog fixture ─────────────────────────────────────────────────────────
//
// 32 products, 33 aliases (some products have both an English + Arabic alias).
// Products 1-17 are the "base" catalog; products 18-32 are the "trap" products
// used by false_positive_trap cases (same brand, different size/capacity/spec).

interface FakeAlias {
  alias: string;
  product: { id: number; name: string; sellingPrice: string };
}

const CATALOG: FakeAlias[] = [
  // Base catalog (products 1-17)
  { alias: "Coca Cola 330ml", product: { id: 1, name: "Coca Cola 330ml", sellingPrice: "2.500" } },
  { alias: "Pepsi 330ml", product: { id: 2, name: "Pepsi 330ml", sellingPrice: "2.000" } },
  { alias: "بيبسي 330", product: { id: 2, name: "Pepsi 330ml", sellingPrice: "2.000" } },
  { alias: "ماء نقي 600مل", product: { id: 3, name: "ماء نقي 600مل", sellingPrice: "1.000" } },
  { alias: "أرز بسمتي 5كجم", product: { id: 4, name: "أرز بسمتي 5كجم", sellingPrice: "25.000" } },
  { alias: "Oil Filter Bosch", product: { id: 5, name: "Oil Filter Bosch", sellingPrice: "15.000" } },
  { alias: "فلتر زيت بوش", product: { id: 5, name: "Oil Filter Bosch", sellingPrice: "15.000" } },
  { alias: "Air Filter Mann", product: { id: 6, name: "Air Filter Mann", sellingPrice: "18.000" } },
  { alias: "فلتر هواء مان", product: { id: 6, name: "Air Filter Mann", sellingPrice: "18.000" } },
  { alias: "Battery Varta 70Ah", product: { id: 7, name: "Battery Varta 70Ah", sellingPrice: "120.000" } },
  { alias: "بطارية فارتا 70", product: { id: 7, name: "Battery Varta 70Ah", sellingPrice: "120.000" } },
  { alias: "Tire Michelin 195", product: { id: 8, name: "Tire Michelin 195", sellingPrice: "80.000" } },
  { alias: "إطار ميشلان 195", product: { id: 8, name: "Tire Michelin 195", sellingPrice: "80.000" } },
  { alias: "Wiper Blade Bosch", product: { id: 9, name: "Wiper Blade Bosch", sellingPrice: "12.000" } },
  { alias: "مساحات بوش", product: { id: 9, name: "Wiper Blade Bosch", sellingPrice: "12.000" } },
  { alias: "Spark Plug NGK", product: { id: 10, name: "Spark Plug NGK", sellingPrice: "8.000" } },
  { alias: "شمعة احتراق NGK", product: { id: 10, name: "Spark Plug NGK", sellingPrice: "8.000" } },
  { alias: "Engine Oil Mobil", product: { id: 11, name: "Engine Oil Mobil", sellingPrice: "45.000" } },
  { alias: "زيت محرك موبيل", product: { id: 11, name: "Engine Oil Mobil", sellingPrice: "45.000" } },
  { alias: "Brake Fluid DOT4", product: { id: 12, name: "Brake Fluid DOT4", sellingPrice: "20.000" } },
  { alias: "زيت فرامل دوت 4", product: { id: 12, name: "Brake Fluid DOT4", sellingPrice: "20.000" } },
  { alias: "Battery Charger", product: { id: 13, name: "Battery Charger", sellingPrice: "60.000" } },
  { alias: "شاحن بطارية", product: { id: 13, name: "Battery Charger", sellingPrice: "60.000" } },
  { alias: "Radiator Hose", product: { id: 14, name: "Radiator Hose", sellingPrice: "25.000" } },
  { alias: "كاوتش راديتر", product: { id: 14, name: "Radiator Hose", sellingPrice: "25.000" } },
  { alias: "AC Belt", product: { id: 15, name: "AC Belt", sellingPrice: "15.000" } },
  { alias: "سير مكيف", product: { id: 15, name: "AC Belt", sellingPrice: "15.000" } },
  { alias: "Wiper Motor", product: { id: 16, name: "Wiper Motor", sellingPrice: "35.000" } },
  { alias: "موتور مساحات", product: { id: 16, name: "Wiper Motor", sellingPrice: "35.000" } },
  { alias: "Aluminum Radiator", product: { id: 17, name: "Aluminum Radiator", sellingPrice: "150.000" } },
  { alias: "راديتر ألمنيوم", product: { id: 17, name: "Aluminum Radiator", sellingPrice: "150.000" } },
  // Trap products (18-32): same brand, different size/capacity/spec — must
  // stay separate from the base product they resemble.
  { alias: "Coca Cola 500ml", product: { id: 18, name: "Coca Cola 500ml", sellingPrice: "3.500" } },
  { alias: "Coca Cola 1L", product: { id: 19, name: "Coca Cola 1L", sellingPrice: "6.000" } },
  { alias: "Pepsi 500ml", product: { id: 20, name: "Pepsi 500ml", sellingPrice: "3.000" } },
  { alias: "Battery Varta 80Ah", product: { id: 21, name: "Battery Varta 80Ah", sellingPrice: "140.000" } },
  { alias: "Tire Michelin 205", product: { id: 22, name: "Tire Michelin 205", sellingPrice: "95.000" } },
  { alias: "Engine Oil Mobil 5W30", product: { id: 23, name: "Engine Oil Mobil 5W30", sellingPrice: "50.000" } },
  { alias: "Brake Fluid DOT3", product: { id: 24, name: "Brake Fluid DOT3", sellingPrice: "18.000" } },
  { alias: "Oil Filter Bosch Premium", product: { id: 25, name: "Oil Filter Bosch Premium", sellingPrice: "22.000" } },
  { alias: "Air Filter Mann Premium", product: { id: 26, name: "Air Filter Mann Premium", sellingPrice: "25.000" } },
  { alias: "Wiper Blade Bosch Rear", product: { id: 27, name: "Wiper Blade Bosch Rear", sellingPrice: "14.000" } },
  { alias: "Spark Plug NGK Iridium", product: { id: 28, name: "Spark Plug NGK Iridium", sellingPrice: "18.000" } },
  { alias: "Battery Varta 60Ah", product: { id: 29, name: "Battery Varta 60Ah", sellingPrice: "100.000" } },
  { alias: "Tire Michelin 185", product: { id: 30, name: "Tire Michelin 185", sellingPrice: "75.000" } },
  { alias: "Engine Oil Mobil 10W40", product: { id: 31, name: "Engine Oil Mobil 10W40", sellingPrice: "48.000" } },
  { alias: "Coca Cola Zero 330ml", product: { id: 32, name: "Coca Cola Zero 330ml", sellingPrice: "2.500" } },
];

// ─── Monkey-patch db properties ──────────────────────────────────────────────

const _orig: Record<string, any> = {};

beforeAll(() => {
  _orig.featureFlag = (db as any).featureFlag;
  _orig.platformSettings = (db as any).platformSettings;
  _orig.productAlias = (db as any).productAlias;
  _orig.productMatchAudit = (db as any).productMatchAudit;

  (db as any).featureFlag = {
    findUnique: async () => ({ key: "product-auto-matching", isActive: true }),
  };
  (db as any).platformSettings = { findMany: async () => [] };

  (db as any).productAlias = {
    findUnique: async (args: any) => {
      const alias = args.where.companySlug_alias.alias;
      // Exact match is CASE-SENSITIVE in the real Prisma schema (alias is a
      // text column without a case-insensitive collation by default). To
      // mirror the production matcher's behavior accurately, we match the
      // alias exactly (no lowercasing) — this matches what the real
      // productAlias.findUnique would return.
      return CATALOG.find(a => a.alias === alias) || null;
    },
    findMany: async () => CATALOG,
  };

  (db as any).productMatchAudit = {
    create: async () => ({}),
    findFirst: async () => null,
  };
});

afterAll(() => {
  (db as any).featureFlag = _orig.featureFlag;
  (db as any).platformSettings = _orig.platformSettings;
  (db as any).productAlias = _orig.productAlias;
  (db as any).productMatchAudit = _orig.productMatchAudit;
});

beforeEach(() => {
  invalidateKillSwitchCache();
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeInput(description: string): MatchInput {
  return {
    description,
    qty: 1,
    price: 1,
    companySlug: "task1-co",
    invoiceId: "preview",
  };
}

interface Case {
  category: string;
  description: string;
  expectedProductId: number | null;
  expectedTier: "auto-match" | "suggested" | "new-product";
}

interface MultiItemCase {
  category: string;
  description: string;
  items: string[];
  expectedProductIds: (number | null)[];
}

// ─── 100 cases ───────────────────────────────────────────────────────────────

const SINGLE_ITEM_CASES: Case[] = [
  // ─── exact_match_ar (15) ──────────────────────────────────────────────
  { category: "exact_match_ar", description: "بيبسي 330", expectedProductId: 2, expectedTier: "auto-match" },
  { category: "exact_match_ar", description: "ماء نقي 600مل", expectedProductId: 3, expectedTier: "auto-match" },
  { category: "exact_match_ar", description: "أرز بسمتي 5كجم", expectedProductId: 4, expectedTier: "auto-match" },
  { category: "exact_match_ar", description: "فلتر زيت بوش", expectedProductId: 5, expectedTier: "auto-match" },
  { category: "exact_match_ar", description: "فلتر هواء مان", expectedProductId: 6, expectedTier: "auto-match" },
  { category: "exact_match_ar", description: "بطارية فارتا 70", expectedProductId: 7, expectedTier: "auto-match" },
  { category: "exact_match_ar", description: "إطار ميشلان 195", expectedProductId: 8, expectedTier: "auto-match" },
  { category: "exact_match_ar", description: "مساحات بوش", expectedProductId: 9, expectedTier: "auto-match" },
  { category: "exact_match_ar", description: "شمعة احتراق NGK", expectedProductId: 10, expectedTier: "auto-match" },
  { category: "exact_match_ar", description: "زيت محرك موبيل", expectedProductId: 11, expectedTier: "auto-match" },
  { category: "exact_match_ar", description: "زيت فرامل دوت 4", expectedProductId: 12, expectedTier: "auto-match" },
  { category: "exact_match_ar", description: "شاحن بطارية", expectedProductId: 13, expectedTier: "auto-match" },
  { category: "exact_match_ar", description: "كاوتش راديتر", expectedProductId: 14, expectedTier: "auto-match" },
  { category: "exact_match_ar", description: "سير مكيف", expectedProductId: 15, expectedTier: "auto-match" },
  { category: "exact_match_ar", description: "موتور مساحات", expectedProductId: 16, expectedTier: "auto-match" },

  // ─── exact_match_en (10) ──────────────────────────────────────────────
  { category: "exact_match_en", description: "Coca Cola 330ml", expectedProductId: 1, expectedTier: "auto-match" },
  { category: "exact_match_en", description: "Pepsi 330ml", expectedProductId: 2, expectedTier: "auto-match" },
  { category: "exact_match_en", description: "Oil Filter Bosch", expectedProductId: 5, expectedTier: "auto-match" },
  { category: "exact_match_en", description: "Air Filter Mann", expectedProductId: 6, expectedTier: "auto-match" },
  { category: "exact_match_en", description: "Battery Varta 70Ah", expectedProductId: 7, expectedTier: "auto-match" },
  { category: "exact_match_en", description: "Tire Michelin 195", expectedProductId: 8, expectedTier: "auto-match" },
  { category: "exact_match_en", description: "Wiper Blade Bosch", expectedProductId: 9, expectedTier: "auto-match" },
  { category: "exact_match_en", description: "Spark Plug NGK", expectedProductId: 10, expectedTier: "auto-match" },
  { category: "exact_match_en", description: "Engine Oil Mobil", expectedProductId: 11, expectedTier: "auto-match" },
  { category: "exact_match_en", description: "Brake Fluid DOT4", expectedProductId: 12, expectedTier: "auto-match" },

  // ─── arabic_normalization (15) ────────────────────────────────────────
  // Each input is a variant of a real alias — different case/diacritics/alef
  // variant/ta-marbuta/whitespace/leading ال. The matcher normalizes both
  // sides and matches at confidence 0.95.
  { category: "arabic_normalization", description: "البيبسي 330", expectedProductId: 2, expectedTier: "auto-match" },
  { category: "arabic_normalization", description: "مَاء نَقِي 600مل", expectedProductId: 3, expectedTier: "auto-match" },
  { category: "arabic_normalization", description: "ارز بسمتي 5كجم", expectedProductId: 4, expectedTier: "auto-match" },
  { category: "arabic_normalization", description: "بطاريه فارتا 70", expectedProductId: 7, expectedTier: "auto-match" },
  { category: "arabic_normalization", description: "اطار ميشلان 195", expectedProductId: 8, expectedTier: "auto-match" },
  { category: "arabic_normalization", description: "فلتر هَواء مان", expectedProductId: 6, expectedTier: "auto-match" },
  { category: "arabic_normalization", description: "مساحات  بوش", expectedProductId: 9, expectedTier: "auto-match" },
  { category: "arabic_normalization", description: "الشمعة احتراق NGK", expectedProductId: 10, expectedTier: "auto-match" },
  { category: "arabic_normalization", description: "زيت  محرك  موبيل", expectedProductId: 11, expectedTier: "auto-match" },
  { category: "arabic_normalization", description: "زيت  فرامل دوت 4", expectedProductId: 12, expectedTier: "auto-match" },
  { category: "arabic_normalization", description: "شاحن بطاريه", expectedProductId: 13, expectedTier: "auto-match" },
  { category: "arabic_normalization", description: "كاوتش  راديتر", expectedProductId: 14, expectedTier: "auto-match" },
  { category: "arabic_normalization", description: "السير مكيف", expectedProductId: 15, expectedTier: "auto-match" },
  { category: "arabic_normalization", description: "موتور  مساحات", expectedProductId: 16, expectedTier: "auto-match" },
  { category: "arabic_normalization", description: "راديتر المنيوم", expectedProductId: 17, expectedTier: "auto-match" },

  // ─── fuzzy_typo (10) ──────────────────────────────────────────────────
  // 1-char typo / extra char / missing char — fuzzy match at >= 0.85.
  { category: "fuzzy_typo", description: "Coca Colo 330ml", expectedProductId: 1, expectedTier: "auto-match" },
  { category: "fuzzy_typo", description: "Pepsi 330m", expectedProductId: 2, expectedTier: "auto-match" },
  { category: "fuzzy_typo", description: "Oil Filter Bosh", expectedProductId: 5, expectedTier: "auto-match" },
  { category: "fuzzy_typo", description: "Air Filter Man", expectedProductId: 6, expectedTier: "auto-match" },
  { category: "fuzzy_typo", description: "Battery Varta 70A", expectedProductId: 7, expectedTier: "auto-match" },
  { category: "fuzzy_typo", description: "Tire Michelin 196", expectedProductId: 8, expectedTier: "auto-match" },
  { category: "fuzzy_typo", description: "Wiper Blade Boschs", expectedProductId: 9, expectedTier: "auto-match" },
  { category: "fuzzy_typo", description: "Spark Plag NGK", expectedProductId: 10, expectedTier: "auto-match" },
  { category: "fuzzy_typo", description: "Engine Oil Mobel", expectedProductId: 11, expectedTier: "auto-match" },
  { category: "fuzzy_typo", description: "Brake Fluid DOT5", expectedProductId: 12, expectedTier: "auto-match" },

  // ─── false_positive_trap (15) ─────────────────────────────────────────
  // Each input is an EXACT alias for a "trap" product (same brand, different
  // size/capacity/spec). The catalog contains BOTH the trap product AND its
  // similar-looking sibling. The matcher must resolve to the EXACT trap product
  // (NOT the sibling) — exact-match wins over fuzzy.
  { category: "false_positive_trap", description: "Coca Cola 500ml", expectedProductId: 18, expectedTier: "auto-match" },
  { category: "false_positive_trap", description: "Coca Cola 1L", expectedProductId: 19, expectedTier: "auto-match" },
  { category: "false_positive_trap", description: "Pepsi 500ml", expectedProductId: 20, expectedTier: "auto-match" },
  { category: "false_positive_trap", description: "Battery Varta 80Ah", expectedProductId: 21, expectedTier: "auto-match" },
  { category: "false_positive_trap", description: "Tire Michelin 205", expectedProductId: 22, expectedTier: "auto-match" },
  { category: "false_positive_trap", description: "Engine Oil Mobil 5W30", expectedProductId: 23, expectedTier: "auto-match" },
  { category: "false_positive_trap", description: "Brake Fluid DOT3", expectedProductId: 24, expectedTier: "auto-match" },
  { category: "false_positive_trap", description: "Oil Filter Bosch Premium", expectedProductId: 25, expectedTier: "auto-match" },
  { category: "false_positive_trap", description: "Air Filter Mann Premium", expectedProductId: 26, expectedTier: "auto-match" },
  { category: "false_positive_trap", description: "Wiper Blade Bosch Rear", expectedProductId: 27, expectedTier: "auto-match" },
  { category: "false_positive_trap", description: "Spark Plug NGK Iridium", expectedProductId: 28, expectedTier: "auto-match" },
  { category: "false_positive_trap", description: "Battery Varta 60Ah", expectedProductId: 29, expectedTier: "auto-match" },
  { category: "false_positive_trap", description: "Tire Michelin 185", expectedProductId: 30, expectedTier: "auto-match" },
  { category: "false_positive_trap", description: "Engine Oil Mobil 10W40", expectedProductId: 31, expectedTier: "auto-match" },
  { category: "false_positive_trap", description: "Coca Cola Zero 330ml", expectedProductId: 32, expectedTier: "auto-match" },

  // ─── new_product (10) ─────────────────────────────────────────────────
  // Completely unrelated inputs — must NOT match anything in the catalog.
  { category: "new_product", description: "Quantum Physics Textbook", expectedProductId: null, expectedTier: "new-product" },
  { category: "new_product", description: "Hoverboard X1 Pro", expectedProductId: null, expectedTier: "new-product" },
  { category: "new_product", description: "Kitchen Sink Stainless", expectedProductId: null, expectedTier: "new-product" },
  { category: "new_product", description: "Office Chair Ergonomic", expectedProductId: null, expectedTier: "new-product" },
  { category: "new_product", description: "Gaming Mouse RGB", expectedProductId: null, expectedTier: "new-product" },
  { category: "new_product", description: "Sunglasses Aviator", expectedProductId: null, expectedTier: "new-product" },
  { category: "new_product", description: "Leather Wallet Brown", expectedProductId: null, expectedTier: "new-product" },
  { category: "new_product", description: "Perfume Chanel 100ml", expectedProductId: null, expectedTier: "new-product" },
  { category: "new_product", description: "Coffee Beans 1kg Arabica", expectedProductId: null, expectedTier: "new-product" },
  { category: "new_product", description: "Yoga Mat Purple Premium", expectedProductId: null, expectedTier: "new-product" },

  // ─── arabic_indic_numerals (5) ────────────────────────────────────────
  // ٠-٩ digits in input → normalizeArabic converts to ASCII 0-9 → matches.
  { category: "arabic_indic_numerals", description: "بيبسي ٣٣٠", expectedProductId: 2, expectedTier: "auto-match" },
  { category: "arabic_indic_numerals", description: "ماء نقي ٦٠٠مل", expectedProductId: 3, expectedTier: "auto-match" },
  { category: "arabic_indic_numerals", description: "أرز بسمتي ٥كجم", expectedProductId: 4, expectedTier: "auto-match" },
  { category: "arabic_indic_numerals", description: "بطارية فارتا ٧٠", expectedProductId: 7, expectedTier: "auto-match" },
  { category: "arabic_indic_numerals", description: "إطار ميشلان ١٩٥", expectedProductId: 8, expectedTier: "auto-match" },

  // ─── purchase_invoice (5) ─────────────────────────────────────────────
  // Same as exact_match — the matcher is the SAME for sale + purchase paths.
  // These cases just verify the matcher resolves correctly for inputs that
  // would typically appear on a purchase invoice (restocking common parts).
  { category: "purchase_invoice", description: "Oil Filter Bosch", expectedProductId: 5, expectedTier: "auto-match" },
  { category: "purchase_invoice", description: "Air Filter Mann", expectedProductId: 6, expectedTier: "auto-match" },
  { category: "purchase_invoice", description: "Battery Varta 70Ah", expectedProductId: 7, expectedTier: "auto-match" },
  { category: "purchase_invoice", description: "Tire Michelin 195", expectedProductId: 8, expectedTier: "auto-match" },
  { category: "purchase_invoice", description: "Spark Plug NGK", expectedProductId: 10, expectedTier: "auto-match" },
];

const MULTI_ITEM_CASES: MultiItemCase[] = [
  // ─── multi_item_invoice (10) ──────────────────────────────────────────
  // Each case is an invoice with 3-5 items. Every item must match.
  {
    category: "multi_item_invoice",
    description: "3-item invoice: cola + pepsi + water",
    items: ["Coca Cola 330ml", "Pepsi 330ml", "ماء نقي 600مل"],
    expectedProductIds: [1, 2, 3],
  },
  {
    category: "multi_item_invoice",
    description: "3-item invoice: filters + spark plug",
    items: ["Oil Filter Bosch", "Air Filter Mann", "Spark Plug NGK"],
    expectedProductIds: [5, 6, 10],
  },
  {
    category: "multi_item_invoice",
    description: "3-item Arabic invoice: battery + tire + wiper",
    items: ["بطارية فارتا 70", "إطار ميشلان 195", "مساحات بوش"],
    expectedProductIds: [7, 8, 9],
  },
  {
    category: "multi_item_invoice",
    description: "3-item invoice: oil + brake fluid + charger",
    items: ["Engine Oil Mobil", "Brake Fluid DOT4", "Battery Charger"],
    expectedProductIds: [11, 12, 13],
  },
  {
    category: "multi_item_invoice",
    description: "4-item invoice: cooling parts",
    items: ["Radiator Hose", "AC Belt", "Wiper Motor", "Aluminum Radiator"],
    expectedProductIds: [14, 15, 16, 17],
  },
  {
    category: "multi_item_invoice",
    description: "3-item trap invoice: 500ml variants",
    items: ["Coca Cola 500ml", "Pepsi 500ml", "Coca Cola 1L"],
    expectedProductIds: [18, 20, 19],
  },
  {
    category: "multi_item_invoice",
    description: "2-item premium trap invoice",
    items: ["Oil Filter Bosch Premium", "Air Filter Mann Premium"],
    expectedProductIds: [25, 26],
  },
  {
    category: "multi_item_invoice",
    description: "3-item Arabic staples invoice",
    items: ["بيبسي 330", "ماء نقي 600مل", "أرز بسمتي 5كجم"],
    expectedProductIds: [2, 3, 4],
  },
  {
    category: "multi_item_invoice",
    description: "4-item mixed parts invoice",
    items: ["Wiper Blade Bosch", "Spark Plug NGK", "Engine Oil Mobil", "Brake Fluid DOT4"],
    expectedProductIds: [9, 10, 11, 12],
  },
  {
    category: "multi_item_invoice",
    description: "3-item tire + battery + filter invoice",
    items: ["Tire Michelin 195", "Battery Varta 70Ah", "Air Filter Mann"],
    expectedProductIds: [8, 7, 6],
  },

  // ─── mixed_language (5) ───────────────────────────────────────────────
  // Invoices with both Arabic + English items in the same invoice.
  {
    category: "mixed_language",
    description: "mixed: English + Arabic beverages",
    items: ["Coca Cola 330ml", "بيبسي 330", "ماء نقي 600مل"],
    expectedProductIds: [1, 2, 3],
  },
  {
    category: "mixed_language",
    description: "mixed: English + Arabic filters",
    items: ["Oil Filter Bosch", "فلتر هواء مان", "Spark Plug NGK"],
    expectedProductIds: [5, 6, 10],
  },
  {
    category: "mixed_language",
    description: "mixed: Arabic battery + English tire + Arabic wiper",
    items: ["بطارية فارتا 70", "Tire Michelin 195", "مساحات بوش"],
    expectedProductIds: [7, 8, 9],
  },
  {
    category: "mixed_language",
    description: "mixed: English oil + Arabic brake fluid + English charger",
    items: ["Engine Oil Mobil", "زيت فرامل دوت 4", "Battery Charger"],
    expectedProductIds: [11, 12, 13],
  },
  {
    category: "mixed_language",
    description: "mixed: Arabic + English filter + battery",
    items: ["فلتر زيت بوش", "Air Filter Mann", "بطارية فارتا 70"],
    expectedProductIds: [5, 6, 7],
  },
];

// Sanity: 70 single + 15 multi = 85 cases... wait — 70 single + 15 multi = 85.
// But the spec wants 100 cases. Let me recount:
//   exact_match_ar (15) + exact_match_en (10) + arabic_normalization (15)
//   + fuzzy_typo (10) + false_positive_trap (15) + new_product (10)
//   + arabic_indic_numerals (5) + purchase_invoice (5) = 85 single-item
//   + multi_item_invoice (10) + mixed_language (5) = 15 multi-item
//   TOTAL = 100 cases ✓
//
// Each multi-item case counts as ONE case in the 100-case matrix (per the
// spec — multi_item_invoice is a category of invoice, not of item).

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("Task 1 — 100-case product matching matrix", () => {
  // Single-item cases (85 total) — one it() per category, iterated.
  describe("single-item cases", () => {
    // Group by category so failures are easy to triage.
    const categories = [...new Set(SINGLE_ITEM_CASES.map(c => c.category))];

    for (const cat of categories) {
      it(`${cat} — ${SINGLE_ITEM_CASES.filter(c => c.category === cat).length} cases all match expected tier + productId`, async () => {
        const cases = SINGLE_ITEM_CASES.filter(c => c.category === cat);
        for (const c of cases) {
          const r = await matchProduct(makeInput(c.description));
          expect(r.productId).toBe(c.expectedProductId);
          expect(r.tier).toBe(c.expectedTier);
          if (c.expectedProductId !== null) {
            expect(r.isNewProduct).toBe(false);
          } else {
            expect(r.isNewProduct).toBe(true);
          }
        }
      });
    }
  });

  describe("multi-item invoices", () => {
    for (let i = 0; i < MULTI_ITEM_CASES.length; i++) {
      const inv = MULTI_ITEM_CASES[i];
      it(`${inv.category} #${i + 1}: ${inv.description} (${inv.items.length} items)`, async () => {
        expect(inv.items.length).toBe(inv.expectedProductIds.length);
        for (let j = 0; j < inv.items.length; j++) {
          const r = await matchProduct(makeInput(inv.items[j]));
          expect(r.productId).toBe(inv.expectedProductIds[j]);
          if (inv.expectedProductIds[j] !== null) {
            expect(r.tier).toBe("auto-match");
          } else {
            expect(r.tier).toBe("new-product");
          }
        }
      });
    }
  });

  // Final sanity check: total case count is exactly 100.
  it("total case count is exactly 100 (15+10+15+10+15+10+10+5+5 + 10+5 multi)", () => {
    const single = SINGLE_ITEM_CASES.length;
    const multi = MULTI_ITEM_CASES.length;
    expect(single).toBe(85);
    expect(multi).toBe(15);
    expect(single + multi).toBe(100);
  });
});

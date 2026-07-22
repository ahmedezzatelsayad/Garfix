/**
 * cross-company-intelligence.ts — Phase 12: Cross-company de-identified pattern sharing.
 *
 * When AI resolves a product matching/classification with high confidence (>= 0.90),
 * the result contributes to a GLOBAL pattern pool. This enables faster resolution
 * for other companies facing the same product classification challenge.
 *
 * PRIVACY GUARANTEE:
 *   - Only product name (normalized), SKU, VAT category, and category are stored
 *   - NEVER: price, quantity, customer name, company data, financial data
 *   - The contributePattern() function VERIFIES the input contains no sensitive fields
 *     BEFORE storing anything
 *   - contributingCompaniesCount is an opaque integer — no company IDs stored
 *
 * Exports:
 *   contributePattern(normalizedProduct, sku, vatCategory, category, confidence?) → boolean
 *   lookupGlobalPattern(normalizedProductName) → GlobalPatternData | null
 *   getPatternStats() → PatternStats
 */

import { db } from "@/lib/db";
import { logger } from "@/lib/logger";

// ─── Constants ──────────────────────────────────────────────────────────────

/** Minimum confidence required to contribute a pattern. */
const MIN_CONTRIBUTION_CONFIDENCE = 0.90;

/**
 * Fields that are ABSOLUTELY FORBIDDEN from being stored in GlobalPattern.
 * If any of these keys appear in the input data, the contribution is rejected.
 */
const FORBIDDEN_KEYS = [
  "price", "total", "amount", "subtotal", "tax", "discount",
  "customer", "client", "buyer", "vendor", "seller",
  "company", "companyId", "companySlug", "companyName",
  "invoice", "invoiceId", "invoiceNumber",
  "email", "phone", "address", "vatNumber",
  "quantity", "qty", "units",
  "currency", "rate", "bank", "iban",
  // Financial fields
  "revenue", "cost", "profit", "margin", "balance",
  "payment", "paid", "due", "overdue",
] as const;

// ─── Types ──────────────────────────────────────────────────────────────────

export interface GlobalPatternData {
  patternKey: string;
  suggestedSku: string | null;
  suggestedVatCategory: string | null;
  suggestedCategory: string | null;
  contributingCompaniesCount: number;
  confidence: number;
}

export interface PatternStats {
  totalPatterns: number;
  avgConfidence: number;
  avgContributingCompanies: number;
  topPatterns: GlobalPatternData[];
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Contribute a pattern to the global cross-company pool.
 *
 * PRIVACY: This function performs a strict filter check BEFORE storing.
 * Only product name, SKU, VAT category, and category are allowed.
 * If the input contains any forbidden keys, the contribution is silently
 * dropped (logged as warning).
 *
 * @param normalizedProduct - Normalized product name (e.g. "apple charger")
 * @param sku - Suggested SKU for this product
 * @param vatCategory - Suggested VAT category
 * @param category - Suggested product category
 * @param confidence - AI confidence for this classification (default: 1.0)
 * @returns true if the pattern was stored, false if rejected
 */
export async function contributePattern(
  normalizedProduct: string,
  sku: string,
  vatCategory: string,
  category: string,
  confidence: number = 1.0,
): Promise<boolean> {
  // ── Step 1: Privacy verification ───────────────────────────────────────
  if (!verifyNoSensitiveData(normalizedProduct, sku, vatCategory, category)) {
    logger.warn("[cross-company] rejected pattern: contains sensitive data", {
      normalizedProduct,
    });
    return false;
  }

  // ── Step 2: Confidence check ───────────────────────────────────────────
  if (confidence < MIN_CONTRIBUTION_CONFIDENCE) {
    return false;
  }

  // ── Step 3: Normalize the pattern key ──────────────────────────────────
  const patternKey = normalizeProductKey(normalizedProduct);

  // ── Step 4: Upsert into GlobalPattern ──────────────────────────────────
  const existing = await db.globalPattern.findUnique({
    where: { patternKey },
  });

  if (existing) {
    const newCount = existing.contributingCompaniesCount + 1;
    const newConfidence = Math.round(
      ((existing.confidence * existing.contributingCompaniesCount + confidence) / newCount) * 10000,
    ) / 10000;

    await db.globalPattern.update({
      where: { patternKey },
      data: {
        contributingCompaniesCount: newCount,
        confidence: newConfidence,
        suggestedSku: existing.suggestedSku || sku || null,
        suggestedVatCategory: existing.suggestedVatCategory || vatCategory || null,
        suggestedCategory: existing.suggestedCategory || category || null,
      },
    });
  } else {
    await db.globalPattern.create({
      data: {
        patternKey,
        suggestedSku: sku || null,
        suggestedVatCategory: vatCategory || null,
        suggestedCategory: category || null,
        contributingCompaniesCount: 1,
        confidence,
      },
    });
  }

  return true;
}

/**
 * Look up a global pattern by normalized product name.
 *
 * @param normalizedProductName - The product name to look up
 * @returns The global pattern data, or null
 */
export async function lookupGlobalPattern(
  normalizedProductName: string,
): Promise<GlobalPatternData | null> {
  const patternKey = normalizeProductKey(normalizedProductName);

  const pattern = await db.globalPattern.findUnique({
    where: { patternKey },
  });

  if (!pattern) return null;

  return {
    patternKey: pattern.patternKey,
    suggestedSku: pattern.suggestedSku,
    suggestedVatCategory: pattern.suggestedVatCategory,
    suggestedCategory: pattern.suggestedCategory,
    contributingCompaniesCount: pattern.contributingCompaniesCount,
    confidence: pattern.confidence,
  };
}

/**
 * Get statistics about the global pattern pool.
 *
 * @returns Aggregate statistics and top patterns
 */
export async function getPatternStats(): Promise<PatternStats> {
  const totalPatterns = await db.globalPattern.count();

  const agg = await db.globalPattern.aggregate({
    _avg: {
      confidence: true,
      contributingCompaniesCount: true,
    },
  });

  const topPatterns = await db.globalPattern.findMany({
    orderBy: { contributingCompaniesCount: "desc" },
    take: 10,
  });

  return {
    totalPatterns,
    avgConfidence: Math.round((agg._avg.confidence ?? 0) * 10000) / 10000,
    avgContributingCompanies: Math.round((agg._avg.contributingCompaniesCount ?? 0) * 100) / 100,
    topPatterns: topPatterns.map((p) => ({
      patternKey: p.patternKey,
      suggestedSku: p.suggestedSku,
      suggestedVatCategory: p.suggestedVatCategory,
      suggestedCategory: p.suggestedCategory,
      contributingCompaniesCount: p.contributingCompaniesCount,
      confidence: p.confidence,
    })),
  };
}

// ─── Privacy Verification ──────────────────────────────────────────────────

/**
 * Verify that the input data contains NO sensitive/forbidden information.
 *
 * Checks each string value against a list of forbidden keys (case-insensitive
 * substring match). This is the critical privacy gate — it runs BEFORE any
 * data is stored.
 */
export function verifyNoSensitiveData(
  normalizedProduct: string,
  sku: string,
  vatCategory: string,
  category: string,
): boolean {
  const allValues = [normalizedProduct, sku, vatCategory, category];

  for (const value of allValues) {
    const lower = value.toLowerCase();
    for (const forbidden of FORBIDDEN_KEYS) {
      if (lower.includes(forbidden.toLowerCase())) {
        return false;
      }
    }
  }

  return true;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Normalize a product name for use as a pattern key.
 * Lowercase, trim, collapse whitespace.
 */
function normalizeProductKey(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}
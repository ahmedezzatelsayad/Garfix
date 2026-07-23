/**
 * zatca-validation.ts — ZATCA Phase 2 invoice validation middleware.
 *
 * Middleware function that runs when a Saudi company creates/updates an invoice.
 * Auto-detects Saudi companies via `company.country === 'SA'`.
 *
 * Responsibilities:
 * - Blocks invoice creation if mandatory ZATCA fields are missing
 * - Auto-populates UUID, Hijri dates, VAT TRN, Arabic fields
 * - Enforces SAR currency and 2-decimal precision
 * - Enforces 15% VAT rate
 * - Sets invoice type classification (standard/simplified)
 * - Validates B2B/B2C classification consistency
 *
 * Follows the same middleware pattern as kuwait-validation.ts.
 */

import { getCountryConfig } from "@/lib/gulfConfig";
import { validateZatcaInvoice, autoPopulateZatcaFields, ZATCA_CURRENCY, ZATCA_DECIMAL_PLACES, ZATCA_VAT_RATE, ZATCA_AUTHORITY } from "@/lib/e-invoicing/zatca";
import { logger } from "@/lib/logger";

// ── Types ──────────────────────────────────────────────────────────────────

export interface ZatcaValidationMiddlewareResult {
  /** Whether the invoice is valid for ZATCA compliance */
  valid: boolean;
  /** The invoice data with ZATCA fields auto-populated */
  enrichedData: Record<string, unknown>;
  /** Validation errors that block invoice creation (Arabic messages) */
  blockingErrors: Array<{ field: string; messageAr: string; messageEn: string }>;
  /** Validation warnings (advisory, not blocking) */
  warnings: Array<{ field: string; messageAr: string; messageEn: string }>;
}

// ── Middleware ──────────────────────────────────────────────────────────────

/**
 * zatcaInvoiceValidationMiddleware — Validates and enriches invoice data
 * for Saudi companies per ZATCA Phase 2 regulations.
 *
 * This function is called before invoice creation/update to:
 * 1. Auto-populate ZATCA-specific fields (UUID, Hijri dates, VAT TRN, etc.)
 * 2. Validate ZATCA compliance requirements
 * 3. Block creation if mandatory fields are missing
 *
 * @param invoiceData - The raw invoice data from the API request
 * @param company - The company record (must include country, vatNumber, nameAr, etc.)
 * @returns Middleware result with enriched data, validation errors, and warnings
 */
export function zatcaInvoiceValidationMiddleware(
  invoiceData: Record<string, unknown>,
  company: Record<string, unknown>,
): ZatcaValidationMiddlewareResult {
  // ── Step 0: Check if company is Saudi ────────────────────────────────
  const countryCode = company.country as string;
  if (countryCode !== "SA") {
    // Not a Saudi company — pass through without validation
    logger.debug("[zatca-validation] skipping non-Saudi company", { country: countryCode });
    return {
      valid: true,
      enrichedData: invoiceData,
      blockingErrors: [],
      warnings: [],
    };
  }

  logger.info("[zatca-validation] processing Saudi invoice", {
    companySlug: company.slug,
    invoiceNumber: invoiceData.invoiceNumber,
    regulation: "ZATCA Phase 2",
  });

  // ── Step 1: Enforce SAR currency for Saudi companies ─────────────────
  if (invoiceData.currency && invoiceData.currency !== ZATCA_CURRENCY) {
    logger.warn("[zatca-validation] overriding non-SAR currency for Saudi company", {
      originalCurrency: invoiceData.currency,
      enforcedCurrency: ZATCA_CURRENCY,
    });
  }
  // Override currency to SAR regardless of what was submitted
  invoiceData.currency = ZATCA_CURRENCY;
  invoiceData.currencyDecimalPlaces = ZATCA_DECIMAL_PLACES;

  // ── Step 2: Enforce 15% VAT rate ─────────────────────────────────────
  const currentTaxRate = parseFloat(
    (invoiceData.taxRate as string) || (company.defaultTaxRate as string) || "0"
  );
  if (currentTaxRate !== ZATCA_VAT_RATE) {
    logger.info("[zatca-validation] enforcing 15% VAT rate for Saudi company", {
      originalRate: currentTaxRate,
      enforcedRate: ZATCA_VAT_RATE,
    });
    invoiceData.taxRate = ZATCA_VAT_RATE.toFixed(ZATCA_DECIMAL_PLACES);
  }

  // ── Step 3: Auto-populate ZATCA-specific fields ──────────────────────
  const enrichedData = autoPopulateZatcaFields(invoiceData, company);

  // ── Step 4: Run validation on enriched data ───────────────────────────
  const validationResult = validateZatcaInvoice(enrichedData, company);

  // ── Step 5: Separate blocking errors from warnings ────────────────────
  const blockingErrors = validationResult.errors.map((e) => ({
    field: e.field,
    messageAr: e.messageAr,
    messageEn: e.messageEn,
  }));

  const warnings = validationResult.warnings.map((w) => ({
    field: w.field,
    messageAr: w.messageAr,
    messageEn: w.messageEn,
  }));

  // ── Step 6: Log results ───────────────────────────────────────────────
  if (blockingErrors.length > 0) {
    logger.warn("[zatca-validation] Saudi invoice validation blocked", {
      companySlug: company.slug,
      invoiceNumber: enrichedData.invoiceNumber,
      errorCount: blockingErrors.length,
      errors: blockingErrors.map((e) => e.messageEn),
    });
  } else {
    logger.info("[zatca-validation] Saudi invoice validation passed", {
      companySlug: company.slug,
      invoiceNumber: enrichedData.invoiceNumber,
      warningCount: warnings.length,
    });
  }

  return {
    valid: validationResult.valid,
    enrichedData,
    blockingErrors,
    warnings,
  };
}

// ── Helper: Apply ZATCA compliance to invoice create/update data ──────────

/**
 * applyZatcaCompliance — Applies ZATCA Phase 2 compliance to
 * invoice create/update data.
 *
 * This is a convenience function that combines validation and auto-population.
 * It returns enriched data ready for Prisma create/update, plus any
 * validation errors.
 *
 * @param invoiceData - Raw invoice data from API request
 * @param company - Company record with Saudi fields (vatNumber, nameAr, etc.)
 * @returns Enriched data + validation result. If not valid, the caller
 *          should return a 400 response with the Arabic error messages.
 */
export function applyZatcaCompliance(
  invoiceData: Record<string, unknown>,
  company: Record<string, unknown>,
): ZatcaValidationMiddlewareResult {
  return zatcaInvoiceValidationMiddleware(invoiceData, company);
}

// ── Helper: Format validation errors for API response ──────────────────────

/**
 * formatZatcaErrorsForResponse — Formats ZATCA validation errors into
 * a consistent API error response structure.
 *
 * Returns Arabic messages as the primary error text, with English messages
 * as additional context for developer debugging.
 */
export function formatZatcaErrorsForResponse(
  result: ZatcaValidationMiddlewareResult,
): { error: string; details: Record<string, unknown> } {
  if (result.blockingErrors.length === 0) {
    return { error: "", details: {} };
  }

  // Primary error: first Arabic message
  const allErrorsAr = result.blockingErrors.map((e) => e.messageAr).join("؛ ");
  const allErrorsEn = result.blockingErrors.map((e) => e.messageEn).join("; ");

  return {
    error: allErrorsAr,
    details: {
      regulation: "ZATCA Phase 2",
      errorsAr: result.blockingErrors.map((e) => ({ field: e.field, message: e.messageAr })),
      errorsEn: result.blockingErrors.map((e) => ({ field: e.field, message: e.messageEn })),
      warnings: result.warnings,
    },
  };
}

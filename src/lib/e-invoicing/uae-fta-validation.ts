/**
 * uae-fta-validation.ts — UAE FTA e-invoicing validation middleware.
 *
 * Middleware function that runs when a UAE company creates/updates an invoice.
 * Auto-detects UAE companies via `company.country === 'AE'`.
 *
 * Responsibilities:
 * - Blocks invoice creation if mandatory UAE FTA fields are missing
 * - Auto-populates UUID, Hijri dates, TRN, English fields
 * - Enforces AED currency and 2-decimal precision
 * - Enforces 5% VAT rate
 * - Sets invoice type classification (standard/simplified)
 * - Validates B2B/B2C classification consistency
 * - Recommends Arabic fields (optional for UAE)
 *
 * Follows the same middleware pattern as kuwait-validation.ts and zatca-validation.ts.
 */

import { getCountryConfig } from "@/lib/gulfConfig";
import { validateUaeFtaInvoice, autoPopulateUaeFtaFields, UAE_FTA_CURRENCY, UAE_FTA_DECIMAL_PLACES, UAE_FTA_VAT_RATE, UAE_FTA_AUTHORITY } from "@/lib/e-invoicing/uae-fta";
import { logger } from "@/lib/logger";

// ── Types ──────────────────────────────────────────────────────────────────

export interface UaeFtaValidationMiddlewareResult {
  /** Whether the invoice is valid for UAE FTA compliance */
  valid: boolean;
  /** The invoice data with UAE FTA fields auto-populated */
  enrichedData: Record<string, unknown>;
  /** Validation errors that block invoice creation (Arabic messages) */
  blockingErrors: Array<{ field: string; messageAr: string; messageEn: string }>;
  /** Validation warnings (advisory, not blocking) */
  warnings: Array<{ field: string; messageAr: string; messageEn: string }>;
}

// ── Middleware ──────────────────────────────────────────────────────────────

/**
 * uaeFtaInvoiceValidationMiddleware — Validates and enriches invoice data
 * for UAE companies per FTA e-invoicing (Peppol BIS 3) regulations.
 *
 * This function is called before invoice creation/update to:
 * 1. Auto-populate UAE FTA-specific fields (UUID, Hijri dates, TRN, etc.)
 * 2. Validate UAE FTA compliance requirements
 * 3. Block creation if mandatory fields are missing
 *
 * @param invoiceData - The raw invoice data from the API request
 * @param company - The company record (must include country, vatNumber, name, etc.)
 * @returns Middleware result with enriched data, validation errors, and warnings
 */
export function uaeFtaInvoiceValidationMiddleware(
  invoiceData: Record<string, unknown>,
  company: Record<string, unknown>,
): UaeFtaValidationMiddlewareResult {
  // ── Step 0: Check if company is UAE ──────────────────────────────────
  const countryCode = company.country as string;
  if (countryCode !== "AE") {
    // Not a UAE company — pass through without validation
    logger.debug("[uae-fta-validation] skipping non-UAE company", { country: countryCode });
    return {
      valid: true,
      enrichedData: invoiceData,
      blockingErrors: [],
      warnings: [],
    };
  }

  logger.info("[uae-fta-validation] processing UAE invoice", {
    companySlug: company.slug,
    invoiceNumber: invoiceData.invoiceNumber,
    regulation: UAE_FTA_AUTHORITY,
  });

  // ── Step 1: Enforce AED currency for UAE companies ───────────────────
  if (invoiceData.currency && invoiceData.currency !== UAE_FTA_CURRENCY) {
    logger.warn("[uae-fta-validation] overriding non-AED currency for UAE company", {
      originalCurrency: invoiceData.currency,
      enforcedCurrency: UAE_FTA_CURRENCY,
    });
  }
  // Override currency to AED regardless of what was submitted
  invoiceData.currency = UAE_FTA_CURRENCY;
  invoiceData.currencyDecimalPlaces = UAE_FTA_DECIMAL_PLACES;

  // ── Step 2: Enforce 5% VAT rate ──────────────────────────────────────
  const currentTaxRate = parseFloat(
    (invoiceData.taxRate as string) || (company.defaultTaxRate as string) || "0"
  );
  if (currentTaxRate !== UAE_FTA_VAT_RATE) {
    logger.info("[uae-fta-validation] enforcing 5% VAT rate for UAE company", {
      originalRate: currentTaxRate,
      enforcedRate: UAE_FTA_VAT_RATE,
    });
    invoiceData.taxRate = UAE_FTA_VAT_RATE.toFixed(UAE_FTA_DECIMAL_PLACES);
  }

  // ── Step 3: Auto-populate UAE FTA-specific fields ────────────────────
  const enrichedData = autoPopulateUaeFtaFields(invoiceData, company);

  // ── Step 4: Run validation on enriched data ───────────────────────────
  const validationResult = validateUaeFtaInvoice(enrichedData, company);

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

  // ── Step 6: Log results ──────────────────────────────────────────────
  if (blockingErrors.length > 0) {
    logger.warn("[uae-fta-validation] UAE invoice validation blocked", {
      companySlug: company.slug,
      invoiceNumber: enrichedData.invoiceNumber,
      errorCount: blockingErrors.length,
      errors: blockingErrors.map((e) => e.messageEn),
    });
  } else {
    logger.info("[uae-fta-validation] UAE invoice validation passed", {
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

// ── Helper: Apply UAE FTA compliance to invoice create/update data ──────────

/**
 * applyUaeFtaCompliance — Applies UAE FTA e-invoicing (Peppol BIS 3) compliance
 * to invoice create/update data.
 *
 * This is a convenience function that combines validation and auto-population.
 * It returns enriched data ready for Prisma create/update, plus any
 * validation errors.
 *
 * @param invoiceData - Raw invoice data from API request
 * @param company - Company record with UAE fields (vatNumber, name, etc.)
 * @returns Enriched data + validation result. If not valid, the caller
 *          should return a 400 response with the Arabic error messages.
 */
export function applyUaeFtaCompliance(
  invoiceData: Record<string, unknown>,
  company: Record<string, unknown>,
): UaeFtaValidationMiddlewareResult {
  return uaeFtaInvoiceValidationMiddleware(invoiceData, company);
}

// ── Helper: Format validation errors for API response ──────────────────────

/**
 * formatUaeFtaErrorsForResponse — Formats UAE FTA validation errors into
 * a consistent API error response structure.
 *
 * Returns Arabic messages as the primary error text, with English messages
 * as additional context for developer debugging.
 */
export function formatUaeFtaErrorsForResponse(
  result: UaeFtaValidationMiddlewareResult,
): { error: string; details: Record<string, unknown> } {
  if (result.blockingErrors.length === 0) {
    return { error: "", details: {} };
  }

  // Primary error: all Arabic messages joined
  const allErrorsAr = result.blockingErrors.map((e) => e.messageAr).join("؛ ");
  const allErrorsEn = result.blockingErrors.map((e) => e.messageEn).join("; ");

  return {
    error: allErrorsAr,
    details: {
      regulation: UAE_FTA_AUTHORITY,
      errorsAr: result.blockingErrors.map((e) => ({ field: e.field, message: e.messageAr })),
      errorsEn: result.blockingErrors.map((e) => ({ field: e.field, message: e.messageEn })),
      warnings: result.warnings,
    },
  };
}

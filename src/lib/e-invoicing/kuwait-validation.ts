/**
 * kuwait-validation.ts — Kuwait Decree 10/2026 invoice validation middleware.
 *
 * Middleware function that runs when a Kuwait company creates/updates an invoice.
 * Auto-detects Kuwait companies via `company.country === 'KW'`.
 *
 * Responsibilities:
 * - Blocks invoice creation if mandatory Kuwait fields are missing
 * - Auto-populates Hijri dates using formatDualDate() / formatHijri()
 * - Auto-populates MOCI number from company settings
 * - Enforces KWD currency and 3-decimal precision
 * - Sets invoice type classification (standard/simplified)
 */

import { isKuwait, getCountryConfig } from "@/lib/gulfConfig";
import { validateKuwaitInvoice, autoPopulateKuwaitFields } from "@/lib/e-invoicing/kuwait";
import { logger } from "@/lib/logger";
import { KUWAIT_CURRENCY, KUWAIT_DECIMAL_PLACES, KUWAIT_AUTHORITY } from "@/lib/e-invoicing/kuwait";

// ── Types ──────────────────────────────────────────────────────────────────

export interface KuwaitValidationMiddlewareResult {
  /** Whether the invoice is valid for Kuwait compliance */
  valid: boolean;
  /** The invoice data with Kuwait fields auto-populated */
  enrichedData: Record<string, unknown>;
  /** Validation errors that block invoice creation (Arabic messages) */
  blockingErrors: Array<{ field: string; messageAr: string; messageEn: string }>;
  /** Validation warnings (advisory, not blocking) */
  warnings: Array<{ field: string; messageAr: string; messageEn: string }>;
}

// ── Middleware ──────────────────────────────────────────────────────────────

/**
 * kuwaitInvoiceValidationMiddleware — Validates and enriches invoice data
 * for Kuwait companies.
 *
 * This function is called before invoice creation/update to:
 * 1. Auto-populate Kuwait-specific fields (Hijri dates, MOCI number, etc.)
 * 2. Validate Kuwait compliance requirements
 * 3. Block creation if mandatory fields are missing
 *
 * @param invoiceData - The raw invoice data from the API request
 * @param company - The company record (must include country, mociNumber, etc.)
 * @returns Middleware result with enriched data, validation errors, and warnings
 */
export function kuwaitInvoiceValidationMiddleware(
  invoiceData: Record<string, unknown>,
  company: Record<string, unknown>,
): KuwaitValidationMiddlewareResult {
  // ── Step 0: Check if company is Kuwait ────────────────────────────────
  const countryCode = company.country as string;
  if (!isKuwait(countryCode)) {
    // Not a Kuwait company — pass through without validation
    logger.debug("[kuwait-validation] skipping non-Kuwait company", { country: countryCode });
    return {
      valid: true,
      enrichedData: invoiceData,
      blockingErrors: [],
      warnings: [],
    };
  }

  logger.info("[kuwait-validation] processing Kuwait invoice", {
    companySlug: company.slug,
    invoiceNumber: invoiceData.invoiceNumber,
    decreeRef: "Decree 10/2026",
  });

  // ── Step 1: Enforce KWD currency for Kuwait companies ─────────────────
  if (invoiceData.currency && invoiceData.currency !== KUWAIT_CURRENCY) {
    logger.warn("[kuwait-validation] overriding non-KWD currency for Kuwait company", {
      originalCurrency: invoiceData.currency,
      enforcedCurrency: KUWAIT_CURRENCY,
    });
  }
  // Override currency to KWD regardless of what was submitted
  invoiceData.currency = KUWAIT_CURRENCY;
  invoiceData.currencyDecimalPlaces = KUWAIT_DECIMAL_PLACES;

  // ── Step 2: Auto-populate Kuwait-specific fields ──────────────────────
  const enrichedData = autoPopulateKuwaitFields(invoiceData, company);

  // ── Step 3: Run validation on enriched data ───────────────────────────
  const validationResult = validateKuwaitInvoice(enrichedData, company);

  // ── Step 4: Separate blocking errors from warnings ────────────────────
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

  // ── Step 5: Log results ───────────────────────────────────────────────
  if (blockingErrors.length > 0) {
    logger.warn("[kuwait-validation] Kuwait invoice validation blocked", {
      companySlug: company.slug,
      invoiceNumber: enrichedData.invoiceNumber,
      errorCount: blockingErrors.length,
      errors: blockingErrors.map((e) => e.messageEn),
    });
  } else {
    logger.info("[kuwait-validation] Kuwait invoice validation passed", {
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

// ── Helper: Apply Kuwait compliance to invoice create/update data ──────────

/**
 * applyKuwaitCompliance — Applies Kuwait Decree 10/2026 compliance to
 * invoice create/update data.
 *
 * This is a convenience function that combines validation and auto-population.
 * It returns enriched data ready for Prisma create/update, plus any
 * validation errors.
 *
 * @param invoiceData - Raw invoice data from API request
 * @param company - Company record with Kuwait fields
 * @returns Enriched data + validation result. If not valid, the caller
 *          should return a 400 response with the Arabic error messages.
 */
export function applyKuwaitCompliance(
  invoiceData: Record<string, unknown>,
  company: Record<string, unknown>,
): KuwaitValidationMiddlewareResult {
  return kuwaitInvoiceValidationMiddleware(invoiceData, company);
}

// ── Helper: Format validation errors for API response ──────────────────────

/**
 * formatKuwaitErrorsForResponse — Formats Kuwait validation errors into
 * a consistent API error response structure.
 *
 * Returns Arabic messages as the primary error text, with English messages
 * as additional context for developer debugging.
 */
export function formatKuwaitErrorsForResponse(
  result: KuwaitValidationMiddlewareResult,
): { error: string; details: Record<string, unknown> } {
  if (result.blockingErrors.length === 0) {
    return { error: "", details: {} };
  }

  // Primary error: first Arabic message
  const primaryError = result.blockingErrors[0].messageAr;
  const allErrorsAr = result.blockingErrors.map((e) => e.messageAr).join("؛ ");
  const allErrorsEn = result.blockingErrors.map((e) => e.messageEn).join("; ");

  return {
    error: allErrorsAr,
    details: {
      decreeRef: "Decree 10/2026",
      errorsAr: result.blockingErrors.map((e) => ({ field: e.field, message: e.messageAr })),
      errorsEn: result.blockingErrors.map((e) => ({ field: e.field, message: e.messageEn })),
      warnings: result.warnings,
    },
  };
}

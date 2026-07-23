/**
 * egypt-eta-validation.ts — ETA Egypt e-invoicing validation middleware.
 *
 * Middleware function that runs when an Egyptian company creates/updates an invoice.
 * Auto-detects Egyptian companies via `company.country === 'EG'`.
 *
 * Responsibilities:
 * - Blocks invoice creation if mandatory ETA fields are missing
 * - Auto-populates UUID, Hijri dates (optional), TRN, Arabic + English fields
 * - Enforces EGP currency and 2-decimal precision
 * - Enforces 14% VAT rate (0% for export invoices)
 * - Sets invoice type classification (standard/simplified/export)
 * - Validates B2B/B2C classification consistency
 * - Ensures Arabic + English dual language for all mandatory fields
 *
 * Follows the same middleware pattern as kuwait-validation.ts and zatca-validation.ts.
 */

import { getCountryConfig } from "@/lib/gulfConfig";
import { validateEgyptEtaInvoice, autoPopulateEgyptEtaFields, EGYPT_ETA_CURRENCY, EGYPT_ETA_DECIMAL_PLACES, EGYPT_ETA_VAT_RATE, EGYPT_ETA_AUTHORITY, determineEgyptEtaInvoiceType } from "@/lib/e-invoicing/egypt-eta";
import { logger } from "@/lib/logger";

// ── Types ──────────────────────────────────────────────────────────────────

export interface EgyptEtaValidationMiddlewareResult {
  /** Whether the invoice is valid for ETA Egypt compliance */
  valid: boolean;
  /** The invoice data with ETA fields auto-populated */
  enrichedData: Record<string, unknown>;
  /** Validation errors that block invoice creation (Arabic messages) */
  blockingErrors: Array<{ field: string; messageAr: string; messageEn: string }>;
  /** Validation warnings (advisory, not blocking) */
  warnings: Array<{ field: string; messageAr: string; messageEn: string }>;
}

// ── Middleware ──────────────────────────────────────────────────────────────

/**
 * egyptEtaInvoiceValidationMiddleware — Validates and enriches invoice data
 * for Egyptian companies per ETA e-invoicing regulations.
 *
 * This function is called before invoice creation/update to:
 * 1. Auto-populate ETA-specific fields (UUID, TRN, Arabic + English fields, etc.)
 * 2. Validate ETA compliance requirements
 * 3. Block creation if mandatory fields are missing
 *
 * @param invoiceData - The raw invoice data from the API request
 * @param company - The company record (must include country, vatNumber, nameAr, etc.)
 * @returns Middleware result with enriched data, validation errors, and warnings
 */
export function egyptEtaInvoiceValidationMiddleware(
  invoiceData: Record<string, unknown>,
  company: Record<string, unknown>,
): EgyptEtaValidationMiddlewareResult {
  // ── Step 0: Check if company is Egyptian ────────────────────────────────
  const countryCode = company.country as string;
  if (countryCode !== "EG") {
    // Not an Egyptian company — pass through without validation
    logger.debug("[egypt-eta-validation] skipping non-Egyptian company", { country: countryCode });
    return {
      valid: true,
      enrichedData: invoiceData,
      blockingErrors: [],
      warnings: [],
    };
  }

  logger.info("[egypt-eta-validation] processing Egyptian invoice", {
    companySlug: company.slug,
    invoiceNumber: invoiceData.invoiceNumber,
    regulation: EGYPT_ETA_AUTHORITY,
  });

  // ── Step 1: Enforce EGP currency for Egyptian companies ──────────────────
  if (invoiceData.currency && invoiceData.currency !== EGYPT_ETA_CURRENCY) {
    logger.warn("[egypt-eta-validation] overriding non-EGP currency for Egyptian company", {
      originalCurrency: invoiceData.currency,
      enforcedCurrency: EGYPT_ETA_CURRENCY,
    });
  }
  // Override currency to EGP regardless of what was submitted
  invoiceData.currency = EGYPT_ETA_CURRENCY;
  invoiceData.currencyDecimalPlaces = EGYPT_ETA_DECIMAL_PLACES;

  // ── Step 2: Enforce VAT rate based on invoice type ──────────────────────
  const invoiceType = determineEgyptEtaInvoiceType(invoiceData);
  const expectedVatRate = invoiceType === "export" ? 0 : EGYPT_ETA_VAT_RATE;
  const currentTaxRate = parseFloat(
    (invoiceData.taxRate as string) || (company.defaultTaxRate as string) || "0",
  );
  if (currentTaxRate !== expectedVatRate && currentTaxRate !== 0) {
    logger.info("[egypt-eta-validation] enforcing VAT rate for Egyptian company", {
      originalRate: currentTaxRate,
      enforcedRate: expectedVatRate,
      invoiceType,
    });
    invoiceData.taxRate = expectedVatRate.toFixed(EGYPT_ETA_DECIMAL_PLACES);
  }

  // ── Step 3: Auto-populate ETA-specific fields ───────────────────────────
  const enrichedData = autoPopulateEgyptEtaFields(invoiceData, company);

  // ── Step 4: Run validation on enriched data ────────────────────────────
  const validationResult = validateEgyptEtaInvoice(enrichedData, company);

  // ── Step 5: Separate blocking errors from warnings ─────────────────────
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

  // ── Step 6: Log results ────────────────────────────────────────────────
  if (blockingErrors.length > 0) {
    logger.warn("[egypt-eta-validation] Egyptian invoice validation blocked", {
      companySlug: company.slug,
      invoiceNumber: enrichedData.invoiceNumber,
      errorCount: blockingErrors.length,
      errors: blockingErrors.map((e) => e.messageEn),
    });
  } else {
    logger.info("[egypt-eta-validation] Egyptian invoice validation passed", {
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

// ── Helper: Apply ETA Egypt compliance to invoice create/update data ────────

/**
 * applyEgyptEtaCompliance — Applies ETA Egypt e-invoicing compliance to
 * invoice create/update data.
 *
 * This is a convenience function that combines validation and auto-population.
 * It returns enriched data ready for Prisma create/update, plus any
 * validation errors.
 *
 * @param invoiceData - Raw invoice data from API request
 * @param company - Company record with Egyptian fields (vatNumber, nameAr, etc.)
 * @returns Enriched data + validation result. If not valid, the caller
 *          should return a 400 response with the Arabic error messages.
 */
export function applyEgyptEtaCompliance(
  invoiceData: Record<string, unknown>,
  company: Record<string, unknown>,
): EgyptEtaValidationMiddlewareResult {
  return egyptEtaInvoiceValidationMiddleware(invoiceData, company);
}

// ── Helper: Format validation errors for API response ──────────────────────

/**
 * formatEgyptEtaErrorsForResponse — Formats ETA validation errors into
 * a consistent API error response structure.
 *
 * Returns Arabic messages as the primary error text, with English messages
 * as additional context for developer debugging.
 */
export function formatEgyptEtaErrorsForResponse(
  result: EgyptEtaValidationMiddlewareResult,
): { error: string; details: Record<string, unknown> } {
  if (result.blockingErrors.length === 0) {
    return { error: "", details: {} };
  }

  // Primary error: all Arabic messages joined
  const allErrorsAr = result.blockingErrors.map((e) => e.messageAr).join("؛ ");

  return {
    error: allErrorsAr,
    details: {
      regulation: EGYPT_ETA_AUTHORITY,
      errorsAr: result.blockingErrors.map((e) => ({ field: e.field, message: e.messageAr })),
      errorsEn: result.blockingErrors.map((e) => ({ field: e.field, message: e.messageEn })),
      warnings: result.warnings,
    },
  };
}

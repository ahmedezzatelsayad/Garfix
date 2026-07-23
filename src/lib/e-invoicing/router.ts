/**
 * router.ts — E-Invoicing central dispatcher.
 *
 * Routes invoices to the correct authority handler based on the company's
 * country code. Each country has its own e-invoicing module with validation,
 * payload generation, submission, and auto-population logic.
 *
 * Routing map:
 * - KW → kuwait_decree_10_2026 (Kuwait Decree 10/2026 module)
 * - SA → zatca (ZATCA Phase 2 module)
 * - AE → uae_fta (UAE FTA Peppol BIS 3 module)
 * - EG → eta_egypt (Egypt ETA module)
 * - BH → bahrain_nbr (Bahrain NBR module)
 * - OM → oman_tax (Oman Tax Authority module)
 * - QA → none (Qatar has no e-invoicing requirement yet)
 * - All others → none (no e-invoicing requirement)
 *
 * Usage:
 *   import { routeEInvoice, validateEInvoice, submitEInvoice, autoPopulateEInvoiceFields } from "@/lib/e-invoicing/router";
 *
 *   const result = validateEInvoice(invoice, company);
 *   const enriched = autoPopulateEInvoiceFields(invoice, company);
 *   const submissionResult = await submitEInvoice(invoice, company);
 */

import { getEInvoiceAuthority, type EInvoiceAuthority } from "@/lib/gulfConfig";
import { logger } from "@/lib/logger";

// ── Module imports ────────────────────────────────────────────────────────

import {
  validateKuwaitInvoice,
  generateKuwaitInvoicePayload,
  autoPopulateKuwaitFields,
  type KuwaitValidationResult,
} from "@/lib/e-invoicing/kuwait";

import {
  validateZatcaInvoice,
  generateZatcaUblXml,
  autoPopulateZatcaFields,
  type ZatcaValidationResult,
} from "@/lib/e-invoicing/zatca";

import {
  validateUaeFtaInvoice,
  generateUaeFtaUblXml,
  autoPopulateUaeFtaFields,
  type UaeFtaValidationResult,
} from "@/lib/e-invoicing/uae-fta";

import {
  validateEgyptEtaInvoice,
  generateEgyptEtaInvoicePayload,
  submitEgyptEtaInvoice,
  autoPopulateEgyptEtaFields,
  checkEgyptEtaInvoiceStatus,
  type EgyptEtaValidationResult,
  type EgyptEtaInvoicePayload,
  type EgyptEtaSubmissionResult,
} from "@/lib/e-invoicing/egypt-eta";

import {
  validateBahrainNbrInvoice,
  generateBahrainNbrInvoicePayload,
  submitBahrainNbrInvoice,
  autoPopulateBahrainNbrFields,
  type BahrainNbrValidationResult,
  type BahrainNbrInvoicePayload,
  type BahrainNbrSubmissionResult,
} from "@/lib/e-invoicing/bahrain-nbr";

import {
  validateOmanTaxInvoice,
  generateOmanTaxInvoicePayload,
  submitOmanTaxInvoice,
  autoPopulateOmanTaxFields,
  type OmanTaxValidationResult,
  type OmanTaxInvoicePayload,
  type OmanTaxSubmissionResult,
} from "@/lib/e-invoicing/oman-tax";

// ── Types ──────────────────────────────────────────────────────────────────

export interface EInvoiceValidationResult {
  valid: boolean;
  errors: Array<{ field: string; messageAr: string; messageEn: string; severity: "error" | "warning" }>;
  warnings: Array<{ field: string; messageAr: string; messageEn: string; severity: "error" | "warning" }>;
  authority: EInvoiceAuthority;
}

export interface EInvoiceRouteResult {
  authority: EInvoiceAuthority;
  /** The module name for the handler */
  handlerModule: string;
  /** Whether e-invoicing is required for this company */
  isRequired: boolean;
}

export interface EInvoiceSubmissionResult {
  ok: boolean;
  eInvoiceId?: number;
  submissionStatus: string;
  submissionId?: string;
  authority: EInvoiceAuthority;
  error?: string;
  rejectionReason?: string;
}

// ── Authority to module mapping ──────────────────────────────────────────

const AUTHORITY_MODULE_MAP: Record<EInvoiceAuthority, string> = {
  kuwait_decree_10_2026: "kuwait",
  zatca: "zatca",
  uae_fta: "uae-fta",
  eta_egypt: "egypt-eta",
  bahrain_nbr: "bahrain-nbr",
  oman_tax: "oman-tax",
  none: "none",
};

// ── Route ──────────────────────────────────────────────────────────────

/**
 * routeEInvoice — Determines which e-invoicing authority handles an invoice
 * based on the company's country code.
 *
 * @param invoice - The invoice data (used for country-specific logic)
 * @param company - The company record (must include country field)
 * @returns Route result with authority and handler module info
 */
export function routeEInvoice(
  invoice: Record<string, unknown>,
  company: Record<string, unknown>,
): EInvoiceRouteResult {
  const countryCode = (company.country as string) || "";
  const authority = getEInvoiceAuthority(countryCode);
  const handlerModule = AUTHORITY_MODULE_MAP[authority];

  const isRequired = authority !== "none";

  logger.debug("[e-invoicing-router] routed invoice", {
    countryCode,
    authority,
    handlerModule,
    isRequired,
    invoiceNumber: invoice.invoiceNumber,
  });

  return {
    authority,
    handlerModule,
    isRequired,
  };
}

// ── Validate ──────────────────────────────────────────────────────────

/**
 * validateEInvoice — Validates an invoice against the appropriate authority's
 * requirements based on the company's country.
 *
 * Routes to:
 * - KW → validateKuwaitInvoice()
 * - SA → validateZatcaInvoice()
 * - AE → validateUaeFtaInvoice()
 * - EG → validateEgyptEtaInvoice()
 * - BH → validateBahrainNbrInvoice()
 * - OM → validateOmanTaxInvoice()
 * - QA / others → always valid (no e-invoicing requirement)
 *
 * @param invoice - The invoice data to validate
 * @param company - The company record (must include country field)
 * @returns Unified validation result with authority info
 */
export function validateEInvoice(
  invoice: Record<string, unknown>,
  company: Record<string, unknown>,
): EInvoiceValidationResult {
  const route = routeEInvoice(invoice, company);

  // ── No e-invoicing requirement ──────────────────────────────────────
  if (!route.isRequired) {
    logger.debug("[e-invoicing-router] no e-invoicing requirement, skipping validation", {
      countryCode: company.country,
      authority: route.authority,
    });
    return {
      valid: true,
      errors: [],
      warnings: [],
      authority: "none",
    };
  }

  // ── Route to appropriate validator ───────────────────────────────────
  switch (route.authority) {
    case "kuwait_decree_10_2026": {
      const result: KuwaitValidationResult = validateKuwaitInvoice(invoice, company);
      return {
        valid: result.valid,
        errors: result.errors.map((e) => ({
          field: e.field,
          messageAr: e.messageAr,
          messageEn: e.messageEn,
          severity: e.severity,
        })),
        warnings: result.warnings.map((w) => ({
          field: w.field,
          messageAr: w.messageAr,
          messageEn: w.messageEn,
          severity: w.severity,
        })),
        authority: "kuwait_decree_10_2026",
      };
    }

    case "zatca": {
      const result: ZatcaValidationResult = validateZatcaInvoice(invoice, company);
      return {
        valid: result.valid,
        errors: result.errors.map((e) => ({
          field: e.field,
          messageAr: e.messageAr,
          messageEn: e.messageEn,
          severity: e.severity,
        })),
        warnings: result.warnings.map((w) => ({
          field: w.field,
          messageAr: w.messageAr,
          messageEn: w.messageEn,
          severity: w.severity,
        })),
        authority: "zatca",
      };
    }

    case "uae_fta": {
      const result: UaeFtaValidationResult = validateUaeFtaInvoice(invoice, company);
      return {
        valid: result.valid,
        errors: result.errors.map((e) => ({
          field: e.field,
          messageAr: e.messageAr,
          messageEn: e.messageEn,
          severity: e.severity,
        })),
        warnings: result.warnings.map((w) => ({
          field: w.field,
          messageAr: w.messageAr,
          messageEn: w.messageEn,
          severity: w.severity,
        })),
        authority: "uae_fta",
      };
    }

    case "eta_egypt": {
      const result: EgyptEtaValidationResult = validateEgyptEtaInvoice(invoice, company);
      return {
        valid: result.valid,
        errors: result.errors.map((e) => ({
          field: e.field,
          messageAr: e.messageAr,
          messageEn: e.messageEn,
          severity: e.severity,
        })),
        warnings: result.warnings.map((w) => ({
          field: w.field,
          messageAr: w.messageAr,
          messageEn: w.messageEn,
          severity: w.severity,
        })),
        authority: "eta_egypt",
      };
    }

    case "bahrain_nbr": {
      const result: BahrainNbrValidationResult = validateBahrainNbrInvoice(invoice, company);
      return {
        valid: result.valid,
        errors: result.errors.map((e) => ({
          field: e.field,
          messageAr: e.messageAr,
          messageEn: e.messageEn,
          severity: e.severity,
        })),
        warnings: result.warnings.map((w) => ({
          field: w.field,
          messageAr: w.messageAr,
          messageEn: w.messageEn,
          severity: w.severity,
        })),
        authority: "bahrain_nbr",
      };
    }

    case "oman_tax": {
      const result: OmanTaxValidationResult = validateOmanTaxInvoice(invoice, company);
      return {
        valid: result.valid,
        errors: result.errors.map((e) => ({
          field: e.field,
          messageAr: e.messageAr,
          messageEn: e.messageEn,
          severity: e.severity,
        })),
        warnings: result.warnings.map((w) => ({
          field: w.field,
          messageAr: w.messageAr,
          messageEn: w.messageEn,
          severity: w.severity,
        })),
        authority: "oman_tax",
      };
    }

    default: {
      logger.warn("[e-invoicing-router] unknown authority, skipping validation", {
        authority: route.authority,
        countryCode: company.country,
      });
      return {
        valid: true,
        errors: [],
        warnings: [],
        authority: "none",
      };
    }
  }
}

// ── Auto-populate ──────────────────────────────────────────────────────

/**
 * autoPopulateEInvoiceFields — Auto-populates e-invoicing specific fields
 * for an invoice based on the company's country.
 *
 * Routes to:
 * - KW → autoPopulateKuwaitFields()
 * - SA → autoPopulateZatcaFields()
 * - AE → autoPopulateUaeFtaFields()
 * - EG → autoPopulateEgyptEtaFields()
 * - BH → autoPopulateBahrainNbrFields()
 * - OM → autoPopulateOmanTaxFields()
 * - QA / others → returns invoice data unchanged
 *
 * @param invoiceData - Raw invoice data from API request
 * @param company - Company record with country-specific fields
 * @returns Enriched invoice data with authority-specific fields populated
 */
export function autoPopulateEInvoiceFields(
  invoiceData: Record<string, unknown>,
  company: Record<string, unknown>,
): Record<string, unknown> {
  const route = routeEInvoice(invoiceData, company);

  // ── No e-invoicing requirement ──────────────────────────────────────
  if (!route.isRequired) {
    logger.debug("[e-invoicing-router] no e-invoicing requirement, skipping auto-population", {
      countryCode: company.country,
      authority: route.authority,
    });
    return invoiceData;
  }

  // ── Route to appropriate auto-populator ──────────────────────────────
  switch (route.authority) {
    case "kuwait_decree_10_2026":
      return autoPopulateKuwaitFields(invoiceData, company);

    case "zatca":
      return autoPopulateZatcaFields(invoiceData, company);

    case "uae_fta":
      return autoPopulateUaeFtaFields(invoiceData, company);

    case "eta_egypt":
      return autoPopulateEgyptEtaFields(invoiceData, company);

    case "bahrain_nbr":
      return autoPopulateBahrainNbrFields(invoiceData, company);

    case "oman_tax":
      return autoPopulateOmanTaxFields(invoiceData, company);

    default:
      logger.warn("[e-invoicing-router] unknown authority for auto-population", {
        authority: route.authority,
        countryCode: company.country,
      });
      return invoiceData;
  }
}

// ── Submit ──────────────────────────────────────────────────────────────

/**
 * submitEInvoice — Submits an invoice to the appropriate authority's portal
 * based on the company's country.
 *
 * Routes to:
 * - KW → placeholder (MOCI portal not yet published)
 * - SA → submitZatcaInvoice() (ZATCA portal)
 * - AE → placeholder (Peppol Access Point)
 * - EG → submitEgyptEtaInvoice() (ETA portal placeholder)
 * - BH → submitBahrainNbrInvoice() (NBR portal placeholder)
 * - OM → submitOmanTaxInvoice() (Oman Tax portal placeholder)
 * - QA / others → returns "not_required" result
 *
 * @param invoice - The invoice data to submit
 * @param company - The company record with country-specific fields
 * @returns Submission result with authority info
 */
export async function submitEInvoice(
  invoice: Record<string, unknown>,
  company: Record<string, unknown>,
): Promise<EInvoiceSubmissionResult> {
  const route = routeEInvoice(invoice, company);

  // ── No e-invoicing requirement ──────────────────────────────────────
  if (!route.isRequired) {
    logger.debug("[e-invoicing-router] no e-invoicing requirement, skipping submission", {
      countryCode: company.country,
      authority: route.authority,
    });
    return {
      ok: true,
      submissionStatus: "not_required",
      authority: "none",
    };
  }

  logger.info("[e-invoicing-router] submitting invoice to authority", {
    countryCode: company.country,
    authority: route.authority,
    invoiceNumber: invoice.invoiceNumber,
  });

  // ── Route to appropriate submission handler ──────────────────────────
  switch (route.authority) {
    case "eta_egypt": {
      const payload = generateEgyptEtaInvoicePayload(invoice, company);
      const result: EgyptEtaSubmissionResult = await submitEgyptEtaInvoice(payload);
      return {
        ok: result.ok,
        eInvoiceId: result.eInvoiceId,
        submissionStatus: result.submissionStatus,
        submissionId: result.etaSubmissionId,
        authority: "eta_egypt",
        error: result.error,
        rejectionReason: result.rejectionReason,
      };
    }

    case "bahrain_nbr": {
      const payload = generateBahrainNbrInvoicePayload(invoice, company);
      const result: BahrainNbrSubmissionResult = await submitBahrainNbrInvoice(payload);
      return {
        ok: result.ok,
        eInvoiceId: result.eInvoiceId,
        submissionStatus: result.submissionStatus,
        submissionId: result.nbrSubmissionId,
        authority: "bahrain_nbr",
        error: result.error,
        rejectionReason: result.rejectionReason,
      };
    }

    case "oman_tax": {
      const payload = generateOmanTaxInvoicePayload(invoice, company);
      const result: OmanTaxSubmissionResult = await submitOmanTaxInvoice(payload);
      return {
        ok: result.ok,
        eInvoiceId: result.eInvoiceId,
        submissionStatus: result.submissionStatus,
        submissionId: result.omanTaxSubmissionId,
        authority: "oman_tax",
        error: result.error,
        rejectionReason: result.rejectionReason,
      };
    }

    case "kuwait_decree_10_2026": {
      // Kuwait: MOCI portal not yet published — placeholder
      logger.info("[e-invoicing-router] Kuwait MOCI portal not yet published — placeholder submission", {
        invoiceNumber: invoice.invoiceNumber,
      });
      return {
        ok: true,
        submissionStatus: "pending",
        authority: "kuwait_decree_10_2026",
        submissionId: `KUWAIT-PLACEHOLDER-${Date.now()}`,
      };
    }

    case "zatca": {
      // ZATCA: Requires signing certificates first — placeholder for routing
      logger.info("[e-invoicing-router] ZATCA submission requires signing certificates — placeholder via router", {
        invoiceNumber: invoice.invoiceNumber,
      });
      return {
        ok: true,
        submissionStatus: "pending",
        authority: "zatca",
        submissionId: `ZATCA-PLACEHOLDER-${Date.now()}`,
      };
    }

    case "uae_fta": {
      // UAE FTA: Requires Peppol Access Point — placeholder for routing
      logger.info("[e-invoicing-router] UAE FTA submission requires Peppol AP — placeholder via router", {
        invoiceNumber: invoice.invoiceNumber,
      });
      return {
        ok: true,
        submissionStatus: "pending",
        authority: "uae_fta",
        submissionId: `UAE-FTA-PLACEHOLDER-${Date.now()}`,
      };
    }

    default: {
      logger.warn("[e-invoicing-router] unknown authority for submission", {
        authority: route.authority,
        countryCode: company.country,
      });
      return {
        ok: true,
        submissionStatus: "not_required",
        authority: "none",
      };
    }
  }
}

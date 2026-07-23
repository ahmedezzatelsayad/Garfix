/**
 * egypt-eta.ts — Egyptian Tax Authority (ETA) e-invoicing compliance module.
 *
 * Implements ETA (مصلحة الضرائب المصرية) e-invoicing requirements for Egypt,
 * mandatory since 2022 for all registered taxpayers.
 *
 * Key requirements:
 * - Arabic + English dual language required on invoices
 * - EGP currency with exactly 2 decimal places
 * - 14% VAT rate (standard rate since 2022)
 * - Tax registration number (TRN) required for seller
 * - Buyer TRN required for B2B (standard) invoices
 * - Invoice classification: standard (B2B), simplified (B2C), export
 * - Digital receipt (إيصال إلكتروني) for B2C transactions
 * - Submission via ETA portal API (requires registration first)
 * - 5-year record retention
 * - Fines for non-compliance up to EGP 500,000
 *
 * ETA portal API endpoints (placeholder — requires taxpayer registration):
 * - Standard invoices → submit for clearance
 * - Simplified invoices → submit as digital receipt
 * - Export invoices → special handling per customs regulations
 */

import { toHijri, formatDualDate, formatHijri } from "@/lib/hijri";
import { fmtMoney, num, calcInvoiceTotals, type LineItem } from "@/lib/money";
import {
  getCountryConfig,
  type EInvoiceAuthority,
} from "@/lib/gulfConfig";
import { logger } from "@/lib/logger";
import { db } from "@/lib/db";

// ── Types ──────────────────────────────────────────────────────────────────

export interface EgyptEtaValidationError {
  field: string;
  messageAr: string; // Arabic error message for UI display (Egyptian Arabic)
  messageEn: string; // English error message for developer reference
  severity: "error" | "warning"; // error = blocks submission, warning = advisory
}

export interface EgyptEtaValidationResult {
  valid: boolean;
  errors: EgyptEtaValidationError[];
  warnings: EgyptEtaValidationError[];
}

export type EgyptEtaInvoiceType = "standard" | "simplified" | "export";
// standard = B2B tax invoice (فاتورة ضريبية) — requires buyer TRN, full details
// simplified = B2C retail receipt (إيصال إلكتروني) — lighter requirements
// export = export invoice (فاتورة تصدير) — special handling, 0% VAT

export interface EgyptEtaInvoicePayload {
  // ── Header ───────────────────────────────────────────────────────────
  uuid: string;
  invoiceNumber: string;
  invoiceType: EgyptEtaInvoiceType;
  invoiceTypeAr: string;
  invoiceTypeEn: string;
  etaRegulation: string; // "ETA Egypt e-invoicing"

  // ── Dates (dual calendar) ────────────────────────────────────────────
  issueDateGregorian: string; // YYYY-MM-DD
  issueDateHijri: string; // formatted Hijri string (optional for Egypt)
  issueDateDual: string; // dual format
  dueDateGregorian: string;
  dueDateHijri: string;
  dueDateDual: string;

  // ── Currency ─────────────────────────────────────────────────────────
  currency: string; // "EGP"
  currencyDecimalPlaces: number; // 2

  // ── Seller ───────────────────────────────────────────────────────────
  sellerNameAr: string;
  sellerNameEn: string;
  sellerAddressAr: string;
  sellerAddressEn: string;
  sellerTaxRegistrationNumber: string; // TRN — mandatory for ETA
  sellerCommercialRegistration: string | null;
  sellerCountryCode: string; // "EG"

  // ── Buyer ────────────────────────────────────────────────────────────
  buyerNameAr: string | null; // Required for standard (B2B) and export
  buyerNameEn: string | null;
  buyerAddressAr: string | null;
  buyerAddressEn: string | null;
  buyerTaxRegistrationNumber: string | null; // Required for standard (B2B)
  buyerCountryCode: string | null;

  // ── Line items ───────────────────────────────────────────────────────
  lineItems: EgyptEtaLineItemPayload[];

  // ── Totals (EGP, 2 decimal places) ───────────────────────────────────
  subtotal: string;
  taxRate: string; // "14.00" for standard, "0.00" for export
  taxAmount: string;
  total: string;
  shipping: string;
  discount: string;
  paid: string;

  // ── Notes ────────────────────────────────────────────────────────────
  notesAr: string | null;
  notesEn: string | null;

  // ── ETA-specific ─────────────────────────────────────────────────────
  eInvoiceAuthority: string; // "eta_egypt"
  previousInvoiceHash: string; // PIH for chaining
  invoiceHash: string; // SHA-256 hash
  paymentMethod: string | null;
  isExport: boolean; // true for export invoices (0% VAT)
  digitalReceipt: boolean; // true for simplified (B2C) invoices
}

export interface EgyptEtaLineItemPayload {
  id: string;
  descriptionAr: string;
  descriptionEn: string;
  qty: string; // formatted with 2 decimals
  unitPrice: string;
  unitCode: string; // "EA", "DAY", etc.
  lineTotal: string;
  taxRate: string;
  taxAmount: string;
  taxCategory: string; // "S" standard, "Z" zero, "E" exempt
  taxSchemeAr: string; // "ضريبة القيمة المضافة"
  taxSchemeEn: string; // "Value Added Tax"
  discountAmount: string | null;
}

export interface EgyptEtaSubmissionResult {
  ok: boolean;
  eInvoiceId?: number;
  submissionStatus: "pending" | "submitted" | "cleared" | "rejected";
  etaSubmissionId?: string; // ETA portal submission reference
  error?: string;
  rejectionReason?: string;
}

// ── Constants ──────────────────────────────────────────────────────────────

export const EGYPT_ETA_AUTHORITY: EInvoiceAuthority = "eta_egypt";
export const EGYPT_ETA_CURRENCY = "EGP";
export const EGYPT_ETA_DECIMAL_PLACES = 2;
export const EGYPT_ETA_VAT_RATE = 14;
export const EGYPT_ETA_REGULATION = "ETA Egypt e-invoicing";
export const EGYPT_ETA_MAX_FINE_EGP = 500000;
const EGYPT_ETA_PORTAL_BASE_URL = "https://invoicing.eta.gov.eg/api/v1"; // placeholder
const EGYPT_ETA_RECEIPT_ENDPOINT = "/receiptrequests";
const EGYPT_ETA_INVOICE_ENDPOINT = "/invoiceRequests";
const EGYPT_ETA_EXPORT_ENDPOINT = "/exportInvoiceRequests";

// ── Arabic error messages (Egyptian Arabic — مصلحة الضرائب المصرية) ──────────

const ERROR_MESSAGES = {
  // ── Seller validation ────────────────────────────────────────────────
  sellerNameArRequired: "اسم البائع باللغة العربية مطلوب — مصلحة الضرائب المصرية",
  sellerNameEnRequired: "اسم البائع باللغة الإنجليزية مطلوب — مصلحة الضرائب المصرية",
  sellerAddressArRequired: "عنوان البائع باللغة العربية مطلوب",
  sellerAddressEnRequired: "عنوان البائع باللغة الإنجليزية مطلوب",
  sellerTrnRequired: "الرقم الضريبي للبائع مطلوب — مصلحة الضرائب المصرية",

  // ── Buyer validation ─────────────────────────────────────────────────
  buyerNameArRequired: "اسم المشتري باللغة العربية مطلوب للفواتير الضريبية (B2B)",
  buyerNameEnRequired: "اسم المشتري باللغة الإنجليزية مطلوب للفواتير الضريبية (B2B)",
  buyerTrnRequiredB2b: "الرقم الضريبي للمشتري مطلوب للفواتير الضريبية (B2B)",
  buyerAddressArRequired: "عنوان المشتري باللغة العربية مطلوب للفواتير الضريبية (B2B)",
  buyerAddressEnRequired: "عنوان المشتري باللغة الإنجليزية مطلوب للفواتير الضريبية (B2B)",

  // ── Currency ─────────────────────────────────────────────────────────
  currencyMustBeEgp: "يجب أن تكون العملة جنيه مصري (EGP) — مصلحة الضرائب المصرية",
  decimalPlacesMustBe2: "يجب أن يكون عدد المنازل العشرية 2 للجنيه المصري (EGP)",

  // ── VAT ──────────────────────────────────────────────────────────────
  vatRateMustBe14: "يجب أن تكون نسبة ضريبة القيمة المضافة 14% — القانون المصري",
  vatRateMustBe0ForExport: "يجب أن تكون نسبة ضريبة القيمة المضافة 0% للفواتير التصديرية",
  vatExemptRateMustBe0: "نسبة الضريبة المعفاة يجب أن تكون 0%",

  // ── Invoice type ─────────────────────────────────────────────────────
  invoiceTypeRequired: "نوع الفاتورة مطلوب (ضريبية / إيصال إلكتروني / تصدير)",
  b2bBuyerTrnMismatch: "نوع الفاتورة ضريبية (B2B) يتطلب رقم ضريبي للمشتري",
  b2cNoBuyerTrn: "الإيصال الإلكتروني (B2C) لا يتطلب رقم ضريبي للمشتري",

  // ── Dual language ────────────────────────────────────────────────────
  dualLanguageRequired: "اللغة المزدوجة (العربية والإنجليزية) مطلوبة — مصلحة الضرائب المصرية",
  lineItemDescriptionArRequired: "وصف الصف باللغة العربية مطلوب",
  lineItemDescriptionEnRequired: "وصف الصف باللغة الإنجليزية مطلوب",

  // ── Retention ────────────────────────────────────────────────────────
  retentionWarning: "⚠️ يجب الاحتفاظ بالسجلات لمدة 5 سنوات — مصلحة الضرائب المصرية. الغرامة قد تصل إلى 500,000 جنيه مصري",

  // ── Portal ───────────────────────────────────────────────────────────
  portalRegistrationRequired: "⚠️ يجب التسجيل في بوابة مصلحة الضرائب المصرية قبل تقديم الفواتير الإلكترونية",
  digitalReceiptRequired: "⚠️ الإيصال الإلكتروني مطلوب للمعاملات B2C (التاجر إلى المستهلك)",
};

const EN_MESSAGES = {
  sellerNameArRequired: "Seller name in Arabic is required — ETA Egypt",
  sellerNameEnRequired: "Seller name in English is required — ETA Egypt",
  sellerAddressArRequired: "Seller address in Arabic is required",
  sellerAddressEnRequired: "Seller address in English is required",
  sellerTrnRequired: "Seller tax registration number (TRN) is required — ETA Egypt",
  buyerNameArRequired: "Buyer name in Arabic is required for standard (B2B) invoices",
  buyerNameEnRequired: "Buyer name in English is required for standard (B2B) invoices",
  buyerTrnRequiredB2b: "Buyer tax registration number (TRN) is required for standard (B2B) invoices",
  buyerAddressArRequired: "Buyer address in Arabic is required for standard (B2B) invoices",
  buyerAddressEnRequired: "Buyer address in English is required for standard (B2B) invoices",
  currencyMustBeEgp: "Currency must be EGP (Egyptian Pound) — ETA Egypt",
  decimalPlacesMustBe2: "Currency decimal places must be 2 for EGP",
  vatRateMustBe14: "VAT rate must be 14% — Egyptian VAT law",
  vatRateMustBe0ForExport: "VAT rate must be 0% for export invoices",
  vatExemptRateMustBe0: "Exempt VAT rate must be 0%",
  invoiceTypeRequired: "Invoice type is required (standard/simplified/export)",
  b2bBuyerTrnMismatch: "Standard (B2B) invoice requires buyer TRN",
  b2cNoBuyerTrn: "Simplified (B2C) receipt does not require buyer TRN",
  dualLanguageRequired: "Dual language (Arabic + English) is required — ETA Egypt",
  lineItemDescriptionArRequired: "Line item description in Arabic is required",
  lineItemDescriptionEnRequired: "Line item description in English is required",
  retentionWarning: "⚠️ Records must be retained for 5 years — ETA Egypt. Fine up to EGP 500,000",
  portalRegistrationRequired: "⚠️ Registration with ETA portal is required before submitting e-invoices",
  digitalReceiptRequired: "⚠️ Digital receipt (إيصال إلكتروني) is required for B2C transactions",
};

// ── Invoice Type Classification ──────────────────────────────────────────

/**
 * determineEgyptEtaInvoiceType — Classifies an invoice as standard, simplified, or export.
 *
 * Classification rules:
 * - export: invoice has isExport=true, or invoiceTypeEn="export", or export-related fields
 * - standard (B2B): has buyerVatNumber/clientId, or invoiceTypeEn="standard"
 * - simplified (B2C): no buyer TRN, retail transaction
 */
export function determineEgyptEtaInvoiceType(
  invoice: Record<string, unknown>,
): EgyptEtaInvoiceType {
  // Explicit setting
  const explicit = invoice.invoiceTypeEn as string;
  if (explicit === "export") return "export";
  if (explicit === "standard") return "standard";
  if (explicit === "simplified") return "simplified";

  // Check Arabic type
  const typeAr = invoice.invoiceTypeAr as string;
  if (typeAr === "فاتورة تصدير") return "export";
  if (typeAr === "فاتورة ضريبية") return "standard";
  if (typeAr === "إيصال إلكتروني") return "simplified";

  // Check export flag
  if (invoice.isExport === true) return "export";

  // B2B if buyer has VAT number or clientId
  if (invoice.buyerVatNumber || invoice.buyerTaxRegistrationNumber || invoice.clientId) {
    return "standard";
  }

  // Default: simplified (B2C)
  return "simplified";
}

// ── UUID Generation ──────────────────────────────────────────────────────

/**
 * generateEgyptEtaUuid — Generates a UUID v4 for ETA invoice identification.
 */
export function generateEgyptEtaUuid(): string {
  return crypto.randomUUID();
}

// ── Validation ──────────────────────────────────────────────────────────

/**
 * validateEgyptEtaInvoice — Validates invoice data for Egyptian ETA compliance.
 *
 * Checks:
 * - Arabic + English dual language required (seller name, seller address)
 * - Buyer Arabic + English required for B2B (standard)
 * - EGP currency with exactly 2 decimal places
 * - 14% VAT rate for standard/simplified, 0% for export
 * - Seller TRN mandatory
 * - Buyer TRN mandatory for B2B (standard)
 * - Line items must have Arabic + English descriptions
 * - Invoice type classification consistency
 * - Returns Egyptian Arabic error messages
 */
export function validateEgyptEtaInvoice(
  invoice: Record<string, unknown>,
  company: Record<string, unknown>,
): EgyptEtaValidationResult {
  const errors: EgyptEtaValidationError[] = [];
  const warnings: EgyptEtaValidationError[] = [];

  // ── Step 0: Skip for non-Egyptian companies ──────────────────────────
  const countryCode = company.country as string;
  if (countryCode !== "EG") {
    return { valid: true, errors: [], warnings: [] };
  }

  const invoiceType = determineEgyptEtaInvoiceType(invoice);

  // ── Step 1: Seller TRN ───────────────────────────────────────────────
  const sellerTrn =
    (invoice.sellerTaxRegistrationNumber as string) ||
    (invoice.vatNumber as string) ||
    (company.vatNumber as string);
  if (!sellerTrn) {
    errors.push({
      field: "sellerTaxRegistrationNumber",
      messageAr: ERROR_MESSAGES.sellerTrnRequired,
      messageEn: EN_MESSAGES.sellerTrnRequired,
      severity: "error",
    });
  }

  // ── Step 2: Dual language (Arabic + English) ────────────────────────
  // Seller name — both Arabic and English required
  const sellerNameAr =
    (invoice.sellerNameAr as string) || (company.nameAr as string);
  if (!sellerNameAr) {
    errors.push({
      field: "sellerNameAr",
      messageAr: ERROR_MESSAGES.sellerNameArRequired,
      messageEn: EN_MESSAGES.sellerNameArRequired,
      severity: "error",
    });
  }

  const sellerNameEn =
    (invoice.sellerNameEn as string) || (company.name as string);
  if (!sellerNameEn) {
    errors.push({
      field: "sellerNameEn",
      messageAr: ERROR_MESSAGES.sellerNameEnRequired,
      messageEn: EN_MESSAGES.sellerNameEnRequired,
      severity: "error",
    });
  }

  // Seller address — both Arabic and English required
  const sellerAddressAr =
    (invoice.sellerAddressAr as string) || (company.addressAr as string) || (company.address as string);
  if (!sellerAddressAr) {
    errors.push({
      field: "sellerAddressAr",
      messageAr: ERROR_MESSAGES.sellerAddressArRequired,
      messageEn: EN_MESSAGES.sellerAddressEnRequired,
      severity: "error",
    });
  }

  const sellerAddressEn =
    (invoice.sellerAddressEn as string) || (company.address as string);
  if (!sellerAddressEn) {
    errors.push({
      field: "sellerAddressEn",
      messageAr: ERROR_MESSAGES.sellerAddressEnRequired,
      messageEn: EN_MESSAGES.sellerAddressEnRequired,
      severity: "error",
    });
  }

  // ── Step 3: Buyer validation (type-specific) ─────────────────────────
  if (invoiceType === "standard") {
    // B2B: buyer Arabic + English name, buyer TRN, buyer address
    const buyerNameAr = invoice.buyerNameAr as string;
    if (!buyerNameAr) {
      errors.push({
        field: "buyerNameAr",
        messageAr: ERROR_MESSAGES.buyerNameArRequired,
        messageEn: EN_MESSAGES.buyerNameArRequired,
        severity: "error",
      });
    }

    const buyerNameEn = invoice.buyerNameEn as string;
    if (!buyerNameEn) {
      errors.push({
        field: "buyerNameEn",
        messageAr: ERROR_MESSAGES.buyerNameEnRequired,
        messageEn: EN_MESSAGES.buyerNameEnRequired,
        severity: "error",
      });
    }

    const buyerTrn =
      (invoice.buyerTaxRegistrationNumber as string) ||
      (invoice.buyerVatNumber as string);
    if (!buyerTrn) {
      errors.push({
        field: "buyerTaxRegistrationNumber",
        messageAr: ERROR_MESSAGES.buyerTrnRequiredB2b,
        messageEn: EN_MESSAGES.buyerTrnRequiredB2b,
        severity: "error",
      });
    }

    const buyerAddressAr = invoice.buyerAddressAr as string;
    if (!buyerAddressAr) {
      errors.push({
        field: "buyerAddressAr",
        messageAr: ERROR_MESSAGES.buyerAddressArRequired,
        messageEn: EN_MESSAGES.buyerAddressArRequired,
        severity: "error",
      });
    }

    const buyerAddressEn = invoice.buyerAddressEn as string;
    if (!buyerAddressEn) {
      errors.push({
        field: "buyerAddressEn",
        messageAr: ERROR_MESSAGES.buyerAddressEnRequired,
        messageEn: EN_MESSAGES.buyerAddressEnRequired,
        severity: "error",
      });
    }
  }

  if (invoiceType === "export") {
    // Export: buyer name required (both languages), buyer TRN recommended
    const buyerNameAr = invoice.buyerNameAr as string;
    if (!buyerNameAr) {
      errors.push({
        field: "buyerNameAr",
        messageAr: ERROR_MESSAGES.buyerNameArRequired,
        messageEn: EN_MESSAGES.buyerNameArRequired,
        severity: "error",
      });
    }
  }

  // ── Step 4: Currency ─────────────────────────────────────────────────
  const currency = invoice.currency as string;
  if (currency && currency !== EGYPT_ETA_CURRENCY) {
    errors.push({
      field: "currency",
      messageAr: ERROR_MESSAGES.currencyMustBeEgp,
      messageEn: EN_MESSAGES.currencyMustBeEgp,
      severity: "error",
    });
  }

  const decimalPlaces = invoice.currencyDecimalPlaces as number;
  if (decimalPlaces && decimalPlaces !== EGYPT_ETA_DECIMAL_PLACES) {
    errors.push({
      field: "currencyDecimalPlaces",
      messageAr: ERROR_MESSAGES.decimalPlacesMustBe2,
      messageEn: EN_MESSAGES.decimalPlacesMustBe2,
      severity: "error",
    });
  }

  // ── Step 5: VAT rate ─────────────────────────────────────────────────
  const taxRate = parseFloat(
    (invoice.taxRate as string) || (company.defaultTaxRate as string) || "0",
  );

  if (invoiceType === "export") {
    // Export invoices must have 0% VAT
    if (taxRate !== 0) {
      errors.push({
        field: "taxRate",
        messageAr: ERROR_MESSAGES.vatRateMustBe0ForExport,
        messageEn: EN_MESSAGES.vatRateMustBe0ForExport,
        severity: "error",
      });
    }
  } else {
    // Standard and simplified invoices: 14% VAT
    // Allow 0% for exempt items but not as the main rate
    if (taxRate !== EGYPT_ETA_VAT_RATE && taxRate !== 0) {
      errors.push({
        field: "taxRate",
        messageAr: ERROR_MESSAGES.vatRateMustBe14,
        messageEn: EN_MESSAGES.vatRateMustBe14,
        severity: "error",
      });
    }
  }

  // ── Step 6: Line items dual language ─────────────────────────────────
  const lineItemsRaw = invoice.lineItems as string;
  if (lineItemsRaw) {
    try {
      const items: LineItem[] = JSON.parse(lineItemsRaw);
      for (const item of items) {
        // Check if Arabic description exists (could be in lineItemsAr)
        if (!item.description) {
          errors.push({
            field: "lineItems",
            messageAr: ERROR_MESSAGES.lineItemDescriptionEnRequired,
            messageEn: EN_MESSAGES.lineItemDescriptionEnRequired,
            severity: "error",
          });
        }
      }
    } catch {
      // If lineItems can't be parsed, skip line item validation
    }
  }

  const lineItemsArRaw = invoice.lineItemsAr as string;
  if (!lineItemsArRaw && lineItemsRaw) {
    // Arabic line items are required for ETA compliance
    warnings.push({
      field: "lineItemsAr",
      messageAr: ERROR_MESSAGES.lineItemDescriptionArRequired,
      messageEn: EN_MESSAGES.lineItemDescriptionArRequired,
      severity: "warning",
    });
  }

  // ── Step 7: Invoice type consistency ─────────────────────────────────
  if (invoiceType === "standard" && !sellerTrn) {
    // Already caught in Step 1 — just ensure consistency
  }

  // ── Step 8: Advisory warnings ────────────────────────────────────────
  // Retention warning
  warnings.push({
    field: "recordRetention",
    messageAr: ERROR_MESSAGES.retentionWarning,
    messageEn: EN_MESSAGES.retentionWarning,
    severity: "warning",
  });

  // Portal registration warning
  warnings.push({
    field: "etaPortalRegistration",
    messageAr: ERROR_MESSAGES.portalRegistrationRequired,
    messageEn: EN_MESSAGES.portalRegistrationRequired,
    severity: "warning",
  });

  // Digital receipt warning for B2C
  if (invoiceType === "simplified") {
    warnings.push({
      field: "digitalReceipt",
      messageAr: ERROR_MESSAGES.digitalReceiptRequired,
      messageEn: EN_MESSAGES.digitalReceiptRequired,
      severity: "warning",
    });
  }

  const valid = errors.length === 0;
  if (!valid) {
    logger.warn("[egypt-eta] Invoice validation failed", {
      companySlug: company.slug,
      invoiceNumber: invoice.invoiceNumber,
      errorCount: errors.length,
      errors: errors.map((e) => e.messageEn),
    });
  } else {
    logger.info("[egypt-eta] Invoice validation passed", {
      companySlug: company.slug,
      invoiceNumber: invoice.invoiceNumber,
      warningCount: warnings.length,
    });
  }

  return { valid, errors, warnings };
}

// ── Payload Generation ──────────────────────────────────────────────────

/**
 * generateEgyptEtaInvoicePayload — Generates a structured payload for ETA submission.
 *
 * Creates dual-language payload with:
 * - Arabic + English fields for seller/buyer
 * - EGP 2-decimal amounts
 * - 14% VAT for standard/simplified, 0% for export
 * - Seller/buyer TRN
 * - Invoice classification (standard/simplified/export)
 * - UUID for ETA identification
 */
export function generateEgyptEtaInvoicePayload(
  invoice: Record<string, unknown>,
  company: Record<string, unknown>,
): EgyptEtaInvoicePayload {
  const invoiceType = determineEgyptEtaInvoiceType(invoice);
  const uuid = (invoice.uuid as string) || generateEgyptEtaUuid();

  // ── Dates ────────────────────────────────────────────────────────────
  const issueDate = (invoice.issueDate as string) || new Date().toISOString().split("T")[0];
  const dueDate = (invoice.dueDate as string) || issueDate;

  const issueHijri = formatHijri(issueDate);
  const dueHijri = formatHijri(dueDate);
  const issueDual = formatDualDate(issueDate);
  const dueDual = formatDualDate(dueDate);

  // ── Seller fields ────────────────────────────────────────────────────
  const sellerNameAr =
    (invoice.sellerNameAr as string) || (company.nameAr as string) || "";
  const sellerNameEn =
    (invoice.sellerNameEn as string) || (company.name as string) || "";
  const sellerAddressAr =
    (invoice.sellerAddressAr as string) ||
    (company.addressAr as string) ||
    (company.address as string) ||
    "";
  const sellerAddressEn =
    (invoice.sellerAddressEn as string) || (company.address as string) || "";
  const sellerTrn =
    (invoice.sellerTaxRegistrationNumber as string) ||
    (invoice.vatNumber as string) ||
    (company.vatNumber as string) ||
    "";

  // ── Buyer fields ─────────────────────────────────────────────────────
  const buyerNameAr = (invoice.buyerNameAr as string) || (invoice.clientNameAr as string) || null;
  const buyerNameEn = (invoice.buyerNameEn as string) || (invoice.clientName as string) || null;
  const buyerAddressAr = (invoice.buyerAddressAr as string) || null;
  const buyerAddressEn = (invoice.buyerAddressEn as string) || null;
  const buyerTrn =
    (invoice.buyerTaxRegistrationNumber as string) ||
    (invoice.buyerVatNumber as string) ||
    null;
  const buyerCountryCode = (invoice.buyerCountryCode as string) || null;

  // ── Line items ───────────────────────────────────────────────────────
  const lineItemsRaw = (invoice.lineItems as string) || "[]";
  let parsedItems: LineItem[] = [];
  try {
    parsedItems = JSON.parse(lineItemsRaw);
  } catch {
    parsedItems = [];
  }

  const dp = EGYPT_ETA_DECIMAL_PLACES;
  const vatRate = invoiceType === "export" ? 0 : EGYPT_ETA_VAT_RATE;

  const etaLineItems: EgyptEtaLineItemPayload[] = parsedItems.map((item, idx) => {
    const lineTotal = num(item.total ?? num(item.qty) * num(item.price), dp);
    const lineTaxAmount = (lineTotal * vatRate) / 100;
    return {
      id: `LI-${idx + 1}`,
      descriptionAr: ((item as unknown) as Record<string, unknown>).descriptionAr as string || item.description || "",
      descriptionEn: item.description || "",
      qty: num(item.qty, dp).toFixed(dp),
      unitPrice: num(item.price, dp).toFixed(dp),
      unitCode: "EA",
      lineTotal: lineTotal.toFixed(dp),
      taxRate: vatRate.toFixed(dp),
      taxAmount: num(lineTaxAmount, dp).toFixed(dp),
      taxCategory: vatRate === 0 ? "Z" : "S",
      taxSchemeAr: "ضريبة القيمة المضافة",
      taxSchemeEn: "Value Added Tax",
      discountAmount: null,
    };
  });

  // ── Totals ───────────────────────────────────────────────────────────
  const shipping = num(invoice.shipping, dp);
  const discount = num(invoice.discount, dp);
  const totals = calcInvoiceTotals(parsedItems, vatRate, shipping, discount);

  // ── Invoice type labels ──────────────────────────────────────────────
  const typeLabels: Record<EgyptEtaInvoiceType, { ar: string; en: string }> = {
    standard: { ar: "فاتورة ضريبية", en: "standard" },
    simplified: { ar: "إيصال إلكتروني", en: "simplified" },
    export: { ar: "فاتورة تصدير", en: "export" },
  };

  return {
    uuid,
    invoiceNumber: (invoice.invoiceNumber as string) || "",
    invoiceType,
    invoiceTypeAr: typeLabels[invoiceType].ar,
    invoiceTypeEn: typeLabels[invoiceType].en,
    etaRegulation: EGYPT_ETA_REGULATION,

    issueDateGregorian: issueDate,
    issueDateHijri: issueHijri,
    issueDateDual: issueDual,
    dueDateGregorian: dueDate,
    dueDateHijri: dueHijri,
    dueDateDual: dueDual,

    currency: EGYPT_ETA_CURRENCY,
    currencyDecimalPlaces: dp,

    sellerNameAr,
    sellerNameEn,
    sellerAddressAr,
    sellerAddressEn,
    sellerTaxRegistrationNumber: sellerTrn,
    sellerCommercialRegistration:
      (invoice.commercialRegistration as string) ||
      (company.commercialRegistration as string) ||
      null,
    sellerCountryCode: "EG",

    buyerNameAr,
    buyerNameEn,
    buyerAddressAr,
    buyerAddressEn,
    buyerTaxRegistrationNumber: buyerTrn,
    buyerCountryCode,

    lineItems: etaLineItems,

    subtotal: num(totals.subtotal, dp).toFixed(dp),
    taxRate: vatRate.toFixed(dp),
    taxAmount: num(totals.taxAmount, dp).toFixed(dp),
    total: num(totals.total, dp).toFixed(dp),
    shipping: num(totals.shipping, dp).toFixed(dp),
    discount: num(totals.discount, dp).toFixed(dp),
    paid: num(invoice.paid, dp).toFixed(dp),

    notesAr: (invoice.notesAr as string) || null,
    notesEn: (invoice.notes as string) || null,

    eInvoiceAuthority: EGYPT_ETA_AUTHORITY,
    previousInvoiceHash: (invoice.previousInvoiceHash as string) || "",
    invoiceHash: "",
    paymentMethod: (invoice.paymentMethod as string) || null,
    isExport: invoiceType === "export",
    digitalReceipt: invoiceType === "simplified",
  };
}

// ── Submission ──────────────────────────────────────────────────────────

/**
 * submitEgyptEtaInvoice — Submits an invoice payload to the ETA portal.
 *
 * Placeholder: ETA API requires taxpayer registration first.
 * Stores EInvoice record with authorityType="eta_egypt".
 *
 * @param payload - The ETA invoice payload to submit
 * @returns Submission result with ETA reference and status
 */
export async function submitEgyptEtaInvoice(
  payload: EgyptEtaInvoicePayload,
): Promise<EgyptEtaSubmissionResult> {
  const invoiceType = payload.invoiceType;

  logger.info("[egypt-eta] Submitting invoice to ETA portal", {
    invoiceNumber: payload.invoiceNumber,
    invoiceType,
    companySlug: payload.eInvoiceAuthority,
  });

  // ── ETA API requires registration — placeholder implementation ───────
  // In production, this would call the actual ETA portal endpoints:
  //   - Standard invoices: POST /invoiceRequests
  //   - Simplified receipts: POST /receiptrequests
  //   - Export invoices: POST /exportInvoiceRequests
  //
  // The ETA portal requires:
  //   1. Taxpayer registration on the ETA portal
  //   2. API access token (OAuth2)
  //   3. Valid TRN for both seller and buyer (for B2B)
  //   4. Correct invoice format per ETA specification

  try {
    // Placeholder: create EInvoice record in database
    // In production, replace with actual ETA API call
    const eInvoice = await db.eInvoice.create({
      data: {
        authorityType: EGYPT_ETA_AUTHORITY,
        submissionStatus: "pending", // Will be updated when ETA portal responds
        uuid: payload.uuid,
        rawXml: JSON.stringify(payload),
        companySlug: payload.sellerNameEn, // Temporary — should use actual companySlug
        invoiceId: 0, // Placeholder — should link to actual invoice
      },
    });

    logger.info("[egypt-eta] EInvoice record created (placeholder)", {
      eInvoiceId: eInvoice.id,
      invoiceNumber: payload.invoiceNumber,
      authorityType: EGYPT_ETA_AUTHORITY,
      note: "ETA portal submission is placeholder — requires taxpayer registration",
    });

    return {
      ok: true,
      eInvoiceId: eInvoice.id,
      submissionStatus: "pending",
      etaSubmissionId: `ETA-PLACEHOLDER-${eInvoice.id}`,
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    logger.error("[egypt-eta] Failed to create EInvoice record", {
      error: errorMsg,
      invoiceNumber: payload.invoiceNumber,
    });

    return {
      ok: false,
      submissionStatus: "rejected",
      error: errorMsg,
      rejectionReason: "Failed to create EInvoice record — ETA portal submission placeholder",
    };
  }
}

// ── Status Check ────────────────────────────────────────────────────────

/**
 * checkEgyptEtaInvoiceStatus — Checks submission status from local DB.
 *
 * @param eInvoiceId - The EInvoice record ID
 * @returns Status info from the EInvoice table
 */
export async function checkEgyptEtaInvoiceStatus(
  eInvoiceId: number,
): Promise<{
  status: string;
  submissionId?: string;
  rejectionReason?: string;
  submittedAt?: Date;
  approvedAt?: Date;
}> {
  try {
    const eInvoice = await db.eInvoice.findUnique({
      where: { id: eInvoiceId },
    });

    if (!eInvoice) {
      logger.warn("[egypt-eta] EInvoice not found", { eInvoiceId });
      return { status: "not_found" };
    }

    return {
      status: eInvoice.submissionStatus,
      submissionId: eInvoice.uuid ?? undefined,
      rejectionReason: eInvoice.rejectionReason ?? undefined,
      submittedAt: eInvoice.submittedAt ?? undefined,
      approvedAt: eInvoice.approvedAt ?? undefined,
    };
  } catch (err) {
    logger.error("[egypt-eta] Failed to check EInvoice status", {
      eInvoiceId,
      error: err instanceof Error ? err.message : String(err),
    });
    return { status: "error" };
  }
}

// ── Auto-Populate ──────────────────────────────────────────────────────

/**
 * autoPopulateEgyptEtaFields — Auto-populates ETA-specific fields for an invoice.
 *
 * Populates:
 * - UUID for ETA identification
 * - Hijri dates (optional for Egypt, but recommended)
 * - Seller TRN from company settings
 * - Arabic + English seller fields from company
 * - EGP currency enforcement
 * - 2-decimal precision
 * - 14% VAT rate for standard/simplified, 0% for export
 * - Invoice type classification
 * - E-invoice authority
 * - PIH placeholder
 */
export function autoPopulateEgyptEtaFields(
  invoiceData: Record<string, unknown>,
  company: Record<string, unknown>,
): Record<string, unknown> {
  const result = { ...invoiceData };
  const dp = EGYPT_ETA_DECIMAL_PLACES;

  // ── UUID ─────────────────────────────────────────────────────────────
  if (!result.uuid) {
    result.uuid = generateEgyptEtaUuid();
  }

  // ── Hijri dates (optional but recommended) ──────────────────────────
  if (result.issueDate && !result.hijriIssueDate) {
    result.hijriIssueDate = formatHijri(result.issueDate as string);
  }
  if (result.dueDate && !result.hijriDueDate) {
    result.hijriDueDate = formatHijri(result.dueDate as string);
  }
  if (result.issueDate && !result.issueDateDual) {
    result.issueDateDual = formatDualDate(result.issueDate as string);
  }
  if (result.dueDate && !result.dueDateDual) {
    result.dueDateDual = formatDualDate(result.dueDate as string);
  }

  // ── Seller TRN ───────────────────────────────────────────────────────
  if (!result.sellerTaxRegistrationNumber && !result.vatNumber) {
    result.sellerTaxRegistrationNumber =
      company.vatNumber || company.taxRegistrationNumber || "";
  }

  // ── Seller name (Arabic + English) ──────────────────────────────────
  if (!result.sellerNameAr) {
    result.sellerNameAr = company.nameAr || "";
  }
  if (!result.sellerNameEn) {
    result.sellerNameEn = company.name || "";
  }

  // ── Seller address (Arabic + English) ────────────────────────────────
  if (!result.sellerAddressAr) {
    result.sellerAddressAr = company.addressAr || company.address || "";
  }
  if (!result.sellerAddressEn) {
    result.sellerAddressEn = company.address || "";
  }

  // ── Currency ─────────────────────────────────────────────────────────
  result.currency = EGYPT_ETA_CURRENCY;
  result.currencyDecimalPlaces = dp;

  // ── Invoice type ─────────────────────────────────────────────────────
  const invoiceType = determineEgyptEtaInvoiceType(result);
  result.invoiceTypeEn = invoiceType;

  const typeLabelsAr: Record<EgyptEtaInvoiceType, string> = {
    standard: "فاتورة ضريبية",
    simplified: "إيصال إلكتروني",
    export: "فاتورة تصدير",
  };
  result.invoiceTypeAr = typeLabelsAr[invoiceType];

  // ── VAT rate ─────────────────────────────────────────────────────────
  if (invoiceType === "export") {
    result.taxRate = "0.00";
  } else if (!result.taxRate) {
    result.taxRate = EGYPT_ETA_VAT_RATE.toFixed(dp);
  }

  // ── 2-decimal precision on monetary fields ───────────────────────────
  const monetaryFields = ["subtotal", "taxAmount", "total", "shipping", "discount", "paid"];
  for (const field of monetaryFields) {
    if (result[field] !== undefined && result[field] !== null) {
      result[field] = num(result[field], dp).toFixed(dp);
    }
  }

  // ── E-invoice authority ──────────────────────────────────────────────
  result.eInvoiceAuthority = EGYPT_ETA_AUTHORITY;

  // ── PIH placeholder ──────────────────────────────────────────────────
  if (!result.previousInvoiceHash) {
    result.previousInvoiceHash = "";
  }

  // ── Export flag ──────────────────────────────────────────────────────
  result.isExport = invoiceType === "export";

  // ── Digital receipt flag ─────────────────────────────────────────────
  result.digitalReceipt = invoiceType === "simplified";

  logger.debug("[egypt-eta] Auto-populated ETA fields", {
    uuid: result.uuid,
    invoiceType: result.invoiceTypeEn,
    currency: result.currency,
    taxRate: result.taxRate,
  });

  return result;
}

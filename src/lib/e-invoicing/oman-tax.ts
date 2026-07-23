/**
 * oman-tax.ts — Oman Tax Authority e-invoicing compliance module.
 *
 * Implements Oman Tax Authority (هيئة الضرائب العُمانية) e-invoicing requirements.
 * Oman introduced VAT at 5% in 2021 and is developing an e-invoicing framework.
 *
 * Key requirements:
 * - VAT at 5% (standard rate per Oman VAT law)
 * - OMR currency with exactly 3 decimal places
 * - Arabic mandatory for all invoice fields
 * - English optional (recommended for B2B)
 * - Tax Authority portal submission (framework being developed)
 * - TRN (Tax Registration Number) mandatory for seller
 * - Buyer TRN required for B2B (standard) invoices
 * - 5-year record retention
 * - Fines for non-compliance up to OMR 20,000
 *
 * Oman Tax Authority e-invoicing framework is currently under development.
 * The structure is ready to plug in when the portal becomes available.
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

export interface OmanTaxValidationError {
  field: string;
  messageAr: string; // Arabic error message (Gulf Arabic — Omani style)
  messageEn: string; // English error message for developer reference
  severity: "error" | "warning"; // error = blocks submission, warning = advisory
}

export interface OmanTaxValidationResult {
  valid: boolean;
  errors: OmanTaxValidationError[];
  warnings: OmanTaxValidationError[];
}

export type OmanTaxInvoiceType = "standard" | "simplified";
// standard = B2B tax invoice (فاتورة ضريبية) — requires buyer TRN, Arabic mandatory
// simplified = B2C retail invoice (فاتورة مبسطة) — lighter requirements

export interface OmanTaxInvoicePayload {
  // ── Header ───────────────────────────────────────────────────────────
  uuid: string;
  invoiceNumber: string;
  invoiceType: OmanTaxInvoiceType;
  invoiceTypeAr: string;
  invoiceTypeEn: string;
  omanTaxRegulation: string; // "Oman Tax Authority e-invoicing"

  // ── Dates (dual calendar) ────────────────────────────────────────────
  issueDateGregorian: string; // YYYY-MM-DD
  issueDateHijri: string; // formatted Hijri string
  issueDateDual: string; // dual format
  dueDateGregorian: string;
  dueDateHijri: string;
  dueDateDual: string;

  // ── Currency ─────────────────────────────────────────────────────────
  currency: string; // "OMR"
  currencyDecimalPlaces: number; // 3

  // ── Seller ───────────────────────────────────────────────────────────
  sellerNameAr: string;
  sellerNameEn: string | null; // Optional for Oman
  sellerAddressAr: string;
  sellerAddressEn: string | null;
  sellerVatTrn: string; // VAT TRN — mandatory for Oman Tax Authority
  sellerCommercialRegistration: string | null;
  sellerCountryCode: string; // "OM"

  // ── Buyer ────────────────────────────────────────────────────────────
  buyerNameAr: string | null; // Required for standard (B2B)
  buyerNameEn: string | null;
  buyerAddressAr: string | null;
  buyerAddressEn: string | null;
  buyerVatTrn: string | null; // Required for standard (B2B)
  buyerCountryCode: string | null;

  // ── Line items ───────────────────────────────────────────────────────
  lineItems: OmanTaxLineItemPayload[];

  // ── Totals (OMR, 3 decimal places) ───────────────────────────────────
  subtotal: string;
  taxRate: string; // "5.000"
  taxAmount: string;
  total: string;
  shipping: string;
  discount: string;
  paid: string;

  // ── Notes ────────────────────────────────────────────────────────────
  notesAr: string | null;
  notesEn: string | null;

  // ── Oman Tax-specific ────────────────────────────────────────────────
  eInvoiceAuthority: string; // "oman_tax"
  previousInvoiceHash: string;
  invoiceHash: string;
  paymentMethod: string | null;
}

export interface OmanTaxLineItemPayload {
  id: string;
  descriptionAr: string;
  descriptionEn: string | null;
  qty: string; // formatted with 3 decimals
  unitPrice: string;
  unitCode: string;
  lineTotal: string;
  taxRate: string;
  taxAmount: string;
  taxCategory: string; // "S" standard, "Z" zero, "E" exempt
  taxSchemeAr: string; // "ضريبة القيمة المضافة"
  taxSchemeEn: string; // "Value Added Tax"
  discountAmount: string | null;
}

export interface OmanTaxSubmissionResult {
  ok: boolean;
  eInvoiceId?: number;
  submissionStatus: "pending" | "submitted" | "approved" | "rejected";
  omanTaxSubmissionId?: string;
  error?: string;
  rejectionReason?: string;
}

// ── Constants ──────────────────────────────────────────────────────────────

export const OMAN_TAX_AUTHORITY: EInvoiceAuthority = "oman_tax";
export const OMAN_TAX_CURRENCY = "OMR";
export const OMAN_TAX_DECIMAL_PLACES = 3;
export const OMAN_TAX_VAT_RATE = 5;
export const OMAN_TAX_REGULATION = "Oman Tax Authority e-invoicing";
export const OMAN_TAX_MAX_FINE_OMR = 20000;
const OMAN_TAX_PORTAL_BASE_URL = "https://tax.gov.om/api/v1"; // placeholder

// ── Arabic error messages (Gulf Arabic — Omani style) ─────────────────────

const ERROR_MESSAGES = {
  // ── Seller validation ────────────────────────────────────────────────
  sellerNameArRequired: "اسم البائع باللغة العربية مطلوب — هيئة الضرائب العُمانية",
  sellerAddressArRequired: "عنوان البائع باللغة العربية مطلوب",
  sellerTrnRequired: "الرقم الضريبي للبائع مطلوب — هيئة الضرائب العُمانية",

  // ── Buyer validation ─────────────────────────────────────────────────
  buyerNameArRequired: "اسم المشتري باللغة العربية مطلوب للفواتير الضريبية (B2B)",
  buyerTrnRequiredB2b: "الرقم الضريبي للمشتري مطلوب للفواتير الضريبية (B2B)",
  buyerAddressArRequired: "عنوان المشتري باللغة العربية مطلوب للفواتير الضريبية (B2B)",

  // ── Currency ─────────────────────────────────────────────────────────
  currencyMustBeOmr: "يجب أن تكون العملة ريال عُماني (OMR) — هيئة الضرائب العُمانية",
  decimalPlacesMustBe3: "يجب أن يكون عدد المنازل العشرية 3 للريال العُماني (OMR)",

  // ── VAT ──────────────────────────────────────────────────────────────
  vatRateMustBe5: "يجب أن تكون نسبة ضريبة القيمة المضافة 5% — قانون عُمان",
  vatZeroRateAllowed: "نسبة 0% مسموحة للسلع المعفاة من الضريبة",

  // ── Invoice type ─────────────────────────────────────────────────────
  invoiceTypeRequired: "نوع الفاتورة مطلوب (ضريبية / مبسطة)",
  b2bBuyerTrnMismatch: "نوع الفاتورة ضريبية (B2B) يتطلب رقم ضريبي للمشتري",

  // ── Language ─────────────────────────────────────────────────────────
  arabicMandatory: "اللغة العربية مطلوبة لجميع الفواتير — هيئة الضرائب العُمانية",
  lineItemDescriptionArRequired: "وصف الصف باللغة العربية مطلوب",
  englishRecommendedB2b: "اللغة الإنجليزية مقترحة للفواتير B2B (الضريبية)",

  // ── Retention ────────────────────────────────────────────────────────
  retentionWarning: "⚠️ يجب الاحتفاظ بالسجلات لمدة 5 سنوات — هيئة الضرائب العُمانية. الغرامة قد تصل إلى 20,000 ريال عُماني",

  // ── Portal ───────────────────────────────────────────────────────────
  portalFrameworkInDevelopment: "⚠️ نظام الفواتير الإلكترونية لدى هيئة الضرائب العُمانية قيد التطوير",
};

const EN_MESSAGES = {
  sellerNameArRequired: "Seller name in Arabic is required — Oman Tax Authority",
  sellerAddressArRequired: "Seller address in Arabic is required",
  sellerTrnRequired: "Seller VAT TRN is required — Oman Tax Authority",
  buyerNameArRequired: "Buyer name in Arabic is required for standard (B2B) invoices",
  buyerTrnRequiredB2b: "Buyer VAT TRN is required for standard (B2B) invoices",
  buyerAddressArRequired: "Buyer address in Arabic is required for standard (B2B) invoices",
  currencyMustBeOmr: "Currency must be OMR (Omani Rial) — Oman Tax Authority",
  decimalPlacesMustBe3: "Currency decimal places must be 3 for OMR",
  vatRateMustBe5: "VAT rate must be 5% — Oman VAT law",
  vatZeroRateAllowed: "0% rate is allowed for VAT-exempt goods",
  invoiceTypeRequired: "Invoice type is required (standard/simplified)",
  b2bBuyerTrnMismatch: "Standard (B2B) invoice requires buyer VAT TRN",
  arabicMandatory: "Arabic language is mandatory for all invoices — Oman Tax Authority",
  lineItemDescriptionArRequired: "Line item description in Arabic is required",
  englishRecommendedB2b: "English language is recommended for B2B (standard) invoices",
  retentionWarning: "⚠️ Records must be retained for 5 years — Oman Tax Authority. Fine up to OMR 20,000",
  portalFrameworkInDevelopment: "⚠️ Oman Tax Authority e-invoicing framework is under development",
};

// ── Invoice Type Classification ──────────────────────────────────────────

/**
 * determineOmanTaxInvoiceType — Classifies an invoice as standard (B2B) or simplified (B2C).
 */
export function determineOmanTaxInvoiceType(
  invoice: Record<string, unknown>,
): OmanTaxInvoiceType {
  const explicit = invoice.invoiceTypeEn as string;
  if (explicit === "standard") return "standard";
  if (explicit === "simplified") return "simplified";

  const typeAr = invoice.invoiceTypeAr as string;
  if (typeAr === "فاتورة ضريبية") return "standard";
  if (typeAr === "فاتورة مبسطة") return "simplified";

  // B2B if buyer has VAT number or clientId
  if (invoice.buyerVatNumber || invoice.clientId) {
    return "standard";
  }

  return "simplified";
}

// ── UUID Generation ──────────────────────────────────────────────────────

/**
 * generateOmanTaxUuid — Generates a UUID v4 for Oman Tax invoice identification.
 */
export function generateOmanTaxUuid(): string {
  return crypto.randomUUID();
}

// ── Validation ──────────────────────────────────────────────────────────

/**
 * validateOmanTaxInvoice — Validates invoice data for Oman Tax Authority compliance.
 *
 * Checks:
 * - Arabic mandatory for all invoice fields (seller name, seller address)
 * - Buyer Arabic name + TRN required for B2B (standard)
 * - OMR currency with exactly 3 decimal places
 * - 5% VAT rate (0% allowed for exempt)
 * - Seller VAT TRN mandatory
 * - Buyer VAT TRN mandatory for B2B (standard)
 * - English recommended (warning) for B2B invoices
 * - Line items must have Arabic descriptions
 */
export function validateOmanTaxInvoice(
  invoice: Record<string, unknown>,
  company: Record<string, unknown>,
): OmanTaxValidationResult {
  const errors: OmanTaxValidationError[] = [];
  const warnings: OmanTaxValidationError[] = [];

  // ── Step 0: Skip for non-Oman companies ──────────────────────────────
  const countryCode = company.country as string;
  if (countryCode !== "OM") {
    return { valid: true, errors: [], warnings: [] };
  }

  const invoiceType = determineOmanTaxInvoiceType(invoice);

  // ── Step 1: Seller VAT TRN ───────────────────────────────────────────
  const sellerTrn =
    (invoice.vatNumber as string) || (company.vatNumber as string);
  if (!sellerTrn) {
    errors.push({
      field: "vatNumber",
      messageAr: ERROR_MESSAGES.sellerTrnRequired,
      messageEn: EN_MESSAGES.sellerTrnRequired,
      severity: "error",
    });
  }

  // ── Step 2: Seller name (Arabic mandatory) ──────────────────────────
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

  // English seller name — recommended warning for B2B
  const sellerNameEn =
    (invoice.sellerNameEn as string) || (company.name as string);
  if (!sellerNameEn && invoiceType === "standard") {
    warnings.push({
      field: "sellerNameEn",
      messageAr: ERROR_MESSAGES.englishRecommendedB2b,
      messageEn: EN_MESSAGES.englishRecommendedB2b,
      severity: "warning",
    });
  }

  // ── Step 3: Seller address (Arabic mandatory) ────────────────────────
  const sellerAddressAr =
    (invoice.sellerAddressAr as string) ||
    (company.addressAr as string) ||
    (company.address as string);
  if (!sellerAddressAr) {
    errors.push({
      field: "sellerAddressAr",
      messageAr: ERROR_MESSAGES.sellerAddressArRequired,
      messageEn: EN_MESSAGES.sellerAddressArRequired,
      severity: "error",
    });
  }

  // ── Step 4: Buyer validation (type-specific) ─────────────────────────
  if (invoiceType === "standard") {
    const buyerNameAr = invoice.buyerNameAr as string;
    if (!buyerNameAr) {
      errors.push({
        field: "buyerNameAr",
        messageAr: ERROR_MESSAGES.buyerNameArRequired,
        messageEn: EN_MESSAGES.buyerNameArRequired,
        severity: "error",
      });
    }

    const buyerTrn =
      (invoice.buyerVatNumber as string) ||
      (invoice.buyerTaxRegistrationNumber as string);
    if (!buyerTrn) {
      errors.push({
        field: "buyerVatNumber",
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

    // English buyer name — recommended warning for B2B
    const buyerNameEn = invoice.buyerNameEn as string;
    if (!buyerNameEn) {
      warnings.push({
        field: "buyerNameEn",
        messageAr: ERROR_MESSAGES.englishRecommendedB2b,
        messageEn: EN_MESSAGES.englishRecommendedB2b,
        severity: "warning",
      });
    }
  }

  // ── Step 5: Currency ─────────────────────────────────────────────────
  const currency = invoice.currency as string;
  if (currency && currency !== OMAN_TAX_CURRENCY) {
    errors.push({
      field: "currency",
      messageAr: ERROR_MESSAGES.currencyMustBeOmr,
      messageEn: EN_MESSAGES.currencyMustBeOmr,
      severity: "error",
    });
  }

  const decimalPlaces = invoice.currencyDecimalPlaces as number;
  if (decimalPlaces && decimalPlaces !== OMAN_TAX_DECIMAL_PLACES) {
    errors.push({
      field: "currencyDecimalPlaces",
      messageAr: ERROR_MESSAGES.decimalPlacesMustBe3,
      messageEn: EN_MESSAGES.decimalPlacesMustBe3,
      severity: "error",
    });
  }

  // ── Step 6: VAT rate ─────────────────────────────────────────────────
  const taxRate = parseFloat(
    (invoice.taxRate as string) || (company.defaultTaxRate as string) || "0",
  );
  if (taxRate !== OMAN_TAX_VAT_RATE && taxRate !== 0) {
    errors.push({
      field: "taxRate",
      messageAr: ERROR_MESSAGES.vatRateMustBe5,
      messageEn: EN_MESSAGES.vatRateMustBe5,
      severity: "error",
    });
  }

  // ── Step 7: Line items Arabic description ────────────────────────────
  const lineItemsAr = invoice.lineItemsAr as string;
  if (!lineItemsAr) {
    warnings.push({
      field: "lineItemsAr",
      messageAr: ERROR_MESSAGES.lineItemDescriptionArRequired,
      messageEn: EN_MESSAGES.lineItemDescriptionArRequired,
      severity: "warning",
    });
  }

  // ── Step 8: Advisory warnings ────────────────────────────────────────
  warnings.push({
    field: "recordRetention",
    messageAr: ERROR_MESSAGES.retentionWarning,
    messageEn: EN_MESSAGES.retentionWarning,
    severity: "warning",
  });

  warnings.push({
    field: "omanTaxPortal",
    messageAr: ERROR_MESSAGES.portalFrameworkInDevelopment,
    messageEn: EN_MESSAGES.portalFrameworkInDevelopment,
    severity: "warning",
  });

  const valid = errors.length === 0;
  if (!valid) {
    logger.warn("[oman-tax] Invoice validation failed", {
      companySlug: company.slug,
      invoiceNumber: invoice.invoiceNumber,
      errorCount: errors.length,
      errors: errors.map((e) => e.messageEn),
    });
  } else {
    logger.info("[oman-tax] Invoice validation passed", {
      companySlug: company.slug,
      invoiceNumber: invoice.invoiceNumber,
      warningCount: warnings.length,
    });
  }

  return { valid, errors, warnings };
}

// ── Payload Generation ──────────────────────────────────────────────────

/**
 * generateOmanTaxInvoicePayload — Generates a structured payload for Oman Tax submission.
 */
export function generateOmanTaxInvoicePayload(
  invoice: Record<string, unknown>,
  company: Record<string, unknown>,
): OmanTaxInvoicePayload {
  const invoiceType = determineOmanTaxInvoiceType(invoice);
  const uuid = (invoice.uuid as string) || generateOmanTaxUuid();
  const dp = OMAN_TAX_DECIMAL_PLACES;

  // ── Dates ────────────────────────────────────────────────────────────
  const issueDate = (invoice.issueDate as string) || new Date().toISOString().split("T")[0];
  const dueDate = (invoice.dueDate as string) || issueDate;

  const issueHijri = formatHijri(issueDate);
  const dueHijri = formatHijri(dueDate);
  const issueDual = formatDualDate(issueDate);
  const dueDual = formatDualDate(dueDate);

  // ── Seller fields ────────────────────────────────────────────────────
  const sellerNameAr = (invoice.sellerNameAr as string) || (company.nameAr as string) || "";
  const sellerNameEn = (invoice.sellerNameEn as string) || (company.name as string) || null;
  const sellerAddressAr =
    (invoice.sellerAddressAr as string) ||
    (company.addressAr as string) ||
    (company.address as string) ||
    "";
  const sellerAddressEn =
    (invoice.sellerAddressEn as string) || (company.address as string) || null;
  const sellerTrn = (invoice.vatNumber as string) || (company.vatNumber as string) || "";

  // ── Buyer fields ─────────────────────────────────────────────────────
  const buyerNameAr = (invoice.buyerNameAr as string) || null;
  const buyerNameEn = (invoice.buyerNameEn as string) || null;
  const buyerAddressAr = (invoice.buyerAddressAr as string) || null;
  const buyerAddressEn = (invoice.buyerAddressEn as string) || null;
  const buyerTrn = (invoice.buyerVatNumber as string) || null;
  const buyerCountryCode = (invoice.buyerCountryCode as string) || null;

  // ── Line items ───────────────────────────────────────────────────────
  const lineItemsRaw = (invoice.lineItems as string) || "[]";
  let parsedItems: LineItem[] = [];
  try {
    parsedItems = JSON.parse(lineItemsRaw);
  } catch {
    parsedItems = [];
  }

  const omanLineItems: OmanTaxLineItemPayload[] = parsedItems.map((item, idx) => {
    const lineTotal = num(item.total ?? num(item.qty) * num(item.price), dp);
    const lineTaxAmount = (lineTotal * OMAN_TAX_VAT_RATE) / 100;
    return {
      id: `LI-${idx + 1}`,
      descriptionAr: ((item as unknown) as Record<string, unknown>).descriptionAr as string || item.description || "",
      descriptionEn: item.description || null,
      qty: num(item.qty, dp).toFixed(dp),
      unitPrice: num(item.price, dp).toFixed(dp),
      unitCode: "EA",
      lineTotal: lineTotal.toFixed(dp),
      taxRate: OMAN_TAX_VAT_RATE.toFixed(dp),
      taxAmount: num(lineTaxAmount, dp).toFixed(dp),
      taxCategory: "S",
      taxSchemeAr: "ضريبة القيمة المضافة",
      taxSchemeEn: "Value Added Tax",
      discountAmount: null,
    };
  });

  // ── Totals ───────────────────────────────────────────────────────────
  const shipping = num(invoice.shipping, dp);
  const discount = num(invoice.discount, dp);
  const totals = calcInvoiceTotals(parsedItems, OMAN_TAX_VAT_RATE, shipping, discount);

  const typeLabels: Record<OmanTaxInvoiceType, { ar: string; en: string }> = {
    standard: { ar: "فاتورة ضريبية", en: "standard" },
    simplified: { ar: "فاتورة مبسطة", en: "simplified" },
  };

  return {
    uuid,
    invoiceNumber: (invoice.invoiceNumber as string) || "",
    invoiceType,
    invoiceTypeAr: typeLabels[invoiceType].ar,
    invoiceTypeEn: typeLabels[invoiceType].en,
    omanTaxRegulation: OMAN_TAX_REGULATION,

    issueDateGregorian: issueDate,
    issueDateHijri: issueHijri,
    issueDateDual: issueDual,
    dueDateGregorian: dueDate,
    dueDateHijri: dueHijri,
    dueDateDual: dueDual,

    currency: OMAN_TAX_CURRENCY,
    currencyDecimalPlaces: dp,

    sellerNameAr,
    sellerNameEn,
    sellerAddressAr,
    sellerAddressEn,
    sellerVatTrn: sellerTrn,
    sellerCommercialRegistration:
      (company.commercialRegistration as string) || null,
    sellerCountryCode: "OM",

    buyerNameAr,
    buyerNameEn,
    buyerAddressAr,
    buyerAddressEn,
    buyerVatTrn: buyerTrn,
    buyerCountryCode,

    lineItems: omanLineItems,

    subtotal: num(totals.subtotal, dp).toFixed(dp),
    taxRate: OMAN_TAX_VAT_RATE.toFixed(dp),
    taxAmount: num(totals.taxAmount, dp).toFixed(dp),
    total: num(totals.total, dp).toFixed(dp),
    shipping: num(totals.shipping, dp).toFixed(dp),
    discount: num(totals.discount, dp).toFixed(dp),
    paid: num(invoice.paid, dp).toFixed(dp),

    notesAr: (invoice.notesAr as string) || null,
    notesEn: (invoice.notes as string) || null,

    eInvoiceAuthority: OMAN_TAX_AUTHORITY,
    previousInvoiceHash: (invoice.previousInvoiceHash as string) || "",
    invoiceHash: "",
    paymentMethod: (invoice.paymentMethod as string) || null,
  };
}

// ── Submission ──────────────────────────────────────────────────────────

/**
 * submitOmanTaxInvoice — Submits an invoice payload to the Oman Tax Authority portal.
 *
 * Placeholder: Oman Tax e-invoicing framework is under development.
 * Stores EInvoice record with authorityType="oman_tax".
 */
export async function submitOmanTaxInvoice(
  payload: OmanTaxInvoicePayload,
): Promise<OmanTaxSubmissionResult> {
  logger.info("[oman-tax] Submitting invoice to Oman Tax Authority portal", {
    invoiceNumber: payload.invoiceNumber,
    invoiceType: payload.invoiceType,
    note: "Oman Tax e-invoicing framework is under development — placeholder submission",
  });

  try {
    const eInvoice = await db.eInvoice.create({
      data: {
        authorityType: OMAN_TAX_AUTHORITY,
        submissionStatus: "pending",
        uuid: payload.uuid,
        rawXml: JSON.stringify(payload),
        companySlug: payload.sellerNameAr, // Temporary — should use actual companySlug
        invoiceId: 0, // Placeholder — should link to actual invoice
      },
    });

    logger.info("[oman-tax] EInvoice record created (placeholder)", {
      eInvoiceId: eInvoice.id,
      invoiceNumber: payload.invoiceNumber,
      authorityType: OMAN_TAX_AUTHORITY,
    });

    return {
      ok: true,
      eInvoiceId: eInvoice.id,
      submissionStatus: "pending",
      omanTaxSubmissionId: `OMAN-PLACEHOLDER-${eInvoice.id}`,
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    logger.error("[oman-tax] Failed to create EInvoice record", {
      error: errorMsg,
      invoiceNumber: payload.invoiceNumber,
    });

    return {
      ok: false,
      submissionStatus: "rejected",
      error: errorMsg,
      rejectionReason: "Failed to create EInvoice record — Oman Tax portal submission placeholder",
    };
  }
}

// ── Auto-Populate ──────────────────────────────────────────────────────

/**
 * autoPopulateOmanTaxFields — Auto-populates Oman Tax-specific fields for an invoice.
 *
 * Populates:
 * - UUID for Oman Tax identification
 * - Hijri dates
 * - Seller VAT TRN from company
 * - Arabic seller fields from company (mandatory)
 * - English seller fields (optional, recommended for B2B)
 * - OMR currency enforcement, 3-decimal precision
 * - 5% VAT rate
 * - Invoice type classification
 * - E-invoice authority
 * - PIH placeholder
 */
export function autoPopulateOmanTaxFields(
  invoiceData: Record<string, unknown>,
  company: Record<string, unknown>,
): Record<string, unknown> {
  const result = { ...invoiceData };
  const dp = OMAN_TAX_DECIMAL_PLACES;

  // ── UUID ─────────────────────────────────────────────────────────────
  if (!result.uuid) {
    result.uuid = generateOmanTaxUuid();
  }

  // ── Hijri dates ──────────────────────────────────────────────────────
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

  // ── Seller VAT TRN ───────────────────────────────────────────────────
  if (!result.vatNumber) {
    result.vatNumber = company.vatNumber || "";
  }

  // ── Seller name (Arabic mandatory) ──────────────────────────────────
  if (!result.sellerNameAr) {
    result.sellerNameAr = company.nameAr || "";
  }
  // English seller name — optional, fill if available
  if (!result.sellerNameEn && company.name) {
    result.sellerNameEn = company.name;
  }

  // ── Seller address ───────────────────────────────────────────────────
  if (!result.sellerAddressAr) {
    result.sellerAddressAr = company.addressAr || company.address || "";
  }
  if (!result.sellerAddressEn && company.address) {
    result.sellerAddressEn = company.address;
  }

  // ── Currency ─────────────────────────────────────────────────────────
  result.currency = OMAN_TAX_CURRENCY;
  result.currencyDecimalPlaces = dp;

  // ── Invoice type ─────────────────────────────────────────────────────
  const invoiceType = determineOmanTaxInvoiceType(result);
  result.invoiceTypeEn = invoiceType;

  const typeLabelsAr: Record<OmanTaxInvoiceType, string> = {
    standard: "فاتورة ضريبية",
    simplified: "فاتورة مبسطة",
  };
  result.invoiceTypeAr = typeLabelsAr[invoiceType];

  // ── VAT rate ─────────────────────────────────────────────────────────
  if (!result.taxRate) {
    result.taxRate = OMAN_TAX_VAT_RATE.toFixed(dp);
  }

  // ── 3-decimal precision on monetary fields ───────────────────────────
  const monetaryFields = ["subtotal", "taxAmount", "total", "shipping", "discount", "paid"];
  for (const field of monetaryFields) {
    if (result[field] !== undefined && result[field] !== null) {
      result[field] = num(result[field], dp).toFixed(dp);
    }
  }

  // ── E-invoice authority ──────────────────────────────────────────────
  result.eInvoiceAuthority = OMAN_TAX_AUTHORITY;

  // ── PIH placeholder ──────────────────────────────────────────────────
  if (!result.previousInvoiceHash) {
    result.previousInvoiceHash = "";
  }

  logger.debug("[oman-tax] Auto-populated Oman Tax fields", {
    uuid: result.uuid,
    invoiceType: result.invoiceTypeEn,
    currency: result.currency,
    taxRate: result.taxRate,
  });

  return result;
}

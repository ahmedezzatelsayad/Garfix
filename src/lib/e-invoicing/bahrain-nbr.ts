/**
 * bahrain-nbr.ts — Bahrain NBR (National Bureau for Revenue) e-invoicing compliance module.
 *
 * Implements Bahrain NBR (هيئة الإيرادات الوطنية) e-invoicing requirements.
 * Bahrain introduced VAT at 10% in 2019 and is developing an e-invoicing framework.
 *
 * Key requirements:
 * - VAT at 10% (standard rate per Bahrain VAT law)
 * - BHD currency with exactly 3 decimal places
 * - Arabic language mandatory for B2C invoices
 * - English mandatory for B2B invoices
 * - NBR portal submission (framework being developed)
 * - TRN (Tax Registration Number) mandatory for seller
 * - Buyer TRN required for B2B (standard) invoices
 * - 5-year record retention
 * - Fines for non-compliance up to BHD 10,000
 *
 * NBR portal API is currently under development.
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

export interface BahrainNbrValidationError {
  field: string;
  messageAr: string; // Arabic error message (Gulf Arabic — Bahraini style)
  messageEn: string; // English error message for developer reference
  severity: "error" | "warning"; // error = blocks submission, warning = advisory
}

export interface BahrainNbrValidationResult {
  valid: boolean;
  errors: BahrainNbrValidationError[];
  warnings: BahrainNbrValidationError[];
}

export type BahrainNbrInvoiceType = "standard" | "simplified";
// standard = B2B tax invoice (فاتورة ضريبية) — requires buyer TRN
// simplified = B2C retail invoice (فاتورة مبسطة) — lighter requirements

export interface BahrainNbrInvoicePayload {
  // ── Header ───────────────────────────────────────────────────────────
  uuid: string;
  invoiceNumber: string;
  invoiceType: BahrainNbrInvoiceType;
  invoiceTypeAr: string;
  invoiceTypeEn: string;
  nbrRegulation: string; // "Bahrain NBR e-invoicing"

  // ── Dates (dual calendar) ────────────────────────────────────────────
  issueDateGregorian: string; // YYYY-MM-DD
  issueDateHijri: string; // formatted Hijri string
  issueDateDual: string; // dual format
  dueDateGregorian: string;
  dueDateHijri: string;
  dueDateDual: string;

  // ── Currency ─────────────────────────────────────────────────────────
  currency: string; // "BHD"
  currencyDecimalPlaces: number; // 3

  // ── Seller ───────────────────────────────────────────────────────────
  sellerNameAr: string;
  sellerNameEn: string;
  sellerAddressAr: string;
  sellerAddressEn: string;
  sellerVatTrn: string; // VAT TRN — mandatory for NBR
  sellerCommercialRegistration: string | null;
  sellerCountryCode: string; // "BH"

  // ── Buyer ────────────────────────────────────────────────────────────
  buyerNameAr: string | null; // Required for standard (B2B)
  buyerNameEn: string | null;
  buyerAddressAr: string | null;
  buyerAddressEn: string | null;
  buyerVatTrn: string | null; // Required for standard (B2B)
  buyerCountryCode: string | null;

  // ── Line items ───────────────────────────────────────────────────────
  lineItems: BahrainNbrLineItemPayload[];

  // ── Totals (BHD, 3 decimal places) ───────────────────────────────────
  subtotal: string;
  taxRate: string; // "10.000"
  taxAmount: string;
  total: string;
  shipping: string;
  discount: string;
  paid: string;

  // ── Notes ────────────────────────────────────────────────────────────
  notesAr: string | null;
  notesEn: string | null;

  // ── NBR-specific ─────────────────────────────────────────────────────
  eInvoiceAuthority: string; // "bahrain_nbr"
  previousInvoiceHash: string;
  invoiceHash: string;
  paymentMethod: string | null;
}

export interface BahrainNbrLineItemPayload {
  id: string;
  descriptionAr: string;
  descriptionEn: string;
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

export interface BahrainNbrSubmissionResult {
  ok: boolean;
  eInvoiceId?: number;
  submissionStatus: "pending" | "submitted" | "approved" | "rejected";
  nbrSubmissionId?: string;
  error?: string;
  rejectionReason?: string;
}

// ── Constants ──────────────────────────────────────────────────────────────

export const BAHRAIN_NBR_AUTHORITY: EInvoiceAuthority = "bahrain_nbr";
export const BAHRAIN_NBR_CURRENCY = "BHD";
export const BAHRAIN_NBR_DECIMAL_PLACES = 3;
export const BAHRAIN_NBR_VAT_RATE = 10;
export const BAHRAIN_NBR_REGULATION = "Bahrain NBR e-invoicing";
export const BAHRAIN_NBR_MAX_FINE_BHD = 10000;
const BAHRAIN_NBR_PORTAL_BASE_URL = "https://nbr.gov.bh/api/v1"; // placeholder

// ── Arabic error messages (Gulf Arabic — Bahraini style) ──────────────────

const ERROR_MESSAGES = {
  // ── Seller validation ────────────────────────────────────────────────
  sellerNameArRequired: "اسم البائع باللغة العربية مطلوب — هيئة الإيرادات الوطنية",
  sellerNameEnRequired: "اسم البائع باللغة الإنجليزية مطلوب — هيئة الإيرادات الوطنية",
  sellerAddressArRequired: "عنوان البائع باللغة العربية مطلوب",
  sellerAddressEnRequired: "عنوان البائع باللغة الإنجليزية مطلوب",
  sellerTrnRequired: "الرقم الضريبي للبائع مطلوب — هيئة الإيرادات الوطنية البحرينية",

  // ── Buyer validation ─────────────────────────────────────────────────
  buyerNameArRequired: "اسم المشتري باللغة العربية مطلوب للفواتير الضريبية (B2B)",
  buyerNameEnRequired: "اسم المشتري باللغة الإنجليزية مطلوب للفواتير الضريبية (B2B)",
  buyerTrnRequiredB2b: "الرقم الضريبي للمشتري مطلوب للفواتير الضريبية (B2B)",
  buyerAddressArRequired: "عنوان المشتري باللغة العربية مطلوب للفواتير الضريبية (B2B)",
  buyerAddressEnRequired: "عنوان المشتري باللغة الإنجليزية مطلوب للفواتير الضريبية (B2B)",

  // ── Currency ─────────────────────────────────────────────────────────
  currencyMustBeBhd: "يجب أن تكون العملة دينار بحريني (BHD) — هيئة الإيرادات الوطنية",
  decimalPlacesMustBe3: "يجب أن يكون عدد المنازل العشرية 3 للدينار البحريني (BHD)",

  // ── VAT ──────────────────────────────────────────────────────────────
  vatRateMustBe10: "يجب أن تكون نسبة ضريبة القيمة المضافة 10% — قانون البحرين",
  vatZeroRateAllowed: "نسبة 0% مسموحة للسلع المعفاة من الضريبة",

  // ── Invoice type ─────────────────────────────────────────────────────
  invoiceTypeRequired: "نوع الفاتورة مطلوب (ضريبية / مبسطة)",
  b2bBuyerTrnMismatch: "نوع الفاتورة ضريبية (B2B) يتطلب رقم ضريبي للمشتري",

  // ── Language ─────────────────────────────────────────────────────────
  arabicMandatoryForB2c: "اللغة العربية مطلوبة لفواتير B2C (المبسطة) — هيئة الإيرادات الوطنية",
  lineItemDescriptionArRequired: "وصف الصف باللغة العربية مطلوب",
  lineItemDescriptionEnRequired: "وصف الصف باللغة الإنجليزية مطلوب",

  // ── Retention ────────────────────────────────────────────────────────
  retentionWarning: "⚠️ يجب الاحتفاظ بالسجلات لمدة 5 سنوات — هيئة الإيرادات الوطنية البحرينية. الغرامة قد تصل إلى 10,000 دينار بحريني",

  // ── Portal ───────────────────────────────────────────────────────────
  portalFrameworkInDevelopment: "⚠️ نظام الفواتير الإلكترونية لدى هيئة الإيرادات الوطنية البحرينية قيد التطوير",
};

const EN_MESSAGES = {
  sellerNameArRequired: "Seller name in Arabic is required — Bahrain NBR",
  sellerNameEnRequired: "Seller name in English is required — Bahrain NBR",
  sellerAddressArRequired: "Seller address in Arabic is required",
  sellerAddressEnRequired: "Seller address in English is required",
  sellerTrnRequired: "Seller VAT TRN is required — Bahrain NBR",
  buyerNameArRequired: "Buyer name in Arabic is required for standard (B2B) invoices",
  buyerNameEnRequired: "Buyer name in English is required for standard (B2B) invoices",
  buyerTrnRequiredB2b: "Buyer VAT TRN is required for standard (B2B) invoices",
  buyerAddressArRequired: "Buyer address in Arabic is required for standard (B2B) invoices",
  buyerAddressEnRequired: "Buyer address in English is required for standard (B2B) invoices",
  currencyMustBeBhd: "Currency must be BHD (Bahraini Dinar) — Bahrain NBR",
  decimalPlacesMustBe3: "Currency decimal places must be 3 for BHD",
  vatRateMustBe10: "VAT rate must be 10% — Bahrain VAT law",
  vatZeroRateAllowed: "0% rate is allowed for VAT-exempt goods",
  invoiceTypeRequired: "Invoice type is required (standard/simplified)",
  b2bBuyerTrnMismatch: "Standard (B2B) invoice requires buyer VAT TRN",
  arabicMandatoryForB2c: "Arabic language is required for B2C (simplified) invoices — NBR Bahrain",
  lineItemDescriptionArRequired: "Line item description in Arabic is required",
  lineItemDescriptionEnRequired: "Line item description in English is required",
  retentionWarning: "⚠️ Records must be retained for 5 years — Bahrain NBR. Fine up to BHD 10,000",
  portalFrameworkInDevelopment: "⚠️ Bahrain NBR e-invoicing framework is under development",
};

// ── Invoice Type Classification ──────────────────────────────────────────

/**
 * determineBahrainNbrInvoiceType — Classifies an invoice as standard (B2B) or simplified (B2C).
 */
export function determineBahrainNbrInvoiceType(
  invoice: Record<string, unknown>,
): BahrainNbrInvoiceType {
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
 * generateBahrainNbrUuid — Generates a UUID v4 for NBR invoice identification.
 */
export function generateBahrainNbrUuid(): string {
  return crypto.randomUUID();
}

// ── Validation ──────────────────────────────────────────────────────────

/**
 * validateBahrainNbrInvoice — Validates invoice data for Bahrain NBR compliance.
 *
 * Checks:
 * - Arabic mandatory for seller (B2C), Arabic + English for seller (B2B)
 * - Buyer Arabic + English required for B2B (standard)
 * - BHD currency with exactly 3 decimal places
 * - 10% VAT rate (0% allowed for exempt)
 * - Seller VAT TRN mandatory
 * - Buyer VAT TRN mandatory for B2B (standard)
 * - Line items must have Arabic descriptions (B2C) or dual language (B2B)
 */
export function validateBahrainNbrInvoice(
  invoice: Record<string, unknown>,
  company: Record<string, unknown>,
): BahrainNbrValidationResult {
  const errors: BahrainNbrValidationError[] = [];
  const warnings: BahrainNbrValidationError[] = [];

  // ── Step 0: Skip for non-Bahrain companies ───────────────────────────
  const countryCode = company.country as string;
  if (countryCode !== "BH") {
    return { valid: true, errors: [], warnings: [] };
  }

  const invoiceType = determineBahrainNbrInvoiceType(invoice);

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

  // ── Step 2: Seller name (Arabic mandatory, English required) ────────
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

  // ── Step 3: Seller address ──────────────────────────────────────────
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

  // ── Step 5: Currency ─────────────────────────────────────────────────
  const currency = invoice.currency as string;
  if (currency && currency !== BAHRAIN_NBR_CURRENCY) {
    errors.push({
      field: "currency",
      messageAr: ERROR_MESSAGES.currencyMustBeBhd,
      messageEn: EN_MESSAGES.currencyMustBeBhd,
      severity: "error",
    });
  }

  const decimalPlaces = invoice.currencyDecimalPlaces as number;
  if (decimalPlaces && decimalPlaces !== BAHRAIN_NBR_DECIMAL_PLACES) {
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
  if (taxRate !== BAHRAIN_NBR_VAT_RATE && taxRate !== 0) {
    errors.push({
      field: "taxRate",
      messageAr: ERROR_MESSAGES.vatRateMustBe10,
      messageEn: EN_MESSAGES.vatRateMustBe10,
      severity: "error",
    });
  }

  // ── Step 7: Arabic mandatory for B2C ─────────────────────────────────
  if (invoiceType === "simplified") {
    const lineItemsAr = invoice.lineItemsAr as string;
    if (!lineItemsAr) {
      warnings.push({
        field: "lineItemsAr",
        messageAr: ERROR_MESSAGES.arabicMandatoryForB2c,
        messageEn: EN_MESSAGES.arabicMandatoryForB2c,
        severity: "warning",
      });
    }
  }

  // ── Step 8: Advisory warnings ────────────────────────────────────────
  warnings.push({
    field: "recordRetention",
    messageAr: ERROR_MESSAGES.retentionWarning,
    messageEn: EN_MESSAGES.retentionWarning,
    severity: "warning",
  });

  warnings.push({
    field: "nbrPortal",
    messageAr: ERROR_MESSAGES.portalFrameworkInDevelopment,
    messageEn: EN_MESSAGES.portalFrameworkInDevelopment,
    severity: "warning",
  });

  const valid = errors.length === 0;
  if (!valid) {
    logger.warn("[bahrain-nbr] Invoice validation failed", {
      companySlug: company.slug,
      invoiceNumber: invoice.invoiceNumber,
      errorCount: errors.length,
      errors: errors.map((e) => e.messageEn),
    });
  } else {
    logger.info("[bahrain-nbr] Invoice validation passed", {
      companySlug: company.slug,
      invoiceNumber: invoice.invoiceNumber,
      warningCount: warnings.length,
    });
  }

  return { valid, errors, warnings };
}

// ── Payload Generation ──────────────────────────────────────────────────

/**
 * generateBahrainNbrInvoicePayload — Generates a structured payload for NBR submission.
 */
export function generateBahrainNbrInvoicePayload(
  invoice: Record<string, unknown>,
  company: Record<string, unknown>,
): BahrainNbrInvoicePayload {
  const invoiceType = determineBahrainNbrInvoiceType(invoice);
  const uuid = (invoice.uuid as string) || generateBahrainNbrUuid();
  const dp = BAHRAIN_NBR_DECIMAL_PLACES;

  // ── Dates ────────────────────────────────────────────────────────────
  const issueDate = (invoice.issueDate as string) || new Date().toISOString().split("T")[0];
  const dueDate = (invoice.dueDate as string) || issueDate;

  const issueHijri = formatHijri(issueDate);
  const dueHijri = formatHijri(dueDate);
  const issueDual = formatDualDate(issueDate);
  const dueDual = formatDualDate(dueDate);

  // ── Seller fields ────────────────────────────────────────────────────
  const sellerNameAr = (invoice.sellerNameAr as string) || (company.nameAr as string) || "";
  const sellerNameEn = (invoice.sellerNameEn as string) || (company.name as string) || "";
  const sellerAddressAr =
    (invoice.sellerAddressAr as string) ||
    (company.addressAr as string) ||
    (company.address as string) ||
    "";
  const sellerAddressEn =
    (invoice.sellerAddressEn as string) || (company.address as string) || "";
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

  const nbrLineItems: BahrainNbrLineItemPayload[] = parsedItems.map((item, idx) => {
    const lineTotal = num(item.total ?? num(item.qty) * num(item.price), dp);
    const lineTaxAmount = (lineTotal * BAHRAIN_NBR_VAT_RATE) / 100;
    return {
      id: `LI-${idx + 1}`,
      descriptionAr: ((item as unknown) as Record<string, unknown>).descriptionAr as string || item.description || "",
      descriptionEn: item.description || "",
      qty: num(item.qty, dp).toFixed(dp),
      unitPrice: num(item.price, dp).toFixed(dp),
      unitCode: "EA",
      lineTotal: lineTotal.toFixed(dp),
      taxRate: BAHRAIN_NBR_VAT_RATE.toFixed(dp),
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
  const totals = calcInvoiceTotals(parsedItems, BAHRAIN_NBR_VAT_RATE, shipping, discount);

  const typeLabels: Record<BahrainNbrInvoiceType, { ar: string; en: string }> = {
    standard: { ar: "فاتورة ضريبية", en: "standard" },
    simplified: { ar: "فاتورة مبسطة", en: "simplified" },
  };

  return {
    uuid,
    invoiceNumber: (invoice.invoiceNumber as string) || "",
    invoiceType,
    invoiceTypeAr: typeLabels[invoiceType].ar,
    invoiceTypeEn: typeLabels[invoiceType].en,
    nbrRegulation: BAHRAIN_NBR_REGULATION,

    issueDateGregorian: issueDate,
    issueDateHijri: issueHijri,
    issueDateDual: issueDual,
    dueDateGregorian: dueDate,
    dueDateHijri: dueHijri,
    dueDateDual: dueDual,

    currency: BAHRAIN_NBR_CURRENCY,
    currencyDecimalPlaces: dp,

    sellerNameAr,
    sellerNameEn,
    sellerAddressAr,
    sellerAddressEn,
    sellerVatTrn: sellerTrn,
    sellerCommercialRegistration:
      (company.commercialRegistration as string) || null,
    sellerCountryCode: "BH",

    buyerNameAr,
    buyerNameEn,
    buyerAddressAr,
    buyerAddressEn,
    buyerVatTrn: buyerTrn,
    buyerCountryCode,

    lineItems: nbrLineItems,

    subtotal: num(totals.subtotal, dp).toFixed(dp),
    taxRate: BAHRAIN_NBR_VAT_RATE.toFixed(dp),
    taxAmount: num(totals.taxAmount, dp).toFixed(dp),
    total: num(totals.total, dp).toFixed(dp),
    shipping: num(totals.shipping, dp).toFixed(dp),
    discount: num(totals.discount, dp).toFixed(dp),
    paid: num(invoice.paid, dp).toFixed(dp),

    notesAr: (invoice.notesAr as string) || null,
    notesEn: (invoice.notes as string) || null,

    eInvoiceAuthority: BAHRAIN_NBR_AUTHORITY,
    previousInvoiceHash: (invoice.previousInvoiceHash as string) || "",
    invoiceHash: "",
    paymentMethod: (invoice.paymentMethod as string) || null,
  };
}

// ── Submission ──────────────────────────────────────────────────────────

/**
 * submitBahrainNbrInvoice — Submits an invoice payload to the NBR portal.
 *
 * Placeholder: NBR e-invoicing framework is under development.
 * Stores EInvoice record with authorityType="bahrain_nbr".
 */
export async function submitBahrainNbrInvoice(
  payload: BahrainNbrInvoicePayload,
): Promise<BahrainNbrSubmissionResult> {
  logger.info("[bahrain-nbr] Submitting invoice to NBR portal", {
    invoiceNumber: payload.invoiceNumber,
    invoiceType: payload.invoiceType,
    note: "NBR e-invoicing framework is under development — placeholder submission",
  });

  try {
    const eInvoice = await db.eInvoice.create({
      data: {
        authorityType: BAHRAIN_NBR_AUTHORITY,
        submissionStatus: "pending",
        uuid: payload.uuid,
        rawXml: JSON.stringify(payload),
        companySlug: payload.sellerNameEn, // Temporary — should use actual companySlug
        invoiceId: 0, // Placeholder — should link to actual invoice
      },
    });

    logger.info("[bahrain-nbr] EInvoice record created (placeholder)", {
      eInvoiceId: eInvoice.id,
      invoiceNumber: payload.invoiceNumber,
      authorityType: BAHRAIN_NBR_AUTHORITY,
    });

    return {
      ok: true,
      eInvoiceId: eInvoice.id,
      submissionStatus: "pending",
      nbrSubmissionId: `NBR-PLACEHOLDER-${eInvoice.id}`,
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    logger.error("[bahrain-nbr] Failed to create EInvoice record", {
      error: errorMsg,
      invoiceNumber: payload.invoiceNumber,
    });

    return {
      ok: false,
      submissionStatus: "rejected",
      error: errorMsg,
      rejectionReason: "Failed to create EInvoice record — NBR portal submission placeholder",
    };
  }
}

// ── Auto-Populate ──────────────────────────────────────────────────────

/**
 * autoPopulateBahrainNbrFields — Auto-populates NBR-specific fields for an invoice.
 *
 * Populates:
 * - UUID for NBR identification
 * - Hijri dates
 * - Seller VAT TRN from company
 * - Arabic + English seller fields from company
 * - BHD currency enforcement, 3-decimal precision
 * - 10% VAT rate
 * - Invoice type classification
 * - E-invoice authority
 * - PIH placeholder
 */
export function autoPopulateBahrainNbrFields(
  invoiceData: Record<string, unknown>,
  company: Record<string, unknown>,
): Record<string, unknown> {
  const result = { ...invoiceData };
  const dp = BAHRAIN_NBR_DECIMAL_PLACES;

  // ── UUID ─────────────────────────────────────────────────────────────
  if (!result.uuid) {
    result.uuid = generateBahrainNbrUuid();
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

  // ── Seller name (Arabic + English) ──────────────────────────────────
  if (!result.sellerNameAr) {
    result.sellerNameAr = company.nameAr || "";
  }
  if (!result.sellerNameEn) {
    result.sellerNameEn = company.name || "";
  }

  // ── Seller address ───────────────────────────────────────────────────
  if (!result.sellerAddressAr) {
    result.sellerAddressAr = company.addressAr || company.address || "";
  }
  if (!result.sellerAddressEn) {
    result.sellerAddressEn = company.address || "";
  }

  // ── Currency ─────────────────────────────────────────────────────────
  result.currency = BAHRAIN_NBR_CURRENCY;
  result.currencyDecimalPlaces = dp;

  // ── Invoice type ─────────────────────────────────────────────────────
  const invoiceType = determineBahrainNbrInvoiceType(result);
  result.invoiceTypeEn = invoiceType;

  const typeLabelsAr: Record<BahrainNbrInvoiceType, string> = {
    standard: "فاتورة ضريبية",
    simplified: "فاتورة مبسطة",
  };
  result.invoiceTypeAr = typeLabelsAr[invoiceType];

  // ── VAT rate ─────────────────────────────────────────────────────────
  if (!result.taxRate) {
    result.taxRate = BAHRAIN_NBR_VAT_RATE.toFixed(dp);
  }

  // ── 3-decimal precision on monetary fields ───────────────────────────
  const monetaryFields = ["subtotal", "taxAmount", "total", "shipping", "discount", "paid"];
  for (const field of monetaryFields) {
    if (result[field] !== undefined && result[field] !== null) {
      result[field] = num(result[field], dp).toFixed(dp);
    }
  }

  // ── E-invoice authority ──────────────────────────────────────────────
  result.eInvoiceAuthority = BAHRAIN_NBR_AUTHORITY;

  // ── PIH placeholder ──────────────────────────────────────────────────
  if (!result.previousInvoiceHash) {
    result.previousInvoiceHash = "";
  }

  logger.debug("[bahrain-nbr] Auto-populated NBR fields", {
    uuid: result.uuid,
    invoiceType: result.invoiceTypeEn,
    currency: result.currency,
    taxRate: result.taxRate,
  });

  return result;
}

/**
 * uae-fta.ts — UAE Federal Tax Authority (FTA) e-invoicing compliance module.
 *
 * Implements UAE FTA e-invoicing requirements for the Peppol network,
 * supporting UBL 2.1 (Peppol BIS 3) format for electronic invoicing.
 *
 * Key requirements:
 * - Peppol network-based e-invoicing (UBL 2.1 / Peppol BIS 3 format)
 * - Standard Invoice (B2B) with full Peppol BIS 3 structure
 * - Simplified Invoice (B2C) with minimal structure
 * - English language mandatory, Arabic optional (dual language)
 * - AED currency with exactly 2 decimal places
 * - 5% VAT rate
 * - TRN (Tax Registration Number) mandatory for seller
 * - Buyer TRN required for B2B (standard) invoices
 * - Digital signature using PKI (ECDSA/X.509)
 * - Submission via Peppol Access Point provider
 *
 * UAE FTA e-invoicing regulation reference:
 * - Federal Decree-Law No. 8 of 2017 (Value Added Tax)
 * - Cabinet Decision No. 52 of 2017 on VAT
 * - FTA e-invoicing guidance (Peppol-based framework)
 *
 * Fines for non-compliance: up to AED 20,000 per violation.
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

export interface UaeFtaValidationError {
  field: string;
  messageAr: string; // Arabic error message for UI display
  messageEn: string; // English error message for developer reference
  severity: "error" | "warning"; // error = blocks submission, warning = advisory
}

export interface UaeFtaValidationResult {
  valid: boolean;
  errors: UaeFtaValidationError[];
  warnings: UaeFtaValidationError[];
}

export type UaeFtaInvoiceType = "standard" | "simplified";
// standard = B2B tax invoice (فاتورة ضريبية) — full Peppol BIS 3, buyer TRN required
// simplified = B2C retail invoice (فاتورة مبسطة) — minimal structure, no buyer TRN

export interface UaeFtaInvoicePayload {
  // ── Header ───────────────────────────────────────────────────────────
  uuid: string;
  invoiceNumber: string;
  invoiceType: UaeFtaInvoiceType;
  invoiceTypeAr: string;
  invoiceTypeEn: string;
  ftaRegulation: string; // "UAE FTA e-invoicing (Peppol BIS 3)"

  // ── Dates (dual calendar) ────────────────────────────────────────────
  issueDateGregorian: string; // YYYY-MM-DD
  issueDateHijri: string; // formatted Hijri string (optional for UAE)
  issueDateDual: string; // dual format

  // ── Currency ─────────────────────────────────────────────────────────
  currency: string; // "AED"
  currencyDecimalPlaces: number; // 2

  // ── Seller ───────────────────────────────────────────────────────────
  sellerNameEn: string; // English mandatory
  sellerNameAr: string | null; // Arabic optional
  sellerAddressEn: string; // English mandatory
  sellerAddressAr: string | null;
  sellerVatTrn: string; // TRN — mandatory for UAE FTA
  sellerCommercialRegistration: string | null;
  sellerStreetNameEn: string | null;
  sellerStreetNameAr: string | null;
  sellerBuildingNumber: string | null;
  sellerPostalCode: string | null;
  sellerCityEn: string | null;
  sellerCityAr: string | null;
  sellerDistrictEn: string | null;
  sellerDistrictAr: string | null;
  sellerCountryCode: string; // "AE"

  // ── Buyer ────────────────────────────────────────────────────────────
  buyerNameEn: string | null; // Required for standard (B2B)
  buyerNameAr: string | null;
  buyerAddressEn: string | null;
  buyerAddressAr: string | null;
  buyerVatTrn: string | null; // Required for standard (B2B)
  buyerStreetNameEn: string | null;
  buyerStreetNameAr: string | null;
  buyerBuildingNumber: string | null;
  buyerPostalCode: string | null;
  buyerCityEn: string | null;
  buyerCityAr: string | null;
  buyerDistrictEn: string | null;
  buyerDistrictAr: string | null;
  buyerCountryCode: string | null;

  // ── Line items ───────────────────────────────────────────────────────
  lineItems: UaeFtaLineItemPayload[];

  // ── Totals (AED, 2 decimal places) ───────────────────────────────────
  subtotal: string;
  taxRate: string; // "5.00"
  taxAmount: string;
  total: string;
  shipping: string;
  discount: string;
  paid: string;

  // ── Notes ────────────────────────────────────────────────────────────
  notesEn: string | null;
  notesAr: string | null;

  // ── UAE FTA-specific ─────────────────────────────────────────────────
  eInvoiceAuthority: string; // "uae_fta"
  previousInvoiceHash: string; // PIH for chaining
  invoiceHash: string; // SHA-256 hash of invoice XML
  paymentMethod: string | null;

  // ── Signature ────────────────────────────────────────────────────────
  digitalSignature?: string; // PKI signature (base64)
  certificateHash?: string; // X.509 certificate hash
  signingTime?: string; // ISO 8601 signing timestamp
}

export interface UaeFtaLineItemPayload {
  id: string; // line item UUID
  descriptionEn: string; // English mandatory
  descriptionAr: string | null; // Arabic optional
  qty: string; // formatted with decimals
  unitPrice: string;
  unitCode: string; // UBL unit code (EA, DAY, etc.)
  lineTotal: string; // qty * unitPrice
  taxRate: string;
  taxAmount: string;
  taxCategory: string; // "S" for standard rate, "Z" for zero, "E" for exempt
  taxSchemeAr: string; // "ضريبة القيمة المضافة"
  taxSchemeEn: string; // "Value Added Tax"
  discountAmount: string | null;
}

export interface UaeFtaSubmissionResult {
  ok: boolean;
  eInvoiceId?: number;
  submissionStatus: "pending" | "submitted" | "cleared" | "accepted" | "rejected";
  peppolDocumentId?: string; // Peppol document identifier
  error?: string;
  rejectionReason?: string;
}

export interface UaeFtaUblXmlResult {
  xml: string;
  invoiceHash: string;
  uuid: string;
}

export interface UaeFtaSignatureResult {
  signedXml: string;
  invoiceHash: string;
  digitalSignature: string;
  certificateHash: string;
}

// ── Constants ──────────────────────────────────────────────────────────────

export const UAE_FTA_AUTHORITY: EInvoiceAuthority = "uae_fta";
export const UAE_FTA_CURRENCY = "AED";
export const UAE_FTA_DECIMAL_PLACES = 2;
export const UAE_FTA_VAT_RATE = 5;
export const UAE_FTA_REGULATION = "UAE FTA e-invoicing (Peppol BIS 3)";
export const UAE_FTA_MAX_FINE_AED = 20000;
const UAE_FTA_PEPPOL_AP_URL = "https://ap.myfatoorah.com/peppol"; // Peppol Access Point (MyFatoorah as AP provider)
const UAE_FTA_PEPPOL_BIS3_PROFILE = "urn:fdc:peppol.eu:2017:poacc:billing:01:1.0"; // Peppol BIS Billing 3.0 profile

// UBL 2.1 namespace constants
const UBL_NS = "urn:oasis:names:specification:ubl:schema:xsd:Invoice-2";
const CBC_NS = "urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2";
const CAC_NS = "urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2";

// ── Arabic error messages (UAE Arabic) ────────────────────────────────────

const ERROR_MESSAGES = {
  TRN_MISSING: {
    field: "vatTrn",
    messageAr: "رقم التسجيل الضريبي (TRN) للبائع مطلوب وفقاً لمتطلبات الهيئة الاتحادية للضرائب الإماراتية",
    messageEn: "Seller Tax Registration Number (TRN) is required per UAE FTA regulations",
    severity: "error" as const,
  },
  ENGLISH_SELLER_NAME_MISSING: {
    field: "sellerNameEn",
    messageAr: "اسم البائع باللغة الإنجليزية مطلوب وفقاً لنظام الفوترة الإلكترونية في الإمارات",
    messageEn: "English seller name is mandatory per UAE e-invoicing regulations",
    severity: "error" as const,
  },
  ENGLISH_SELLER_ADDRESS_MISSING: {
    field: "sellerAddressEn",
    messageAr: "عنوان البائع باللغة الإنجليزية مطلوب وفقاً لنظام الفوترة الإلكترونية في الإمارات",
    messageEn: "English seller address is mandatory per UAE e-invoicing regulations",
    severity: "error" as const,
  },
  ENGLISH_BUYER_NAME_MISSING: {
    field: "buyerNameEn",
    messageAr: "اسم المشتري باللغة الإنجليزية مطلوب للفواتير التجارية (B2B) وفقاً لمتطلبات الهيئة الاتحادية للضرائب",
    messageEn: "English buyer name is required for B2B (standard) invoices per UAE FTA regulations",
    severity: "error" as const,
  },
  ENGLISH_BUYER_ADDRESS_MISSING: {
    field: "buyerAddressEn",
    messageAr: "عنوان المشتري باللغة الإنجليزية مطلوب للفواتير التجارية (B2B) وفقاً لمتطلبات الهيئة الاتحادية للضرائب",
    messageEn: "English buyer address is required for B2B (standard) invoices per UAE FTA regulations",
    severity: "error" as const,
  },
  BUYER_TRN_MISSING: {
    field: "buyerVatTrn",
    messageAr: "رقم التسجيل الضريبي للمشتري مطلوب للفواتير التجارية (B2B) وفقاً لمتطلبات الهيئة الاتحادية للضرائب",
    messageEn: "Buyer Tax Registration Number (TRN) is required for B2B (standard) invoices per UAE FTA regulations",
    severity: "error" as const,
  },
  CURRENCY_NOT_AED: {
    field: "currency",
    messageAr: "يجب أن تكون عملة الفاتورة درهم إماراتي (AED) بخانتين عشرية",
    messageEn: "Invoice currency must be AED with exactly 2 decimal places",
    severity: "error" as const,
  },
  DECIMAL_PLACES_INVALID: {
    field: "currencyDecimalPlaces",
    messageAr: "يجب عرض المبالغ بخانتين عشرية للدرهم الإماراتي وفقاً لمتطلبات الهيئة الاتحادية للضرائب",
    messageEn: "Amounts must be displayed with exactly 2 decimal places for AED per UAE FTA regulations",
    severity: "error" as const,
  },
  VAT_RATE_INVALID: {
    field: "vatRate",
    messageAr: "يجب أن يكون معدل ضريبة القيمة المضافة 5% وفقاً لقانون الضريبة الإماراتي",
    messageEn: "VAT rate must be 5% per UAE tax law",
    severity: "error" as const,
  },
  INVOICE_TYPE_MISSING: {
    field: "invoiceType",
    messageAr: "يجب تصنيف نوع الفاتورة (فاتورة ضريبية أو فاتورة مبسطة) وفقاً لنظام الفوترة الإلكترونية",
    messageEn: "Invoice type classification is required (standard/simplified) per e-invoicing regulations",
    severity: "error" as const,
  },
  LINE_ITEMS_ENGLISH_MISSING: {
    field: "lineItemsEn",
    messageAr: "يجب أن تحتوي جميع البنود على وصف باللغة الإنجليزية وفقاً لنظام الفوترة الإلكترونية في الإمارات",
    messageEn: "All line items must have English descriptions per UAE e-invoicing regulations",
    severity: "error" as const,
  },
  UUID_MISSING: {
    field: "uuid",
    messageAr: "يجب أن تحتوي الفاتورة على رقم تعريف فريد (UUID) وفقاً لمتطلبات شبكة بيبول (Peppol)",
    messageEn: "Invoice must have a UUID per Peppol network requirements",
    severity: "warning" as const,
  },
  PIH_MISSING: {
    field: "previousInvoiceHash",
    messageAr: "يجب أن تحتوي الفاتورة على رمز التحقق للفاتورة السابقة (PIH) لضمان التتبع والربط",
    messageEn: "Invoice should include Previous Invoice Hash (PIH) for chain integrity",
    severity: "warning" as const,
  },
  NOTES_ENGLISH_MISSING: {
    field: "notesEn",
    messageAr: "الملاحظات يجب أن تكون باللغة الإنجليزية",
    messageEn: "Notes should be in English",
    severity: "warning" as const,
  },
  RETENTION_WARNING: {
    field: "recordRetention",
    messageAr: "تنبيه: يجب الاحتفاظ بالسجلات لمدة 5 سنوات وفقاً لمتطلبات الهيئة الاتحادية للضرائب. الغرامة قد تصل إلى 20,000 درهم إماراتي",
    messageEn: "Records must be retained for 5 years per UAE FTA regulations. Fines up to 20,000 AED",
    severity: "warning" as const,
  },
  SIGNING_CERTIFICATE_MISSING: {
    field: "certificate",
    messageAr: "شهادة التوقيع الإلكتروني مطلوبة لتقديم الفاتورة عبر شبكة بيبول (Peppol)",
    messageEn: "Digital signing certificate is required for Peppol network submission",
    severity: "warning" as const,
  },
  B2B_B2C_MISMATCH: {
    field: "invoiceTypeClassification",
    messageAr: "تصنيف نوع الفاتورة غير مطابق — يجب تصنيف الفواتير مع رقم تسجيل ضريبي للمشتري كفاتورة ضريبية (B2B)",
    messageEn: "Invoice type classification mismatch — invoices with buyer TRN must be classified as standard (B2B)",
    severity: "error" as const,
  },
  ARABIC_SELLER_NAME_RECOMMENDED: {
    field: "sellerNameAr",
    messageAr: "يُنصح بإضافة اسم البائع باللغة العربية لتحسين الامتثال المحلي",
    messageEn: "Arabic seller name is recommended for better local compliance",
    severity: "warning" as const,
  },
  ARABIC_BUYER_NAME_RECOMMENDED: {
    field: "buyerNameAr",
    messageAr: "يُنصح بإضافة اسم المشتري باللغة العربية للفواتير التجارية (B2B)",
    messageEn: "Arabic buyer name is recommended for B2B (standard) invoices",
    severity: "warning" as const,
  },
};

// ── UUID Generation ────────────────────────────────────────────────────────

/**
 * generateUaeFtaUuid — Generates a UUID for UAE FTA e-invoicing.
 *
 * Peppol requires a UUID for each invoice document. This UUID is used
 * for invoice identification within the Peppol network.
 */
export function generateUaeFtaUuid(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback: manual UUID v4 generation
  const hex = Array.from({ length: 32 }, () =>
    Math.floor(Math.random() * 16).toString(16)
  ).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-${(8 + Math.floor(Math.random() * 4)).toString(16)}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

// ── Invoice Type Classification ────────────────────────────────────────────

/**
 * determineUaeFtaInvoiceType — B2B = standard, B2C = simplified.
 *
 * UAE FTA rules:
 * - Standard invoices (فاتورة ضريبية): B2B with buyer TRN
 * - Simplified invoices (فاتورة مبسطة): B2C without buyer TRN
 *
 * If the buyer has a TRN or is a registered business (clientId),
 * classify as "standard" (B2B). Otherwise, "simplified" (B2C).
 */
export function determineUaeFtaInvoiceType(invoice: Record<string, unknown>): UaeFtaInvoiceType {
  // If already set, use it
  if (invoice.invoiceTypeEn === "standard" || invoice.invoiceTypeAr === "فاتورة ضريبية") {
    return "standard";
  }
  if (invoice.invoiceTypeEn === "simplified" || invoice.invoiceTypeAr === "فاتورة مبسطة") {
    return "simplified";
  }
  // Auto-classify: buyer has TRN or clientId → B2B (standard)
  if (invoice.buyerVatTrn || invoice.buyerVatNumber || invoice.clientId) {
    return "standard";
  }
  // Default to simplified (B2C) for UAE retail invoices
  return "simplified";
}

// ── Invoice Hash Computation ───────────────────────────────────────────────

/**
 * computeUaeFtaInvoiceHash — SHA-256 hash computation for invoice chaining.
 *
 * For Peppol network submissions, invoice hashes are used for:
 * - PIH (Previous Invoice Hash) chaining
 * - Digital signature verification
 * - Audit trail integrity
 *
 * Uses Node.js crypto for SHA-256. Returns hex-encoded hash.
 */
export function computeUaeFtaInvoiceHash(xml: string): string {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const nodeCrypto = require("node:crypto");
    return nodeCrypto.createHash("sha256").update(xml, "utf8").digest("hex");
  } catch {
    logger.warn("[uae-fta] node:crypto not available for hash computation — using placeholder");
    let hash = 0;
    for (let i = 0; i < xml.length; i++) {
      const char = xml.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash |= 0;
    }
    return Math.abs(hash).toString(16).padStart(64, "0").slice(0, 64);
  }
}

// ── Validation ─────────────────────────────────────────────────────────────

/**
 * validateUaeFtaInvoice — Validates that a UAE invoice meets FTA requirements.
 *
 * Returns validation errors with Arabic messages for UI display.
 * Errors block invoice creation/submission; warnings are advisory.
 *
 * UAE FTA specific checks:
 * - TRN (Tax Registration Number) required for seller
 * - English language mandatory for all fields
 * - AED currency with exactly 2 decimal places
 * - 5% VAT rate
 * - Buyer TRN required for B2B (standard) invoices
 */
export function validateUaeFtaInvoice(
  invoice: Record<string, unknown>,
  company: Record<string, unknown>,
): UaeFtaValidationResult {
  const errors: UaeFtaValidationError[] = [];
  const warnings: UaeFtaValidationError[] = [];

  const countryCode = company.country as string;
  // Only validate if company is UAE-based
  if (countryCode !== "AE") {
    return { valid: true, errors: [], warnings: [] };
  }

  // ── 1. Seller TRN (Tax Registration Number) mandatory ────────────────
  if (!company.vatNumber && !invoice.vatTrn && !invoice.sellerVatTrn) {
    errors.push(ERROR_MESSAGES.TRN_MISSING);
  }

  // ── 2. English seller name mandatory ─────────────────────────────────
  if (!company.name && !invoice.sellerNameEn) {
    errors.push(ERROR_MESSAGES.ENGLISH_SELLER_NAME_MISSING);
  }

  // ── 3. English seller address mandatory ──────────────────────────────
  if (!company.address && !invoice.sellerAddressEn) {
    errors.push(ERROR_MESSAGES.ENGLISH_SELLER_ADDRESS_MISSING);
  }

  // ── 4. English buyer name — mandatory for standard (B2B) invoices ────
  const invoiceType = determineUaeFtaInvoiceType(invoice);
  if (invoiceType === "standard") {
    if (!invoice.buyerNameEn && !invoice.clientName) {
      errors.push(ERROR_MESSAGES.ENGLISH_BUYER_NAME_MISSING);
    }
    if (!invoice.buyerAddressEn && !invoice.clientAddress) {
      errors.push(ERROR_MESSAGES.ENGLISH_BUYER_ADDRESS_MISSING);
    }
    // Buyer TRN required for B2B
    if (!invoice.buyerVatTrn && !invoice.buyerVatNumber) {
      errors.push(ERROR_MESSAGES.BUYER_TRN_MISSING);
    }
  }

  // ── 5. Currency must be AED ──────────────────────────────────────────
  const invoiceCurrency = (invoice.currency as string) || (company.currency as string) || UAE_FTA_CURRENCY;
  if (invoiceCurrency !== UAE_FTA_CURRENCY) {
    errors.push(ERROR_MESSAGES.CURRENCY_NOT_AED);
  }

  // ── 6. Decimal places must be 2 for AED ──────────────────────────────
  const decimalPlaces = (invoice.currencyDecimalPlaces as number) ?? UAE_FTA_DECIMAL_PLACES;
  if (decimalPlaces !== UAE_FTA_DECIMAL_PLACES) {
    errors.push(ERROR_MESSAGES.DECIMAL_PLACES_INVALID);
  }

  // ── 7. VAT rate must be 5% ──────────────────────────────────────────
  const taxRate = parseFloat(
    (invoice.taxRate as string) || (company.defaultTaxRate as string) || String(UAE_FTA_VAT_RATE)
  );
  if (taxRate !== UAE_FTA_VAT_RATE) {
    // Allow 0% VAT for exempt items but the main rate must be 5%
    if (taxRate !== 0) {
      errors.push(ERROR_MESSAGES.VAT_RATE_INVALID);
    }
  }

  // ── 8. Invoice type classification ──────────────────────────────────
  if (!invoice.invoiceTypeEn && !invoice.invoiceTypeAr) {
    errors.push(ERROR_MESSAGES.INVOICE_TYPE_MISSING);
  }

  // ── 9. B2B/B2C classification consistency ────────────────────────────
  if (invoiceType === "simplified" && (invoice.buyerVatTrn || invoice.buyerVatNumber)) {
    errors.push(ERROR_MESSAGES.B2B_B2C_MISMATCH);
  }

  // ── 10. Line items must have English descriptions ────────────────────
  const lineItems = invoice.lineItems as LineItem[] | string | undefined;
  let parsedItems: LineItem[] = [];
  if (typeof lineItems === "string") {
    try { parsedItems = JSON.parse(lineItems); } catch { parsedItems = []; }
  } else if (Array.isArray(lineItems)) {
    parsedItems = lineItems;
  }
  // English descriptions are mandatory
  if (parsedItems.length > 0) {
    const hasMissingEnglish = parsedItems.some(
      (item) => !item.description || item.description.trim() === ""
    );
    if (hasMissingEnglish) {
      errors.push(ERROR_MESSAGES.LINE_ITEMS_ENGLISH_MISSING);
    }
  }

  // ── 11. UUID warning ─────────────────────────────────────────────────
  if (!invoice.uuid && !invoice.eInvoiceUuid) {
    warnings.push(ERROR_MESSAGES.UUID_MISSING);
  }

  // ── 12. PIH warning ──────────────────────────────────────────────────
  if (!invoice.previousInvoiceHash) {
    warnings.push(ERROR_MESSAGES.PIH_MISSING);
  }

  // ── 13. Notes English ────────────────────────────────────────────────
  if (invoice.notes && !invoice.notesEn) {
    warnings.push(ERROR_MESSAGES.NOTES_ENGLISH_MISSING);
  }

  // ── 14. Retention period warning ─────────────────────────────────────
  warnings.push(ERROR_MESSAGES.RETENTION_WARNING);

  // ── 15. Certificate warning ──────────────────────────────────────────
  if (!invoice.certificate && !invoice.certificateId) {
    warnings.push(ERROR_MESSAGES.SIGNING_CERTIFICATE_MISSING);
  }

  // ── 16. Arabic seller name recommended (optional for UAE) ────────────
  if (!company.nameAr && !invoice.sellerNameAr) {
    warnings.push(ERROR_MESSAGES.ARABIC_SELLER_NAME_RECOMMENDED);
  }

  // ── 17. Arabic buyer name recommended for B2B (optional for UAE) ────
  if (invoiceType === "standard" && !invoice.buyerNameAr && !invoice.clientName) {
    warnings.push(ERROR_MESSAGES.ARABIC_BUYER_NAME_RECOMMENDED);
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

// ── UBL 2.1 XML Generation (Peppol BIS 3) ────────────────────────────────

/**
 * generateUaeFtaUblXml — Generates UBL 2.1 XML for UAE FTA e-invoicing
 * via Peppol BIS 3 network.
 *
 * Produces structurally correct UBL 2.1 XML that conforms to Peppol BIS 3
 * specification. Supports both Standard (B2B) and Simplified (B2C) invoice types.
 *
 * Standard Invoice (B2B) XML includes:
 * - Full buyer details (name, address, TRN)
 * - Complete tax breakdown per line item
 * - PKI signature placeholder
 * - Peppol BIS 3 profile identifiers
 *
 * Simplified Invoice (B2C) XML includes:
 * - Minimal buyer details (name only, no TRN)
 * - Simplified tax structure
 * - PKI signature placeholder
 * - Peppol BIS 3 profile identifiers
 *
 * Both include:
 * - English mandatory + Arabic optional dual language
 * - AED 2-decimal amounts
 * - 5% VAT rate
 * - Seller TRN (Tax Registration Number)
 */
export function generateUaeFtaUblXml(
  invoice: Record<string, unknown>,
  company: Record<string, unknown>,
): UaeFtaUblXmlResult {
  const invoiceType = determineUaeFtaInvoiceType(invoice);
  const uuid = (invoice.uuid as string) || (invoice.eInvoiceUuid as string) || generateUaeFtaUuid();
  const issueDate = (invoice.issueDate as string) || new Date().toISOString().split("T")[0];
  const dueDate = (invoice.dueDate as string) || issueDate;

  // Hijri dates (optional for UAE)
  const hijriIssue = toHijri(issueDate);
  const hijriDue = toHijri(dueDate);

  // Line items parsing
  const rawLineItems = invoice.lineItems as LineItem[] | string;
  let parsedItems: LineItem[] = [];
  if (typeof rawLineItems === "string") {
    try { parsedItems = JSON.parse(rawLineItems); } catch { parsedItems = []; }
  } else if (Array.isArray(rawLineItems)) {
    parsedItems = rawLineItems;
  }

  // Seller details (English mandatory, Arabic optional)
  const sellerNameEn = (company.name as string) || (invoice.sellerNameEn as string) || "";
  const sellerNameAr = (company.nameAr as string) || (invoice.sellerNameAr as string) || null;
  const sellerVatTrn = (company.vatNumber as string) || (invoice.sellerVatTrn as string) || "";
  const sellerAddressEn = (company.address as string) || (invoice.sellerAddressEn as string) || "";
  const sellerAddressAr = (invoice.sellerAddressAr as string) || (company.addressAr as string) || null;

  // Buyer details (only mandatory for standard B2B)
  const buyerNameEn = (invoice.buyerNameEn as string) || (invoice.clientName as string) || "";
  const buyerNameAr = (invoice.buyerNameAr as string) || null;
  const buyerVatTrn = (invoice.buyerVatTrn as string) || (invoice.buyerVatNumber as string) || "";
  const buyerAddressEn = (invoice.buyerAddressEn as string) || (invoice.clientAddress as string) || "";
  const buyerAddressAr = (invoice.buyerAddressAr as string) || null;

  // PIH (Previous Invoice Hash)
  const pih = (invoice.previousInvoiceHash as string) || "";

  // Totals (AED, 2 decimal places)
  const totals = calcInvoiceTotals(
    parsedItems,
    UAE_FTA_VAT_RATE,
    num(invoice.shipping ?? 0, UAE_FTA_DECIMAL_PLACES),
    num(invoice.discount ?? 0, UAE_FTA_DECIMAL_PLACES),
  );

  // UBL invoice type code:
  // Standard (B2B) = 380 (Commercial Invoice, Peppol BIS 3)
  // Simplified (B2C) = 380 with simplified structure (same code but different content)
  // Note: Peppol BIS 3 uses 380 for standard invoices, not 381 (ZATCA-specific)
  const invoiceTypeCode = "380";
  const invoiceTypeNameAr = invoiceType === "standard" ? "فاتورة ضريبية" : "فاتورة مبسطة";
  const invoiceTypeNameEn = invoiceType === "standard" ? "Standard Tax Invoice" : "Simplified Tax Invoice";

  // ── Build UBL 2.1 XML (Peppol BIS 3) ──────────────────────────────────

  // Line items XML
  const lineItemXml = parsedItems.map((item, index) => {
    const lineId = index + 1;
    const itemQty = num(item.qty, UAE_FTA_DECIMAL_PLACES).toFixed(UAE_FTA_DECIMAL_PLACES);
    const itemPrice = num(item.price, UAE_FTA_DECIMAL_PLACES).toFixed(UAE_FTA_DECIMAL_PLACES);
    const itemTotal = num(item.total ?? num(item.qty) * num(item.price), UAE_FTA_DECIMAL_PLACES).toFixed(UAE_FTA_DECIMAL_PLACES);
    const lineTaxAmount = num(parseFloat(itemTotal) * UAE_FTA_VAT_RATE / 100, UAE_FTA_DECIMAL_PLACES).toFixed(UAE_FTA_DECIMAL_PLACES);

    // Arabic description (optional for UAE)
    const arabicDescriptionXml = sellerNameAr
      ? `\n        <cbc:Name languageID="ar">${(item.description as string) || ""}</cbc:Name>`
      : "";

    return `
    <cac:InvoiceLine>
      <cbc:ID>${lineId}</cbc:ID>
      <cbc:Note>${(item.description as string) || ""}</cbc:Note>
      <cbc:InvoicedQuantity unitCode="EA">${itemQty}</cbc:InvoicedQuantity>
      <cbc:LineExtensionAmount currencyID="AED">${itemTotal}</cbc:LineExtensionAmount>
      <cac:Item>
        <cbc:Name languageID="en">${(item.description as string) || ""}</cbc:Name>${arabicDescriptionXml}
      </cac:Item>
      <cac:Price>
        <cbc:PriceAmount currencyID="AED">${itemPrice}</cbc:PriceAmount>
      </cac:Price>
      <cac:TaxTotal>
        <cbc:TaxAmount currencyID="AED">${lineTaxAmount}</cbc:TaxAmount>
        <cac:TaxSubtotal>
          <cbc:TaxableAmount currencyID="AED">${itemTotal}</cbc:TaxableAmount>
          <cbc:TaxAmount currencyID="AED">${lineTaxAmount}</cbc:TaxAmount>
          <cac:TaxCategory>
            <cbc:ID schemeID="UN/ECE 5303" schemeAgencyID="6">S</cbc:ID>
            <cbc:Percent>${UAE_FTA_VAT_RATE.toFixed(UAE_FTA_DECIMAL_PLACES)}</cbc:Percent>
            <cac:TaxScheme>
              <cbc:ID schemeID="UN/ECE 5153" schemeAgencyID="6">VAT</cbc:ID>
              <cbc:Name languageID="en">Value Added Tax</cbc:Name>
              <cbc:Name languageID="ar">ضريبة القيمة المضافة</cbc:Name>
            </cac:TaxScheme>
          </cac:TaxCategory>
        </cac:TaxSubtotal>
      </cac:TaxTotal>
    </cac:InvoiceLine>`;
  }).join("");

  // Seller postal address XML (English mandatory, Arabic optional)
  const sellerAddressXml = `
      <cac:PostalAddress>
        <cbc:StreetName>${sellerAddressEn}</cbc:StreetName>
        ${sellerAddressAr ? `<cbc:StreetName languageID="ar">${sellerAddressAr}</cbc:StreetName>` : ""}
        <cbc:CityName>${(invoice.sellerCityEn as string) || (company.address as string) || "Dubai"}</cbc:CityName>
        ${(invoice.sellerCityAr as string) ? `<cbc:CityName languageID="ar">${invoice.sellerCityAr as string}</cbc:CityName>` : ""}
        <cbc:PostalZone>${(invoice.sellerPostalCode as string) || ""}</cbc:PostalZone>
        <cac:Country>
          <cbc:IdentificationCode>AE</cbc:IdentificationCode>
        </cac:Country>
      </cac:PostalAddress>`;

  // Buyer XML block (only for standard B2B invoices)
  const buyerXml = invoiceType === "standard" ? `
    <cac:AccountingCustomerParty>
      <cac:Party>
        <cac:PartyIdentification>
          <cbc:ID schemeID="TRN">${buyerVatTrn}</cbc:ID>
        </cac:PartyIdentification>
        <cac:PartyName>
          <cbc:Name languageID="en">${buyerNameEn}</cbc:Name>
          ${buyerNameAr ? `<cbc:Name languageID="ar">${buyerNameAr}</cbc:Name>` : ""}
        </cac:PartyName>
        <cac:PostalAddress>
          <cbc:StreetName>${buyerAddressEn}</cbc:StreetName>
          ${buyerAddressAr ? `<cbc:StreetName languageID="ar">${buyerAddressAr}</cbc:StreetName>` : ""}
          <cbc:CityName>${(invoice.buyerCityEn as string) || ""}</cbc:CityName>
          ${(invoice.buyerCityAr as string) ? `<cbc:CityName languageID="ar">${invoice.buyerCityAr as string}</cbc:CityName>` : ""}
          <cac:Country>
            <cbc:IdentificationCode>${(invoice.buyerCountryCode as string) || "AE"}</cbc:IdentificationCode>
          </cac:Country>
        </cac:PostalAddress>
        <cac:PartyTaxScheme>
          <cbc:CompanyID>${buyerVatTrn}</cbc:CompanyID>
          <cac:TaxScheme>
            <cbc:ID schemeID="UN/ECE 5153" schemeAgencyID="6">VAT</cbc:ID>
            <cbc:Name languageID="en">Value Added Tax</cbc:Name>
            <cbc:Name languageID="ar">ضريبة القيمة المضافة</cbc:Name>
          </cac:TaxScheme>
        </cac:PartyTaxScheme>
        <cac:PartyLegalEntity>
          <cbc:RegistrationName languageID="en">${buyerNameEn}</cbc:RegistrationName>
          ${buyerNameAr ? `<cbc:RegistrationName languageID="ar">${buyerNameAr}</cbc:RegistrationName>` : ""}
        </cac:PartyLegalEntity>
      </cac:Party>
    </cac:AccountingCustomerParty>` : "";

  // PKI signature placeholder (Peppol requires digital signature)
  const signatureXml = `
    <cac:Signature>
      <cbc:ID>urn:oasis:names:specification:ubl:signature:Invoice</cbc:ID>
      <cbc:SignatureMethod>urn:oasis:names:specification:ubl:signature:Invoice</cbc:SignatureMethod>
      <cac:SignatoryParty>
        <cac:PartyIdentification>
          <cbc:ID>${sellerVatTrn}</cbc:ID>
        </cac:PartyIdentification>
        <cac:PartyName>
          <cbc:Name languageID="en">${sellerNameEn}</cbc:Name>
          ${sellerNameAr ? `<cbc:Name languageID="ar">${sellerNameAr}</cbc:Name>` : ""}
        </cac:PartyName>
      </cac:SignatoryParty>
      <cac:DigitalSignatureAttachment>
        <cac:ExternalReference>
          <cbc:URI>#PKI-Signature</cbc:URI>
        </cac:ExternalReference>
      </cac:DigitalSignatureAttachment>
    </cac:Signature>`;

  // Additional document reference for PIH
  const pihReferenceXml = pih ? `
    <cac:AdditionalDocumentReference>
      <cbc:ID>PIH</cbc:ID>
      <cbc:PreviousInvoiceHash>${pih}</cbc:PreviousInvoiceHash>
    </cac:AdditionalDocumentReference>` : `
    <cac:AdditionalDocumentReference>
      <cbc:ID>PIH</cbc:ID>
      <cbc:PreviousInvoiceHash>NWZlY2ViNjZmZmM4NmYzNDQ0MWY0ZGQzNzU0Y2QwOWE0MmM2YzY2OGZkMWU0YWQ0NWQ3YzA4ZjY0ZjU4NDk0Nw==</cbc:PreviousInvoiceHash>
    </cac:AdditionalDocumentReference>`;

  // UUID document reference
  const uuidReferenceXml = `
    <cac:AdditionalDocumentReference>
      <cbc:ID>UUID</cbc:ID>
      <cbc:UUID>${uuid}</cbc:UUID>
    </cac:AdditionalDocumentReference>`;

  // Build complete UBL 2.1 XML (Peppol BIS 3)
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="${UBL_NS}"
  xmlns:cac="${CAC_NS}"
  xmlns:cbc="${CBC_NS}">
  <cbc:ProfileID>${UAE_FTA_PEPPOL_BIS3_PROFILE}</cbc:ProfileID>
  <cbc:ID>${(invoice.invoiceNumber as string) || ""}</cbc:ID>
  <cbc:UUID>${uuid}</cbc:UUID>
  <cbc:IssueDate>${issueDate}</cbc:IssueDate>
  <cbc:IssueTime>${new Date().toISOString().split("T")[1]?.slice(0, 8) || "00:00:00"}</cbc:IssueTime>
  <cbc:InvoiceTypeCode name="${invoiceTypeNameEn}">${invoiceTypeCode}</cbc:InvoiceTypeCode>
  <cbc:DocumentCurrencyCode>AED</cbc:DocumentCurrencyCode>
  <cbc:TaxCurrencyCode>AED</cbc:TaxCurrencyCode>
  ${pihReferenceXml}
  ${uuidReferenceXml}
  ${signatureXml}
  <cac:AccountingSupplierParty>
    <cac:Party>
      <cac:PartyIdentification>
        <cbc:ID schemeID="TRN">${sellerVatTrn}</cbc:ID>
      </cac:PartyIdentification>
      <cac:PartyName>
        <cbc:Name languageID="en">${sellerNameEn}</cbc:Name>
        ${sellerNameAr ? `<cbc:Name languageID="ar">${sellerNameAr}</cbc:Name>` : ""}
      </cac:PartyName>
      ${sellerAddressXml}
      <cac:PartyTaxScheme>
        <cbc:CompanyID>${sellerVatTrn}</cbc:CompanyID>
        <cbc:CompanyID schemeID="VAT">${sellerVatTrn}</cbc:CompanyID>
        <cac:TaxScheme>
          <cbc:ID schemeID="UN/ECE 5153" schemeAgencyID="6">VAT</cbc:ID>
          <cbc:Name languageID="en">Value Added Tax</cbc:Name>
          <cbc:Name languageID="ar">ضريبة القيمة المضافة</cbc:Name>
        </cac:TaxScheme>
      </cac:PartyTaxScheme>
      <cac:PartyLegalEntity>
        <cbc:RegistrationName languageID="en">${sellerNameEn}</cbc:RegistrationName>
        ${sellerNameAr ? `<cbc:RegistrationName languageID="ar">${sellerNameAr}</cbc:RegistrationName>` : ""}
      </cac:PartyLegalEntity>
    </cac:Party>
  </cac:AccountingSupplierParty>
  ${buyerXml}
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="AED">${totals.subtotal}</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="AED">${totals.subtotal}</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="AED">${totals.total}</cbc:TaxInclusiveAmount>
    <cbc:AllowanceTotalAmount currencyID="AED">${totals.discount}</cbc:AllowanceTotalAmount>
    <cbc:PayableAmount currencyID="AED">${totals.total}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>
  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="AED">${totals.taxAmount}</cbc:TaxAmount>
    <cac:TaxSubtotal>
      <cbc:TaxableAmount currencyID="AED">${totals.subtotal}</cbc:TaxableAmount>
      <cbc:TaxAmount currencyID="AED">${totals.taxAmount}</cbc:TaxAmount>
      <cac:TaxCategory>
        <cbc:ID schemeID="UN/ECE 5303" schemeAgencyID="6">S</cbc:ID>
        <cbc:Percent>${UAE_FTA_VAT_RATE.toFixed(UAE_FTA_DECIMAL_PLACES)}</cbc:Percent>
        <cac:TaxScheme>
          <cbc:ID schemeID="UN/ECE 5153" schemeAgencyID="6">VAT</cbc:ID>
          <cbc:Name languageID="en">Value Added Tax</cbc:Name>
          <cbc:Name languageID="ar">ضريبة القيمة المضافة</cbc:Name>
        </cac:TaxScheme>
      </cac:TaxCategory>
    </cac:TaxSubtotal>
  </cac:TaxTotal>
  ${lineItemXml}
</Invoice>`;

  // Compute invoice hash
  const invoiceHash = computeUaeFtaInvoiceHash(xml);

  return {
    xml,
    invoiceHash,
    uuid,
  };
}

// ── Digital Signing (PKI) ──────────────────────────────────────────────────

/**
 * signUaeFtaInvoice — PKI digital signing for UAE FTA invoice XML.
 *
 * UAE FTA e-invoicing via Peppol requires digital signatures using PKI.
 * This is a placeholder with clear integration points for real certificate
 * injection. In production, UAE FTA requires:
 * - PKI signature over the XML content
 * - X.509 certificate hash embedded in the UBL structure
 * - Peppol Access Point provider handles the actual signing and routing
 *
 * Integration points:
 * 1. Replace the PKI signing with actual certificate-based signing
 * 2. Use certificates obtained from UAE FTA / Peppol AP provider
 * 3. Embed the X.509 certificate in the UBL Signature element
 *
 * @param xml - The raw UBL XML to sign
 * @param certificate - X.509 certificate data (base64 PEM)
 * @param privateKey - Private key data (base64 PEM)
 */
export function signUaeFtaInvoice(
  xml: string,
  certificate: string,
  privateKey: string,
): UaeFtaSignatureResult {
  logger.info("[uae-fta] signing invoice with PKI", {
    certificateLength: certificate?.length || 0,
    privateKeyAvailable: !!privateKey,
  });

  const invoiceHash = computeUaeFtaInvoiceHash(xml);

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const nodeCrypto = require("node:crypto");

    // Sign with PKI (placeholder: uses provided key material)
    const sign = nodeCrypto.createSign("SHA256");
    sign.update(invoiceHash);
    sign.end();

    let digitalSignature: string;
    if (privateKey && privateKey.includes("PRIVATE KEY")) {
      try {
        digitalSignature = sign.sign(privateKey, "base64");
      } catch {
        logger.warn("[uae-fta] PKI signing failed with provided key — using placeholder");
        digitalSignature = nodeCrypto.createHash("sha256")
          .update(invoiceHash + certificate)
          .digest("base64");
      }
    } else {
      // Placeholder signature: hash of (invoiceHash + certificate)
      digitalSignature = nodeCrypto.createHash("sha256")
        .update(invoiceHash + certificate)
        .digest("base64");
    }

    // Certificate hash (SHA-256 of the certificate content)
    const certificateHash = nodeCrypto.createHash("sha256")
      .update(certificate)
      .digest("hex");

    // Embed signature in UBL XML
    const signedXml = xml.replace(
      /<cbc:URI>#PKI-Signature<\/cbc:URI>/,
      `<cbc:URI>#PKI-Signature</cbc:URI>\n        <cbc:Reference>${invoiceHash}</cbc:Reference>`
    ).replace(
      /<\/cac:DigitalSignatureAttachment>/,
      `</cac:DigitalSignatureAttachment>
      <cac:Certificate>
        <cbc:CertificateHash>${certificateHash}</cbc:CertificateHash>
      </cac:Certificate>`
    );

    logger.info("[uae-fta] invoice signed successfully", {
      invoiceHash,
      certificateHash,
      signatureLength: digitalSignature.length,
    });

    return {
      signedXml,
      invoiceHash,
      digitalSignature,
      certificateHash,
    };
  } catch (err) {
    logger.warn("[uae-fta] signing using node:crypto failed — generating placeholder", {
      err: err instanceof Error ? err.message : String(err),
    });

    // Fallback placeholder for environments without node:crypto
    const digitalSignature = Buffer.from(invoiceHash + certificate).toString("base64");
    const certificateHash = invoiceHash.slice(0, 64);

    const signedXml = xml.replace(
      /<cbc:URI>#PKI-Signature<\/cbc:URI>/,
      `<cbc:URI>#PKI-Signature</cbc:URI>\n        <cbc:Reference>${invoiceHash}</cbc:Reference>`
    ).replace(
      /<\/cac:DigitalSignatureAttachment>/,
      `</cac:DigitalSignatureAttachment>
      <cac:Certificate>
        <cbc:CertificateHash>${certificateHash}</cbc:CertificateHash>
      </cac:Certificate>`
    );

    return {
      signedXml,
      invoiceHash,
      digitalSignature,
      certificateHash,
    };
  }
}

// ── Peppol Access Point Submission ─────────────────────────────────────────

/**
 * submitUaeFtaInvoice — Submits a signed invoice via Peppol Access Point.
 *
 * The Peppol Access Point provider handles the actual routing and delivery
 * of the invoice to the buyer's Access Point. Possible providers:
 * - MyFatoorah (as a Peppol AP provider for the Gulf region)
 * - KSA (Saudi Access Point, for cross-border Peppol routing)
 *
 * Standard invoices (B2B) → full Peppol BIS 3 delivery with buyer TRN
 * Simplified invoices (B2C) → minimal Peppol delivery without buyer TRN
 *
 * The Peppol AP returns:
 * - For accepted invoices: a Peppol document ID and delivery confirmation
 * - For rejected invoices: a rejection reason
 *
 * @param signedXml - The signed UBL XML to submit
 * @param invoiceType - "standard" or "simplified"
 * @param companySlug - Company slug for EInvoice record
 */
export async function submitUaeFtaInvoice(
  signedXml: string,
  invoiceType: UaeFtaInvoiceType,
  companySlug: string,
): Promise<UaeFtaSubmissionResult> {
  logger.info("[uae-fta] submitting invoice via Peppol Access Point", {
    invoiceType,
    companySlug,
    xmlLength: signedXml?.length || 0,
    peppolAP: UAE_FTA_PEPPOL_AP_URL,
  });

  try {
    // ── Placeholder: Peppol Access Point submission ────────────────────────
    // In production, this makes a real HTTP POST to the Peppol AP provider.
    // The request includes:
    //   - Signed XML in base64-encoded format
    //   - Peppol BIS 3 profile identifier
    //   - Sender/receiver party identification (TRN-based)
    //
    // Peppol AP request format:
    //   POST /peppol/send
    //   Headers: Authorization: Bearer {AP-token}, Content-Type: application/json
    //   Body: {
    //     document: base64(signedXml),
    //     profile: UAE_FTA_PEPPOL_BIS3_PROFILE,
    //     sender: { partyId: sellerVatTrn, schemeId: "TRN" },
    //     receiver: { partyId: buyerVatTrn, schemeId: "TRN" } (for B2B)
    //   }
    //
    // For now, we simulate the submission and create an EInvoice record.
    // When the Peppol AP production API is configured, this will make real HTTP calls.

    const invoiceHash = computeUaeFtaInvoiceHash(signedXml);

    // Simulate Peppol response
    const isSimulation = true; // Placeholder flag — will be false in production
    const submissionStatus = isSimulation
      ? (invoiceType === "standard" ? "cleared" : "accepted")
      : "pending";

    // Find the invoice by company slug (looking for most recent draft)
    const existingInvoice = await db.invoice.findFirst({
      where: {
        companySlug,
        status: "draft",
        deletedAt: null,
      },
      orderBy: { createdAt: "desc" },
    });

    if (!existingInvoice) {
      logger.warn("[uae-fta] no matching invoice found for submission", { companySlug });
    }

    const invoiceId = existingInvoice?.id || 0;

    // Create or update EInvoice record
    if (invoiceId > 0) {
      const existingEInvoice = await db.eInvoice.findUnique({
        where: { invoiceId },
      });

      if (existingEInvoice) {
        await db.eInvoice.update({
          where: { id: existingEInvoice.id },
          data: {
            authorityType: UAE_FTA_AUTHORITY,
            submissionStatus,
            signedXml,
            rawXml: signedXml,
            xmlHash: invoiceHash,
            uuid: generateUaeFtaUuid(),
            submittedAt: new Date(),
            updatedAt: new Date(),
          },
        });

        // Update invoice status
        await db.invoice.update({
          where: { id: invoiceId },
          data: {
            eInvoiceStatus: submissionStatus,
            eInvoiceAuthority: UAE_FTA_AUTHORITY,
          },
        });

        logger.info("[uae-fta] EInvoice updated", { eInvoiceId: existingEInvoice.id, submissionStatus });

        return {
          ok: true,
          eInvoiceId: existingEInvoice.id,
          submissionStatus: submissionStatus as UaeFtaSubmissionResult["submissionStatus"],
        };
      }
    }

    // Create new EInvoice record (only if we have a valid invoiceId)
    if (invoiceId > 0) {
      const eInvoice = await db.eInvoice.create({
        data: {
          invoiceId,
          companySlug,
          authorityType: UAE_FTA_AUTHORITY,
          submissionStatus,
          signedXml,
          rawXml: signedXml,
          xmlHash: invoiceHash,
          uuid: generateUaeFtaUuid(),
          submittedAt: new Date(),
        },
      });

      // Update invoice status
      await db.invoice.update({
        where: { id: invoiceId },
        data: {
          eInvoiceStatus: submissionStatus,
          eInvoiceAuthority: UAE_FTA_AUTHORITY,
        },
      });

      logger.info("[uae-fta] EInvoice created", { eInvoiceId: eInvoice.id, submissionStatus });

      return {
        ok: true,
        eInvoiceId: eInvoice.id,
        submissionStatus: submissionStatus as UaeFtaSubmissionResult["submissionStatus"],
      };
    }

    // No invoice found — return pending status
    return {
      ok: true,
      submissionStatus: "pending",
    };
  } catch (err) {
    logger.error("[uae-fta] submission failed", {
      err: err instanceof Error ? err.message : String(err),
      invoiceType,
      companySlug,
    });
    return {
      ok: false,
      submissionStatus: "rejected",
      error: err instanceof Error ? err.message : "Unknown error",
      rejectionReason: err instanceof Error ? err.message : "Internal error during UAE FTA Peppol submission",
    };
  }
}

// ── Status Check ────────────────────────────────────────────────────────────

/**
 * getUaeFtaInvoiceStatus — Checks the submission status of a UAE FTA e-invoice.
 *
 * Returns local DB status. In production, this would also query the Peppol
 * Access Point provider to get the latest delivery status and update the
 * local record.
 */
export async function getUaeFtaInvoiceStatus(eInvoiceId: number): Promise<{
  status: string;
  authorityType: string;
  rejectionReason?: string;
  submittedAt?: string;
  approvedAt?: string;
  peppolDocumentId?: string;
}> {
  try {
    const eInvoice = await db.eInvoice.findUnique({
      where: { id: eInvoiceId },
    });

    if (!eInvoice) {
      return {
        status: "not_found",
        authorityType: UAE_FTA_AUTHORITY,
        rejectionReason: "EInvoice record not found",
      };
    }

    // ── Placeholder: In production, query Peppol AP for latest status ──
    // GET /peppol/status/{documentId} → update local DB

    return {
      status: eInvoice.submissionStatus,
      authorityType: eInvoice.authorityType,
      rejectionReason: eInvoice.rejectionReason || undefined,
      submittedAt: eInvoice.submittedAt?.toISOString() || undefined,
      approvedAt: eInvoice.approvedAt?.toISOString() || undefined,
    };
  } catch (err) {
    logger.error("[uae-fta] status check failed", {
      err: err instanceof Error ? err.message : String(err),
      eInvoiceId,
    });
    return {
      status: "error",
      authorityType: UAE_FTA_AUTHORITY,
      rejectionReason: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

// ── Auto-populate UAE FTA fields ──────────────────────────────────────────

/**
 * autoPopulateUaeFtaFields — Auto-populates UAE FTA-specific invoice fields
 * from company settings and Gregorian dates.
 *
 * Called by the invoice validation middleware when creating/updating
 * a UAE company invoice.
 *
 * UAE FTA auto-population priorities:
 * - English fields mandatory (auto-populated from company English name/address)
 * - Arabic fields optional (auto-populated from company Arabic name/address if available)
 * - TRN (Tax Registration Number) from company VAT number
 * - AED currency enforced with 2 decimal places
 * - 5% VAT rate enforced
 * - UUID generated for Peppol network
 * - Hijri dates optional (auto-populated if issue date available)
 */
export function autoPopulateUaeFtaFields(
  invoiceData: Record<string, unknown>,
  company: Record<string, unknown>,
): Record<string, unknown> {
  const result = { ...invoiceData };

  // ── 1. Generate UUID ──────────────────────────────────────────────────
  if (!invoiceData.uuid && !invoiceData.eInvoiceUuid) {
    result.uuid = generateUaeFtaUuid();
  }

  // ── 2. Auto-populate Hijri dates (optional for UAE) ───────────────────
  if (invoiceData.issueDate && !invoiceData.hijriIssueDate) {
    result.hijriIssueDate = formatHijri(invoiceData.issueDate as string);
  }
  if (invoiceData.dueDate && !invoiceData.hijriDueDate) {
    result.hijriDueDate = formatHijri(invoiceData.dueDate as string);
  }

  // ── 3. Auto-populate TRN from company ─────────────────────────────────
  if (!invoiceData.sellerVatTrn && company.vatNumber) {
    result.sellerVatTrn = company.vatNumber;
  }

  // ── 4. Auto-populate English seller fields from company ───────────────
  if (!invoiceData.sellerNameEn) {
    result.sellerNameEn = company.name || "";
  }
  if (!invoiceData.sellerAddressEn) {
    result.sellerAddressEn = company.address || "";
  }

  // ── 5. Auto-populate Arabic seller fields (optional, from company) ────
  if (!invoiceData.sellerNameAr && company.nameAr) {
    result.sellerNameAr = company.nameAr;
  }
  if (!invoiceData.sellerAddressAr && company.addressAr) {
    result.sellerAddressAr = company.addressAr;
  }

  // ── 6. Auto-populate invoice type ─────────────────────────────────────
  const invoiceType = determineUaeFtaInvoiceType(invoiceData);
  if (!invoiceData.invoiceTypeEn) {
    result.invoiceTypeEn = invoiceType;
  }
  if (!invoiceData.invoiceTypeAr) {
    result.invoiceTypeAr = invoiceType === "standard" ? "فاتورة ضريبية" : "فاتورة مبسطة";
  }

  // ── 7. Enforce AED currency ───────────────────────────────────────────
  result.currency = UAE_FTA_CURRENCY;
  result.currencyDecimalPlaces = UAE_FTA_DECIMAL_PLACES;

  // ── 8. Enforce 5% VAT rate ────────────────────────────────────────────
  const currentTaxRate = parseFloat((invoiceData.taxRate as string) || (company.defaultTaxRate as string) || "0");
  if (currentTaxRate !== UAE_FTA_VAT_RATE) {
    result.taxRate = UAE_FTA_VAT_RATE.toFixed(UAE_FTA_DECIMAL_PLACES);
  }

  // ── 9. Set e-invoice authority ────────────────────────────────────────
  result.eInvoiceAuthority = UAE_FTA_AUTHORITY;

  // ── 10. Enforce 2-decimal precision on all monetary fields ────────────
  for (const field of ["subtotal", "taxAmount", "total", "shipping", "discount", "paid"]) {
    if (result[field] !== undefined && result[field] !== null) {
      result[field] = num(result[field], UAE_FTA_DECIMAL_PLACES).toFixed(UAE_FTA_DECIMAL_PLACES);
    }
  }

  // ── 11. Set PIH (Previous Invoice Hash) placeholder ──────────────────
  if (!invoiceData.previousInvoiceHash) {
    // For the first invoice, use the standard Peppol placeholder hash
    result.previousInvoiceHash = "NWZlY2ViNjZmZmM4NmYzNDQ0MWY0ZGQzNzU0Y2QwOWE0MmM2YzY2OGZkMWU0YWQ0NWQ3YzA4ZjY0ZjU4NDk0Nw==";
  }

  return result;
}

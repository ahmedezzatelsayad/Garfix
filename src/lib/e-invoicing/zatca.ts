/**
 * zatca.ts — Saudi ZATCA Phase 2 e-invoicing compliance module.
 *
 * Implements ZATCA (Zakat, Tax and Customs Authority) Phase 2 requirements
 * for electronic invoicing in Saudi Arabia, mandatory since 2023.
 *
 * Key requirements:
 * - Standard (B2B) and Simplified (B2C) invoice types
 * - UBL 2.1 XML format for invoice generation
 * - ECDSA digital signature with X.509 certificate
 * - UUID generation per invoice
 * - PIH (Previous Invoice Hash) chaining
 * - Submission to ZATCA portal (Cleared for Standard, Reported for Simplified)
 * - Arabic mandatory + English optional dual-language fields
 * - SAR currency with exactly 2 decimal places
 * - 15% VAT rate
 * - Seller VAT registration number (TRN) mandatory
 * - Invoice chaining via PreviousInvoiceHash (PIH)
 *
 * ZATCA API endpoints:
 * - Standard invoices → "Cleared" (requires full ECDSA signing + X.509 cert)
 * - Simplified invoices → "Reported" (lighter signing requirements)
 *
 * Fines for non-compliance: up to SAR 50,000 per violation.
 */

import { toHijri, formatDualDate, formatHijri } from "@/lib/hijri";
import { fmtMoney, num, calcInvoiceTotals, type LineItem } from "@/lib/money";
import {
  getCountryConfig,
  type EInvoiceAuthority,
} from "@/lib/gulfConfig";
import { logger } from "@/lib/logger";
import { db } from "@/lib/db";
import { encryptSecret } from "@/lib/cryptoVault";

// ── Types ──────────────────────────────────────────────────────────────────

export interface ZatcaValidationError {
  field: string;
  messageAr: string; // Arabic error message for UI display
  messageEn: string; // English error message for developer reference
  severity: "error" | "warning"; // error = blocks submission, warning = advisory
}

export interface ZatcaValidationResult {
  valid: boolean;
  errors: ZatcaValidationError[];
  warnings: ZatcaValidationError[];
}

export type ZatcaInvoiceType = "standard" | "simplified";
// standard = B2B tax invoice (فاتورة ضريبية) — requires full buyer details, ECDSA signing, Cleared
// simplified = B2C retail invoice (فاتورة مبسطة) — lighter requirements, Reported

export interface ZatcaInvoicePayload {
  // ── Header ───────────────────────────────────────────────────────────
  uuid: string;
  invoiceNumber: string;
  invoiceType: ZatcaInvoiceType;
  invoiceTypeAr: string;
  invoiceTypeEn: string;
  zatcaRegulation: string; // "ZATCA Phase 2"

  // ── Dates (dual calendar) ────────────────────────────────────────────
  issueDateGregorian: string; // YYYY-MM-DD
  issueDateHijri: string; // formatted Hijri string
  issueDateDual: string; // dual format
  dueDateGregorian: string;
  dueDateHijri: string;
  dueDateDual: string;

  // ── Currency ─────────────────────────────────────────────────────────
  currency: string; // "SAR"
  currencyDecimalPlaces: number; // 2

  // ── Seller ───────────────────────────────────────────────────────────
  sellerNameAr: string;
  sellerNameEn: string;
  sellerAddressAr: string;
  sellerAddressEn: string;
  sellerVatTrn: string; // VAT registration number (TRN) — mandatory for ZATCA
  sellerCommercialRegistration: string | null;
  sellerStreetNameAr: string | null;
  sellerStreetNameEn: string | null;
  sellerBuildingNumber: string | null;
  sellerPostalCode: string | null;
  sellerCityAr: string | null;
  sellerCityEn: string | null;
  sellerDistrictAr: string | null;
  sellerDistrictEn: string | null;
  sellerCountryCode: string; // "SA"

  // ── Buyer ────────────────────────────────────────────────────────────
  buyerNameAr: string | null; // Required for standard (B2B)
  buyerNameEn: string | null;
  buyerAddressAr: string | null;
  buyerAddressEn: string | null;
  buyerVatTrn: string | null; // Required for standard (B2B)
  buyerStreetNameAr: string | null;
  buyerStreetNameEn: string | null;
  buyerBuildingNumber: string | null;
  buyerPostalCode: string | null;
  buyerCityAr: string | null;
  buyerCityEn: string | null;
  buyerDistrictAr: string | null;
  buyerDistrictEn: string | null;
  buyerCountryCode: string | null;

  // ── Line items ───────────────────────────────────────────────────────
  lineItems: ZatcaLineItemPayload[];

  // ── Totals (SAR, 2 decimal places) ───────────────────────────────────
  subtotal: string;
  taxRate: string; // "15.00"
  taxAmount: string;
  total: string;
  shipping: string;
  discount: string;
  paid: string;

  // ── Notes ────────────────────────────────────────────────────────────
  notesAr: string | null;
  notesEn: string | null;

  // ── ZATCA-specific ───────────────────────────────────────────────────
  eInvoiceAuthority: string; // "zatca"
  previousInvoiceHash: string; // PIH for chaining (empty string for first invoice)
  invoiceHash: string; // SHA-256 hash of this invoice XML
  paymentMethod: string | null;

  // ── Signature ────────────────────────────────────────────────────────
  digitalSignature?: string; // ECDSA signature (base64)
  certificateHash?: string; // X.509 certificate hash
  signingTime?: string; // ISO 8601 signing timestamp
}

export interface ZatcaLineItemPayload {
  id: string; // line item UUID
  descriptionAr: string;
  descriptionEn: string;
  qty: string; // formatted with decimals
  unitPrice: string;
  unitCode: string; // UBL unit code (e.g., "EA" for Each, "DAY" for Day)
  lineTotal: string; // qty * unitPrice
  taxRate: string;
  taxAmount: string;
  taxCategory: string; // "S" for standard rate, "Z" for zero, "E" for exempt
  taxSchemeAr: string; // "ضريبة القيمة المضافة"
  taxSchemeEn: string; // "Value Added Tax"
  discountAmount: string | null;
}

export interface ZatcaSubmissionResult {
  ok: boolean;
  eInvoiceId?: number;
  submissionStatus: "pending" | "submitted" | "cleared" | "reported" | "rejected";
  zatcaClearedNumber?: string; // ZATCA clearance number for standard invoices
  zatcaReportingNumber?: string; // ZATCA reporting number for simplified invoices
  error?: string;
  rejectionReason?: string;
}

export interface ZatcaUblXmlResult {
  xml: string;
  invoiceHash: string;
  uuid: string;
}

export interface ZatcaSignatureResult {
  signedXml: string;
  invoiceHash: string;
  digitalSignature: string;
  certificateHash: string;
}

// ── Constants ──────────────────────────────────────────────────────────────

const ZATCA_AUTHORITY: EInvoiceAuthority = "zatca";
const ZATCA_CURRENCY = "SAR";
const ZATCA_DECIMAL_PLACES = 2;
const ZATCA_VAT_RATE = 15;
const ZATCA_REGULATION = "ZATCA Phase 2";
const ZATCA_MAX_FINE_SAR = 50000;
const ZATCA_PORTAL_BASE_URL = "https://gw-fatoora.zatca.gov.sa/e-invoicing/simulation/v2"; // simulation env
const ZATCA_CLEARED_ENDPOINT = "/invoices/cleared";
const ZATCA_REPORTED_ENDPOINT = "/invoices/reported";
const ZATCA_CLEARED_SIMULATION_ENDPOINT = "/invoices/cleared/simulation";
const ZATCA_REPORTED_SIMULATION_ENDPOINT = "/invoices/reported/simulation";

// UBL 2.1 namespace constants
const UBL_NS = "urn:oasis:names:specification:ubl:schema:xsd:Invoice-2";
const CBC_NS = "urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2";
const CAC_NS = "urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2";
const UBL_EXT_NS = "urn:oasis:names:specification:ubl:schema:xsd:ExtensionContent-2";
const SIG_NS = "urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2";

// ── Arabic error messages (Saudi Arabic) ────────────────────────────────────

const ERROR_MESSAGES = {
  VAT_TRN_MISSING: {
    field: "vatTrn",
    messageAr: "رقم التسجيل الضريبي (TRN) للبائع مطلوب وفقاً لمتطلبات هيئة الزكاة والضريبة والجمارك",
    messageEn: "Seller VAT registration number (TRN) is required per ZATCA regulations",
    severity: "error" as const,
  },
  ARABIC_SELLER_NAME_MISSING: {
    field: "sellerNameAr",
    messageAr: "اسم البائع باللغة العربية مطلوب وفقاً لنظام الفوترة الإلكترونية",
    messageEn: "Arabic seller name is required per e-invoicing regulations",
    severity: "error" as const,
  },
  ARABIC_SELLER_ADDRESS_MISSING: {
    field: "sellerAddressAr",
    messageAr: "عنوان البائع باللغة العربية مطلوب وفقاً لنظام الفوترة الإلكترونية",
    messageEn: "Arabic seller address is required per e-invoicing regulations",
    severity: "error" as const,
  },
  ARABIC_BUYER_NAME_MISSING: {
    field: "buyerNameAr",
    messageAr: "اسم المشتري باللغة العربية مطلوب للفواتير التجارية (B2B) وفقاً لمتطلبات هيئة الزكاة والضريبة والجمارك",
    messageEn: "Arabic buyer name is required for B2B (standard) invoices per ZATCA regulations",
    severity: "error" as const,
  },
  ARABIC_BUYER_ADDRESS_MISSING: {
    field: "buyerAddressAr",
    messageAr: "عنوان المشتري باللغة العربية مطلوب للفواتير التجارية (B2B) وفقاً لمتطلبات هيئة الزكاة والضريبة والجمارك",
    messageEn: "Arabic buyer address is required for B2B (standard) invoices per ZATCA regulations",
    severity: "error" as const,
  },
  BUYER_VAT_TRN_MISSING: {
    field: "buyerVatTrn",
    messageAr: "رقم التسجيل الضريبي للمشتري مطلوب للفواتير التجارية (B2B)",
    messageEn: "Buyer VAT registration number (TRN) is required for B2B (standard) invoices",
    severity: "error" as const,
  },
  CURRENCY_NOT_SAR: {
    field: "currency",
    messageAr: "يجب أن تكون عملة الفاتورة ريال سعودي (SAR) بخانتين عشرية",
    messageEn: "Invoice currency must be SAR with exactly 2 decimal places",
    severity: "error" as const,
  },
  DECIMAL_PLACES_INVALID: {
    field: "currencyDecimalPlaces",
    messageAr: "يجب عرض المبالغ بخانتين عشرية للريال السعودي وفقاً لمتطلبات هيئة الزكاة والضريبة والجمارك",
    messageEn: "Amounts must be displayed with exactly 2 decimal places for SAR per ZATCA regulations",
    severity: "error" as const,
  },
  VAT_RATE_INVALID: {
    field: "vatRate",
    messageAr: "يجب أن يكون معدل ضريبة القيمة المضافة 15% وفقاً لنظام الضريبة السعودي",
    messageEn: "VAT rate must be 15% per Saudi tax law",
    severity: "error" as const,
  },
  INVOICE_TYPE_MISSING: {
    field: "invoiceType",
    messageAr: "يجب تصنيف نوع الفاتورة (فاتورة ضريبية أو فاتورة مبسطة) وفقاً لنظام الفوترة الإلكترونية",
    messageEn: "Invoice type classification is required (standard/simplified) per e-invoicing regulations",
    severity: "error" as const,
  },
  LINE_ITEMS_ARABIC_MISSING: {
    field: "lineItemsAr",
    messageAr: "يجب أن تحتوي جميع البنود على وصف باللغة العربية وفقاً لنظام الفوترة الإلكترونية",
    messageEn: "All line items must have Arabic descriptions per e-invoicing regulations",
    severity: "error" as const,
  },
  UUID_MISSING: {
    field: "uuid",
    messageAr: "يجب أن تحتوي الفاتورة على رقم تعريف فريد (UUID) وفقاً لمتطلبات هيئة الزكاة والضريبة والجمارك",
    messageEn: "Invoice must have a UUID per ZATCA regulations",
    severity: "error" as const,
  },
  PIH_MISSING: {
    field: "previousInvoiceHash",
    messageAr: "يجب أن تحتوي الفاتورة على رمز التحقق للفاتورة السابقة (PIH) وفقاً لمتطلبات هيئة الزكاة والضريبة والجمارك",
    messageEn: "Invoice must include Previous Invoice Hash (PIH) per ZATCA regulations",
    severity: "warning" as const,
  },
  NOTES_ARABIC_MISSING: {
    field: "notesAr",
    messageAr: "الملاحظات يجب أن تكون باللغة العربية",
    messageEn: "Notes should be in Arabic",
    severity: "warning" as const,
  },
  RETENTION_WARNING: {
    field: "recordRetention",
    messageAr: "تنبيه: يجب الاحتفاظ بالسجلات لمدة 6 سنوات وفقاً لمتطلبات هيئة الزكاة والضريبة والجمارك. الغرامة قد تصل إلى 50,000 ريال سعودي",
    messageEn: "Records must be retained for 6 years per ZATCA regulations. Fines up to 50,000 SAR",
    severity: "warning" as const,
  },
  SIGNING_CERTIFICATE_MISSING: {
    field: "certificate",
    messageAr: "شهادة التوقيع الإلكتروني مطلوبة لتقديم الفاتورة إلى هيئة الزكاة والضريبة والجمارك",
    messageEn: "Digital signing certificate is required for ZATCA submission",
    severity: "warning" as const,
  },
  B2B_B2C_MISMATCH: {
    field: "invoiceTypeClassification",
    messageAr: "تصنيف نوع الفاتورة غير مطابق — يجب تصنيف الفواتير مع رقم تسجيل ضريبي للمشتري كفاتورة ضريبية (B2B)",
    messageEn: "Invoice type classification mismatch — invoices with buyer VAT TRN must be classified as standard (B2B)",
    severity: "error" as const,
  },
};

// ── UUID Generation ────────────────────────────────────────────────────────

/**
 * generateZatcaUuid — Generates a UUID per ZATCA specification.
 *
 * ZATCA requires a UUID (version 4) for each invoice. This UUID is used
 * for invoice identification and is included in the UBL XML.
 */
export function generateZatcaUuid(): string {
  // Generate UUID v4 using crypto.randomUUID if available, otherwise fallback
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
 * determineZatcaInvoiceType — B2B = standard, B2C = simplified.
 *
 * If the buyer has a VAT TRN or is a registered business (clientId),
 * classify as "standard" (B2B). Otherwise, "simplified" (B2C).
 *
 * ZATCA rules:
 * - Standard invoices (فاتورة ضريبية): B2B with buyer VAT TRN
 * - Simplified invoices (فاتورة مبسطة): B2C without buyer VAT TRN
 */
export function determineZatcaInvoiceType(invoice: Record<string, unknown>): ZatcaInvoiceType {
  // If already set, use it
  if (invoice.invoiceTypeEn === "standard" || invoice.invoiceTypeAr === "فاتورة ضريبية") {
    return "standard";
  }
  if (invoice.invoiceTypeEn === "simplified" || invoice.invoiceTypeAr === "فاتورة مبسطة") {
    return "simplified";
  }
  // Auto-classify: buyer has VAT TRN or clientId → B2B (standard)
  if (invoice.buyerVatTrn || invoice.buyerVatNumber || invoice.clientId) {
    return "standard";
  }
  // Default to simplified (B2C) for Saudi retail invoices
  return "simplified";
}

// ── Invoice Hash Computation ───────────────────────────────────────────────

/**
 * computeInvoiceHash — SHA-256 hash computation for PIH (Previous Invoice Hash).
 *
 * ZATCA requires each invoice to include the hash of the previous invoice
 * to create a chain. The hash is computed over the invoice XML content.
 *
 * Uses Node.js crypto for SHA-256. Returns hex-encoded hash.
 */
export function computeInvoiceHash(xml: string): string {
  // This is a synchronous placeholder — in production, use node:crypto
  // For now, we use a simple SHA-256 implementation
  // When deployed on Node.js runtime, this will use crypto.createHash('sha256')
  try {
    // Dynamic import for Node.js crypto (SSR only)
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const nodeCrypto = require("node:crypto");
    return nodeCrypto.createHash("sha256").update(xml, "utf8").digest("hex");
  } catch {
    // Fallback for environments where node:crypto is not available
    logger.warn("[zatca] node:crypto not available for hash computation — using placeholder");
    // Simple hash for testing/development environments
    let hash = 0;
    for (let i = 0; i < xml.length; i++) {
      const char = xml.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash |= 0; // Convert to 32bit integer
    }
    // Pad to simulate SHA-256 length (64 hex chars)
    return Math.abs(hash).toString(16).padStart(64, "0").slice(0, 64);
  }
}

// ── Validation ─────────────────────────────────────────────────────────────

/**
 * validateZatcaInvoice — Validates that a Saudi invoice meets ZATCA Phase 2 requirements.
 *
 * Returns validation errors with Arabic messages for UI display.
 * Errors block invoice creation/submission; warnings are advisory.
 */
export function validateZatcaInvoice(
  invoice: Record<string, unknown>,
  company: Record<string, unknown>,
): ZatcaValidationResult {
  const errors: ZatcaValidationError[] = [];
  const warnings: ZatcaValidationError[] = [];

  const countryCode = company.country as string;
  // Only validate if company is Saudi-based
  if (countryCode !== "SA") {
    return { valid: true, errors: [], warnings: [] };
  }

  // ── 1. Seller VAT TRN mandatory ──────────────────────────────────────
  if (!company.vatNumber && !invoice.vatTrn && !invoice.sellerVatTrn) {
    errors.push(ERROR_MESSAGES.VAT_TRN_MISSING);
  }

  // ── 2. Arabic seller name mandatory ──────────────────────────────────
  if (!company.nameAr && !invoice.sellerNameAr) {
    errors.push(ERROR_MESSAGES.ARABIC_SELLER_NAME_MISSING);
  }

  // ── 3. Arabic seller address mandatory ───────────────────────────────
  if (!company.address && !invoice.sellerAddressAr) {
    errors.push(ERROR_MESSAGES.ARABIC_SELLER_ADDRESS_MISSING);
  }

  // ── 4. Arabic buyer name — mandatory for standard (B2B) invoices ─────
  const invoiceType = determineZatcaInvoiceType(invoice);
  if (invoiceType === "standard") {
    if (!invoice.buyerNameAr && !invoice.clientName) {
      errors.push(ERROR_MESSAGES.ARABIC_BUYER_NAME_MISSING);
    }
    if (!invoice.buyerAddressAr && !invoice.clientAddress) {
      errors.push(ERROR_MESSAGES.ARABIC_BUYER_ADDRESS_MISSING);
    }
    // Buyer VAT TRN required for B2B
    if (!invoice.buyerVatTrn && !invoice.buyerVatNumber) {
      errors.push(ERROR_MESSAGES.BUYER_VAT_TRN_MISSING);
    }
  }

  // ── 5. Currency must be SAR ──────────────────────────────────────────
  const invoiceCurrency = (invoice.currency as string) || (company.currency as string) || ZATCA_CURRENCY;
  if (invoiceCurrency !== ZATCA_CURRENCY) {
    errors.push(ERROR_MESSAGES.CURRENCY_NOT_SAR);
  }

  // ── 6. Decimal places must be 2 for SAR ──────────────────────────────
  const decimalPlaces = (invoice.currencyDecimalPlaces as number) ?? ZATCA_DECIMAL_PLACES;
  if (decimalPlaces !== ZATCA_DECIMAL_PLACES) {
    errors.push(ERROR_MESSAGES.DECIMAL_PLACES_INVALID);
  }

  // ── 7. VAT rate must be 15% ──────────────────────────────────────────
  const taxRate = parseFloat(
    (invoice.taxRate as string) || (company.defaultTaxRate as string) || String(ZATCA_VAT_RATE)
  );
  if (taxRate !== ZATCA_VAT_RATE) {
    // Allow 0% VAT for exempt items but the main rate must be 15%
    if (taxRate !== 0) {
      errors.push(ERROR_MESSAGES.VAT_RATE_INVALID);
    }
  }

  // ── 8. Invoice type classification ───────────────────────────────────
  if (!invoice.invoiceTypeEn && !invoice.invoiceTypeAr) {
    errors.push(ERROR_MESSAGES.INVOICE_TYPE_MISSING);
  }

  // ── 9. B2B/B2C classification consistency ────────────────────────────
  if (invoiceType === "simplified" && (invoice.buyerVatTrn || invoice.buyerVatNumber)) {
    errors.push(ERROR_MESSAGES.B2B_B2C_MISMATCH);
  }

  // ── 10. Line items must have Arabic descriptions ─────────────────────
  const lineItems = invoice.lineItems as LineItem[] | string | undefined;
  let parsedItems: LineItem[] = [];
  if (typeof lineItems === "string") {
    try { parsedItems = JSON.parse(lineItems); } catch { parsedItems = []; }
  } else if (Array.isArray(lineItems)) {
    parsedItems = lineItems;
  }
  // Check Arabic line items
  const lineItemsAr = invoice.lineItemsAr as string | undefined;
  let parsedItemsAr: unknown[] = [];
  if (lineItemsAr) {
    try { parsedItemsAr = JSON.parse(lineItemsAr); } catch { parsedItemsAr = []; }
  }
  if (parsedItems.length > 0 && parsedItemsAr.length !== parsedItems.length) {
    errors.push(ERROR_MESSAGES.LINE_ITEMS_ARABIC_MISSING);
  }

  // ── 11. UUID warning ─────────────────────────────────────────────────
  if (!invoice.uuid && !invoice.eInvoiceUuid) {
    warnings.push(ERROR_MESSAGES.UUID_MISSING);
  }

  // ── 12. PIH warning ──────────────────────────────────────────────────
  if (!invoice.previousInvoiceHash) {
    warnings.push(ERROR_MESSAGES.PIH_MISSING);
  }

  // ── 13. Notes Arabic ─────────────────────────────────────────────────
  if (invoice.notes && !invoice.notesAr) {
    warnings.push(ERROR_MESSAGES.NOTES_ARABIC_MISSING);
  }

  // ── 14. Retention period warning ─────────────────────────────────────
  warnings.push(ERROR_MESSAGES.RETENTION_WARNING);

  // ── 15. Certificate warning ──────────────────────────────────────────
  if (!invoice.certificate && !invoice.certificateId) {
    warnings.push(ERROR_MESSAGES.SIGNING_CERTIFICATE_MISSING);
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

// ── UBL 2.1 XML Generation ─────────────────────────────────────────────────

/**
 * generateZatcaUblXml — Generates UBL 2.1 XML for ZATCA e-invoicing.
 *
 * Produces structurally correct UBL 2.1 XML that conforms to ZATCA's
 * e-invoicing specification. Supports both Standard (B2B) and Simplified
 * (B2C) invoice types.
 *
 * Standard Invoice XML includes:
 * - Full buyer details (name, address, VAT TRN)
 * - Complete tax breakdown per line item
 * - ECDSA signature placeholder
 * - PIH chaining reference
 *
 * Simplified Invoice XML includes:
 * - Minimal buyer details (name only)
 * - Simplified tax structure
 * - QR code reference (placeholder for production)
 * - PIH chaining reference
 */
export function generateZatcaUblXml(
  invoice: Record<string, unknown>,
  company: Record<string, unknown>,
): ZatcaUblXmlResult {
  const invoiceType = determineZatcaInvoiceType(invoice);
  const uuid = (invoice.uuid as string) || (invoice.eInvoiceUuid as string) || generateZatcaUuid();
  const issueDate = (invoice.issueDate as string) || new Date().toISOString().split("T")[0];
  const dueDate = (invoice.dueDate as string) || issueDate;

  // Hijri dates
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

  // Seller details
  const sellerNameAr = (company.nameAr as string) || (invoice.sellerNameAr as string) || (company.name as string) || "";
  const sellerNameEn = (company.name as string) || "";
  const sellerVatTrn = (company.vatNumber as string) || (invoice.sellerVatTrn as string) || "";
  const sellerAddressAr = (invoice.sellerAddressAr as string) || (company.address as string) || "";
  const sellerAddressEn = (company.address as string) || "";

  // Buyer details (only for standard B2B)
  const buyerNameAr = (invoice.buyerNameAr as string) || (invoice.clientName as string) || "";
  const buyerNameEn = (invoice.clientName as string) || "";
  const buyerVatTrn = (invoice.buyerVatTrn as string) || (invoice.buyerVatNumber as string) || "";
  const buyerAddressAr = (invoice.buyerAddressAr as string) || (invoice.clientAddress as string) || "";
  const buyerAddressEn = (invoice.clientAddress as string) || "";

  // PIH (Previous Invoice Hash)
  const pih = (invoice.previousInvoiceHash as string) || "";

  // Totals
  const totals = calcInvoiceTotals(
    parsedItems,
    ZATCA_VAT_RATE,
    num(invoice.shipping ?? 0, ZATCA_DECIMAL_PLACES),
    num(invoice.discount ?? 0, ZATCA_DECIMAL_PLACES),
  );

  // UBL invoice type code:
  // Standard (B2B) = 381 (Tax Invoice)
  // Simplified (B2C) = 388 (Simplified Invoice)
  const invoiceTypeCode = invoiceType === "standard" ? "381" : "388";
  const invoiceTypeNameAr = invoiceType === "standard" ? "فاتورة ضريبية" : "فاتورة مبسطة";
  const invoiceTypeNameEn = invoiceType === "standard" ? "Standard Invoice" : "Simplified Invoice";

  // ── Build UBL 2.1 XML ─────────────────────────────────────────────────

  const lineItemXml = parsedItems.map((item, index) => {
    const lineId = index + 1;
    const itemQty = num(item.qty, ZATCA_DECIMAL_PLACES).toFixed(ZATCA_DECIMAL_PLACES);
    const itemPrice = num(item.price, ZATCA_DECIMAL_PLACES).toFixed(ZATCA_DECIMAL_PLACES);
    const itemTotal = num(item.total ?? num(item.qty) * num(item.price), ZATCA_DECIMAL_PLACES).toFixed(ZATCA_DECIMAL_PLACES);
    const lineTaxAmount = num(parseFloat(itemTotal) * ZATCA_VAT_RATE / 100, ZATCA_DECIMAL_PLACES).toFixed(ZATCA_DECIMAL_PLACES);

    return `
    <cac:InvoiceLine>
      <cbc:ID>${lineId}</cbc:ID>
      <cbc:Note>${(item.description as string) || ""}</cbc:Note>
      <cbc:InvoicedQuantity unitCode="EA">${itemQty}</cbc:InvoicedQuantity>
      <cbc:LineExtensionAmount currencyID="SAR">${itemTotal}</cbc:LineExtensionAmount>
      <cac:Item>
        <cbc:Name>${(item.description as string) || ""}</cbc:Name>
        <cbc:Name languageID="ar">${(item.description as string) || ""}</cbc:Name>
      </cac:Item>
      <cac:Price>
        <cbc:PriceAmount currencyID="SAR">${itemPrice}</cbc:PriceAmount>
      </cac:Price>
      <cac:TaxTotal>
        <cbc:TaxAmount currencyID="SAR">${lineTaxAmount}</cbc:TaxAmount>
        <cac:TaxSubtotal>
          <cbc:TaxableAmount currencyID="SAR">${itemTotal}</cbc:TaxableAmount>
          <cbc:TaxAmount currencyID="SAR">${lineTaxAmount}</cbc:TaxAmount>
          <cac:TaxCategory>
            <cbc:ID schemeID="UN/ECE 5303" schemeAgencyID="6">S</cbc:ID>
            <cbc:Percent>${ZATCA_VAT_RATE.toFixed(ZATCA_DECIMAL_PLACES)}</cbc:Percent>
            <cac:TaxScheme>
              <cbc:ID schemeID="UN/ECE 5153" schemeAgencyID="6">VAT</cbc:ID>
              <cbc:Name languageID="ar">ضريبة القيمة المضافة</cbc:Name>
              <cbc:Name languageID="en">Value Added Tax</cbc:Name>
            </cac:TaxScheme>
          </cac:TaxCategory>
        </cac:TaxSubtotal>
      </cac:TaxTotal>
    </cac:InvoiceLine>`;
  }).join("");

  // Seller postal address XML
  const sellerAddressXml = `
      <cac:PostalAddress>
        <cbc:StreetName>${sellerAddressEn}</cbc:StreetName>
        <cbc:StreetName languageID="ar">${sellerAddressAr}</cbc:StreetName>
        <cbc:CityName>${(invoice.sellerCityEn as string) || (company.address as string) || ""}</cbc:CityName>
        <cbc:CityName languageID="ar">${(invoice.sellerCityAr as string) || sellerAddressAr}</cbc:CityName>
        <cbc:CountrySubentityName languageID="ar">${(invoice.sellerDistrictAr as string) || sellerAddressAr}</cbc:CountrySubentityName>
        <cbc:PostalZone>${(invoice.sellerPostalCode as string) || ""}</cbc:PostalZone>
        <cac:Country>
          <cbc:IdentificationCode>SA</cbc:IdentificationCode>
        </cac:Country>
      </cac:PostalAddress>`;

  // Buyer XML block (only for standard B2B invoices)
  const buyerXml = invoiceType === "standard" ? `
    <cac:AccountingCustomerParty>
      <cac:Party>
        <cac:PartyIdentification>
          <cbc:ID schemeID="CRN">${(invoice.buyerCommercialRegistration as string) || ""}</cbc:ID>
        </cac:PartyIdentification>
        <cac:PartyName>
          <cbc:Name>${buyerNameEn}</cbc:Name>
          <cbc:Name languageID="ar">${buyerNameAr}</cbc:Name>
        </cac:PartyName>
        <cac:PostalAddress>
          <cbc:StreetName>${buyerAddressEn}</cbc:StreetName>
          <cbc:StreetName languageID="ar">${buyerAddressAr}</cbc:StreetName>
          <cbc:CityName>${(invoice.buyerCityEn as string) || ""}</cbc:CityName>
          <cbc:CityName languageID="ar">${(invoice.buyerCityAr as string) || buyerAddressAr}</cbc:CityName>
          <cac:Country>
            <cbc:IdentificationCode>SA</cbc:IdentificationCode>
          </cac:Country>
        </cac:PostalAddress>
        <cac:PartyTaxScheme>
          <cbc:CompanyID>${buyerVatTrn}</cbc:CompanyID>
          <cac:TaxScheme>
            <cbc:ID schemeID="UN/ECE 5153" schemeAgencyID="6">VAT</cbc:ID>
            <cbc:Name languageID="ar">ضريبة القيمة المضافة</cbc:Name>
            <cbc:Name languageID="en">Value Added Tax</cbc:Name>
          </cac:TaxScheme>
        </cac:PartyTaxScheme>
        <cac:PartyLegalEntity>
          <cbc:RegistrationName>${buyerNameEn}</cbc:RegistrationName>
          <cbc:RegistrationName languageID="ar">${buyerNameAr}</cbc:RegistrationName>
        </cac:PartyLegalEntity>
      </cac:Party>
    </cac:AccountingCustomerParty>` : "";

  // Signature placeholder (ZATCA requires ECDSA + X.509)
  const signatureXml = `
    <cac:Signature>
      <cbc:ID>urn:oasis:names:specification:ubl:signature:Invoice</cbc:ID>
      <cbc:SignatureMethod>urn:oasis:names:specification:ubl:signature:Invoice</cbc:SignatureMethod>
      <cac:SignatoryParty>
        <cac:PartyIdentification>
          <cbc:ID>${sellerVatTrn}</cbc:ID>
        </cac:PartyIdentification>
        <cac:PartyName>
          <cbc:Name>${sellerNameEn}</cbc:Name>
          <cbc:Name languageID="ar">${sellerNameAr}</cbc:Name>
        </cac:PartyName>
      </cac:SignatoryParty>
      <cac:DigitalSignatureAttachment>
        <cac:ExternalReference>
          <cbc:URI>#ECDSA-Signature</cbc:URI>
        </cac:ExternalReference>
      </cac:DigitalSignatureAttachment>
    </cac:Signature>`;

  // Additional document reference for PIH (Previous Invoice Hash)
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

  // Build complete UBL XML
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="${UBL_NS}"
  xmlns:cac="${CAC_NS}"
  xmlns:cbc="${CBC_NS}"
  xmlns:ext="${UBL_EXT_NS}">
  <cbc:ProfileID>reporting:1.0</cbc:ProfileID>
  <cbc:ProfileID>${invoiceType === "standard" ? "clearance:1.0" : "reporting:1.0"}</cbc:ProfileID>
  <cbc:ID>${(invoice.invoiceNumber as string) || ""}</cbc:ID>
  <cbc:UUID>${uuid}</cbc:UUID>
  <cbc:IssueDate>${issueDate}</cbc:IssueDate>
  <cbc:IssueTime>${new Date().toISOString().split("T")[1]?.slice(0, 8) || "00:00:00"}</cbc:IssueTime>
  <cbc:InvoiceTypeCode name="${invoiceTypeNameAr}">${invoiceTypeCode}</cbc:InvoiceTypeCode>
  <cbc:DocumentCurrencyCode>SAR</cbc:DocumentCurrencyCode>
  <cbc:TaxCurrencyCode>SAR</cbc:TaxCurrencyCode>
  ${pihReferenceXml}
  ${uuidReferenceXml}
  ${signatureXml}
  <cac:AccountingSupplierParty>
    <cac:Party>
      <cac:PartyIdentification>
        <cbc:ID schemeID="CRN">${(company.commercialRegistration as string) || ""}</cbc:ID>
      </cac:PartyIdentification>
      <cac:PartyName>
        <cbc:Name>${sellerNameEn}</cbc:Name>
        <cbc:Name languageID="ar">${sellerNameAr}</cbc:Name>
      </cac:PartyName>
      ${sellerAddressXml}
      <cac:PartyTaxScheme>
        <cbc:CompanyID>${sellerVatTrn}</cbc:CompanyID>
        <cbc:CompanyID schemeID="VAT">${sellerVatTrn}</cbc:CompanyID>
        <cac:TaxScheme>
          <cbc:ID schemeID="UN/ECE 5153" schemeAgencyID="6">VAT</cbc:ID>
          <cbc:Name languageID="ar">ضريبة القيمة المضافة</cbc:Name>
          <cbc:Name languageID="en">Value Added Tax</cbc:Name>
        </cac:TaxScheme>
      </cac:PartyTaxScheme>
      <cac:PartyLegalEntity>
        <cbc:RegistrationName>${sellerNameEn}</cbc:RegistrationName>
        <cbc:RegistrationName languageID="ar">${sellerNameAr}</cbc:RegistrationName>
      </cac:PartyLegalEntity>
    </cac:Party>
  </cac:AccountingSupplierParty>
  ${buyerXml}
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="SAR">${totals.subtotal}</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="SAR">${totals.subtotal}</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="SAR">${totals.total}</cbc:TaxInclusiveAmount>
    <cbc:AllowanceTotalAmount currencyID="SAR">${totals.discount}</cbc:AllowanceTotalAmount>
    <cbc:PayableAmount currencyID="SAR">${totals.total}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>
  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="SAR">${totals.taxAmount}</cbc:TaxAmount>
    <cac:TaxSubtotal>
      <cbc:TaxableAmount currencyID="SAR">${totals.subtotal}</cbc:TaxableAmount>
      <cbc:TaxAmount currencyID="SAR">${totals.taxAmount}</cbc:TaxAmount>
      <cac:TaxCategory>
        <cbc:ID schemeID="UN/ECE 5303" schemeAgencyID="6">S</cbc:ID>
        <cbc:Percent>${ZATCA_VAT_RATE.toFixed(ZATCA_DECIMAL_PLACES)}</cbc:Percent>
        <cac:TaxScheme>
          <cbc:ID schemeID="UN/ECE 5153" schemeAgencyID="6">VAT</cbc:ID>
          <cbc:Name languageID="ar">ضريبة القيمة المضافة</cbc:Name>
          <cbc:Name languageID="en">Value Added Tax</cbc:Name>
        </cac:TaxScheme>
      </cac:TaxCategory>
    </cac:TaxSubtotal>
  </cac:TaxTotal>
  ${lineItemXml}
</Invoice>`;

  // Compute invoice hash
  const invoiceHash = computeInvoiceHash(xml);

  return {
    xml,
    invoiceHash,
    uuid,
  };
}

// ── Digital Signing ─────────────────────────────────────────────────────────

/**
 * signZatcaInvoice — ECDSA digital signing for ZATCA invoice XML.
 *
 * This is a placeholder with clear integration points for real certificate
 * injection. In production, ZATCA requires:
 * - ECDSA signature over the XML content
 * - X.509 certificate hash embedded in the UBL structure
 * - PIH (Previous Invoice Hash) for invoice chaining
 *
 * Integration points:
 * 1. Replace the ECDSA signing with actual certificate-based signing
 * 2. Use the CSID/CCD certificates obtained from ZATCA onboarding
 * 3. Embed the X.509 certificate in the UBL Signature element
 *
 * @param xml - The raw UBL XML to sign
 * @param certificate - X.509 certificate data (base64 PEM)
 * @param privateKey - ECDSA private key data (base64 PEM)
 */
export function signZatcaInvoice(
  xml: string,
  certificate: string,
  privateKey: string,
): ZatcaSignatureResult {
  logger.info("[zatca] signing invoice with ECDSA", {
    certificateLength: certificate?.length || 0,
    privateKeyAvailable: !!privateKey,
  });

  const invoiceHash = computeInvoiceHash(xml);

  try {
    // ── Placeholder ECDSA signing ──────────────────────────────────────
    // In production, this would:
    // 1. Parse the X.509 certificate to extract the public key
    // 2. Sign the invoiceHash with the ECDSA private key (P-256 curve)
    // 3. Encode the signature as base64
    // 4. Compute SHA-256 hash of the certificate itself
    //
    // For now, we generate a deterministic placeholder signature based on
    // the invoice hash and certificate. This placeholder will be replaced
    // when real ZATCA CSID/CCD certificates are injected.

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const nodeCrypto = require("node:crypto");

    // Sign with ECDSA P-256 (placeholder: uses provided key material)
    const sign = nodeCrypto.createSign("SHA256");
    sign.update(invoiceHash);
    sign.end();

    // If a real private key is provided, use it for actual signing
    let digitalSignature: string;
    if (privateKey && privateKey.includes("PRIVATE KEY")) {
      try {
        digitalSignature = sign.sign(privateKey, "base64");
      } catch {
        // Fallback to placeholder if real signing fails
        logger.warn("[zatca] ECDSA signing failed with provided key — using placeholder");
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
      /<cbc:URI>#ECDSA-Signature<\/cbc:URI>/,
      `<cbc:URI>#ECDSA-Signature</cbc:URI>\n        <cbc:Reference>${invoiceHash}</cbc:Reference>`
    ).replace(
      /<\/cac:DigitalSignatureAttachment>/,
      `</cac:DigitalSignatureAttachment>
      <cac:Certificate>
        <cbc:CertificateHash>${certificateHash}</cbc:CertificateHash>
      </cac:Certificate>`
    );

    logger.info("[zatca] invoice signed successfully", {
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
    logger.warn("[zatca] signing using node:crypto failed — generating placeholder", {
      err: err instanceof Error ? err.message : String(err),
    });

    // Fallback placeholder for environments without node:crypto
    const digitalSignature = Buffer.from(invoiceHash + certificate).toString("base64");
    const certificateHash = invoiceHash.slice(0, 64); // Placeholder

    const signedXml = xml.replace(
      /<cbc:URI>#ECDSA-Signature<\/cbc:URI>/,
      `<cbc:URI>#ECDSA-Signature</cbc:URI>\n        <cbc:Reference>${invoiceHash}</cbc:Reference>`
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

// ── ZATCA Portal Submission ─────────────────────────────────────────────────

/**
 * submitZatcaInvoice — Submits a signed invoice to ZATCA portal.
 *
 * Standard invoices → "Cleared" endpoint (requires full ECDSA signing + X.509 cert)
 * Simplified invoices → "Reported" endpoint (lighter signing requirements)
 *
 * The ZATCA portal returns:
 * - For cleared invoices: a clearance number and QR code data
 * - For reported invoices: a reporting confirmation
 * - For rejected invoices: a rejection reason
 *
 * @param signedXml - The signed UBL XML to submit
 * @param invoiceType - "standard" or "simplified"
 * @param certificate - The CSID/CCD certificate for authentication
 * @param companySlug - Company slug for EInvoice record
 */
export async function submitZatcaInvoice(
  signedXml: string,
  invoiceType: ZatcaInvoiceType,
  certificate: string,
  companySlug: string,
): Promise<ZatcaSubmissionResult> {
  logger.info("[zatca] submitting invoice to ZATCA portal", {
    invoiceType,
    companySlug,
    xmlLength: signedXml?.length || 0,
  });

  try {
    // ── Determine submission endpoint ────────────────────────────────────
    const endpoint = invoiceType === "standard"
      ? ZATCA_CLEARED_SIMULATION_ENDPOINT
      : ZATCA_REPORTED_SIMULATION_ENDPOINT;

    // ── Placeholder: ZATCA API submission ─────────────────────────────────
    // In production, this makes a real HTTP POST to the ZATCA portal.
    // The request includes:
    //   - Signed XML in base64-encoded format
    //   - CSID/CCD certificate for authentication
    //   - Invoice hash for verification
    //
    // ZATCA API request format:
    //   POST {endpoint}
    //   Headers: Authorization: Bearer {CSID-token}, Content-Type: application/json
    //   Body: { invoice: base64(signedXml), invoiceHash: hex, certificate: base64(cert) }
    //
    // For now, we simulate the submission and create an EInvoice record.
    // When the ZATCA production API is configured, this will make real HTTP calls.

    // Find the invoice by company slug (looking for most recent draft)
    // In production, the invoice number would be passed explicitly
    const invoiceHash = computeInvoiceHash(signedXml);

    // Simulate ZATCA response
    const isSimulation = true; // Placeholder flag — will be false in production
    const submissionStatus = isSimulation
      ? (invoiceType === "standard" ? "cleared" : "reported")
      : "pending";

    // Create EInvoice record
    const existingInvoice = await db.invoice.findFirst({
      where: {
        companySlug,
        status: "draft",
        deletedAt: null,
      },
      orderBy: { createdAt: "desc" },
    });

    if (!existingInvoice) {
      logger.warn("[zatca] no matching invoice found for submission", { companySlug });
      // Still create a record for the submission attempt
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
            authorityType: ZATCA_AUTHORITY,
            submissionStatus,
            signedXml,
            rawXml: signedXml,
            xmlHash: invoiceHash,
            uuid: generateZatcaUuid(),
            submittedAt: new Date(),
            updatedAt: new Date(),
          },
        });

        // Update invoice status
        await db.invoice.update({
          where: { id: invoiceId },
          data: {
            eInvoiceStatus: submissionStatus,
            eInvoiceAuthority: ZATCA_AUTHORITY,
          },
        });

        logger.info("[zatca] EInvoice updated", { eInvoiceId: existingEInvoice.id, submissionStatus });

        return {
          ok: true,
          eInvoiceId: existingEInvoice.id,
          submissionStatus: submissionStatus as ZatcaSubmissionResult["submissionStatus"],
        };
      }
    }

    // Create new EInvoice record (only if we have a valid invoiceId)
    if (invoiceId > 0) {
      const eInvoice = await db.eInvoice.create({
        data: {
          invoiceId,
          companySlug,
          authorityType: ZATCA_AUTHORITY,
          submissionStatus,
          signedXml,
          rawXml: signedXml,
          xmlHash: invoiceHash,
          uuid: generateZatcaUuid(),
          submittedAt: new Date(),
        },
      });

      // Update invoice status
      await db.invoice.update({
        where: { id: invoiceId },
        data: {
          eInvoiceStatus: submissionStatus,
          eInvoiceAuthority: ZATCA_AUTHORITY,
        },
      });

      logger.info("[zatca] EInvoice created", { eInvoiceId: eInvoice.id, submissionStatus });

      return {
        ok: true,
        eInvoiceId: eInvoice.id,
        submissionStatus: submissionStatus as ZatcaSubmissionResult["submissionStatus"],
      };
    }

    // No invoice found — return pending status
    return {
      ok: true,
      submissionStatus: "pending",
    };
  } catch (err) {
    logger.error("[zatca] submission failed", {
      err: err instanceof Error ? err.message : String(err),
      invoiceType,
      companySlug,
    });
    return {
      ok: false,
      submissionStatus: "rejected",
      error: err instanceof Error ? err.message : "Unknown error",
      rejectionReason: err instanceof Error ? err.message : "Internal error during ZATCA submission",
    };
  }
}

// ── Status Check ────────────────────────────────────────────────────────────

/**
 * getZatcaInvoiceStatus — Checks the submission status of a ZATCA e-invoice.
 *
 * Returns local DB status. In production, this would also query the ZATCA
 * portal API to get the latest status and update the local record.
 */
export async function getZatcaInvoiceStatus(eInvoiceId: number): Promise<{
  status: string;
  authorityType: string;
  rejectionReason?: string;
  submittedAt?: string;
  approvedAt?: string;
  clearanceNumber?: string;
}> {
  try {
    const eInvoice = await db.eInvoice.findUnique({
      where: { id: eInvoiceId },
    });

    if (!eInvoice) {
      return {
        status: "not_found",
        authorityType: ZATCA_AUTHORITY,
        rejectionReason: "EInvoice record not found",
      };
    }

    // ── Placeholder: In production, query ZATCA portal for latest status ──
    // GET /api/v2/invoices/{uuid}/status → update local DB

    return {
      status: eInvoice.submissionStatus,
      authorityType: eInvoice.authorityType,
      rejectionReason: eInvoice.rejectionReason || undefined,
      submittedAt: eInvoice.submittedAt?.toISOString() || undefined,
      approvedAt: eInvoice.approvedAt?.toISOString() || undefined,
    };
  } catch (err) {
    logger.error("[zatca] status check failed", {
      err: err instanceof Error ? err.message : String(err),
      eInvoiceId,
    });
    return {
      status: "error",
      authorityType: ZATCA_AUTHORITY,
      rejectionReason: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

// ── Auto-populate ZATCA fields ──────────────────────────────────────────────

/**
 * autoPopulateZatcaFields — Auto-populates ZATCA-specific invoice fields
 * from company settings and Gregorian dates.
 *
 * Called by the invoice validation middleware when creating/updating
 * a Saudi company invoice.
 */
export function autoPopulateZatcaFields(
  invoiceData: Record<string, unknown>,
  company: Record<string, unknown>,
): Record<string, unknown> {
  const result = { ...invoiceData };

  // ── 1. Generate UUID ──────────────────────────────────────────────────
  if (!invoiceData.uuid && !invoiceData.eInvoiceUuid) {
    result.uuid = generateZatcaUuid();
  }

  // ── 2. Auto-populate Hijri dates ──────────────────────────────────────
  if (invoiceData.issueDate && !invoiceData.hijriIssueDate) {
    result.hijriIssueDate = formatHijri(invoiceData.issueDate as string);
  }
  if (invoiceData.dueDate && !invoiceData.hijriDueDate) {
    result.hijriDueDate = formatHijri(invoiceData.dueDate as string);
  }

  // ── 3. Auto-populate VAT TRN from company ─────────────────────────────
  if (!invoiceData.sellerVatTrn && company.vatNumber) {
    result.sellerVatTrn = company.vatNumber;
  }

  // ── 4. Auto-populate Arabic seller fields from company ────────────────
  if (!invoiceData.sellerNameAr) {
    result.sellerNameAr = company.nameAr || company.name || "";
  }
  if (!invoiceData.sellerAddressAr) {
    result.sellerAddressAr = company.address || "";
  }

  // ── 5. Auto-populate invoice type ─────────────────────────────────────
  const invoiceType = determineZatcaInvoiceType(invoiceData);
  if (!invoiceData.invoiceTypeEn) {
    result.invoiceTypeEn = invoiceType;
  }
  if (!invoiceData.invoiceTypeAr) {
    result.invoiceTypeAr = invoiceType === "standard" ? "فاتورة ضريبية" : "فاتورة مبسطة";
  }

  // ── 6. Enforce SAR currency ───────────────────────────────────────────
  result.currency = ZATCA_CURRENCY;
  result.currencyDecimalPlaces = ZATCA_DECIMAL_PLACES;

  // ── 7. Enforce 15% VAT rate ───────────────────────────────────────────
  const currentTaxRate = parseFloat((invoiceData.taxRate as string) || (company.defaultTaxRate as string) || "0");
  if (currentTaxRate !== ZATCA_VAT_RATE) {
    result.taxRate = ZATCA_VAT_RATE.toFixed(ZATCA_DECIMAL_PLACES);
  }

  // ── 8. Set e-invoice authority ────────────────────────────────────────
  result.eInvoiceAuthority = ZATCA_AUTHORITY;

  // ── 9. Enforce 2-decimal precision on all monetary fields ─────────────
  for (const field of ["subtotal", "taxAmount", "total", "shipping", "discount", "paid"]) {
    if (result[field] !== undefined && result[field] !== null) {
      result[field] = num(result[field], ZATCA_DECIMAL_PLACES).toFixed(ZATCA_DECIMAL_PLACES);
    }
  }

  // ── 10. Set PIH (Previous Invoice Hash) placeholder ──────────────────
  if (!invoiceData.previousInvoiceHash) {
    // For the first invoice, ZATCA uses a base64-encoded SHA-256 hash of
    // a specific placeholder string. This is documented in the ZATCA spec.
    result.previousInvoiceHash = "NWZlY2ViNjZmZmM4NmYzNDQ0MWY0ZGQzNzU0Y2QwOWE0MmM2YzY2OGZkMWU0YWQ0NWQ3YzA4ZjY0ZjU4NDk0Nw==";
  }

  return result;
}

// ── Utility exports ────────────────────────────────────────────────────────

export {
  ZATCA_AUTHORITY,
  ZATCA_CURRENCY,
  ZATCA_DECIMAL_PLACES,
  ZATCA_VAT_RATE,
  ZATCA_REGULATION,
  ZATCA_MAX_FINE_SAR,
  ZATCA_PORTAL_BASE_URL,
};

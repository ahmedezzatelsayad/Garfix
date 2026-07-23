/**
 * kuwait.ts — Kuwait Decree 10/2026 (Digital Commerce Law) compliance module.
 *
 * Provides validation, payload generation, and submission logic for Kuwait
 * e-invoicing requirements under Decree 10/2026.
 *
 * Key requirements:
 * - Arabic language mandatory (all invoice fields must have Arabic values)
 * - Hijri date must be present alongside Gregorian
 * - MOCI (Ministry of Commerce and Industry) registration number displayed
 * - Amounts in KWD with exactly 3 decimal places
 * - Seller and buyer details (name, address, tax registration)
 * - Invoice type classification (standard/simplified)
 * - 5-year record retention
 * - CBK-licensed payment gateway (MyFatoorah is already CBK-licensed)
 * - Fines up to 10,000 KWD
 *
 * Portal API is not yet published (expected ~September 2026 enforcement).
 * The structure is ready to plug in when the portal becomes available.
 */

import { toHijri, formatDualDate, formatHijri } from "@/lib/hijri";
import { fmtMoney, num, calcInvoiceTotals, type LineItem } from "@/lib/money";
import {
  getCountryConfig,
  isKuwait,
  isArabicMandatory,
  getRetentionYears,
  getCurrencyDecimalPlaces,
  getPaymentGatewayLicense,
  getDecreeRef,
  type EInvoiceAuthority,
} from "@/lib/gulfConfig";
import { logger } from "@/lib/logger";
import { db } from "@/lib/db";

// ── Types ──────────────────────────────────────────────────────────────────

export interface KuwaitValidationError {
  field: string;
  messageAr: string; // Arabic error message for UI display
  messageEn: string; // English error message for developer reference
  severity: "error" | "warning"; // error = blocks submission, warning = advisory
}

export interface KuwaitValidationResult {
  valid: boolean;
  errors: KuwaitValidationError[];
  warnings: KuwaitValidationError[];
}

export type KuwaitInvoiceType = "standard" | "simplified";
// standard = B2B (tax invoice with full buyer details)
// simplified = B2C (retail invoice with simplified buyer details)

export interface KuwaitInvoicePayload {
  // ── Header ───────────────────────────────────────────────────────────
  invoiceNumber: string;
  invoiceType: KuwaitInvoiceType;
  invoiceTypeAr: string;
  invoiceTypeEn: string;
  decreeRef: string; // "Decree 10/2026"

  // ── Dates (dual calendar) ────────────────────────────────────────────
  issueDateGregorian: string; // YYYY-MM-DD
  issueDateHijri: string; // formatted Hijri string
  issueDateDual: string; // dual format: "12 يناير 2026 (12 رجب 1447)"
  dueDateGregorian: string;
  dueDateHijri: string;
  dueDateDual: string;

  // ── Currency ─────────────────────────────────────────────────────────
  currency: string; // "KWD"
  currencyDecimalPlaces: number; // 3

  // ── Seller ───────────────────────────────────────────────────────────
  sellerNameAr: string;
  sellerNameEn: string;
  sellerAddressAr: string;
  sellerAddressEn: string;
  sellerMociNumber: string; // MOCI registration number
  sellerCommercialRegistration: string; // CR number (السجل التجاري)
  sellerVatNumber: string | null;
  sellerTaxRegistration: string | null;

  // ── Buyer ────────────────────────────────────────────────────────────
  buyerNameAr: string | null;
  buyerNameEn: string | null;
  buyerAddressAr: string | null;
  buyerAddressEn: string | null;
  buyerVatNumber: string | null;
  buyerTaxRegistration: string | null;

  // ── Line items ───────────────────────────────────────────────────────
  lineItems: KuwaitLineItemPayload[];
  lineItemsAr: KuwaitLineItemPayload[]; // Arabic mirror

  // ── Totals (KWD, 3 decimal places) ───────────────────────────────────
  subtotal: string;
  taxRate: string;
  taxAmount: string;
  total: string;
  shipping: string;
  discount: string;
  paid: string;

  // ── Notes ────────────────────────────────────────────────────────────
  notesAr: string | null;
  notesEn: string | null;

  // ── Authority ────────────────────────────────────────────────────────
  eInvoiceAuthority: string; // "kuwait_decree_10_2026"
  paymentGatewayLicense: string; // "CBK"
}

export interface KuwaitLineItemPayload {
  descriptionAr: string;
  descriptionEn: string;
  qty: string;
  price: string;
  total: string;
}

export interface KuwaitSubmissionResult {
  ok: boolean;
  eInvoiceId?: number;
  submissionStatus: string;
  error?: string;
}

// ── Constants ──────────────────────────────────────────────────────────────

const KUWAIT_AUTHORITY: EInvoiceAuthority = "kuwait_decree_10_2026";
const KUWAIT_CURRENCY = "KWD";
const KUWAIT_DECIMAL_PLACES = 3;
const KUWAIT_DECREE_REF = "Decree 10/2026";
const KUWAIT_PAYMENT_GATEWAY_LICENSE = "CBK";
const KUWAIT_MAX_FINE_KWD = 10000;

// ── Arabic error messages (Kuwaiti Arabic) ─────────────────────────────────

const ERROR_MESSAGES = {
  ARABIC_MISSING: {
    field: "arabicFields",
    messageAr: "يجب أن تحتوي جميع حقول الفاتورة على قيم باللغة العربية وفقاً للمرسوم 10/2026",
    messageEn: "All invoice fields must have Arabic values per Decree 10/2026",
    severity: "error" as const,
  },
  ARABIC_SELLER_NAME_MISSING: {
    field: "sellerNameAr",
    messageAr: "اسم البائع باللغة العربية مطلوب",
    messageEn: "Arabic seller name is required",
    severity: "error" as const,
  },
  ARABIC_SELLER_ADDRESS_MISSING: {
    field: "sellerAddressAr",
    messageAr: "عنوان البائع باللغة العربية مطلوب",
    messageEn: "Arabic seller address is required",
    severity: "error" as const,
  },
  ARABIC_BUYER_NAME_MISSING: {
    field: "buyerNameAr",
    messageAr: "اسم المشتري باللغة العربية مطلوب للفواتير التجارية (B2B)",
    messageEn: "Arabic buyer name is required for B2B (standard) invoices",
    severity: "error" as const,
  },
  ARABIC_BUYER_ADDRESS_MISSING: {
    field: "buyerAddressAr",
    messageAr: "عنوان المشتري باللغة العربية مطلوب للفواتير التجارية (B2B)",
    messageEn: "Arabic buyer address is required for B2B (standard) invoices",
    severity: "error" as const,
  },
  HIJRI_DATE_MISSING: {
    field: "hijriIssueDate",
    messageAr: "يجب أن تحتوي الفاتورة على التاريخ الهجري alongside Gregorian",
    messageEn: "Invoice must have Hijri date alongside Gregorian date",
    severity: "error" as const,
  },
  MOCI_NUMBER_MISSING: {
    field: "mociNumber",
    messageAr: "رقم وزارة التجارة والصناعة (MOCI) مطلوب على الفاتورة",
    messageEn: "MOCI registration number is required on invoice",
    severity: "error" as const,
  },
  CURRENCY_NOT_KWD: {
    field: "currency",
    messageAr: "يجب أن تكون عملة الفاتورة دينار كويتي (KWD) بثلاث خانات عشرية",
    messageEn: "Invoice currency must be KWD with exactly 3 decimal places",
    severity: "error" as const,
  },
  DECIMAL_PLACES_INVALID: {
    field: "currencyDecimalPlaces",
    messageAr: "يجب عرض المبالغ بثلاث خانات عشرية للدينار الكويتي",
    messageEn: "Amounts must be displayed with exactly 3 decimal places for KWD",
    severity: "error" as const,
  },
  INVOICE_TYPE_MISSING: {
    field: "invoiceType",
    messageAr: "يجب تصنيف نوع الفاتورة (فاتورة ضريبية أو فاتورة مبسطة)",
    messageEn: "Invoice type classification is required (standard/simplified)",
    severity: "error" as const,
  },
  LINE_ITEMS_ARABIC_MISSING: {
    field: "lineItemsAr",
    messageAr: "يجب أن تحتوي جميع البنود على وصف باللغة العربية",
    messageEn: "All line items must have Arabic descriptions",
    severity: "error" as const,
  },
  NOTES_ARABIC_MISSING: {
    field: "notesAr",
    messageAr: "الملاحظات يجب أن تكون باللغة العربية",
    messageEn: "Notes must be in Arabic",
    severity: "warning" as const,
  },
  RETENTION_WARNING: {
    field: "recordRetention",
    messageAr: `تنبيه: يجب الاحتفاظ بالسجلات لمدة 5 سنوات وفقاً للمرسوم 10/2026. الغرامة قد تصل إلى ${fmtMoney(KUWAIT_MAX_FINE_KWD, KUWAIT_CURRENCY)} دينار كويتي`,
    messageEn: "Records must be retained for 5 years per Decree 10/2026. Fines up to 10,000 KWD",
    severity: "warning" as const,
  },
  PAYMENT_GATEWAY_NOT_CBK: {
    field: "paymentGateway",
    messageAr: "يجب استخدام بوابة دفوعات مرخصة من البنك المركزي الكويتي (CBK)",
    messageEn: "Must use a CBK-licensed payment gateway",
    severity: "warning" as const,
  },
};

// ── Validation ─────────────────────────────────────────────────────────────

/**
 * validateKuwaitInvoice — Validates that a Kuwait invoice meets Decree 10/2026 requirements.
 *
 * Returns validation errors with Arabic messages for UI display.
 * Errors block invoice creation/submission; warnings are advisory.
 */
export function validateKuwaitInvoice(
  invoice: Record<string, unknown>,
  company: Record<string, unknown>,
): KuwaitValidationResult {
  const errors: KuwaitValidationError[] = [];
  const warnings: KuwaitValidationError[] = [];

  // Only validate if the company is Kuwait-based
  if (!isKuwait(company.country as string)) {
    return { valid: true, errors: [], warnings: [] };
  }

  // ── 1. Arabic language mandatory ──────────────────────────────────────
  // Seller name (Arabic)
  if (!company.nameAr && !invoice.sellerNameAr) {
    errors.push(ERROR_MESSAGES.ARABIC_SELLER_NAME_MISSING);
  }
  // Seller address (Arabic)
  if (!company.address && !invoice.sellerAddressAr) {
    // Company address may not have Arabic variant — check if invoice has it
    if (!invoice.sellerAddressAr) {
      errors.push(ERROR_MESSAGES.ARABIC_SELLER_ADDRESS_MISSING);
    }
  }
  // Buyer name (Arabic) — required for B2B (standard) invoices
  const invoiceType = determineInvoiceType(invoice);
  if (invoiceType === "standard" && !invoice.buyerNameAr && !invoice.clientName) {
    errors.push(ERROR_MESSAGES.ARABIC_BUYER_NAME_MISSING);
  }
  // Buyer address (Arabic) — required for B2B (standard) invoices
  if (invoiceType === "standard" && !invoice.buyerAddressAr && !invoice.clientAddress) {
    errors.push(ERROR_MESSAGES.ARABIC_BUYER_ADDRESS_MISSING);
  }

  // ── 2. Hijri date must be present ─────────────────────────────────────
  if (!invoice.hijriIssueDate && !invoice.issueDate) {
    errors.push(ERROR_MESSAGES.HIJRI_DATE_MISSING);
  } else if (!invoice.hijriIssueDate && invoice.issueDate) {
    // Hijri date can be auto-populated from Gregorian, so this is a warning
    warnings.push({
      ...ERROR_MESSAGES.HIJRI_DATE_MISSING,
      severity: "warning",
      messageAr: "سيتم إضافة التاريخ الهجري تلقائياً من التاريخ الميلادي",
      messageEn: "Hijri date will be auto-populated from the Gregorian date",
    });
  }

  // ── 3. MOCI number must be present ────────────────────────────────────
  if (!company.mociNumber && !invoice.mociNumber) {
    errors.push(ERROR_MESSAGES.MOCI_NUMBER_MISSING);
  }

  // ── 4. Currency must be KWD ───────────────────────────────────────────
  const invoiceCurrency = (invoice.currency as string) || (company.currency as string) || KUWAIT_CURRENCY;
  if (invoiceCurrency !== KUWAIT_CURRENCY) {
    errors.push(ERROR_MESSAGES.CURRENCY_NOT_KWD);
  }

  // ── 5. Decimal places must be 3 for KWD ──────────────────────────────
  const decimalPlaces = (invoice.currencyDecimalPlaces as number) ?? KUWAIT_DECIMAL_PLACES;
  if (decimalPlaces !== KUWAIT_DECIMAL_PLACES) {
    errors.push(ERROR_MESSAGES.DECIMAL_PLACES_INVALID);
  }

  // ── 6. Invoice type classification ────────────────────────────────────
  if (!invoice.invoiceTypeEn && !invoice.invoiceTypeAr) {
    errors.push(ERROR_MESSAGES.INVOICE_TYPE_MISSING);
  }

  // ── 7. Line items must have Arabic descriptions ───────────────────────
  const lineItems = invoice.lineItems as LineItem[] | string | undefined;
  let parsedItems: LineItem[] = [];
  if (typeof lineItems === "string") {
    try { parsedItems = JSON.parse(lineItems); } catch { parsedItems = []; }
  } else if (Array.isArray(lineItems)) {
    parsedItems = lineItems;
  }
  // Check if Arabic line items are present
  const lineItemsAr = invoice.lineItemsAr as string | undefined;
  let parsedItemsAr: KuwaitLineItemPayload[] = [];
  if (lineItemsAr) {
    try { parsedItemsAr = JSON.parse(lineItemsAr); } catch { parsedItemsAr = []; }
  }
  if (parsedItems.length > 0 && parsedItemsAr.length !== parsedItems.length) {
    errors.push(ERROR_MESSAGES.LINE_ITEMS_ARABIC_MISSING);
  }

  // ── 8. Notes must be in Arabic (warning, not blocking) ────────────────
  if (invoice.notes && !invoice.notesAr) {
    warnings.push(ERROR_MESSAGES.NOTES_ARABIC_MISSING);
  }

  // ── 9. Retention period warning ───────────────────────────────────────
  warnings.push(ERROR_MESSAGES.RETENTION_WARNING);

  // ── 10. Payment gateway must be CBK-licensed ──────────────────────────
  if (getPaymentGatewayLicense(company.country as string) === "CBK") {
    warnings.push(ERROR_MESSAGES.PAYMENT_GATEWAY_NOT_CBK);
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

// ── Invoice type classification ────────────────────────────────────────────

/**
 * determineInvoiceType — B2B = standard, B2C = simplified.
 *
 * If buyer has a VAT/tax registration number or is a business client,
 * classify as "standard" (B2B). Otherwise, "simplified" (B2C).
 */
export function determineInvoiceType(invoice: Record<string, unknown>): KuwaitInvoiceType {
  // If already set, use it
  if (invoice.invoiceTypeEn === "standard" || invoice.invoiceTypeAr === "فاتورة ضريبية") {
    return "standard";
  }
  if (invoice.invoiceTypeEn === "simplified" || invoice.invoiceTypeAr === "فاتورة مبسطة") {
    return "simplified";
  }
  // Auto-classify: if buyer has tax registration or clientId (business), it's B2B
  if (invoice.buyerVatNumber || invoice.buyerTaxRegistration || invoice.clientId) {
    return "standard";
  }
  // Default to simplified (B2C) for Kuwait retail invoices
  return "simplified";
}

// ── Payload generation ─────────────────────────────────────────────────────

/**
 * generateKuwaitInvoicePayload — Maps Invoice + Company fields to Kuwait
 * e-invoice format per Decree 10/2026.
 *
 * Includes both Gregorian and Hijri dates, MOCI number, Arabic fields,
 * and KWD amounts with 3 decimal precision.
 */
export function generateKuwaitInvoicePayload(
  invoice: Record<string, unknown>,
  company: Record<string, unknown>,
): KuwaitInvoicePayload {
  const invoiceType = determineInvoiceType(invoice);
  const issueDate = (invoice.issueDate as string) || new Date().toISOString().split("T")[0];
  const dueDate = (invoice.dueDate as string) || issueDate;

  // Hijri dates using hijri.ts
  const hijriIssue = toHijri(issueDate);
  const hijriDue = toHijri(dueDate);
  const dualIssueDate = formatDualDate(issueDate);
  const dualDueDate = formatDualDate(dueDate);

  // Line items
  const lineItems = invoice.lineItems as LineItem[] | string;
  let parsedItems: LineItem[] = [];
  if (typeof lineItems === "string") {
    try { parsedItems = JSON.parse(lineItems); } catch { parsedItems = []; }
  } else if (Array.isArray(lineItems)) {
    parsedItems = lineItems;
  }

  // Arabic line items
  const lineItemsArStr = invoice.lineItemsAr as string | undefined;
  let parsedItemsAr: KuwaitLineItemPayload[] = [];
  if (lineItemsArStr) {
    try { parsedItemsAr = JSON.parse(lineItemsArStr); } catch { parsedItemsAr = []; }
  }
  // If Arabic items are missing, generate placeholder structure
  if (parsedItemsAr.length === 0 && parsedItems.length > 0) {
    parsedItemsAr = parsedItems.map((item) => ({
      descriptionAr: (item.description as string) || "", // Use existing description as fallback
      descriptionEn: (item.description as string) || "",
      qty: num(item.qty, KUWAIT_DECIMAL_PLACES).toFixed(KUWAIT_DECIMAL_PLACES),
      price: num(item.price, KUWAIT_DECIMAL_PLACES).toFixed(KUWAIT_DECIMAL_PLACES),
      total: num(item.total ?? num(item.qty) * num(item.price), KUWAIT_DECIMAL_PLACES).toFixed(KUWAIT_DECIMAL_PLACES),
    }));
  }

  // Totals with KWD 3-decimal precision
  const totals = calcInvoiceTotals(
    parsedItems,
    num(invoice.taxRate ?? company.defaultTaxRate ?? 0),
    num(invoice.shipping ?? 0),
    num(invoice.discount ?? 0),
  );

  // Map line items to payload format
  const mappedLineItems: KuwaitLineItemPayload[] = parsedItems.map((item) => ({
    descriptionAr: (item.description as string) || "",
    descriptionEn: (item.description as string) || "",
    qty: num(item.qty, KUWAIT_DECIMAL_PLACES).toFixed(KUWAIT_DECIMAL_PLACES),
    price: num(item.price, KUWAIT_DECIMAL_PLACES).toFixed(KUWAIT_DECIMAL_PLACES),
    total: num(item.total ?? num(item.qty) * num(item.price), KUWAIT_DECIMAL_PLACES).toFixed(KUWAIT_DECIMAL_PLACES),
  }));

  return {
    // Header
    invoiceNumber: (invoice.invoiceNumber as string) || "",
    invoiceType,
    invoiceTypeAr: invoiceType === "standard" ? "فاتورة ضريبية" : "فاتورة مبسطة",
    invoiceTypeEn: invoiceType,
    decreeRef: KUWAIT_DECREE_REF,

    // Dates (dual calendar)
    issueDateGregorian: issueDate,
    issueDateHijri: hijriIssue.formatted,
    issueDateDual: dualIssueDate,
    dueDateGregorian: dueDate,
    dueDateHijri: hijriDue.formatted,
    dueDateDual: dualDueDate,

    // Currency
    currency: KUWAIT_CURRENCY,
    currencyDecimalPlaces: KUWAIT_DECIMAL_PLACES,

    // Seller
    sellerNameAr: (company.nameAr as string) || (invoice.sellerNameAr as string) || (company.name as string) || "",
    sellerNameEn: (company.name as string) || "",
    sellerAddressAr: (invoice.sellerAddressAr as string) || (company.address as string) || "",
    sellerAddressEn: (company.address as string) || "",
    sellerMociNumber: (company.mociNumber as string) || (invoice.mociNumber as string) || "",
    sellerCommercialRegistration: (company.commercialRegistration as string) || "",
    sellerVatNumber: (company.vatNumber as string) || null,
    sellerTaxRegistration: (company.vatNumber as string) || null,

    // Buyer
    buyerNameAr: (invoice.buyerNameAr as string) || (invoice.clientName as string) || null,
    buyerNameEn: (invoice.clientName as string) || null,
    buyerAddressAr: (invoice.buyerAddressAr as string) || (invoice.clientAddress as string) || null,
    buyerAddressEn: (invoice.clientAddress as string) || null,
    buyerVatNumber: (invoice.buyerVatNumber as string) || null,
    buyerTaxRegistration: (invoice.buyerTaxRegistration as string) || null,

    // Line items
    lineItems: mappedLineItems,
    lineItemsAr: parsedItemsAr,

    // Totals
    subtotal: totals.subtotal,
    taxRate: totals.taxRate,
    taxAmount: totals.taxAmount,
    total: totals.total,
    shipping: totals.shipping,
    discount: totals.discount,
    paid: num(invoice.paid ?? 0, KUWAIT_DECIMAL_PLACES).toFixed(KUWAIT_DECIMAL_PLACES),

    // Notes
    notesAr: (invoice.notesAr as string) || (invoice.notes as string) || null,
    notesEn: (invoice.notes as string) || null,

    // Authority
    eInvoiceAuthority: KUWAIT_AUTHORITY,
    paymentGatewayLicense: KUWAIT_PAYMENT_GATEWAY_LICENSE,
  };
}

// ── Submission ─────────────────────────────────────────────────────────────

/**
 * submitKuwaitInvoice — Submits an invoice to Kuwait e-invoice portal.
 *
 * Currently placeholder since the portal API hasn't been published yet.
 * The structure is ready to plug in when available.
 * Stores submission in EInvoice table with authorityType="kuwait_decree_10_2026".
 */
export async function submitKuwaitInvoice(
  payload: KuwaitInvoicePayload,
): Promise<KuwaitSubmissionResult> {
  logger.info("[kuwait-e-invoice] submitting invoice", {
    invoiceNumber: payload.invoiceNumber,
    authority: KUWAIT_AUTHORITY,
    decreeRef: payload.decreeRef,
  });

  try {
    // ── Placeholder: Portal API not yet published ────────────────────────
    // When the Kuwait MOCI e-invoice portal API becomes available,
    // this will be replaced with actual HTTP calls to the portal.
    // Expected endpoints:
    //   POST /api/v1/invoices/submit — submit invoice
    //   GET  /api/v1/invoices/{uuid}/status — check status
    //
    // For now, we create a "pending" EInvoice record that will be
    // submitted when the portal is live.

    // Find the invoice by number + company slug
    const invoice = await db.invoice.findFirst({
      where: {
        invoiceNumber: payload.invoiceNumber,
        deletedAt: null,
      },
    });

    if (!invoice) {
      logger.error("[kuwait-e-invoice] invoice not found", { invoiceNumber: payload.invoiceNumber });
      return {
        ok: false,
        submissionStatus: "rejected",
        error: "Invoice not found in database",
      };
    }

    // Create or update EInvoice record
    const existingEInvoice = await db.eInvoice.findUnique({
      where: { invoiceId: invoice.id },
    });

    if (existingEInvoice) {
      // Update existing record
      await db.eInvoice.update({
        where: { id: existingEInvoice.id },
        data: {
          authorityType: KUWAIT_AUTHORITY,
          submissionStatus: "pending",
          rawXml: JSON.stringify(payload),
          updatedAt: new Date(),
        },
      });
      logger.info("[kuwait-e-invoice] updated existing EInvoice record", { eInvoiceId: existingEInvoice.id });

      return {
        ok: true,
        eInvoiceId: existingEInvoice.id,
        submissionStatus: "pending",
      };
    }

    // Create new EInvoice record
    const eInvoice = await db.eInvoice.create({
      data: {
        invoiceId: invoice.id,
        companySlug: invoice.companySlug,
        authorityType: KUWAIT_AUTHORITY,
        submissionStatus: "pending",
        rawXml: JSON.stringify(payload),
      },
    });

    // Update invoice's e-invoice status and authority
    await db.invoice.update({
      where: { id: invoice.id },
      data: {
        eInvoiceStatus: "pending",
        eInvoiceAuthority: KUWAIT_AUTHORITY,
      },
    });

    logger.info("[kuwait-e-invoice] created EInvoice record", { eInvoiceId: eInvoice.id, invoiceNumber: payload.invoiceNumber });

    return {
      ok: true,
      eInvoiceId: eInvoice.id,
      submissionStatus: "pending",
    };
  } catch (err) {
    logger.error("[kuwait-e-invoice] submission failed", {
      err: err instanceof Error ? err.message : String(err),
      invoiceNumber: payload.invoiceNumber,
    });
    return {
      ok: false,
      submissionStatus: "rejected",
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

// ── Status check ───────────────────────────────────────────────────────────

/**
 * checkKuwaitInvoiceStatus — Checks the submission status of a Kuwait e-invoice.
 *
 * Currently returns local DB status since the portal API is not yet published.
 */
export async function checkKuwaitInvoiceStatus(eInvoiceId: number): Promise<{
  status: string;
  authorityType: string;
  rejectionReason?: string;
  submittedAt?: string;
  approvedAt?: string;
}> {
  try {
    const eInvoice = await db.eInvoice.findUnique({
      where: { id: eInvoiceId },
    });

    if (!eInvoice) {
      return {
        status: "not_found",
        authorityType: KUWAIT_AUTHORITY,
        rejectionReason: "EInvoice record not found",
      };
    }

    // ── Placeholder: When portal API is live, this will make actual API calls ──
    // GET /api/v1/invoices/{uuid}/status → update local DB

    return {
      status: eInvoice.submissionStatus,
      authorityType: eInvoice.authorityType,
      rejectionReason: eInvoice.rejectionReason || undefined,
      submittedAt: eInvoice.submittedAt?.toISOString() || undefined,
      approvedAt: eInvoice.approvedAt?.toISOString() || undefined,
    };
  } catch (err) {
    logger.error("[kuwait-e-invoice] status check failed", {
      err: err instanceof Error ? err.message : String(err),
      eInvoiceId,
    });
    return {
      status: "error",
      authorityType: KUWAIT_AUTHORITY,
      rejectionReason: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

// ── Auto-populate Kuwait fields ────────────────────────────────────────────

/**
 * autoPopulateKuwaitFields — Auto-populates Kuwait-specific invoice fields
 * from company settings and Gregorian dates.
 *
 * Called by the invoice validation middleware when creating/updating
 * a Kuwait company invoice.
 */
export function autoPopulateKuwaitFields(
  invoiceData: Record<string, unknown>,
  company: Record<string, unknown>,
): Record<string, unknown> {
  const result = { ...invoiceData };

  // ── 1. Auto-populate Hijri dates ──────────────────────────────────────
  if (invoiceData.issueDate && !invoiceData.hijriIssueDate) {
    result.hijriIssueDate = formatHijri(invoiceData.issueDate as string);
  }
  if (invoiceData.dueDate && !invoiceData.hijriDueDate) {
    result.hijriDueDate = formatHijri(invoiceData.dueDate as string);
  }

  // ── 2. Auto-populate MOCI number from company ─────────────────────────
  if (!invoiceData.mociNumber && company.mociNumber) {
    result.mociNumber = company.mociNumber;
  }

  // ── 3. Auto-populate Arabic seller fields from company ────────────────
  if (!invoiceData.sellerNameAr) {
    result.sellerNameAr = company.nameAr || company.name || "";
  }
  if (!invoiceData.sellerAddressAr) {
    result.sellerAddressAr = company.address || "";
  }

  // ── 4. Auto-populate invoice type ─────────────────────────────────────
  const invoiceType = determineInvoiceType(invoiceData);
  if (!invoiceData.invoiceTypeEn) {
    result.invoiceTypeEn = invoiceType;
  }
  if (!invoiceData.invoiceTypeAr) {
    result.invoiceTypeAr = invoiceType === "standard" ? "فاتورة ضريبية" : "فاتورة مبسطة";
  }

  // ── 5. Enforce KWD currency ───────────────────────────────────────────
  result.currency = KUWAIT_CURRENCY;
  result.currencyDecimalPlaces = KUWAIT_DECIMAL_PLACES;

  // ── 6. Set e-invoice authority ────────────────────────────────────────
  result.eInvoiceAuthority = KUWAIT_AUTHORITY;

  // ── 7. Enforce 3-decimal precision on all monetary fields ─────────────
  for (const field of ["subtotal", "taxAmount", "total", "shipping", "discount", "paid"]) {
    if (result[field] !== undefined && result[field] !== null) {
      result[field] = num(result[field], KUWAIT_DECIMAL_PLACES).toFixed(KUWAIT_DECIMAL_PLACES);
    }
  }

  return result;
}

// ── Utility exports ────────────────────────────────────────────────────────

export { KUWAIT_AUTHORITY, KUWAIT_CURRENCY, KUWAIT_DECIMAL_PLACES, KUWAIT_DECREE_REF, KUWAIT_MAX_FINE_KWD };

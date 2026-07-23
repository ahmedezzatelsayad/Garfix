/**
 * egypt-eta.test.ts — Tests for Egypt ETA e-invoicing compliance module.
 *
 * Covers:
 * - Invoice validation (dual language, TRN, EGP 2 decimals, 14% VAT, export)
 * - Invoice type classification (standard/simplified/export)
 * - Payload generation with dual language, EGP amounts, 14% VAT
 * - Auto-population of ETA-specific fields
 * - Validation middleware integration
 * - UUID generation
 * - Constants validation
 */

import { describe, it, expect } from "bun:test";
import {
  validateEgyptEtaInvoice,
  generateEgyptEtaInvoicePayload,
  determineEgyptEtaInvoiceType,
  autoPopulateEgyptEtaFields,
  generateEgyptEtaUuid,
  EGYPT_ETA_CURRENCY,
  EGYPT_ETA_DECIMAL_PLACES,
  EGYPT_ETA_VAT_RATE,
  EGYPT_ETA_AUTHORITY,
  EGYPT_ETA_REGULATION,
  EGYPT_ETA_MAX_FINE_EGP,
} from "../egypt-eta";
import {
  egyptEtaInvoiceValidationMiddleware,
  applyEgyptEtaCompliance,
  formatEgyptEtaErrorsForResponse,
} from "../egypt-eta-validation";
import { formatHijri, formatDualDate } from "../../hijri";
import { num } from "../../money";

// ── Test fixtures ──────────────────────────────────────────────────────────

const egyptCompany = {
  id: 1,
  slug: "egypt-trading",
  name: "Egypt Trading Co.",
  nameAr: "شركة التجارة المصرية",
  country: "EG",
  currency: "EGP",
  vatNumber: "TRN-EG-300123456",
  address: "شارع النيل، القاهرة، مصر",
  addressAr: "شارع النيل، القاهرة، مصر",
  commercialRegistration: "CR-EG-2023-001",
  defaultTaxRate: "14",
  recordRetentionYears: 5,
};

const egyptCompanyMinimal = {
  id: 2,
  slug: "egypt-minimal",
  name: "Egypt Minimal",
  nameAr: "مصر minimal",
  country: "EG",
  vatNumber: "TRN-EG-100000001",
  address: "Cairo, Egypt",
  addressAr: "القاهرة، مصر",
  defaultTaxRate: "14",
};

const nonEgyptCompany = {
  id: 3,
  slug: "saudi-trading",
  name: "Saudi Trading Co.",
  nameAr: "شركة التجارة السعودية",
  country: "SA",
  currency: "SAR",
  vatNumber: "VAT-SA-12345",
  address: "الرياض، السعودية",
  defaultTaxRate: "15",
};

const validEgyptInvoice = {
  invoiceNumber: "INV-2022-001",
  issueDate: "2022-01-15",
  dueDate: "2022-02-15",
  clientName: "Ahmad Al-Nile",
  clientNameAr: "أحمد النيل",
  sellerNameAr: "شركة التجارة المصرية",
  sellerNameEn: "Egypt Trading Co.",
  sellerAddressAr: "شارع النيل، القاهرة، مصر",
  sellerAddressEn: "Nile Street, Cairo, Egypt",
  sellerTaxRegistrationNumber: "TRN-EG-300123456",
  currency: "EGP",
  currencyDecimalPlaces: 2,
  invoiceTypeEn: "simplified",
  invoiceTypeAr: "إيصال إلكتروني",
  taxRate: "14.00",
  subtotal: "500.00",
  taxAmount: "70.00",
  total: "570.00",
  shipping: "0.00",
  discount: "0.00",
  paid: "0.00",
  lineItems: JSON.stringify([
    { description: "Design Service", qty: 1, price: 500, total: 500 },
  ]),
  notes: "Thank you",
  notesAr: "شكراً لكم",
};

const validEgyptB2bInvoice = {
  ...validEgyptInvoice,
  invoiceTypeEn: "standard",
  invoiceTypeAr: "فاتورة ضريبية",
  buyerNameAr: "أحمد النيل",
  buyerNameEn: "Ahmad Al-Nile",
  buyerAddressAr: "شارع النيل، القاهرة",
  buyerAddressEn: "Nile Street, Cairo",
  buyerTaxRegistrationNumber: "TRN-EG-300987654",
  clientId: 5,
};

const validEgyptExportInvoice = {
  ...validEgyptInvoice,
  invoiceTypeEn: "export",
  invoiceTypeAr: "فاتورة تصدير",
  isExport: true,
  buyerNameAr: "شركة التصدير الدولية",
  buyerNameEn: "International Export Co.",
  taxRate: "0.00",
  taxAmount: "0.00",
  total: "500.00",
};

// ── UUID Generation Tests ──────────────────────────────────────────────────

describe("generateEgyptEtaUuid", () => {
  it("should generate a valid UUID v4 format", () => {
    const uuid = generateEgyptEtaUuid();
    expect(uuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  });

  it("should generate unique UUIDs", () => {
    const uuid1 = generateEgyptEtaUuid();
    const uuid2 = generateEgyptEtaUuid();
    expect(uuid1).not.toBe(uuid2);
  });

  it("should generate UUIDs of correct length", () => {
    const uuid = generateEgyptEtaUuid();
    expect(uuid.length).toBe(36);
  });
});

// ── Invoice Type Classification Tests ──────────────────────────────────────

describe("determineEgyptEtaInvoiceType", () => {
  it("should classify as simplified (B2C) by default", () => {
    const result = determineEgyptEtaInvoiceType({});
    expect(result).toBe("simplified");
  });

  it("should classify as standard (B2B) when clientId is present", () => {
    const result = determineEgyptEtaInvoiceType({ clientId: 5 });
    expect(result).toBe("standard");
  });

  it("should classify as standard (B2B) when buyerVatNumber is present", () => {
    const result = determineEgyptEtaInvoiceType({ buyerVatNumber: "TRN-123" });
    expect(result).toBe("standard");
  });

  it("should classify as standard (B2B) when buyerTaxRegistrationNumber is present", () => {
    const result = determineEgyptEtaInvoiceType({ buyerTaxRegistrationNumber: "TRN-456" });
    expect(result).toBe("standard");
  });

  it("should classify as export when isExport is true", () => {
    const result = determineEgyptEtaInvoiceType({ isExport: true });
    expect(result).toBe("export");
  });

  it("should respect explicit invoiceTypeEn=standard", () => {
    const result = determineEgyptEtaInvoiceType({ invoiceTypeEn: "standard" });
    expect(result).toBe("standard");
  });

  it("should respect explicit invoiceTypeEn=simplified", () => {
    const result = determineEgyptEtaInvoiceType({ invoiceTypeEn: "simplified" });
    expect(result).toBe("simplified");
  });

  it("should respect explicit invoiceTypeEn=export", () => {
    const result = determineEgyptEtaInvoiceType({ invoiceTypeEn: "export" });
    expect(result).toBe("export");
  });

  it("should respect Arabic invoice type فاتورة ضريبية", () => {
    const result = determineEgyptEtaInvoiceType({ invoiceTypeAr: "فاتورة ضريبية" });
    expect(result).toBe("standard");
  });

  it("should respect Arabic invoice type إيصال إلكتروني", () => {
    const result = determineEgyptEtaInvoiceType({ invoiceTypeAr: "إيصال إلكتروني" });
    expect(result).toBe("simplified");
  });

  it("should respect Arabic invoice type فاتورة تصدير", () => {
    const result = determineEgyptEtaInvoiceType({ invoiceTypeAr: "فاتورة تصدير" });
    expect(result).toBe("export");
  });
});

// ── Validation Tests ──────────────────────────────────────────────────────

describe("validateEgyptEtaInvoice", () => {
  it("should return valid for a compliant Egypt simplified invoice", () => {
    const result = validateEgyptEtaInvoice(validEgyptInvoice, egyptCompany);
    expect(result.valid).toBe(true);
    expect(result.errors.length).toBe(0);
  });

  it("should pass validation for non-Egypt companies", () => {
    const result = validateEgyptEtaInvoice({}, nonEgyptCompany);
    expect(result.valid).toBe(true);
    expect(result.errors.length).toBe(0);
  });

  it("should fail when seller TRN is missing", () => {
    const company = { ...egyptCompany, vatNumber: undefined };
    const invoice = { ...validEgyptInvoice, sellerTaxRegistrationNumber: undefined };
    const result = validateEgyptEtaInvoice(invoice, company);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.field === "sellerTaxRegistrationNumber")).toBe(true);
    expect(result.errors.some((e) => e.messageAr.includes("مصلحة الضرائب"))).toBe(true);
  });

  it("should fail when seller Arabic name is missing", () => {
    const company = { ...egyptCompany, nameAr: undefined };
    const invoice = { ...validEgyptInvoice, sellerNameAr: undefined };
    const result = validateEgyptEtaInvoice(invoice, company);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.field === "sellerNameAr")).toBe(true);
  });

  it("should fail when seller English name is missing", () => {
    const company = { ...egyptCompany, name: undefined };
    const invoice = { ...validEgyptInvoice, sellerNameEn: undefined };
    const result = validateEgyptEtaInvoice(invoice, company);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.field === "sellerNameEn")).toBe(true);
  });

  it("should fail when seller Arabic address is missing", () => {
    const company = { ...egyptCompany, addressAr: undefined, address: undefined };
    const invoice = { ...validEgyptInvoice, sellerAddressAr: undefined };
    const result = validateEgyptEtaInvoice(invoice, company);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.field === "sellerAddressAr")).toBe(true);
  });

  it("should fail when seller English address is missing", () => {
    const company = { ...egyptCompany, address: undefined };
    const invoice = { ...validEgyptInvoice, sellerAddressEn: undefined };
    const result = validateEgyptEtaInvoice(invoice, company);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.field === "sellerAddressEn")).toBe(true);
  });

  it("should require buyer TRN for standard (B2B) invoices", () => {
    const invoice = {
      ...validEgyptInvoice,
      invoiceTypeEn: "standard",
      buyerNameAr: "أحمد النيل",
      buyerNameEn: "Ahmad Al-Nile",
      buyerAddressAr: "القاهرة",
      buyerAddressEn: "Cairo",
    };
    const result = validateEgyptEtaInvoice(invoice, egyptCompany);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.field === "buyerTaxRegistrationNumber")).toBe(true);
  });

  it("should require buyer Arabic name for B2B invoices", () => {
    const invoice = {
      ...validEgyptInvoice,
      invoiceTypeEn: "standard",
      buyerNameEn: "Ahmad",
      buyerTaxRegistrationNumber: "TRN-123",
      buyerAddressAr: "القاهرة",
      buyerAddressEn: "Cairo",
    };
    const result = validateEgyptEtaInvoice(invoice, egyptCompany);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.field === "buyerNameAr")).toBe(true);
  });

  it("should not require buyer TRN for simplified (B2C) invoices", () => {
    const result = validateEgyptEtaInvoice(validEgyptInvoice, egyptCompany);
    expect(result.errors.some((e) => e.field === "buyerTaxRegistrationNumber")).toBe(false);
  });

  it("should fail when currency is not EGP", () => {
    const invoice = { ...validEgyptInvoice, currency: "USD" };
    const result = validateEgyptEtaInvoice(invoice, egyptCompany);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.field === "currency")).toBe(true);
    expect(result.errors.some((e) => e.messageAr.includes("جنيه مصري"))).toBe(true);
  });

  it("should fail when decimal places are not 2", () => {
    const invoice = { ...validEgyptInvoice, currencyDecimalPlaces: 3 };
    const result = validateEgyptEtaInvoice(invoice, egyptCompany);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.field === "currencyDecimalPlaces")).toBe(true);
  });

  it("should fail when VAT rate is not 14% for standard invoices", () => {
    const invoice = { ...validEgyptInvoice, taxRate: "5.00" };
    const result = validateEgyptEtaInvoice(invoice, egyptCompany);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.field === "taxRate")).toBe(true);
    expect(result.errors.some((e) => e.messageAr.includes("14%"))).toBe(true);
  });

  it("should allow 0% VAT rate (for exempt items)", () => {
    const invoice = { ...validEgyptInvoice, taxRate: "0.00" };
    const result = validateEgyptEtaInvoice(invoice, egyptCompany);
    // 0% is allowed — it's exempt, not an error
    expect(result.errors.some((e) => e.field === "taxRate")).toBe(false);
  });

  it("should require 0% VAT for export invoices", () => {
    const invoice = {
      ...validEgyptInvoice,
      invoiceTypeEn: "export",
      isExport: true,
      buyerNameAr: "شركة التصدير",
      taxRate: "14.00",
    };
    const result = validateEgyptEtaInvoice(invoice, egyptCompany);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.field === "taxRate")).toBe(true);
    expect(result.errors.some((e) => e.messageAr.includes("تصدير"))).toBe(true);
  });

  it("should pass validation for export invoice with 0% VAT", () => {
    const result = validateEgyptEtaInvoice(validEgyptExportInvoice, egyptCompany);
    expect(result.errors.some((e) => e.field === "taxRate")).toBe(false);
  });

  it("should include retention warning for Egyptian invoices", () => {
    const result = validateEgyptEtaInvoice(validEgyptInvoice, egyptCompany);
    expect(result.warnings.some((w) => w.field === "recordRetention")).toBe(true);
    expect(result.warnings.some((w) => w.messageAr.includes("5 سنوات"))).toBe(true);
    expect(result.warnings.some((w) => w.messageAr.includes("500,000"))).toBe(true);
  });

  it("should include ETA portal registration warning", () => {
    const result = validateEgyptEtaInvoice(validEgyptInvoice, egyptCompany);
    expect(result.warnings.some((w) => w.field === "etaPortalRegistration")).toBe(true);
    expect(result.warnings.some((w) => w.messageAr.includes("بوابة مصلحة الضرائب"))).toBe(true);
  });

  it("should include digital receipt warning for B2C invoices", () => {
    const result = validateEgyptEtaInvoice(validEgyptInvoice, egyptCompany);
    expect(result.warnings.some((w) => w.field === "digitalReceipt")).toBe(true);
    expect(result.warnings.some((w) => w.messageAr.includes("إيصال"))).toBe(true);
  });
});

// ── Payload Generation Tests ───────────────────────────────────────────────

describe("generateEgyptEtaInvoicePayload", () => {
  it("should generate a complete ETA invoice payload", () => {
    const payload = generateEgyptEtaInvoicePayload(validEgyptInvoice, egyptCompany);
    expect(payload.invoiceNumber).toBe("INV-2022-001");
    expect(payload.currency).toBe(EGYPT_ETA_CURRENCY);
    expect(payload.currencyDecimalPlaces).toBe(EGYPT_ETA_DECIMAL_PLACES);
    expect(payload.eInvoiceAuthority).toBe(EGYPT_ETA_AUTHORITY);
  });

  it("should include dual language seller fields", () => {
    const payload = generateEgyptEtaInvoicePayload(validEgyptInvoice, egyptCompany);
    expect(payload.sellerNameAr).toBe("شركة التجارة المصرية");
    expect(payload.sellerNameEn).toBe("Egypt Trading Co.");
    expect(payload.sellerAddressAr).toBeTruthy();
    expect(payload.sellerAddressEn).toBeTruthy();
  });

  it("should include seller TRN", () => {
    const payload = generateEgyptEtaInvoicePayload(validEgyptInvoice, egyptCompany);
    expect(payload.sellerTaxRegistrationNumber).toBe("TRN-EG-300123456");
  });

  it("should include both Gregorian and Hijri dates", () => {
    const payload = generateEgyptEtaInvoicePayload(validEgyptInvoice, egyptCompany);
    expect(payload.issueDateGregorian).toBe("2022-01-15");
    expect(payload.issueDateHijri).toBeTruthy();
    expect(payload.issueDateDual).toBeTruthy();
  });

  it("should format amounts with EGP 2-decimal precision", () => {
    const payload = generateEgyptEtaInvoicePayload(validEgyptInvoice, egyptCompany);
    expect(payload.subtotal).toMatch(/^\d+\.\d{2}$/);
    expect(payload.total).toMatch(/^\d+\.\d{2}$/);
    expect(payload.taxAmount).toMatch(/^\d+\.\d{2}$/);
  });

  it("should set 14% VAT rate for standard/simplified invoices", () => {
    const payload = generateEgyptEtaInvoicePayload(validEgyptInvoice, egyptCompany);
    expect(payload.taxRate).toBe("14.00");
  });

  it("should set 0% VAT rate for export invoices", () => {
    const payload = generateEgyptEtaInvoicePayload(validEgyptExportInvoice, egyptCompany);
    expect(payload.taxRate).toBe("0.00");
    expect(payload.isExport).toBe(true);
  });

  it("should set invoice type labels correctly for simplified", () => {
    const payload = generateEgyptEtaInvoicePayload(validEgyptInvoice, egyptCompany);
    expect(payload.invoiceType).toBe("simplified");
    expect(payload.invoiceTypeAr).toBe("إيصال إلكتروني");
    expect(payload.invoiceTypeEn).toBe("simplified");
    expect(payload.digitalReceipt).toBe(true);
  });

  it("should set invoice type labels correctly for standard", () => {
    const payload = generateEgyptEtaInvoicePayload(validEgyptB2bInvoice, egyptCompany);
    expect(payload.invoiceType).toBe("standard");
    expect(payload.invoiceTypeAr).toBe("فاتورة ضريبية");
    expect(payload.invoiceTypeEn).toBe("standard");
  });

  it("should set invoice type labels correctly for export", () => {
    const payload = generateEgyptEtaInvoicePayload(validEgyptExportInvoice, egyptCompany);
    expect(payload.invoiceType).toBe("export");
    expect(payload.invoiceTypeAr).toBe("فاتورة تصدير");
    expect(payload.invoiceTypeEn).toBe("export");
    expect(payload.isExport).toBe(true);
  });

  it("should set EG as seller country code", () => {
    const payload = generateEgyptEtaInvoicePayload(validEgyptInvoice, egyptCompany);
    expect(payload.sellerCountryCode).toBe("EG");
  });
});

// ── Auto-population Tests ──────────────────────────────────────────────────

describe("autoPopulateEgyptEtaFields", () => {
  it("should auto-populate UUID", () => {
    const invoiceData = { issueDate: "2022-01-15", dueDate: "2022-02-15" };
    const result = autoPopulateEgyptEtaFields(invoiceData, egyptCompany);
    expect(result.uuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  });

  it("should not overwrite existing UUID", () => {
    const invoiceData = { issueDate: "2022-01-15", uuid: "existing-uuid" };
    const result = autoPopulateEgyptEtaFields(invoiceData, egyptCompany);
    expect(result.uuid).toBe("existing-uuid");
  });

  it("should auto-populate Hijri dates from Gregorian dates", () => {
    const invoiceData = { issueDate: "2022-01-15", dueDate: "2022-02-15" };
    const result = autoPopulateEgyptEtaFields(invoiceData, egyptCompany);
    expect(result.hijriIssueDate).toBeTruthy();
    expect(result.hijriDueDate).toBeTruthy();
    expect(result.hijriIssueDate).toBe(formatHijri("2022-01-15"));
  });

  it("should auto-populate seller TRN from company", () => {
    const invoiceData = { issueDate: "2022-01-15" };
    const result = autoPopulateEgyptEtaFields(invoiceData, egyptCompany);
    expect(result.sellerTaxRegistrationNumber).toBe("TRN-EG-300123456");
  });

  it("should auto-populate Arabic seller name from company", () => {
    const invoiceData = { issueDate: "2022-01-15" };
    const result = autoPopulateEgyptEtaFields(invoiceData, egyptCompany);
    expect(result.sellerNameAr).toBe("شركة التجارة المصرية");
  });

  it("should auto-populate English seller name from company", () => {
    const invoiceData = { issueDate: "2022-01-15" };
    const result = autoPopulateEgyptEtaFields(invoiceData, egyptCompany);
    expect(result.sellerNameEn).toBe("Egypt Trading Co.");
  });

  it("should auto-populate invoice type as simplified for B2C", () => {
    const invoiceData = { issueDate: "2022-01-15" };
    const result = autoPopulateEgyptEtaFields(invoiceData, egyptCompany);
    expect(result.invoiceTypeEn).toBe("simplified");
    expect(result.invoiceTypeAr).toBe("إيصال إلكتروني");
    expect(result.digitalReceipt).toBe(true);
  });

  it("should auto-populate invoice type as standard for B2B", () => {
    const invoiceData = { issueDate: "2022-01-15", clientId: 5 };
    const result = autoPopulateEgyptEtaFields(invoiceData, egyptCompany);
    expect(result.invoiceTypeEn).toBe("standard");
    expect(result.invoiceTypeAr).toBe("فاتورة ضريبية");
  });

  it("should enforce EGP currency", () => {
    const invoiceData = { issueDate: "2022-01-15", currency: "USD" };
    const result = autoPopulateEgyptEtaFields(invoiceData, egyptCompany);
    expect(result.currency).toBe("EGP");
  });

  it("should enforce 2 decimal places", () => {
    const invoiceData = { issueDate: "2022-01-15" };
    const result = autoPopulateEgyptEtaFields(invoiceData, egyptCompany);
    expect(result.currencyDecimalPlaces).toBe(2);
  });

  it("should enforce 2-decimal precision on monetary fields", () => {
    const invoiceData = {
      issueDate: "2022-01-15",
      subtotal: "500",
      total: "570",
      taxAmount: "70",
    };
    const result = autoPopulateEgyptEtaFields(invoiceData, egyptCompany);
    expect(result.subtotal).toBe("500.00");
    expect(result.total).toBe("570.00");
    expect(result.taxAmount).toBe("70.00");
  });

  it("should enforce 14% VAT rate for non-export invoices", () => {
    const invoiceData = { issueDate: "2022-01-15" };
    const result = autoPopulateEgyptEtaFields(invoiceData, egyptCompany);
    expect(result.taxRate).toBe("14.00");
  });

  it("should enforce 0% VAT rate for export invoices", () => {
    const invoiceData = { issueDate: "2022-01-15", invoiceTypeEn: "export" };
    const result = autoPopulateEgyptEtaFields(invoiceData, egyptCompany);
    expect(result.taxRate).toBe("0.00");
    expect(result.isExport).toBe(true);
  });

  it("should set e-invoice authority", () => {
    const invoiceData = { issueDate: "2022-01-15" };
    const result = autoPopulateEgyptEtaFields(invoiceData, egyptCompany);
    expect(result.eInvoiceAuthority).toBe("eta_egypt");
  });

  it("should set PIH placeholder", () => {
    const invoiceData = { issueDate: "2022-01-15" };
    const result = autoPopulateEgyptEtaFields(invoiceData, egyptCompany);
    expect(result.previousInvoiceHash).toBe("");
  });
});

// ── Validation Middleware Tests ────────────────────────────────────────────

describe("egyptEtaInvoiceValidationMiddleware", () => {
  it("should pass through non-Egypt companies without validation", () => {
    const result = egyptEtaInvoiceValidationMiddleware({}, nonEgyptCompany);
    expect(result.valid).toBe(true);
    expect(result.blockingErrors.length).toBe(0);
    expect(result.warnings.length).toBe(0);
  });

  it("should block Egyptian invoice when seller TRN is missing", () => {
    const company = { ...egyptCompany, vatNumber: undefined };
    const invoice = { ...validEgyptInvoice, sellerTaxRegistrationNumber: undefined };
    const result = egyptEtaInvoiceValidationMiddleware(invoice, company);
    expect(result.valid).toBe(false);
    expect(result.blockingErrors.some((e) => e.field === "sellerTaxRegistrationNumber")).toBe(true);
  });

  it("should override non-EGP currency for Egyptian companies", () => {
    const invoiceData = {
      invoiceNumber: "INV-001",
      issueDate: "2022-01-15",
      dueDate: "2022-02-15",
      currency: "USD",
      taxRate: "14.00",
      sellerNameAr: "شركة التجارة المصرية",
      sellerNameEn: "Egypt Trading Co.",
      sellerAddressAr: "القاهرة",
      sellerAddressEn: "Cairo",
      sellerTaxRegistrationNumber: "TRN-EG-123",
    };
    const result = egyptEtaInvoiceValidationMiddleware(invoiceData, egyptCompany);
    expect(result.enrichedData.currency).toBe("EGP");
    expect(result.enrichedData.currencyDecimalPlaces).toBe(2);
  });

  it("should enforce 14% VAT rate for Egyptian companies", () => {
    const invoiceData = {
      invoiceNumber: "INV-001",
      issueDate: "2022-01-15",
      dueDate: "2022-02-15",
      taxRate: "5",
      sellerNameAr: "شركة التجارة المصرية",
      sellerNameEn: "Egypt Trading Co.",
      sellerAddressAr: "القاهرة",
      sellerAddressEn: "Cairo",
      sellerTaxRegistrationNumber: "TRN-EG-123",
    };
    const result = egyptEtaInvoiceValidationMiddleware(invoiceData, egyptCompany);
    expect(result.enrichedData.taxRate).toBe("14.00");
  });

  it("should enforce 0% VAT for export invoices", () => {
    const invoiceData = {
      invoiceNumber: "INV-001",
      issueDate: "2022-01-15",
      dueDate: "2022-02-15",
      taxRate: "14",
      invoiceTypeEn: "export",
      isExport: true,
      sellerNameAr: "شركة التجارة المصرية",
      sellerNameEn: "Egypt Trading Co.",
      sellerAddressAr: "القاهرة",
      sellerAddressEn: "Cairo",
      sellerTaxRegistrationNumber: "TRN-EG-123",
      buyerNameAr: "شركة التصدير",
    };
    const result = egyptEtaInvoiceValidationMiddleware(invoiceData, egyptCompany);
    expect(result.enrichedData.taxRate).toBe("0.00");
  });

  it("should auto-populate ETA fields during middleware processing", () => {
    const invoiceData = {
      invoiceNumber: "INV-001",
      issueDate: "2022-01-15",
      dueDate: "2022-02-15",
    };
    const result = egyptEtaInvoiceValidationMiddleware(invoiceData, egyptCompany);
    expect(result.enrichedData.uuid).toBeTruthy();
    expect(result.enrichedData.eInvoiceAuthority).toBe("eta_egypt");
    expect(result.enrichedData.currency).toBe("EGP");
  });
});

// ── applyEgyptEtaCompliance identity test ──────────────────────────────────

describe("applyEgyptEtaCompliance", () => {
  it("should return same result as middleware", () => {
    const invoiceData1 = { invoiceNumber: "INV-001", issueDate: "2022-01-15" };
    const invoiceData2 = { invoiceNumber: "INV-001", issueDate: "2022-01-15" };
    const middlewareResult = egyptEtaInvoiceValidationMiddleware(invoiceData1, egyptCompany);
    const applyResult = applyEgyptEtaCompliance(invoiceData2, egyptCompany);
    expect(applyResult.valid).toBe(middlewareResult.valid);
    expect(applyResult.blockingErrors).toEqual(middlewareResult.blockingErrors);
  });
});

// ── Format Errors Tests ────────────────────────────────────────────────────

describe("formatEgyptEtaErrorsForResponse", () => {
  it("should return empty error when no blocking errors", () => {
    const result = formatEgyptEtaErrorsForResponse({
      valid: true,
      enrichedData: {},
      blockingErrors: [],
      warnings: [],
    });
    expect(result.error).toBe("");
    expect(result.details).toEqual({});
  });

  it("should format Arabic error messages for API response", () => {
    const result = formatEgyptEtaErrorsForResponse({
      valid: false,
      enrichedData: {},
      blockingErrors: [
        { field: "sellerTaxRegistrationNumber", messageAr: "الرقم الضريبي للبائع مطلوب — مصلحة الضرائب المصرية", messageEn: "Seller TRN required — ETA Egypt" },
      ],
      warnings: [],
    });
    expect(result.error).toContain("مصلحة الضرائب");
    expect(result.details.regulation).toBe("eta_egypt");
  });

  it("should include errorsAr and errorsEn arrays in details", () => {
    const result = formatEgyptEtaErrorsForResponse({
      valid: false,
      enrichedData: {},
      blockingErrors: [
        { field: "vatNumber", messageAr: "الرقم الضريبي مطلوب", messageEn: "TRN required" },
        { field: "currency", messageAr: "يجب أن تكون العملة جنيه مصري", messageEn: "Currency must be EGP" },
      ],
      warnings: [],
    });
    expect((result.details as Record<string, unknown>).errorsAr).toBeTruthy();
    expect((result.details as Record<string, unknown>).errorsEn).toBeTruthy();
  });
});

// ── Constants Validation Tests ──────────────────────────────────────────────

describe("Egypt ETA constants", () => {
  it("should have correct authority", () => {
    expect(EGYPT_ETA_AUTHORITY).toBe("eta_egypt");
  });

  it("should have correct currency", () => {
    expect(EGYPT_ETA_CURRENCY).toBe("EGP");
  });

  it("should have correct decimal places", () => {
    expect(EGYPT_ETA_DECIMAL_PLACES).toBe(2);
  });

  it("should have correct VAT rate", () => {
    expect(EGYPT_ETA_VAT_RATE).toBe(14);
  });

  it("should have correct regulation name", () => {
    expect(EGYPT_ETA_REGULATION).toBe("ETA Egypt e-invoicing");
  });

  it("should have correct max fine", () => {
    expect(EGYPT_ETA_MAX_FINE_EGP).toBe(500000);
  });
});

// ── Money/EGP 2-decimal integration tests ──────────────────────────────────

describe("Money/EGP 2-decimal integration", () => {
  it("should format EGP with 2 decimal places", () => {
    const formatted = num(100, 2).toFixed(2);
    expect(formatted).toBe("100.00");
  });

  it("should handle EGP amounts with existing decimals", () => {
    const formatted = num(100.50, 2).toFixed(2);
    expect(formatted).toBe("100.50");
  });

  it("should handle small EGP amounts correctly", () => {
    const formatted = num(0.01, 2).toFixed(2);
    expect(formatted).toBe("0.01");
  });
});

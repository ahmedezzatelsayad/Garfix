/**
 * bahrain-nbr.test.ts — Tests for Bahrain NBR e-invoicing compliance module.
 *
 * Covers:
 * - Invoice validation (dual language, TRN, BHD 3 decimals, 10% VAT)
 * - Invoice type classification (standard/simplified)
 * - Payload generation with BHD amounts, 10% VAT
 * - Auto-population of NBR-specific fields
 * - UUID generation
 * - Constants validation
 */

import { describe, it, expect } from "bun:test";
import {
  validateBahrainNbrInvoice,
  generateBahrainNbrInvoicePayload,
  determineBahrainNbrInvoiceType,
  autoPopulateBahrainNbrFields,
  generateBahrainNbrUuid,
  BAHRAIN_NBR_CURRENCY,
  BAHRAIN_NBR_DECIMAL_PLACES,
  BAHRAIN_NBR_VAT_RATE,
  BAHRAIN_NBR_AUTHORITY,
  BAHRAIN_NBR_REGULATION,
  BAHRAIN_NBR_MAX_FINE_BHD,
} from "../bahrain-nbr";
import { formatHijri, formatDualDate } from "../../hijri";
import { num } from "../../money";

// ── Test fixtures ──────────────────────────────────────────────────────────

const bahrainCompany = {
  id: 1,
  slug: "bahrain-trading",
  name: "Bahrain Trading Co.",
  nameAr: "شركة التجارة البحرينية",
  country: "BH",
  currency: "BHD",
  vatNumber: "TRN-BH-300123456",
  address: "Manama, Bahrain",
  addressAr: "المنامة، مملكة البحرين",
  commercialRegistration: "CR-BH-2023-001",
  defaultTaxRate: "10",
  recordRetentionYears: 5,
};

const nonBahrainCompany = {
  id: 2,
  slug: "saudi-trading",
  name: "Saudi Trading Co.",
  nameAr: "شركة التجارة السعودية",
  country: "SA",
  currency: "SAR",
  vatNumber: "VAT-SA-12345",
  address: "الرياض، السعودية",
  defaultTaxRate: "15",
};

const validBahrainInvoice = {
  invoiceNumber: "INV-2023-001",
  issueDate: "2023-01-15",
  dueDate: "2023-02-15",
  clientName: "Ahmad Al-Manama",
  sellerNameAr: "شركة التجارة البحرينية",
  sellerNameEn: "Bahrain Trading Co.",
  sellerAddressAr: "المنامة، مملكة البحرين",
  sellerAddressEn: "Manama, Bahrain",
  vatNumber: "TRN-BH-300123456",
  currency: "BHD",
  currencyDecimalPlaces: 3,
  invoiceTypeEn: "simplified",
  invoiceTypeAr: "فاتورة مبسطة",
  taxRate: "10.000",
  subtotal: "100.000",
  taxAmount: "10.000",
  total: "110.000",
  shipping: "0.000",
  discount: "0.000",
  paid: "0.000",
  lineItems: JSON.stringify([
    { description: "Design Service", qty: 1, price: 100, total: 100 },
  ]),
  notes: "Thank you",
  notesAr: "شكراً لكم",
};

const validBahrainB2bInvoice = {
  ...validBahrainInvoice,
  invoiceTypeEn: "standard",
  invoiceTypeAr: "فاتورة ضريبية",
  buyerNameAr: "أحمد المنامة",
  buyerNameEn: "Ahmad Al-Manama",
  buyerAddressAr: "المنامة، البحرين",
  buyerAddressEn: "Manama, Bahrain",
  buyerVatNumber: "TRN-BH-300987654",
  clientId: 5,
};

// ── UUID Generation Tests ──────────────────────────────────────────────────

describe("generateBahrainNbrUuid", () => {
  it("should generate a valid UUID v4 format", () => {
    const uuid = generateBahrainNbrUuid();
    expect(uuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  });

  it("should generate unique UUIDs", () => {
    const uuid1 = generateBahrainNbrUuid();
    const uuid2 = generateBahrainNbrUuid();
    expect(uuid1).not.toBe(uuid2);
  });
});

// ── Invoice Type Classification Tests ──────────────────────────────────────

describe("determineBahrainNbrInvoiceType", () => {
  it("should classify as simplified (B2C) by default", () => {
    const result = determineBahrainNbrInvoiceType({});
    expect(result).toBe("simplified");
  });

  it("should classify as standard (B2B) when clientId is present", () => {
    const result = determineBahrainNbrInvoiceType({ clientId: 5 });
    expect(result).toBe("standard");
  });

  it("should classify as standard (B2B) when buyerVatNumber is present", () => {
    const result = determineBahrainNbrInvoiceType({ buyerVatNumber: "TRN-123" });
    expect(result).toBe("standard");
  });

  it("should respect explicit invoiceTypeEn=standard", () => {
    const result = determineBahrainNbrInvoiceType({ invoiceTypeEn: "standard" });
    expect(result).toBe("standard");
  });

  it("should respect explicit invoiceTypeEn=simplified", () => {
    const result = determineBahrainNbrInvoiceType({ invoiceTypeEn: "simplified" });
    expect(result).toBe("simplified");
  });

  it("should respect Arabic invoice type", () => {
    expect(determineBahrainNbrInvoiceType({ invoiceTypeAr: "فاتورة ضريبية" })).toBe("standard");
    expect(determineBahrainNbrInvoiceType({ invoiceTypeAr: "فاتورة مبسطة" })).toBe("simplified");
  });
});

// ── Validation Tests ──────────────────────────────────────────────────────

describe("validateBahrainNbrInvoice", () => {
  it("should return valid for a compliant Bahrain simplified invoice", () => {
    const result = validateBahrainNbrInvoice(validBahrainInvoice, bahrainCompany);
    expect(result.valid).toBe(true);
    expect(result.errors.length).toBe(0);
  });

  it("should pass validation for non-Bahrain companies", () => {
    const result = validateBahrainNbrInvoice({}, nonBahrainCompany);
    expect(result.valid).toBe(true);
    expect(result.errors.length).toBe(0);
  });

  it("should fail when seller VAT TRN is missing", () => {
    const company = { ...bahrainCompany, vatNumber: undefined };
    const invoice = { ...validBahrainInvoice, vatNumber: undefined };
    const result = validateBahrainNbrInvoice(invoice, company);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.field === "vatNumber")).toBe(true);
    expect(result.errors.some((e) => e.messageAr.includes("هيئة الإيرادات الوطنية"))).toBe(true);
  });

  it("should fail when seller Arabic name is missing", () => {
    const company = { ...bahrainCompany, nameAr: undefined };
    const invoice = { ...validBahrainInvoice, sellerNameAr: undefined };
    const result = validateBahrainNbrInvoice(invoice, company);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.field === "sellerNameAr")).toBe(true);
  });

  it("should fail when seller English name is missing", () => {
    const company = { ...bahrainCompany, name: undefined };
    const invoice = { ...validBahrainInvoice, sellerNameEn: undefined };
    const result = validateBahrainNbrInvoice(invoice, company);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.field === "sellerNameEn")).toBe(true);
  });

  it("should fail when seller Arabic address is missing", () => {
    const company = { ...bahrainCompany, addressAr: undefined, address: undefined };
    const invoice = { ...validBahrainInvoice, sellerAddressAr: undefined };
    const result = validateBahrainNbrInvoice(invoice, company);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.field === "sellerAddressAr")).toBe(true);
  });

  it("should fail when seller English address is missing", () => {
    const company = { ...bahrainCompany, address: undefined };
    const invoice = { ...validBahrainInvoice, sellerAddressEn: undefined };
    const result = validateBahrainNbrInvoice(invoice, company);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.field === "sellerAddressEn")).toBe(true);
  });

  it("should require buyer TRN for standard (B2B) invoices", () => {
    const invoice = {
      ...validBahrainInvoice,
      invoiceTypeEn: "standard",
      buyerNameAr: "أحمد المنامة",
      buyerNameEn: "Ahmad",
      buyerAddressAr: "المنامة",
      buyerAddressEn: "Manama",
    };
    const result = validateBahrainNbrInvoice(invoice, bahrainCompany);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.field === "buyerVatNumber")).toBe(true);
  });

  it("should require buyer Arabic name for B2B invoices", () => {
    const invoice = {
      ...validBahrainInvoice,
      invoiceTypeEn: "standard",
      buyerNameEn: "Ahmad",
      buyerVatNumber: "TRN-123",
      buyerAddressAr: "المنامة",
      buyerAddressEn: "Manama",
    };
    const result = validateBahrainNbrInvoice(invoice, bahrainCompany);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.field === "buyerNameAr")).toBe(true);
  });

  it("should not require buyer TRN for simplified (B2C) invoices", () => {
    const result = validateBahrainNbrInvoice(validBahrainInvoice, bahrainCompany);
    expect(result.errors.some((e) => e.field === "buyerVatNumber")).toBe(false);
  });

  it("should fail when currency is not BHD", () => {
    const invoice = { ...validBahrainInvoice, currency: "USD" };
    const result = validateBahrainNbrInvoice(invoice, bahrainCompany);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.field === "currency")).toBe(true);
    expect(result.errors.some((e) => e.messageAr.includes("دينار بحريني"))).toBe(true);
  });

  it("should fail when decimal places are not 3", () => {
    const invoice = { ...validBahrainInvoice, currencyDecimalPlaces: 2 };
    const result = validateBahrainNbrInvoice(invoice, bahrainCompany);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.field === "currencyDecimalPlaces")).toBe(true);
  });

  it("should fail when VAT rate is not 10%", () => {
    const invoice = { ...validBahrainInvoice, taxRate: "15.000" };
    const result = validateBahrainNbrInvoice(invoice, bahrainCompany);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.field === "taxRate")).toBe(true);
    expect(result.errors.some((e) => e.messageAr.includes("10%"))).toBe(true);
  });

  it("should allow 0% VAT rate (for exempt items)", () => {
    const invoice = { ...validBahrainInvoice, taxRate: "0.000" };
    const result = validateBahrainNbrInvoice(invoice, bahrainCompany);
    expect(result.errors.some((e) => e.field === "taxRate")).toBe(false);
  });

  it("should include retention warning for Bahrain invoices", () => {
    const result = validateBahrainNbrInvoice(validBahrainInvoice, bahrainCompany);
    expect(result.warnings.some((w) => w.field === "recordRetention")).toBe(true);
    expect(result.warnings.some((w) => w.messageAr.includes("5 سنوات"))).toBe(true);
    expect(result.warnings.some((w) => w.messageAr.includes("10,000 دينار بحريني"))).toBe(true);
  });

  it("should include NBR portal framework development warning", () => {
    const result = validateBahrainNbrInvoice(validBahrainInvoice, bahrainCompany);
    expect(result.warnings.some((w) => w.field === "nbrPortal")).toBe(true);
    expect(result.warnings.some((w) => w.messageAr.includes("قيد التطوير"))).toBe(true);
  });
});

// ── Payload Generation Tests ───────────────────────────────────────────────

describe("generateBahrainNbrInvoicePayload", () => {
  it("should generate a complete NBR invoice payload", () => {
    const payload = generateBahrainNbrInvoicePayload(validBahrainInvoice, bahrainCompany);
    expect(payload.invoiceNumber).toBe("INV-2023-001");
    expect(payload.currency).toBe(BAHRAIN_NBR_CURRENCY);
    expect(payload.currencyDecimalPlaces).toBe(BAHRAIN_NBR_DECIMAL_PLACES);
    expect(payload.eInvoiceAuthority).toBe(BAHRAIN_NBR_AUTHORITY);
  });

  it("should include dual language seller fields", () => {
    const payload = generateBahrainNbrInvoicePayload(validBahrainInvoice, bahrainCompany);
    expect(payload.sellerNameAr).toBe("شركة التجارة البحرينية");
    expect(payload.sellerNameEn).toBe("Bahrain Trading Co.");
  });

  it("should include seller VAT TRN", () => {
    const payload = generateBahrainNbrInvoicePayload(validBahrainInvoice, bahrainCompany);
    expect(payload.sellerVatTrn).toBe("TRN-BH-300123456");
  });

  it("should include both Gregorian and Hijri dates", () => {
    const payload = generateBahrainNbrInvoicePayload(validBahrainInvoice, bahrainCompany);
    expect(payload.issueDateGregorian).toBe("2023-01-15");
    expect(payload.issueDateHijri).toBeTruthy();
    expect(payload.issueDateDual).toBeTruthy();
  });

  it("should format amounts with BHD 3-decimal precision", () => {
    const payload = generateBahrainNbrInvoicePayload(validBahrainInvoice, bahrainCompany);
    expect(payload.subtotal).toMatch(/^\d+\.\d{3}$/);
    expect(payload.total).toMatch(/^\d+\.\d{3}$/);
    expect(payload.taxAmount).toMatch(/^\d+\.\d{3}$/);
  });

  it("should set 10% VAT rate", () => {
    const payload = generateBahrainNbrInvoicePayload(validBahrainInvoice, bahrainCompany);
    expect(payload.taxRate).toBe("10.000");
  });

  it("should set invoice type labels correctly for simplified", () => {
    const payload = generateBahrainNbrInvoicePayload(validBahrainInvoice, bahrainCompany);
    expect(payload.invoiceType).toBe("simplified");
    expect(payload.invoiceTypeAr).toBe("فاتورة مبسطة");
    expect(payload.invoiceTypeEn).toBe("simplified");
  });

  it("should set invoice type labels correctly for standard", () => {
    const payload = generateBahrainNbrInvoicePayload(validBahrainB2bInvoice, bahrainCompany);
    expect(payload.invoiceType).toBe("standard");
    expect(payload.invoiceTypeAr).toBe("فاتورة ضريبية");
  });

  it("should set BH as seller country code", () => {
    const payload = generateBahrainNbrInvoicePayload(validBahrainInvoice, bahrainCompany);
    expect(payload.sellerCountryCode).toBe("BH");
  });
});

// ── Auto-population Tests ──────────────────────────────────────────────────

describe("autoPopulateBahrainNbrFields", () => {
  it("should auto-populate UUID", () => {
    const invoiceData = { issueDate: "2023-01-15" };
    const result = autoPopulateBahrainNbrFields(invoiceData, bahrainCompany);
    expect(result.uuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  });

  it("should auto-populate Hijri dates", () => {
    const invoiceData = { issueDate: "2023-01-15", dueDate: "2023-02-15" };
    const result = autoPopulateBahrainNbrFields(invoiceData, bahrainCompany);
    expect(result.hijriIssueDate).toBeTruthy();
    expect(result.hijriIssueDate).toBe(formatHijri("2023-01-15"));
  });

  it("should auto-populate seller VAT TRN from company", () => {
    const invoiceData = { issueDate: "2023-01-15" };
    const result = autoPopulateBahrainNbrFields(invoiceData, bahrainCompany);
    expect(result.vatNumber).toBe("TRN-BH-300123456");
  });

  it("should auto-populate Arabic seller name from company", () => {
    const invoiceData = { issueDate: "2023-01-15" };
    const result = autoPopulateBahrainNbrFields(invoiceData, bahrainCompany);
    expect(result.sellerNameAr).toBe("شركة التجارة البحرينية");
  });

  it("should auto-populate English seller name from company", () => {
    const invoiceData = { issueDate: "2023-01-15" };
    const result = autoPopulateBahrainNbrFields(invoiceData, bahrainCompany);
    expect(result.sellerNameEn).toBe("Bahrain Trading Co.");
  });

  it("should enforce BHD currency", () => {
    const invoiceData = { issueDate: "2023-01-15", currency: "USD" };
    const result = autoPopulateBahrainNbrFields(invoiceData, bahrainCompany);
    expect(result.currency).toBe("BHD");
  });

  it("should enforce 3 decimal places", () => {
    const invoiceData = { issueDate: "2023-01-15" };
    const result = autoPopulateBahrainNbrFields(invoiceData, bahrainCompany);
    expect(result.currencyDecimalPlaces).toBe(3);
  });

  it("should enforce 3-decimal precision on monetary fields", () => {
    const invoiceData = {
      issueDate: "2023-01-15",
      subtotal: "100",
      total: "110",
      taxAmount: "10",
    };
    const result = autoPopulateBahrainNbrFields(invoiceData, bahrainCompany);
    expect(result.subtotal).toBe("100.000");
    expect(result.total).toBe("110.000");
    expect(result.taxAmount).toBe("10.000");
  });

  it("should enforce 10% VAT rate", () => {
    const invoiceData = { issueDate: "2023-01-15" };
    const result = autoPopulateBahrainNbrFields(invoiceData, bahrainCompany);
    expect(result.taxRate).toBe("10.000");
  });

  it("should auto-populate invoice type as simplified for B2C", () => {
    const invoiceData = { issueDate: "2023-01-15" };
    const result = autoPopulateBahrainNbrFields(invoiceData, bahrainCompany);
    expect(result.invoiceTypeEn).toBe("simplified");
    expect(result.invoiceTypeAr).toBe("فاتورة مبسطة");
  });

  it("should auto-populate invoice type as standard for B2B", () => {
    const invoiceData = { issueDate: "2023-01-15", clientId: 5 };
    const result = autoPopulateBahrainNbrFields(invoiceData, bahrainCompany);
    expect(result.invoiceTypeEn).toBe("standard");
    expect(result.invoiceTypeAr).toBe("فاتورة ضريبية");
  });

  it("should set e-invoice authority", () => {
    const invoiceData = { issueDate: "2023-01-15" };
    const result = autoPopulateBahrainNbrFields(invoiceData, bahrainCompany);
    expect(result.eInvoiceAuthority).toBe("bahrain_nbr");
  });

  it("should set PIH placeholder", () => {
    const invoiceData = { issueDate: "2023-01-15" };
    const result = autoPopulateBahrainNbrFields(invoiceData, bahrainCompany);
    expect(result.previousInvoiceHash).toBe("");
  });
});

// ── Constants Validation Tests ──────────────────────────────────────────────

describe("Bahrain NBR constants", () => {
  it("should have correct authority", () => {
    expect(BAHRAIN_NBR_AUTHORITY).toBe("bahrain_nbr");
  });

  it("should have correct currency", () => {
    expect(BAHRAIN_NBR_CURRENCY).toBe("BHD");
  });

  it("should have correct decimal places", () => {
    expect(BAHRAIN_NBR_DECIMAL_PLACES).toBe(3);
  });

  it("should have correct VAT rate", () => {
    expect(BAHRAIN_NBR_VAT_RATE).toBe(10);
  });

  it("should have correct regulation name", () => {
    expect(BAHRAIN_NBR_REGULATION).toBe("Bahrain NBR e-invoicing");
  });

  it("should have correct max fine", () => {
    expect(BAHRAIN_NBR_MAX_FINE_BHD).toBe(10000);
  });
});

// ── Money/BHD 3-decimal integration tests ──────────────────────────────────

describe("Money/BHD 3-decimal integration", () => {
  it("should format BHD with 3 decimal places", () => {
    const formatted = num(100, 3).toFixed(3);
    expect(formatted).toBe("100.000");
  });

  it("should handle BHD amounts with existing decimals", () => {
    const formatted = num(100.500, 3).toFixed(3);
    expect(formatted).toBe("100.500");
  });

  it("should handle small BHD amounts correctly", () => {
    const formatted = num(0.001, 3).toFixed(3);
    expect(formatted).toBe("0.001");
  });
});

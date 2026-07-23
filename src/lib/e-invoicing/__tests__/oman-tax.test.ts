/**
 * oman-tax.test.ts — Tests for Oman Tax Authority e-invoicing compliance module.
 *
 * Covers:
 * - Invoice validation (Arabic mandatory, TRN, OMR 3 decimals, 5% VAT)
 * - Invoice type classification (standard/simplified)
 * - Payload generation with OMR amounts, 5% VAT
 * - Auto-population of Oman Tax-specific fields
 * - UUID generation
 * - Constants validation
 */

import { describe, it, expect } from "bun:test";
import {
  validateOmanTaxInvoice,
  generateOmanTaxInvoicePayload,
  determineOmanTaxInvoiceType,
  autoPopulateOmanTaxFields,
  generateOmanTaxUuid,
  OMAN_TAX_CURRENCY,
  OMAN_TAX_DECIMAL_PLACES,
  OMAN_TAX_VAT_RATE,
  OMAN_TAX_AUTHORITY,
  OMAN_TAX_REGULATION,
  OMAN_TAX_MAX_FINE_OMR,
} from "../oman-tax";
import { formatHijri, formatDualDate } from "../../hijri";
import { num } from "../../money";

// ── Test fixtures ──────────────────────────────────────────────────────────

const omanCompany = {
  id: 1,
  slug: "oman-trading",
  name: "Oman Trading Co.",
  nameAr: "شركة التجارة العُمانية",
  country: "OM",
  currency: "OMR",
  vatNumber: "TRN-OM-300123456",
  address: "Muscat, Oman",
  addressAr: "مسقط، سلطنة عُمان",
  commercialRegistration: "CR-OM-2023-001",
  defaultTaxRate: "5",
  recordRetentionYears: 5,
};

const nonOmanCompany = {
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

const validOmanInvoice = {
  invoiceNumber: "INV-2021-001",
  issueDate: "2021-01-15",
  dueDate: "2021-02-15",
  clientName: "Ahmad Al-Muscat",
  sellerNameAr: "شركة التجارة العُمانية",
  sellerNameEn: "Oman Trading Co.",
  sellerAddressAr: "مسقط، سلطنة عُمان",
  sellerAddressEn: "Muscat, Oman",
  vatNumber: "TRN-OM-300123456",
  currency: "OMR",
  currencyDecimalPlaces: 3,
  invoiceTypeEn: "simplified",
  invoiceTypeAr: "فاتورة مبسطة",
  taxRate: "5.000",
  subtotal: "100.000",
  taxAmount: "5.000",
  total: "105.000",
  shipping: "0.000",
  discount: "0.000",
  paid: "0.000",
  lineItems: JSON.stringify([
    { description: "Design Service", qty: 1, price: 100, total: 100 },
  ]),
  notes: "Thank you",
  notesAr: "شكراً لكم",
};

const validOmanB2bInvoice = {
  ...validOmanInvoice,
  invoiceTypeEn: "standard",
  invoiceTypeAr: "فاتورة ضريبية",
  buyerNameAr: "أحمد مسقط",
  buyerNameEn: "Ahmad Muscat",
  buyerAddressAr: "مسقط، عُمان",
  buyerAddressEn: "Muscat, Oman",
  buyerVatNumber: "TRN-OM-300987654",
  clientId: 5,
};

// ── UUID Generation Tests ──────────────────────────────────────────────────

describe("generateOmanTaxUuid", () => {
  it("should generate a valid UUID v4 format", () => {
    const uuid = generateOmanTaxUuid();
    expect(uuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  });

  it("should generate unique UUIDs", () => {
    const uuid1 = generateOmanTaxUuid();
    const uuid2 = generateOmanTaxUuid();
    expect(uuid1).not.toBe(uuid2);
  });
});

// ── Invoice Type Classification Tests ──────────────────────────────────────

describe("determineOmanTaxInvoiceType", () => {
  it("should classify as simplified (B2C) by default", () => {
    const result = determineOmanTaxInvoiceType({});
    expect(result).toBe("simplified");
  });

  it("should classify as standard (B2B) when clientId is present", () => {
    const result = determineOmanTaxInvoiceType({ clientId: 5 });
    expect(result).toBe("standard");
  });

  it("should classify as standard (B2B) when buyerVatNumber is present", () => {
    const result = determineOmanTaxInvoiceType({ buyerVatNumber: "TRN-123" });
    expect(result).toBe("standard");
  });

  it("should respect explicit invoiceTypeEn=standard", () => {
    const result = determineOmanTaxInvoiceType({ invoiceTypeEn: "standard" });
    expect(result).toBe("standard");
  });

  it("should respect explicit invoiceTypeEn=simplified", () => {
    const result = determineOmanTaxInvoiceType({ invoiceTypeEn: "simplified" });
    expect(result).toBe("simplified");
  });

  it("should respect Arabic invoice type", () => {
    expect(determineOmanTaxInvoiceType({ invoiceTypeAr: "فاتورة ضريبية" })).toBe("standard");
    expect(determineOmanTaxInvoiceType({ invoiceTypeAr: "فاتورة مبسطة" })).toBe("simplified");
  });
});

// ── Validation Tests ──────────────────────────────────────────────────────

describe("validateOmanTaxInvoice", () => {
  it("should return valid for a compliant Oman simplified invoice", () => {
    const result = validateOmanTaxInvoice(validOmanInvoice, omanCompany);
    expect(result.valid).toBe(true);
    expect(result.errors.length).toBe(0);
  });

  it("should pass validation for non-Oman companies", () => {
    const result = validateOmanTaxInvoice({}, nonOmanCompany);
    expect(result.valid).toBe(true);
    expect(result.errors.length).toBe(0);
  });

  it("should fail when seller VAT TRN is missing", () => {
    const company = { ...omanCompany, vatNumber: undefined };
    const invoice = { ...validOmanInvoice, vatNumber: undefined };
    const result = validateOmanTaxInvoice(invoice, company);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.field === "vatNumber")).toBe(true);
    expect(result.errors.some((e) => e.messageAr.includes("هيئة الضرائب العُمانية"))).toBe(true);
  });

  it("should fail when seller Arabic name is missing", () => {
    const company = { ...omanCompany, nameAr: undefined };
    const invoice = { ...validOmanInvoice, sellerNameAr: undefined };
    const result = validateOmanTaxInvoice(invoice, company);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.field === "sellerNameAr")).toBe(true);
  });

  it("should fail when seller Arabic address is missing", () => {
    const company = { ...omanCompany, addressAr: undefined, address: undefined };
    const invoice = { ...validOmanInvoice, sellerAddressAr: undefined };
    const result = validateOmanTaxInvoice(invoice, company);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.field === "sellerAddressAr")).toBe(true);
  });

  it("should issue warning for missing English seller name in B2B invoices", () => {
    const company = { ...omanCompany, name: undefined };
    const invoice = { ...validOmanB2bInvoice, sellerNameEn: undefined };
    const result = validateOmanTaxInvoice(invoice, company);
    // English is recommended (warning) for B2B, not mandatory (error)
    expect(result.warnings.some((w) => w.field === "sellerNameEn")).toBe(true);
    expect(result.warnings.some((w) => w.messageAr.includes("الإنجليزية"))).toBe(true);
  });

  it("should require buyer TRN for standard (B2B) invoices", () => {
    const invoice = {
      ...validOmanInvoice,
      invoiceTypeEn: "standard",
      buyerNameAr: "أحمد مسقط",
      buyerAddressAr: "مسقط",
    };
    const result = validateOmanTaxInvoice(invoice, omanCompany);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.field === "buyerVatNumber")).toBe(true);
  });

  it("should require buyer Arabic name for B2B invoices", () => {
    const invoice = {
      ...validOmanInvoice,
      invoiceTypeEn: "standard",
      buyerVatNumber: "TRN-123",
      buyerAddressAr: "مسقط",
    };
    const result = validateOmanTaxInvoice(invoice, omanCompany);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.field === "buyerNameAr")).toBe(true);
  });

  it("should require buyer Arabic address for B2B invoices", () => {
    const invoice = {
      ...validOmanInvoice,
      invoiceTypeEn: "standard",
      buyerNameAr: "أحمد",
      buyerVatNumber: "TRN-123",
    };
    const result = validateOmanTaxInvoice(invoice, omanCompany);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.field === "buyerAddressAr")).toBe(true);
  });

  it("should not require buyer TRN for simplified (B2C) invoices", () => {
    const result = validateOmanTaxInvoice(validOmanInvoice, omanCompany);
    expect(result.errors.some((e) => e.field === "buyerVatNumber")).toBe(false);
  });

  it("should fail when currency is not OMR", () => {
    const invoice = { ...validOmanInvoice, currency: "USD" };
    const result = validateOmanTaxInvoice(invoice, omanCompany);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.field === "currency")).toBe(true);
    expect(result.errors.some((e) => e.messageAr.includes("ريال عُماني"))).toBe(true);
  });

  it("should fail when decimal places are not 3", () => {
    const invoice = { ...validOmanInvoice, currencyDecimalPlaces: 2 };
    const result = validateOmanTaxInvoice(invoice, omanCompany);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.field === "currencyDecimalPlaces")).toBe(true);
  });

  it("should fail when VAT rate is not 5%", () => {
    const invoice = { ...validOmanInvoice, taxRate: "10.000" };
    const result = validateOmanTaxInvoice(invoice, omanCompany);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.field === "taxRate")).toBe(true);
    expect(result.errors.some((e) => e.messageAr.includes("5%"))).toBe(true);
  });

  it("should allow 0% VAT rate (for exempt items)", () => {
    const invoice = { ...validOmanInvoice, taxRate: "0.000" };
    const result = validateOmanTaxInvoice(invoice, omanCompany);
    expect(result.errors.some((e) => e.field === "taxRate")).toBe(false);
  });

  it("should include retention warning for Oman invoices", () => {
    const result = validateOmanTaxInvoice(validOmanInvoice, omanCompany);
    expect(result.warnings.some((w) => w.field === "recordRetention")).toBe(true);
    expect(result.warnings.some((w) => w.messageAr.includes("5 سنوات"))).toBe(true);
    expect(result.warnings.some((w) => w.messageAr.includes("20,000 ريال عُماني"))).toBe(true);
  });

  it("should include Oman Tax portal framework development warning", () => {
    const result = validateOmanTaxInvoice(validOmanInvoice, omanCompany);
    expect(result.warnings.some((w) => w.field === "omanTaxPortal")).toBe(true);
    expect(result.warnings.some((w) => w.messageAr.includes("قيد التطوير"))).toBe(true);
  });

  it("should issue warning for missing Arabic line items", () => {
    const invoice = { ...validOmanInvoice, lineItemsAr: undefined };
    const result = validateOmanTaxInvoice(invoice, omanCompany);
    expect(result.warnings.some((w) => w.field === "lineItemsAr")).toBe(true);
  });

  it("should issue warning for missing English buyer name in B2B", () => {
    const invoice = {
      ...validOmanB2bInvoice,
      buyerNameEn: undefined,
    };
    const result = validateOmanTaxInvoice(invoice, omanCompany);
    expect(result.warnings.some((w) => w.field === "buyerNameEn")).toBe(true);
  });
});

// ── Payload Generation Tests ───────────────────────────────────────────────

describe("generateOmanTaxInvoicePayload", () => {
  it("should generate a complete Oman Tax invoice payload", () => {
    const payload = generateOmanTaxInvoicePayload(validOmanInvoice, omanCompany);
    expect(payload.invoiceNumber).toBe("INV-2021-001");
    expect(payload.currency).toBe(OMAN_TAX_CURRENCY);
    expect(payload.currencyDecimalPlaces).toBe(OMAN_TAX_DECIMAL_PLACES);
    expect(payload.eInvoiceAuthority).toBe(OMAN_TAX_AUTHORITY);
  });

  it("should include Arabic seller fields", () => {
    const payload = generateOmanTaxInvoicePayload(validOmanInvoice, omanCompany);
    expect(payload.sellerNameAr).toBe("شركة التجارة العُمانية");
    expect(payload.sellerAddressAr).toBeTruthy();
  });

  it("should include seller VAT TRN", () => {
    const payload = generateOmanTaxInvoicePayload(validOmanInvoice, omanCompany);
    expect(payload.sellerVatTrn).toBe("TRN-OM-300123456");
  });

  it("should include both Gregorian and Hijri dates", () => {
    const payload = generateOmanTaxInvoicePayload(validOmanInvoice, omanCompany);
    expect(payload.issueDateGregorian).toBe("2021-01-15");
    expect(payload.issueDateHijri).toBeTruthy();
    expect(payload.issueDateDual).toBeTruthy();
  });

  it("should format amounts with OMR 3-decimal precision", () => {
    const payload = generateOmanTaxInvoicePayload(validOmanInvoice, omanCompany);
    expect(payload.subtotal).toMatch(/^\d+\.\d{3}$/);
    expect(payload.total).toMatch(/^\d+\.\d{3}$/);
    expect(payload.taxAmount).toMatch(/^\d+\.\d{3}$/);
  });

  it("should set 5% VAT rate", () => {
    const payload = generateOmanTaxInvoicePayload(validOmanInvoice, omanCompany);
    expect(payload.taxRate).toBe("5.000");
  });

  it("should set invoice type labels correctly for simplified", () => {
    const payload = generateOmanTaxInvoicePayload(validOmanInvoice, omanCompany);
    expect(payload.invoiceType).toBe("simplified");
    expect(payload.invoiceTypeAr).toBe("فاتورة مبسطة");
  });

  it("should set invoice type labels correctly for standard", () => {
    const payload = generateOmanTaxInvoicePayload(validOmanB2bInvoice, omanCompany);
    expect(payload.invoiceType).toBe("standard");
    expect(payload.invoiceTypeAr).toBe("فاتورة ضريبية");
  });

  it("should set OM as seller country code", () => {
    const payload = generateOmanTaxInvoicePayload(validOmanInvoice, omanCompany);
    expect(payload.sellerCountryCode).toBe("OM");
  });

  it("should include English seller name as optional", () => {
    const payload = generateOmanTaxInvoicePayload(validOmanInvoice, omanCompany);
    // English seller name is optional for Oman — may be null
    expect(payload.sellerNameEn).toBeTruthy(); // Available from company
  });
});

// ── Auto-population Tests ──────────────────────────────────────────────────

describe("autoPopulateOmanTaxFields", () => {
  it("should auto-populate UUID", () => {
    const invoiceData = { issueDate: "2021-01-15" };
    const result = autoPopulateOmanTaxFields(invoiceData, omanCompany);
    expect(result.uuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  });

  it("should auto-populate Hijri dates", () => {
    const invoiceData = { issueDate: "2021-01-15", dueDate: "2021-02-15" };
    const result = autoPopulateOmanTaxFields(invoiceData, omanCompany);
    expect(result.hijriIssueDate).toBeTruthy();
    expect(result.hijriIssueDate).toBe(formatHijri("2021-01-15"));
  });

  it("should auto-populate seller VAT TRN from company", () => {
    const invoiceData = { issueDate: "2021-01-15" };
    const result = autoPopulateOmanTaxFields(invoiceData, omanCompany);
    expect(result.vatNumber).toBe("TRN-OM-300123456");
  });

  it("should auto-populate Arabic seller name from company", () => {
    const invoiceData = { issueDate: "2021-01-15" };
    const result = autoPopulateOmanTaxFields(invoiceData, omanCompany);
    expect(result.sellerNameAr).toBe("شركة التجارة العُمانية");
  });

  it("should auto-populate English seller name when available", () => {
    const invoiceData = { issueDate: "2021-01-15" };
    const result = autoPopulateOmanTaxFields(invoiceData, omanCompany);
    expect(result.sellerNameEn).toBe("Oman Trading Co.");
  });

  it("should enforce OMR currency", () => {
    const invoiceData = { issueDate: "2021-01-15", currency: "USD" };
    const result = autoPopulateOmanTaxFields(invoiceData, omanCompany);
    expect(result.currency).toBe("OMR");
  });

  it("should enforce 3 decimal places", () => {
    const invoiceData = { issueDate: "2021-01-15" };
    const result = autoPopulateOmanTaxFields(invoiceData, omanCompany);
    expect(result.currencyDecimalPlaces).toBe(3);
  });

  it("should enforce 3-decimal precision on monetary fields", () => {
    const invoiceData = {
      issueDate: "2021-01-15",
      subtotal: "100",
      total: "105",
      taxAmount: "5",
    };
    const result = autoPopulateOmanTaxFields(invoiceData, omanCompany);
    expect(result.subtotal).toBe("100.000");
    expect(result.total).toBe("105.000");
    expect(result.taxAmount).toBe("5.000");
  });

  it("should enforce 5% VAT rate", () => {
    const invoiceData = { issueDate: "2021-01-15" };
    const result = autoPopulateOmanTaxFields(invoiceData, omanCompany);
    expect(result.taxRate).toBe("5.000");
  });

  it("should auto-populate invoice type as simplified for B2C", () => {
    const invoiceData = { issueDate: "2021-01-15" };
    const result = autoPopulateOmanTaxFields(invoiceData, omanCompany);
    expect(result.invoiceTypeEn).toBe("simplified");
    expect(result.invoiceTypeAr).toBe("فاتورة مبسطة");
  });

  it("should auto-populate invoice type as standard for B2B", () => {
    const invoiceData = { issueDate: "2021-01-15", clientId: 5 };
    const result = autoPopulateOmanTaxFields(invoiceData, omanCompany);
    expect(result.invoiceTypeEn).toBe("standard");
    expect(result.invoiceTypeAr).toBe("فاتورة ضريبية");
  });

  it("should set e-invoice authority", () => {
    const invoiceData = { issueDate: "2021-01-15" };
    const result = autoPopulateOmanTaxFields(invoiceData, omanCompany);
    expect(result.eInvoiceAuthority).toBe("oman_tax");
  });

  it("should set PIH placeholder", () => {
    const invoiceData = { issueDate: "2021-01-15" };
    const result = autoPopulateOmanTaxFields(invoiceData, omanCompany);
    expect(result.previousInvoiceHash).toBe("");
  });
});

// ── Constants Validation Tests ──────────────────────────────────────────────

describe("Oman Tax constants", () => {
  it("should have correct authority", () => {
    expect(OMAN_TAX_AUTHORITY).toBe("oman_tax");
  });

  it("should have correct currency", () => {
    expect(OMAN_TAX_CURRENCY).toBe("OMR");
  });

  it("should have correct decimal places", () => {
    expect(OMAN_TAX_DECIMAL_PLACES).toBe(3);
  });

  it("should have correct VAT rate", () => {
    expect(OMAN_TAX_VAT_RATE).toBe(5);
  });

  it("should have correct regulation name", () => {
    expect(OMAN_TAX_REGULATION).toBe("Oman Tax Authority e-invoicing");
  });

  it("should have correct max fine", () => {
    expect(OMAN_TAX_MAX_FINE_OMR).toBe(20000);
  });
});

// ── Money/OMR 3-decimal integration tests ──────────────────────────────────

describe("Money/OMR 3-decimal integration", () => {
  it("should format OMR with 3 decimal places", () => {
    const formatted = num(100, 3).toFixed(3);
    expect(formatted).toBe("100.000");
  });

  it("should handle OMR amounts with existing decimals", () => {
    const formatted = num(100.500, 3).toFixed(3);
    expect(formatted).toBe("100.500");
  });

  it("should handle small OMR amounts correctly", () => {
    const formatted = num(0.001, 3).toFixed(3);
    expect(formatted).toBe("0.001");
  });
});

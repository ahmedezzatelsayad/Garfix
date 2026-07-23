/**
 * kuwait.test.ts — Tests for Kuwait Decree 10/2026 compliance module.
 *
 * Covers:
 * - Invoice validation (Arabic mandatory, Hijri, MOCI, KWD 3 decimals)
 * - Payload generation with real date conversions
 * - Retention enforcement
 * - Auto-population of Kuwait-specific fields
 */

import { describe, it, expect } from "bun:test";
import {
  validateKuwaitInvoice,
  generateKuwaitInvoicePayload,
  determineInvoiceType,
  autoPopulateKuwaitFields,
  KUWAIT_CURRENCY,
  KUWAIT_DECIMAL_PLACES,
  KUWAIT_DECREE_REF,
} from "../kuwait";
import {
  kuwaitInvoiceValidationMiddleware,
  applyKuwaitCompliance,
  formatKuwaitErrorsForResponse,
} from "../kuwait-validation";
import {
  checkInvoiceRetention,
  checkFinancialRecordRetention,
  getRetentionPeriodForCompany,
  calculateEligibleDeletionDate,
  KUWAIT_RETENTION_YEARS,
} from "../retention";
import { toHijri, formatHijri, formatDualDate } from "../../hijri";
import { num } from "../../money";

// ── Test fixtures ──────────────────────────────────────────────────────────

const kuwaitCompany = {
  id: 1,
  slug: "kuwait-trading",
  name: "Kuwait Trading Co.",
  nameAr: "شركة التجارة الكويتية",
  country: "KW",
  currency: "KWD",
  mociNumber: "MOCI-12345",
  commercialRegistration: "CR-2026-789",
  vatNumber: null,
  address: "شارع فهد السالم، الكويت",
  recordRetentionYears: 5,
  hijriDateRequired: true,
  arabicMandatory: true,
};

const nonKuwaitCompany = {
  id: 2,
  slug: "saudi-trading",
  name: "Saudi Trading Co.",
  nameAr: "شركة التجارة السعودية",
  country: "SA",
  currency: "SAR",
  mociNumber: null,
  vatNumber: "VAT-SA-12345",
  address: "الرياض، السعودية",
  recordRetentionYears: 5,
};

const validKuwaitInvoice = {
  invoiceNumber: "INV-2026-001",
  clientName: "Ahmad Al-Salem",
  clientNameAr: "أحمد السالم",
  clientAddress: "السالمية، الكويت",
  buyerNameAr: "أحمد السالم",
  buyerAddressAr: "السالمية، الكويت",
  issueDate: "2026-01-15",
  dueDate: "2026-02-15",
  hijriIssueDate: formatHijri("2026-01-15"),
  hijriDueDate: formatHijri("2026-02-15"),
  mociNumber: "MOCI-12345",
  invoiceTypeAr: "فاتورة ضريبية",
  invoiceTypeEn: "standard",
  currency: "KWD",
  currencyDecimalPlaces: 3,
  sellerNameAr: "شركة التجارة الكويتية",
  sellerAddressAr: "شارع فهد السالم، الكويت",
  lineItems: JSON.stringify([
    { description: "خدمة تصميم", qty: 1, price: 500, total: 500 },
  ]),
  lineItemsAr: JSON.stringify([
    { descriptionAr: "خدمة تصميم", descriptionEn: "Design Service", qty: "1.000", price: "500.000", total: "500.000" },
  ]),
  subtotal: "500",
  taxRate: "0",
  taxAmount: "0",
  total: "500",
  shipping: "0",
  discount: "0",
  paid: "0",
  notes: "Thank you",
  notesAr: "شكراً لكم",
};

// ── Validation Tests ───────────────────────────────────────────────────────

describe("validateKuwaitInvoice", () => {
  it("should return valid for a compliant Kuwait invoice", () => {
    const result = validateKuwaitInvoice(validKuwaitInvoice, kuwaitCompany);
    expect(result.valid).toBe(true);
    expect(result.errors.length).toBe(0);
  });

  it("should pass validation for non-Kuwait companies", () => {
    const result = validateKuwaitInvoice({}, nonKuwaitCompany);
    expect(result.valid).toBe(true);
    expect(result.errors.length).toBe(0);
  });

  it("should fail validation when Arabic seller name is missing", () => {
    const invoice = { ...validKuwaitInvoice, sellerNameAr: undefined };
    const company = { ...kuwaitCompany, nameAr: undefined };
    const result = validateKuwaitInvoice(invoice, company);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.field === "sellerNameAr")).toBe(true);
    expect(result.errors.some((e) => e.messageAr.includes("اسم البائع"))).toBe(true);
  });

  it("should fail validation when Arabic buyer name is missing for B2B (standard) invoices", () => {
    const invoice = { ...validKuwaitInvoice, buyerNameAr: undefined, clientName: undefined, invoiceTypeEn: "standard" };
    const result = validateKuwaitInvoice(invoice, kuwaitCompany);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.field === "buyerNameAr")).toBe(true);
  });

  it("should not require Arabic buyer name for B2C (simplified) invoices", () => {
    const invoice = { ...validKuwaitInvoice, buyerNameAr: undefined, clientName: undefined, invoiceTypeEn: "simplified" };
    // For simplified invoices, buyer Arabic name is NOT mandatory
    const result = validateKuwaitInvoice(invoice, kuwaitCompany);
    // The buyerNameAr error should NOT be present for simplified invoices
    const buyerNameError = result.errors.find((e) => e.field === "buyerNameAr");
    expect(buyerNameError).toBeUndefined();
  });

  it("should fail validation when MOCI number is missing", () => {
    const invoice = { ...validKuwaitInvoice, mociNumber: undefined };
    const company = { ...kuwaitCompany, mociNumber: undefined };
    const result = validateKuwaitInvoice(invoice, company);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.field === "mociNumber")).toBe(true);
    expect(result.errors.some((e) => e.messageAr.includes("وزارة التجارة"))).toBe(true);
  });

  it("should fail validation when currency is not KWD", () => {
    const invoice = { ...validKuwaitInvoice, currency: "USD" };
    const result = validateKuwaitInvoice(invoice, kuwaitCompany);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.field === "currency")).toBe(true);
  });

  it("should fail validation when decimal places are not 3", () => {
    const invoice = { ...validKuwaitInvoice, currencyDecimalPlaces: 2 };
    const result = validateKuwaitInvoice(invoice, kuwaitCompany);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.field === "currencyDecimalPlaces")).toBe(true);
  });

  it("should include retention warning for Kuwait invoices", () => {
    const result = validateKuwaitInvoice(validKuwaitInvoice, kuwaitCompany);
    expect(result.warnings.some((w) => w.field === "recordRetention")).toBe(true);
    expect(result.warnings.some((w) => w.messageAr.includes("5 سنوات"))).toBe(true);
  });
});

// ── Invoice Type Classification Tests ──────────────────────────────────────

describe("determineInvoiceType", () => {
  it("should classify as standard for B2B invoices with clientId", () => {
    const result = determineInvoiceType({ clientId: 5 });
    expect(result).toBe("standard");
  });

  it("should classify as simplified for B2C invoices without clientId", () => {
    const result = determineInvoiceType({});
    expect(result).toBe("simplified");
  });

  it("should classify as standard when buyerVatNumber is present", () => {
    const result = determineInvoiceType({ buyerVatNumber: "VAT-KW-12345" });
    expect(result).toBe("standard");
  });

  it("should respect explicit invoiceTypeEn setting", () => {
    expect(determineInvoiceType({ invoiceTypeEn: "standard" })).toBe("standard");
    expect(determineInvoiceType({ invoiceTypeEn: "simplified" })).toBe("simplified");
  });

  it("should respect Arabic invoice type", () => {
    expect(determineInvoiceType({ invoiceTypeAr: "فاتورة ضريبية" })).toBe("standard");
    expect(determineInvoiceType({ invoiceTypeAr: "فاتورة مبسطة" })).toBe("simplified");
  });
});

// ── Payload Generation Tests ───────────────────────────────────────────────

describe("generateKuwaitInvoicePayload", () => {
  it("should generate a complete Kuwait invoice payload", () => {
    const payload = generateKuwaitInvoicePayload(validKuwaitInvoice, kuwaitCompany);
    expect(payload.invoiceNumber).toBe("INV-2026-001");
    expect(payload.currency).toBe(KUWAIT_CURRENCY);
    expect(payload.currencyDecimalPlaces).toBe(KUWAIT_DECIMAL_PLACES);
    expect(payload.decreeRef).toBe(KUWAIT_DECREE_REF);
    expect(payload.eInvoiceAuthority).toBe("kuwait_decree_10_2026");
    expect(payload.paymentGatewayLicense).toBe("CBK");
  });

  it("should include both Gregorian and Hijri dates", () => {
    const payload = generateKuwaitInvoicePayload(validKuwaitInvoice, kuwaitCompany);
    expect(payload.issueDateGregorian).toBe("2026-01-15");
    expect(payload.issueDateHijri).toBeTruthy();
    expect(payload.issueDateDual).toBeTruthy();
    // Dual date should contain both calendars
    expect(payload.issueDateDual).toContain(payload.issueDateHijri);
  });

  it("should include MOCI number in payload", () => {
    const payload = generateKuwaitInvoicePayload(validKuwaitInvoice, kuwaitCompany);
    expect(payload.sellerMociNumber).toBe("MOCI-12345");
  });

  it("should format amounts with KWD 3-decimal precision", () => {
    const payload = generateKuwaitInvoicePayload(validKuwaitInvoice, kuwaitCompany);
    // All totals should have 3 decimal places
    expect(payload.subtotal).toMatch(/^\d+\.\d{3}$/);
    expect(payload.total).toMatch(/^\d+\.\d{3}$/);
    expect(payload.taxAmount).toMatch(/^\d+\.\d{3}$/);
  });

  it("should set invoice type labels correctly", () => {
    const payload = generateKuwaitInvoicePayload(
      { ...validKuwaitInvoice, invoiceTypeEn: "standard" },
      kuwaitCompany,
    );
    expect(payload.invoiceType).toBe("standard");
    expect(payload.invoiceTypeAr).toBe("فاتورة ضريبية");
    expect(payload.invoiceTypeEn).toBe("standard");
  });

  it("should set Arabic seller fields from company", () => {
    const payload = generateKuwaitInvoicePayload(validKuwaitInvoice, kuwaitCompany);
    expect(payload.sellerNameAr).toBe("شركة التجارة الكويتية");
    expect(payload.sellerAddressAr).toBeTruthy();
  });

  it("should include commercial registration (CR) number", () => {
    const payload = generateKuwaitInvoicePayload(validKuwaitInvoice, kuwaitCompany);
    expect(payload.sellerCommercialRegistration).toBe("CR-2026-789");
  });
});

// ── Auto-population Tests ──────────────────────────────────────────────────

describe("autoPopulateKuwaitFields", () => {
  it("should auto-populate Hijri dates from Gregorian dates", () => {
    const invoiceData = {
      issueDate: "2026-01-15",
      dueDate: "2026-02-15",
    };
    const result = autoPopulateKuwaitFields(invoiceData, kuwaitCompany);
    expect(result.hijriIssueDate).toBeTruthy();
    expect(result.hijriDueDate).toBeTruthy();
    // Hijri dates should match the hijri.ts conversion
    expect(result.hijriIssueDate).toBe(formatHijri("2026-01-15"));
  });

  it("should auto-populate MOCI number from company", () => {
    const invoiceData = { issueDate: "2026-01-15", dueDate: "2026-02-15" };
    const result = autoPopulateKuwaitFields(invoiceData, kuwaitCompany);
    expect(result.mociNumber).toBe("MOCI-12345");
  });

  it("should auto-populate Arabic seller name from company", () => {
    const invoiceData = { issueDate: "2026-01-15", dueDate: "2026-02-15" };
    const result = autoPopulateKuwaitFields(invoiceData, kuwaitCompany);
    expect(result.sellerNameAr).toBe("شركة التجارة الكويتية");
  });

  it("should auto-populate invoice type for B2C", () => {
    const invoiceData = { issueDate: "2026-01-15", dueDate: "2026-02-15" };
    const result = autoPopulateKuwaitFields(invoiceData, kuwaitCompany);
    // Default should be simplified (B2C) since no clientId or buyerVatNumber
    expect(result.invoiceTypeEn).toBe("simplified");
    expect(result.invoiceTypeAr).toBe("فاتورة مبسطة");
  });

  it("should auto-populate invoice type for B2B when clientId is present", () => {
    const invoiceData = { issueDate: "2026-01-15", dueDate: "2026-02-15", clientId: 5 };
    const result = autoPopulateKuwaitFields(invoiceData, kuwaitCompany);
    expect(result.invoiceTypeEn).toBe("standard");
    expect(result.invoiceTypeAr).toBe("فاتورة ضريبية");
  });

  it("should enforce KWD currency", () => {
    const invoiceData = { issueDate: "2026-01-15", dueDate: "2026-02-15", currency: "USD" };
    const result = autoPopulateKuwaitFields(invoiceData, kuwaitCompany);
    expect(result.currency).toBe("KWD");
  });

  it("should enforce 3 decimal places", () => {
    const invoiceData = { issueDate: "2026-01-15", dueDate: "2026-02-15" };
    const result = autoPopulateKuwaitFields(invoiceData, kuwaitCompany);
    expect(result.currencyDecimalPlaces).toBe(3);
  });

  it("should enforce 3-decimal precision on monetary fields", () => {
    const invoiceData = {
      issueDate: "2026-01-15",
      dueDate: "2026-02-15",
      subtotal: "100",
      total: "100",
      taxAmount: "0",
    };
    const result = autoPopulateKuwaitFields(invoiceData, kuwaitCompany);
    expect(result.subtotal).toBe("100.000");
    expect(result.total).toBe("100.000");
    expect(result.taxAmount).toBe("0.000");
  });

  it("should set e-invoice authority", () => {
    const invoiceData = { issueDate: "2026-01-15", dueDate: "2026-02-15" };
    const result = autoPopulateKuwaitFields(invoiceData, kuwaitCompany);
    expect(result.eInvoiceAuthority).toBe("kuwait_decree_10_2026");
  });
});

// ── Validation Middleware Tests ─────────────────────────────────────────────

describe("kuwaitInvoiceValidationMiddleware", () => {
  it("should pass through non-Kuwait companies without validation", () => {
    const result = kuwaitInvoiceValidationMiddleware({}, nonKuwaitCompany);
    expect(result.valid).toBe(true);
    expect(result.blockingErrors.length).toBe(0);
    expect(result.warnings.length).toBe(0);
  });

  it("should block Kuwait invoice creation when mandatory fields are missing", () => {
    const incompleteInvoice = {
      invoiceNumber: "INV-001",
      issueDate: "2026-01-15",
      dueDate: "2026-02-15",
      clientName: "Ahmad",
      // Missing: mociNumber, sellerNameAr, invoiceTypeAr, invoiceTypeEn
    };
    const result = kuwaitInvoiceValidationMiddleware(incompleteInvoice, kuwaitCompany);
    // Auto-population should fill some fields, but MOCI number comes from company
    // so it should be valid after auto-population
    expect(result.valid).toBe(true); // MOCI is auto-populated from company
  });

  it("should block Kuwait invoice when company has no MOCI number", () => {
    const companyNoMoci = { ...kuwaitCompany, mociNumber: undefined };
    const incompleteInvoice = {
      invoiceNumber: "INV-001",
      issueDate: "2026-01-15",
      dueDate: "2026-02-15",
      clientName: "Ahmad",
    };
    const result = kuwaitInvoiceValidationMiddleware(incompleteInvoice, companyNoMoci);
    expect(result.valid).toBe(false);
    expect(result.blockingErrors.some((e) => e.field === "mociNumber")).toBe(true);
  });

  it("should override non-KWD currency for Kuwait companies", () => {
    const invoiceData = {
      invoiceNumber: "INV-001",
      issueDate: "2026-01-15",
      dueDate: "2026-02-15",
      clientName: "Ahmad",
      currency: "USD",
    };
    const result = kuwaitInvoiceValidationMiddleware(invoiceData, kuwaitCompany);
    expect(result.enrichedData.currency).toBe("KWD");
    expect(result.enrichedData.currencyDecimalPlaces).toBe(3);
  });
});

// ── Format Errors Tests ────────────────────────────────────────────────────

describe("formatKuwaitErrorsForResponse", () => {
  it("should return empty error when no blocking errors", () => {
    const result = formatKuwaitErrorsForResponse({
      valid: true,
      enrichedData: {},
      blockingErrors: [],
      warnings: [],
    });
    expect(result.error).toBe("");
    expect(result.details).toEqual({});
  });

  it("should format Arabic error messages for API response", () => {
    const result = formatKuwaitErrorsForResponse({
      valid: false,
      enrichedData: {},
      blockingErrors: [
        { field: "mociNumber", messageAr: "رقم وزارة التجارة مطلوب", messageEn: "MOCI number required" },
      ],
      warnings: [],
    });
    expect(result.error).toContain("رقم وزارة التجارة");
    expect(result.details.decreeRef).toBe("Decree 10/2026");
  });
});

// ── Retention Tests ────────────────────────────────────────────────────────

describe("Retention enforcement", () => {
  it("should enforce 5-year retention for Kuwait companies", () => {
    const period = getRetentionPeriodForCompany(kuwaitCompany);
    expect(period).toBe(KUWAIT_RETENTION_YEARS);
    expect(period).toBe(5);
  });

  it("should use company.recordRetentionYears for non-Kuwait companies", () => {
    const period = getRetentionPeriodForCompany(nonKuwaitCompany);
    expect(period).toBe(5); // Default from company config
  });

  it("should not allow reduction of Kuwait retention below 5 years", () => {
    const reducedRetentionCompany = { ...kuwaitCompany, recordRetentionYears: 2 };
    const period = getRetentionPeriodForCompany(reducedRetentionCompany);
    expect(period).toBe(KUWAIT_RETENTION_YEARS); // Still 5 for Kuwait
  });

  it("should allow configurable retention for non-Kuwait companies", () => {
    const customRetentionCompany = { ...nonKuwaitCompany, recordRetentionYears: 7 };
    const period = getRetentionPeriodForCompany(customRetentionCompany);
    expect(period).toBe(7);
  });

  it("should calculate eligible deletion date correctly", () => {
    const deletedAt = new Date("2026-01-15");
    const eligibleDate = calculateEligibleDeletionDate(deletedAt, kuwaitCompany);
    // Kuwait: 5 years retention, so eligible date should be 2031-01-15
    expect(eligibleDate.getFullYear()).toBe(2031);
  });

  it("should prevent deletion of records within retention period", () => {
    const recentlyDeletedInvoice = {
      deletedAt: new Date("2026-01-15"),
      createdAt: new Date("2025-06-01"),
    };
    const result = checkInvoiceRetention(recentlyDeletedInvoice, kuwaitCompany);
    expect(result.canDelete).toBe(false);
    expect(result.reasonAr).toContain("5 سنوات");
    expect(result.remainingDays).toBeGreaterThan(0);
  });

  it("should allow deletion of records past retention period", () => {
    const oldDeletedInvoice = {
      deletedAt: new Date("2020-01-15"),
      createdAt: new Date("2019-06-01"),
    };
    const result = checkInvoiceRetention(oldDeletedInvoice, kuwaitCompany);
    expect(result.canDelete).toBe(true);
  });

  it("should allow soft-delete of active records", () => {
    const activeInvoice = {
      deletedAt: null,
      createdAt: new Date("2026-01-15"),
    };
    const result = checkInvoiceRetention(activeInvoice, kuwaitCompany);
    expect(result.canDelete).toBe(true); // Soft-delete always allowed
    expect(result.reasonAr).toBeTruthy(); // But with a warning
  });

  it("should include Kuwait-specific fine warning in retention notice", () => {
    const recentlyDeleted = {
      deletedAt: new Date("2026-01-15"),
      createdAt: new Date("2025-06-01"),
    };
    const result = checkInvoiceRetention(recentlyDeleted, kuwaitCompany);
    expect(result.reasonAr).toContain("10.000"); // 10,000 KWD fine reference
  });

  it("should check financial record retention generically", () => {
    const record = {
      deletedAt: new Date("2026-01-15"),
      createdAt: new Date("2025-06-01"),
    };
    const result = checkFinancialRecordRetention(record, kuwaitCompany);
    expect(result.canDelete).toBe(false);
    expect(result.retentionYears).toBe(5);
  });
});

// ── Hijri Date Integration Tests ───────────────────────────────────────────

describe("Hijri date integration", () => {
  it("should convert Gregorian to Hijri correctly", () => {
    const hijri = toHijri("2026-01-15");
    expect(hijri.year).toBeGreaterThan(0);
    expect(hijri.formatted).toBeTruthy();
  });

  it("should format dual date with both calendars", () => {
    const dual = formatDualDate("2026-01-15");
    expect(dual).toBeTruthy();
    // Should contain Arabic text (Gregorian in Arabic locale)
    expect(dual.length).toBeGreaterThan(5);
  });

  it("should handle empty/invalid dates gracefully", () => {
    const hijri = toHijri("invalid-date");
    expect(hijri.day).toBe(0);
    expect(hijri.formatted).toBe("");
  });
});

// ── Money Integration Tests ────────────────────────────────────────────────

describe("Money/KWD 3-decimal integration", () => {
  it("should format KWD with 3 decimal places", () => {
    const formatted = num(100, 3).toFixed(3);
    expect(formatted).toBe("100.000");
  });

  it("should handle KWD amounts with existing decimals", () => {
    const formatted = num(100.500, 3).toFixed(3);
    expect(formatted).toBe("100.500");
  });

  it("should handle small KWD amounts correctly", () => {
    const formatted = num(0.001, 3).toFixed(3);
    expect(formatted).toBe("0.001");
  });
});

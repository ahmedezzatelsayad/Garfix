/**
 * zatca.test.ts — Tests for Saudi ZATCA Phase 2 e-invoicing compliance module.
 *
 * Covers:
 * - UBL XML generation (structure validation)
 * - Invoice hash computation (SHA-256)
 * - UUID generation (ZATCA spec format)
 * - Validation (Arabic mandatory, VAT TRN, SAR, 15% VAT, B2B/B2C)
 * - Auto-population of ZATCA-specific fields
 * - Simplified vs Standard invoice classification
 * - Digital signing (ECDSA placeholder)
 * - Middleware integration
 */

import { describe, it, expect } from "bun:test";
import {
  validateZatcaInvoice,
  generateZatcaUblXml,
  computeInvoiceHash,
  generateZatcaUuid,
  signZatcaInvoice,
  determineZatcaInvoiceType,
  autoPopulateZatcaFields,
  ZATCA_CURRENCY,
  ZATCA_DECIMAL_PLACES,
  ZATCA_VAT_RATE,
  ZATCA_AUTHORITY,
  ZATCA_REGULATION,
  ZATCA_MAX_FINE_SAR,
} from "../zatca";
import {
  zatcaInvoiceValidationMiddleware,
  applyZatcaCompliance,
  formatZatcaErrorsForResponse,
} from "../zatca-validation";
import { formatHijri, formatDualDate } from "../../hijri";
import { num } from "../../money";

// ── Test fixtures ──────────────────────────────────────────────────────────

const saudiCompany = {
  id: 1,
  slug: "saudi-trading",
  name: "Saudi Trading Co.",
  nameAr: "شركة التجارة السعودية",
  country: "SA",
  currency: "SAR",
  vatNumber: "310000000100003", // ZATCA TRN format (15 digits)
  address: "الرياض، المملكة العربية السعودية",
  defaultTaxRate: "15",
  commercialRegistration: "CR-SA-2023-001",
  recordRetentionYears: 6,
};

const nonSaudiCompany = {
  id: 2,
  slug: "kuwait-trading",
  name: "Kuwait Trading Co.",
  nameAr: "شركة التجارة الكويتية",
  country: "KW",
  currency: "KWD",
  vatNumber: null,
  address: "شارع فهد السالم، الكويت",
  defaultTaxRate: "0",
};

const validSaudiStandardInvoice = {
  invoiceNumber: "INV-SA-2026-001",
  clientName: "Saudi Business Corp.",
  clientNameAr: "الشركة السعودية للأعمال",
  clientAddress: "جدة، السعودية",
  buyerNameAr: "الشركة السعودية للأعمال",
  buyerAddressAr: "جدة، السعودية",
  buyerVatTrn: "310000000200003",
  issueDate: "2026-01-15",
  dueDate: "2026-02-15",
  hijriIssueDate: formatHijri("2026-01-15"),
  hijriDueDate: formatHijri("2026-02-15"),
  invoiceTypeAr: "فاتورة ضريبية",
  invoiceTypeEn: "standard",
  currency: "SAR",
  currencyDecimalPlaces: 2,
  taxRate: "15",
  sellerNameAr: "شركة التجارة السعودية",
  sellerAddressAr: "الرياض، المملكة العربية السعودية",
  sellerVatTrn: "310000000100003",
  lineItems: JSON.stringify([
    { description: "خدمة استشارية", qty: 1, price: 1000, total: 1000 },
    { description: "خدمة تصميم", qty: 2, price: 500, total: 1000 },
  ]),
  lineItemsAr: JSON.stringify([
    { descriptionAr: "خدمة استشارية", descriptionEn: "Consulting Service", qty: "1.00", price: "1000.00", total: "1000.00" },
    { descriptionAr: "خدمة تصميم", descriptionEn: "Design Service", qty: "2.00", price: "500.00", total: "1000.00" },
  ]),
  subtotal: "2000",
  taxAmount: "300",
  total: "2300",
  shipping: "0",
  discount: "0",
  paid: "0",
  notes: "Thank you for your business",
  notesAr: "شكراً لتعاملكم معنا",
  uuid: generateZatcaUuid(),
  previousInvoiceHash: "NWZlY2ViNjZmZmM4NmYzNDQ0MWY0ZGQzNzU0Y2QwOWE0MmM2YzY2OGZkMWU0YWQ0NWQ3YzA4ZjY0ZjU4NDk0Nw==",
};

const validSaudiSimplifiedInvoice = {
  invoiceNumber: "INV-SA-2026-002",
  clientName: "Ahmad Al-Salem",
  issueDate: "2026-01-15",
  dueDate: "2026-01-15",
  invoiceTypeAr: "فاتورة مبسطة",
  invoiceTypeEn: "simplified",
  currency: "SAR",
  currencyDecimalPlaces: 2,
  taxRate: "15",
  sellerNameAr: "شركة التجارة السعودية",
  sellerAddressAr: "الرياض، المملكة العربية السعودية",
  sellerVatTrn: "310000000100003",
  lineItems: JSON.stringify([
    { description: "مشروبات", qty: 3, price: 10, total: 30 },
  ]),
  lineItemsAr: JSON.stringify([
    { descriptionAr: "مشروبات", descriptionEn: "Beverages", qty: "3.00", price: "10.00", total: "30.00" },
  ]),
  subtotal: "30",
  taxAmount: "4.50",
  total: "34.50",
  shipping: "0",
  discount: "0",
  paid: "0",
};

// ── UUID Generation Tests ──────────────────────────────────────────────────

describe("generateZatcaUuid", () => {
  it("should generate a valid UUID v4 format", () => {
    const uuid = generateZatcaUuid();
    expect(uuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  });

  it("should generate unique UUIDs each time", () => {
    const uuids = Array.from({ length: 100 }, () => generateZatcaUuid());
    const uniqueUuids = new Set(uuids);
    expect(uniqueUuids.size).toBe(100);
  });

  it("should return a string of correct length", () => {
    const uuid = generateZatcaUuid();
    expect(uuid.length).toBe(36); // Standard UUID v4 format: 8-4-4-4-12 + 4 hyphens
  });
});

// ── Invoice Hash Computation Tests ──────────────────────────────────────────

describe("computeInvoiceHash", () => {
  it("should return a 64-character hex string (SHA-256)", () => {
    const xml = "<Invoice>test content</Invoice>";
    const hash = computeInvoiceHash(xml);
    expect(hash.length).toBe(64);
    expect(hash).toMatch(/^[0-9a-f]{64}$/i);
  });

  it("should produce consistent hashes for the same input", () => {
    const xml = "<Invoice>consistent content</Invoice>";
    const hash1 = computeInvoiceHash(xml);
    const hash2 = computeInvoiceHash(xml);
    expect(hash1).toBe(hash2);
  });

  it("should produce different hashes for different inputs", () => {
    const xml1 = "<Invoice>content A</Invoice>";
    const xml2 = "<Invoice>content B</Invoice>";
    const hash1 = computeInvoiceHash(xml1);
    const hash2 = computeInvoiceHash(xml2);
    expect(hash1).not.toBe(hash2);
  });

  it("should handle empty string input", () => {
    const hash = computeInvoiceHash("");
    expect(hash.length).toBe(64);
  });

  it("should handle long XML content", () => {
    const xml = "<Invoice>" + "x".repeat(10000) + "</Invoice>";
    const hash = computeInvoiceHash(xml);
    expect(hash.length).toBe(64);
  });
});

// ── Invoice Type Classification Tests ──────────────────────────────────────

describe("determineZatcaInvoiceType", () => {
  it("should classify as standard for B2B invoices with clientId", () => {
    const result = determineZatcaInvoiceType({ clientId: 5 });
    expect(result).toBe("standard");
  });

  it("should classify as simplified for B2C invoices without clientId", () => {
    const result = determineZatcaInvoiceType({});
    expect(result).toBe("simplified");
  });

  it("should classify as standard when buyerVatTrn is present", () => {
    const result = determineZatcaInvoiceType({ buyerVatTrn: "310000000200003" });
    expect(result).toBe("standard");
  });

  it("should respect explicit invoiceTypeEn setting", () => {
    expect(determineZatcaInvoiceType({ invoiceTypeEn: "standard" })).toBe("standard");
    expect(determineZatcaInvoiceType({ invoiceTypeEn: "simplified" })).toBe("simplified");
  });

  it("should respect Arabic invoice type classification", () => {
    expect(determineZatcaInvoiceType({ invoiceTypeAr: "فاتورة ضريبية" })).toBe("standard");
    expect(determineZatcaInvoiceType({ invoiceTypeAr: "فاتورة مبسطة" })).toBe("simplified");
  });

  it("should classify as standard when buyerVatNumber is present", () => {
    const result = determineZatcaInvoiceType({ buyerVatNumber: "310000000200003" });
    expect(result).toBe("standard");
  });
});

// ── Validation Tests ───────────────────────────────────────────────────────

describe("validateZatcaInvoice", () => {
  it("should return valid for a compliant Saudi standard invoice", () => {
    const result = validateZatcaInvoice(validSaudiStandardInvoice, saudiCompany);
    expect(result.valid).toBe(true);
    expect(result.errors.length).toBe(0);
  });

  it("should return valid for a compliant Saudi simplified invoice", () => {
    const result = validateZatcaInvoice(validSaudiSimplifiedInvoice, saudiCompany);
    expect(result.valid).toBe(true);
    expect(result.errors.length).toBe(0);
  });

  it("should pass validation for non-Saudi companies", () => {
    const result = validateZatcaInvoice({}, nonSaudiCompany);
    expect(result.valid).toBe(true);
    expect(result.errors.length).toBe(0);
  });

  it("should fail validation when VAT TRN is missing", () => {
    const invoice = { ...validSaudiStandardInvoice, sellerVatTrn: undefined };
    const company = { ...saudiCompany, vatNumber: undefined };
    const result = validateZatcaInvoice(invoice, company);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.field === "vatTrn")).toBe(true);
    expect(result.errors.some((e) => e.messageAr.includes("التسجيل الضريبي"))).toBe(true);
  });

  it("should fail validation when Arabic seller name is missing", () => {
    const invoice = { ...validSaudiStandardInvoice, sellerNameAr: undefined };
    const company = { ...saudiCompany, nameAr: undefined };
    const result = validateZatcaInvoice(invoice, company);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.field === "sellerNameAr")).toBe(true);
    expect(result.errors.some((e) => e.messageAr.includes("البائع"))).toBe(true);
  });

  it("should fail validation when Arabic buyer name is missing for standard (B2B) invoices", () => {
    const invoice = { ...validSaudiStandardInvoice, buyerNameAr: undefined, clientName: undefined };
    const result = validateZatcaInvoice(invoice, saudiCompany);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.field === "buyerNameAr")).toBe(true);
  });

  it("should not require Arabic buyer name for simplified (B2C) invoices", () => {
    const invoice = { ...validSaudiSimplifiedInvoice, buyerNameAr: undefined, clientName: undefined };
    const result = validateZatcaInvoice(invoice, saudiCompany);
    const buyerNameError = result.errors.find((e) => e.field === "buyerNameAr");
    expect(buyerNameError).toBeUndefined();
  });

  it("should require buyer VAT TRN for standard (B2B) invoices", () => {
    const invoice = { ...validSaudiStandardInvoice, buyerVatTrn: undefined, buyerVatNumber: undefined };
    const result = validateZatcaInvoice(invoice, saudiCompany);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.field === "buyerVatTrn")).toBe(true);
  });

  it("should fail validation when currency is not SAR", () => {
    const invoice = { ...validSaudiStandardInvoice, currency: "USD" };
    const result = validateZatcaInvoice(invoice, saudiCompany);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.field === "currency")).toBe(true);
    expect(result.errors.some((e) => e.messageAr.includes("ريال سعودي"))).toBe(true);
  });

  it("should fail validation when decimal places are not 2", () => {
    const invoice = { ...validSaudiStandardInvoice, currencyDecimalPlaces: 3 };
    const result = validateZatcaInvoice(invoice, saudiCompany);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.field === "currencyDecimalPlaces")).toBe(true);
  });

  it("should fail validation when VAT rate is not 15%", () => {
    const invoice = { ...validSaudiStandardInvoice, taxRate: "5" };
    const result = validateZatcaInvoice(invoice, saudiCompany);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.field === "vatRate")).toBe(true);
    expect(result.errors.some((e) => e.messageAr.includes("15%"))).toBe(true);
  });

  it("should detect B2B/B2C classification mismatch", () => {
    // Simplified invoice with buyer VAT TRN → should be standard
    const invoice = {
      ...validSaudiSimplifiedInvoice,
      buyerVatTrn: "310000000200003",
      invoiceTypeEn: "simplified",
      invoiceTypeAr: "فاتورة مبسطة",
    };
    const result = validateZatcaInvoice(invoice, saudiCompany);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.field === "invoiceTypeClassification")).toBe(true);
  });

  it("should include retention warning for Saudi invoices", () => {
    const result = validateZatcaInvoice(validSaudiStandardInvoice, saudiCompany);
    expect(result.warnings.some((w) => w.field === "recordRetention")).toBe(true);
    expect(result.warnings.some((w) => w.messageAr.includes("6 سنوات"))).toBe(true);
    expect(result.warnings.some((w) => w.messageAr.includes("50,000"))).toBe(true);
  });

  it("should include UUID warning when no UUID is present", () => {
    const invoice = { ...validSaudiStandardInvoice, uuid: undefined, eInvoiceUuid: undefined };
    const result = validateZatcaInvoice(invoice, saudiCompany);
    expect(result.warnings.some((w) => w.field === "uuid")).toBe(true);
  });

  it("should include PIH warning when no previous hash is present", () => {
    const invoice = { ...validSaudiStandardInvoice, previousInvoiceHash: undefined };
    const result = validateZatcaInvoice(invoice, saudiCompany);
    expect(result.warnings.some((w) => w.field === "previousInvoiceHash")).toBe(true);
  });
});

// ── UBL XML Generation Tests ───────────────────────────────────────────────

describe("generateZatcaUblXml", () => {
  it("should generate structurally valid UBL 2.1 XML for standard invoice", () => {
    const result = generateZatcaUblXml(validSaudiStandardInvoice, saudiCompany);
    expect(result.xml).toBeTruthy();
    expect(result.xml).toContain("<?xml version=\"1.0\"");
    expect(result.xml).toContain("<Invoice");
    expect(result.xml).toContain("urn:oasis:names:specification:ubl:schema:xsd:Invoice-2");
    expect(result.invoiceHash).toBeTruthy();
    expect(result.invoiceHash.length).toBe(64);
    expect(result.uuid).toBeTruthy();
  });

  it("should generate structurally valid UBL 2.1 XML for simplified invoice", () => {
    const result = generateZatcaUblXml(validSaudiSimplifiedInvoice, saudiCompany);
    expect(result.xml).toBeTruthy();
    expect(result.xml).toContain("<?xml version=\"1.0\"");
    expect(result.xml).toContain("<Invoice");
  });

  it("should include UUID in the XML", () => {
    const result = generateZatcaUblXml(validSaudiStandardInvoice, saudiCompany);
    expect(result.xml).toContain("<cbc:UUID>");
    expect(result.xml).toContain(result.uuid);
  });

  it("should include seller VAT TRN in the XML", () => {
    const result = generateZatcaUblXml(validSaudiStandardInvoice, saudiCompany);
    expect(result.xml).toContain("310000000100003");
    expect(result.xml).toContain("<cbc:CompanyID>");
  });

  it("should include invoice type code 381 for standard invoices", () => {
    const result = generateZatcaUblXml(validSaudiStandardInvoice, saudiCompany);
    expect(result.xml).toContain("<cbc:InvoiceTypeCode");
    expect(result.xml).toContain("381");
    expect(result.xml).toContain("فاتورة ضريبية");
  });

  it("should include invoice type code 388 for simplified invoices", () => {
    const result = generateZatcaUblXml(validSaudiSimplifiedInvoice, saudiCompany);
    expect(result.xml).toContain("<cbc:InvoiceTypeCode");
    expect(result.xml).toContain("388");
    expect(result.xml).toContain("فاتورة مبسطة");
  });

  it("should include SAR currency code", () => {
    const result = generateZatcaUblXml(validSaudiStandardInvoice, saudiCompany);
    expect(result.xml).toContain("<cbc:DocumentCurrencyCode>SAR</cbc:DocumentCurrencyCode>");
    expect(result.xml).toContain("<cbc:TaxCurrencyCode>SAR</cbc:TaxCurrencyCode>");
  });

  it("should include Arabic seller name", () => {
    const result = generateZatcaUblXml(validSaudiStandardInvoice, saudiCompany);
    expect(result.xml).toContain("شركة التجارة السعودية");
    expect(result.xml).toContain("languageID=\"ar\"");
  });

  it("should include buyer details for standard (B2B) invoices", () => {
    const result = generateZatcaUblXml(validSaudiStandardInvoice, saudiCompany);
    expect(result.xml).toContain("<cac:AccountingCustomerParty>");
    expect(result.xml).toContain("الشركة السعودية للأعمال");
    expect(result.xml).toContain("310000000200003");
  });

  it("should NOT include buyer party for simplified (B2C) invoices", () => {
    const result = generateZatcaUblXml(validSaudiSimplifiedInvoice, saudiCompany);
    expect(result.xml).not.toContain("<cac:AccountingCustomerParty>");
  });

  it("should include 15% VAT rate in tax subtotal", () => {
    const result = generateZatcaUblXml(validSaudiStandardInvoice, saudiCompany);
    expect(result.xml).toContain("15.00");
    expect(result.xml).toContain("<cbc:Percent>15.00</cbc:Percent>");
    expect(result.xml).toContain("ضريبة القيمة المضافة");
    expect(result.xml).toContain("Value Added Tax");
  });

  it("should include line items with tax breakdown", () => {
    const result = generateZatcaUblXml(validSaudiStandardInvoice, saudiCompany);
    expect(result.xml).toContain("<cac:InvoiceLine>");
    expect(result.xml).toContain("<cbc:InvoicedQuantity");
    expect(result.xml).toContain("<cbc:LineExtensionAmount");
    expect(result.xml).toContain("<cac:TaxTotal>");
    expect(result.xml).toContain("<cbc:TaxableAmount");
  });

  it("should include PIH reference in the XML", () => {
    const result = generateZatcaUblXml(validSaudiStandardInvoice, saudiCompany);
    expect(result.xml).toContain("<cbc:ID>PIH</cbc:ID>");
    expect(result.xml).toContain("<cbc:PreviousInvoiceHash>");
  });

  it("should include signature placeholder", () => {
    const result = generateZatcaUblXml(validSaudiStandardInvoice, saudiCompany);
    expect(result.xml).toContain("<cac:Signature>");
    expect(result.xml).toContain("#ECDSA-Signature");
  });

  it("should include legal monetary total", () => {
    const result = generateZatcaUblXml(validSaudiStandardInvoice, saudiCompany);
    expect(result.xml).toContain("<cac:LegalMonetaryTotal>");
    expect(result.xml).toContain("<cbc:LineExtensionAmount");
    expect(result.xml).toContain("<cbc:TaxExclusiveAmount");
    expect(result.xml).toContain("<cbc:TaxInclusiveAmount");
    expect(result.xml).toContain("<cbc:PayableAmount");
  });

  it("should include ZATCA profile ID", () => {
    const result = generateZatcaUblXml(validSaudiStandardInvoice, saudiCompany);
    // Standard invoices use clearance profile
    expect(result.xml).toContain("clearance:1.0");
    // Also includes reporting profile (required by ZATCA)
    expect(result.xml).toContain("reporting:1.0");
  });

  it("should use reporting profile for simplified invoices", () => {
    const result = generateZatcaUblXml(validSaudiSimplifiedInvoice, saudiCompany);
    // Simplified invoices use reporting profile only
    expect(result.xml).toContain("reporting:1.0");
  });

  it("should include postal address for seller", () => {
    const result = generateZatcaUblXml(validSaudiStandardInvoice, saudiCompany);
    expect(result.xml).toContain("<cac:PostalAddress>");
    expect(result.xml).toContain("<cbc:IdentificationCode>SA</cbc:IdentificationCode>");
    expect(result.xml).toContain("<cac:Country>");
  });
});

// ── Digital Signing Tests ───────────────────────────────────────────────────

describe("signZatcaInvoice", () => {
  it("should return a signed XML with signature embedded", () => {
    const xmlResult = generateZatcaUblXml(validSaudiStandardInvoice, saudiCompany);
    const certificate = "placeholder-certificate-data";
    const privateKey = "placeholder-private-key-data";

    const result = signZatcaInvoice(xmlResult.xml, certificate, privateKey);
    expect(result.signedXml).toBeTruthy();
    expect(result.invoiceHash).toBeTruthy();
    expect(result.digitalSignature).toBeTruthy();
    expect(result.certificateHash).toBeTruthy();
  });

  it("should include certificate hash in the signed XML", () => {
    const xmlResult = generateZatcaUblXml(validSaudiStandardInvoice, saudiCompany);
    const certificate = "placeholder-certificate-data";
    const privateKey = "placeholder-private-key-data";

    const result = signZatcaInvoice(xmlResult.xml, certificate, privateKey);
    expect(result.signedXml).toContain("<cbc:CertificateHash>");
    expect(result.signedXml).toContain(result.certificateHash);
  });

  it("should include invoice hash reference in signed XML", () => {
    const xmlResult = generateZatcaUblXml(validSaudiStandardInvoice, saudiCompany);
    const certificate = "placeholder-certificate-data";
    const privateKey = "placeholder-private-key-data";

    const result = signZatcaInvoice(xmlResult.xml, certificate, privateKey);
    expect(result.signedXml).toContain("<cbc:Reference>");
  });

  it("should produce consistent certificate hash for the same certificate", () => {
    const xml1 = "<Invoice>test1</Invoice>";
    const xml2 = "<Invoice>test2</Invoice>";
    const cert = "same-certificate";

    const result1 = signZatcaInvoice(xml1, cert, "key1");
    const result2 = signZatcaInvoice(xml2, cert, "key2");

    expect(result1.certificateHash).toBe(result2.certificateHash);
  });

  it("should produce different signatures for different invoice content", () => {
    const xml1 = "<Invoice>content A</Invoice>";
    const xml2 = "<Invoice>content B</Invoice>";

    const result1 = signZatcaInvoice(xml1, "cert", "key");
    const result2 = signZatcaInvoice(xml2, "cert", "key");

    expect(result1.digitalSignature).not.toBe(result2.digitalSignature);
  });
});

// ── Auto-population Tests ──────────────────────────────────────────────────

describe("autoPopulateZatcaFields", () => {
  it("should auto-populate UUID when missing", () => {
    const invoiceData = {
      issueDate: "2026-01-15",
      dueDate: "2026-02-15",
      taxRate: "15",
    };
    const result = autoPopulateZatcaFields(invoiceData, saudiCompany);
    expect(result.uuid).toBeTruthy();
    expect(result.uuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  });

  it("should preserve existing UUID when already present", () => {
    const existingUuid = "12345678-1234-4123-8123-123456789abc";
    const invoiceData = {
      uuid: existingUuid,
      issueDate: "2026-01-15",
    };
    const result = autoPopulateZatcaFields(invoiceData, saudiCompany);
    expect(result.uuid).toBe(existingUuid);
  });

  it("should auto-populate Hijri dates from Gregorian dates", () => {
    const invoiceData = {
      issueDate: "2026-01-15",
      dueDate: "2026-02-15",
    };
    const result = autoPopulateZatcaFields(invoiceData, saudiCompany);
    expect(result.hijriIssueDate).toBeTruthy();
    expect(result.hijriDueDate).toBeTruthy();
    expect(result.hijriIssueDate).toBe(formatHijri("2026-01-15"));
  });

  it("should auto-populate VAT TRN from company", () => {
    const invoiceData = { issueDate: "2026-01-15" };
    const result = autoPopulateZatcaFields(invoiceData, saudiCompany);
    expect(result.sellerVatTrn).toBe("310000000100003");
  });

  it("should auto-populate Arabic seller name from company", () => {
    const invoiceData = { issueDate: "2026-01-15" };
    const result = autoPopulateZatcaFields(invoiceData, saudiCompany);
    expect(result.sellerNameAr).toBe("شركة التجارة السعودية");
  });

  it("should auto-populate invoice type for B2C when no clientId", () => {
    const invoiceData = { issueDate: "2026-01-15" };
    const result = autoPopulateZatcaFields(invoiceData, saudiCompany);
    expect(result.invoiceTypeEn).toBe("simplified");
    expect(result.invoiceTypeAr).toBe("فاتورة مبسطة");
  });

  it("should auto-populate invoice type for B2B when clientId is present", () => {
    const invoiceData = { issueDate: "2026-01-15", clientId: 5 };
    const result = autoPopulateZatcaFields(invoiceData, saudiCompany);
    expect(result.invoiceTypeEn).toBe("standard");
    expect(result.invoiceTypeAr).toBe("فاتورة ضريبية");
  });

  it("should enforce SAR currency", () => {
    const invoiceData = { issueDate: "2026-01-15", currency: "USD" };
    const result = autoPopulateZatcaFields(invoiceData, saudiCompany);
    expect(result.currency).toBe(ZATCA_CURRENCY);
  });

  it("should enforce 2 decimal places", () => {
    const invoiceData = { issueDate: "2026-01-15" };
    const result = autoPopulateZatcaFields(invoiceData, saudiCompany);
    expect(result.currencyDecimalPlaces).toBe(ZATCA_DECIMAL_PLACES);
  });

  it("should enforce 15% VAT rate", () => {
    const invoiceData = { issueDate: "2026-01-15", taxRate: "5" };
    const result = autoPopulateZatcaFields(invoiceData, saudiCompany);
    expect(result.taxRate).toBe("15.00");
  });

  it("should enforce 2-decimal precision on monetary fields", () => {
    const invoiceData = {
      issueDate: "2026-01-15",
      subtotal: "100",
      total: "115",
      taxAmount: "15",
    };
    const result = autoPopulateZatcaFields(invoiceData, saudiCompany);
    expect(result.subtotal).toBe("100.00");
    expect(result.total).toBe("115.00");
    expect(result.taxAmount).toBe("15.00");
  });

  it("should set e-invoice authority", () => {
    const invoiceData = { issueDate: "2026-01-15" };
    const result = autoPopulateZatcaFields(invoiceData, saudiCompany);
    expect(result.eInvoiceAuthority).toBe(ZATCA_AUTHORITY);
  });

  it("should set PIH placeholder for first invoice", () => {
    const invoiceData = { issueDate: "2026-01-15" };
    const result = autoPopulateZatcaFields(invoiceData, saudiCompany);
    expect(result.previousInvoiceHash).toBeTruthy();
    expect(result.previousInvoiceHash).toBe("NWZlY2ViNjZmZmM4NmYzNDQ0MWY0ZGQzNzU0Y2QwOWE0MmM2YzY2OGZkMWU0YWQ0NWQ3YzA4ZjY0ZjU4NDk0Nw==");
  });

  it("should preserve existing PIH when already present", () => {
    const existingPih = "custom-hash-value";
    const invoiceData = {
      issueDate: "2026-01-15",
      previousInvoiceHash: existingPih,
    };
    const result = autoPopulateZatcaFields(invoiceData, saudiCompany);
    expect(result.previousInvoiceHash).toBe(existingPih);
  });
});

// ── Validation Middleware Tests ─────────────────────────────────────────────

describe("zatcaInvoiceValidationMiddleware", () => {
  it("should pass through non-Saudi companies without validation", () => {
    const result = zatcaInvoiceValidationMiddleware({}, nonSaudiCompany);
    expect(result.valid).toBe(true);
    expect(result.blockingErrors.length).toBe(0);
    expect(result.warnings.length).toBe(0);
  });

  it("should block Saudi invoice creation when VAT TRN is missing", () => {
    const companyNoVat = { ...saudiCompany, vatNumber: undefined };
    const incompleteInvoice = {
      invoiceNumber: "INV-001",
      issueDate: "2026-01-15",
      dueDate: "2026-02-15",
      taxRate: "15",
    };
    const result = zatcaInvoiceValidationMiddleware(incompleteInvoice, companyNoVat);
    expect(result.valid).toBe(false);
    expect(result.blockingErrors.some((e) => e.field === "vatTrn")).toBe(true);
  });

  it("should override non-SAR currency for Saudi companies", () => {
    const invoiceData = {
      invoiceNumber: "INV-001",
      issueDate: "2026-01-15",
      dueDate: "2026-02-15",
      clientName: "Ahmad",
      currency: "USD",
      sellerVatTrn: "310000000100003",
      sellerNameAr: "شركة التجارة السعودية",
      sellerAddressAr: "الرياض",
      taxRate: "15",
    };
    const result = zatcaInvoiceValidationMiddleware(invoiceData, saudiCompany);
    expect(result.enrichedData.currency).toBe("SAR");
    expect(result.enrichedData.currencyDecimalPlaces).toBe(2);
  });

  it("should enforce 15% VAT rate for Saudi companies", () => {
    const invoiceData = {
      invoiceNumber: "INV-001",
      issueDate: "2026-01-15",
      dueDate: "2026-02-15",
      taxRate: "5",
      currency: "SAR",
    };
    const result = zatcaInvoiceValidationMiddleware(invoiceData, saudiCompany);
    expect(result.enrichedData.taxRate).toBe("15.00");
  });
});

// ── Format Errors Tests ────────────────────────────────────────────────────

describe("formatZatcaErrorsForResponse", () => {
  it("should return empty error when no blocking errors", () => {
    const result = formatZatcaErrorsForResponse({
      valid: true,
      enrichedData: {},
      blockingErrors: [],
      warnings: [],
    });
    expect(result.error).toBe("");
    expect(result.details).toEqual({});
  });

  it("should format Arabic error messages for API response", () => {
    const result = formatZatcaErrorsForResponse({
      valid: false,
      enrichedData: {},
      blockingErrors: [
        { field: "vatTrn", messageAr: "رقم التسجيل الضريبي مطلوب", messageEn: "VAT TRN required" },
      ],
      warnings: [],
    });
    expect(result.error).toContain("التسجيل الضريبي");
    expect(result.details.regulation).toBe("ZATCA Phase 2");
  });

  it("should include all Arabic and English error details", () => {
    const result = formatZatcaErrorsForResponse({
      valid: false,
      enrichedData: {},
      blockingErrors: [
        { field: "vatTrn", messageAr: "رقم التسجيل الضريبي مطلوب", messageEn: "VAT TRN required" },
        { field: "sellerNameAr", messageAr: "اسم البائع باللغة العربية مطلوب", messageEn: "Arabic seller name required" },
      ],
      warnings: [],
    });
    expect(result.error).toContain("؛"); // Arabic semicolon separator
    expect((result.details as Record<string, unknown>).errorsAr).toBeTruthy();
    expect((result.details as Record<string, unknown>).errorsEn).toBeTruthy();
  });
});

// ── Money/SAR 2-decimal Integration Tests ───────────────────────────────────

describe("Money/SAR 2-decimal integration", () => {
  it("should format SAR with 2 decimal places", () => {
    const formatted = num(100, 2).toFixed(2);
    expect(formatted).toBe("100.00");
  });

  it("should handle SAR amounts with existing decimals", () => {
    const formatted = num(100.50, 2).toFixed(2);
    expect(formatted).toBe("100.50");
  });

  it("should handle small SAR amounts correctly", () => {
    const formatted = num(0.01, 2).toFixed(2);
    expect(formatted).toBe("0.01");
  });

  it("should compute 15% VAT correctly for SAR", () => {
    const subtotal = 2000;
    const vatAmount = num(subtotal * 15 / 100, 2).toFixed(2);
    expect(vatAmount).toBe("300.00");
  });

  it("should compute 15% VAT on fractional amounts", () => {
    const subtotal = 33.33;
    const vatAmount = num(subtotal * 15 / 100, 2).toFixed(2);
    expect(vatAmount).toBe("5.00"); // 33.33 * 0.15 = 4.9995 → rounded to 5.00
  });
});

// ── Hijri Date Integration Tests ───────────────────────────────────────────

describe("Hijri date integration for ZATCA", () => {
  it("should convert Gregorian to Hijri correctly for Saudi dates", () => {
    const hijri = formatHijri("2026-01-15");
    expect(hijri).toBeTruthy();
    expect(hijri.length).toBeGreaterThan(3);
  });

  it("should format dual date with both calendars", () => {
    const dual = formatDualDate("2026-01-15");
    expect(dual).toBeTruthy();
    expect(dual.length).toBeGreaterThan(5);
  });

  it("should handle empty/invalid dates gracefully", () => {
    const hijri = formatHijri("invalid-date");
    expect(hijri).toBeFalsy();
  });
});

// ── Constants Validation Tests ──────────────────────────────────────────────

describe("ZATCA constants", () => {
  it("should have correct ZATCA authority", () => {
    expect(ZATCA_AUTHORITY).toBe("zatca");
  });

  it("should have correct SAR currency", () => {
    expect(ZATCA_CURRENCY).toBe("SAR");
  });

  it("should have correct 2 decimal places", () => {
    expect(ZATCA_DECIMAL_PLACES).toBe(2);
  });

  it("should have correct 15% VAT rate", () => {
    expect(ZATCA_VAT_RATE).toBe(15);
  });

  it("should have correct regulation reference", () => {
    expect(ZATCA_REGULATION).toBe("ZATCA Phase 2");
  });

  it("should have correct max fine", () => {
    expect(ZATCA_MAX_FINE_SAR).toBe(50000);
  });
});

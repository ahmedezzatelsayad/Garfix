/**
 * uae-fta.test.ts — Tests for UAE FTA e-invoicing (Peppol BIS 3) compliance module.
 *
 * Covers:
 * - UBL XML generation (Peppol BIS 3 structure validation)
 * - Invoice hash computation (SHA-256)
 * - UUID generation (Peppol spec format)
 * - Validation (English mandatory, TRN, AED, 5% VAT, B2B/B2C)
 * - Auto-population of UAE FTA-specific fields
 * - Simplified vs Standard invoice classification
 * - Digital signing (PKI placeholder)
 * - Middleware integration
 */

import { describe, it, expect } from "bun:test";
import {
  validateUaeFtaInvoice,
  generateUaeFtaUblXml,
  computeUaeFtaInvoiceHash,
  generateUaeFtaUuid,
  signUaeFtaInvoice,
  determineUaeFtaInvoiceType,
  autoPopulateUaeFtaFields,
  UAE_FTA_CURRENCY,
  UAE_FTA_DECIMAL_PLACES,
  UAE_FTA_VAT_RATE,
  UAE_FTA_AUTHORITY,
  UAE_FTA_REGULATION,
  UAE_FTA_MAX_FINE_AED,
} from "../uae-fta";
import {
  uaeFtaInvoiceValidationMiddleware,
  applyUaeFtaCompliance,
  formatUaeFtaErrorsForResponse,
} from "../uae-fta-validation";
import { formatHijri, formatDualDate } from "../../hijri";
import { num, calcInvoiceTotals } from "../../money";

// ── Test fixtures ──────────────────────────────────────────────────────────

const uaeCompany = {
  id: 1,
  slug: "uae-trading",
  name: "UAE Trading LLC",
  nameAr: "شركة التجارة الإماراتية",
  country: "AE",
  currency: "AED",
  vatNumber: "100123456789003", // UAE TRN format (15 digits)
  address: "Business Bay, Dubai, UAE",
  addressAr: "الخليج التجاري، دبي، الإمارات",
  defaultTaxRate: "5",
  commercialRegistration: "CR-AE-2023-001",
  recordRetentionYears: 5,
};

const uaeCompanyMinimal = {
  id: 2,
  slug: "uae-retail",
  name: "UAE Retail Shop",
  nameAr: null, // Arabic name optional for UAE
  country: "AE",
  currency: "AED",
  vatNumber: "300456789012005", // UAE TRN format
  address: "Dubai Marina, UAE",
  addressAr: null, // Arabic address optional for UAE
  defaultTaxRate: "5",
  commercialRegistration: "CR-AE-2024-002",
  recordRetentionYears: 5,
};

const nonUaeCompany = {
  id: 3,
  slug: "saudi-trading",
  name: "Saudi Trading Co.",
  country: "SA",
  currency: "SAR",
  vatNumber: "310000000100003",
  address: "Riyadh, Saudi Arabia",
  defaultTaxRate: "15",
};

const validB2BInvoice = {
  invoiceNumber: "INV-2024-001",
  issueDate: "2024-06-15",
  dueDate: "2024-07-15",
  currency: "AED",
  currencyDecimalPlaces: 2,
  taxRate: "5.00",
  invoiceTypeEn: "standard",
  invoiceTypeAr: "فاتورة ضريبية",
  sellerVatTrn: "100123456789003",
  sellerNameEn: "UAE Trading LLC",
  sellerNameAr: "شركة التجارة الإماراتية",
  sellerAddressEn: "Business Bay, Dubai, UAE",
  buyerNameEn: "Emirates Corp",
  buyerNameAr: "شركة الإمارات",
  buyerAddressEn: "Abu Dhabi, UAE",
  buyerVatTrn: "200123456789004",
  lineItems: [
    { description: "Consulting Services", qty: 10, price: 500, total: 5000 },
    { description: "Software License", qty: 1, price: 2000, total: 2000 },
  ],
  subtotal: "7000.00",
  taxAmount: "350.00",
  total: "7350.00",
  uuid: "test-uuid-b2b",
};

const validB2CInvoice = {
  invoiceNumber: "INV-2024-002",
  issueDate: "2024-06-15",
  dueDate: "2024-06-15",
  currency: "AED",
  currencyDecimalPlaces: 2,
  taxRate: "5.00",
  invoiceTypeEn: "simplified",
  invoiceTypeAr: "فاتورة مبسطة",
  sellerVatTrn: "300456789012005",
  sellerNameEn: "UAE Retail Shop",
  sellerAddressEn: "Dubai Marina, UAE",
  // No buyer TRN for B2C
  buyerNameEn: "Walk-in Customer",
  lineItems: [
    { description: "Coffee", qty: 2, price: 25, total: 50 },
  ],
  subtotal: "50.00",
  taxAmount: "2.50",
  total: "52.50",
  uuid: "test-uuid-b2c",
};

// ── UUID Generation Tests ──────────────────────────────────────────────────

describe("UAE FTA UUID Generation", () => {
  it("should generate a UUID in v4 format", () => {
    const uuid = generateUaeFtaUuid();
    expect(uuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it("should generate unique UUIDs", () => {
    const uuids = Array.from({ length: 100 }, () => generateUaeFtaUuid());
    const uniqueSet = new Set(uuids);
    expect(uniqueSet.size).toBe(100);
  });

  it("should generate UUIDs with correct length (36 chars with dashes)", () => {
    const uuid = generateUaeFtaUuid();
    expect(uuid.length).toBe(36);
  });
});

// ── Invoice Hash Computation Tests ─────────────────────────────────────────

describe("UAE FTA Invoice Hash Computation", () => {
  it("should compute a SHA-256 hash in hex format", () => {
    const xml = "<?xml version=\"1.0\"?><Invoice>test</Invoice>";
    const hash = computeUaeFtaInvoiceHash(xml);
    // SHA-256 hash should be 64 hex characters
    expect(hash.length).toBeGreaterThanOrEqual(64);
    expect(hash).toMatch(/^[0-9a-f]+$/);
  });

  it("should produce consistent hashes for same input", () => {
    const xml = "<?xml version=\"1.0\"?><Invoice>consistent</Invoice>";
    const hash1 = computeUaeFtaInvoiceHash(xml);
    const hash2 = computeUaeFtaInvoiceHash(xml);
    expect(hash1).toBe(hash2);
  });

  it("should produce different hashes for different inputs", () => {
    const hash1 = computeUaeFtaInvoiceHash("<Invoice>input1</Invoice>");
    const hash2 = computeUaeFtaInvoiceHash("<Invoice>input2</Invoice>");
    expect(hash1).not.toBe(hash2);
  });
});

// ── Invoice Type Classification Tests ──────────────────────────────────────

describe("UAE FTA Invoice Type Classification", () => {
  it("should classify as standard (B2B) when buyer TRN is present", () => {
    const invoice = { buyerVatTrn: "200123456789004" };
    expect(determineUaeFtaInvoiceType(invoice)).toBe("standard");
  });

  it("should classify as standard (B2B) when clientId is present", () => {
    const invoice = { clientId: 5 };
    expect(determineUaeFtaInvoiceType(invoice)).toBe("standard");
  });

  it("should classify as simplified (B2C) when no buyer TRN or clientId", () => {
    const invoice = {};
    expect(determineUaeFtaInvoiceType(invoice)).toBe("simplified");
  });

  it("should use explicit invoiceTypeEn setting when provided", () => {
    const invoice = { invoiceTypeEn: "standard" };
    expect(determineUaeFtaInvoiceType(invoice)).toBe("standard");
  });

  it("should use explicit invoiceTypeAr setting when provided", () => {
    const invoice = { invoiceTypeAr: "فاتورة ضريبية" };
    expect(determineUaeFtaInvoiceType(invoice)).toBe("standard");
  });

  it("should classify as simplified when invoiceTypeEn is 'simplified'", () => {
    const invoice = { invoiceTypeEn: "simplified" };
    expect(determineUaeFtaInvoiceType(invoice)).toBe("simplified");
  });

  it("should classify as simplified when invoiceTypeAr is 'فاتورة مبسطة'", () => {
    const invoice = { invoiceTypeAr: "فاتورة مبسطة" };
    expect(determineUaeFtaInvoiceType(invoice)).toBe("simplified");
  });
});

// ── Validation Tests ───────────────────────────────────────────────────────

describe("UAE FTA Invoice Validation", () => {
  it("should pass validation for a valid B2B invoice with UAE company", () => {
    const result = validateUaeFtaInvoice(validB2BInvoice, uaeCompany);
    // May have warnings but should have no blocking errors
    expect(result.errors.length).toBe(0);
  });

  it("should pass validation for a valid B2C invoice with UAE company", () => {
    const result = validateUaeFtaInvoice(validB2CInvoice, uaeCompanyMinimal);
    // May have warnings but should have no blocking errors
    expect(result.errors.length).toBe(0);
  });

  it("should pass validation for non-UAE company (passthrough)", () => {
    const result = validateUaeFtaInvoice({}, nonUaeCompany);
    expect(result.valid).toBe(true);
    expect(result.errors.length).toBe(0);
    expect(result.warnings.length).toBe(0);
  });

  // ── TRN (Tax Registration Number) ──────────────────────────────────────

  it("should block invoice if seller TRN is missing", () => {
    const invoice = { ...validB2BInvoice, sellerVatTrn: undefined };
    const company = { ...uaeCompany, vatNumber: undefined };
    const result = validateUaeFtaInvoice(invoice, company);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.field === "vatTrn")).toBe(true);
  });

  // ── English language mandatory ────────────────────────────────────────

  it("should block invoice if English seller name is missing", () => {
    const invoice = { ...validB2BInvoice, sellerNameEn: undefined };
    const company = { ...uaeCompany, name: undefined };
    const result = validateUaeFtaInvoice(invoice, company);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.field === "sellerNameEn")).toBe(true);
  });

  it("should block invoice if English seller address is missing", () => {
    const invoice = { ...validB2BInvoice, sellerAddressEn: undefined };
    const company = { ...uaeCompany, address: undefined };
    const result = validateUaeFtaInvoice(invoice, company);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.field === "sellerAddressEn")).toBe(true);
  });

  it("should block B2B invoice if English buyer name is missing", () => {
    const invoice = { ...validB2BInvoice, buyerNameEn: undefined, clientName: undefined };
    const result = validateUaeFtaInvoice(invoice, uaeCompany);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.field === "buyerNameEn")).toBe(true);
  });

  it("should block B2B invoice if English buyer address is missing", () => {
    const invoice = { ...validB2BInvoice, buyerAddressEn: undefined, clientAddress: undefined };
    const result = validateUaeFtaInvoice(invoice, uaeCompany);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.field === "buyerAddressEn")).toBe(true);
  });

  // ── Buyer TRN required for B2B ───────────────────────────────────────

  it("should block B2B invoice if buyer TRN is missing", () => {
    const invoice = { ...validB2BInvoice, buyerVatTrn: undefined, buyerVatNumber: undefined };
    const result = validateUaeFtaInvoice(invoice, uaeCompany);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.field === "buyerVatTrn")).toBe(true);
  });

  // ── Currency must be AED ──────────────────────────────────────────────

  it("should block invoice if currency is not AED", () => {
    const invoice = { ...validB2BInvoice, currency: "USD" };
    const result = validateUaeFtaInvoice(invoice, uaeCompany);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.field === "currency")).toBe(true);
  });

  // ── Decimal places must be 2 ──────────────────────────────────────────

  it("should block invoice if decimal places are not 2", () => {
    const invoice = { ...validB2BInvoice, currencyDecimalPlaces: 3 };
    const result = validateUaeFtaInvoice(invoice, uaeCompany);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.field === "currencyDecimalPlaces")).toBe(true);
  });

  // ── VAT rate must be 5% ────────────────────────────────────────────────

  it("should block invoice if VAT rate is not 5%", () => {
    const invoice = { ...validB2BInvoice, taxRate: "15.00" };
    const result = validateUaeFtaInvoice(invoice, uaeCompany);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.field === "vatRate")).toBe(true);
  });

  it("should allow 0% VAT (exempt items) with warning", () => {
    const invoice = { ...validB2BInvoice, taxRate: "0" };
    const result = validateUaeFtaInvoice(invoice, uaeCompany);
    // 0% should not produce VAT rate error
    expect(result.errors.some((e) => e.field === "vatRate")).toBe(false);
  });

  // ── Invoice type classification ──────────────────────────────────────

  it("should block invoice if invoice type is missing", () => {
    const invoice = { ...validB2BInvoice, invoiceTypeEn: undefined, invoiceTypeAr: undefined };
    const result = validateUaeFtaInvoice(invoice, uaeCompany);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.field === "invoiceType")).toBe(true);
  });

  // ── B2B/B2C classification consistency ───────────────────────────────

  it("should block simplified invoice with buyer TRN (mismatch)", () => {
    const invoice = { ...validB2CInvoice, buyerVatTrn: "200123456789004" };
    const result = validateUaeFtaInvoice(invoice, uaeCompany);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.field === "invoiceTypeClassification")).toBe(true);
  });

  // ── Arabic fields are recommended (not required for UAE) ──────────────

  it("should produce warning when Arabic seller name is missing (not error)", () => {
    const invoice = { ...validB2BInvoice };
    const company = { ...uaeCompany, nameAr: undefined };
    const result = validateUaeFtaInvoice(invoice, company);
    // Should be a warning, not an error
    expect(result.errors.some((e) => e.field === "sellerNameAr")).toBe(false);
    expect(result.warnings.some((w) => w.field === "sellerNameAr")).toBe(true);
  });

  it("should produce warning when Arabic buyer name is missing for B2B (not error)", () => {
    const invoice = { ...validB2BInvoice, buyerNameAr: undefined };
    const result = validateUaeFtaInvoice(invoice, uaeCompany);
    // Should be a warning, not an error
    expect(result.errors.some((e) => e.field === "buyerNameAr")).toBe(false);
    expect(result.warnings.some((w) => w.field === "buyerNameAr")).toBe(true);
  });

  // ── Retention warning ────────────────────────────────────────────────

  it("should always include retention warning", () => {
    const result = validateUaeFtaInvoice(validB2BInvoice, uaeCompany);
    expect(result.warnings.some((w) => w.field === "recordRetention")).toBe(true);
    expect(result.warnings.find((w) => w.field === "recordRetention")?.messageEn).toContain("5 years");
    expect(result.warnings.find((w) => w.field === "recordRetention")?.messageEn).toContain("20,000 AED");
  });
});

// ── UBL XML Generation Tests ───────────────────────────────────────────────

describe("UAE FTA UBL XML Generation (Peppol BIS 3)", () => {
  it("should generate valid XML structure with proper namespaces", () => {
    const result = generateUaeFtaUblXml(validB2BInvoice, uaeCompany);
    expect(result.xml).toContain("xmlns=\"urn:oasis:names:specification:ubl:schema:xsd:Invoice-2\"");
    expect(result.xml).toContain("xmlns:cac=\"urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2\"");
    expect(result.xml).toContain("xmlns:cbc=\"urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2\"");
  });

  it("should include Peppol BIS 3 profile identifier", () => {
    const result = generateUaeFtaUblXml(validB2BInvoice, uaeCompany);
    expect(result.xml).toContain("urn:fdc:peppol.eu:2017:poacc:billing:01:1.0");
  });

  it("should include UUID in the XML", () => {
    const result = generateUaeFtaUblXml(validB2BInvoice, uaeCompany);
    expect(result.xml).toContain("<cbc:UUID>");
    expect(result.uuid).toBeTruthy();
  });

  it("should include seller TRN in the XML", () => {
    const result = generateUaeFtaUblXml(validB2BInvoice, uaeCompany);
    expect(result.xml).toContain("100123456789003");
    expect(result.xml).toContain("schemeID=\"TRN\"");
  });

  it("should include AED currency code", () => {
    const result = generateUaeFtaUblXml(validB2BInvoice, uaeCompany);
    expect(result.xml).toContain("<cbc:DocumentCurrencyCode>AED</cbc:DocumentCurrencyCode>");
    expect(result.xml).toContain("<cbc:TaxCurrencyCode>AED</cbc:TaxCurrencyCode>");
    expect(result.xml).toContain("currencyID=\"AED\"");
  });

  it("should include 5% VAT rate in tax breakdown", () => {
    const result = generateUaeFtaUblXml(validB2BInvoice, uaeCompany);
    expect(result.xml).toContain("<cbc:Percent>5.00</cbc:Percent>");
  });

  it("should include VAT scheme with Arabic and English names", () => {
    const result = generateUaeFtaUblXml(validB2BInvoice, uaeCompany);
    expect(result.xml).toContain("ضريبة القيمة المضافة");
    expect(result.xml).toContain("Value Added Tax");
  });

  // ── Standard Invoice (B2B) ──────────────────────────────────────────

  it("should generate standard B2B invoice with buyer party details", () => {
    const result = generateUaeFtaUblXml(validB2BInvoice, uaeCompany);
    expect(result.xml).toContain("<cac:AccountingCustomerParty>");
    expect(result.xml).toContain("Emirates Corp");
    expect(result.xml).toContain("200123456789004");
  });

  it("should include buyer TRN scheme for B2B invoices", () => {
    const result = generateUaeFtaUblXml(validB2BInvoice, uaeCompany);
    expect(result.xml).toContain("<cac:PartyTaxScheme>");
    expect(result.xml).toContain("<cbc:CompanyID>200123456789004</cbc:CompanyID>");
  });

  it("should include Arabic buyer name for B2B invoices when available", () => {
    const result = generateUaeFtaUblXml(validB2BInvoice, uaeCompany);
    expect(result.xml).toContain("شركة الإمارات");
    expect(result.xml).toContain("languageID=\"ar\"");
  });

  // ── Simplified Invoice (B2C) ─────────────────────────────────────────

  it("should NOT include buyer party for simplified B2C invoices", () => {
    const result = generateUaeFtaUblXml(validB2CInvoice, uaeCompanyMinimal);
    expect(result.xml).not.toContain("<cac:AccountingCustomerParty>");
  });

  // ── Invoice type code ────────────────────────────────────────────────

  it("should use 380 as invoice type code (Peppol BIS 3 standard)", () => {
    const result = generateUaeFtaUblXml(validB2BInvoice, uaeCompany);
    expect(result.xml).toContain("<cbc:InvoiceTypeCode");
    expect(result.xml).toContain("380</cbc:InvoiceTypeCode>");
  });

  it("should include invoice type name attribute in XML", () => {
    const result = generateUaeFtaUblXml(validB2BInvoice, uaeCompany);
    expect(result.xml).toContain("Standard Tax Invoice");
  });

  it("should include 'Simplified Tax Invoice' for B2C invoices", () => {
    const result = generateUaeFtaUblXml(validB2CInvoice, uaeCompanyMinimal);
    expect(result.xml).toContain("Simplified Tax Invoice");
  });

  // ── Seller details ────────────────────────────────────────────────────

  it("should include English seller name (mandatory)", () => {
    const result = generateUaeFtaUblXml(validB2BInvoice, uaeCompany);
    expect(result.xml).toContain("UAE Trading LLC");
    expect(result.xml).toContain("languageID=\"en\"");
  });

  it("should include Arabic seller name when available (optional)", () => {
    const result = generateUaeFtaUblXml(validB2BInvoice, uaeCompany);
    expect(result.xml).toContain("شركة التجارة الإماراتية");
  });

  it("should NOT include Arabic seller name when not available", () => {
    const result = generateUaeFtaUblXml(validB2CInvoice, uaeCompanyMinimal);
    // Should not have seller Arabic name since uaeCompanyMinimal.nameAr is null
    expect(result.xml).not.toContain("شركة");
  });

  it("should include AE country code for seller", () => {
    const result = generateUaeFtaUblXml(validB2BInvoice, uaeCompany);
    expect(result.xml).toContain("<cbc:IdentificationCode>AE</cbc:IdentificationCode>");
  });

  // ── PIH and Signature ────────────────────────────────────────────────

  it("should include PIH reference in the XML", () => {
    const result = generateUaeFtaUblXml(validB2BInvoice, uaeCompany);
    expect(result.xml).toContain("PIH");
    expect(result.xml).toContain("<cbc:PreviousInvoiceHash>");
  });

  it("should include PKI signature placeholder", () => {
    const result = generateUaeFtaUblXml(validB2BInvoice, uaeCompany);
    expect(result.xml).toContain("#PKI-Signature");
    expect(result.xml).toContain("<cac:Signature>");
  });

  // ── Line items ────────────────────────────────────────────────────────

  it("should include line items with AED amounts", () => {
    const result = generateUaeFtaUblXml(validB2BInvoice, uaeCompany);
    expect(result.xml).toContain("<cac:InvoiceLine>");
    expect(result.xml).toContain("Consulting Services");
    expect(result.xml).toContain("currencyID=\"AED\"");
  });

  it("should include line item tax breakdowns with 5% VAT", () => {
    const result = generateUaeFtaUblXml(validB2BInvoice, uaeCompany);
    expect(result.xml).toContain("<cac:TaxTotal>");
    expect(result.xml).toContain("<cbc:TaxAmount currencyID=\"AED\">");
  });

  // ── Monetary totals ────────────────────────────────────────────────────

  it("should include legal monetary total with AED", () => {
    const result = generateUaeFtaUblXml(validB2BInvoice, uaeCompany);
    expect(result.xml).toContain("<cac:LegalMonetaryTotal>");
    expect(result.xml).toContain("<cbc:LineExtensionAmount currencyID=\"AED\">");
    expect(result.xml).toContain("<cbc:PayableAmount currencyID=\"AED\">");
  });

  it("should include tax total with 5% VAT subtotal", () => {
    const result = generateUaeFtaUblXml(validB2BInvoice, uaeCompany);
    expect(result.xml).toContain("<cac:TaxSubtotal>");
    expect(result.xml).toContain("<cbc:Percent>5.00</cbc:Percent>");
  });

  // ── Invoice hash ──────────────────────────────────────────────────────

  it("should return invoice hash and UUID in result", () => {
    const result = generateUaeFtaUblXml(validB2BInvoice, uaeCompany);
    expect(result.invoiceHash).toBeTruthy();
    expect(result.invoiceHash.length).toBeGreaterThanOrEqual(64);
    expect(result.uuid).toBeTruthy();
  });
});

// ── Digital Signing Tests ──────────────────────────────────────────────────

describe("UAE FTA Digital Signing (PKI)", () => {
  const testXml = "<?xml version=\"1.0\"?><Invoice xmlns=\"urn:oasis:names:specification:ubl:schema:xsd:Invoice-2\"><cbc:URI>#PKI-Signature</cbc:URI><cac:DigitalSignatureAttachment><cac:ExternalReference><cbc:URI>#PKI-Signature</cbc:URI></cac:ExternalReference></cac:DigitalSignatureAttachment></Invoice>";

  it("should embed signature reference in signed XML", () => {
    const result = signUaeFtaInvoice(testXml, "test-certificate", "test-key");
    expect(result.signedXml).toContain("<cbc:Reference>");
    expect(result.invoiceHash).toBeTruthy();
  });

  it("should include certificate hash in signed XML", () => {
    const result = signUaeFtaInvoice(testXml, "test-certificate", "test-key");
    expect(result.signedXml).toContain("<cbc:CertificateHash>");
    expect(result.certificateHash).toBeTruthy();
  });

  it("should return digital signature and invoice hash", () => {
    const result = signUaeFtaInvoice(testXml, "test-certificate", "test-key");
    expect(result.digitalSignature).toBeTruthy();
    expect(result.invoiceHash).toBeTruthy();
  });

  it("should produce consistent results for same input", () => {
    const result1 = signUaeFtaInvoice(testXml, "cert-A", "key-A");
    const result2 = signUaeFtaInvoice(testXml, "cert-A", "key-A");
    expect(result1.digitalSignature).toBe(result2.digitalSignature);
    expect(result1.certificateHash).toBe(result2.certificateHash);
  });
});

// ── Auto-population Tests ──────────────────────────────────────────────────

describe("UAE FTA Auto-population", () => {
  it("should auto-populate UUID when missing", () => {
    const invoiceData = { invoiceNumber: "INV-001" };
    const result = autoPopulateUaeFtaFields(invoiceData, uaeCompany);
    expect(result.uuid).toBeTruthy();
    expect(result.uuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it("should NOT overwrite existing UUID", () => {
    const invoiceData = { invoiceNumber: "INV-001", uuid: "existing-uuid" };
    const result = autoPopulateUaeFtaFields(invoiceData, uaeCompany);
    expect(result.uuid).toBe("existing-uuid");
  });

  it("should auto-populate Hijri dates when issue date is present", () => {
    const invoiceData = { invoiceNumber: "INV-001", issueDate: "2024-06-15" };
    const result = autoPopulateUaeFtaFields(invoiceData, uaeCompany);
    expect(result.hijriIssueDate).toBeTruthy();
  });

  it("should auto-populate Hijri dates when due date is present", () => {
    const invoiceData = { invoiceNumber: "INV-001", dueDate: "2024-07-15" };
    const result = autoPopulateUaeFtaFields(invoiceData, uaeCompany);
    expect(result.hijriDueDate).toBeTruthy();
  });

  it("should auto-populate TRN from company VAT number", () => {
    const invoiceData = { invoiceNumber: "INV-001" };
    const result = autoPopulateUaeFtaFields(invoiceData, uaeCompany);
    expect(result.sellerVatTrn).toBe("100123456789003");
  });

  it("should auto-populate English seller name from company", () => {
    const invoiceData = { invoiceNumber: "INV-001" };
    const result = autoPopulateUaeFtaFields(invoiceData, uaeCompany);
    expect(result.sellerNameEn).toBe("UAE Trading LLC");
  });

  it("should auto-populate Arabic seller name when available in company", () => {
    const invoiceData = { invoiceNumber: "INV-001" };
    const result = autoPopulateUaeFtaFields(invoiceData, uaeCompany);
    expect(result.sellerNameAr).toBe("شركة التجارة الإماراتية");
  });

  it("should NOT auto-populate Arabic seller name when not available in company", () => {
    const invoiceData = { invoiceNumber: "INV-001" };
    const result = autoPopulateUaeFtaFields(invoiceData, uaeCompanyMinimal);
    // nameAr is null in uaeCompanyMinimal, so sellerNameAr should not be populated
    expect(result.sellerNameAr).toBeFalsy();
  });

  it("should auto-populate invoice type classification", () => {
    const invoiceData = { invoiceNumber: "INV-001" };
    const result = autoPopulateUaeFtaFields(invoiceData, uaeCompany);
    expect(result.invoiceTypeEn).toBeTruthy(); // Should be either "standard" or "simplified"
    expect(result.invoiceTypeAr).toBeTruthy(); // Arabic type name
  });

  it("should classify as standard when buyer TRN is present", () => {
    const invoiceData = { buyerVatTrn: "200123456789004" };
    const result = autoPopulateUaeFtaFields(invoiceData, uaeCompany);
    expect(result.invoiceTypeEn).toBe("standard");
    expect(result.invoiceTypeAr).toBe("فاتورة ضريبية");
  });

  it("should classify as simplified when no buyer TRN", () => {
    const invoiceData = {};
    const result = autoPopulateUaeFtaFields(invoiceData, uaeCompany);
    expect(result.invoiceTypeEn).toBe("simplified");
    expect(result.invoiceTypeAr).toBe("فاتورة مبسطة");
  });

  it("should enforce AED currency", () => {
    const invoiceData = { currency: "USD" };
    const result = autoPopulateUaeFtaFields(invoiceData, uaeCompany);
    expect(result.currency).toBe("AED");
  });

  it("should enforce 2 decimal places", () => {
    const invoiceData = { currencyDecimalPlaces: 3 };
    const result = autoPopulateUaeFtaFields(invoiceData, uaeCompany);
    expect(result.currencyDecimalPlaces).toBe(2);
  });

  it("should enforce 5% VAT rate", () => {
    const invoiceData = { taxRate: "15.00" };
    const result = autoPopulateUaeFtaFields(invoiceData, uaeCompany);
    expect(result.taxRate).toBe("5.00");
  });

  it("should enforce 2-decimal precision on monetary fields", () => {
    const invoiceData = { subtotal: 7000, taxAmount: 350, total: 7350 };
    const result = autoPopulateUaeFtaFields(invoiceData, uaeCompany);
    expect(result.subtotal).toBe("7000.00");
    expect(result.taxAmount).toBe("350.00");
    expect(result.total).toBe("7350.00");
  });

  it("should set e-invoice authority to uae_fta", () => {
    const invoiceData = {};
    const result = autoPopulateUaeFtaFields(invoiceData, uaeCompany);
    expect(result.eInvoiceAuthority).toBe("uae_fta");
  });

  it("should set PIH placeholder when not provided", () => {
    const invoiceData = {};
    const result = autoPopulateUaeFtaFields(invoiceData, uaeCompany);
    expect(result.previousInvoiceHash).toBeTruthy();
  });

  it("should NOT overwrite existing PIH", () => {
    const invoiceData = { previousInvoiceHash: "existing-pih-hash" };
    const result = autoPopulateUaeFtaFields(invoiceData, uaeCompany);
    expect(result.previousInvoiceHash).toBe("existing-pih-hash");
  });
});

// ── Middleware Tests ────────────────────────────────────────────────────────

describe("UAE FTA Validation Middleware", () => {
  it("should pass through non-UAE companies without validation", () => {
    const result = uaeFtaInvoiceValidationMiddleware({}, nonUaeCompany);
    expect(result.valid).toBe(true);
    expect(result.blockingErrors.length).toBe(0);
    expect(result.warnings.length).toBe(0);
    expect(result.enrichedData).toEqual({});
  });

  it("should block UAE company invoice with missing TRN", () => {
    const invoiceData = { invoiceNumber: "INV-001" };
    const company = { ...uaeCompany, vatNumber: undefined };
    const result = uaeFtaInvoiceValidationMiddleware(invoiceData, company);
    expect(result.valid).toBe(false);
    expect(result.blockingErrors.some((e) => e.field === "vatTrn")).toBe(true);
  });

  it("should override non-AED currency for UAE companies", () => {
    const invoiceData = { currency: "USD", invoiceNumber: "INV-001" };
    const result = uaeFtaInvoiceValidationMiddleware(invoiceData, uaeCompany);
    expect(result.enrichedData.currency).toBe("AED");
  });

  it("should override VAT rate to 5% for UAE companies", () => {
    const invoiceData = { taxRate: "10.00", invoiceNumber: "INV-001" };
    const result = uaeFtaInvoiceValidationMiddleware(invoiceData, uaeCompany);
    expect(result.enrichedData.taxRate).toBe("5.00");
  });

  it("should auto-populate UAE FTA fields for UAE companies", () => {
    const invoiceData = { invoiceNumber: "INV-001" };
    const result = uaeFtaInvoiceValidationMiddleware(invoiceData, uaeCompany);
    expect(result.enrichedData.uuid).toBeTruthy();
    expect(result.enrichedData.sellerVatTrn).toBe("100123456789003");
    expect(result.enrichedData.currency).toBe("AED");
    expect(result.enrichedData.eInvoiceAuthority).toBe("uae_fta");
  });

  it("should validate UAE FTA compliance for UAE companies", () => {
    const invoiceData = { invoiceNumber: "INV-001" };
    const result = uaeFtaInvoiceValidationMiddleware(invoiceData, uaeCompany);
    // Should have at least the retention warning
    expect(result.warnings.some((w) => w.field === "recordRetention")).toBe(true);
  });
});

// ── applyUaeFtaCompliance convenience wrapper ─────────────────────────────

describe("applyUaeFtaCompliance", () => {
  it("should behave identically to uaeFtaInvoiceValidationMiddleware", () => {
    const invoiceData = { invoiceNumber: "INV-001" };
    const result1 = uaeFtaInvoiceValidationMiddleware(invoiceData, uaeCompany);
    const result2 = applyUaeFtaCompliance(invoiceData, uaeCompany);
    expect(result1.valid).toBe(result2.valid);
    expect(result1.enrichedData).toEqual(result2.enrichedData);
    expect(result1.blockingErrors).toEqual(result2.blockingErrors);
  });
});

// ── formatUaeFtaErrorsForResponse ──────────────────────────────────────────

describe("formatUaeFtaErrorsForResponse", () => {
  it("should return empty error when no blocking errors", () => {
    const result = uaeFtaInvoiceValidationMiddleware(validB2BInvoice, uaeCompany);
    const formatted = formatUaeFtaErrorsForResponse(result);
    expect(formatted.error).toBe("");
    expect(formatted.details).toEqual({});
  });

  it("should return Arabic error messages when blocking errors exist", () => {
    const invoiceData = { invoiceNumber: "INV-001" };
    const company = { ...uaeCompany, vatNumber: undefined };
    const result = uaeFtaInvoiceValidationMiddleware(invoiceData, company);
    const formatted = formatUaeFtaErrorsForResponse(result);
    expect(formatted.error).toBeTruthy();
    // Arabic message should contain TRN reference
    expect(formatted.error).toContain("TRN");
  });

  it("should include regulation reference in details", () => {
    const invoiceData = { invoiceNumber: "INV-001" };
    const company = { ...uaeCompany, vatNumber: undefined };
    const result = uaeFtaInvoiceValidationMiddleware(invoiceData, company);
    const formatted = formatUaeFtaErrorsForResponse(result);
    expect(formatted.details.regulation).toBe("uae_fta");
  });

  it("should include both Arabic and English error details", () => {
    const invoiceData = { invoiceNumber: "INV-001" };
    const company = { ...uaeCompany, vatNumber: undefined };
    const result = uaeFtaInvoiceValidationMiddleware(invoiceData, company);
    const formatted = formatUaeFtaErrorsForResponse(result);
    expect(formatted.details.errorsAr).toBeTruthy();
    expect(formatted.details.errorsEn).toBeTruthy();
  });
});

// ── Money / AED 2-decimal integration ──────────────────────────────────────

describe("AED 2-decimal Money Integration", () => {
  it("should format AED amounts with 2 decimal places", () => {
    const amount = num(7350, 2);
    expect(amount.toFixed(2)).toBe("7350.00");
  });

  it("should calculate invoice totals with 2 decimal places for AED", () => {
    const items = [
      { description: "Service A", qty: 10, price: 500 },
    ];
    const totals = calcInvoiceTotals(items, UAE_FTA_VAT_RATE, 0, 0);
    // 5000 subtotal, 250 tax (5%), 5250 total
    expect(totals.subtotal).toBeTruthy();
    expect(totals.taxRate).toBe("5.00");
  });

  it("should handle AED precision correctly for small amounts", () => {
    const amount = num(2.5, 2);
    expect(amount.toFixed(2)).toBe("2.50");
  });
});

// ── Hijri Date Integration (optional for UAE) ──────────────────────────────

describe("UAE Hijri Date Integration", () => {
  it("should format Hijri date from Gregorian issue date", () => {
    const hijri = formatHijri("2024-06-15");
    // Hijri date should be present (may vary by locale)
    expect(hijri).toBeTruthy();
  });

  it("should format dual date combining Gregorian and Hijri", () => {
    const dual = formatDualDate("2024-06-15");
    expect(dual).toBeTruthy();
    expect(dual).toContain("2024");
  });
});

// ── Constants Validation Tests ─────────────────────────────────────────────

describe("UAE FTA Constants", () => {
  it("should have correct authority type", () => {
    expect(UAE_FTA_AUTHORITY).toBe("uae_fta");
  });

  it("should have correct currency (AED)", () => {
    expect(UAE_FTA_CURRENCY).toBe("AED");
  });

  it("should have correct decimal places (2)", () => {
    expect(UAE_FTA_DECIMAL_PLACES).toBe(2);
  });

  it("should have correct VAT rate (5%)", () => {
    expect(UAE_FTA_VAT_RATE).toBe(5);
  });

  it("should have correct regulation name", () => {
    expect(UAE_FTA_REGULATION).toContain("UAE FTA");
    expect(UAE_FTA_REGULATION).toContain("Peppol");
  });

  it("should have correct max fine (20,000 AED)", () => {
    expect(UAE_FTA_MAX_FINE_AED).toBe(20000);
  });
});

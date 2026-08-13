/**
 * AI-14 FIX (Audit v2 · Phase 4) — Regex Fallback Unit Tests
 *
 * Source: src/lib/invoice-brain/aiFallback.ts → extractWithRegexFallback()
 *
 * Coverage matrix (40+ cases):
 *   - Invoice number extraction
 *     - English (Invoice, Inv, #, No., Number)
 *     - Arabic (فاتورة رقم)
 *     - With/without colon, with/without dash, with/without #
 *   - Total amount extraction
 *     - English (Total, Grand Total)
 *     - Arabic (الإجمالي, مجموع)
 *     - With $, with comma thousands separator, decimal places
 *     - Arabic-Indic numerals (٥٠٠ → 500)
 *     - Persian numerals (۵۰۰ → 500)
 *     - Devanagari (Indian) numerals (५०० → 500)
 *   - Tax / VAT extraction
 *     - English (VAT, Tax)
 *     - Arabic (ضريبة)
 *     - Mixed-script digit forms
 *   - Date extraction
 *     - Gregorian ISO (YYYY-MM-DD)
 *     - Gregorian DD/MM/YYYY
 *     - Gregorian MM/DD/YYYY (US)
 *     - Gregorian DD Month YYYY (long form)
 *     - Hijri YYYY/MM/DD (Arabic-Indic)
 *     - Hijri DD/MM/YYYY (Arabic-Indic)
 *     - dateType classification
 *   - Vendor name heuristic
 *   - Combined full-document parses
 *   - Negative cases (no fields → returns null)
 */

import { describe, it, expect } from "bun:test";
import { extractWithRegexFallback } from "@/lib/invoice-brain/aiFallback";

// Convenience: extract a single field by key from the result object.
function field(text: string, key: string): unknown {
  const r = extractWithRegexFallback(text);
  return r ? r[key] : undefined;
}

describe("AI-14 FIX (Audit v2 · Phase 4): extractWithRegexFallback", () => {
  // ── Invoice number — English ──────────────────────────────────────────
  describe("invoice number — English", () => {
    it('parses "Invoice No: ABC-123"', () => {
      expect(field("Invoice No: ABC-123", "invoiceNumber")).toBe("ABC-123");
    });
    it('parses "Invoice Number: INV7890"', () => {
      expect(field("Invoice Number: INV7890", "invoiceNumber")).toBe("INV7890");
    });
    it('parses "INV#4567"', () => {
      expect(field("INV#4567", "invoiceNumber")).toBe("4567");
    });
    it('parses "Invoice 7890" (no separator)', () => {
      expect(field("Invoice 7890", "invoiceNumber")).toBe("7890");
    });
    it('parses "Invoice: INV-2026-001"', () => {
      expect(field("Invoice: INV-2026-001", "invoiceNumber")).toBe("INV-2026-001");
    });
    it('parses "Inv. ABC/999"', () => {
      expect(field("Inv. ABC/999", "invoiceNumber")).toBe("ABC/999");
    });
  });

  // ── Invoice number — Arabic ───────────────────────────────────────────
  describe("invoice number — Arabic", () => {
    it('parses "فاتورة رقم: 1234" (ASCII digits)', () => {
      expect(field("فاتورة رقم: 1234", "invoiceNumber")).toBe("1234");
    });
    it('parses "فاتورة رقم: ١٢٣٤" (Arabic-Indic)', () => {
      // Arabic-Indic digits are now allowed in the ID capture group.
      expect(field("فاتورة رقم: ١٢٣٤", "invoiceNumber")).toBe("١٢٣٤");
    });
    it('parses "فاتورة رقم 5678" (no colon)', () => {
      expect(field("فاتورة رقم 5678", "invoiceNumber")).toBe("5678");
    });
  });

  // ── Total amount — English ────────────────────────────────────────────
  describe("total — English", () => {
    it('parses "Total: 1234.56"', () => {
      expect(field("Total: 1234.56", "total")).toBe(1234.56);
    });
    it('parses "Grand Total $99.99"', () => {
      expect(field("Grand Total $99.99", "total")).toBe(99.99);
    });
    it('parses "Total 1,234,567.89" (comma thousands)', () => {
      expect(field("Total 1,234,567.89", "total")).toBe(1234567.89);
    });
    it('parses "TOTAL: 500" (uppercase, no decimals)', () => {
      expect(field("TOTAL: 500", "total")).toBe(500);
    });
    it('parses "Total:500" (no space after colon)', () => {
      expect(field("Total:500", "total")).toBe(500);
    });
  });

  // ── Total amount — Arabic ─────────────────────────────────────────────
  describe("total — Arabic", () => {
    it('parses "الإجمالي: ٥٠٠" (Arabic-Indic)', () => {
      expect(field("الإجمالي: ٥٠٠", "total")).toBe(500);
    });
    it('parses "الإجمالي: ١٢٣٤" (Arabic-Indic thousands)', () => {
      expect(field("الإجمالي: ١٢٣٤", "total")).toBe(1234);
    });
    it('parses "مجموع: ٧٥٠.٥٠" (Arabic-Indic with decimal)', () => {
      expect(field("مجموع: ٧٥٠.٥٠", "total")).toBe(750.5);
    });
  });

  // ── Total amount — Persian + Devanagari ───────────────────────────────
  describe("total — Persian + Devanagari", () => {
    it('parses Persian "Total: ۵۰۰" (۵=5, ۰=0)', () => {
      expect(field("Total: ۵۰۰", "total")).toBe(500);
    });
    it('parses Devanagari "Total: ५००" (५=5, ०=0)', () => {
      expect(field("Total: ५००", "total")).toBe(500);
    });
    it('parses mixed Arabic-Indic + ASCII "Total: ١2٣٤" (1,2,3,4)', () => {
      expect(field("Total: ١2٣٤", "total")).toBe(1234);
    });
  });

  // ── Tax / VAT ─────────────────────────────────────────────────────────
  describe("tax / VAT", () => {
    it('parses "VAT: 15.00"', () => {
      // Include a Total so the fallback doesn't bail out (it requires
      // invoiceNumber OR total to be present).
      expect(field("Total: 100\nVAT: 15.00", "taxAmount")).toBe(15.0);
    });
    it('parses "Tax 7.5"', () => {
      expect(field("Total: 100\nTax 7.5", "taxAmount")).toBe(7.5);
    });
    it('parses "ضريبة: ٧٥" (Arabic-Indic)', () => {
      expect(field("Total: 100\nضريبة: ٧٥", "taxAmount")).toBe(75);
    });
    it('parses "VAT $50"', () => {
      expect(field("Total: 100\nVAT $50", "taxAmount")).toBe(50);
    });
    it('parses "tax: 1,250.00" (comma)', () => {
      expect(field("Total: 100\ntax: 1,250.00", "taxAmount")).toBe(1250);
    });
  });

  // ── Date — Gregorian ──────────────────────────────────────────────────
  describe("date — Gregorian", () => {
    it('parses ISO "2026-08-13" → gregorian', () => {
      const r = extractWithRegexFallback("Invoice: TEST-001\nDate: 2026-08-13\nTotal: 100");
      expect(r?.date).toBe("2026-08-13");
      expect(r?.dateType).toBe("gregorian");
    });
    it('parses DD/MM/YYYY "13/08/2026" → gregorian', () => {
      const r = extractWithRegexFallback("Invoice: TEST-001\nDate: 13/08/2026\nTotal: 100");
      expect(r?.date).toBe("13/08/2026");
      expect(r?.dateType).toBe("gregorian");
    });
    it('parses MM/DD/YYYY "08/13/2026" (US) → gregorian', () => {
      const r = extractWithRegexFallback("Invoice: TEST-001\nDate: 08/13/2026\nTotal: 100");
      expect(r?.date).toBe("08/13/2026");
      expect(r?.dateType).toBe("gregorian");
    });
    it('parses "13 August 2026" → gregorian', () => {
      const r = extractWithRegexFallback("Invoice: TEST-001\nDate: 13 August 2026\nTotal: 100");
      expect(r?.date).toBe("13 August 2026");
      expect(r?.dateType).toBe("gregorian");
    });
    it('parses "August 13, 2026" (reversed) → gregorian', () => {
      const r = extractWithRegexFallback("Invoice: TEST-001\nDate: August 13, 2026\nTotal: 100");
      expect(r?.date).toBe("August 13, 2026");
      expect(r?.dateType).toBe("gregorian");
    });
    it('parses "13 Aug 2026" (abbreviated month)', () => {
      const r = extractWithRegexFallback("Invoice: TEST-001\n13 Aug 2026\nTotal: 100");
      expect(r?.date).toBe("13 Aug 2026");
    });
  });

  // ── Date — Hijri (Arabic-Indic) ───────────────────────────────────────
  describe("date — Hijri (Arabic-Indic)", () => {
    it('parses "١٤٤٦/٠٣/١٢" (Hijri YYYY/MM/DD) → hijri', () => {
      const r = extractWithRegexFallback("Invoice: TEST-001\nDate: ١٤٤٦/٠٣/١٢\nTotal: 100");
      expect(r?.date).toBe("١٤٤٦/٠٣/١٢");
      expect(r?.dateType).toBe("hijri");
    });
    it('parses "١٢/٠٣/١٤٤٦" (Hijri DD/MM/YYYY) → hijri', () => {
      const r = extractWithRegexFallback("Invoice: TEST-001\nDate: ١٢/٠٣/١٤٤٦\nTotal: 100");
      expect(r?.date).toBe("١٢/٠٣/١٤٤٦");
      expect(r?.dateType).toBe("hijri");
    });
    it('parses ASCII Hijri "1446/03/12" → hijri', () => {
      const r = extractWithRegexFallback("Invoice: TEST-001\nDate: 1446/03/12\nTotal: 100");
      expect(r?.date).toBe("1446/03/12");
      expect(r?.dateType).toBe("hijri");
    });
    it('classifies year 1300 as hijri (lower bound)', () => {
      const r = extractWithRegexFallback("Invoice: TEST-001\nDate: 1300/01/01\nTotal: 100");
      expect(r?.dateType).toBe("hijri");
    });
    it('classifies year 1700 as hijri (upper bound)', () => {
      const r = extractWithRegexFallback("Invoice: TEST-001\nDate: 1700/01/01\nTotal: 100");
      expect(r?.dateType).toBe("hijri");
    });
    it('classifies year 2026 as gregorian (not hijri)', () => {
      const r = extractWithRegexFallback("Invoice: TEST-001\nDate: 2026-01-01\nTotal: 100");
      expect(r?.dateType).toBe("gregorian");
    });
    it('classifies year 1299 as gregorian (below hijri range)', () => {
      const r = extractWithRegexFallback("Invoice: TEST-001\nDate: 1299/01/01\nTotal: 100");
      expect(r?.dateType).toBe("gregorian");
    });
    it('classifies year 1701 as gregorian (above hijri range)', () => {
      const r = extractWithRegexFallback("Invoice: TEST-001\nDate: 1701/01/01\nTotal: 100");
      expect(r?.dateType).toBe("gregorian");
    });
  });

  // ── Vendor name ───────────────────────────────────────────────────────
  describe("vendor name", () => {
    it('extracts vendor as first non-label line', () => {
      const r = extractWithRegexFallback("ACME Corporation\nInvoice: INV-001\nTotal: 100");
      expect(r?.vendorName).toBe("ACME Corporation");
    });
    it('skips label-like lines (Invoice, Total, etc.)', () => {
      const r = extractWithRegexFallback("Invoice: INV-001\nTotal: 100\nGlobex Inc");
      expect(r?.vendorName).toBe("Globex Inc");
    });
    it('skips very short lines (≤2 chars)', () => {
      const r = extractWithRegexFallback("AB\nInvoice: INV-001\nTotal: 100\nStark Industries");
      expect(r?.vendorName).toBe("Stark Industries");
    });
    it('skips very long lines (≥80 chars)', () => {
      const longLine = "A".repeat(100);
      const r = extractWithRegexFallback(`${longLine}\nInvoice: INV-001\nTotal: 100\nUmbrella Corp`);
      expect(r?.vendorName).toBe("Umbrella Corp");
    });
  });

  // ── Combined full-document parses ─────────────────────────────────────
  describe("full-document integration", () => {
    it("parses a full English invoice document", () => {
      const doc = `
ACME Corp
Invoice No: INV-2026-001
Date: 2026-08-13
Total: $1,234.56
VAT: 15.00
`.trim();
      const r = extractWithRegexFallback(doc);
      expect(r).not.toBeNull();
      expect(r?.invoiceNumber).toBe("INV-2026-001");
      expect(r?.date).toBe("2026-08-13");
      expect(r?.total).toBe(1234.56);
      expect(r?.taxAmount).toBe(15);
      expect(r?.vendorName).toBe("ACME Corp");
    });

    it("parses a full Arabic invoice with Arabic-Indic numerals", () => {
      const doc = `
شركة الخليج التجارية
فاتورة رقم: ١٢٣٤
التاريخ: ١٤٤٦/٠٣/١٢
الإجمالي: ٥٠٠٠
ضريبة: ٧٥٠
`.trim();
      const r = extractWithRegexFallback(doc);
      expect(r).not.toBeNull();
      expect(r?.invoiceNumber).toBe("١٢٣٤");
      expect(r?.date).toBe("١٤٤٦/٠٣/١٢");
      expect(r?.dateType).toBe("hijri");
      expect(r?.total).toBe(5000);
      expect(r?.taxAmount).toBe(750);
      expect(r?.vendorName).toBe("شركة الخليج التجارية");
    });

    it("parses a mixed Arabic+English document", () => {
      const doc = `
Gulf Trading LLC
فاتورة رقم: INV-777
Date: 13/08/2026
Total: ١٢٣٤
VAT: ٥٠
`.trim();
      const r = extractWithRegexFallback(doc);
      expect(r).not.toBeNull();
      expect(r?.invoiceNumber).toBe("INV-777");
      expect(r?.date).toBe("13/08/2026");
      expect(r?.dateType).toBe("gregorian");
      expect(r?.total).toBe(1234);
      expect(r?.taxAmount).toBe(50);
    });
  });

  // ── Negative cases ────────────────────────────────────────────────────
  describe("negative cases (returns null)", () => {
    it("returns null for empty string", () => {
      expect(extractWithRegexFallback("")).toBeNull();
    });
    it("returns null for plain prose without invoice fields", () => {
      expect(
        extractWithRegexFallback("Hello, please call me back about the meeting."),
      ).toBeNull();
    });
    it("returns null when only a vendor name is found (no invoice num or total)", () => {
      // "Hello Inc" matches the vendor heuristic, but no invoice/total → null.
      expect(extractWithRegexFallback("Hello Inc")).toBeNull();
    });
    it("returns the result when only a total is found (no invoice num)", () => {
      // Total alone is sufficient — the function should NOT return null.
      const r = extractWithRegexFallback("Total: 500");
      expect(r).not.toBeNull();
      expect(r?.total).toBe(500);
    });
    it("returns the result when only an invoice number is found", () => {
      const r = extractWithRegexFallback("Invoice: INV-001");
      expect(r).not.toBeNull();
      expect(r?.invoiceNumber).toBe("INV-001");
    });
  });

  // ── Edge cases on numerals ────────────────────────────────────────────
  describe("numeral edge cases", () => {
    it("parses '٠' as 0 (Arabic-Indic zero)", () => {
      expect(field("Total: ٠", "total")).toBe(0);
    });
    it("parses '۰' as 0 (Persian zero)", () => {
      expect(field("Total: ۰", "total")).toBe(0);
    });
    it("parses '०' as 0 (Devanagari zero)", () => {
      expect(field("Total: ०", "total")).toBe(0);
    });
    it("parses '٩٩٩٩' as 9999 (all Arabic-Indic)", () => {
      expect(field("Total: ٩٩٩٩", "total")).toBe(9999);
    });
    it("parses '٩۹८' as mixed Persian+Arabic → 998", () => {
      // ٩ (Arabic-Indic 9) + ۹ (Persian 9) + ۸ (Persian 8) → 998
      expect(field("Total: ٩۹۸", "total")).toBe(998);
    });
  });

  // ── Currency symbol tolerance ─────────────────────────────────────────
  describe("currency symbol tolerance", () => {
    it("strips leading $ before parsing total", () => {
      expect(field("Total: $100", "total")).toBe(100);
    });
    it("strips leading $ before parsing tax", () => {
      expect(field("Total: 100\nVAT: $25", "taxAmount")).toBe(25);
    });
    it("parses total without $ when none present", () => {
      expect(field("Total: 100", "total")).toBe(100);
    });
  });
});

// Sanity check: confirm we have at least 40 it() blocks above.
// (Counted: 6 + 3 + 5 + 3 + 3 + 5 + 6 + 8 + 4 + 3 + 3 + 5 + 5 + 3 = 63 cases.)

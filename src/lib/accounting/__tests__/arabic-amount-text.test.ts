/**
 * arabic-amount-text.test.ts — Tests for Arabic amount text conversion.
 *
 * Pure function tests (no DB needed). Tests numberToArabicText()
 * for various currencies, amounts, and edge cases.
 */

import { describe, test, expect } from "bun:test";
import {
  numberToArabicText,
  getCurrencyFractionName,
  getCurrencyWholeName,
  type SupportedCurrency,
} from "../arabic-amount-text";

// ── Core numberToArabicText tests ──────────────────────────────────────────────

describe("numberToArabicText", () => {
  // ── Zero ──────────────────────────────────────────────────────────────────
  test("0 KWD → صفر دينارات لا غير", () => {
    // Zero uses plural form of the currency
    const result = numberToArabicText(0, "KWD");
    expect(result).toContain("صفر");
    expect(result).toContain("دينارات");
    expect(result).toContain("لا غير");
  });

  // ── 1 (singular) ──────────────────────────────────────────────────────────
  test("1 KWD → دينار واحد لا غير", () => {
    const result = numberToArabicText(1, "KWD");
    expect(result).toContain("دينار");
    expect(result).toContain("واحد");
    expect(result).toContain("لا غير");
  });

  // ── 2 (dual) ──────────────────────────────────────────────────────────────
  test("2 SAR → ريالان لا غير", () => {
    const result = numberToArabicText(2, "SAR");
    expect(result).toContain("ريالان");
    expect(result).toContain("لا غير");
  });

  // ── 3-10 (plural) ────────────────────────────────────────────────────────
  test("5 KWD → خمسة دينارات لا غير", () => {
    const result = numberToArabicText(5, "KWD");
    expect(result).toContain("خمسة");
    expect(result).toContain("دينارات");
    expect(result).toContain("لا غير");
  });

  // ── 11-99 (singular currency) ────────────────────────────────────────────
  test("50 KWD → خمسون دينار لا غير", () => {
    const result = numberToArabicText(50, "KWD");
    expect(result).toContain("خمسون");
    expect(result).toContain("دينار");
    expect(result).toContain("لا غير");
  });

  // ── 100+ ──────────────────────────────────────────────────────────────────
  test("100 EGP → مائة جنيه لا غير", () => {
    const result = numberToArabicText(100, "EGP");
    expect(result).toContain("مائة");
    expect(result).toContain("جنيه");
    expect(result).toContain("لا غير");
  });

  test("500 KWD → خمسمائة دينار لا غير", () => {
    const result = numberToArabicText(500, "KWD");
    expect(result).toContain("خمسمائة");
    expect(result).toContain("دينار");
    expect(result).toContain("لا غير");
  });

  // ── 1000 SAR ──────────────────────────────────────────────────────────────
  test("1000 SAR → ألف ريال لا غير", () => {
    const result = numberToArabicText(1000, "SAR");
    expect(result).toContain("ألف");
    expect(result).toContain("ريال");
    expect(result).toContain("لا غير");
  });

  // ── 1250.750 SAR (with fraction) ──────────────────────────────────────────
  test("1250.750 SAR → contains ألف ومائتان وخمسون ريالات and هللة fraction", () => {
    const result = numberToArabicText(1250.750, "SAR");
    // Whole: ألف ومائتان وخمسون — 1250 uses plural form ريالات (100+)
    expect(result).toContain("ألف");
    expect(result).toContain("مائتان");
    expect(result).toContain("خمسون");
    expect(result).toContain("ريالات");
    // Fraction: SAR has 2 decimal places → 0.750 * 100 = 75 هللة (feminine form)
    // 75 = خمس وسبعون in feminine
    expect(result).toContain("خمس");
    expect(result).toContain("سبعون");
    expect(result).toContain("هللة");
    expect(result).toContain("لا غير");
  });

  // ── 3.500 AED (2 decimal with AED fraction = فلس) ────────────────────────
  test("3.500 AED → ثلاثة دراهم وخمسون فلس لا غير", () => {
    const result = numberToArabicText(3.500, "AED");
    expect(result).toContain("ثلاثة");
    expect(result).toContain("دراهم");
    // AED has 2 decimal places → 0.500 * 100 = 50 فلس
    // 50 = خمسون (masculine, since فلس is masculine)
    expect(result).toContain("خمسون");
    expect(result).toContain("فلس");
    expect(result).toContain("لا غير");
  });

  // ── Negative numbers ──────────────────────────────────────────────────────
  test("-100 KWD → starts with سالب", () => {
    const result = numberToArabicText(-100, "KWD");
    expect(result).toContain("سالب");
    expect(result).toContain("مائة");
    expect(result).toContain("دينار");
    expect(result).toContain("لا غير");
  });

  // ── Very large numbers (millions) ─────────────────────────────────────────
  test("1000000 KWD → contains مليون", () => {
    const result = numberToArabicText(1000000, "KWD");
    expect(result).toContain("مليون");
    expect(result).toContain("دينار");
    expect(result).toContain("لا غير");
  });

  // ── Decimals only (fraction < 1 whole) ────────────────────────────────────
  test("0.500 KWD → صفر دينارات and فلس fraction", () => {
    const result = numberToArabicText(0.500, "KWD");
    expect(result).toContain("صفر");
    expect(result).toContain("دينارات");
    expect(result).toContain("فلس");
    expect(result).toContain("لا غير");
  });

  // ── Always ends with "لا غير" ────────────────────────────────────────────
  test("All amounts end with لا غير", () => {
    const amounts = [0, 1, 5, 50, 100, 500, 1000, 1250.750, 3.500];
    const currencies: SupportedCurrency[] = ["KWD", "SAR", "AED", "EGP"];
    for (const amount of amounts) {
      for (const currency of currencies) {
        const result = numberToArabicText(amount, currency);
        expect(result.endsWith("لا غير")).toBe(true);
      }
    }
  });
});

// ── Fraction name tests ──────────────────────────────────────────────────────────

describe("getCurrencyFractionName", () => {
  test("KWD fraction is فلس", () => {
    expect(getCurrencyFractionName("KWD")).toBe("فلس");
  });

  test("SAR fraction is هللة", () => {
    expect(getCurrencyFractionName("SAR")).toBe("هللة");
  });

  test("AED fraction is فلس", () => {
    expect(getCurrencyFractionName("AED")).toBe("فلس");
  });

  test("EGP fraction is قرش", () => {
    expect(getCurrencyFractionName("EGP")).toBe("قرش");
  });

  test("BHD fraction is فلس", () => {
    expect(getCurrencyFractionName("BHD")).toBe("فلس");
  });

  test("OMR fraction is هللة", () => {
    expect(getCurrencyFractionName("OMR")).toBe("هللة");
  });

  test("QAR fraction is هللة", () => {
    expect(getCurrencyFractionName("QAR")).toBe("هللة");
  });
});

// ── Whole currency name tests ─────────────────────────────────────────────────────

describe("getCurrencyWholeName", () => {
  test("KWD amount 1 → singular دينار", () => {
    expect(getCurrencyWholeName("KWD", 1)).toBe("دينار");
  });

  test("KWD amount 2 → dual ديناران", () => {
    expect(getCurrencyWholeName("KWD", 2)).toBe("ديناران");
  });

  test("KWD amount 5 → plural دينارات", () => {
    expect(getCurrencyWholeName("KWD", 5)).toBe("دينارات");
  });

  test("KWD amount 50 → singular دينار (11-99 use singular)", () => {
    expect(getCurrencyWholeName("KWD", 50)).toBe("دينار");
  });

  test("KWD amount 500 → plural دينارات (100+ uses plural)", () => {
    expect(getCurrencyWholeName("KWD", 500)).toBe("دينارات");
  });

  test("SAR amount 1 → singular ريال", () => {
    expect(getCurrencyWholeName("SAR", 1)).toBe("ريال");
  });

  test("AED amount 2 → dual درهمان", () => {
    expect(getCurrencyWholeName("AED", 2)).toBe("درهمان");
  });

  test("EGP amount 5 → plural جنيهات", () => {
    expect(getCurrencyWholeName("EGP", 5)).toBe("جنيهات");
  });
});

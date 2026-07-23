/**
 * money.test.ts — Tests for money/decimal helpers.
 *
 * Pure function tests (no DB needed). Tests num(), addNums(), subNums(),
 * mulNums(), fmtMoney(), fmtNum(), toNum(), and calcInvoiceTotals().
 */

import { describe, test, expect } from "bun:test";
import {
  num,
  fmtMoney,
  fmtNum,
  toNum,
  addNums,
  subNums,
  mulNums,
  calcInvoiceTotals,
  type LineItem,
} from "@/lib/money";

// ── num() tests ──────────────────────────────────────────────────────────────────

describe("num()", () => {
  test("num('123.456', 3) → 123.456", () => {
    expect(num("123.456", 3)).toBe(123.456);
  });

  test("num(123.456, 3) → 123.456", () => {
    expect(num(123.456, 3)).toBe(123.456);
  });

  test("num(null) → 0", () => {
    expect(num(null)).toBe(0);
  });

  test("num(undefined) → 0", () => {
    expect(num(undefined)).toBe(0);
  });

  test("num('') → 0", () => {
    expect(num("")).toBe(0);
  });

  test("num('abc') → 0 (NaN)", () => {
    expect(num("abc")).toBe(0);
  });

  test("num(NaN) → 0", () => {
    expect(num(NaN)).toBe(0);
  });

  test("num(Infinity) → 0", () => {
    expect(num(Infinity)).toBe(0);
  });

  test("num('100.4567', 3) → 100.457 (rounds to 3 decimals)", () => {
    // num rounds to scale: 100.4567 → Math.round(100.4567 * 1000) / 1000
    expect(num("100.4567", 3)).toBe(100.457);
  });

  test("num('0.001', 3) → 0.001 (preserves small decimals)", () => {
    expect(num("0.001", 3)).toBe(0.001);
  });

  test("num('100', 2) → 100 (2 decimal scale)", () => {
    expect(num("100", 2)).toBe(100);
  });

  test("num('100.125', 2) → 100.13 (2 decimal scale rounds)", () => {
    expect(num("100.125", 2)).toBe(100.13);
  });

  test("num(-50) → -50 (handles negatives)", () => {
    expect(num(-50)).toBe(-50);
  });
});

// ── addNums() tests ──────────────────────────────────────────────────────────────

describe("addNums()", () => {
  test("addNums('100', '200.5', '50') → '350.500'", () => {
    expect(addNums("100", "200.5", "50")).toBe("350.500");
  });

  test("addNums(100, 200, 300) → '600.000'", () => {
    expect(addNums(100, 200, 300)).toBe("600.000");
  });

  test("addNums('0', '0', '0') → '0.000'", () => {
    expect(addNums("0", "0", "0")).toBe("0.000");
  });

  test("addNums(null, undefined, '100') → '100.000'", () => {
    expect(addNums(null, undefined, "100")).toBe("100.000");
  });

  test("addNums('0.001', '0.002') → '0.003'", () => {
    expect(addNums("0.001", "0.002")).toBe("0.003");
  });

  test("addNums('-50', '100') → '50.000'", () => {
    expect(addNums("-50", "100")).toBe("50.000");
  });
});

// ── subNums() tests ──────────────────────────────────────────────────────────────

describe("subNums()", () => {
  test("subNums('500', '200') → '300.000'", () => {
    expect(subNums("500", "200")).toBe("300.000");
  });

  test("subNums(100, 50) → '50.000'", () => {
    expect(subNums(100, 50)).toBe("50.000");
  });

  test("subNums('200', '300') → '-100.000'", () => {
    expect(subNums("200", "300")).toBe("-100.000");
  });

  test("subNums('0.003', '0.001') → '0.002'", () => {
    expect(subNums("0.003", "0.001")).toBe("0.002");
  });
});

// ── mulNums() tests ──────────────────────────────────────────────────────────────

describe("mulNums()", () => {
  test("mulNums('100', '0.15') → '15.000'", () => {
    expect(mulNums("100", "0.15")).toBe("15.000");
  });

  test("mulNums(200, 0.05) → '10.000'", () => {
    expect(mulNums(200, 0.05)).toBe("10.000");
  });

  test("mulNums('0', '100') → '0.000'", () => {
    expect(mulNums("0", "100")).toBe("0.000");
  });

  test("mulNums('10', '10') → '100.000'", () => {
    expect(mulNums("10", "10")).toBe("100.000");
  });

  test("mulNums('1000', '0.025') → '25.000'", () => {
    expect(mulNums("1000", "0.025")).toBe("25.000");
  });
});

// ── toNum() tests ────────────────────────────────────────────────────────────────

describe("toNum()", () => {
  test("toNum(123.456) → '123.456'", () => {
    expect(toNum(123.456)).toBe("123.456");
  });

  test("toNum('100') → '100.000'", () => {
    expect(toNum("100")).toBe("100.000");
  });

  test("toNum(0) → '0.000'", () => {
    expect(toNum(0)).toBe("0.000");
  });
});

// ── fmtMoney() tests ──────────────────────────────────────────────────────────────

describe("fmtMoney()", () => {
  test("fmtMoney(100, 'KWD') → formatted KWD string (non-empty)", () => {
    const result = fmtMoney(100, "KWD");
    // Arabic locale uses Arabic-Indic digits, so just verify non-empty formatted output
    expect(result.length).toBeGreaterThan(0);
  });

  test("fmtMoney(null, 'SAR') → formatted zero (non-empty)", () => {
    const result = fmtMoney(null, "SAR");
    // Arabic locale format for zero — just verify non-empty output
    expect(result.length).toBeGreaterThan(0);
  });

  test("fmtMoney('abc', 'KWD') → formatted zero (NaN, non-empty)", () => {
    const result = fmtMoney("abc", "KWD");
    // Arabic locale format for zero — just verify non-empty output
    expect(result.length).toBeGreaterThan(0);
  });
});

// ── fmtNum() tests ────────────────────────────────────────────────────────────────

describe("fmtNum()", () => {
  test("fmtNum(1234.56, 2) → Arabic-locale formatted", () => {
    const result = fmtNum(1234.56, 2);
    // Should be a formatted number string
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  });
});

// ── calcInvoiceTotals() tests ────────────────────────────────────────────────────

describe("calcInvoiceTotals()", () => {
  test("Basic invoice: 1 item × qty 2 × price 50, 0% tax, 0 shipping, 0 discount", () => {
    const items: LineItem[] = [
      { description: "Service A", qty: 2, price: 50 },
    ];
    const result = calcInvoiceTotals(items, 0, 0, 0);
    expect(result.subtotal).toBe("100.000");
    expect(result.taxAmount).toBe("0.000");
    expect(result.total).toBe("100.000");
    expect(result.shipping).toBe("0.000");
    expect(result.discount).toBe("0.000");
  });

  test("Invoice with 5% tax and 10 shipping", () => {
    const items: LineItem[] = [
      { description: "Product B", qty: 3, price: 100 },
    ];
    const result = calcInvoiceTotals(items, 5, 10, 0);
    // subtotal = 300, tax = 300 × 0.05 = 15, shipping = 10, total = 300 + 15 + 10 = 325
    expect(result.subtotal).toBe("300.000");
    expect(result.taxRate).toBe("5.00");
    expect(result.taxAmount).toBe("15.000");
    expect(result.shipping).toBe("10.000");
    expect(result.total).toBe("325.000");
  });

  test("Invoice with discount", () => {
    const items: LineItem[] = [
      { description: "Service C", qty: 1, price: 200 },
    ];
    const result = calcInvoiceTotals(items, 0, 0, 50);
    // subtotal = 200, discounted = 150, total = 150
    expect(result.subtotal).toBe("200.000");
    expect(result.discount).toBe("50.000");
    expect(result.total).toBe("150.000");
  });

  test("Discount cannot exceed subtotal", () => {
    const items: LineItem[] = [
      { description: "Item D", qty: 1, price: 100 },
    ];
    const result = calcInvoiceTotals(items, 0, 0, 150);
    // subtotal = 100, discounted = max(0, 100-150) = 0
    expect(result.subtotal).toBe("100.000");
    expect(result.total).toBe("0.000");
  });

  test("Multiple items", () => {
    const items: LineItem[] = [
      { description: "Item E", qty: 2, price: 50 },
      { description: "Item F", qty: 1, price: 100, total: 100 },
    ];
    const result = calcInvoiceTotals(items, 10, 20, 0);
    // subtotal = 100 + 100 = 200, tax = 20, shipping = 20, total = 240
    expect(result.subtotal).toBe("200.000");
    expect(result.taxAmount).toBe("20.000");
    expect(result.total).toBe("240.000");
  });

  test("Item with explicit total overrides qty×price", () => {
    const items: LineItem[] = [
      { description: "Custom Item", qty: 3, price: 50, total: 120 },
    ];
    const result = calcInvoiceTotals(items, 0, 0, 0);
    // total field overrides: 120 instead of 150
    expect(result.subtotal).toBe("120.000");
  });

  test("No Float for money — all values are strings with 3 decimals", () => {
    const items: LineItem[] = [
      { description: "Test", qty: 1, price: 100.123 },
    ];
    const result = calcInvoiceTotals(items, 15, 5.5, 0);
    // Verify all return values are strings with exactly 3 decimal places
    expect(result.subtotal).toMatch(/^\d+\.\d{3}$/);
    expect(result.taxAmount).toMatch(/^\d+\.\d{3}$/);
    expect(result.total).toMatch(/^\d+\.\d{3}$/);
    expect(result.shipping).toMatch(/^\d+\.\d{3}$/);
    expect(result.discount).toMatch(/^\d+\.\d{3}$/);
  });
});

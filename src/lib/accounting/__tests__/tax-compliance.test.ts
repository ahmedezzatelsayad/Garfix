/**
 * tax-compliance.test.ts — Tests for VAT return generation, Zakat calculation,
 * and filing reminders.
 *
 * Replicates pure logic from tax-compliance.ts and gulfConfig.ts for testing
 * without DB. Tests: VAT rates per country, Zakat 2.5% of base,
 * filing period types per country.
 */

import { describe, test, expect } from "bun:test";
import { num } from "@/lib/money";
import { getCountryConfig, getRetentionYears } from "@/lib/gulfConfig";

// ── Replicated pure logic ──────────────────────────────────────────────────────

/**
 * Calculate VAT amounts for a period.
 * Uses gulfConfig rates for each country.
 */
function calculateVATAmounts(
  totalSales: number,
  totalPurchases: number,
  country: string,
): { vatOnSales: number; vatOnPurchases: number; vatDue: number; vatRate: number } {
  const config = getCountryConfig(country);
  if (!config) throw new Error(`Country config not found for: ${country}`);
  if (!config.vatApplicable) throw new Error(`VAT not applicable in ${config.nameEn}`);

  const vatRate = config.vatRate;
  const vatOnSales = totalSales * (vatRate / 100);
  const vatOnPurchases = totalPurchases * (vatRate / 100);
  const vatDue = vatOnSales - vatOnPurchases;

  return { vatOnSales, vatOnPurchases, vatDue, vatRate };
}

/**
 * Calculate Zakat for Saudi companies.
 * Zakat = 2.5% of zakat base.
 * Zakat base = equity + long-term liabilities + fixed assets - long-term investments.
 */
function calculateZakatAmount(
  equity: number,
  longTermLiabilities: number,
  fixedAssets: number,
  longTermInvestments: number,
): { zakatBase: number; zakatRate: number; zakatAmount: number } {
  const zakatBase = equity + longTermLiabilities + fixedAssets - longTermInvestments;
  const zakatRate = 0.025; // 2.5%
  const zakatAmount = zakatBase * zakatRate;
  return { zakatBase, zakatRate, zakatAmount };
}

/**
 * Get filing period type per country and tax type.
 */
function getFilingPeriod(country: string, taxType: string): "monthly" | "quarterly" | "yearly" {
  if (taxType === "zakat") return "yearly";
  if (country === "SA") return "monthly";
  if (country === "KW") return "quarterly";
  if (country === "AE") return "quarterly";
  if (country === "BH") return "quarterly";
  if (country === "OM") return "quarterly";
  return "quarterly";
}

// ── Tests ─────────────────────────────────────────────────────────────────────────

describe("tax-compliance: VAT rates per country (gulfConfig)", () => {
  test("KW has 0% VAT (not applicable)", () => {
    const config = getCountryConfig("KW");
    expect(config?.vatRate).toBe(0);
    expect(config?.vatApplicable).toBe(false);
  });

  test("SA has 15% VAT", () => {
    const config = getCountryConfig("SA");
    expect(config?.vatRate).toBe(15);
    expect(config?.vatApplicable).toBe(true);
  });

  test("AE has 5% VAT", () => {
    const config = getCountryConfig("AE");
    expect(config?.vatRate).toBe(5);
    expect(config?.vatApplicable).toBe(true);
  });

  test("BH has 10% VAT", () => {
    const config = getCountryConfig("BH");
    expect(config?.vatRate).toBe(10);
    expect(config?.vatApplicable).toBe(true);
  });

  test("OM has 5% VAT", () => {
    const config = getCountryConfig("OM");
    expect(config?.vatRate).toBe(5);
    expect(config?.vatApplicable).toBe(true);
  });

  test("QA has 0% VAT (not applicable)", () => {
    const config = getCountryConfig("QA");
    expect(config?.vatRate).toBe(0);
    expect(config?.vatApplicable).toBe(false);
  });
});

describe("tax-compliance: calculateVATAmounts", () => {
  test("SA VAT: sales=10000, purchases=5000 → vatOnSales=1500, vatOnPurchases=750, vatDue=750", () => {
    const result = calculateVATAmounts(10000, 5000, "SA");
    expect(result.vatRate).toBe(15);
    expect(result.vatOnSales).toBe(1500); // 10000 × 15%
    expect(result.vatOnPurchases).toBe(750); // 5000 × 15%
    expect(result.vatDue).toBe(750); // 1500 - 750
  });

  test("AE VAT: sales=10000, purchases=8000 → vatOnSales=500, vatOnPurchases=400, vatDue=100", () => {
    const result = calculateVATAmounts(10000, 8000, "AE");
    expect(result.vatRate).toBe(5);
    expect(result.vatOnSales).toBe(500);
    expect(result.vatOnPurchases).toBe(400);
    expect(result.vatDue).toBe(100);
  });

  test("BH VAT: sales=5000, purchases=3000 → vatOnSales=500, vatOnPurchases=300, vatDue=200", () => {
    const result = calculateVATAmounts(5000, 3000, "BH");
    expect(result.vatRate).toBe(10);
    expect(result.vatOnSales).toBe(500);
    expect(result.vatOnPurchases).toBe(300);
    expect(result.vatDue).toBe(200);
  });

  test("KW VAT: throws error — VAT not applicable", () => {
    expect(() => calculateVATAmounts(10000, 5000, "KW")).toThrow("VAT not applicable");
  });

  test("QA VAT: throws error — VAT not applicable", () => {
    expect(() => calculateVATAmounts(10000, 5000, "QA")).toThrow("VAT not applicable");
  });

  test("VAT due can be negative (more purchases than sales)", () => {
    const result = calculateVATAmounts(5000, 10000, "SA");
    expect(result.vatDue).toBe(-750); // refund scenario
  });
});

describe("tax-compliance: calculateZakatAmount", () => {
  test("Zakat = 2.5% of zakat base (SA)", () => {
    const result = calculateZakatAmount(100000, 50000, 30000, 10000);
    // zakatBase = 100000 + 50000 + 30000 - 10000 = 170000
    // zakatAmount = 170000 × 0.025 = 4250
    expect(result.zakatBase).toBe(170000);
    expect(result.zakatRate).toBe(0.025);
    expect(result.zakatAmount).toBe(4250);
  });

  test("Zakat with zero investments", () => {
    const result = calculateZakatAmount(200000, 0, 50000, 0);
    // zakatBase = 250000, zakat = 6250
    expect(result.zakatBase).toBe(250000);
    expect(result.zakatAmount).toBe(6250);
  });

  test("Zakat base can be negative (investments > other components)", () => {
    const result = calculateZakatAmount(10000, 5000, 10000, 30000);
    // zakatBase = 10000 + 5000 + 10000 - 30000 = -5000
    expect(result.zakatBase).toBe(-5000);
    expect(result.zakatAmount).toBe(-125); // negative zakat → refund scenario
  });

  test("Zakat rate is exactly 2.5%", () => {
    const result = calculateZakatAmount(1000, 0, 0, 0);
    expect(result.zakatRate).toBe(0.025);
    expect(result.zakatAmount).toBe(25); // 1000 × 0.025 = 25
  });
});

describe("tax-compliance: getFilingPeriod", () => {
  test("KW VAT → quarterly", () => {
    expect(getFilingPeriod("KW", "vat")).toBe("quarterly");
  });

  test("SA VAT → monthly", () => {
    expect(getFilingPeriod("SA", "vat")).toBe("monthly");
  });

  test("AE VAT → quarterly", () => {
    expect(getFilingPeriod("AE", "vat")).toBe("quarterly");
  });

  test("SA Zakat → yearly", () => {
    expect(getFilingPeriod("SA", "zakat")).toBe("yearly");
  });

  test("BH VAT → quarterly", () => {
    expect(getFilingPeriod("BH", "vat")).toBe("quarterly");
  });

  test("OM VAT → quarterly", () => {
    expect(getFilingPeriod("OM", "vat")).toBe("quarterly");
  });
});

describe("tax-compliance: retention years per country", () => {
  test("KW retention years = 5", () => {
    expect(getRetentionYears("KW")).toBe(5);
  });

  test("SA retention years = 5", () => {
    expect(getRetentionYears("SA")).toBe(5);
  });

  test("AE retention years = 5", () => {
    expect(getRetentionYears("AE")).toBe(5);
  });
});

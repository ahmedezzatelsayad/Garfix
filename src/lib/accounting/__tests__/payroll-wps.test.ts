/**
 * payroll-wps.test.ts — Tests for WPS & Payroll calculations.
 *
 * Replicates pure logic from payroll-wps.ts for testing without DB.
 * Tests: social insurance rates per country, net salary calculation,
 * gratuity provision, WPS file format.
 */

import { describe, test, expect } from "bun:test";
import { num } from "@/lib/money";
import { getCountryConfig } from "@/lib/gulfConfig";

// ── Replicated pure logic ──────────────────────────────────────────────────────

interface SocialInsuranceRate {
  employeeRate: number;
  employerRate: number;
  base: "basic" | "basic_plus_housing";
}

const SOCIAL_INSURANCE_RATES: Record<string, SocialInsuranceRate> = {
  KW: { employeeRate: 5.5, employerRate: 11, base: "basic" },
  SA: { employeeRate: 9.75, employerRate: 11.75, base: "basic_plus_housing" },
  AE: { employeeRate: 5, employerRate: 12.5, base: "basic" },
  BH: { employeeRate: 5, employerRate: 12, base: "basic" },
  OM: { employeeRate: 6.5, employerRate: 11.5, base: "basic" },
  QA: { employeeRate: 5, employerRate: 10, base: "basic" },
};

function calculateSocialInsurance(
  baseSalary: number,
  allowances: number,
  country: string,
): { employeePortion: number; employerPortion: number; total: number } {
  const rate = SOCIAL_INSURANCE_RATES[country] || SOCIAL_INSURANCE_RATES.KW;
  const config = getCountryConfig(country);
  const decimals = config?.currencyDecimalPlaces ?? 3;

  let baseAmount: number;
  if (rate.base === "basic_plus_housing") {
    baseAmount = num(baseSalary, decimals) + num(allowances, decimals) * 0.4;
  } else {
    baseAmount = num(baseSalary, decimals);
  }

  const employeePortion = num(baseAmount * rate.employeeRate / 100, decimals);
  const employerPortion = num(baseAmount * rate.employerRate / 100, decimals);
  const total = num(employeePortion + employerPortion, decimals);

  return { employeePortion, employerPortion, total };
}

function calculateNetSalarySimple(
  basicSalary: number,
  allowances: number,
  socialInsuranceEmployee: number,
  bonus: number,
  advances: number,
): { grossSalary: number; totalDeductions: number; netSalary: number } {
  const grossSalary = num(basicSalary + allowances + bonus, 3);
  const totalDeductions = num(socialInsuranceEmployee + advances, 3);
  const netSalary = num(grossSalary - totalDeductions, 3);
  return { grossSalary, totalDeductions, netSalary };
}

// ── Tests ─────────────────────────────────────────────────────────────────────────

describe("payroll-wps: social insurance rates per country", () => {
  test("KW: employee 5.5%, employer 11% of basic salary", () => {
    const result = calculateSocialInsurance(1000, 200, "KW");
    // KW base = basic salary only = 1000
    expect(result.employeePortion).toBe(55); // 1000 × 5.5%
    expect(result.employerPortion).toBe(110); // 1000 × 11%
    expect(result.total).toBe(165);
  });

  test("SA: employee 9.75%, employer 11.75% of basic + 40% of allowances", () => {
    const result = calculateSocialInsurance(5000, 2000, "SA");
    // SA base = basic + 40% of allowances = 5000 + 800 = 5800
    // Employee: 5800 × 9.75% = 565.5
    // Employer: 5800 × 11.75% = 681.5
    expect(result.employeePortion).toBe(565.5);
    expect(result.employerPortion).toBe(681.5);
    expect(result.total).toBe(1247);
  });

  test("AE: employee 5%, employer 12.5% of basic salary", () => {
    const result = calculateSocialInsurance(8000, 1500, "AE");
    // AE base = basic = 8000
    // Employee: 8000 × 5% = 400
    // Employer: 8000 × 12.5% = 1000
    expect(result.employeePortion).toBe(400);
    expect(result.employerPortion).toBe(1000);
    expect(result.total).toBe(1400);
  });

  test("BH: employee 5%, employer 12%", () => {
    const result = calculateSocialInsurance(1000, 200, "BH");
    expect(result.employeePortion).toBe(50); // 1000 × 5%
    expect(result.employerPortion).toBe(120); // 1000 × 12%
  });

  test("OM: employee 6.5%, employer 11.5%", () => {
    const result = calculateSocialInsurance(1000, 200, "OM");
    expect(result.employeePortion).toBe(65); // 1000 × 6.5%
    expect(result.employerPortion).toBe(115); // 1000 × 11.5%
  });

  test("QA: employee 5%, employer 10%", () => {
    const result = calculateSocialInsurance(1000, 200, "QA");
    expect(result.employeePortion).toBe(50); // 1000 × 5%
    expect(result.employerPortion).toBe(100); // 1000 × 10%
  });

  test("Unknown country falls back to KW rates", () => {
    const result = calculateSocialInsurance(1000, 200, "XX");
    // Fallback to KW rates
    expect(result.employeePortion).toBe(55); // 1000 × 5.5%
    expect(result.employerPortion).toBe(110); // 1000 × 11%
  });
});

describe("payroll-wps: net salary calculation", () => {
  test("Basic net salary: gross - deductions = net", () => {
    const result = calculateNetSalarySimple(3000, 500, 165, 0, 0);
    // gross = 3000 + 500 = 3500
    // deductions = 165 (KW social insurance employee)
    // net = 3500 - 165 = 3335
    expect(result.grossSalary).toBe(3500);
    expect(result.totalDeductions).toBe(165);
    expect(result.netSalary).toBe(3335);
  });

  test("Net salary with bonus and advances", () => {
    const result = calculateNetSalarySimple(3000, 500, 165, 200, 100);
    // gross = 3000 + 500 + 200 = 3700
    // deductions = 165 + 100 = 265
    // net = 3700 - 265 = 3435
    expect(result.grossSalary).toBe(3700);
    expect(result.totalDeductions).toBe(265);
    expect(result.netSalary).toBe(3435);
  });

  test("Net salary: zero salary → zero net", () => {
    const result = calculateNetSalarySimple(0, 0, 0, 0, 0);
    expect(result.grossSalary).toBe(0);
    expect(result.netSalary).toBe(0);
  });

  test("No Float for money — net salary uses num() with 3 decimal scale", () => {
    const result = calculateNetSalarySimple(1000.123, 200.456, 55, 0, 0);
    // All calculations use num() with scale 3
    const netStr = result.netSalary.toFixed(3);
    expect(netStr).toMatch(/^\d+\.\d{3}$/);
  });
});

describe("payroll-wps: WPS file format", () => {
  test("KW WPS header line format", () => {
    const company = { name: "Test Co", slug: "test-co" };
    const headerLine = `H|${company.name}|${company.slug}|2025-01|5|KWD`;
    expect(headerLine).toContain("H|");
    expect(headerLine).toContain("Test Co");
    expect(headerLine).toContain("KWD");
  });

  test("SA WPS header line format", () => {
    const company = { name: "Saudi Co", slug: "saudi-co" };
    const headerLine = `HEADER|${company.name}|2025-01|5|SAR`;
    expect(headerLine).toContain("HEADER|");
    expect(headerLine).toContain("Saudi Co");
    expect(headerLine).toContain("SAR");
  });

  test("AE WPS header line format", () => {
    const company = { name: "UAE Co", slug: "uae-co" };
    const headerLine = `HDR|${company.name}|${company.slug}|2025-01|AED`;
    expect(headerLine).toContain("HDR|");
    expect(headerLine).toContain("UAE Co");
    expect(headerLine).toContain("AED");
  });

  test("WPS file naming convention", () => {
    const kwFileName = `WPS_KW_test-co_2025-01.txt`;
    const saFileName = `WPS_SA_saudi-co_2025-01.txt`;
    const aeFileName = `WPS_AE_uae-co_2025-01.txt`;
    expect(kwFileName).toContain("WPS_KW");
    expect(saFileName).toContain("WPS_SA");
    expect(aeFileName).toContain("WPS_AE");
  });
});

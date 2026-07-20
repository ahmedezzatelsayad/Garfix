/**
 * gratuity.ts — End-of-service gratuity calculator (Kuwait Labor Law).
 *
 * Kuwait Labor Law (Law No. 6 of 2010), Article 51:
 *   - Less than 5 years of service: 15 days of pay per year (capped at 1.5 months per year)
 *   - 5+ years of service: 1 month of pay per year for years beyond 5
 *   - "Pay" = last drawn BASIC salary + regular allowances (not total package)
 *   - Daily wage = monthly salary / 26 (working days per month in Kuwait)
 *   - Maximum gratuity: 1.5 years of salary
 *
 * This engine is also configurable for other Gulf countries:
 *   - Saudi Arabia: similar to Kuwait (15 days/year first 5 years, 1 month/year after)
 *   - UAE: 21 days/year first 5 years, 30 days/year after (capped at 2 years)
 *   - Qatar: 3 weeks/year first 5 years, 4 weeks/year after
 *   - Bahrain: 1 month/year (flat)
 *   - Oman: 15 days/year first 3 years, 1 month/year after
 */

import { num } from "./money";

export interface GratuityInput {
  joinDate: string; // YYYY-MM-DD
  endDate?: string | null; // YYYY-MM-DD (defaults to today)
  monthlySalary: number; // basic salary + regular allowances
  countryCode: string; // KW, SA, AE, QA, BH, OM
}

export interface GratuityResult {
  yearsOfService: number;
  totalDays: number;
  dailyWage: number;
  gratuityAmount: number;
  cappedAmount: number | null;
  formula: string;
  breakdown: Array<{ period: string; rate: string; days: number; amount: number }>;
}

interface GratuityRule {
  // Rates per year of service
  firstPeriodYears: number;
  firstPeriodDaysPerYear: number; // e.g., 15 days/year
  afterPeriodDaysPerYear: number; // e.g., 30 days/year (= 1 month)
  workingDaysPerMonth: number; // for daily wage calculation (26 in Kuwait)
  maxYearsCap: number | null; // maximum years of gratuity
  formulaAr: string;
}

const RULES: Record<string, GratuityRule> = {
  KW: {
    firstPeriodYears: 5,
    firstPeriodDaysPerYear: 15,
    afterPeriodDaysPerYear: 30,
    workingDaysPerMonth: 26,
    maxYearsCap: 1.5 * 12 / 1, // 1.5 years of salary = 18 months → expressed differently below
    formulaAr: "أول 5 سنوات: 15 يوم/سنة، بعد ذلك: شهر كامل/سنة (بحد أقصى 1.5 سنة راتب)",
  },
  SA: {
    firstPeriodYears: 5,
    firstPeriodDaysPerYear: 15,
    afterPeriodDaysPerYear: 30,
    workingDaysPerMonth: 26,
    maxYearsCap: null,
    formulaAr: "أول 5 سنوات: 15 يوم/سنة، بعد ذلك: شهر كامل/سنة",
  },
  AE: {
    firstPeriodYears: 5,
    firstPeriodDaysPerYear: 21,
    afterPeriodDaysPerYear: 30,
    workingDaysPerMonth: 26,
    maxYearsCap: 24, // 2 years
    formulaAr: "أول 5 سنوات: 21 يوم/سنة، بعد ذلك: شهر كامل/سنة (بحد أقصى سنتين)",
  },
  QA: {
    firstPeriodYears: 5,
    firstPeriodDaysPerYear: 21, // 3 weeks
    afterPeriodDaysPerYear: 28, // 4 weeks
    workingDaysPerMonth: 26,
    maxYearsCap: null,
    formulaAr: "أول 5 سنوات: 3 أسابيع/سنة، بعد ذلك: 4 أسابيع/سنة",
  },
  BH: {
    firstPeriodYears: 0,
    firstPeriodDaysPerYear: 30,
    afterPeriodDaysPerYear: 30,
    workingDaysPerMonth: 26,
    maxYearsCap: null,
    formulaAr: "شهر كامل لكل سنة خدمة",
  },
  OM: {
    firstPeriodYears: 3,
    firstPeriodDaysPerYear: 15,
    afterPeriodDaysPerYear: 30,
    workingDaysPerMonth: 26,
    maxYearsCap: null,
    formulaAr: "أول 3 سنوات: 15 يوم/سنة، بعد ذلك: شهر كامل/سنة",
  },
};

/**
 * Calculate end-of-service gratuity based on Gulf labor law.
 *
 * @param input - { joinDate, endDate, monthlySalary, countryCode }
 * @returns GratuityResult with breakdown
 */
export function calculateGratuity(input: GratuityInput): GratuityResult {
  const rule = RULES[input.countryCode] || RULES.KW;
  const end = input.endDate ? new Date(input.endDate) : new Date();
  const start = new Date(input.joinDate);

  // Calculate years of service
  const msPerDay = 24 * 60 * 60 * 1000;
  const totalDays = Math.max(0, Math.floor((end.getTime() - start.getTime()) / msPerDay));
  const yearsOfService = totalDays / 365.25;

  // Daily wage = monthly salary / working days per month
  const dailyWage = num(input.monthlySalary, 3) / rule.workingDaysPerMonth;

  const breakdown: GratuityResult["breakdown"] = [];
  let totalGratuityDays = 0;

  if (yearsOfService <= rule.firstPeriodYears || rule.firstPeriodYears === 0) {
    // All service in first period
    const days = yearsOfService * rule.firstPeriodDaysPerYear;
    totalGratuityDays = days;
    breakdown.push({
      period: `أول ${rule.firstPeriodYears || "كل"} سنوات`,
      rate: `${rule.firstPeriodDaysPerYear} يوم/سنة`,
      days: Math.round(days * 10) / 10,
      amount: Math.round(days * dailyWage * 1000) / 1000,
    });
  } else {
    // Split: first period + after period
    const firstPeriodDays = rule.firstPeriodYears * rule.firstPeriodDaysPerYear;
    const afterYears = yearsOfService - rule.firstPeriodYears;
    const afterDays = afterYears * rule.afterPeriodDaysPerYear;
    totalGratuityDays = firstPeriodDays + afterDays;

    breakdown.push({
      period: `أول ${rule.firstPeriodYears} سنوات`,
      rate: `${rule.firstPeriodDaysPerYear} يوم/سنة`,
      days: firstPeriodDays,
      amount: Math.round(firstPeriodDays * dailyWage * 1000) / 1000,
    });
    breakdown.push({
      period: `بعد ${rule.firstPeriodYears} سنوات`,
      rate: `${rule.afterPeriodDaysPerYear} يوم/سنة (شهر كامل)`,
      days: Math.round(afterDays * 10) / 10,
      amount: Math.round(afterDays * dailyWage * 1000) / 1000,
    });
  }

  let gratuityAmount = totalGratuityDays * dailyWage;

  // Apply cap if configured (in months of salary)
  let cappedAmount: number | null = null;
  if (rule.maxYearsCap) {
    const monthlyCap = input.monthlySalary * rule.maxYearsCap;
    if (gratuityAmount > monthlyCap) {
      cappedAmount = monthlyCap;
      gratuityAmount = monthlyCap;
    }
  }

  return {
    yearsOfService: Math.round(yearsOfService * 100) / 100,
    totalDays,
    dailyWage: Math.round(dailyWage * 1000) / 1000,
    gratuityAmount: Math.round(gratuityAmount * 1000) / 1000,
    cappedAmount: cappedAmount !== null ? Math.round(cappedAmount * 1000) / 1000 : null,
    formula: rule.formulaAr,
    breakdown,
  };
}

/** Check if an employee is eligible for gratuity (minimum 1 year in most Gulf countries). */
export function isEligibleForGratuity(joinDate: string, endDate?: string | null, countryCode = "KW"): boolean {
  const end = endDate ? new Date(endDate) : new Date();
  const start = new Date(joinDate);
  const years = (end.getTime() - start.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
  // Most Gulf countries require minimum 1 year of continuous service
  // Kuwait: minimum 1 year (Article 51)
  // UAE: minimum 1 year
  // Saudi: minimum 1 year
  return years >= 1;
}

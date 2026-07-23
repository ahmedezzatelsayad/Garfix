/**
 * partner-capital.test.ts — Tests for Partner capital accounts and profit distribution (Phase 13).
 *
 * Replicates pure logic from partner-capital.ts for testing without DB.
 * Tests: profit distribution calculation, ownership percentage extraction,
 * equal distribution fallback, percentage normalization, profit share calculation,
 * capital account identification, JE line construction, validation logic.
 */

import { describe, test, expect } from "bun:test";
import { num } from "@/lib/money";

// ── Replicated pure logic ──────────────────────────────────────────────────────

interface PartnerAccount {
  id: number;
  nameAr: string;
  nameEn: string | null;
  code: string;
}

interface PartnerDistribution {
  partnerAccountId: number;
  partnerName: string;
  accountCode: string;
  ownershipPercent: string;
  profitShare: string;
}

/**
 * Extract ownership percentage from nameEn field.
 * Format: "partner:X%" → extracts X as a number.
 */
function extractOwnershipPercent(nameEn: string | null): number {
  if (!nameEn) return 0;
  const percentMatch = nameEn.match(/(\d+\.?\d*)%/);
  if (percentMatch) return parseFloat(percentMatch[1]);
  return 0;
}

/**
 * Determine if an account is a capital/partner account (not retained earnings).
 * Check Arabic and English name patterns.
 */
function isCapitalAccount(acc: PartnerAccount): boolean {
  return acc.nameAr.includes("شريك") || acc.nameAr.includes("رأس مال") ||
    (acc.nameEn !== null && (acc.nameEn.toLowerCase().includes("capital") || acc.nameEn.toLowerCase().includes("partner")));
}

/**
 * Calculate profit distribution across partners.
 * Mirrors the core logic from calculateProfitDistribution without DB calls.
 */
function calculateProfitDistribution(
  netProfit: number,
  partnerAccounts: PartnerAccount[],
): PartnerDistribution[] {
  const ownershipMap = new Map<number, number>();

  // First pass: extract ownership percentages and filter capital accounts
  const capitalAccounts: PartnerAccount[] = [];
  for (const acc of partnerAccounts) {
    if (!isCapitalAccount(acc) && partnerAccounts.length > 0) {
      continue; // Skip retained earnings / general equity accounts
    }
    const ownership = extractOwnershipPercent(acc.nameEn);
    ownershipMap.set(acc.id, ownership);
    capitalAccounts.push(acc);
  }

  // Second pass: distribute equally if no percentages found
  const hasExplicitPercents = Array.from(ownershipMap.values()).some((v) => v > 0);
  if (!hasExplicitPercents && capitalAccounts.length > 0) {
    const equalShare = 100 / capitalAccounts.length;
    for (const acc of capitalAccounts) {
      ownershipMap.set(acc.id, equalShare);
    }
  }

  // Normalize percentages to sum to 100
  const rawTotal = Array.from(ownershipMap.values()).reduce<number>((s, v) => s + v, 0);
  for (const [accId, percent] of ownershipMap) {
    const normalized = rawTotal > 0 ? (percent / rawTotal) * 100 : 0;
    ownershipMap.set(accId, normalized);
  }

  // Calculate profit shares
  const partners: PartnerDistribution[] = [];
  for (const acc of capitalAccounts) {
    const percent = ownershipMap.get(acc.id) || 0;
    const profitShare = num(netProfit * percent / 100, 3);

    partners.push({
      partnerAccountId: acc.id,
      partnerName: acc.nameAr,
      accountCode: acc.code,
      ownershipPercent: num(percent, 2).toFixed(2),
      profitShare: profitShare.toFixed(3),
    });
  }

  return partners;
}

/**
 * Validate profit distribution for JE posting.
 * Mirrors validation from postProfitDistributionJE.
 */
function validateProfitDistribution(
  netProfit: number,
  partners: PartnerDistribution[],
): string | null {
  if (partners.length === 0) return "No partners to distribute profit to";
  if (netProfit <= 0) return "Net profit must be positive to distribute";
  return null;
}

/**
 * Build JE lines for profit distribution posting.
 * Debit: Retained Earnings / Income Summary (total profit)
 * Credit: Each partner's capital account (their share)
 */
function buildProfitDistributionJELines(
  netProfit: number,
  partners: PartnerDistribution[],
  retainedEarningsAccountId: number,
  periodFrom: string,
  periodTo: string,
): Array<{ accountId: number; debit: string; credit: string; description: string }> {
  const lines: Array<{ accountId: number; debit: string; credit: string; description: string }> = [
    {
      accountId: retainedEarningsAccountId,
      debit: num(netProfit, 3).toFixed(3),
      credit: "0.000",
      description: `توزيع أرباح - ${periodFrom} إلى ${periodTo}`,
    },
  ];

  for (const partner of partners) {
    lines.push({
      accountId: partner.partnerAccountId,
      debit: "0.000",
      credit: num(partner.profitShare, 3).toFixed(3),
      description: `نصيب ${partner.partnerName} من الأرباح (${partner.ownershipPercent}%)`,
    });
  }

  return lines;
}

/**
 * Calculate net profit from revenue, expenses, and contra-revenue journal lines.
 * Revenue: credit increases, debit decreases
 * Expenses: debit increases, credit decreases
 * Contra-revenue: debit increases (reduces net revenue), credit decreases
 */
function calculateNetProfit(
  revenueLines: Array<{ credit: string; debit: string; status: string }>,
  expenseLines: Array<{ debit: string; credit: string; status: string }>,
  contraRevenueLines: Array<{ debit: string; credit: string; status: string }>,
): number {
  let totalRevenue = 0;
  let totalExpenses = 0;
  let totalContraRevenue = 0;

  for (const line of revenueLines) {
    const multiplier = line.status === "reversed" ? -1 : 1;
    totalRevenue += num(line.credit, 3) * multiplier;
    totalRevenue -= num(line.debit, 3) * multiplier;
  }

  for (const line of expenseLines) {
    const multiplier = line.status === "reversed" ? -1 : 1;
    totalExpenses += num(line.debit, 3) * multiplier;
    totalExpenses -= num(line.credit, 3) * multiplier;
  }

  for (const line of contraRevenueLines) {
    const multiplier = line.status === "reversed" ? -1 : 1;
    totalContraRevenue += num(line.debit, 3) * multiplier;
    totalContraRevenue -= num(line.credit, 3) * multiplier;
  }

  return num(totalRevenue - totalExpenses - totalContraRevenue, 3);
}

// ── Tests ─────────────────────────────────────────────────────────────────────────

describe("partner-capital: ownership percentage extraction (استخراج نسبة الملكية)", () => {
  test("nameEn with 'partner:60%' → extracts 60", () => {
    expect(extractOwnershipPercent("partner:60%")).toBe(60);
  });

  test("nameEn with 'Partner Capital 40%' → extracts 40", () => {
    expect(extractOwnershipPercent("Partner Capital 40%")).toBe(40);
  });

  test("nameEn with '33.33%' → extracts 33.33", () => {
    expect(extractOwnershipPercent("Capital Account 33.33%")).toBe(33.33);
  });

  test("nameEn without percentage → returns 0", () => {
    expect(extractOwnershipPercent("Partner Capital")).toBe(0);
  });

  test("null nameEn → returns 0", () => {
    expect(extractOwnershipPercent(null)).toBe(0);
  });

  test("nameEn with multiple numbers → extracts first percentage", () => {
    // "Capital 50% share" → 50
    expect(extractOwnershipPercent("Capital 50% share")).toBe(50);
  });

  test("nameEn with 0% → extracts 0", () => {
    expect(extractOwnershipPercent("partner:0%")).toBe(0);
  });
});

describe("partner-capital: capital account identification (تحديد حساب رأس المال)", () => {
  test("Arabic name with 'شريك' → capital account", () => {
    const acc: PartnerAccount = { id: 1, nameAr: "شريك أول", nameEn: "First Partner", code: "3001" };
    expect(isCapitalAccount(acc)).toBe(true);
  });

  test("Arabic name with 'رأس مال' → capital account", () => {
    const acc: PartnerAccount = { id: 2, nameAr: "رأس مال الشريك", nameEn: null, code: "3002" };
    expect(isCapitalAccount(acc)).toBe(true);
  });

  test("English name with 'capital' → capital account", () => {
    const acc: PartnerAccount = { id: 3, nameAr: "أرباح مبقاة", nameEn: "Partner Capital Account", code: "3003" };
    expect(isCapitalAccount(acc)).toBe(true);
  });

  test("English name with 'partner' → capital account", () => {
    const acc: PartnerAccount = { id: 4, nameAr: "حقوق ملكية", nameEn: "Partner Equity", code: "3004" };
    expect(isCapitalAccount(acc)).toBe(true);
  });

  test("Retained earnings (أرباح مبقاة) without capital keyword → NOT capital account", () => {
    const acc: PartnerAccount = { id: 5, nameAr: "أرباح مبقاة", nameEn: "Retained Earnings", code: "3100" };
    expect(isCapitalAccount(acc)).toBe(false);
  });

  test("General equity (حقوق ملكية) without capital keyword → NOT capital account", () => {
    const acc: PartnerAccount = { id: 6, nameAr: "حقوق ملكية عامة", nameEn: "General Equity", code: "3200" };
    expect(isCapitalAccount(acc)).toBe(false);
  });
});

describe("partner-capital: profit distribution calculation (حساب توزيع الأرباح)", () => {
  test("2 partners with explicit percentages: 60% and 40%", () => {
    const partners: PartnerAccount[] = [
      { id: 1, nameAr: "شريك أول", nameEn: "partner:60%", code: "3001" },
      { id: 2, nameAr: "شريك ثاني", nameEn: "partner:40%", code: "3002" },
    ];
    const distribution = calculateProfitDistribution(10000, partners);
    expect(distribution.length).toBe(2);
    expect(distribution[0].profitShare).toBe("6000.000");
    expect(distribution[1].profitShare).toBe("4000.000");
  });

  test("3 partners with no explicit percentages → equal distribution", () => {
    const partners: PartnerAccount[] = [
      { id: 1, nameAr: "شريك أول", nameEn: "Partner A", code: "3001" },
      { id: 2, nameAr: "شريك ثاني", nameEn: "Partner B", code: "3002" },
      { id: 3, nameAr: "شريك ثالث", nameEn: "Partner C", code: "3003" },
    ];
    const distribution = calculateProfitDistribution(9000, partners);
    expect(distribution.length).toBe(3);
    // Each gets 33.33% (normalized from 33.333...)
    // 9000 * 33.33% ≈ 3000 each, with rounding
    expect(distribution[0].profitShare).toBe("3000.000");
    expect(distribution[1].profitShare).toBe("3000.000");
    // Last partner gets slightly different due to rounding
  });

  test("Single partner with 100% → gets all profit", () => {
    const partners: PartnerAccount[] = [
      { id: 1, nameAr: "شريك واحد", nameEn: "partner:100%", code: "3001" },
    ];
    const distribution = calculateProfitDistribution(50000, partners);
    expect(distribution.length).toBe(1);
    expect(distribution[0].profitShare).toBe("50000.000");
    expect(distribution[0].ownershipPercent).toBe("100.00");
  });

  test("Zero profit → all shares are 0.000", () => {
    const partners: PartnerAccount[] = [
      { id: 1, nameAr: "شريك أول", nameEn: "partner:60%", code: "3001" },
      { id: 2, nameAr: "شريك ثاني", nameEn: "partner:40%", code: "3002" },
    ];
    const distribution = calculateProfitDistribution(0, partners);
    expect(distribution[0].profitShare).toBe("0.000");
    expect(distribution[1].profitShare).toBe("0.000");
  });

  test("Mixed explicit and implicit percentages → normalize based on explicit values", () => {
    const partners: PartnerAccount[] = [
      { id: 1, nameAr: "شريك أول", nameEn: "partner:50%", code: "3001" },
      { id: 2, nameAr: "شريك ثاني", nameEn: "Partner B", code: "3002" }, // no percentage → 0
    ];
    // Partner A has explicit 50%, Partner B has no percentage (0).
    // hasExplicitPercents = true (50 > 0), so no equal distribution fallback.
    // Raw total = 50 + 0 = 50. Normalized: A = (50/50)*100 = 100%, B = (0/50)*100 = 0%.
    const distribution = calculateProfitDistribution(20000, partners);
    expect(distribution.length).toBe(2);
    expect(distribution[0].profitShare).toBe("20000.000");
    expect(distribution[1].profitShare).toBe("0.000");
  });

  test("Percentage normalization: 30% + 70% sums to 100%", () => {
    const partners: PartnerAccount[] = [
      { id: 1, nameAr: "شريك أول", nameEn: "partner:30%", code: "3001" },
      { id: 2, nameAr: "شريك ثاني", nameEn: "partner:70%", code: "3002" },
    ];
    const distribution = calculateProfitDistribution(10000, partners);
    const totalPercent = distribution.reduce((s, p) => s + parseFloat(p.ownershipPercent), 0);
    expect(Math.abs(totalPercent - 100)).toBeLessThanOrEqual(0.01);
  });
});

describe("partner-capital: net profit calculation (حساب صافي الربح)", () => {
  test("Simple: Revenue 1000, Expenses 600 → Net Profit 400", () => {
    const revenue = [{ credit: "1000.000", debit: "0.000", status: "posted" }];
    const expenses = [{ debit: "600.000", credit: "0.000", status: "posted" }];
    const contraRevenue = [];
    const netProfit = calculateNetProfit(revenue, expenses, contraRevenue);
    expect(netProfit).toBe(400);
  });

  test("With contra-revenue (discounts): Revenue 1000, Contra 100, Expenses 600 → Net Profit 300", () => {
    const revenue = [{ credit: "1000.000", debit: "0.000", status: "posted" }];
    const expenses = [{ debit: "600.000", credit: "0.000", status: "posted" }];
    const contraRevenue = [{ debit: "100.000", credit: "0.000", status: "posted" }];
    const netProfit = calculateNetProfit(revenue, expenses, contraRevenue);
    expect(netProfit).toBe(300);
  });

  test("Reversed entry: multiplier -1 applies correctly", () => {
    const revenue = [{ credit: "500.000", debit: "0.000", status: "reversed" }];
    const expenses = [{ debit: "300.000", credit: "0.000", status: "posted" }];
    const contraRevenue = [];
    // Revenue reversed: -500; Expenses: 300 → Net Profit = -500 - 300 = -800
    const netProfit = calculateNetProfit(revenue, expenses, contraRevenue);
    expect(netProfit).toBe(-800);
  });

  test("Multiple revenue lines: 800 + 200 = 1000 total", () => {
    const revenue = [
      { credit: "800.000", debit: "0.000", status: "posted" },
      { credit: "200.000", debit: "0.000", status: "posted" },
    ];
    const expenses = [];
    const contraRevenue = [];
    const netProfit = calculateNetProfit(revenue, expenses, contraRevenue);
    expect(netProfit).toBe(1000);
  });

  test("Revenue with debit entry reduces revenue balance", () => {
    const revenue = [{ credit: "1000.000", debit: "100.000", status: "posted" }];
    const expenses = [];
    const contraRevenue = [];
    // Revenue: credit 1000 - debit 100 = 900
    const netProfit = calculateNetProfit(revenue, expenses, contraRevenue);
    expect(netProfit).toBe(900);
  });

  test("All zeros → net profit = 0", () => {
    const revenue = [];
    const expenses = [];
    const contraRevenue = [];
    expect(calculateNetProfit(revenue, expenses, contraRevenue)).toBe(0);
  });

  test("Loss scenario: Expenses > Revenue → negative net profit", () => {
    const revenue = [{ credit: "200.000", debit: "0.000", status: "posted" }];
    const expenses = [{ debit: "500.000", credit: "0.000", status: "posted" }];
    const contraRevenue = [];
    expect(calculateNetProfit(revenue, expenses, contraRevenue)).toBe(-300);
  });
});

describe("partner-capital: profit distribution validation (التحقق من توزيع الأرباح)", () => {
  test("Valid distribution: positive profit and partners → no error", () => {
    const partners: PartnerDistribution[] = [
      { partnerAccountId: 1, partnerName: "شريك أول", accountCode: "3001", ownershipPercent: "60.00", profitShare: "6000.000" },
    ];
    const error = validateProfitDistribution(10000, partners);
    expect(error).toBeNull();
  });

  test("No partners → error message", () => {
    const error = validateProfitDistribution(10000, []);
    expect(error).toContain("No partners");
  });

  test("Zero net profit → error: must be positive", () => {
    const partners: PartnerDistribution[] = [
      { partnerAccountId: 1, partnerName: "شريك", accountCode: "3001", ownershipPercent: "100.00", profitShare: "0.000" },
    ];
    const error = validateProfitDistribution(0, partners);
    expect(error).toContain("positive");
  });

  test("Negative net profit → error", () => {
    const error = validateProfitDistribution(-500, [
      { partnerAccountId: 1, partnerName: "شريك", accountCode: "3001", ownershipPercent: "100.00", profitShare: "0.000" },
    ]);
    expect(error).toContain("positive");
  });
});

describe("partner-capital: profit distribution JE lines (قيد توزيع الأرباح)", () => {
  test("JE lines are balanced (debit = credit)", () => {
    const partners: PartnerDistribution[] = [
      { partnerAccountId: 1, partnerName: "شريك أول", accountCode: "3001", ownershipPercent: "60.00", profitShare: "6000.000" },
      { partnerAccountId: 2, partnerName: "شريك ثاني", accountCode: "3002", ownershipPercent: "40.00", profitShare: "4000.000" },
    ];
    const lines = buildProfitDistributionJELines(10000, partners, 99, "2025-01-01", "2025-06-30");

    const totalDebit = lines.reduce((s, l) => s + num(l.debit, 3), 0);
    const totalCredit = lines.reduce((s, l) => s + num(l.credit, 3), 0);
    expect(Math.abs(totalDebit - totalCredit)).toBeLessThanOrEqual(0.001);
  });

  test("Debit line: Retained Earnings = total net profit", () => {
    const partners: PartnerDistribution[] = [
      { partnerAccountId: 1, partnerName: "شريك", accountCode: "3001", ownershipPercent: "100.00", profitShare: "50000.000" },
    ];
    const lines = buildProfitDistributionJELines(50000, partners, 99, "2025-01-01", "2025-12-31");
    expect(lines[0].accountId).toBe(99); // Retained Earnings
    expect(lines[0].debit).toBe("50000.000");
    expect(lines[0].credit).toBe("0.000");
    expect(lines[0].description).toContain("توزيع أرباح");
  });

  test("Credit lines: each partner gets their share with Arabic description", () => {
    const partners: PartnerDistribution[] = [
      { partnerAccountId: 1, partnerName: "شريك أول", accountCode: "3001", ownershipPercent: "70.00", profitShare: "7000.000" },
      { partnerAccountId: 2, partnerName: "شريك ثاني", accountCode: "3002", ownershipPercent: "30.00", profitShare: "3000.000" },
    ];
    const lines = buildProfitDistributionJELines(10000, partners, 99, "2025-01-01", "2025-06-30");
    expect(lines[1].description).toContain("نصيب شريك أول من الأرباح");
    expect(lines[1].description).toContain("70.00%");
    expect(lines[2].description).toContain("نصيب شريك ثاني من الأرباح");
    expect(lines[2].description).toContain("30.00%");
  });

  test("JE total lines = 1 debit + N credit lines", () => {
    const partners: PartnerDistribution[] = [
      { partnerAccountId: 1, partnerName: "A", accountCode: "3001", ownershipPercent: "50.00", profitShare: "5000.000" },
      { partnerAccountId: 2, partnerName: "B", accountCode: "3002", ownershipPercent: "50.00", profitShare: "5000.000" },
    ];
    const lines = buildProfitDistributionJELines(10000, partners, 99, "2025-01", "2025-06");
    expect(lines.length).toBe(3); // 1 debit + 2 credit
  });
});

describe("partner-capital: monetary values as 3-decimal strings (القيم النقدية)", () => {
  test("All profitShare values are 3-decimal strings", () => {
    const partners: PartnerAccount[] = [
      { id: 1, nameAr: "شريك", nameEn: "partner:100%", code: "3001" },
    ];
    const distribution = calculateProfitDistribution(1234.567, partners);
    for (const p of distribution) {
      expect(p.profitShare).toMatch(/^\d+\.\d{3}$/);
    }
  });

  test("All ownershipPercent values are 2-decimal strings", () => {
    const partners: PartnerAccount[] = [
      { id: 1, nameAr: "شريك", nameEn: "partner:100%", code: "3001" },
    ];
    const distribution = calculateProfitDistribution(1000, partners);
    for (const p of distribution) {
      expect(p.ownershipPercent).toMatch(/^\d+\.\d{2}$/);
    }
  });

  test("JE line amounts are all 3-decimal strings", () => {
    const partners: PartnerDistribution[] = [
      { partnerAccountId: 1, partnerName: "شريك", accountCode: "3001", ownershipPercent: "100.00", profitShare: "1000.000" },
    ];
    const lines = buildProfitDistributionJELines(1000, partners, 99, "2025-01", "2025-06");
    for (const l of lines) {
      expect(l.debit).toMatch(/^\d+\.\d{3}$/);
      expect(l.credit).toMatch(/^\d+\.\d{3}$/);
    }
  });
});

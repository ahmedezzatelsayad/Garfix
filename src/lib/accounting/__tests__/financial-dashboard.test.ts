/**
 * financial-dashboard.test.ts — Tests for dashboard metrics.
 *
 * Replicates pure logic from financial-dashboard.ts for testing without DB.
 * Tests: revenue/expense calculation from JE lines, period comparison,
 * budget vs actual variance, change percentage calculation.
 */

import { describe, test, expect } from "bun:test";
import { num } from "@/lib/money";

// ── Replicated pure logic ──────────────────────────────────────────────────────

interface JELineLike {
  accountId: number;
  accountType: string;
  debit: string;
  credit: string;
}

/**
 * Calculate revenue and expenses from posted JE lines.
 */
function calculateRevenueAndExpenses(
  lines: JELineLike[],
): { revenue: number; expenses: number; netProfit: number } {
  let revenue = 0;
  let expenses = 0;

  for (const line of lines) {
    const debit = num(line.debit, 3);
    const credit = num(line.credit, 3);

    if (line.accountType === "revenue") {
      revenue += credit - debit;
    } else if (line.accountType === "expense") {
      expenses += debit - credit;
    } else if (line.accountType === "contra_revenue") {
      revenue -= (debit - credit);
    }
  }

  const netProfit = revenue - expenses;
  return { revenue, expenses, netProfit };
}

/**
 * Compute % change between two values.
 */
function computeChangePercent(current: number, previous: number): number | null {
  if (previous === 0) return current > 0 ? 100 : null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

/**
 * Calculate budget vs actual variance.
 */
function calculateVariance(planned: number, actual: number): { variance: number; variancePercent: number | null } {
  const variance = actual - planned;
  const variancePercent = planned !== 0 ? ((variance / Math.abs(planned)) * 100) : null;
  return { variance, variancePercent };
}

/**
 * Calculate cash position from bank/cash accounts.
 */
function calculateCashPosition(
  accounts: Array<{ type: string; balance: string }>,
): number {
  return accounts
    .filter((a) => a.type === "asset")
    .reduce((sum, a) => sum + num(a.balance, 3), 0);
}

/**
 * Parse period string to date range.
 */
function parsePeriodToRange(period: string): { from: string; to: string } | null {
  if (period.length === 4) {
    // Year: 2024
    return { from: `${period}-01-01`, to: `${period}-12-31` };
  } else if (period.length === 7 && period.includes("-")) {
    // Month: 2024-01
    const [year, month] = period.split("-");
    const lastDay = new Date(parseInt(year), parseInt(month), 0).getDate();
    return { from: `${year}-${month}-01`, to: `${year}-${month}-${lastDay}` };
  }
  return null;
}

// ── Tests ─────────────────────────────────────────────────────────────────────────

describe("financial-dashboard: calculateRevenueAndExpenses", () => {
  test("Revenue 5000, Expenses 3000 → Net Profit 2000", () => {
    const lines: JELineLike[] = [
      { accountId: 1, accountType: "revenue", debit: "0.000", credit: "5000.000" },
      { accountId: 2, accountType: "expense", debit: "3000.000", credit: "0.000" },
    ];
    const result = calculateRevenueAndExpenses(lines);
    expect(result.revenue).toBe(5000);
    expect(result.expenses).toBe(3000);
    expect(result.netProfit).toBe(2000);
  });

  test("Revenue with contra-revenue (discounts)", () => {
    const lines: JELineLike[] = [
      { accountId: 1, accountType: "revenue", debit: "0.000", credit: "5000.000" },
      { accountId: 2, accountType: "contra_revenue", debit: "500.000", credit: "0.000" },
      { accountId: 3, accountType: "expense", debit: "2000.000", credit: "0.000" },
    ];
    const result = calculateRevenueAndExpenses(lines);
    // Net revenue = 5000 - (500-0) = 4500
    expect(result.revenue).toBe(4500);
    expect(result.expenses).toBe(2000);
    expect(result.netProfit).toBe(2500);
  });

  test("Net loss: Expenses > Revenue", () => {
    const lines: JELineLike[] = [
      { accountId: 1, accountType: "revenue", debit: "0.000", credit: "1000.000" },
      { accountId: 2, accountType: "expense", debit: "2000.000", credit: "0.000" },
    ];
    const result = calculateRevenueAndExpenses(lines);
    expect(result.netProfit).toBe(-1000);
  });

  test("No JE lines → Revenue 0, Expenses 0, Net 0", () => {
    const result = calculateRevenueAndExpenses([]);
    expect(result.revenue).toBe(0);
    expect(result.expenses).toBe(0);
    expect(result.netProfit).toBe(0);
  });

  test("Multiple revenue and expense accounts", () => {
    const lines: JELineLike[] = [
      { accountId: 1, accountType: "revenue", debit: "0.000", credit: "3000.000" },
      { accountId: 2, accountType: "revenue", debit: "0.000", credit: "2000.000" },
      { accountId: 3, accountType: "expense", debit: "1000.000", credit: "0.000" },
      { accountId: 4, accountType: "expense", debit: "500.000", credit: "100.000" },
    ];
    const result = calculateRevenueAndExpenses(lines);
    expect(result.revenue).toBe(5000);
    expect(result.expenses).toBe(1400); // 1000 + (500-100) = 1400
    expect(result.netProfit).toBe(3600);
  });
});

describe("financial-dashboard: computeChangePercent", () => {
  test("Current 200, Previous 100 → 100% increase", () => {
    const result = computeChangePercent(200, 100);
    expect(result).toBe(100);
  });

  test("Current 100, Previous 200 → 50% decrease", () => {
    const result = computeChangePercent(100, 200);
    expect(result).toBe(-50);
  });

  test("Current 5000, Previous 0 → 100% (special case)", () => {
    const result = computeChangePercent(5000, 0);
    expect(result).toBe(100);
  });

  test("Current 0, Previous 0 → null", () => {
    const result = computeChangePercent(0, 0);
    expect(result).toBeNull();
  });

  test("Current 0, Previous 100 → -100% decrease", () => {
    const result = computeChangePercent(0, 100);
    expect(result).toBe(-100);
  });
});

describe("financial-dashboard: budget vs actual variance", () => {
  test("Over budget: actual > planned → positive variance", () => {
    const result = calculateVariance(10000, 12000);
    expect(result.variance).toBe(2000);
    expect(result.variancePercent).toBe(20); // 2000/10000 × 100
  });

  test("Under budget: actual < planned → negative variance", () => {
    const result = calculateVariance(10000, 8000);
    expect(result.variance).toBe(-2000);
    expect(result.variancePercent).toBe(-20);
  });

  test("On budget: actual = planned → zero variance", () => {
    const result = calculateVariance(10000, 10000);
    expect(result.variance).toBe(0);
    expect(result.variancePercent).toBe(0);
  });

  test("Zero planned budget → variancePercent = null", () => {
    const result = calculateVariance(0, 5000);
    expect(result.variance).toBe(5000);
    expect(result.variancePercent).toBeNull();
  });

  test("Expense variance: expense over budget", () => {
    // For expenses, positive variance = over budget (bad)
    const result = calculateVariance(5000, 6000);
    expect(result.variance).toBe(1000);
    expect(result.variancePercent).toBe(20);
  });
});

describe("financial-dashboard: cash position", () => {
  test("Cash position from asset accounts", () => {
    const accounts = [
      { type: "asset", balance: "5000.000" },
      { type: "asset", balance: "3000.000" },
      { type: "liability", balance: "2000.000" },
    ];
    expect(calculateCashPosition(accounts)).toBe(8000);
  });

  test("No asset accounts → cash = 0", () => {
    const accounts = [
      { type: "liability", balance: "2000.000" },
      { type: "revenue", balance: "5000.000" },
    ];
    expect(calculateCashPosition(accounts)).toBe(0);
  });
});

describe("financial-dashboard: parsePeriodToRange", () => {
  test("Year '2024' → 2024-01-01 to 2024-12-31", () => {
    const result = parsePeriodToRange("2024");
    expect(result?.from).toBe("2024-01-01");
    expect(result?.to).toBe("2024-12-31");
  });

  test("Month '2024-01' → 2024-01-01 to 2024-01-31", () => {
    const result = parsePeriodToRange("2024-01");
    expect(result?.from).toBe("2024-01-01");
    expect(result?.to).toBe("2024-01-31");
  });

  test("Month '2024-02' → 2024-02-01 to 2024-02-29 (leap year)", () => {
    const result = parsePeriodToRange("2024-02");
    expect(result?.from).toBe("2024-02-01");
    expect(result?.to).toBe("2024-02-29");
  });

  test("Invalid period → null", () => {
    const result = parsePeriodToRange("invalid");
    expect(result).toBeNull();
  });
});

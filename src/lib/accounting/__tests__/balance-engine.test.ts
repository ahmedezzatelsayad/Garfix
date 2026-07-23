/**
 * balance-engine.test.ts — Tests for balance derivation engine.
 *
 * Replicates pure logic from balance-engine.ts for testing without DB.
 * Tests: derived balance calculation, discrepancy detection, reconciliation.
 */

import { describe, test, expect } from "bun:test";
import { num } from "@/lib/money";

// ── Replicated pure logic ──────────────────────────────────────────────────────

interface AccountLike {
  id: number;
  code: string;
  nameAr: string;
  type: string;
  balance: string;
}

interface JELineLike {
  accountId: number;
  debit: string;
  credit: string;
}

/**
 * Calculate derived balance from JE lines (replicated from source).
 * For debit-normal accounts (asset, expense, contra_revenue): balance = total debits - total credits
 * For credit-normal accounts (liability, equity, revenue): balance = total credits - total debits
 */
function calculateDerivedBalance(
  account: AccountLike,
  postedLines: JELineLike[],
): string {
  const isDebitNormal = account.type === "asset" || account.type === "expense" || account.type === "contra_revenue";

  let derivedBalance: number;
  if (isDebitNormal) {
    derivedBalance = postedLines.reduce((sum, l) => sum + num(l.debit, 3) - num(l.credit, 3), 0);
  } else {
    derivedBalance = postedLines.reduce((sum, l) => sum + num(l.credit, 3) - num(l.debit, 3), 0);
  }

  return num(derivedBalance, 3).toFixed(3);
}

/**
 * Detect discrepancy between stored and derived balance.
 */
function detectDiscrepancy(account: AccountLike, derivedBalance: string): { difference: number; isDiscrepancy: boolean } {
  const storedBalance = num(account.balance, 3);
  const derived = num(derivedBalance, 3);
  const difference = num(storedBalance - derived, 3);
  const isDiscrepancy = Math.abs(difference) > 0.001;
  return { difference, isDiscrepancy };
}

/**
 * Trial balance: sum all debit and credit across all posted JE lines.
 */
function calculateTrialBalance(
  lines: JELineLike[],
): { grandDebit: number; grandCredit: number; isBalanced: boolean } {
  const grandDebit = lines.reduce((sum, l) => sum + num(l.debit, 3), 0);
  const grandCredit = lines.reduce((sum, l) => sum + num(l.credit, 3), 0);
  const isBalanced = Math.abs(grandDebit - grandCredit) < 0.001;
  return { grandDebit, grandCredit, isBalanced };
}

// ── Tests ─────────────────────────────────────────────────────────────────────────

describe("balance-engine: calculateDerivedBalance", () => {
  test("Asset account: debits - credits = derived balance", () => {
    const account: AccountLike = { id: 1, code: "1100", nameAr: "نقد", type: "asset", balance: "1000.000" };
    const lines: JELineLike[] = [
      { accountId: 1, debit: "500.000", credit: "0.000" },
      { accountId: 1, debit: "500.000", credit: "200.000" },
    ];
    // Debit-normal: (500+500) - (0+200) = 800
    expect(calculateDerivedBalance(account, lines)).toBe("800.000");
  });

  test("Revenue account: credits - debits = derived balance", () => {
    const account: AccountLike = { id: 2, code: "4000", nameAr: "إيرادات", type: "revenue", balance: "500.000" };
    const lines: JELineLike[] = [
      { accountId: 2, debit: "100.000", credit: "600.000" },
    ];
    // Credit-normal: 600 - 100 = 500
    expect(calculateDerivedBalance(account, lines)).toBe("500.000");
  });

  test("Expense account: debits - credits = derived balance", () => {
    const account: AccountLike = { id: 3, code: "6000", nameAr: "مصروفات", type: "expense", balance: "300.000" };
    const lines: JELineLike[] = [
      { accountId: 3, debit: "400.000", credit: "100.000" },
    ];
    // Debit-normal: 400 - 100 = 300
    expect(calculateDerivedBalance(account, lines)).toBe("300.000");
  });

  test("Liability account: credits - debits = derived balance", () => {
    const account: AccountLike = { id: 4, code: "2100", nameAr: "دائنون", type: "liability", balance: "200.000" };
    const lines: JELineLike[] = [
      { accountId: 4, debit: "50.000", credit: "250.000" },
    ];
    // Credit-normal: 250 - 50 = 200
    expect(calculateDerivedBalance(account, lines)).toBe("200.000");
  });

  test("Equity account: credits - debits = derived balance", () => {
    const account: AccountLike = { id: 5, code: "3000", nameAr: "أرباح مبقاة", type: "equity", balance: "5000.000" };
    const lines: JELineLike[] = [
      { accountId: 5, debit: "0.000", credit: "5000.000" },
    ];
    expect(calculateDerivedBalance(account, lines)).toBe("5000.000");
  });

  test("No lines → derived balance = 0.000", () => {
    const account: AccountLike = { id: 1, code: "1100", nameAr: "نقد", type: "asset", balance: "500.000" };
    expect(calculateDerivedBalance(account, [])).toBe("0.000");
  });
});

describe("balance-engine: detectDiscrepancy", () => {
  test("No discrepancy when stored = derived", () => {
    const account: AccountLike = { id: 1, code: "1100", nameAr: "نقد", type: "asset", balance: "800.000" };
    const result = detectDiscrepancy(account, "800.000");
    expect(result.isDiscrepancy).toBe(false);
    expect(result.difference).toBe(0);
  });

  test("Discrepancy detected when stored ≠ derived", () => {
    const account: AccountLike = { id: 1, code: "1100", nameAr: "نقد", type: "asset", balance: "500.000" };
    const result = detectDiscrepancy(account, "800.000");
    expect(result.isDiscrepancy).toBe(true);
    expect(result.difference).toBe(-300);
  });

  test("Small difference (< 0.001) is not a discrepancy", () => {
    const account: AccountLike = { id: 1, code: "1100", nameAr: "نقد", type: "asset", balance: "800.0005" };
    const result = detectDiscrepancy(account, "800.000");
    // Difference of 0.0005 < 0.001 threshold
    expect(result.isDiscrepancy).toBe(false);
  });
});

describe("balance-engine: trial balance", () => {
  test("Balanced entries: grandDebit ≈ grandCredit", () => {
    const lines: JELineLike[] = [
      { accountId: 1, debit: "100.000", credit: "0.000" },
      { accountId: 2, debit: "0.000", credit: "100.000" },
    ];
    const result = calculateTrialBalance(lines);
    expect(result.grandDebit).toBe(100);
    expect(result.grandCredit).toBe(100);
    expect(result.isBalanced).toBe(true);
  });

  test("Multiple balanced entries: trial balance totals equal", () => {
    const lines: JELineLike[] = [
      // Invoice JE: Debit AR, Credit Revenue
      { accountId: 1, debit: "500.000", credit: "0.000" },
      { accountId: 2, debit: "0.000", credit: "500.000" },
      // Payment JE: Debit Cash, Credit AR
      { accountId: 3, debit: "500.000", credit: "0.000" },
      { accountId: 1, debit: "0.000", credit: "500.000" },
    ];
    const result = calculateTrialBalance(lines);
    expect(result.grandDebit).toBe(1000);
    expect(result.grandCredit).toBe(1000);
    expect(result.isBalanced).toBe(true);
  });

  test("Unbalanced entries: grandDebit ≠ grandCredit → isBalanced=false", () => {
    const lines: JELineLike[] = [
      { accountId: 1, debit: "100.000", credit: "0.000" },
      { accountId: 2, debit: "0.000", credit: "50.000" },
    ];
    const result = calculateTrialBalance(lines);
    expect(result.grandDebit).toBe(100);
    expect(result.grandCredit).toBe(50);
    expect(result.isBalanced).toBe(false);
  });
});

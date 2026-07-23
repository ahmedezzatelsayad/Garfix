/**
 * consolidation.test.ts — Tests for multi-company consolidation.
 *
 * Replicates pure logic from consolidation.ts for testing without DB.
 * Tests: account aggregation across companies, inter-company elimination,
 * balance normalization for different account types.
 */

import { describe, test, expect } from "bun:test";
import { num } from "@/lib/money";

// ── Replicated pure logic ──────────────────────────────────────────────────────

interface AccountLike {
  id: number;
  code: string;
  nameAr: string;
  nameEn?: string;
  type: string;
  balance: string;
  companySlug: string;
}

interface JELineLike {
  accountId: number;
  debit: string;
  credit: string;
}

/**
 * Normalize account balance sign based on account type.
 * Debit-normal: asset, expense, contra_asset → positive = debit
 * Credit-normal: liability, equity, revenue, contra_revenue → flip sign so credit-positive = positive
 */
function normalizeBalanceSign(balance: number, accountType: string): number {
  if (accountType === "liability" || accountType === "equity" || accountType === "revenue" || accountType === "contra_revenue") {
    return -balance;
  }
  return balance;
}

/**
 * Aggregate accounts across companies by account code.
 */
function aggregateAccountsByCode(
  companies: AccountLike[][],
  jeLinesByCompany: Map<string, JELineLike[]>,
): Map<string, { code: string; nameAr: string; nameEn: string; type: string; totalBalance: number; breakdown: Array<{ companySlug: string; balance: number }> }> {
  const resultMap = new Map<string, { code: string; nameAr: string; nameEn: string; type: string; totalBalance: number; breakdown: Array<{ companySlug: string; balance: number }> }>();

  for (const accounts of companies) {
    for (const acc of accounts) {
      const lines = jeLinesByCompany.get(acc.companySlug) || [];
      const accountLines = lines.filter((l) => l.accountId === acc.id);
      let rawBalance: number;
      if (accountLines.length > 0) {
        rawBalance = accountLines.reduce((s, l) => s + num(l.debit, 3) - num(l.credit, 3), 0);
      } else {
        rawBalance = num(acc.balance, 3);
      }

      const balance = normalizeBalanceSign(rawBalance, acc.type);

      const key = acc.code;
      if (!resultMap.has(key)) {
        resultMap.set(key, {
          code: acc.code,
          nameAr: acc.nameAr,
          nameEn: acc.nameEn || "",
          type: acc.type,
          totalBalance: 0,
          breakdown: [],
        });
      }

      const entry = resultMap.get(key)!;
      if (acc.nameEn && !entry.nameEn) entry.nameEn = acc.nameEn;
      entry.totalBalance += balance;
      entry.breakdown.push({ companySlug: acc.companySlug, balance });
    }
  }

  return resultMap;
}

/**
 * Calculate total eliminated amount from inter-company transactions.
 */
function calculateEliminatedAmount(
  transactions: Array<{ companySlugFrom: string; companySlugTo: string; amount: string }>,
): number {
  return transactions.reduce((sum, txn) => sum + num(txn.amount, 3), 0);
}

/**
 * Tenant scope: verify that company A data doesn't leak to company B.
 */
function verifyTenantScope(
  accounts: AccountLike[],
  targetCompanySlug: string,
): boolean {
  return accounts.every((acc) => acc.companySlug === targetCompanySlug);
}

// ── Tests ─────────────────────────────────────────────────────────────────────────

describe("consolidation: normalizeBalanceSign", () => {
  test("Asset balance stays positive (debit-normal)", () => {
    expect(normalizeBalanceSign(5000, "asset")).toBe(5000);
  });

  test("Expense balance stays positive (debit-normal)", () => {
    expect(normalizeBalanceSign(3000, "expense")).toBe(3000);
  });

  test("Liability balance flips sign (credit-normal)", () => {
    expect(normalizeBalanceSign(-2000, "liability")).toBe(2000);
  });

  test("Equity balance flips sign (credit-normal)", () => {
    expect(normalizeBalanceSign(-5000, "equity")).toBe(5000);
  });

  test("Revenue balance flips sign (credit-normal)", () => {
    expect(normalizeBalanceSign(-10000, "revenue")).toBe(10000);
  });

  test("Contra-revenue balance flips sign (credit-normal)", () => {
    expect(normalizeBalanceSign(-500, "contra_revenue")).toBe(500);
  });
});

describe("consolidation: aggregateAccountsByCode", () => {
  test("Single company: accounts aggregated by code", () => {
    const accountsA: AccountLike[] = [
      { id: 1, code: "1100", nameAr: "نقد", nameEn: "Cash", type: "asset", balance: "5000.000", companySlug: "co-a" },
      { id: 2, code: "4000", nameAr: "إيرادات", nameEn: "Revenue", type: "revenue", balance: "-10000.000", companySlug: "co-a" },
    ];

    const jeLinesByCompany = new Map<string, JELineLike[]>();
    jeLinesByCompany.set("co-a", []);

    const companies = [accountsA];
    const result = aggregateAccountsByCode(companies, jeLinesByCompany);

    expect(result.has("1100")).toBe(true);
    expect(result.has("4000")).toBe(true);
    expect(result.get("1100")!.totalBalance).toBe(5000);
    expect(result.get("4000")!.totalBalance).toBe(10000); // revenue flipped
  });

  test("Two companies: same account code aggregated", () => {
    const accountsA: AccountLike[] = [
      { id: 1, code: "1100", nameAr: "نقد", type: "asset", balance: "3000.000", companySlug: "co-a" },
    ];
    const accountsB: AccountLike[] = [
      { id: 10, code: "1100", nameAr: "نقد", type: "asset", balance: "2000.000", companySlug: "co-b" },
    ];

    const jeLinesByCompany = new Map<string, JELineLike[]>();
    jeLinesByCompany.set("co-a", []);
    jeLinesByCompany.set("co-b", []);

    const companies = [accountsA, accountsB];
    const result = aggregateAccountsByCode(companies, jeLinesByCompany);

    const cashAccount = result.get("1100")!;
    expect(cashAccount.totalBalance).toBe(5000); // 3000 + 2000
    expect(cashAccount.breakdown.length).toBe(2);
  });

  test("Different account types: revenue properly normalized", () => {
    const accountsA: AccountLike[] = [
      { id: 1, code: "1100", nameAr: "نقد", type: "asset", balance: "5000.000", companySlug: "co-a" },
      { id: 2, code: "4000", nameAr: "إيرادات", type: "revenue", balance: "-8000.000", companySlug: "co-a" },
    ];

    const jeLinesByCompany = new Map<string, JELineLike[]>();
    jeLinesByCompany.set("co-a", []);

    const result = aggregateAccountsByCode([accountsA], jeLinesByCompany);
    // Revenue: -8000 flipped to +8000
    expect(result.get("4000")!.totalBalance).toBe(8000);
  });
});

describe("consolidation: eliminateInterCompanyTransactions", () => {
  test("Total elimination amount matches sum of transactions", () => {
    const transactions = [
      { companySlugFrom: "co-a", companySlugTo: "co-b", amount: "5000.000" },
      { companySlugFrom: "co-b", companySlugTo: "co-a", amount: "3000.000" },
    ];
    const eliminated = calculateEliminatedAmount(transactions);
    expect(eliminated).toBe(8000);
  });

  test("No transactions → eliminated = 0", () => {
    const eliminated = calculateEliminatedAmount([]);
    expect(eliminated).toBe(0);
  });
});

describe("consolidation: tenant scope", () => {
  test("All accounts belong to target company → passes", () => {
    const accounts: AccountLike[] = [
      { id: 1, code: "1100", nameAr: "نقد", type: "asset", balance: "5000.000", companySlug: "co-a" },
      { id: 2, code: "4000", nameAr: "إيرادات", type: "revenue", balance: "10000.000", companySlug: "co-a" },
    ];
    expect(verifyTenantScope(accounts, "co-a")).toBe(true);
  });

  test("Accounts from different company → fails", () => {
    const accounts: AccountLike[] = [
      { id: 1, code: "1100", nameAr: "نقد", type: "asset", balance: "5000.000", companySlug: "co-a" },
      { id: 10, code: "1100", nameAr: "نقد", type: "asset", balance: "2000.000", companySlug: "co-b" },
    ];
    expect(verifyTenantScope(accounts, "co-a")).toBe(false);
  });

  test("Empty accounts → passes (no leak)", () => {
    expect(verifyTenantScope([], "co-a")).toBe(true);
  });
});

/**
 * Account Balance Validator — invariant checker for denormalized Account.balance.
 *
 * Phase 5 P2 fix: Account.balance is a denormalized running balance updated
 * by balance-engine.ts, auto-journal.ts, and period-close.ts. No central
 * validator asserted that `sum(JEL.debit) - sum(JEL.credit) == Account.balance`
 * after each posting — silent drift could accumulate.
 *
 * This module recomputes the balance from JournalEntryLines and compares
 * it to the stored Account.balance. If the difference exceeds the tolerance
 * (0.01 — one cent), it logs an error and returns the discrepancy.
 *
 * Usage (call after critical postings):
 *   import { validateAccountBalance } from "@/lib/accounting/balance-validator";
 *   const result = await validateAccountBalance(accountId);
 *   if (!result.valid) logger.error("Balance drift detected", result);
 */

import { dbTyped as db } from "@/lib/db";
import { num } from "@/lib/money";
import { logger } from "@/lib/logger";

const BALANCE_TOLERANCE = 0.01; // 1 cent — allows for float rounding

export interface BalanceValidationResult {
  valid: boolean;
  accountId: string;
  storedBalance: number;
  computedBalance: number;
  discrepancy: number;
  journalEntryCount: number;
}

/**
 * Recompute an account's balance from JournalEntryLines and compare to the
 * stored Account.balance. Returns the validation result.
 *
 * For asset/expense accounts (debit-normal): balance = sum(debit) - sum(credit)
 * For liability/equity/revenue accounts (credit-normal): balance = sum(credit) - sum(debit)
 */
export async function validateAccountBalance(accountId: string): Promise<BalanceValidationResult> {
  const account = await db.account.findUnique({
    where: { id: accountId },
    select: { id: true, type: true, balance: true, companySlug: true },
  }).catch(() => null);

  if (!account) {
    return {
      valid: false,
      accountId,
      storedBalance: 0,
      computedBalance: 0,
      discrepancy: 0,
      journalEntryCount: 0,
    };
  }

  // Sum all posted journal entry lines for this account
  const aggregate = await db.journalEntryLine.aggregate({
    where: {
      accountId,
      journalEntry: { status: { in: ["posted", "reversed"] } },
    },
    _sum: { debit: true, credit: true },
    _count: true,
  });

  const totalDebit = num(aggregate._sum.debit, 3);
  const totalCredit = num(aggregate._sum.credit, 3);
  const isDebitNormal = account.type === "asset" || account.type === "expense";
  const computedBalance = isDebitNormal
    ? totalDebit - totalCredit
    : totalCredit - totalDebit;

  const storedBalance = num(account.balance, 3);
  const discrepancy = Math.abs(storedBalance - computedBalance);
  const valid = discrepancy <= BALANCE_TOLERANCE;

  if (!valid) {
    logger.error("[balance-validator] drift detected", {
      accountId,
      accountType: account.type,
      storedBalance,
      computedBalance,
      discrepancy,
      journalEntryCount: aggregate._count,
    });
  }

  return {
    valid,
    accountId,
    storedBalance,
    computedBalance,
    discrepancy,
    journalEntryCount: aggregate._count,
  };
}

/**
 * Validate ALL accounts for a company. Returns a summary with the count of
 * accounts that have drift. Useful for periodic reconciliation checks.
 */
export async function validateAllAccountBalances(companySlug: string): Promise<{
  totalAccounts: number;
  validAccounts: number;
  driftedAccounts: BalanceValidationResult[];
}> {
  const accounts = await db.account.findMany({
    where: { companySlug, isActive: true },
    select: { id: true },
  });

  const results: BalanceValidationResult[] = [];
  for (const acc of accounts) {
    results.push(await validateAccountBalance(acc.id));
  }

  const drifted = results.filter((r) => !r.valid);
  return {
    totalAccounts: accounts.length,
    validAccounts: accounts.length - drifted.length,
    driftedAccounts: drifted,
  };
}

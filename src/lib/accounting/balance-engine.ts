/**
 * balance-engine.ts — Balance derivation engine.
 *
 * Fixes the inconsistency between stored Account.balance and the mathematically
 * correct balance derived from journal entry lines. Provides:
 * - getDerivedBalance: Calculate balance from journal lines (not stored)
 * - reconcileAccountBalances: Check stored vs derived for ALL accounts
 * - recalculateAndFixAllBalances: Force recalculate and update stored balances
 *
 * Phase 1 (Double-Entry Enhancements) of the GarfiX ERP accounting module.
 * ALL monetary values as String (no Float), use num() from money.ts.
 */
import { db } from "@/lib/db";
import { num, addNums, subNums, toNum } from "@/lib/money";
import { logAudit } from "@/lib/audit";
import { logger } from "@/lib/logger";

// ── Types ──────────────────────────────────────────────────────────────────────

export interface Discrepancy {
  accountId: number;
  accountCode: string;
  accountNameAr: string;
  accountType: string;
  storedBalance: string;
  derivedBalance: string;
  difference: string;
}

export interface ReconciliationResult {
  companySlug: string;
  totalAccounts: number;
  discrepanciesCount: number;
  discrepancies: Discrepancy[];
  reconciledAt: string;
}

export interface RecalculationResult {
  companySlug: string;
  totalAccounts: number;
  fixedCount: number;
  beforeAfter: {
    accountId: number;
    accountCode: string;
    before: string;
    after: string;
    difference: string;
  }[];
  recalculatedAt: string;
}

// ── Derived Balance ────────────────────────────────────────────────────────────

/**
 * getDerivedBalance — Calculate balance from journal lines (not stored balance):
 * - Sum all posted JE lines for this account
 * - Subtract reversed entries' effect
 * - Optionally filter by asOfDate
 * - Return the mathematically correct balance
 *
 * For debit-normal accounts (asset, expense): balance = total debits - total credits
 * For credit-normal accounts (liability, equity, revenue): balance = total credits - total debits
 */
export async function getDerivedBalance(
  companySlug: string,
  accountId: number,
  asOfDate?: string | null,
): Promise<string> {
  // Get the account to determine normal side
  const account = await db.account.findFirst({
    where: { id: accountId, companySlug },
  });
  if (!account) {
    throw new Error(`Account ${accountId} not found for company "${companySlug}"`);
  }

  // Build where clause for posted journal entries
  const jeWhere: Record<string, unknown> = {
    companySlug,
    status: "posted",
    deletedAt: null,
  };
  if (asOfDate) {
    jeWhere.date = { lte: asOfDate };
  }

  // Get all posted JE IDs
  const postedJEIds = await db.journalEntry.findMany({
    where: jeWhere,
    select: { id: true },
  });
  const postedJEIdList = postedJEIds.map((je) => je.id);

  // Sum all posted lines for this account
  const postedLines = await db.journalEntryLine.findMany({
    where: {
      entryId: { in: postedJEIdList },
      accountId,
    },
  });

  // Also account for reversed entries — reversed JEs have status "reversed",
  // which means they were originally posted and then reversed.
  // The reversal entry itself is a new posted entry that cancels the original.
  // So we only need to exclude "reversed" entries from our calculation
  // (their reversal entries are already counted as "posted").
  // BUT: the reversal entries' lines should be included because they're "posted".
  // The original reversed entries should NOT be included because they're "reversed".
  // Our query already filters for status: "posted", so reversed entries are excluded.
  // This is correct.

  const isDebitNormal = account.type === "asset" || account.type === "expense" || account.type === "contra_revenue";

  let derivedBalance: number;
  if (isDebitNormal) {
    // Debit normal: balance = sum(debits) - sum(credits)
    derivedBalance = postedLines.reduce((sum, l) => sum + num(l.debit, 3) - num(l.credit, 3), 0);
  } else {
    // Credit normal: balance = sum(credits) - sum(debits)
    derivedBalance = postedLines.reduce((sum, l) => sum + num(l.credit, 3) - num(l.debit, 3), 0);
  }

  return num(derivedBalance, 3).toFixed(3);
}

// ── Reconciliation ──────────────────────────────────────────────────────────────

/**
 * reconcileAccountBalances — Check stored vs derived for ALL accounts:
 * - For each account, compare stored balance with derived balance
 * - Return list of discrepancies (accountId, stored, derived, difference)
 * - Optionally fix discrepancies by updating stored balances (fix=true)
 */
export async function reconcileAccountBalances(
  companySlug: string,
  fix = false,
): Promise<ReconciliationResult> {
  const accounts = await db.account.findMany({
    where: { companySlug, isActive: true },
    orderBy: { code: "asc" },
  });

  const discrepancies: Discrepancy[] = [];

  for (const acc of accounts) {
    const storedBalance = num(acc.balance, 3);
    const derivedBalance = num(await getDerivedBalance(companySlug, acc.id), 3);
    const difference = num(storedBalance - derivedBalance, 3);

    if (Math.abs(difference) > 0.001) {
      discrepancies.push({
        accountId: acc.id,
        accountCode: acc.code,
        accountNameAr: acc.nameAr,
        accountType: acc.type,
        storedBalance: storedBalance.toFixed(3),
        derivedBalance: derivedBalance.toFixed(3),
        difference: difference.toFixed(3),
      });
    }
  }

  // Optionally fix discrepancies
  if (fix && discrepancies.length > 0) {
    await db.$transaction(async (tx) => {
      for (const disc of discrepancies) {
        await tx.account.update({
          where: { id: disc.accountId },
          data: { balance: disc.derivedBalance },
        });
      }
    });

    await logAudit({
      userEmail: "system",
      userUid: "system",
      action: "reconcile_fix_balances",
      entity: "account",
      companySlug,
      details: {
        fixedCount: discrepancies.length,
        discrepancies: discrepancies.map((d) => ({
          accountId: d.accountId,
          code: d.accountCode,
          before: d.storedBalance,
          after: d.derivedBalance,
        })),
      },
    });
  }

  return {
    companySlug,
    totalAccounts: accounts.length,
    discrepanciesCount: discrepancies.length,
    discrepancies,
    reconciledAt: new Date().toISOString(),
  };
}

// ── Recalculate and Fix ──────────────────────────────────────────────────────────

/**
 * recalculateAndFixAllBalances — Force recalculate:
 * - Derive all balances from journal lines
 * - Update stored Account.balance to match
 * - Return before/after comparison
 */
export async function recalculateAndFixAllBalances(
  companySlug: string,
  userEmail: string,
  userUid: string,
): Promise<RecalculationResult> {
  const accounts = await db.account.findMany({
    where: { companySlug, isActive: true },
    orderBy: { code: "asc" },
  });

  // Pre-compute all posted JE lines at once for efficiency
  const postedJEs = await db.journalEntry.findMany({
    where: {
      companySlug,
      status: "posted",
      deletedAt: null,
    },
    select: { id: true },
  });
  const postedJEIdList = postedJEs.map((je) => je.id);

  const allLines = await db.journalEntryLine.findMany({
    where: { entryId: { in: postedJEIdList } },
  });

  // Build per-account line map for efficient calculation
  const linesByAccount = new Map<number, typeof allLines>();
  for (const line of allLines) {
    const existing = linesByAccount.get(line.accountId) || [];
    existing.push(line);
    linesByAccount.set(line.accountId, existing);
  }

  const beforeAfter: { accountId: number; accountCode: string; before: string; after: string; difference: string }[] = [];
  let fixedCount = 0;

  await db.$transaction(async (tx) => {
    for (const acc of accounts) {
      const storedBalance = num(acc.balance, 3);
      const isDebitNormal = acc.type === "asset" || acc.type === "expense" || acc.type === "contra_revenue";

      // Calculate derived balance from lines
      const accountLines = linesByAccount.get(acc.id) || [];
      let derivedBalance: number;
      if (isDebitNormal) {
        derivedBalance = accountLines.reduce((sum, l) => sum + num(l.debit, 3) - num(l.credit, 3), 0);
      } else {
        derivedBalance = accountLines.reduce((sum, l) => sum + num(l.credit, 3) - num(l.debit, 3), 0);
      }
      derivedBalance = num(derivedBalance, 3);

      const difference = num(storedBalance - derivedBalance, 3);

      if (Math.abs(difference) > 0.001) {
        // Fix: update stored balance to derived value
        await tx.account.update({
          where: { id: acc.id },
          data: { balance: derivedBalance.toFixed(3) },
        });

        beforeAfter.push({
          accountId: acc.id,
          accountCode: acc.code,
          before: storedBalance.toFixed(3),
          after: derivedBalance.toFixed(3),
          difference: difference.toFixed(3),
        });
        fixedCount++;
      }
    }
  });

  await logAudit({
    userEmail,
    userUid,
    action: "recalculate_fix_all_balances",
    entity: "account",
    companySlug,
    details: {
      totalAccounts: accounts.length,
      fixedCount,
      beforeAfter,
    },
  });

  return {
    companySlug,
    totalAccounts: accounts.length,
    fixedCount,
    beforeAfter,
    recalculatedAt: new Date().toISOString(),
  };
}

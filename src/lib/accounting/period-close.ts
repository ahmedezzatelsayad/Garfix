/**
 * period-close.ts — Fiscal period closing engine.
 *
 * Phase 2 of the GarfiX ERP accounting module.
 * Handles period close (closing entries for revenue/expense → retained earnings),
 * period reopen, and preventing posting to closed periods.
 *
 * ALL monetary values as String (no Float), use num() from money.ts.
 * ALL mutations MUST log audit via logAudit.
 */
import { db } from "@/lib/db";
import { num, addNums, subNums, toNum } from "@/lib/money";
import { logAudit } from "@/lib/audit";
import { logger } from "@/lib/logger";

// ── Types ──────────────────────────────────────────────────────────────────────

export interface ClosingResult {
  periodId: number;
  periodName: string;
  closedBy: string;
  closedAt: string;
  netIncome: string;
  closingJEId: number;
  revenueClosed: string;
  expensesClosed: string;
  retainedEarningsUpdate: string;
}

export interface ReopenResult {
  periodId: number;
  periodName: string;
  reopenedBy: string;
  reopenedAt: string;
  reversalJEId: number | null;
  reason: string;
}

// ── Period Close ────────────────────────────────────────────────────────────────

/**
 * closeFiscalPeriod — Close a fiscal period:
 * 1. Verify period exists and is "open"
 * 2. Verify all JEs in the period are "posted" (no drafts)
 * 3. Calculate net income for the period (Revenue - Expenses)
 * 4. Create closing JE: Debit Revenue, Credit Income Summary; Debit Income Summary, Credit Retained Earnings
 * 5. Mark period as "closed" with closedBy and closedAt
 * 6. Lock all posted JEs in the period (prevent modifications)
 * 7. Return closing details
 */
export async function closeFiscalPeriod(
  companySlug: string,
  periodName: string,
  userEmail: string,
  userUid: string,
): Promise<ClosingResult> {
  // 1. Find and verify the period
  const period = await db.fiscalPeriod.findFirst({
    where: { companySlug, name: periodName },
  });

  if (!period) {
    throw new Error(`Fiscal period "${periodName}" not found for company "${companySlug}"`);
  }
  if (period.status !== "open") {
    throw new Error(`Fiscal period "${periodName}" is not open (current status: ${period.status})`);
  }

  // 2. Verify all JEs in the period are "posted" (no drafts)
  const draftJEs = await db.journalEntry.count({
    where: {
      companySlug,
      date: { gte: period.startDate, lte: period.endDate },
      status: "draft",
      deletedAt: null,
    },
  });
  if (draftJEs > 0) {
    throw new Error(`Cannot close period "${periodName}" — ${draftJEs} draft journal entries exist. Post or delete them first.`);
  }

  // 3. Calculate net income for the period (Revenue - Expenses)
  // Find all revenue and expense accounts
  const revenueAccounts = await db.account.findMany({
    where: { companySlug, type: "revenue", isActive: true },
  });
  const expenseAccounts = await db.account.findMany({
    where: { companySlug, type: "expense", isActive: true },
  });
  const contraRevenueAccounts = await db.account.findMany({
    where: { companySlug, type: "contra_revenue", isActive: true },
  });

  // Sum posted JE lines for revenue accounts within the period
  const revenueAccountIds = revenueAccounts.map((a) => a.id);
  const expenseAccountIds = expenseAccounts.map((a) => a.id);
  const contraRevenueAccountIds = contraRevenueAccounts.map((a) => a.id);

  // Fetch posted JE lines for revenue accounts in the period
  const postedJEIds = await db.journalEntry.findMany({
    where: {
      companySlug,
      date: { gte: period.startDate, lte: period.endDate },
      status: { in: ["posted"] },
      deletedAt: null,
    },
    select: { id: true },
  });
  const postedJEIdList = postedJEIds.map((je) => je.id);

  const revenueLines = await db.journalEntryLine.findMany({
    where: {
      entryId: { in: postedJEIdList },
      accountId: { in: revenueAccountIds },
    },
  });

  const expenseLines = await db.journalEntryLine.findMany({
    where: {
      entryId: { in: postedJEIdList },
      accountId: { in: expenseAccountIds },
    },
  });

  const contraRevenueLines = await db.journalEntryLine.findMany({
    where: {
      entryId: { in: postedJEIdList },
      accountId: { in: contraRevenueAccountIds },
    },
  });

  // Revenue = total credits - total debits (credit normal)
  const totalRevenue = revenueLines.reduce((sum, l) => sum + num(l.credit, 3) - num(l.debit, 3), 0);
  // Contra Revenue = total debits - total credits (debit normal for contra_revenue)
  const totalContraRevenue = contraRevenueLines.reduce((sum, l) => sum + num(l.debit, 3) - num(l.credit, 3), 0);
  // Expenses = total debits - total credits (debit normal)
  const totalExpenses = expenseLines.reduce((sum, l) => sum + num(l.debit, 3) - num(l.credit, 3), 0);

  const netRevenue = num(totalRevenue - totalContraRevenue, 3);
  const netIncome = num(netRevenue - totalExpenses, 3);

  // 4. Create closing JE
  // Get Income Summary and Retained Earnings accounts
  const incomeSummaryAccount = await db.account.findFirst({
    where: { companySlug, code: "3900" }, // Income Summary (temporary closing account)
  }) || await db.account.findFirst({
    where: { companySlug, code: "3000" }, // fallback to Retained Earnings if no Income Summary
  });
  if (!incomeSummaryAccount) {
    throw new Error(`Income Summary account (3900) not found for company "${companySlug}"`);
  }

  const retainedEarningsAccount = await db.account.findFirst({
    where: { companySlug, code: "3000" }, // Retained Earnings
  });
  if (!retainedEarningsAccount) {
    throw new Error(`Retained Earnings account (3000) not found for company "${companySlug}"`);
  }

  // Build closing JE lines
  const closingLines: { accountId: number; debit: string; credit: string; description: string | null }[] = [];

  // Close Revenue accounts: Debit each revenue account, Credit Income Summary
  for (const acc of revenueAccounts) {
    const accBalance = revenueLines
      .filter((l) => l.accountId === acc.id)
      .reduce((sum, l) => sum + num(l.credit, 3) - num(l.debit, 3), 0);
    if (Math.abs(accBalance) > 0.001) {
      closingLines.push({
        accountId: acc.id,
        debit: num(accBalance, 3).toFixed(3),
        credit: num(0, 3).toFixed(3),
        description: `Close revenue account ${acc.code} — ${periodName}`,
      });
    }
  }

  // Close Contra Revenue accounts: Credit each contra revenue account, Debit Income Summary
  for (const acc of contraRevenueAccounts) {
    const accBalance = contraRevenueLines
      .filter((l) => l.accountId === acc.id)
      .reduce((sum, l) => sum + num(l.debit, 3) - num(l.credit, 3), 0);
    if (Math.abs(accBalance) > 0.001) {
      closingLines.push({
        accountId: acc.id,
        debit: num(0, 3).toFixed(3),
        credit: num(accBalance, 3).toFixed(3),
        description: `Close contra revenue account ${acc.code} — ${periodName}`,
      });
    }
  }

  // Credit Income Summary with total revenue (net of contra)
  if (Math.abs(netRevenue) > 0.001) {
    closingLines.push({
      accountId: incomeSummaryAccount.id,
      debit: num(0, 3).toFixed(3),
      credit: num(netRevenue, 3).toFixed(3),
      description: `Income Summary — revenue closing — ${periodName}`,
    });
  }

  // Close Expense accounts: Credit each expense account, Debit Income Summary
  for (const acc of expenseAccounts) {
    const accBalance = expenseLines
      .filter((l) => l.accountId === acc.id)
      .reduce((sum, l) => sum + num(l.debit, 3) - num(l.credit, 3), 0);
    if (Math.abs(accBalance) > 0.001) {
      closingLines.push({
        accountId: acc.id,
        debit: num(0, 3).toFixed(3),
        credit: num(accBalance, 3).toFixed(3),
        description: `Close expense account ${acc.code} — ${periodName}`,
      });
    }
  }

  // Debit Income Summary with total expenses
  if (Math.abs(totalExpenses) > 0.001) {
    closingLines.push({
      accountId: incomeSummaryAccount.id,
      debit: num(totalExpenses, 3).toFixed(3),
      credit: num(0, 3).toFixed(3),
      description: `Income Summary — expense closing — ${periodName}`,
    });
  }

  // Close Income Summary to Retained Earnings
  if (Math.abs(netIncome) > 0.001) {
    if (netIncome > 0) {
      // Net income (profit): Debit Income Summary, Credit Retained Earnings
      closingLines.push({
        accountId: incomeSummaryAccount.id,
        debit: num(netIncome, 3).toFixed(3),
        credit: num(0, 3).toFixed(3),
        description: `Close Income Summary to Retained Earnings — ${periodName}`,
      });
      closingLines.push({
        accountId: retainedEarningsAccount.id,
        debit: num(0, 3).toFixed(3),
        credit: num(netIncome, 3).toFixed(3),
        description: `Retained Earnings — net income from ${periodName}`,
      });
    } else {
      // Net loss: Credit Income Summary, Debit Retained Earnings
      const lossAmount = Math.abs(netIncome);
      closingLines.push({
        accountId: incomeSummaryAccount.id,
        debit: num(0, 3).toFixed(3),
        credit: num(lossAmount, 3).toFixed(3),
        description: `Close Income Summary to Retained Earnings (loss) — ${periodName}`,
      });
      closingLines.push({
        accountId: retainedEarningsAccount.id,
        debit: num(lossAmount, 3).toFixed(3),
        credit: num(0, 3).toFixed(3),
        description: `Retained Earnings — net loss from ${periodName}`,
      });
    }
  }

  // Validate balanced
  const totalClosingDebit = closingLines.reduce((s, l) => s + num(l.debit, 3), 0);
  const totalClosingCredit = closingLines.reduce((s, l) => s + num(l.credit, 3), 0);
  if (Math.abs(totalClosingDebit - totalClosingCredit) > 0.01) {
    throw new Error(`Closing JE not balanced: debit=${totalClosingDebit.toFixed(3)}, credit=${totalClosingCredit.toFixed(3)}`);
  }

  // 5-6. Create closing JE + mark period as closed + lock all JEs in the period
  const result = await db.$transaction(async (tx) => {
    // Create the closing JE
    let closingJEId: number | null = null;
    if (closingLines.length > 0) {
      const closingJE = await tx.journalEntry.create({
        data: {
          companySlug,
          date: period.endDate,
          description: `Closing entries for period ${periodName}`,
          status: "posted",
          sourceType: "opening_balance", // closing entries are a special type
          createdBy: userEmail,
          lines: { create: closingLines },
        },
        include: { lines: true },
      });
      closingJEId = closingJE.id;

      // Update account balances for closing JE
      const accountIds = [...new Set(closingLines.map((l) => l.accountId))];
      const accounts = await tx.account.findMany({ where: { id: { in: accountIds }, companySlug } });
      const accountMap = new Map(accounts.map((a) => [a.id, a]));

      const deltas = new Map<number, number>();
      for (const line of closingLines) {
        const acc = accountMap.get(line.accountId);
        if (!acc) continue;
        const isDebitNormal = acc.type === "asset" || acc.type === "expense" || acc.type === "contra_revenue";
        const delta = isDebitNormal
          ? num(line.debit, 3) - num(line.credit, 3)
          : num(line.credit, 3) - num(line.debit, 3);
        deltas.set(line.accountId, (deltas.get(line.accountId) || 0) + delta);
      }

      for (const [accountId, delta] of deltas) {
        const acc = accountMap.get(accountId)!;
        const currentBalance = num(acc.balance, 3);
        await tx.account.update({
          where: { id: accountId },
          data: { balance: (currentBalance + delta).toFixed(3) },
        });
      }
    }

    // Mark period as closed
    const now = new Date();
    await tx.fiscalPeriod.update({
      where: { id: period.id },
      data: {
        status: "closed",
        closedBy: userEmail,
        closedAt: now,
      },
    });

    return { closingJEId, closedAt: now.toISOString() };
  });

  await logAudit({
    userEmail,
    userUid,
    action: "close_fiscal_period",
    entity: "fiscal_period",
    entityId: period.id,
    companySlug,
    details: {
      periodName,
      netIncome: netIncome.toFixed(3),
      closingJEId: result.closingJEId,
      revenueClosed: netRevenue.toFixed(3),
      expensesClosed: totalExpenses.toFixed(3),
    },
  });

  return {
    periodId: period.id,
    periodName,
    closedBy: userEmail,
    closedAt: result.closedAt,
    netIncome: netIncome.toFixed(3),
    closingJEId: result.closingJEId || 0,
    revenueClosed: netRevenue.toFixed(3),
    expensesClosed: totalExpenses.toFixed(3),
    retainedEarningsUpdate: netIncome.toFixed(3),
  };
}

// ── Period Reopen ────────────────────────────────────────────────────────────────

/**
 * reopenFiscalPeriod — Reopen a closed fiscal period:
 * - Only allowed with special permission (period_reopen)
 * - Reverse the closing JE
 * - Mark period back to "open"
 * - Create AuditLog entry with reason
 */
export async function reopenFiscalPeriod(
  companySlug: string,
  periodName: string,
  userEmail: string,
  userUid: string,
  reason: string,
): Promise<ReopenResult> {
  const period = await db.fiscalPeriod.findFirst({
    where: { companySlug, name: periodName },
  });

  if (!period) {
    throw new Error(`Fiscal period "${periodName}" not found for company "${companySlug}"`);
  }
  if (period.status !== "closed") {
    throw new Error(`Fiscal period "${periodName}" is not closed (current status: ${period.status})`);
  }

  // Find the closing JE for this period
  const closingJE = await db.journalEntry.findFirst({
    where: {
      companySlug,
      date: period.endDate,
      description: { contains: `Closing entries for period ${periodName}` },
      status: "posted",
      deletedAt: null,
    },
    include: { lines: true },
  });

  const result = await db.$transaction(async (tx) => {
    let reversalJEId: number | null = null;

    if (closingJE) {
      // Build swapped lines to reverse the closing JE
      const swappedLines = closingJE.lines.map((l) => ({
        accountId: l.accountId,
        debit: num(l.credit, 3).toFixed(3),
        credit: num(l.debit, 3).toFixed(3),
        description: l.description || null,
      }));

      // Create reversal entry
      const reversal = await tx.journalEntry.create({
        data: {
          companySlug,
          date: new Date().toISOString().slice(0, 10),
          description: `Reopen period ${periodName} — reversal of closing JE #${closingJE.id}`,
          status: "posted",
          sourceType: "reversal",
          sourceId: closingJE.id,
          createdBy: userEmail,
          lines: { create: swappedLines },
        },
        include: { lines: true },
      });
      reversalJEId = reversal.id;

      // Update account balances for the reversal
      const accountIds = [...new Set(swappedLines.map((l) => l.accountId))];
      const accounts = await tx.account.findMany({ where: { id: { in: accountIds }, companySlug } });
      const accountMap = new Map(accounts.map((a) => [a.id, a]));

      const deltas = new Map<number, number>();
      for (const line of swappedLines) {
        const acc = accountMap.get(line.accountId);
        if (!acc) continue;
        const isDebitNormal = acc.type === "asset" || acc.type === "expense" || acc.type === "contra_revenue";
        const delta = isDebitNormal
          ? num(line.debit, 3) - num(line.credit, 3)
          : num(line.credit, 3) - num(line.debit, 3);
        deltas.set(line.accountId, (deltas.get(line.accountId) || 0) + delta);
      }

      for (const [accountId, delta] of deltas) {
        const acc = accountMap.get(accountId)!;
        const currentBalance = num(acc.balance, 3);
        await tx.account.update({
          where: { id: accountId },
          data: { balance: (currentBalance + delta).toFixed(3) },
        });
      }

      // Mark original closing JE as reversed
      await tx.journalEntry.update({
        where: { id: closingJE.id },
        data: { status: "reversed" },
      });
    }

    // Mark period back to "open"
    await tx.fiscalPeriod.update({
      where: { id: period.id },
      data: {
        status: "open",
        closedBy: null,
        closedAt: null,
      },
    });

    return { reversalJEId };
  });

  await logAudit({
    userEmail,
    userUid,
    action: "reopen_fiscal_period",
    entity: "fiscal_period",
    entityId: period.id,
    companySlug,
    details: {
      periodName,
      reason,
      reversalJEId: result.reversalJEId,
    },
  });

  return {
    periodId: period.id,
    periodName,
    reopenedBy: userEmail,
    reopenedAt: new Date().toISOString(),
    reversalJEId: result.reversalJEId,
    reason,
  };
}

// ── Prevent Posting to Closed Period ────────────────────────────────────────────

/**
 * preventPostingToClosedPeriod — Check before any JE posting:
 * - Find period that contains the given date
 * - If period is "closed" or "locked", throw error
 */
export async function preventPostingToClosedPeriod(
  companySlug: string,
  date: string,
): Promise<void> {
  // Find any period that contains this date
  const period = await db.fiscalPeriod.findFirst({
    where: {
      companySlug,
      startDate: { lte: date },
      endDate: { gte: date },
    },
  });

  if (!period) {
    // No period found for this date — allow posting (no period constraint)
    return;
  }

  if (period.status === "closed" || period.status === "locked") {
    throw new Error(
      `Cannot post to period "${period.name}" — it is ${period.status}. ` +
      `Date ${date} falls within this period (${period.startDate} to ${period.endDate}).`,
    );
  }
}

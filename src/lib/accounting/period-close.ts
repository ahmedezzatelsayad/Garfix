/**
 * period-close.ts — Fiscal period closing engine.
 *
 * Phase 2 of the GarfiX ERP accounting module.
 * Handles period close (closing entries for revenue/expense → retained earnings),
 * period reopen, and preventing posting to closed periods.
 *
 * P0-4 FIX: ALL monetary calculations now use Prisma.Decimal instead of num().
 * This eliminates floating-point errors like 0.1 + 0.2 ≠ 0.3 in financial math.
 * ALL mutations MUST log audit via logAudit.
 */
import { dbTyped as db } from "@/lib/db";
import { addMoney, subtractMoney, roundMoney, isZero } from "@/lib/money";
import { logAudit } from "@/lib/audit";
import { logger } from "@/lib/logger";
import { Prisma } from "@prisma/client";

// ── Types ──────────────────────────────────────────────────────────────────────

export interface ClosingResult {
  periodId: string;
  periodName: string;
  closedBy: string;
  closedAt: string;
  netIncome: string;
  closingJEId: string;
  revenueClosed: string;
  expensesClosed: string;
  retainedEarningsUpdate: string;
}

export interface ReopenResult {
  periodId: string;
  periodName: string;
  reopenedBy: string;
  reopenedAt: string;
  reversalJEId: string | null;
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
  const ZERO = new Prisma.Decimal(0);
  const TOLERANCE = new Prisma.Decimal("0.001");

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
  const revenueAccounts = await db.account.findMany({
    where: { companySlug, type: "revenue", isActive: true },
  });
  const expenseAccounts = await db.account.findMany({
    where: { companySlug, type: "expense", isActive: true },
  });
  const contraRevenueAccounts = await db.account.findMany({
    where: { companySlug, type: "contra_revenue", isActive: true },
  });

  const revenueAccountIds = revenueAccounts.map((a) => a.id);
  const expenseAccountIds = expenseAccounts.map((a) => a.id);

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
    where: { journalEntryId: { in: postedJEIdList }, accountId: { in: revenueAccountIds } },
  });
  const expenseLines = await db.journalEntryLine.findMany({
    where: { journalEntryId: { in: postedJEIdList }, accountId: { in: expenseAccountIds } },
  });
  const contraRevenueLines = await db.journalEntryLine.findMany({
    where: { journalEntryId: { in: postedJEIdList }, accountId: { in: contraRevenueAccounts.map(a => a.id) } },
  });

  // P0-4 FIX: Use Decimal arithmetic throughout
  const totalRevenue = revenueLines.reduce(
    (sum, l) => sum.plus(new Prisma.Decimal(l.credit ?? 0)).minus(new Prisma.Decimal(l.debit ?? 0)),
    ZERO,
  );
  const totalContraRevenue = contraRevenueLines.reduce(
    (sum, l) => sum.plus(new Prisma.Decimal(l.debit ?? 0)).minus(new Prisma.Decimal(l.credit ?? 0)),
    ZERO,
  );
  const totalExpenses = expenseLines.reduce(
    (sum, l) => sum.plus(new Prisma.Decimal(l.debit ?? 0)).minus(new Prisma.Decimal(l.credit ?? 0)),
    ZERO,
  );

  const netRevenue = totalRevenue.minus(totalContraRevenue);
  const netIncome = netRevenue.minus(totalExpenses);

  // 4. Create closing JE
  const incomeSummaryAccount = await db.account.findFirst({
    where: { companySlug, code: "3900" },
  }) || await db.account.findFirst({
    where: { companySlug, code: "3000" },
  });
  if (!incomeSummaryAccount) {
    throw new Error(`Income Summary account (3900) not found for company "${companySlug}"`);
  }

  const retainedEarningsAccount = await db.account.findFirst({
    where: { companySlug, code: "3000" },
  });
  if (!retainedEarningsAccount) {
    throw new Error(`Retained Earnings account (3000) not found for company "${companySlug}"`);
  }

  const closingLines: { accountId: string; debit: string; credit: string; description: string | null }[] = [];

  // Close Revenue accounts
  for (const acc of revenueAccounts) {
    const accBalance = revenueLines
      .filter((l) => l.accountId === acc.id)
      .reduce((sum, l) => sum.plus(new Prisma.Decimal(l.credit ?? 0)).minus(new Prisma.Decimal(l.debit ?? 0)), ZERO);
    if (accBalance.abs().gt(TOLERANCE)) {
      closingLines.push({
        accountId: acc.id,
        debit: accBalance.toFixed(3),
        credit: "0.000",
        description: `Close revenue account ${acc.code} — ${periodName}`,
      });
    }
  }

  // Close Contra Revenue accounts
  for (const acc of contraRevenueAccounts) {
    const accBalance = contraRevenueLines
      .filter((l) => l.accountId === acc.id)
      .reduce((sum, l) => sum.plus(new Prisma.Decimal(l.debit ?? 0)).minus(new Prisma.Decimal(l.credit ?? 0)), ZERO);
    if (accBalance.abs().gt(TOLERANCE)) {
      closingLines.push({
        accountId: acc.id,
        debit: "0.000",
        credit: accBalance.toFixed(3),
        description: `Close contra revenue account ${acc.code} — ${periodName}`,
      });
    }
  }

  // Credit Income Summary with total revenue
  if (netRevenue.abs().gt(TOLERANCE)) {
    closingLines.push({
      accountId: incomeSummaryAccount.id,
      debit: "0.000",
      credit: netRevenue.toFixed(3),
      description: `Income Summary — revenue closing — ${periodName}`,
    });
  }

  // Close Expense accounts
  for (const acc of expenseAccounts) {
    const accBalance = expenseLines
      .filter((l) => l.accountId === acc.id)
      .reduce((sum, l) => sum.plus(new Prisma.Decimal(l.debit ?? 0)).minus(new Prisma.Decimal(l.credit ?? 0)), ZERO);
    if (accBalance.abs().gt(TOLERANCE)) {
      closingLines.push({
        accountId: acc.id,
        debit: "0.000",
        credit: accBalance.toFixed(3),
        description: `Close expense account ${acc.code} — ${periodName}`,
      });
    }
  }

  // Debit Income Summary with total expenses
  if (totalExpenses.abs().gt(TOLERANCE)) {
    closingLines.push({
      accountId: incomeSummaryAccount.id,
      debit: totalExpenses.toFixed(3),
      credit: "0.000",
      description: `Income Summary — expense closing — ${periodName}`,
    });
  }

  // Close Income Summary to Retained Earnings
  if (netIncome.abs().gt(TOLERANCE)) {
    if (netIncome.gt(ZERO)) {
      closingLines.push({
        accountId: incomeSummaryAccount.id,
        debit: netIncome.toFixed(3), credit: "0.000",
        description: `Close Income Summary to Retained Earnings — ${periodName}`,
      });
      closingLines.push({
        accountId: retainedEarningsAccount.id,
        debit: "0.000", credit: netIncome.toFixed(3),
        description: `Retained Earnings — net income from ${periodName}`,
      });
    } else {
      const lossAmount = netIncome.abs();
      closingLines.push({
        accountId: incomeSummaryAccount.id,
        debit: "0.000", credit: lossAmount.toFixed(3),
        description: `Close Income Summary to Retained Earnings (loss) — ${periodName}`,
      });
      closingLines.push({
        accountId: retainedEarningsAccount.id,
        debit: lossAmount.toFixed(3), credit: "0.000",
        description: `Retained Earnings — net loss from ${periodName}`,
      });
    }
  }

  // Validate balanced
  const totalClosingDebit = closingLines.reduce(
    (s, l) => s.plus(new Prisma.Decimal(l.debit)), ZERO,
  );
  const totalClosingCredit = closingLines.reduce(
    (s, l) => s.plus(new Prisma.Decimal(l.credit)), ZERO,
  );
  if (totalClosingDebit.minus(totalClosingCredit).abs().gt(new Prisma.Decimal("0.01"))) {
    throw new Error(`Closing JE not balanced: debit=${totalClosingDebit.toFixed(3)}, credit=${totalClosingCredit.toFixed(3)}`);
  }

  // 5-6. Create closing JE + mark period as closed
  const result = await db.$transaction(async (tx) => {
    let closingJEId: string | null = null;
    if (closingLines.length > 0) {
      const closingJE = await tx.journalEntry.create({
        data: {
          number: `JE-CLOSE-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`,
          companyId: period.companyId,
          companySlug,
          date: period.endDate,
          description: `Closing entries for period ${periodName}`,
          status: "posted",
          sourceType: "opening_balance",
          createdBy: userEmail,
          lines: { create: closingLines },
        },
        include: { lines: true },
      });
      closingJEId = closingJE.id;

      // Update account balances
      const accountIds = [...new Set(closingLines.map((l) => l.accountId))];
      const accounts = await tx.account.findMany({ where: { id: { in: accountIds }, companySlug } });
      const accountMap: Map<string, { type: string; balance: Prisma.Decimal }> = new Map(
        accounts.map((a) => [a.id, { type: a.type, balance: new Prisma.Decimal(a.balance ?? 0) }])
      );

      const deltas = new Map<string, Prisma.Decimal>();
      for (const line of closingLines) {
        const acc = accountMap.get(line.accountId);
        if (!acc) continue;
        const debit = new Prisma.Decimal(line.debit);
        const credit = new Prisma.Decimal(line.credit);
        const isDebitNormal = acc.type === "asset" || acc.type === "expense" || acc.type === "contra_revenue";
        const delta = isDebitNormal ? debit.minus(credit) : credit.minus(debit);
        deltas.set(line.accountId, (deltas.get(line.accountId) ?? ZERO).plus(delta));
      }

      for (const [accountId, delta] of deltas) {
        const acc = accountMap.get(accountId)!;
        const newBalance = acc.balance.plus(delta);
        await tx.account.update({
          where: { id: accountId },
          data: { balance: newBalance.toFixed(3) },
        });
      }
    }

    const now = new Date();
    await tx.fiscalPeriod.update({
      where: { id: period.id },
      data: { status: "closed", closedBy: userEmail, closedAt: now },
    });

    return { closingJEId, closedAt: now.toISOString() };
  });

  await logAudit({
    userEmail, userUid,
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
    closingJEId: result.closingJEId || "",
    revenueClosed: netRevenue.toFixed(3),
    expensesClosed: totalExpenses.toFixed(3),
    retainedEarningsUpdate: netIncome.toFixed(3),
  };
}

// ── Period Reopen ────────────────────────────────────────────────────────────────

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
    let reversalJEId: string | null = null;

    if (closingJE) {
      const swappedLines = closingJE.lines.map((l) => ({
        accountId: l.accountId,
        debit: (l.credit ?? 0).toFixed(3),
        credit: (l.debit ?? 0).toFixed(3),
        description: l.description || null,
      }));

      const reversal = await tx.journalEntry.create({
        data: {
          number: `JE-REOPEN-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`,
          companyId: period.companyId,
          companySlug,
          date: new Date(),
          description: `Reopen period ${periodName} — reversal of closing JE #${closingJE.id}`,
          status: "posted",
          sourceType: "reversal",
          sourceId: String(closingJE.id),
          createdBy: userEmail,
          lines: { create: swappedLines },
        },
        include: { lines: true },
      });
      reversalJEId = reversal.id;

      // Update account balances for the reversal
      const accountIds = [...new Set(swappedLines.map((l) => l.accountId))].filter((id): id is string => id !== null);
      const accounts = await tx.account.findMany({ where: { id: { in: accountIds }, companySlug } });
      const accountMap: Map<string, { type: string; balance: Prisma.Decimal }> = new Map(
        accounts.map((a) => [a.id, { type: a.type, balance: new Prisma.Decimal(a.balance ?? 0) }])
      );

      const deltas = new Map<string, Prisma.Decimal>();
      for (const line of swappedLines) {
        const aid = line.accountId;
        if (!aid) continue;
        const acc = accountMap.get(aid);
        if (!acc) continue;
        const debit = new Prisma.Decimal(line.debit);
        const credit = new Prisma.Decimal(line.credit);
        const isDebitNormal = acc.type === "asset" || acc.type === "expense" || acc.type === "contra_revenue";
        const delta = isDebitNormal ? debit.minus(credit) : credit.minus(debit);
        deltas.set(aid, (deltas.get(aid) ?? new Prisma.Decimal(0)).plus(delta));
      }

      for (const [accountId, delta] of deltas) {
        const acc = accountMap.get(accountId)!;
        const newBalance = acc.balance.plus(delta);
        await tx.account.update({
          where: { id: accountId },
          data: { balance: newBalance.toFixed(3) },
        });
      }

      await tx.journalEntry.update({
        where: { id: closingJE.id },
        data: { status: "reversed" },
      });
    }

    await tx.fiscalPeriod.update({
      where: { id: period.id },
      data: { status: "open", closedBy: null, closedAt: null },
    });

    return { reversalJEId };
  });

  await logAudit({
    userEmail, userUid,
    action: "reopen_fiscal_period",
    entity: "fiscal_period",
    entityId: period.id,
    companySlug,
    details: { periodName, reason, reversalJEId: result.reversalJEId },
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

export async function preventPostingToClosedPeriod(
  companySlug: string,
  date: string,
): Promise<void> {
  const period = await db.fiscalPeriod.findFirst({
    where: { companySlug, startDate: { lte: date }, endDate: { gte: date } },
  });

  if (!period) return;

  if (period.status === "closed" || period.status === "locked") {
    throw new Error(
      `Cannot post to period "${period.name}" — it is ${period.status}. ` +
      `Date ${date} falls within this period (${period.startDate} to ${period.endDate}).`,
    );
  }
}

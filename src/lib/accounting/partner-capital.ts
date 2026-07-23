/**
 * partner-capital.ts — Phase 13: Partner capital accounts and profit distribution
 *
 * Features:
 *  - calculateProfitDistribution: Calculate net profit for period, get partner equity accounts (code 3000 range),
 *    distribute profit based on ownership percentages
 *  - postProfitDistributionJE: Create JE (Debit Retained Earnings / Income Summary, Credit each partner's capital)
 */

import { db } from "@/lib/db";
import { num } from "@/lib/money";
import { logger } from "@/lib/logger";
import { logAccountingChange } from "@/lib/accounting/accountant-collab";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PartnerDistribution {
  partnerAccountId: number;
  partnerName: string;
  accountCode: string;
  ownershipPercent: string;
  profitShare: string;
}

export interface ProfitDistributionResult {
  companySlug: string;
  periodFrom: string;
  periodTo: string;
  netProfit: string;
  partners: PartnerDistribution[];
  totalDistributed: string;
}

// ─── 1. calculateProfitDistribution ───────────────────────────────────────────

export async function calculateProfitDistribution(
  companySlug: string,
  periodFrom: string,
  periodTo: string,
): Promise<ProfitDistributionResult> {
  // Calculate net profit for period: Revenue - Expenses (from posted journal entries)
  const revenueAccounts = await db.account.findMany({
    where: { companySlug, type: "revenue", isActive: true },
    include: {
      journalLines: {
        include: { entry: { select: { status: true, date: true } } },
      },
    },
  });

  const expenseAccounts = await db.account.findMany({
    where: { companySlug, type: "expense", isActive: true },
    include: {
      journalLines: {
        include: { entry: { select: { status: true, date: true } } },
      },
    },
  });

  // Also include contra_revenue accounts (like discounts, returns)
  const contraRevenueAccounts = await db.account.findMany({
    where: { companySlug, type: "contra_revenue", isActive: true },
    include: {
      journalLines: {
        include: { entry: { select: { status: true, date: true } } },
      },
    },
  });

  let totalRevenue = 0;
  let totalExpenses = 0;
  let totalContraRevenue = 0;

  for (const acc of revenueAccounts) {
    for (const line of acc.journalLines) {
      if (line.entry.status !== "posted" && line.entry.status !== "reversed") continue;
      if (line.entry.date < periodFrom || line.entry.date > periodTo) continue;
      const multiplier = line.entry.status === "reversed" ? -1 : 1;
      // Revenue accounts: credit increases balance
      totalRevenue += num(line.credit, 3) * multiplier;
      totalRevenue -= num(line.debit, 3) * multiplier;
    }
  }

  for (const acc of expenseAccounts) {
    for (const line of acc.journalLines) {
      if (line.entry.status !== "posted" && line.entry.status !== "reversed") continue;
      if (line.entry.date < periodFrom || line.entry.date > periodTo) continue;
      const multiplier = line.entry.status === "reversed" ? -1 : 1;
      // Expense accounts: debit increases balance
      totalExpenses += num(line.debit, 3) * multiplier;
      totalExpenses -= num(line.credit, 3) * multiplier;
    }
  }

  for (const acc of contraRevenueAccounts) {
    for (const line of acc.journalLines) {
      if (line.entry.status !== "posted" && line.entry.status !== "reversed") continue;
      if (line.entry.date < periodFrom || line.entry.date > periodTo) continue;
      const multiplier = line.entry.status === "reversed" ? -1 : 1;
      // Contra revenue: debit increases (reduases net revenue)
      totalContraRevenue += num(line.debit, 3) * multiplier;
      totalContraRevenue -= num(line.credit, 3) * multiplier;
    }
  }

  const netProfit = num(totalRevenue - totalExpenses - totalContraRevenue, 3);

  // Get partner equity accounts (code 3000 range)
  const partnerAccounts = await db.account.findMany({
    where: {
      companySlug,
      type: "equity",
      isActive: true,
      code: { startsWith: "3" },
    },
    orderBy: { code: "asc" },
  });

  // Determine ownership percentages
  // Default: equal distribution if no specific percentages set
  // We look for ownership percentages in the account's description or nameEn field
  // Format: "partner:X%" or we distribute equally

  const partners: PartnerDistribution[] = [];
  let totalOwnership = 0;

  // First pass: extract ownership percentages
  const ownershipMap = new Map<number, number>();
  for (const acc of partnerAccounts) {
    // Try to extract percentage from nameEn or description
    // Default: equal share
    let ownership = 0;

    // Check if this is a "capital" or "شريك" account (not retained earnings)
    const isCapitalAccount = acc.nameAr.includes("شريك") || acc.nameAr.includes("رأس مال") ||
      (acc.nameEn && (acc.nameEn.toLowerCase().includes("capital") || acc.nameEn.toLowerCase().includes("partner")));

    if (!isCapitalAccount && partnerAccounts.length > 0) {
      // Skip retained earnings / general equity accounts
      continue;
    }

    // Try to find ownership percentage
    if (acc.nameEn) {
      const percentMatch = acc.nameEn.match(/(\d+\.?\d*)%/);
      if (percentMatch) ownership = parseFloat(percentMatch[1]);
    }

    ownershipMap.set(acc.id, ownership);
  }

  // Second pass: distribute equally if no percentages found
  const capitalAccounts = partnerAccounts.filter((acc) => ownershipMap.has(acc.id));
  const hasExplicitPercents = Array.from(ownershipMap.values()).some((v) => v > 0);

  if (!hasExplicitPercents && capitalAccounts.length > 0) {
    // Equal distribution
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
    totalOwnership += normalized;
  }

  // Calculate profit shares
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

  const totalDistributed = partners.reduce<number>((s, p) => s + num(p.profitShare, 3), 0);

  logger.info("[partner-capital] calculated", { companySlug, periodFrom, periodTo, netProfit: netProfit.toFixed(3), partnersCount: partners.length });

  return {
    companySlug,
    periodFrom,
    periodTo,
    netProfit: netProfit.toFixed(3),
    partners,
    totalDistributed: num(totalDistributed, 3).toFixed(3),
  };
}

// ─── 2. postProfitDistributionJE ──────────────────────────────────────────────

export async function postProfitDistributionJE(
  companySlug: string,
  distribution: ProfitDistributionResult,
  createdBy: string,
): Promise<{ jeId: number; lines: Array<{ accountId: number; accountCode: string; accountNameAr: string; debit: string; credit: string }> }> {
  if (distribution.partners.length === 0) throw new Error("No partners to distribute profit to");
  if (num(distribution.netProfit, 3) <= 0) throw new Error("Net profit must be positive to distribute");

  // Find Retained Earnings / Income Summary account
  const retainedEarningsAccount = await db.account.findFirst({
    where: {
      companySlug,
      type: "equity",
      isActive: true,
      OR: [
        { nameAr: { contains: "أرباح" } },
        { nameAr: { contains: "مبقاة" } },
        { nameAr: { contains: "محصلة" } },
        { nameEn: { contains: "retained" } },
        { nameEn: { contains: "income_summary" } },
      ],
    },
    orderBy: { code: "asc" },
  });

  // Fallback: use the first equity account that's not a capital account
  const equityAccount = retainedEarningsAccount || await db.account.findFirst({
    where: {
      companySlug,
      type: "equity",
      isActive: true,
      code: { not: { startsWith: "30" } }, // exclude capital accounts (3000 range)
    },
    orderBy: { code: "asc" },
  });

  if (!equityAccount) throw new Error("No retained earnings / equity account found for profit distribution");

  // Build JE lines:
  // Debit: Retained Earnings / Income Summary (total profit)
  // Credit: Each partner's capital account (their share)
  const totalProfit = num(distribution.netProfit, 3);

  const linesData: Array<{ accountId: number; debit: string; credit: string; description: string }> = [
    // Debit: Retained Earnings
    {
      accountId: equityAccount.id,
      debit: totalProfit.toFixed(3),
      credit: "0.000",
      description: `توزيع أرباح - ${distribution.periodFrom} إلى ${distribution.periodTo}`,
    },
  ];

  // Credit: each partner's capital account
  for (const partner of distribution.partners) {
    linesData.push({
      accountId: partner.partnerAccountId,
      debit: "0.000",
      credit: num(partner.profitShare, 3).toFixed(3),
      description: `نصيب ${partner.partnerName} من الأرباح (${partner.ownershipPercent}%)`,
    });
  }

  // Create JE + update balances
  const result = await db.$transaction(async (tx) => {
    const je = await tx.journalEntry.create({
      data: {
        companySlug,
        date: distribution.periodTo,
        description: `توزيع أرباح ${distribution.periodFrom} - ${distribution.periodTo}`,
        reference: `PROFIT-DIST-${distribution.periodFrom}-${distribution.periodTo}`,
        status: "posted",
        createdBy,
        sourceType: "profit_distribution",
        lines: { create: linesData },
      },
      include: {
        lines: { include: { account: { select: { code: true, nameAr: true } } } },
      },
    });

    // Update account balances
    const accountIds = [...new Set(linesData.map((l) => l.accountId))];
    const accounts = await tx.account.findMany({ where: { id: { in: accountIds }, companySlug } });
    const accountMap = new Map(accounts.map((a) => [a.id, a]));

    for (const line of linesData) {
      const acc = accountMap.get(line.accountId);
      if (!acc) continue;
      const isDebitNormal = acc.type === "asset" || acc.type === "expense";
      // For equity accounts: credit increases balance, debit decreases
      // For expense accounts: debit increases
      const delta = isDebitNormal
        ? num(line.debit, 3) - num(line.credit, 3)
        : num(line.credit, 3) - num(line.debit, 3);
      await tx.account.update({
        where: { id: acc.id },
        data: { balance: (num(acc.balance, 3) + delta).toFixed(3) },
      });
    }

    // Log accounting audit
    await logAccountingChange(
      companySlug,
      createdBy,
      "create",
      "journal_entry",
      je.id,
      null,
      { sourceType: "profit_distribution", netProfit: totalProfit.toFixed(3), partnersCount: distribution.partners.length },
      null,
    );

    return je;
  });

  logger.info("[partner-capital] JE posted", { companySlug, jeId: result.id, netProfit: totalProfit.toFixed(3) });

  return {
    jeId: result.id,
    lines: result.lines.map((l) => ({
      accountId: l.accountId,
      accountCode: l.account.code,
      accountNameAr: l.account.nameAr,
      debit: l.debit,
      credit: l.credit,
    })),
  };
}

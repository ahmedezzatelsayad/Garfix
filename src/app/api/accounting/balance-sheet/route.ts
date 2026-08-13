/**
 * GET /api/accounting/balance-sheet?companySlug=X&asOf=YYYY-MM-DD
 * ACC-2: Balance Sheet (الميزانية العمومية)
 * 
 * P0-5 FIX: Separated raw journal balance computation from account-type
 * sign convention. Previously, the code applied sign inversion based on account
 * type on the balanceMap (debit-credit sum), then fell back to acc.balance.
 * This caused double-reversal for accounts that already had natural balance
 * stored correctly. Now: rawBalance is always (debits - credits) from journal
 * lines only, with no fallback to acc.balance that would mix conventions.
 */
import { NextRequest, NextResponse } from "next/server";
import { dbTyped as db } from "@/lib/db";
import { requirePermissionForCompany } from "@/lib/middleware";
import { addMoney, subtractMoney, isZero, roundMoney } from "@/lib/money";
import { withErrorHandler } from "@/lib/api";
import { Prisma } from "@prisma/client";

export const GET = withErrorHandler(async (req: NextRequest) => {
  const sp = req.nextUrl.searchParams;
  const companySlug = sp.get("companySlug");
  if (!companySlug) return NextResponse.json({ error: "companySlug مطلوب" }, { status: 400 });
  const asOf = sp.get("asOf") || new Date().toISOString().slice(0, 10);

  const access = await requirePermissionForCompany(req, "finance_access", companySlug);
  if ("error" in access) return access.error;

  // Get all accounts with their natural balances
  const accounts = await db.account.findMany({
    where: { companySlug, isActive: true },
    orderBy: { code: "asc" },
  });

  // Fetch all posted journal entries up to asOf date
  const entries = await db.journalEntry.findMany({
    where: { companySlug, date: { lte: asOf }, status: "posted", deletedAt: null },
    include: { lines: true },
  });

  // P0-5 FIX: Compute RAW balance from journal lines only (debits - credits).
  // This is the net debit/credit activity from all journal entries.
  // No sign inversion here — we apply account-type convention separately.
  const rawBalanceMap = new Map<string, Prisma.Decimal>();
  for (const entry of entries) {
    for (const line of entry.lines) {
      const debit = new Prisma.Decimal(line.debit ?? 0);
      const credit = new Prisma.Decimal(line.credit ?? 0);
      const aid = line.accountId;
      const current = rawBalanceMap.get(aid) ?? new Prisma.Decimal(0);
      rawBalanceMap.set(aid, current.plus(debit).minus(credit));
    }
  }

  const assets: Array<{ code: string; nameAr: string; balance: string }> = [];
  const liabilities: Array<{ code: string; nameAr: string; balance: string }> = [];
  const equity: Array<{ code: string; nameAr: string; balance: string }> = [];

  let totalAssets = new Prisma.Decimal(0);
  let totalLiabilities = new Prisma.Decimal(0);
  let totalEquity = new Prisma.Decimal(0);

  for (const acc of accounts) {
    // P0-5 FIX: For balance sheet, use ONLY journal-derived raw balance.
    // The account.type tells us the normal balance side:
    //   Debit-normal (asset, expense): balance = rawDebits - rawCredits
    //   Credit-normal (liability, equity, revenue): balance = rawCredits - rawDebits
    // rawBalanceMap already stores (debits - credits), so:
    //   - Debit-normal types: use rawBalance as-is
    //   - Credit-normal types: negate rawBalance
    const rawBalance = rawBalanceMap.get(acc.id) ?? new Prisma.Decimal(0);

    // Determine the natural balance sign based on account type
    const isCreditNormal = acc.type === "liability" || acc.type === "equity" || 
                           acc.type === "revenue" || acc.type === "contra_asset" ||
                           acc.type === "contra_revenue";
    
    // For BS: credit-normal accounts show positive when raw is negative (more credits)
    // So we negate rawBalance for credit-normal types
    const balance = isCreditNormal ? rawBalance.negated() : rawBalance;
    const rounded = roundMoney(balance);
    const balanceStr = rounded.toFixed(2);

    const item = { code: acc.code, nameAr: acc.nameAr ?? '', balance: balanceStr };

    // Only include Balance Sheet accounts (skip P&L: revenue, expense)
    if (acc.type === "asset" || acc.type === "contra_asset") {
      assets.push(item);
      totalAssets = totalAssets.plus(rounded);
    } else if (acc.type === "liability") {
      liabilities.push(item);
      totalLiabilities = totalLiabilities.plus(rounded);
    } else if (acc.type === "equity") {
      equity.push(item);
      totalEquity = totalEquity.plus(rounded);
    }
    // Revenue and expense accounts are P&L, not Balance Sheet — skip
  }

  const diff = totalAssets.minus(totalLiabilities).minus(totalEquity);
  const isBalanced = diff.abs().lte(new Prisma.Decimal("0.01"));

  return NextResponse.json({
    asOf,
    assets: { accounts: assets, total: roundMoney(totalAssets).toFixed(2) },
    liabilities: { accounts: liabilities, total: roundMoney(totalLiabilities).toFixed(2) },
    equity: { accounts: equity, total: roundMoney(totalEquity).toFixed(2) },
    totalLiabilitiesAndEquity: roundMoney(totalLiabilities.plus(totalEquity)).toFixed(2),
    isBalanced,
  });
});

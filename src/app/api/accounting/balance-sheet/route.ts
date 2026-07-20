/**
 * GET /api/accounting/balance-sheet?companySlug=X&asOf=YYYY-MM-DD
 * ACC-2: Balance Sheet (الميزانية العمومية)
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requirePermissionForCompany } from "@/lib/middleware";
import { num } from "@/lib/money";
import { withErrorHandler } from "@/lib/api";

export const GET = withErrorHandler(async (req: NextRequest) => {
  const sp = req.nextUrl.searchParams;
  const companySlug = sp.get("companySlug");
  if (!companySlug) return NextResponse.json({ error: "companySlug مطلوب" }, { status: 400 });
  const asOf = sp.get("asOf") || new Date().toISOString().slice(0, 10);

  const access = await requirePermissionForCompany(req, "finance_access", companySlug);
  if ("error" in access) return access.error;

  // Get all accounts with their balances
  const accounts = await db.account.findMany({
    where: { companySlug, isActive: true },
    orderBy: { code: "asc" },
  });

  // Fetch all posted journal entries up to asOf date
  const entries = await db.journalEntry.findMany({
    where: { companySlug, date: { lte: asOf }, status: "posted" },
    include: { lines: true },
  });

  // Calculate balance per account from journal lines
  const balanceMap = new Map<number, number>();
  for (const entry of entries) {
    for (const line of entry.lines) {
      const debit = num(line.debit, 3);
      const credit = num(line.credit, 3);
      const current = balanceMap.get(line.accountId) || 0;
      balanceMap.set(line.accountId, current + debit - credit);
    }
  }

  const assets: Array<{ code: string; nameAr: string; balance: number }> = [];
  const liabilities: Array<{ code: string; nameAr: string; balance: number }> = [];
  const equity: Array<{ code: string; nameAr: string; balance: number }> = [];

  let totalAssets = 0;
  let totalLiabilities = 0;
  let totalEquity = 0;

  for (const acc of accounts) {
    let balance = balanceMap.get(acc.id) || num(acc.balance, 3);
    // For liability/equity/revenue accounts, credit is positive → invert sign
    if (acc.type === "liability" || acc.type === "equity" || acc.type === "revenue" || acc.type === "contra_revenue") {
      balance = -balance;
    }
    const item = { code: acc.code, nameAr: acc.nameAr, balance: Math.round(balance * 1000) / 1000 };

    if (acc.type === "asset" || acc.type === "contra_asset") {
      assets.push(item);
      totalAssets += balance;
    } else if (acc.type === "liability") {
      liabilities.push(item);
      totalLiabilities += balance;
    } else if (acc.type === "equity") {
      equity.push(item);
      totalEquity += balance;
    }
    // Revenue and expense accounts are P&L, not Balance Sheet
  }

  const isBalanced = Math.abs(totalAssets - (totalLiabilities + totalEquity)) < 0.01;

  return NextResponse.json({
    asOf,
    assets: { accounts: assets, total: Math.round(totalAssets * 1000) / 1000 },
    liabilities: { accounts: liabilities, total: Math.round(totalLiabilities * 1000) / 1000 },
    equity: { accounts: equity, total: Math.round(totalEquity * 1000) / 1000 },
    totalLiabilitiesAndEquity: Math.round((totalLiabilities + totalEquity) * 1000) / 1000,
    isBalanced,
  });
});

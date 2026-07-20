/**
 * GET /api/accounting/profit-loss?companySlug=X&from=YYYY-MM-DD&to=YYYY-MM-DD
 * ACC-1: Profit & Loss Statement (قائمة الدخل)
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requirePermissionForCompany } from "@/lib/middleware";
import { num } from "@/lib/money";
import { withErrorHandler, parseJsonField } from "@/lib/api";

export const GET = withErrorHandler(async (req: NextRequest) => {
  const sp = req.nextUrl.searchParams;
  const companySlug = sp.get("companySlug");
  if (!companySlug) return NextResponse.json({ error: "companySlug مطلوب" }, { status: 400 });
  const from = sp.get("from") || new Date(new Date().getFullYear(), 0, 1).toISOString().slice(0, 10);
  const to = sp.get("to") || new Date().toISOString().slice(0, 10);

  const access = await requirePermissionForCompany(req, "finance_access", companySlug);
  if ("error" in access) return access.error;

  // Fetch all posted journal entry lines in date range
  const entries = await db.journalEntry.findMany({
    where: { companySlug, date: { gte: from, lte: to }, status: "posted" },
    include: { lines: { include: { account: true } } },
  });

  // Group by account type
  const groups: Record<string, { revenue: number; expense: number; contra_revenue: number }> = {};
  for (const entry of entries) {
    for (const line of entry.lines) {
      const acc = line.account;
      if (!acc) continue;
      const type = acc.type;
      if (!groups[type]) groups[type] = { revenue: 0, expense: 0, contra_revenue: 0 };
      const debit = num(line.debit, 3);
      const credit = num(line.credit, 3);
      // Revenue: credit increases, debit decreases
      if (type === "revenue") groups[type].revenue += credit - debit;
      // Expense: debit increases, credit decreases
      else if (type === "expense") groups[type].expense += debit - credit;
      // Contra revenue: debit increases
      else if (type === "contra_revenue") groups[type].contra_revenue += debit - credit;
    }
  }

  const totalRevenue = (groups["revenue"]?.revenue || 0);
  const contraRevenue = (groups["contra_revenue"]?.contra_revenue || 0);
  const netRevenue = totalRevenue - contraRevenue;
  const totalExpenses = (groups["expense"]?.expense || 0);
  const netProfit = netRevenue - totalExpenses;

  // Detail by account
  const accountDetails: Array<{ code: string; nameAr: string; type: string; amount: number }> = [];
  const accountMap = new Map<string, { code: string; nameAr: string; type: string; amount: number }>();
  for (const entry of entries) {
    for (const line of entry.lines) {
      const acc = line.account;
      if (!acc) continue;
      const key = acc.code;
      if (!accountMap.has(key)) {
        accountMap.set(key, { code: acc.code, nameAr: acc.nameAr, type: acc.type, amount: 0 });
      }
      const item = accountMap.get(key)!;
      const debit = num(line.debit, 3);
      const credit = num(line.credit, 3);
      if (acc.type === "revenue") item.amount += credit - debit;
      else if (acc.type === "expense") item.amount += debit - credit;
      else if (acc.type === "contra_revenue") item.amount += debit - credit;
    }
  }
  for (const [, item] of accountMap) accountDetails.push(item);

  return NextResponse.json({
    dateRange: { from, to },
    revenue: { total: totalRevenue, contra: contraRevenue, net: netRevenue },
    expenses: { total: totalExpenses },
    netProfit,
    margin: netRevenue > 0 ? ((netProfit / netRevenue) * 100).toFixed(2) + "%" : "0%",
    accounts: accountDetails.sort((a, b) => a.code.localeCompare(b.code)),
  });
});

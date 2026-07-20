/**
 * GET /api/accounting/trial-balance?companySlug=X
 * Returns trial balance: for each account, sum of debits and credits from posted journal entries.
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

  const access = await requirePermissionForCompany(req, "finance_access", companySlug);
  if ("error" in access) return access.error;

  const accounts = await db.account.findMany({
    where: { companySlug, isActive: true },
    include: {
      journalLines: {
        include: { entry: { select: { status: true } } },
      },
    },
    orderBy: { code: "asc" },
  });

  const rows = accounts.map((acc) => {
    let totalDebit = 0;
    let totalCredit = 0;
    for (const line of acc.journalLines) {
      if (line.entry.status !== "posted" && line.entry.status !== "reversed") continue;
      // For reversed entries, swap the effect
      const multiplier = line.entry.status === "reversed" ? -1 : 1;
      totalDebit += num(line.debit, 3) * multiplier;
      totalCredit += num(line.credit, 3) * multiplier;
    }
    const balance = totalDebit - totalCredit;
    return {
      id: acc.id,
      code: acc.code,
      nameAr: acc.nameAr,
      type: acc.type,
      totalDebit: Math.round(totalDebit * 1000) / 1000,
      totalCredit: Math.round(totalCredit * 1000) / 1000,
      balance: Math.round(balance * 1000) / 1000,
    };
  });

  const grandDebit = rows.reduce((s, r) => s + r.totalDebit, 0);
  const grandCredit = rows.reduce((s, r) => s + r.totalCredit, 0);

  return NextResponse.json({
    accounts: rows,
    totals: {
      totalDebit: Math.round(grandDebit * 1000) / 1000,
      totalCredit: Math.round(grandCredit * 1000) / 1000,
      isBalanced: Math.abs(grandDebit - grandCredit) < 0.001,
    },
  });
});

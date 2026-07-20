/**
 * GET /api/accounting/cash-flow?companySlug=X&from=YYYY-MM-DD&to=YYYY-MM-DD
 * ACC-3: Cash Flow Statement (قائمة التدفقات النقدية)
 * Indirect method: Net Profit + adjustments for non-cash items
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
  const from = sp.get("from") || new Date(new Date().getFullYear(), 0, 1).toISOString().slice(0, 10);
  const to = sp.get("to") || new Date().toISOString().slice(0, 10);

  const access = await requirePermissionForCompany(req, "finance_access", companySlug);
  if ("error" in access) return access.error;

  const entries = await db.journalEntry.findMany({
    where: { companySlug, date: { gte: from, lte: to }, status: "posted" },
    include: { lines: { include: { account: true } } },
  });

  // Categorize cash flows
  let operatingRevenue = 0;
  let operatingExpenses = 0;
  let investingActivities = 0;
  let financingActivities = 0;
  let cashChange = 0;

  const operatingDetails: Array<{ code: string; nameAr: string; amount: number }> = [];
  const investingDetails: Array<{ code: string; nameAr: string; amount: number }> = [];
  const financingDetails: Array<{ code: string; nameAr: string; amount: number }> = [];

  for (const entry of entries) {
    for (const line of entry.lines) {
      const acc = line.account;
      if (!acc) continue;
      const debit = num(line.debit, 3);
      const credit = num(line.credit, 3);
      const net = credit - debit; // positive = inflow, negative = outflow

      // Cash accounts (1000-1099 typically) — track net cash change
      if (acc.code.startsWith("10") || acc.code.startsWith("101")) {
        cashChange += debit - credit; // cash increases with debit
      }

      // Categorize by account type
      if (acc.type === "revenue" || acc.type === "expense" || acc.type === "contra_revenue") {
        // Operating activities
        if (acc.type === "revenue" || acc.type === "contra_revenue") {
          operatingRevenue += net;
        } else {
          operatingExpenses += -net;
        }
        operatingDetails.push({ code: acc.code, nameAr: acc.nameAr, amount: net });
      } else if (acc.code.startsWith("15") || acc.type === "asset" && acc.code.startsWith("15")) {
        // Fixed assets = investing
        investingActivities += net;
        investingDetails.push({ code: acc.code, nameAr: acc.nameAr, amount: net });
      } else if (acc.type === "liability" && (acc.code.startsWith("2") || acc.code.startsWith("3"))) {
        // Loans/equity = financing
        financingActivities += net;
        financingDetails.push({ code: acc.code, nameAr: acc.nameAr, amount: net });
      }
    }
  }

  const netOperating = operatingRevenue - operatingExpenses;
  const netCashFlow = netOperating + investingActivities + financingActivities;

  return NextResponse.json({
    dateRange: { from, to },
    operating: {
      revenue: operatingRevenue,
      expenses: operatingExpenses,
      net: netOperating,
      details: operatingDetails,
    },
    investing: {
      net: investingActivities,
      details: investingDetails,
    },
    financing: {
      net: financingActivities,
      details: financingDetails,
    },
    netCashFlow,
    cashChange, // Actual cash account change
  });
});

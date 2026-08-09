/**
 * /api/reports
 * GET — generate business reports (sales, profit, cash flow) with CSV export.
 *
 * Query params:
 *   companySlug — required
 *   type — "sales" | "profit" | "cashflow" | "tax"
 *   from — YYYY-MM-DD (default: start of current month)
 *   to — YYYY-MM-DD (default: today)
 *   format — "json" (default) | "csv"
 */
import { NextRequest, NextResponse } from "next/server";
import { dbTyped as db } from "@/lib/db";
import { requirePermissionForCompany } from "@/lib/middleware";
import { num } from "@/lib/money";
import { withErrorHandler, apiError, parseJsonField } from "@/lib/api";

function toCsv(rows: Record<string, unknown>[], headers?: string[]): string {
  if (rows.length === 0) return "";
  const cols = headers || Object.keys(rows[0]);
  const header = cols.join(",");
  const lines = rows.map((r) =>
    cols.map((c) => {
      const v = r[c];
      if (v === null || v === undefined) return "";
      const s = String(v);
      // Escape quotes and wrap in quotes if contains comma/newline/quote
      if (s.includes(",") || s.includes("\n") || s.includes('"')) {
        return `"${s.replace(/"/g, '""')}"`;
      }
      return s;
    }).join(","),
  );
  return [header, ...lines].join("\n");
}

export const GET = withErrorHandler(async (req: NextRequest) => {
  const sp = req.nextUrl.searchParams;
  const companySlug = sp.get("companySlug");
  const type = sp.get("type") || "sales";
  const from = sp.get("from") || new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);
  const to = sp.get("to") || new Date().toISOString().slice(0, 10);
  const format = sp.get("format") || "json";

  if (!companySlug) return apiError("companySlug مطلوب", 400);

  // Require reports_access permission
  const access = await requirePermissionForCompany(req, "reports_access", companySlug);
  if ("error" in access) return access.error;

  // Phase 6 P1 fix: reduced take from 5000 → 1000 + added cursor pagination.
  // The old `take: 5000` loaded up to 5000 invoices + 5000 purchases into
  // memory simultaneously (~10MB per request). Now we cap at 1000 per page
  // and return a nextCursor for the client to fetch the next batch.
  // The client passes ?cursor=<id> to get the next page.
  const cursor = req.nextUrl.searchParams.get("cursor");
  const PAGE_SIZE = 1000;

  const invoices = await db.invoice.findMany({
    where: {
      companySlug,
      issueDate: { gte: from, lte: to },
    },
    orderBy: { id: "asc" },
    select: {
      id: true, invoiceNumber: true, clientName: true, clientEmail: true,
      issueDate: true, dueDate: true, status: true,
      subtotal: true, taxRate: true, taxAmount: true,
      total: true, shipping: true, discount: true, paid: true,
      lineItems: true, createdAt: true,
    },
    take: PAGE_SIZE + 1, // +1 to detect if there's a next page
    ...(cursor ? { cursor: { id: parseInt(cursor, 10) }, skip: 1 } : {}),
  });

  // Fetch purchase invoices in the same range
  const purchases = await db.purchaseInvoice.findMany({
    where: {
      companySlug,
      date: { gte: from, lte: to },
    },
    orderBy: { date: "asc" },
    select: { id: true, num: true, date: true, supplier: true, items: true, totalQty: true, notes: true },
    take: PAGE_SIZE,
  });

  // Detect if there are more invoices (for pagination)
  const hasMore = invoices.length > PAGE_SIZE;
  const invoicesPage = hasMore ? invoices.slice(0, PAGE_SIZE) : invoices;
  const nextCursor = hasMore ? String(invoicesPage[invoicesPage.length - 1].id) : null;

  let reportData: Record<string, unknown>[] = [];
  let summary: Record<string, unknown> = {};

  if (type === "sales") {
    reportData = invoicesPage.map((inv) => ({
      invoiceNumber: inv.invoiceNumber,
      clientName: inv.clientName,
      issueDate: inv.issueDate,
      dueDate: inv.dueDate,
      status: inv.status,
      subtotal: num(inv.subtotal, 3),
      taxAmount: num(inv.taxAmount, 3),
      shipping: num(inv.shipping, 3),
      discount: num(inv.discount, 3),
      total: num(inv.total, 3),
      paid: num(inv.paid, 3),
      outstanding: Math.max(0, num(inv.total, 3) - num(inv.paid, 3)),
    }));

    summary = {
      totalInvoices: invoices.length,
      totalRevenue: invoicesPage.reduce((s, i) => s + num(i.total, 3), 0),
      totalPaid: invoicesPage.reduce((s, i) => s + num(i.paid, 3), 0),
      totalOutstanding: invoicesPage.reduce((s, i) => s + Math.max(0, num(i.total, 3) - num(i.paid, 3)), 0),
      totalTax: invoicesPage.reduce((s, i) => s + num(i.taxAmount, 3), 0),
      totalDiscount: invoicesPage.reduce((s, i) => s + num(i.discount, 3), 0),
    };
  } else if (type === "profit") {
    // Revenue - COGS (purchase cost)
    const totalRevenue = invoicesPage.reduce((s, i) => s + num(i.subtotal, 3), 0);
    // Estimate COGS from purchase invoices (simplified — real COGS needs inventory tracking)
    const totalCogs = purchases.reduce((s, p) => {
      const items = parseJsonField<Array<{ qty?: number; price?: number }>>(p.items, []);
      return s + items.reduce((cs, it) => cs + num(it.qty) * num(it.price, 3), 0);
    }, 0);
    const grossProfit = totalRevenue - totalCogs;
    const totalExpenses = 0; // would come from expense tracking module

    reportData = [
      { metric: "الإيرادات (Revenue)", amount: totalRevenue },
      { metric: "تكلفة البضاعة المباعة (COGS)", amount: totalCogs },
      { metric: "إجمالي الربح (Gross Profit)", amount: grossProfit },
      { metric: "المصروفات (Expenses)", amount: totalExpenses },
      { metric: "صافي الربح (Net Profit)", amount: grossProfit - totalExpenses },
    ];

    summary = {
      totalRevenue,
      totalCogs,
      grossProfit,
      grossMargin: totalRevenue > 0 ? ((grossProfit / totalRevenue) * 100).toFixed(2) + "%" : "0%",
      netProfit: grossProfit - totalExpenses,
    };
  } else if (type === "cashflow") {
    // Cash inflow = paid amounts, outflow = purchases
    const inflow = invoicesPage.reduce((s, i) => s + num(i.paid, 3), 0);
    const outflow = purchases.reduce((s, p) => {
      const items = parseJsonField<Array<{ qty?: number; price?: number }>>(p.items, []);
      return s + items.reduce((cs, it) => cs + num(it.qty) * num(it.price, 3), 0);
    }, 0);

    reportData = [
      { metric: "التدفق الداخل (Cash Inflow)", amount: inflow, count: invoicesPage.filter((i) => num(i.paid, 3) > 0).length },
      { metric: "التدفق الخارج (Cash Outflow)", amount: outflow, count: purchases.length },
      { metric: "صافي التدفق (Net Cash Flow)", amount: inflow - outflow, count: 0 },
    ];

    summary = { inflow, outflow, netCashFlow: inflow - outflow };
  } else if (type === "tax") {
    reportData = invoicesPage.map((inv) => ({
      invoiceNumber: inv.invoiceNumber,
      clientName: inv.clientName,
      issueDate: inv.issueDate,
      subtotal: num(inv.subtotal, 3),
      taxRate: num(inv.taxRate),
      taxAmount: num(inv.taxAmount, 3),
      total: num(inv.total, 3),
    }));

    summary = {
      totalSubtotal: invoicesPage.reduce((s, i) => s + num(i.subtotal, 3), 0),
      totalTax: invoicesPage.reduce((s, i) => s + num(i.taxAmount, 3), 0),
      totalWithTax: invoicesPage.reduce((s, i) => s + num(i.total, 3), 0),
      invoiceCount: invoices.length,
    };
  }

  // CSV export
  if (format === "csv") {
    const csv = toCsv(reportData);
    const bom = "\uFEFF"; // UTF-8 BOM for Arabic Excel compatibility
    return new NextResponse(bom + csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="garfix-${type}-report-${from}-to-${to}.csv"`,
      },
    });
  }

  return NextResponse.json({
    type,
    companySlug,
    dateRange: { from, to },
    summary,
    rows: reportData,
    count: reportData.length,
    // Phase 6 P1: cursor pagination — client passes ?cursor=<id> for next page
    nextCursor,
    hasMore,
  });
});

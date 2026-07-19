/**
 * /api/dashboard/stats
 * GET — KPI dashboard for a company (or all-accessible aggregated)
 *
 * E-16: Response is cached for 30 seconds (in-memory TTL) to avoid
 * recomputing aggregates on every page load. The cache is keyed by
 * user-uid + company-slug so users never see another tenant's data.
 * Invalidate via cacheInvalidate(`dashboard:stats:${user.uid}`).
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { resolveAuth, assertCompanyAccess, hasUnrestrictedScope } from "@/lib/auth";
import { num } from "@/lib/money";
import { withErrorHandler } from "@/lib/api";
import { cached } from "@/lib/cache";
import { logger } from "@/lib/logger";

const CACHE_TTL_SECONDS = 30;

async function computeStats(userUid: string, userCompanies: string[], userRole: string, companySlug?: string) {
  const where: Record<string, unknown> = {};
  if (companySlug) where.companySlug = companySlug;
  else if (userRole !== "admin" && !userCompanies.includes("__founder__")) where.companySlug = { in: userCompanies };

  const invoices = await db.invoice.findMany({
    where,
    select: {
      id: true, invoiceNumber: true, clientName: true, status: true,
      total: true, paid: true, issueDate: true, createdAt: true, companySlug: true,
    },
    orderBy: { createdAt: "desc" },
    take: 1000,
  });

  const totalInvoices = invoices.length;
  const totalRevenue = invoices.reduce((sum, inv) => sum + num(inv.total, 3), 0);
  const totalPaid = invoices.reduce((sum, inv) => sum + num(inv.paid, 3), 0);
  const totalOutstanding = Math.max(0, totalRevenue - totalPaid);

  const byStatus: Record<string, number> = {};
  invoices.forEach((inv) => { byStatus[inv.status] = (byStatus[inv.status] || 0) + 1; });

  const now = new Date();
  const monthly: Array<{ month: string; revenue: number; count: number }> = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const monthInvoices = invoices.filter((inv) => inv.issueDate.startsWith(monthKey));
    monthly.push({
      month: monthKey,
      revenue: monthInvoices.reduce((s, inv) => s + num(inv.total, 3), 0),
      count: monthInvoices.length,
    });
  }

  const recent = invoices.slice(0, 10).map((inv) => ({
    id: inv.id, invoiceNumber: inv.invoiceNumber, clientName: inv.clientName,
    status: inv.status, total: num(inv.total, 3), paid: num(inv.paid, 3),
    issueDate: inv.issueDate, companySlug: inv.companySlug,
  }));

  const clientsCount = await db.client.count({ where });

  return {
    totalInvoices, totalRevenue, totalPaid, totalOutstanding, clientsCount,
    byStatus, monthly, recent,
  };
}

export const GET = withErrorHandler(async (req: NextRequest) => {
  const result = await resolveAuth(req);
  if (!result.ok || !result.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const user = result.user;
  const sp = req.nextUrl.searchParams;
  const companySlug = sp.get("companySlug") || undefined;
  const bypassCache = sp.get("fresh") === "1";

  if (companySlug && !assertCompanyAccess(user, companySlug)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Use unrestricted flag for founder to bypass company-scoping
  const isUnrestricted = hasUnrestrictedScope(user);
  const companiesForCache = isUnrestricted ? ["__founder__"] : user.companies;

  const cacheKey = ["dashboard:stats", user.uid, companySlug || "_all"];

  if (bypassCache) {
    logger.debug("[dashboard] cache bypassed", { user: user.uid, companySlug });
    const stats = await computeStats(user.uid, companiesForCache, user.role, companySlug);
    return NextResponse.json(stats);
  }

  const stats = await cached(cacheKey, CACHE_TTL_SECONDS, () =>
    computeStats(user.uid, companiesForCache, user.role, companySlug),
  );
  return NextResponse.json(stats);
});

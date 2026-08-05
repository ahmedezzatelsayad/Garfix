/**
 * /api/dashboard/stats
 * GET — KPI dashboard for a company (or all-accessible aggregated)
 *
 * E-16: Response is cached for 30 seconds (in-memory TTL) to avoid
 * recomputing aggregates on every page load. The cache is keyed by
 * user-uid + company-slug so users never see another tenant's data.
 * Invalidate via cacheInvalidate(`dashboard:stats:${user.uid}`).
 *
 * P5-H4: Replaced the old `findMany({ take: 1000 }) + reduce` pattern
 * (which silently truncated tenants with >1000 invoices) with proper
 * Prisma `aggregate` / `groupBy` and a `$queryRaw` DATE_TRUNC for the
 * monthly trend. The response shape is unchanged.
 */
import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { dbTyped as db } from "@/lib/db";
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

  // ── 1. Totals — single SQL aggregate (was: findMany+reduce over take:1000) ──
  // P5-H4: aggregate runs a single SQL SUM/COUNT and is unaffected by the
  // total row count, so tenants with >1000 invoices now get correct KPIs.
  const totals = await db.invoice.aggregate({
    where,
    _sum: { total: true, paid: true },
    _count: true,
  });
  const totalInvoices = totals._count;
  const totalRevenue = num(totals._sum.total, 3);
  const totalPaid = num(totals._sum.paid, 3);
  const totalOutstanding = Math.max(0, totalRevenue - totalPaid);

  // ── 2. By status — single SQL GROUP BY (was: in-JS forEach counter) ──
  const statusGroups = await db.invoice.groupBy({
    by: ["status"],
    where,
    _count: true,
  });
  const byStatus: Record<string, number> = {};
  statusGroups.forEach((g) => { byStatus[g.status] = g._count; });

  // ── 3. Monthly trend — last 6 months via DATE_TRUNC (was: filter+reduce) ──
  // Prisma doesn't support DATE_TRUNC natively, so use $queryRaw. The raw
  // SQL is wrapped in a try/catch — if the Postgres-only functions are not
  // available (e.g. SQLite test mocks), we fall back to a Prisma findMany
  // over just the 6-month window (no take:1000 truncation) and aggregate
  // in JS. Less efficient but still correct.
  const now = new Date();
  const startWindow = new Date(now.getFullYear(), now.getMonth() - 5, 1);
  let rawMonthly: Array<{ month: string; total: number; count: number }> = [];
  try {
    // Build the company-scoping fragment dynamically so it mirrors the
    // `where` clause above. Prisma.sql fragments compose safely with
    // parameterised values (no SQL-injection risk).
    let companyFilter: Prisma.Sql;
    if (companySlug) {
      companyFilter = Prisma.sql`AND "companySlug" = ${companySlug}`;
    } else if (userRole === "admin" || userCompanies.includes("__founder__")) {
      companyFilter = Prisma.empty;
    } else if (userCompanies.length === 0) {
      // User has no companies → match nothing (mirrors Prisma { in: [] }).
      companyFilter = Prisma.sql`AND FALSE`;
    } else {
      companyFilter = Prisma.sql`AND "companySlug" IN (${Prisma.join(userCompanies)})`;
    }
    const rows = await db.$queryRaw<
      Array<{ month: string; total: Prisma.Decimal | null; count: number | bigint }>
    >`
      SELECT
        TO_CHAR(DATE_TRUNC('month', "issueDate"), 'YYYY-MM') AS month,
        SUM("total"::numeric) AS total,
        COUNT(*)::int AS count
      FROM "invoices"
      WHERE "issueDate" >= ${startWindow}
        ${companyFilter}
      GROUP BY DATE_TRUNC('month', "issueDate")
      ORDER BY month DESC
    `;
    rawMonthly = rows.map((r) => ({
      month: String(r.month),
      total: num(r.total, 3),
      count: typeof r.count === "number" ? r.count : Number(r.count),
    }));
  } catch (err) {
    logger.warn(
      "[dashboard] $queryRaw monthly trend failed, falling back to JS aggregation",
      { error: err instanceof Error ? err.message : String(err) },
    );
    // Fallback: load just the 6-month window (no take:1000 truncation) and
    // aggregate in JS. Less efficient than DATE_TRUNC but still correct.
    const fallbackWhere = { ...where, issueDate: { gte: startWindow } };
    const windowInvoices = await db.invoice.findMany({
      where: fallbackWhere,
      select: { total: true, issueDate: true },
    });
    const byMonth: Record<string, { total: number; count: number }> = {};
    windowInvoices.forEach((inv) => {
      const d = inv.issueDate instanceof Date ? inv.issueDate : new Date(inv.issueDate);
      if (isNaN(d.getTime())) return;
      const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      if (!byMonth[k]) byMonth[k] = { total: 0, count: 0 };
      byMonth[k].total += num(inv.total, 3);
      byMonth[k].count += 1;
    });
    rawMonthly = Object.entries(byMonth).map(([month, v]) => ({
      month,
      total: v.total,
      count: v.count,
    }));
  }

  // Build a complete 6-month window (fill missing months with zeros so the
  // chart still renders continuous months even when there are no invoices).
  const monthly: Array<{ month: string; revenue: number; count: number }> = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const found = rawMonthly.find((m) => m.month === monthKey);
    monthly.push({
      month: monthKey,
      revenue: found ? found.total : 0,
      count: found ? found.count : 0,
    });
  }

  // ── 4. Recent — keep take: 10 (was: slice(0,10) of the truncated 1000) ──
  // A dedicated findMany with take:10 is the same 10 most-recent invoices
  // the old slice(0,10) produced for tenants ≤1000 invoices, and remains
  // correct for tenants with >1000 invoices.
  const recentInvoices = await db.invoice.findMany({
    where,
    select: {
      id: true, invoiceNumber: true, clientName: true, status: true,
      total: true, paid: true, issueDate: true, companySlug: true,
    },
    orderBy: { createdAt: "desc" },
    take: 10,
  });
  const recent = recentInvoices.map((inv) => ({
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
    return NextResponse.json({ stats });
  }

  const stats = await cached(cacheKey, CACHE_TTL_SECONDS, () =>
    computeStats(user.uid, companiesForCache, user.role, companySlug),
  );
  return NextResponse.json({ stats });
});

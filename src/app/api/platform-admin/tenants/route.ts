/**
 * /api/platform-admin/tenants
 * GET — list all tenants (founder only)
 *
 * DB-002/PERF-002 FIX: Replaced N+1 queries with batch aggregation.
 * Old: 1 + N*4 queries (N = number of companies)
 * New: 4 queries total (companies + invoice counts + client counts + revenue sums)
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { resolveAuth } from "@/lib/auth";
import { isFounderEmail } from "@/lib/founder";
import { withErrorHandler } from "@/lib/api";
import { num } from "@/lib/money";
import { DEFAULT_PLANS } from "@/lib/plans";

export const GET = withErrorHandler(async (req: NextRequest) => {
  const result = await resolveAuth(req);
  if (!result.ok || !result.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isFounderEmail(result.user.email)) {
    return NextResponse.json({ error: "Founder only" }, { status: 403 });
  }

  // Fetch all companies
  const companies = await db.company.findMany({ orderBy: { createdAt: "desc" } });

  if (companies.length === 0) {
    return NextResponse.json({ tenants: [] });
  }

  // Batch: invoice counts per company
  const invoiceCounts = await db.invoice.groupBy({
    by: ["companySlug"],
    _count: true,
  });
  const invoiceCountMap: Map<any, any> = new Map(invoiceCounts.map(r => [r.companySlug, r._count]));

  // Batch: client counts per company
  const clientCounts = await db.client.groupBy({
    by: ["companySlug"],
    _count: true,
  });
  const clientCountMap = new Map(clientCounts.map(r => [r.companySlug, r._count]));

  // Batch: revenue sums per company (fetch totals, sum in JS since SQLite string)
  const allInvoices = await db.invoice.findMany({
    select: { companySlug: true, total: true },
  });
  const revenueMap = new Map<string, number>();
  for (const inv of allInvoices) {
    revenueMap.set(inv.companySlug, (revenueMap.get(inv.companySlug) || 0) + num(inv.total, 3));
  }

  // User counts: fetch all users and count per company from JSON
  const allUsers = await db.appUser.findMany({ select: { companies: true } });
  const userCountMap = new Map<string, number>();
  for (const u of allUsers) {
    try {
      const companies = JSON.parse(u.companies || "[]") as string[];
      for (const slug of companies) {
        userCountMap.set(slug, (userCountMap.get(slug) || 0) + 1);
      }
    } catch { /* skip malformed */ }
  }

  const tenants = companies.map((c) => {
    const invoiceCount = invoiceCountMap.get(c.slug) || 0;
    const userCount = userCountMap.get(c.slug) || 0;
    // P1.8 fix (Remaining Work Handoff): usage-vs-plan visualization.
    // Look up the plan's limits and compute utilization percentages so the
    // founder panel can render a "tenant is at X% of plan quota" bar.
    const plan = DEFAULT_PLANS[c.plan as keyof typeof DEFAULT_PLANS] || DEFAULT_PLANS.trial;
    const maxInvoices = plan.maxInvoicesPerMonth;
    const maxUsers = plan.maxUsers;
    // For invoices, we use the lifetime count as a proxy (no monthly bucketing
    // in the current schema). This is conservative — actual monthly usage is
    // lower. The bar will show "X / max" with a tooltip explaining it's lifetime.
    const invoiceUtilization = maxInvoices > 0 ? Math.min(100, (invoiceCount / maxInvoices) * 100) : 0;
    const userUtilization = maxUsers > 0 ? Math.min(100, (userCount / maxUsers) * 100) : 0;
    return {
      id: c.id,
      name: c.name,
      slug: c.slug,
      nameAr: c.nameAr,
      emoji: c.emoji,
      color: c.color,
      plan: c.plan,
      subscriptionStatus: c.subscriptionStatus,
      trialEndsAt: c.trialEndsAt,
      stripeCustomerId: c.stripeCustomerId,
      createdAt: c.createdAt,
      stats: {
        invoices: invoiceCount,
        users: userCount,
        clients: clientCountMap.get(c.slug) || 0,
        revenue: revenueMap.get(c.slug) || 0,
      },
      // P1.8: plan utilization for the founder panel's usage-vs-plan column.
      planLimits: {
        maxInvoicesPerMonth: maxInvoices,
        maxUsers,
        maxCompanies: plan.maxCompanies,
        invoiceUtilization: Math.round(invoiceUtilization * 10) / 10,
        userUtilization: Math.round(userUtilization * 10) / 10,
      },
    };
  });

  return NextResponse.json({ tenants });
});

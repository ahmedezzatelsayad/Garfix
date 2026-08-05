/**
 * /api/platform-admin/stats
 * GET — platform-wide stats (founder only)
 */
import { NextRequest, NextResponse } from "next/server";
import { dbTyped as db } from "@/lib/db";
import { resolveAuth } from "@/lib/auth";
import { isFounderEmail } from "@/lib/founder";
import { withErrorHandler } from "@/lib/api";
import { num } from "@/lib/money";

export const GET = withErrorHandler(async (req: NextRequest) => {
  const result = await resolveAuth(req);
  if (!result.ok || !result.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isFounderEmail(result.user.email)) {
    return NextResponse.json({ error: "Founder only" }, { status: 403 });
  }

  const [tenantsCount, usersCount, ticketsOpen] = await Promise.all([
    db.company.count(),
    db.appUser.count(),
    db.supportTicket.count({ where: { status: "open" } }),
  ]);

  // M3 FIX: single aggregate query replaces findMany+reduce (and the
  // separate db.invoice.count() that used to live in Promise.all).
  const revenueAgg = await db.invoice.aggregate({ _sum: { total: true }, _count: true });
  const totalRevenue = num(revenueAgg._sum.total ?? 0, 3);
  const totalInvoices = revenueAgg._count;
  const invoicesCount = totalInvoices;

  // Plan distribution
  const planCounts = await db.company.groupBy({ by: ["plan"], _count: true });
  const byPlan: Record<string, number> = {};
  planCounts.forEach((p) => { byPlan[p.plan] = p._count; });

  // Last 6 months growth (tenant signups)
  const now = new Date();
  const monthlyGrowth: Array<{ month: string; tenants: number }> = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const nextD = new Date(d.getFullYear(), d.getMonth() + 1, 1);
    const cnt = await db.company.count({
      where: { createdAt: { gte: d, lt: nextD } },
    });
    monthlyGrowth.push({ month: monthKey, tenants: cnt });
  }

  return NextResponse.json({
    tenantsCount,
    usersCount,
    invoicesCount,
    ticketsOpen,
    totalRevenue,
    byPlan,
    monthlyGrowth,
  });
});

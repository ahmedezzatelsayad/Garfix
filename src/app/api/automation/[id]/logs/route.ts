/**
 * /api/automation/[id]/logs
 * GET — execution logs for one rule (most-recent-first)
 *
 * Query: ?limit=50&status=success
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requirePermissionForCompany } from "@/lib/middleware";
import { apiError, withErrorHandler } from "@/lib/api";

type RouteParams = { params: Promise<{ id: string }> };

export const GET = withErrorHandler(async (req: NextRequest, { params }: RouteParams) => {
  const { id } = await params;
  const ruleId = parseInt(id, 10);
  if (Number.isNaN(ruleId)) return apiError("Invalid rule id", 400);

  const rule = await db.automationRule.findUnique({
    where: { id: ruleId },
    select: { id: true, companySlug: true, name: true },
  });
  if (!rule) return apiError("Rule not found", 404);

  const access = await requirePermissionForCompany(req, "settings_access", rule.companySlug);
  if ("error" in access) return access.error;

  const limit = Math.min(parseInt(req.nextUrl.searchParams.get("limit") || "50", 10) || 50, 200);
  const status = req.nextUrl.searchParams.get("status"); // optional: success | failed | skipped | pending

  const logs = await db.automationExecutionLog.findMany({
    where: {
      ruleId,
      ...(status ? { status } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  // Aggregates for quick UI display
  const agg = await db.automationExecutionLog.groupBy({
    by: ["status"],
    where: { ruleId },
    _count: { _all: true },
  });
  const counts: Record<string, number> = { success: 0, failed: 0, skipped: 0, pending: 0 };
  for (const r of agg) counts[r.status] = r._count._all;

  return NextResponse.json({
    rule: { id: rule.id, name: rule.name, companySlug: rule.companySlug },
    counts,
    logs: logs.map(l => ({
      id: l.id,
      ruleId: l.ruleId,
      status: l.status,
      triggerData: safeParse(l.triggerData, null),
      error: l.error,
      durationMs: l.durationMs,
      createdAt: l.createdAt,
    })),
  });
});

function safeParse<T>(s: string | null | undefined, fallback: T): T {
  if (!s) return fallback;
  try {
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
}

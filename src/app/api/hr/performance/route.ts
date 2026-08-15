/**
 * /api/hr/performance
 * GET / POST — performance reviews
 */
import { NextRequest, NextResponse } from "next/server";
import { dbTyped as db } from "@/lib/db";
import { resolveAuth, assertCompanyAccess, hasUnrestrictedScope } from "@/lib/auth";
import { requirePermissionForCompany } from "@/lib/middleware";
import { logAudit } from "@/lib/audit";
import { num } from "@/lib/money";
import { z } from "zod";
import { apiError, withErrorHandler, parseJsonBody } from "@/lib/api";
import { rateLimitResponse, LIMITS } from "@/lib/rateLimit";

const CreateSchema = z.object({
  companySlug: z.string().min(1),
  employeeId: z.string().min(1),
  period: z.string().min(1),
  kpiScore: z.number().int().min(0).max(100).optional().nullable(),
  attendScore: z.number().int().min(0).max(100).optional().nullable(),
  teamScore: z.number().int().min(0).max(100).optional().nullable(),
  overallScore: z.number().int().min(0).max(100).optional().nullable(),
  rating: z.union([z.number(), z.string()]).optional(),
  strengths: z.string().optional(),
  improvements: z.string().optional(),
  reviewerNote: z.string().optional(),
});

export const GET = withErrorHandler(async (req: NextRequest) => {
  const result = await resolveAuth(req);
  if (!result.ok || !result.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const sp = req.nextUrl.searchParams;
  const companySlug = sp.get("companySlug") || undefined;
  if (companySlug && !assertCompanyAccess(result.user, companySlug)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const where: Record<string, unknown> = {};
  // companySlug filter (added P3)
  if (companySlug) where.companySlug = companySlug;
  else if (!hasUnrestrictedScope(result.user)) where.companySlug = { in: result.user.companies };
  const records = await db.hRPerformance.findMany({ where, orderBy: { createdAt: "desc" }, take: 200 });
  return NextResponse.json({ performance: records });
});

export const POST = withErrorHandler(async (req: NextRequest) => {
  // P5-H2: Rate limit POST /api/hr-performance — 30/min/IP (API_WRITE).
  const rl = await rateLimitResponse(req, "post:hr-performance", LIMITS.API_WRITE);
  if (rl) return rl;

  const body = await parseJsonBody(req);
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) return apiError(parsed.error.issues[0]?.message || "Invalid input", 400);
  const data = parsed.data;

  // Enforce permission + company access
  const access = await requirePermissionForCompany(req, "employee_management", data.companySlug ?? "");
  if ("error" in access) return access.error;
  const user = access.user;

  const p = await db.hRPerformance.create({
    data: {
      employeeId: data.employeeId, companySlug: data.companySlug, period: data.period,
      rating: num(data.rating ?? 0, 3).toFixed(3),
      goals: data.strengths || null,
      feedback: data.improvements || null,
      // HRPerformance only has period/rating/goals/feedback — kpiScore/attendScore/teamScore/overallScore/reviewerNote are not columns.
    },
  });
  await logAudit({
    userEmail: user.email, userUid: user.uid ?? "",
    action: "create", entity: "performance", entityId: p.id, companySlug: data.companySlug,
  });
  return NextResponse.json({ ok: true, performance: p });
});

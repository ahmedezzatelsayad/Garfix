/**
 * /api/hr/performance/[id]
 * PATCH  — update performance review
 * DELETE — delete performance review
 */
import { NextRequest, NextResponse } from "next/server";
import { dbTyped as db } from "@/lib/db";
import { requirePermission, requirePermissionForCompany } from "@/lib/middleware";
import { assertCompanyAccess } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { num } from "@/lib/money";
import { z } from "zod";
import { apiError, withErrorHandler, parseJsonBody } from "@/lib/api";

type RouteParams = { params: Promise<{ id: string }> };

const UpdateSchema = z.object({
  kpiScore: z.number().int().min(0).max(100).optional().nullable(),
  attendScore: z.number().int().min(0).max(100).optional().nullable(),
  teamScore: z.number().int().min(0).max(100).optional().nullable(),
  overallScore: z.number().int().min(0).max(100).optional().nullable(),
  rating: z.string().optional().nullable(),
  strengths: z.string().optional().nullable(),
  improvements: z.string().optional().nullable(),
  reviewerNote: z.string().optional().nullable(),
});

export const PATCH = withErrorHandler(async (req: NextRequest, { params }: RouteParams) => {
  const { id } = await params;
  // IDOR mitigation: 404 on wrong-tenant
  const access = await requirePermission(req, "employee_management");
  if ("error" in access) return access.error;
  const user = access.user;
  // TODO(P2-Sprint5-D): HRPerformance has no companySlug column — resolve via employee relation.
  const existing = await db.hRPerformance.findUnique({
    where: { id },
    include: { employee: { select: { companySlug: true } } },
  });
  if (!existing || !assertCompanyAccess(user, existing.employee?.companySlug ?? "")) {
    return apiError("Performance review not found", 404);
  }

  const body = await parseJsonBody(req);
  const parsed = UpdateSchema.safeParse(body);
  if (!parsed.success) return apiError(parsed.error.issues[0]?.message || "Invalid input", 400);

  const data: Record<string, unknown> = {};
  // TODO(P2-Sprint5-D): HRPerformance schema only exposes period/rating/goals/feedback —
  // kpiScore/attendScore/teamScore/overallScore/strengths/improvements/reviewerNote are not columns.
  // if (parsed.data.kpiScore !== undefined) data.kpiScore = parsed.data.kpiScore;
  // if (parsed.data.attendScore !== undefined) data.attendScore = parsed.data.attendScore;
  // if (parsed.data.teamScore !== undefined) data.teamScore = parsed.data.teamScore;
  // if (parsed.data.overallScore !== undefined) data.overallScore = parsed.data.overallScore;
  if (parsed.data.rating !== undefined) data.rating = num(parsed.data.rating, 3).toFixed(3);
  if (parsed.data.strengths !== undefined) data.goals = parsed.data.strengths || null;
  if (parsed.data.improvements !== undefined) data.feedback = parsed.data.improvements || null;
  // if (parsed.data.reviewerNote !== undefined) data.reviewerNote = parsed.data.reviewerNote || null;

  const performance = await db.hRPerformance.update({ where: { id: existing.id }, data });
  await logAudit({
    userEmail: user.email, userUid: user.uid,
    action: "update", entity: "performance", entityId: performance.id, companySlug: existing.employee?.companySlug,
    details: { fields: Object.keys(data) },
  });
  return NextResponse.json({ ok: true, performance });
});

export const DELETE = withErrorHandler(async (req: NextRequest, { params }: RouteParams) => {
  const { id } = await params;
  // IDOR mitigation: 404 on wrong-tenant
  const access = await requirePermission(req, "employee_management");
  if ("error" in access) return access.error;
  const user = access.user;
  // TODO(P2-Sprint5-D): HRPerformance has no companySlug column — resolve via employee relation.
  const existing = await db.hRPerformance.findUnique({
    where: { id },
    include: { employee: { select: { companySlug: true } } },
  });
  if (!existing || !assertCompanyAccess(user, existing.employee?.companySlug ?? "")) {
    return apiError("Performance review not found", 404);
  }

  await db.hRPerformance.delete({ where: { id: existing.id } });
  await logAudit({
    userEmail: user.email, userUid: user.uid,
    action: "delete", entity: "performance", entityId: existing.id, companySlug: existing.employee?.companySlug,
  });
  return NextResponse.json({ ok: true });
});


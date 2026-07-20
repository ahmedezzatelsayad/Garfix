/**
 * /api/hr/performance/[id]
 * PATCH  — update performance review
 * DELETE — delete performance review
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requirePermissionForCompany } from "@/lib/middleware";
import { logAudit } from "@/lib/audit";
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
  const existing = await db.performance.findUnique({ where: { id: parseInt(id) } });
  if (!existing) return apiError("Performance review not found", 404);

  const access = await requirePermissionForCompany(req, "employee_management", existing.companySlug);
  if ("error" in access) return access.error;
  const user = access.user;

  const body = await parseJsonBody(req);
  const parsed = UpdateSchema.safeParse(body);
  if (!parsed.success) return apiError(parsed.error.issues[0]?.message || "Invalid input", 400);

  const data: Record<string, unknown> = {};
  if (parsed.data.kpiScore !== undefined) data.kpiScore = parsed.data.kpiScore;
  if (parsed.data.attendScore !== undefined) data.attendScore = parsed.data.attendScore;
  if (parsed.data.teamScore !== undefined) data.teamScore = parsed.data.teamScore;
  if (parsed.data.overallScore !== undefined) data.overallScore = parsed.data.overallScore;
  if (parsed.data.rating !== undefined) data.rating = parsed.data.rating || null;
  if (parsed.data.strengths !== undefined) data.strengths = parsed.data.strengths || null;
  if (parsed.data.improvements !== undefined) data.improvements = parsed.data.improvements || null;
  if (parsed.data.reviewerNote !== undefined) data.reviewerNote = parsed.data.reviewerNote || null;

  const performance = await db.performance.update({ where: { id: existing.id }, data });
  await logAudit({
    userEmail: user.email, userUid: user.uid,
    action: "update", entity: "performance", entityId: performance.id, companySlug: existing.companySlug,
    details: { fields: Object.keys(data) },
  });
  return NextResponse.json({ ok: true, performance });
});

export const DELETE = withErrorHandler(async (req: NextRequest, { params }: RouteParams) => {
  const { id } = await params;
  const existing = await db.performance.findUnique({ where: { id: parseInt(id) } });
  if (!existing) return apiError("Performance review not found", 404);

  const access = await requirePermissionForCompany(req, "employee_management", existing.companySlug);
  if ("error" in access) return access.error;
  const user = access.user;

  await db.performance.delete({ where: { id: existing.id } });
  await logAudit({
    userEmail: user.email, userUid: user.uid,
    action: "delete", entity: "performance", entityId: existing.id, companySlug: existing.companySlug,
  });
  return NextResponse.json({ ok: true });
});


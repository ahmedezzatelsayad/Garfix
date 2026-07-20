/**
 * /api/hr/performance
 * GET / POST — performance reviews
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { resolveAuth, assertCompanyAccess, hasUnrestrictedScope } from "@/lib/auth";
import { requirePermissionForCompany } from "@/lib/middleware";
import { logAudit } from "@/lib/audit";
import { z } from "zod";
import { apiError, withErrorHandler, parseJsonBody } from "@/lib/api";

const CreateSchema = z.object({
  companySlug: z.string().min(1),
  employeeId: z.number().int(),
  period: z.string().min(1),
  kpiScore: z.number().int().min(0).max(100).optional().nullable(),
  attendScore: z.number().int().min(0).max(100).optional().nullable(),
  teamScore: z.number().int().min(0).max(100).optional().nullable(),
  overallScore: z.number().int().min(0).max(100).optional().nullable(),
  rating: z.string().optional(),
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
  if (companySlug) where.companySlug = companySlug;
  else if (!hasUnrestrictedScope(result.user)) where.companySlug = { in: result.user.companies };
  const records = await db.performance.findMany({ where, orderBy: { createdAt: "desc" }, take: 500 });
  return NextResponse.json({ performance: records });
});

export const POST = withErrorHandler(async (req: NextRequest) => {
  const body = await parseJsonBody(req);
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) return apiError(parsed.error.issues[0]?.message || "Invalid input", 400);
  const data = parsed.data;

  // Enforce permission + company access
  const access = await requirePermissionForCompany(req, "employee_management", data.companySlug);
  if ("error" in access) return access.error;
  const user = access.user;

  const p = await db.performance.create({
    data: {
      companySlug: data.companySlug, employeeId: data.employeeId, period: data.period,
      kpiScore: data.kpiScore ?? null, attendScore: data.attendScore ?? null,
      teamScore: data.teamScore ?? null, overallScore: data.overallScore ?? null,
      rating: data.rating || null, strengths: data.strengths || null,
      improvements: data.improvements || null, reviewerNote: data.reviewerNote || null,
    },
  });
  await logAudit({
    userEmail: user.email, userUid: user.uid,
    action: "create", entity: "performance", entityId: p.id, companySlug: data.companySlug,
  });
  return NextResponse.json({ ok: true, performance: p });
});

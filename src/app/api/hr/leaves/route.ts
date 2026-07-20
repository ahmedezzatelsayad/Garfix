/**
 * /api/hr/leaves
 * GET / POST — leave requests
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
  type: z.enum(["annual", "sick", "unpaid", "maternity", "other"]).default("annual"),
  startDate: z.string().min(1),
  endDate: z.string().min(1),
  days: z.number().int().default(1),
  reason: z.string().optional(),
  status: z.enum(["pending", "approved", "rejected"]).default("pending"),
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
  const records = await db.leaveRequest.findMany({ where, orderBy: { createdAt: "desc" }, take: 500 });
  return NextResponse.json({ leaves: records });
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

  const l = await db.leaveRequest.create({
    data: {
      companySlug: data.companySlug, employeeId: data.employeeId, type: data.type,
      startDate: data.startDate, endDate: data.endDate, days: data.days,
      reason: data.reason || null, status: data.status, approvedBy: user.email,
    },
  });
  await logAudit({
    userEmail: user.email, userUid: user.uid,
    action: "create", entity: "leave", entityId: l.id, companySlug: data.companySlug,
  });
  return NextResponse.json({ ok: true, leave: l });
});

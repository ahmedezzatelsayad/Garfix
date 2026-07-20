/**
 * /api/hr/attendance
 * GET / POST — attendance records
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
  date: z.string().min(1),
  status: z.enum(["present", "absent", "late", "half", "remote"]).default("present"),
  checkIn: z.string().optional(),
  checkOut: z.string().optional(),
  notes: z.string().optional(),
});

export const GET = withErrorHandler(async (req: NextRequest) => {
  const result = await resolveAuth(req);
  if (!result.ok || !result.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const sp = req.nextUrl.searchParams;
  const companySlug = sp.get("companySlug") || undefined;
  const employeeId = sp.get("employeeId");
  if (companySlug && !assertCompanyAccess(result.user, companySlug)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const where: Record<string, unknown> = {};
  if (companySlug) where.companySlug = companySlug;
  else if (!hasUnrestrictedScope(result.user)) where.companySlug = { in: result.user.companies };
  if (employeeId) where.employeeId = parseInt(employeeId);
  const records = await db.attendance.findMany({ where, orderBy: { date: "desc" }, take: 500 });
  return NextResponse.json({ attendance: records });
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

  const att = await db.attendance.create({
    data: {
      companySlug: data.companySlug,
      employeeId: data.employeeId,
      date: data.date,
      status: data.status,
      checkIn: data.checkIn || null,
      checkOut: data.checkOut || null,
      notes: data.notes || null,
    },
  });
  await logAudit({
    userEmail: user.email, userUid: user.uid,
    action: "create", entity: "attendance", entityId: att.id, companySlug: data.companySlug,
  });
  return NextResponse.json({ ok: true, attendance: att });
});

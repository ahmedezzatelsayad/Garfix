/**
 * /api/hr/attendance/[id]
 * PATCH  — update attendance record
 * DELETE — delete attendance record
 */
import { NextRequest, NextResponse } from "next/server";
import { dbTyped as db } from "@/lib/db";
import { requirePermission, requirePermissionForCompany } from "@/lib/middleware";
import { assertCompanyAccess } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { z } from "zod";
import { apiError, withErrorHandler, parseJsonBody } from "@/lib/api";

type RouteParams = { params: Promise<{ id: string }> };

const UpdateSchema = z.object({
  status: z.enum(["present", "absent", "late", "half", "remote"]).optional(),
  checkIn: z.string().optional().nullable(),
  checkOut: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

export const PATCH = withErrorHandler(async (req: NextRequest, { params }: RouteParams) => {
  const { id } = await params;
  // IDOR mitigation: 404 on wrong-tenant
  const access = await requirePermission(req, "employee_management");
  if ("error" in access) return access.error;
  const user = access.user;
  // companySlug filter (added P3)
  const existing = await db.hRAttendance.findUnique({ where: { id } });
  if (!existing || !assertCompanyAccess(user, existing.companySlug)) {
    return apiError("Attendance record not found", 404);
  }

  const body = await parseJsonBody(req);
  const parsed = UpdateSchema.safeParse(body);
  if (!parsed.success) return apiError(parsed.error.issues[0]?.message || "Invalid input", 400);

  const data: Record<string, unknown> = {};
  if (parsed.data.status !== undefined) data.status = parsed.data.status;
  if (parsed.data.checkIn !== undefined) data.checkIn = parsed.data.checkIn || null;
  if (parsed.data.checkOut !== undefined) data.checkOut = parsed.data.checkOut || null;
  if (parsed.data.notes !== undefined) data.notes = parsed.data.notes || null;

  const attendance = await db.hRAttendance.update({ where: { id: existing.id }, data });
  await logAudit({
    userEmail: user.email, userUid: user.uid,
    action: "update", entity: "attendance", entityId: attendance.id, companySlug: existing.companySlug,
    details: { fields: Object.keys(data) },
  });
  return NextResponse.json({ ok: true, attendance });
});

export const DELETE = withErrorHandler(async (req: NextRequest, { params }: RouteParams) => {
  const { id } = await params;
  // IDOR mitigation: 404 on wrong-tenant
  const access = await requirePermission(req, "employee_management");
  if ("error" in access) return access.error;
  const user = access.user;
  // companySlug filter (added P3)
  const existing = await db.hRAttendance.findUnique({ where: { id } });
  if (!existing || !assertCompanyAccess(user, existing.companySlug)) {
    return apiError("Attendance record not found", 404);
  }

  await db.hRAttendance.delete({ where: { id: existing.id } });
  await logAudit({
    userEmail: user.email, userUid: user.uid,
    action: "delete", entity: "attendance", entityId: existing.id, companySlug: existing.companySlug,
  });
  return NextResponse.json({ ok: true });
});


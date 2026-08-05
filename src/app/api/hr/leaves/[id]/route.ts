/**
 * /api/hr/leaves/[id]
 * PATCH  — update leave request (also handles approve/reject flow)
 * DELETE — delete leave request
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
  type: z.enum(["annual", "sick", "unpaid", "maternity", "other"]).optional(),
  startDate: z.string().min(1).optional(),
  endDate: z.string().min(1).optional(),
  days: z.number().int().min(1).optional(),
  status: z.enum(["pending", "approved", "rejected"]).optional(),
  reason: z.string().optional().nullable(),
});

export const PATCH = withErrorHandler(async (req: NextRequest, { params }: RouteParams) => {
  const { id } = await params;
  // IDOR mitigation: 404 on wrong-tenant
  const access = await requirePermission(req, "employee_management");
  if ("error" in access) return access.error;
  const user = access.user;
  // companySlug filter (added P3)
  const existing = await db.hRLeaveRequest.findUnique({ where: { id } });
  if (!existing || !assertCompanyAccess(user, existing.companySlug)) {
    return apiError("Leave request not found", 404);
  }

  const body = await parseJsonBody(req);
  const parsed = UpdateSchema.safeParse(body);
  if (!parsed.success) return apiError(parsed.error.issues[0]?.message || "Invalid input", 400);

  const data: Record<string, unknown> = {};
  if (parsed.data.type !== undefined) data.type = parsed.data.type;
  if (parsed.data.startDate !== undefined) data.startDate = new Date(parsed.data.startDate);
  if (parsed.data.endDate !== undefined) data.endDate = new Date(parsed.data.endDate);
  if (parsed.data.days !== undefined) data.days = parsed.data.days;
  if (parsed.data.reason !== undefined) data.reason = parsed.data.reason || null;
  // Approve/reject flow: record the approver when status flips to approved/rejected
  if (parsed.data.status !== undefined) {
    data.status = parsed.data.status;
    if (parsed.data.status === "approved" || parsed.data.status === "rejected") {
      data.approvedBy = user.email;
    }
  }

  const leave = await db.hRLeaveRequest.update({ where: { id: existing.id }, data });
  await logAudit({
    userEmail: user.email, userUid: user.uid,
    action: "update", entity: "leave", entityId: leave.id, companySlug: existing.companySlug,
    details: { fields: Object.keys(data), newStatus: parsed.data.status ?? null },
  });
  return NextResponse.json({ ok: true, leave });
});

export const DELETE = withErrorHandler(async (req: NextRequest, { params }: RouteParams) => {
  const { id } = await params;
  // IDOR mitigation: 404 on wrong-tenant
  const access = await requirePermission(req, "employee_management");
  if ("error" in access) return access.error;
  const user = access.user;
  // companySlug filter (added P3)
  const existing = await db.hRLeaveRequest.findUnique({ where: { id } });
  if (!existing || !assertCompanyAccess(user, existing.companySlug)) {
    return apiError("Leave request not found", 404);
  }

  await db.hRLeaveRequest.delete({ where: { id: existing.id } });
  await logAudit({
    userEmail: user.email, userUid: user.uid,
    action: "delete", entity: "leave", entityId: existing.id, companySlug: existing.companySlug,
  });
  return NextResponse.json({ ok: true });
});


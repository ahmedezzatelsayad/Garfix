/**
 * /api/hr/commissions/[id]
 * PATCH  — update commission record
 * DELETE — delete commission record
 */
import { NextRequest, NextResponse } from "next/server";
import { dbTyped as db } from "@/lib/db";
import { requirePermission } from "@/lib/middleware";
import { assertCompanyAccess } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { num } from "@/lib/money";
import { z } from "zod";
import { apiError, withErrorHandler, parseJsonBody } from "@/lib/api";
import { rateLimitResponse, LIMITS } from "@/lib/rateLimit";

type RouteParams = { params: Promise<{ id: string }> };

const UpdateSchema = z.object({
  type: z.enum(["sales", "referral", "target", "other"]).optional(),
  description: z.string().optional().nullable(),
  amount: z.union([z.number(), z.string()]).optional(),
  isPaid: z.boolean().optional(),
  period: z.string().optional(),
  status: z.string().optional(),
});

export const PATCH = withErrorHandler(async (req: NextRequest, { params }: RouteParams) => {
  // P5-H2: Rate limit PATCH /api/hr-commissions-id — 30/min/IP (API_WRITE).
  const rl = await rateLimitResponse(req, "patch:hr-commissions-id", LIMITS.API_WRITE);
  if (rl) return rl;

  const { id } = await params;
  // IDOR mitigation: 404 on wrong-tenant
  const access = await requirePermission(req, "employee_management");
  if ("error" in access) return access.error;
  const user = access.user;
  // companySlug filter (added P3)
  const existing = await db.hRCommission.findUnique({ where: { id } });
  if (!existing || !assertCompanyAccess(user, existing.companySlug)) {
    return apiError("Commission record not found", 404);
  }

  const body = await parseJsonBody(req);
  const parsed = UpdateSchema.safeParse(body);
  if (!parsed.success) return apiError(parsed.error.issues[0]?.message || "Invalid input", 400);

  const data: Record<string, unknown> = {};
  // `description` is not a column on HRCommission
  if (parsed.data.type !== undefined) data.type = parsed.data.type;
  if (parsed.data.amount !== undefined) data.amount = num(parsed.data.amount, 3).toFixed(3);
  if (parsed.data.isPaid !== undefined) data.isPaid = parsed.data.isPaid;
  if (parsed.data.period !== undefined) data.period = parsed.data.period;
  if (parsed.data.status !== undefined) data.status = parsed.data.status;

  const commission = await db.hRCommission.update({ where: { id: existing.id }, data });
  await logAudit({
    userEmail: user.email, userUid: user.uid,
    action: "update", entity: "commission", entityId: commission.id, companySlug: existing.companySlug,
    details: { fields: Object.keys(data) },
  });
  return NextResponse.json({ ok: true, commission });
});

export const DELETE = withErrorHandler(async (req: NextRequest, { params }: RouteParams) => {
  // P5-H2: Rate limit DELETE /api/hr-commissions-id — 30/min/IP (API_WRITE).
  const rl = await rateLimitResponse(req, "delete:hr-commissions-id", LIMITS.API_WRITE);
  if (rl) return rl;

  const { id } = await params;
  // IDOR mitigation: 404 on wrong-tenant
  const access = await requirePermission(req, "employee_management");
  if ("error" in access) return access.error;
  const user = access.user;
  // companySlug filter (added P3)
  const existing = await db.hRCommission.findUnique({ where: { id } });
  if (!existing || !assertCompanyAccess(user, existing.companySlug)) {
    return apiError("Commission record not found", 404);
  }

  await db.hRCommission.delete({ where: { id: existing.id } });
  await logAudit({
    userEmail: user.email, userUid: user.uid,
    action: "delete", entity: "commission", entityId: existing.id, companySlug: existing.companySlug,
  });
  return NextResponse.json({ ok: true });
});


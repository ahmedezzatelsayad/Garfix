/**
 * /api/hr/commissions/[id]
 * PATCH  — update commission record
 * DELETE — delete commission record
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requirePermissionForCompany } from "@/lib/middleware";
import { logAudit } from "@/lib/audit";
import { num } from "@/lib/money";
import { z } from "zod";
import { apiError, withErrorHandler, parseJsonBody } from "@/lib/api";

type RouteParams = { params: Promise<{ id: string }> };

const UpdateSchema = z.object({
  type: z.enum(["sales", "referral", "target", "other"]).optional(),
  description: z.string().optional().nullable(),
  amount: z.union([z.number(), z.string()]).optional(),
  isPaid: z.boolean().optional(),
});

export const PATCH = withErrorHandler(async (req: NextRequest, { params }: RouteParams) => {
  const { id } = await params;
  const existing = await db.hRCommission.findUnique({ where: { id: parseInt(id) } });
  if (!existing) return apiError("Commission record not found", 404);

  const access = await requirePermissionForCompany(req, "employee_management", existing.companySlug);
  if ("error" in access) return access.error;
  const user = access.user;

  const body = await parseJsonBody(req);
  const parsed = UpdateSchema.safeParse(body);
  if (!parsed.success) return apiError(parsed.error.issues[0]?.message || "Invalid input", 400);

  const data: Record<string, unknown> = {};
  if (parsed.data.type !== undefined) data.type = parsed.data.type;
  if (parsed.data.description !== undefined) data.description = parsed.data.description || null;
  if (parsed.data.amount !== undefined) data.amount = num(parsed.data.amount, 3).toFixed(3);
  if (parsed.data.isPaid !== undefined) data.isPaid = parsed.data.isPaid;

  const commission = await db.hRCommission.update({ where: { id: existing.id }, data });
  await logAudit({
    userEmail: user.email, userUid: user.uid,
    action: "update", entity: "commission", entityId: commission.id, companySlug: existing.companySlug,
    details: { fields: Object.keys(data) },
  });
  return NextResponse.json({ ok: true, commission });
});

export const DELETE = withErrorHandler(async (req: NextRequest, { params }: RouteParams) => {
  const { id } = await params;
  const existing = await db.hRCommission.findUnique({ where: { id: parseInt(id) } });
  if (!existing) return apiError("Commission record not found", 404);

  const access = await requirePermissionForCompany(req, "employee_management", existing.companySlug);
  if ("error" in access) return access.error;
  const user = access.user;

  await db.hRCommission.delete({ where: { id: existing.id } });
  await logAudit({
    userEmail: user.email, userUid: user.uid,
    action: "delete", entity: "commission", entityId: existing.id, companySlug: existing.companySlug,
  });
  return NextResponse.json({ ok: true });
});


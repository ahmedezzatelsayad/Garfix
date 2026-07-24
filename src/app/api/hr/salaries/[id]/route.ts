/**
 * /api/hr/salaries/[id]
 * PATCH  — update salary record (recalculates netSalary)
 * DELETE — delete salary record
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
  baseSalary: z.union([z.number(), z.string()]).optional(),
  allowances: z.union([z.number(), z.string()]).optional(),
  deductions: z.union([z.number(), z.string()]).optional(),
  bonus: z.union([z.number(), z.string()]).optional(),
  isPaid: z.boolean().optional(),
  notes: z.string().optional().nullable(),
});

export const PATCH = withErrorHandler(async (req: NextRequest, { params }: RouteParams) => {
  const { id } = await params;
  const existing = await db.hRSalary.findUnique({ where: { id: parseInt(id) } });
  if (!existing) return apiError("Salary record not found", 404);

  const access = await requirePermissionForCompany(req, "employee_management", existing.companySlug);
  if ("error" in access) return access.error;
  const user = access.user;

  const body = await parseJsonBody(req);
  const parsed = UpdateSchema.safeParse(body);
  if (!parsed.success) return apiError(parsed.error.issues[0]?.message || "Invalid input", 400);

  // Merge provided fields with existing for the recalc
  const base = parsed.data.baseSalary !== undefined ? num(parsed.data.baseSalary, 3) : num(existing.baseSalary, 3);
  const allowances = parsed.data.allowances !== undefined ? num(parsed.data.allowances, 3) : num(existing.allowances, 3);
  const deductions = parsed.data.deductions !== undefined ? num(parsed.data.deductions, 3) : num(existing.deductions, 3);
  const bonus = parsed.data.bonus !== undefined ? num(parsed.data.bonus, 3) : num(existing.bonus, 3);
  const net = base + allowances + bonus - deductions;

  const data: Record<string, unknown> = {
    baseSalary: base.toFixed(3),
    allowances: allowances.toFixed(3),
    deductions: deductions.toFixed(3),
    bonus: bonus.toFixed(3),
    netSalary: net.toFixed(3),
  };
  if (parsed.data.isPaid !== undefined) {
    data.isPaid = parsed.data.isPaid;
    // Mark paidAt timestamp when transitioning to paid
    if (parsed.data.isPaid && !existing.isPaid) data.paidAt = new Date();
    if (!parsed.data.isPaid) data.paidAt = null;
  }
  if (parsed.data.notes !== undefined) data.notes = parsed.data.notes || null;

  const salary = await db.hRSalary.update({ where: { id: existing.id }, data });
  await logAudit({
    userEmail: user.email, userUid: user.uid,
    action: "update", entity: "salary", entityId: salary.id, companySlug: existing.companySlug,
    details: { netSalary: net.toFixed(3), fields: Object.keys(data) },
  });
  return NextResponse.json({ ok: true, salary });
});

export const DELETE = withErrorHandler(async (req: NextRequest, { params }: RouteParams) => {
  const { id } = await params;
  const existing = await db.hRSalary.findUnique({ where: { id: parseInt(id) } });
  if (!existing) return apiError("Salary record not found", 404);

  const access = await requirePermissionForCompany(req, "employee_management", existing.companySlug);
  if ("error" in access) return access.error;
  const user = access.user;

  await db.hRSalary.delete({ where: { id: existing.id } });
  await logAudit({
    userEmail: user.email, userUid: user.uid,
    action: "delete", entity: "salary", entityId: existing.id, companySlug: existing.companySlug,
  });
  return NextResponse.json({ ok: true });
});


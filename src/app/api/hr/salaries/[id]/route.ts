/**
 * /api/hr/salaries/[id]
 * PATCH  — update salary record (recalculates netSalary)
 * DELETE — delete salary record
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
  baseSalary: z.union([z.number(), z.string()]).optional(),
  allowances: z.union([z.number(), z.string()]).optional(),
  deductions: z.union([z.number(), z.string()]).optional(),
  bonus: z.union([z.number(), z.string()]).optional(),
  isPaid: z.boolean().optional(),
  notes: z.string().optional().nullable(),
});

export const PATCH = withErrorHandler(async (req: NextRequest, { params }: RouteParams) => {
  // P5-H2: Rate limit PATCH /api/hr-salaries-id — 30/min/IP (API_WRITE).
  const rl = await rateLimitResponse(req, "patch:hr-salaries-id", LIMITS.API_WRITE);
  if (rl) return rl;

  const { id } = await params;
  // IDOR mitigation: 404 on wrong-tenant
  const access = await requirePermission(req, "employee_management");
  if ("error" in access) return access.error;
  const user = access.user;
  // companySlug filter (added P3)
  const existing = await db.hRSalary.findUnique({ where: { id } });
  if (!existing || !assertCompanyAccess(user, existing.companySlug)) {
    return apiError("Salary record not found", 404);
  }

  const body = await parseJsonBody(req);
  const parsed = UpdateSchema.safeParse(body);
  if (!parsed.success) return apiError(parsed.error.issues[0]?.message || "Invalid input", 400);

  // HRSalary now exposes baseSalary/netSalary (added P3); allowances/deductions/bonus/notes still not columns.
  const base = parsed.data.baseSalary !== undefined ? num(parsed.data.baseSalary, 3) : num(existing.amount, 3);
  const allowances = parsed.data.allowances !== undefined ? num(parsed.data.allowances, 3) : 0;
  const deductions = parsed.data.deductions !== undefined ? num(parsed.data.deductions, 3) : 0;
  const bonus = parsed.data.bonus !== undefined ? num(parsed.data.bonus, 3) : 0;
  const net = base + allowances + bonus - deductions;

  const data: Record<string, unknown> = {
    baseSalary: base.toFixed(3),
    netSalary: net.toFixed(3),
    amount: net.toFixed(3),
  };
  if (parsed.data.isPaid !== undefined) {
    data.status = parsed.data.isPaid ? "paid" : "draft";
    // Mark paidDate timestamp when transitioning to paid
    if (parsed.data.isPaid && existing.status !== "paid") data.paidDate = new Date();
    if (!parsed.data.isPaid) data.paidDate = null;
  }
  // `notes` is not a column on HRSalary

  const salary = await db.hRSalary.update({ where: { id: existing.id }, data });
  await logAudit({
    userEmail: user.email, userUid: user.uid,
    action: "update", entity: "salary", entityId: salary.id, companySlug: existing.companySlug,
    details: { netSalary: net.toFixed(3), fields: Object.keys(data) },
  });
  return NextResponse.json({ ok: true, salary });
});

export const DELETE = withErrorHandler(async (req: NextRequest, { params }: RouteParams) => {
  // P5-H2: Rate limit DELETE /api/hr-salaries-id — 30/min/IP (API_WRITE).
  const rl = await rateLimitResponse(req, "delete:hr-salaries-id", LIMITS.API_WRITE);
  if (rl) return rl;

  const { id } = await params;
  // IDOR mitigation: 404 on wrong-tenant
  const access = await requirePermission(req, "employee_management");
  if ("error" in access) return access.error;
  const user = access.user;
  // companySlug filter (added P3)
  const existing = await db.hRSalary.findUnique({ where: { id } });
  if (!existing || !assertCompanyAccess(user, existing.companySlug)) {
    return apiError("Salary record not found", 404);
  }

  await db.hRSalary.delete({ where: { id: existing.id } });
  await logAudit({
    userEmail: user.email, userUid: user.uid,
    action: "delete", entity: "salary", entityId: existing.id, companySlug: existing.companySlug,
  });
  return NextResponse.json({ ok: true });
});


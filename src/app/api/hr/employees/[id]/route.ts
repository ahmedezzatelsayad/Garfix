/**
 * /api/hr/employees/[id]
 * GET / PATCH / DELETE
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { resolveAuth, assertCompanyAccess, type AuthPayload } from "@/lib/auth";
import { requirePermissionForCompany } from "@/lib/middleware";
import { logAudit } from "@/lib/audit";
import { num } from "@/lib/money";
import { z } from "zod";
import { apiError, withErrorHandler, parseJsonBody } from "@/lib/api";

const UpdateSchema = z.object({
  name: z.string().min(1).optional(),
  nameEn: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  email: z.string().email().optional().or(z.literal("")).nullable(),
  position: z.string().optional().nullable(),
  department: z.string().optional().nullable(),
  baseSalary: z.union([z.number(), z.string()]).optional(),
  currency: z.string().optional(),
  joinDate: z.string().optional().nullable(),
  isActive: z.boolean().optional(),
  notes: z.string().optional().nullable(),
});

type RouteParams = { params: Promise<{ id: string }> };

async function loadForUser(id: number, user: AuthPayload) {
  const e = await db.employee.findUnique({ where: { id } });
  if (!e) return null;
  if (!assertCompanyAccess(user, e.companySlug)) return null;
  return e;
}

export const GET = withErrorHandler(async (req: NextRequest, { params }: RouteParams) => {
  const result = await resolveAuth(req);
  if (!result.ok || !result.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const e = await loadForUser(parseInt(id), result.user);
  if (!e) return apiError("Employee not found", 404);
  return NextResponse.json({ employee: { ...e, baseSalary: num(e.baseSalary, 3) } });
});

export const PATCH = withErrorHandler(async (req: NextRequest, { params }: RouteParams) => {
  const result = await resolveAuth(req);
  if (!result.ok || !result.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const existing = await loadForUser(parseInt(id), result.user);
  if (!existing) return apiError("Employee not found", 404);

  // Enforce permission + company access
  const access = await requirePermissionForCompany(req, "employee_management", existing.companySlug);
  if ("error" in access) return access.error;
  const user = access.user;

  const body = await parseJsonBody(req);
  const parsed = UpdateSchema.safeParse(body);
  if (!parsed.success) return apiError(parsed.error.issues[0]?.message || "Invalid input", 400);
  const data: Record<string, unknown> = { ...parsed.data };
  if (parsed.data.baseSalary !== undefined) data.baseSalary = num(parsed.data.baseSalary, 3).toFixed(3);
  const employee = await db.employee.update({ where: { id: existing.id }, data });
  await logAudit({
    userEmail: user.email, userUid: user.uid,
    action: "update", entity: "employee", entityId: employee.id, companySlug: existing.companySlug,
  });
  return NextResponse.json({ ok: true, employee });
});

export const DELETE = withErrorHandler(async (req: NextRequest, { params }: RouteParams) => {
  const result = await resolveAuth(req);
  if (!result.ok || !result.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const existing = await loadForUser(parseInt(id), result.user);
  if (!existing) return apiError("Employee not found", 404);

  // Enforce permission + company access
  const access = await requirePermissionForCompany(req, "employee_management", existing.companySlug);
  if ("error" in access) return access.error;
  const user = access.user;

  await db.employee.delete({ where: { id: existing.id } });
  await logAudit({
    userEmail: user.email, userUid: user.uid,
    action: "delete", entity: "employee", entityId: existing.id, companySlug: existing.companySlug,
  });
  return NextResponse.json({ ok: true });
});

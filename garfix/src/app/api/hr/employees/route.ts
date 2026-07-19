/**
 * /api/hr/employees
 * GET  — list employees
 * POST — create employee
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { resolveAuth, assertCompanyAccess, hasUnrestrictedScope } from "@/lib/auth";
import { requirePermissionForCompany } from "@/lib/middleware";
import { logAudit } from "@/lib/audit";
import { num } from "@/lib/money";
import { z } from "zod";
import { apiError, withErrorHandler, parseJsonBody } from "@/lib/api";

const CreateSchema = z.object({
  companySlug: z.string().min(1),
  name: z.string().min(1, "اسم الموظف مطلوب"),
  nameEn: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email().optional().or(z.literal("")),
  position: z.string().optional(),
  department: z.string().optional(),
  baseSalary: z.union([z.number(), z.string()]).default(0),
  currency: z.string().default("KWD"),
  joinDate: z.string().optional(),
  isActive: z.boolean().default(true),
  notes: z.string().optional(),
});

export const GET = withErrorHandler(async (req: NextRequest) => {
  const result = await resolveAuth(req);
  if (!result.ok || !result.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const user = result.user;
  const sp = req.nextUrl.searchParams;
  const companySlug = sp.get("companySlug") || undefined;
  if (companySlug && !assertCompanyAccess(user, companySlug)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const where: Record<string, unknown> = {};
  if (companySlug) where.companySlug = companySlug;
  else if (!hasUnrestrictedScope(user)) where.companySlug = { in: user.companies };
  const employees = await db.employee.findMany({
    where, orderBy: { createdAt: "desc" }, take: 500,
  });
  return NextResponse.json({
    employees: employees.map((e) => ({
      ...e,
      baseSalary: num(e.baseSalary, 3),
    })),
  });
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

  const employee = await db.employee.create({
    data: {
      companySlug: data.companySlug,
      name: data.name,
      nameEn: data.nameEn || null,
      phone: data.phone || null,
      email: data.email || null,
      position: data.position || null,
      department: data.department || null,
      baseSalary: num(data.baseSalary, 3).toFixed(3),
      currency: data.currency,
      joinDate: data.joinDate || null,
      isActive: data.isActive,
      notes: data.notes || null,
    },
  });
  await logAudit({
    userEmail: user.email, userUid: user.uid,
    action: "create", entity: "employee", entityId: employee.id, companySlug: data.companySlug,
  });
  return NextResponse.json({ ok: true, employee });
});

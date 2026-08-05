/**
 * /api/hr/employees
 * GET  — list employees
 * POST — create employee
 */
import { NextRequest, NextResponse } from "next/server";
import { dbTyped as db } from "@/lib/db";
import { resolveAuth, assertCompanyAccess, hasUnrestrictedScope } from "@/lib/auth";
import { requirePermissionForCompany, hasPermission } from "@/lib/middleware";
import { logAudit } from "@/lib/audit";
import { rateLimitResponse, LIMITS } from "@/lib/rateLimit";
import { num } from "@/lib/money";
import { z } from "zod";
import { apiError, withErrorHandler, parseJsonBody } from "@/lib/api";
import { parseCursorParams, buildCursorResponse, buildCursorPrismaQuery } from "@/lib/cursor-pagination-server";

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
  code: z.string().optional(),
});

export const GET = withErrorHandler(async (req: NextRequest) => {
  const result = await resolveAuth(req);
  if (!result.ok || !result.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const user = result.user;

  // Authorization: enforce employee_management permission for reading employee data
  if (!hasPermission(user, "employee_management")) {
    return NextResponse.json({ error: "ليس لديك صلاحية: employee_management" }, { status: 403 });
  }

  const { companySlug, cursor, limit } = parseCursorParams(req);
  if (companySlug && !assertCompanyAccess(user, companySlug)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const where: Record<string, unknown> = {};
  if (companySlug) where.companySlug = companySlug;
  else if (!hasUnrestrictedScope(user)) where.companySlug = { in: user.companies };

  const pagination = buildCursorPrismaQuery(cursor, limit, "createdAt", "desc");
  // Employee.id is a String (cuid) — override cursor to use the string id.
  const allEmployees: any[] = await db.employee.findMany({
    where,
    take: pagination.take,
    skip: pagination.skip,
    cursor: cursor ? { id: cursor } : undefined,
    orderBy: pagination.orderBy,
  });

  const { items, nextCursor } = buildCursorResponse(allEmployees, limit);
  const employees: any[] = items;

  return NextResponse.json({
    employees: employees.map((e) => ({
      ...e,
      baseSalary: num(e.baseSalary, 3),
    })),
    nextCursor,
  });
});

export const POST = withErrorHandler(async (req: NextRequest) => {
  // P5-E: Rate limit POST /api/hr/employees — 30/min/IP (API_WRITE).
  //   Employee creation cascades into payroll config + gratuity setup;
  //   abuse here can corrupt downstream HR calculations.
  const rl = await rateLimitResponse(req, "post:hr-employees", LIMITS.API_WRITE);
  if (rl) return rl;

  const body = await parseJsonBody(req);
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) return apiError(parsed.error.issues[0]?.message || "Invalid input", 400);
  const data = parsed.data;

  // Enforce permission + company access
  const access = await requirePermissionForCompany(req, "employee_management", data.companySlug);
  if ("error" in access) return access.error;
  const user = access.user;

  // P2-Sprint5-D: Employee schema requires `companyId` (FK to Company.id) and `code` (unique).
  // Look up the company by slug to obtain its id; auto-generate a code if not provided.
  const company = await db.company.findUnique({ where: { slug: data.companySlug } });
  if (!company) return apiError("Company not found", 404);

  const employee = await db.employee.create({
    data: {
      companySlug: data.companySlug,
      companyId: company.id,
      code: data.code || crypto.randomUUID(),
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

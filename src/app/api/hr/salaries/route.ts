/**
 * /api/hr/salaries
 * GET / POST — salary records
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
  employeeId: z.number().int(),
  month: z.string().min(1),
  baseSalary: z.union([z.number(), z.string()]).default(0),
  allowances: z.union([z.number(), z.string()]).default(0),
  deductions: z.union([z.number(), z.string()]).default(0),
  bonus: z.union([z.number(), z.string()]).default(0),
  isPaid: z.boolean().default(false),
  notes: z.string().optional(),
});

export const GET = withErrorHandler(async (req: NextRequest) => {
  const result = await resolveAuth(req);
  if (!result.ok || !result.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const sp = req.nextUrl.searchParams;
  const companySlug = sp.get("companySlug") || undefined;
  if (companySlug && !assertCompanyAccess(result.user, companySlug)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const where: Record<string, unknown> = {};
  if (companySlug) where.companySlug = companySlug;
  else if (!hasUnrestrictedScope(result.user)) where.companySlug = { in: result.user.companies };
  const salaries = await db.hRSalary.findMany({ where, orderBy: { month: "desc" }, take: 500 });
  return NextResponse.json({
    salaries: salaries.map((s) => ({
      ...s,
      baseSalary: num(s.baseSalary, 3),
      allowances: num(s.allowances, 3),
      deductions: num(s.deductions, 3),
      bonus: num(s.bonus, 3),
      netSalary: num(s.netSalary, 3),
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

  const base = num(data.baseSalary, 3);
  const allowances = num(data.allowances, 3);
  const deductions = num(data.deductions, 3);
  const bonus = num(data.bonus, 3);
  const net = base + allowances + bonus - deductions;
  const salary = await db.hRSalary.create({
    data: {
      companySlug: data.companySlug,
      employeeId: data.employeeId,
      month: data.month,
      baseSalary: base.toFixed(3),
      allowances: allowances.toFixed(3),
      deductions: deductions.toFixed(3),
      bonus: bonus.toFixed(3),
      netSalary: net.toFixed(3),
      isPaid: data.isPaid,
      notes: data.notes || null,
    },
  });
  await logAudit({
    userEmail: user.email, userUid: user.uid,
    action: "create", entity: "salary", entityId: salary.id, companySlug: data.companySlug,
  });
  return NextResponse.json({ ok: true, salary });
});

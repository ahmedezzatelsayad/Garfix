/**
 * POST /api/hr/gratuity
 * Calculate end-of-service gratuity for an employee based on Gulf labor law.
 *
 * Body: { employeeId: number, endDate?: string }
 * Returns: GratuityResult with breakdown
 */
import { NextRequest, NextResponse } from "next/server";
import { dbTyped as db } from "@/lib/db";
import { resolveAuth, assertCompanyAccess } from "@/lib/auth";
import { requirePermissionForCompany } from "@/lib/middleware";
import { calculateGratuity, isEligibleForGratuity } from "@/lib/gratuity";
import { num } from "@/lib/money";
import { withErrorHandler, apiError, parseJsonBody } from "@/lib/api";
import { z } from "zod";

const Schema = z.object({
  companySlug: z.string().min(1),
  employeeId: z.string().min(1),
  endDate: z.string().optional(),
});

export const POST = withErrorHandler(async (req: NextRequest) => {
  const body = await parseJsonBody(req);
  const parsed = Schema.safeParse(body);
  if (!parsed.success) return apiError(parsed.error.issues[0]?.message || "Invalid input", 400);
  const { companySlug, employeeId, endDate } = parsed.data;

  // IDOR fix: tenant filter in WHERE (DB-layer enforcement)
  const access = await requirePermissionForCompany(req, "employee_management", companySlug);
  if ("error" in access) return access.error;
  const user = access.user;
  const employee = await db.employee.findFirst({ where: { id: employeeId, companySlug } });
  if (!employee) return apiError("الموظف غير موجود", 404);

  if (!employee.joinDate) {
    return apiError("تاريخ الالتحاق غير محدد لهذا الموظف", 400);
  }


  // Get company country for labor law selection
  const company = await db.company.findUnique({
    where: { slug: employee.companySlug },
    select: { country: true },
  });
  const countryCode = company?.country || "KW";

  // Monthly salary = base + allowances
  // TODO(P2-Sprint5-D): Employee schema has no `allowances` column — treat as 0.
  const monthlySalary = num(employee.baseSalary, 3);

  const eligible = isEligibleForGratuity(employee.joinDate, endDate, countryCode);
  if (!eligible) {
    return NextResponse.json({
      ok: true,
      eligible: false,
      message: "الموظف غير مؤهل لمكافأة نهاية الخدمة (أقل من سنة خدمة)",
      countryCode,
    });
  }

  // TODO(P2-Sprint5-D): Employee schema has no `endDate` column — use request body or today.
  const effectiveEndDate = endDate || new Date().toISOString().slice(0, 10);
  const result = calculateGratuity({
    joinDate: employee.joinDate,
    endDate: effectiveEndDate,
    monthlySalary,
    countryCode,
  });

  return NextResponse.json({
    ok: true,
    eligible: true,
    employee: {
      id: employee.id,
      name: employee.name,
      joinDate: employee.joinDate,
      endDate: effectiveEndDate,
      monthlySalary: monthlySalary.toFixed(3),
      baseSalary: employee.baseSalary,
      // TODO(P2-Sprint5-D): `allowances` column missing on Employee — return 0.
      allowances: 0,
    },
    gratuity: result,
    countryCode,
  });
});

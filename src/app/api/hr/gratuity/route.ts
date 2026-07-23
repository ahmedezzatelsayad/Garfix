/**
 * POST /api/hr/gratuity
 * Calculate end-of-service gratuity for an employee based on Gulf labor law.
 *
 * Body: { employeeId: number, endDate?: string }
 * Returns: GratuityResult with breakdown
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { resolveAuth, assertCompanyAccess } from "@/lib/auth";
import { requirePermissionForCompany } from "@/lib/middleware";
import { calculateGratuity, isEligibleForGratuity } from "@/lib/gratuity";
import { num } from "@/lib/money";
import { withErrorHandler, apiError, parseJsonBody } from "@/lib/api";
import { z } from "zod";

const Schema = z.object({
  employeeId: z.number().int(),
  endDate: z.string().optional(),
});

export const POST = withErrorHandler(async (req: NextRequest) => {
  const body = await parseJsonBody(req);
  const parsed = Schema.safeParse(body);
  if (!parsed.success) return apiError(parsed.error.issues[0]?.message || "Invalid input", 400);
  const { employeeId, endDate } = parsed.data;

  const employee = await db.employee.findUnique({ where: { id: employeeId } });
  if (!employee) return apiError("الموظف غير موجود", 404);

  // Check permission + company access
  const access = await requirePermissionForCompany(req, "employee_management", employee.companySlug);
  if ("error" in access) return access.error;

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
  const monthlySalary = num(employee.baseSalary, 3) + num(employee.allowances, 3);

  const eligible = isEligibleForGratuity(employee.joinDate, endDate, countryCode);
  if (!eligible) {
    return NextResponse.json({
      ok: true,
      eligible: false,
      message: "الموظف غير مؤهل لمكافأة نهاية الخدمة (أقل من سنة خدمة)",
      countryCode,
    });
  }

  const result = calculateGratuity({
    joinDate: employee.joinDate,
    endDate: endDate || employee.endDate,
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
      endDate: endDate || employee.endDate || new Date().toISOString().slice(0, 10),
      monthlySalary: monthlySalary.toFixed(3),
      baseSalary: employee.baseSalary,
      allowances: employee.allowances,
    },
    gratuity: result,
    countryCode,
  });
});

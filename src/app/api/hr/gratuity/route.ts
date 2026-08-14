/**
 * POST /api/hr/gratuity
 * Calculate end-of-service gratuity for an employee based on Gulf labor law.
 *
 * Body: { employeeId: number, endDate?: string }
 * Returns: GratuityResult with breakdown
 */
import { NextRequest, NextResponse } from "next/server";
import { dbTyped as db } from "@/lib/db";
import { requirePermissionForCompany } from "@/lib/middleware";
import { calculateGratuity, isEligibleForGratuity } from "@/lib/gratuity";
import { num } from "@/lib/money";
import { withErrorHandler, apiError, parseJsonBody } from "@/lib/api";
import { z } from "zod";
import { rateLimitResponse, LIMITS } from "@/lib/rateLimit";

const Schema = z.object({
  companySlug: z.string().min(1),
  employeeId: z.string().min(1),
  endDate: z.string().optional(),
});

export const POST = withErrorHandler(async (req: NextRequest) => {
  // P5-H2: Rate limit POST /api/hr-gratuity — 30/min/IP (API_WRITE).
  const rl = await rateLimitResponse(req, "post:hr-gratuity", LIMITS.API_WRITE);
  if (rl) return rl;

  const body = await parseJsonBody(req);
  const parsed = Schema.safeParse(body);
  if (!parsed.success) return apiError(parsed.error.issues[0]?.message || "Invalid input", 400);
  const { companySlug, employeeId, endDate } = parsed.data;

  // IDOR fix: tenant filter in WHERE (DB-layer enforcement)
  const access = await requirePermissionForCompany(req, "employee_management", companySlug);
  if ("error" in access) return access.error;
  const _user = access.user;
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

  // Monthly salary = base + allowances (allowances added P3)
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

  // endDate column added P3 — fall back to employee.endDate then today
  const effectiveEndDate = endDate || employee.endDate?.toISOString().slice(0, 10) || new Date().toISOString().slice(0, 10);
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
      allowances: num(employee.allowances, 3),
    },
    gratuity: result,
    countryCode,
  });
});

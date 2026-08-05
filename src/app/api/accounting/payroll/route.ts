/**
 * /api/accounting/payroll
 * GET  — retrieve existing payroll records for a month
 * POST — calculate payroll for a month
 * Returns: all employees with calculated salary breakdown
 */
import { NextRequest } from "next/server";
import { dbTyped as db } from "@/lib/db";
import { requirePermissionForCompany } from "@/lib/middleware";
import { logAudit } from "@/lib/audit";
import { calculateNetSalary, calculateSocialInsurance } from "@/lib/accounting/payroll-wps";
import { getCountryConfig } from "@/lib/gulfConfig";
import { num } from "@/lib/money";
import { z } from "zod";
import { apiError, withErrorHandler, parseJsonBody, apiOk } from "@/lib/api";

const PayrollSchema = z.object({
  companySlug: z.string().min(1),
  month: z.string().min(1), // YYYY-MM
});

const GetPayrollSchema = z.object({
  companySlug: z.string().min(1),
  month: z.string().min(1), // YYYY-MM
});

// ── GET: Retrieve existing salary records for a month ───────────────────

export const GET = withErrorHandler(async (req: NextRequest) => {
  const sp = req.nextUrl.searchParams;
  const parsed = GetPayrollSchema.safeParse({
    companySlug: sp.get("companySlug") || "",
    month: sp.get("month") || "",
  });
  if (!parsed.success) return apiError(parsed.error.issues[0]?.message || "Invalid input", 400);
  const data = parsed.data;

  // Validate month format
  const monthRegex = /^\d{4}-\d{2}$/;
  if (!monthRegex.test(data.month)) {
    return apiError("Month must be in YYYY-MM format", 400);
  }

  const access = await requirePermissionForCompany(req, "finance_access", data.companySlug);
  if ("error" in access) return access.error;

  const company = await db.company.findUnique({ where: { slug: data.companySlug } });
  if (!company) return apiError("Company not found", 404);

  const country = company.country || "KW";
  const config = getCountryConfig(country);
  const decimals = config?.currencyDecimalPlaces ?? 3;

  const payroll = await db.hRSalary.findMany({
    // HRSalary.companySlug restored (P3)
    where: { companySlug: data.companySlug, month: data.month },
    include: { employee: { select: { id: true, name: true, nameEn: true, civilId: true } } },
    orderBy: { employeeId: "asc" },
  });

  let totalGross = 0;
  let totalNet = 0;
  let totalDeductions = 0;
  let totalSocialInsurance = 0;

  for (const s of payroll) {
    // HRSalary.baseSalary/netSalary restored (P3); allowances/bonus/deductions
    // were never in the schema (num() returned 0 for them under db: any).
    const gross = num(s.baseSalary, decimals);
    totalGross += gross;
    totalNet += num(s.netSalary, decimals);
    totalDeductions += 0;
    // Social insurance is computed using the payroll engine
    const siResult = calculateSocialInsurance({ baseSalary: s.baseSalary.toString(), allowances: "0" }, country);
    totalSocialInsurance += num(siResult.employeePortion, decimals);
  }

  return apiOk({
    month: data.month,
    payroll: payroll.map((s) => ({
      ...s,
      employeeName: s.employee.name,
      employeeNameEn: s.employee.nameEn,
      // Employee.civilId restored (P3)
      civilId: s.employee.civilId ?? "",
      grossSalary: num(s.baseSalary, decimals).toFixed(decimals),
    })),
    totals: {
      totalGross: num(totalGross, decimals).toFixed(decimals),
      totalNet: num(totalNet, decimals).toFixed(decimals),
      totalDeductions: num(totalDeductions, decimals).toFixed(decimals),
      totalSocialInsurance: num(totalSocialInsurance, decimals).toFixed(decimals),
    },
  });
});

export const POST = withErrorHandler(async (req: NextRequest) => {
  const body = await parseJsonBody(req);
  const parsed = PayrollSchema.safeParse(body);
  if (!parsed.success) return apiError(parsed.error.issues[0]?.message || "Invalid input", 400);
  const data = parsed.data;

  const access = await requirePermissionForCompany(req, "finance_access", data.companySlug);
  if ("error" in access) return access.error;
  const user = access.user;

  // Validate month format
  const monthRegex = /^\d{4}-\d{2}$/;
  if (!monthRegex.test(data.month)) {
    return apiError("Month must be in YYYY-MM format", 400);
  }

  // Get company to determine country
  const company = await db.company.findUnique({
    where: { slug: data.companySlug },
  });
  if (!company) return apiError("Company not found", 404);

  const country = company.country || "KW";
  const config = getCountryConfig(country);
  const decimals = config?.currencyDecimalPlaces ?? 3;

  // Get all active employees
  const employees = await db.employee.findMany({
    where: {
      companySlug: data.companySlug,
      isActive: true,
    },
    orderBy: { id: "asc" },
  });

  if (employees.length === 0) {
    return apiError("No active employees found for this company", 400);
  }

  // Calculate salary for each employee
  // TODO(P2-Sprint5-A): calculateNetSalary() was migrated in P2-Sprint5-B2 to
  // accept `employeeId: string` (Employee.id is a String cuid). Pass emp.id
  // directly — the previous Number() coercion produced NaN for cuids and only
  // "worked" under `db: any`.
  const payrollResults: Array<{
    employeeId: string;
    employeeName: string;
    employeeNameEn: string | null;
    civilId: string;
    salaryBreakdown: Awaited<ReturnType<typeof calculateNetSalary>>;
  }> = [];

  let totalGross = 0;
  let totalNet = 0;
  let totalDeductions = 0;
  let totalSocialInsurance = 0;

  for (const emp of employees) {
    const salaryResult = await calculateNetSalary(emp.id, country, data.month);
    payrollResults.push({
      employeeId: emp.id,
      employeeName: emp.name,
      employeeNameEn: emp.nameEn,
      // Employee.civilId restored (P3)
      civilId: emp.civilId ?? "",
      salaryBreakdown: salaryResult,
    });

    totalGross += num(salaryResult.grossSalary, decimals);
    totalNet += num(salaryResult.netSalary, decimals);
    totalDeductions += num(salaryResult.totalDeductions, decimals);
    totalSocialInsurance += num(salaryResult.socialInsurance.employeePortion, decimals);
  }

  // Create/update Salary records for each employee
  for (const result of payrollResults) {
    const existingSalary = await db.hRSalary.findFirst({
      where: {
        employeeId: result.employeeId,
        month: data.month,
        // HRSalary.companySlug restored (P3)
        companySlug: data.companySlug,
      },
    });

    if (existingSalary) {
      await db.hRSalary.update({
        where: { id: existingSalary.id },
        // HRSalary.baseSalary/netSalary restored (P3); allowances/bonus/deductions
        // still absent — `amount` still required so netSalary mirrors it.
        data: {
          baseSalary: result.salaryBreakdown.basicSalary,
          netSalary: result.salaryBreakdown.netSalary,
          amount: result.salaryBreakdown.netSalary,
        },
      });
    } else {
      await db.hRSalary.create({
        data: {
          // HRSalary.companySlug restored (P3)
          companySlug: data.companySlug,
          employeeId: result.employeeId,
          month: data.month,
          baseSalary: result.salaryBreakdown.basicSalary,
          netSalary: result.salaryBreakdown.netSalary,
          amount: result.salaryBreakdown.netSalary,
        },
      });
    }
  }

  await logAudit({
    userEmail: user.email,
    userUid: user.uid,
    action: "calculate_payroll",
    entity: "salary",
    companySlug: data.companySlug,
    details: {
      month: data.month,
      country,
      employeeCount: employees.length,
      totalGross: num(totalGross, decimals).toFixed(decimals),
      totalNet: num(totalNet, decimals).toFixed(decimals),
      totalDeductions: num(totalDeductions, decimals).toFixed(decimals),
      totalSocialInsurance: num(totalSocialInsurance, decimals).toFixed(decimals),
    },
  });

  return apiOk({
    month: data.month,
    country,
    currency: config?.currency || "KWD",
    employeeCount: employees.length,
    payroll: payrollResults,
    totals: {
      totalGross: num(totalGross, decimals).toFixed(decimals),
      totalNet: num(totalNet, decimals).toFixed(decimals),
      totalDeductions: num(totalDeductions, decimals).toFixed(decimals),
      totalSocialInsurance: num(totalSocialInsurance, decimals).toFixed(decimals),
    },
  }, 201);
});

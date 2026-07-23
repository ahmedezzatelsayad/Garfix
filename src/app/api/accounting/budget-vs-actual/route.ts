/**
 * /api/accounting/budget-vs-actual
 * GET: Budget vs actual (?companySlug=X&fiscalYear=2024&periodName=Q1)
 */
import { NextRequest, NextResponse } from "next/server";
import { requirePermissionForCompany } from "@/lib/middleware";
import { apiError, withErrorHandler } from "@/lib/api";
import { getBudgetVsActual } from "@/lib/accounting/financial-dashboard";

export const GET = withErrorHandler(async (req: NextRequest) => {
  const sp = req.nextUrl.searchParams;
  const companySlug = sp.get("companySlug");
  if (!companySlug) return apiError("companySlug مطلوب", 400);

  const fiscalYearStr = sp.get("fiscalYear");
  if (!fiscalYearStr) return apiError("fiscalYear مطلوب", 400);
  const fiscalYear = parseInt(fiscalYearStr, 10);
  if (isNaN(fiscalYear)) return apiError("fiscalYear يجب أن يكون رقم صحيح", 400);

  const periodName = sp.get("periodName") || `${fiscalYearStr}`;
  if (!periodName) return apiError("periodName مطلوب", 400);

  const access = await requirePermissionForCompany(req, "finance_access", companySlug);
  if ("error" in access) return access.error;

  const result = await getBudgetVsActual(companySlug, fiscalYear, periodName);
  if (!result.ok) return apiError(result.error || "فشل حساب الميزانية مقابل الفعلي", 404);

  return NextResponse.json(result.result);
});

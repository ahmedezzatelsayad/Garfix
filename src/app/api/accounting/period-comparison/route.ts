/**
 * /api/accounting/period-comparison
 * GET: Period comparison (?companySlug=X&periods=2024-01,2024-02,2024-03)
 */
import { NextRequest, NextResponse } from "next/server";
import { requirePermissionForCompany } from "@/lib/middleware";
import { apiError, withErrorHandler } from "@/lib/api";
import { getPeriodComparison } from "@/lib/accounting/financial-dashboard";

export const GET = withErrorHandler(async (req: NextRequest) => {
  const sp = req.nextUrl.searchParams;
  const companySlug = sp.get("companySlug");
  if (!companySlug) return apiError("companySlug مطلوب", 400);

  const access = await requirePermissionForCompany(req, "finance_access", companySlug);
  if ("error" in access) return access.error;

  const periodsStr = sp.get("periods");
  if (!periodsStr) return apiError("periods مطلوب (فصل بفاصلة: 2024-01,2024-02,2024-03)", 400);

  const periods = periodsStr.split(",").map((p) => p.trim()).filter(Boolean);
  if (periods.length < 2) return apiError("يجب تقديم فترتين أو أكثر", 400);

  const result = await getPeriodComparison(companySlug, periods);
  if (!result.ok) return apiError(result.error || "فشل مقارنة الفترات", 500);

  return NextResponse.json(result.result);
});

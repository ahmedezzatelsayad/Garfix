/**
 * /api/accounting/financial-dashboard
 * GET: Dashboard metrics (?companySlug=X&from=YYYY-MM-DD&to=YYYY-MM-DD)
 */
import { NextRequest, NextResponse } from "next/server";
import { requirePermissionForCompany } from "@/lib/middleware";
import { apiError, withErrorHandler } from "@/lib/api";
import { getDashboardMetrics } from "@/lib/accounting/financial-dashboard";

export const GET = withErrorHandler(async (req: NextRequest) => {
  const sp = req.nextUrl.searchParams;
  const companySlug = sp.get("companySlug");
  if (!companySlug) return apiError("companySlug مطلوب", 400);

  const access = await requirePermissionForCompany(req, "finance_access", companySlug);
  if ("error" in access) return access.error;

  const from = sp.get("from") || new Date(new Date().getFullYear(), 0, 1).toISOString().slice(0, 10);
  const to = sp.get("to") || new Date().toISOString().slice(0, 10);

  const result = await getDashboardMetrics(companySlug, from, to);
  if (!result.ok) return apiError(result.error || "فشل حساب مقاييس لوحة المعلومات", 500);

  return NextResponse.json({
    period: { from, to },
    metrics: result.metrics,
  });
});

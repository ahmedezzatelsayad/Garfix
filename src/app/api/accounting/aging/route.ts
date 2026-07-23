/**
 * /api/accounting/aging
 * GET — Aging report for AR or AP
 * ?companySlug=X&direction=receivable|payable&asOfDate=YYYY-MM-DD
 */
import { NextRequest, NextResponse } from "next/server";
import { requirePermissionForCompany, hasPermission } from "@/lib/middleware";
import { resolveAuth, assertCompanyAccess, hasUnrestrictedScope } from "@/lib/auth";
import { apiError, withErrorHandler } from "@/lib/api";
import { calculateAging } from "@/lib/accounting/ar-ap";

export const GET = withErrorHandler(async (req: NextRequest) => {
  const result = await resolveAuth(req);
  if (!result.ok || !result.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!hasPermission(result.user, "finance_access")) {
    return NextResponse.json({ error: "ليس لديك صلاحية: finance_access" }, { status: 403 });
  }

  const sp = req.nextUrl.searchParams;
  const companySlug = sp.get("companySlug");
  if (!companySlug) return apiError("companySlug is required", 400);

  const direction = sp.get("direction") || "receivable";
  if (direction !== "receivable" && direction !== "payable") {
    return apiError("direction must be 'receivable' or 'payable'", 400);
  }

  if (!assertCompanyAccess(result.user, companySlug)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const asOfDate = sp.get("asOfDate") || null;

  try {
    const agingResult = await calculateAging(companySlug, direction as "receivable" | "payable", asOfDate);
    return NextResponse.json(agingResult);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return apiError(message, 500);
  }
});

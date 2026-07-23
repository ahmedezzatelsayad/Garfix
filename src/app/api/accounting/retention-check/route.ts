/**
 * /api/accounting/retention-check
 * GET — Retention compliance check (companySlug)
 */
import { NextRequest, NextResponse } from "next/server";
import { requirePermissionForCompany } from "@/lib/middleware";
import { checkRetentionCompliance } from "@/lib/accounting/tax-compliance";
import { apiError, withErrorHandler } from "@/lib/api";

export const GET = withErrorHandler(async (req: NextRequest) => {
  const sp = req.nextUrl.searchParams;
  const companySlug = sp.get("companySlug");
  if (!companySlug) return apiError("companySlug مطلوب", 400);

  const access = await requirePermissionForCompany(req, "finance_access", companySlug);
  if ("error" in access) return access.error;

  const results = await checkRetentionCompliance(companySlug);
  return NextResponse.json({ compliance: results });
});

/**
 * /api/trial-summary — ملخص التجربة للعداد المرئي في الداشبورد.
 * GET ?companySlug=... → أيام متبقية + فواتير مستخدمة/الحد + رسائل AI مستخدمة/الحد.
 */
import { NextRequest, NextResponse } from "next/server";
import { dbTyped as db } from "@/lib/db";
import { resolveAuth, assertCompanyAccess } from "@/lib/auth";
import { withErrorHandler } from "@/lib/api";
import { getTrialSummary } from "@/lib/usageMeter";

export const GET = withErrorHandler(async (req: NextRequest) => {
  const auth = await resolveAuth(req);
  if (!auth.ok || !auth.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const companySlug = req.nextUrl.searchParams.get("companySlug") || "";
  if (!companySlug || !assertCompanyAccess(auth.user, companySlug)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const summary = await getTrialSummary(companySlug);
  return NextResponse.json({ summary });
});

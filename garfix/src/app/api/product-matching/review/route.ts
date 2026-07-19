/** GET /api/product-matching/review — list queued-for-review matches */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requirePermissionForCompany } from "@/lib/middleware";
import { apiError, withErrorHandler } from "@/lib/api";

export const GET = withErrorHandler(async (req: NextRequest) => {
  const companySlug = req.nextUrl.searchParams.get("companySlug");
  if (!companySlug) return apiError("companySlug مطلوب", 400);
  const access = await requirePermissionForCompany(req, "settings_access", companySlug);
  if ("error" in access) return access.error;

  const items = await db.productMatchAudit.findMany({
    where: { companySlug, tier: "suggested", isUndone: false },
    orderBy: { createdAt: "desc" }, take: 100,
  });
  return NextResponse.json({ items });
});

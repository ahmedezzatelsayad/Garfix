/**
 * /api/accounting/supplier-statement
 * GET — Supplier account statement
 * ?companySlug=X&supplierId=Y
 */
import { NextRequest, NextResponse } from "next/server";
import { resolveAuth, assertCompanyAccess } from "@/lib/auth";
import { hasPermission } from "@/lib/middleware";
import { apiError, withErrorHandler } from "@/lib/api";
import { getSupplierStatement } from "@/lib/accounting/ar-ap";

export const GET = withErrorHandler(async (req: NextRequest) => {
  const result = await resolveAuth(req);
  if (!result.ok || !result.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!hasPermission(result.user, "finance_access")) {
    return NextResponse.json({ error: "ليس لديك صلاحية: finance_access" }, { status: 403 });
  }

  const sp = req.nextUrl.searchParams;
  const companySlug = sp.get("companySlug");
  if (!companySlug) return apiError("companySlug is required", 400);

  const supplierId = sp.get("supplierId");
  if (!supplierId) return apiError("supplierId is required", 400);

  if (!assertCompanyAccess(result.user, companySlug)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const statement = await getSupplierStatement(companySlug, parseInt(supplierId));
    return NextResponse.json(statement);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return apiError(message, 404);
  }
});

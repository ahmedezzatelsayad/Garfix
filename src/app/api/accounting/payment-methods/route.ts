/**
 * /api/accounting/payment-methods
 * GET: Available payment methods (?companySlug=X&country=KW&amount=100)
 */
import { NextRequest, NextResponse } from "next/server";
import { requirePermissionForCompany } from "@/lib/middleware";
import { apiError, withErrorHandler } from "@/lib/api";
import { getAvailablePaymentMethods } from "@/lib/accounting/local-payment-rails";

export const GET = withErrorHandler(async (req: NextRequest) => {
  const sp = req.nextUrl.searchParams;
  const companySlug = sp.get("companySlug");
  if (!companySlug) return apiError("companySlug مطلوب", 400);

  const access = await requirePermissionForCompany(req, "finance_access", companySlug);
  if ("error" in access) return access.error;

  const country = sp.get("country") || "KW";
  const amountStr = sp.get("amount") || "0";
  const amount = parseFloat(amountStr);
  if (isNaN(amount) || amount < 0) return apiError("amount يجب أن يكون رقم غير سالب", 400);

  const result = await getAvailablePaymentMethods(companySlug, country, amount);
  if (!result.ok) return apiError(result.error || "فشل جلب طرق الدفع", 400);

  return NextResponse.json({ methods: result.methods });
});

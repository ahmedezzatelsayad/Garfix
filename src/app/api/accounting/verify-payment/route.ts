/**
 * /api/accounting/verify-payment
 * POST: Verify payment (companySlug, transactionId)
 */
import { NextRequest, NextResponse } from "next/server";
import { requirePermissionForCompany } from "@/lib/middleware";
import { logAudit } from "@/lib/audit";
import { apiError, withErrorHandler, parseJsonBody } from "@/lib/api";
import { verifyPayment } from "@/lib/accounting/local-payment-rails";
import { z } from "zod";

const VerifyPaymentSchema = z.object({
  companySlug: z.string().min(1),
  transactionId: z.number().int(),
});

export const POST = withErrorHandler(async (req: NextRequest) => {
  const body = await parseJsonBody(req);
  const parsed = VerifyPaymentSchema.safeParse(body);
  if (!parsed.success) return apiError(parsed.error.issues[0]?.message || "مدخلات غير صالحة", 400);

  const data = parsed.data;
  const access = await requirePermissionForCompany(req, "finance_access", data.companySlug);
  if ("error" in access) return access.error;
  const user = access.user;

  const result = await verifyPayment(data.companySlug, data.transactionId, user.email);

  if (!result.ok) return apiError(result.error || "فشل التحقق من الدفع", 400);

  await logAudit({
    userEmail: user.email,
    userUid: user.uid,
    action: "verify_payment",
    entity: "payment_transaction",
    entityId: data.transactionId,
    companySlug: data.companySlug,
    details: { transactionId: data.transactionId, status: result.status },
  });

  return NextResponse.json({ ok: true, status: result.status });
});

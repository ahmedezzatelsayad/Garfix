/**
 * /api/accounting/initiate-payment
 * POST: Initiate local payment (companySlug, paymentMethodId, amount, currency, invoiceId)
 */
import { NextRequest, NextResponse } from "next/server";
import { requirePermissionForCompany } from "@/lib/middleware";
import { logAudit } from "@/lib/audit";
import { apiError, withErrorHandler, parseJsonBody } from "@/lib/api";
import { initiateLocalPayment } from "@/lib/accounting/local-payment-rails";
import { z } from "zod";

const InitiatePaymentSchema = z.object({
  companySlug: z.string().min(1),
  paymentMethodId: z.string().min(1),
  amount: z.union([z.number(), z.string()]),
  currency: z.string().default("KWD"),
  invoiceId: z.number().int().optional(),
});

export const POST = withErrorHandler(async (req: NextRequest) => {
  const body = await parseJsonBody(req);
  const parsed = InitiatePaymentSchema.safeParse(body);
  if (!parsed.success) return apiError(parsed.error.issues[0]?.message || "مدخلات غير صالحة", 400);

  const data = parsed.data;
  const access = await requirePermissionForCompany(req, "finance_access", data.companySlug);
  if ("error" in access) return access.error;
  const user = access.user;

  const result = await initiateLocalPayment(
    data.companySlug,
    data.paymentMethodId,
    String(data.amount),
    data.currency,
    data.invoiceId || null,
    user.email,
  );

  if (!result.ok) return apiError(result.error || "فشل بدء الدفع", 400);

  await logAudit({
    userEmail: user.email,
    userUid: user.uid,
    action: "initiate_payment",
    entity: "payment_transaction",
    companySlug: data.companySlug,
    details: {
      paymentMethodId: data.paymentMethodId,
      amount: String(data.amount),
      currency: data.currency,
      invoiceId: data.invoiceId,
    },
  });

  return NextResponse.json({
    ok: true,
    transaction: result.transaction,
    checkoutUrl: result.checkoutUrl,
  }, { status: 201 });
});

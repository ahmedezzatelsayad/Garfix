/**
 * /api/saas/payments/initiate
 * POST — initiate a MyFatoorah payment for a subscription upgrade
 *
 * Flow:
 *   1. Validate the user is authenticated and has an active company
 *   2. Look up the plan price
 *   3. Call MyFatoorah InitiatePayment → ExecutePayment
 *   4. Store the transaction as PaymentTransaction (status=pending)
 *   5. Return the payment URL for the frontend to redirect to
 *
 * Security: MyFatoorah base_url is validated at connect time (SSRF protection).
 *           This route only reads the stored, validated config.
 */
import { NextRequest, NextResponse } from "next/server";
import { resolveAuth } from "@/lib/auth";
import { withErrorHandler, apiError } from "@/lib/api";
import { db } from "@/lib/db";
import { getIntegrationConfig } from "@/lib/integrations/registry";
import { logger } from "@/lib/logger";
import { DEFAULT_PLANS, type PlanDef } from "@/lib/plans";
import { z } from "zod";

const InitiateSchema = z.object({
  planKey: z.string().min(1),
  billingPeriod: z.enum(["monthly", "yearly"]).optional().default("monthly"),
  currencyCode: z.string().length(3).optional().default("KWD"),
});

async function callMyFatoorah(
  baseUrl: string,
  apiKey: string,
  path: string,
  body?: Record<string, unknown>,
): Promise<{ ok: boolean; data?: any; error?: string }> {
  try {
    const url = `${baseUrl.replace(/\/+$/, "")}${path}`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json();
    if (!res.ok) {
      return { ok: false, error: data?.Message || `MyFatoorah error ${res.status}` };
    }
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Network error" };
  }
}

export const POST = withErrorHandler(async (req: NextRequest) => {
  const authResult = await resolveAuth(req);
  if (!authResult.ok || !authResult.user) {
    return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
  }
  const user = authResult.user;

  const body = await req.json().catch(() => ({}));
  const parsed = InitiateSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(parsed.error.issues[0]?.message || "مدخلات غير صالحة", 400);
  }
  const { planKey, billingPeriod, currencyCode } = parsed.data;

  // 1. Look up the plan
  const plan = DEFAULT_PLANS[planKey as keyof typeof DEFAULT_PLANS] as PlanDef | undefined;
  if (!plan) return apiError("باقة غير معروفة", 400);
  if (plan.priceMonthly === 0) return apiError("الباقة المجانية لا تحتاج دفع", 400);

  const amount = billingPeriod === "yearly" ? (plan.priceMonthly * 12 * 0.8) : plan.priceMonthly; // 20% yearly discount

  // 2. Get MyFatoorah credentials
  const cfg = await getIntegrationConfig("myfatoorah");
  if (!cfg?.api_key || !cfg?.base_url) {
    return apiError("بوابة الدفع MyFatoorah غير مُهيّأة. تواصل مع المؤسس.", 503);
  }

  const companyName = user.companies?.[0] || "unknown";

  // 3. Initiate Payment — get available payment methods
  const initiateResult = await callMyFatoorah(
    cfg.base_url,
    cfg.api_key,
    "/api/v2/InitiatePayment",
    {
      InvoiceAmount: amount,
      CurrencyIso: currencyCode,
    },
  );

  if (!initiateResult.ok) {
    logger.error("[payments:initiate] InitiatePayment failed", { error: initiateResult.error });
    return apiError(`فشل بدء الدفع: ${initiateResult.error}`, 502);
  }

  // Pick the first available payment method
  const paymentMethods = initiateResult.data?.Data?.PaymentMethods;
  const methodId = Array.isArray(paymentMethods) && paymentMethods.length > 0
    ? paymentMethods[0].PaymentMethodId
    : 1; // fallback to card

  // 4. Execute Payment
  const executeResult = await callMyFatoorah(
    cfg.base_url,
    cfg.api_key,
    "/api/v2/ExecutePayment",
    {
      InvoiceValue: amount,
      CurrencyIso: currencyCode,
      PaymentMethodId: methodId,
      CustomerName: user.email.split("@")[0],
      DisplayCurrencyIso: currencyCode,
      MobileCountryCode: "+965",
      CustomerMobile: "",
      CustomerEmail: user.email,
      CallBackUrl: `${process.env.APP_URL || "http://localhost:3000"}/api/saas/payments/callback`,
      ErrorUrl: `${process.env.APP_URL || "http://localhost:3000"}/api/saas/payments/callback?error=1`,
      Language: "ar",
      CustomerReference: user.uid,
      InvoiceItems: [
        {
          ItemName: `GARFIX ${plan.name} — ${billingPeriod === "yearly" ? "سنوي" : "شهري"}`,
          Quantity: 1,
          UnitPrice: amount,
        },
      ],
    },
  );

  if (!executeResult.ok) {
    logger.error("[payments:initiate] ExecutePayment failed", { error: executeResult.error });
    return apiError(`فشل تنفيذ الدفع: ${executeResult.error}`, 502);
  }

  const invoiceId = executeResult.data?.Data?.InvoiceId;
  const paymentUrl = executeResult.data?.Data?.PaymentURL;

  if (!paymentUrl) {
    return apiError("لم يتم الحصول على رابط الدفع من MyFatoorah", 502);
  }

  // 5. Store transaction record — matching PaymentTransaction schema fields
  await db.paymentTransaction.create({
    data: {
      companySlug: companyName,
      plan: planKey,
      method: "myfatoorah_card",
      provider: "myfatoorah",
      amount: String(amount),
      currency: currencyCode,
      status: "pending",
      providerPaymentId: String(invoiceId || ""),
      checkoutUrl: paymentUrl,
      createdBy: user.uid,
      metadata: JSON.stringify({
        billingPeriod,
        paymentMethodId: methodId,
        initiatedAt: new Date().toISOString(),
      }),
    },
  });

  logger.info("[payments:initiate] payment initiated", {
    user: user.uid,
    plan: planKey,
    amount,
    invoiceId,
  });

  return NextResponse.json({
    ok: true,
    paymentUrl,
    invoiceId,
    amount,
    currency: currencyCode,
  });
});

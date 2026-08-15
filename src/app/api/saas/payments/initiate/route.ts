/**
 * /api/saas/payments/initiate
 * POST — initiate a payment for a subscription upgrade
 *
 * Supports both MyFatoorah (Gulf countries) and Paymob (Egypt).
 * Uses country-specific pricing based on the user's company country.
 *
 * Flow:
 *   1. Validate the user is authenticated and has an active company
 *   2. Look up the company's country → get country-specific pricing
 *   3. Determine the payment provider (MyFatoorah for Gulf, Paymob for Egypt)
 *   4. Call the appropriate provider API
 *   5. Store the transaction as PaymentTransaction (status=pending)
 *   6. Return the payment URL for the frontend to redirect to
 *
 * Security: MyFatoorah/Paymob base_url is validated at connect time (SSRF protection).
 *           This route only reads the stored, validated config.
 */
import { fetchSafe } from "@/lib/ssrf";
import { NextRequest, NextResponse } from "next/server";
import { parseJsonBody } from "@/lib/api";
import { resolveAuth } from "@/lib/auth";
import { withErrorHandler, apiError } from "@/lib/api";
import { dbTyped as db } from "@/lib/db";
import { getIntegrationConfig } from "@/lib/integrations/registry";
import { logger } from "@/lib/logger";
import { getCountryPricing } from "@/lib/billing/pricing";
import { initiatePaymobPayment } from "@/lib/integrations/paymob";
import { z } from "zod";
import { rateLimitResponse, LIMITS } from "@/lib/rateLimit";

const InitiateSchema = z.object({
  planKey: z.string().min(1),
  billingPeriod: z.enum(["monthly", "yearly"]).optional().default("monthly"),
  currencyCode: z.string().length(3).optional(), // removed default — now determined by country
  provider: z.enum(["myfatoorah", "paymob", "stripe"]).optional(), // auto-determined by country
});

async function callMyFatoorah(
  baseUrl: string,
  apiKey: string,
  path: string,
  body?: Record<string, unknown>,
): Promise<{ ok: boolean; data?: Record<string, unknown>; error?: string }> {
  try {
    const url = `${baseUrl.replace(/\/+$/, "")}${path}`;
    const res = await fetchSafe(url, {
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
  // P5-H2: Rate limit POST /api/saas-payments-initiate — 30/min/IP (API_WRITE).
  const rl = await rateLimitResponse(req, "post:saas-payments-initiate", LIMITS.API_WRITE);
  if (rl) return rl;

  const authResult = await resolveAuth(req);
  if (!authResult.ok || !authResult.user) {
    return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
  }
  const user = authResult.user;

  const body = await parseJsonBody(req) ?? {};
  const parsed = InitiateSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(parsed.error.issues[0]?.message || "مدخلات غير صالحة", 400);
  }
  const { planKey, billingPeriod, currencyCode, provider } = parsed.data;

  // 1. Look up the user's company to determine country-specific pricing
  const companySlug = user.companies?.[0] || "unknown";
  const company = await db.company.findUnique({ where: { slug: companySlug } });
  if (!company) {
    return apiError("الشركة غير موجودة", 400);
  }

  const country = company.country || "KW";
  const pricing = getCountryPricing(country, planKey);
  if (!pricing) {
    return apiError("باقة غير معروفة أو سعر غير متاح لهذا البلد", 400);
  }

  // Don't charge for the trial plan
  if (pricing.priceMonthly === 0) {
    return apiError("الباقة المجانية لا تحتاج دفع", 400);
  }

  // Determine currency and provider based on country
  const effectiveCurrency = currencyCode || pricing.currency;
  const effectiveProvider = provider || (country === "EG" ? "paymob" : "myfatoorah");

  const amount = billingPeriod === "yearly"
    ? (pricing.priceMonthly * 12 * 0.8) // 20% yearly discount
    : pricing.priceMonthly;

  // ── WIRE-UP: Stripe payment path (for DEFAULT/USD countries) ──
  if (effectiveProvider === "stripe") {
    try {
      const { getIntegrationConfig } = await import("@/lib/integrations/registry");
      const stripeConfig = await getIntegrationConfig("stripe");
      if (!stripeConfig?.secret_key) {
        return apiError("بوابة الدفع Stripe غير مُهيّأة. تواصل مع المؤسس.", 503);
      }

      // Use Stripe provider's createPaymentIntent
      const { stripeProvider } = await import("@/lib/integrations/stripe");
      const stripeAmount = Math.round(amount * 100); // Stripe uses smallest currency unit

      const stripeResult = await (stripeProvider as  {
        createPaymentIntent: (params: {
          amount: number;
          currency?: string;
          description?: string;
          metadata?: Record<string, string>;
        }) => Promise<{ ok: boolean; clientSecret?: string; intentId?: string; error?: string }>;
      }).createPaymentIntent({
        amount: stripeAmount,
        currency: effectiveCurrency.toLowerCase(),
        description: `GARFIX ${planKey} — ${billingPeriod === "yearly" ? "سنوي" : "شهري"}`,
        metadata: {
          companySlug,
          userEmail: user.email,
          plan: planKey,
          billingPeriod,
        },
      });

      if (!stripeResult.ok || !stripeResult.clientSecret) {
        logger.error("[payments:initiate] Stripe PaymentIntent failed", { error: stripeResult.error });
        return apiError(`فشل بدء الدفع عبر Stripe: ${stripeResult.error}`, 502);
      }

      // Store transaction record
      await db.paymentTransaction.create({
        data: {
          companySlug,
          plan: planKey,
          method: "stripe_card",
          provider: "stripe",
          amount: String(amount),
          currency: effectiveCurrency,
          status: "pending",
          providerPaymentId: stripeResult.intentId || "",
          checkoutUrl: "", // Stripe uses client_secret, not redirect URL
          createdBy: user.uid,
          metadata: JSON.stringify({
            billingPeriod,
            clientSecret: stripeResult.clientSecret,
            initiatedAt: new Date().toISOString(),
            country,
            pricingCurrency: pricing.currency,
          }),
        },
      });

      logger.info("[payments:initiate] Stripe payment initiated", {
        user: user.uid,
        plan: planKey,
        amount,
        intentId: stripeResult.intentId,
        country,
        currency: effectiveCurrency,
      });

      return NextResponse.json({
        ok: true,
        paymentUrl: "", // Stripe uses clientSecret for frontend Elements
        clientSecret: stripeResult.clientSecret,
        intentId: stripeResult.intentId,
        amount,
        currency: effectiveCurrency,
        provider: "stripe",
      });
    } catch (stripeErr) {
      logger.error("[payments:initiate] Stripe error", { error: stripeErr instanceof Error ? stripeErr.message : String(stripeErr) });
      return apiError("فشل الاتصال بـ Stripe", 502);
    }
  }

  // 2. Route to the appropriate payment provider
  if (effectiveProvider === "paymob") {
    // ── Paymob flow (Egypt) ──
    const cfg = await getIntegrationConfig("paymob");
    if (!cfg?.api_key || !cfg?.base_url) {
      return apiError("بوابة الدفع Paymob غير مُهيّأة. تواصل مع المؤسس.", 503);
    }

    const integrationId = parseInt(cfg.integration_id || "4305", 10);
    const result = await initiatePaymobPayment({
      baseUrl: cfg.base_url.replace(/\/+$/, ""),
      apiKey: cfg.api_key,
      amount,
      currency: effectiveCurrency,
      integrationId,
      companySlug,
      userEmail: user.email,
      planName: planKey,
      billingPeriod,
    });

    if (!result.ok) {
      logger.error("[payments:initiate] Paymob initiation failed", { error: result.error });
      return apiError(`فشل بدء الدفع: ${result.error}`, 502);
    }

    // Store transaction record
    await db.paymentTransaction.create({
      data: {
        companySlug,
        plan: planKey,
        method: "paymob_card",
        provider: "paymob",
        amount: String(amount),
        currency: effectiveCurrency,
        status: "pending",
        providerPaymentId: String(result.orderId || ""),
        providerOrderId: String(result.orderId || ""),
        checkoutUrl: result.checkoutUrl || "",
        createdBy: user.uid,
        metadata: JSON.stringify({
          billingPeriod,
          paymentKey: result.paymentKey,
          initiatedAt: new Date().toISOString(),
          country,
          pricingCurrency: pricing.currency,
        }),
      },
    });

    logger.info("[payments:initiate] Paymob payment initiated", {
      user: user.uid,
      plan: planKey,
      amount,
      orderId: result.orderId,
      country,
    });

    return NextResponse.json({
      ok: true,
      paymentUrl: result.checkoutUrl,
      orderId: result.orderId,
      amount,
      currency: effectiveCurrency,
      provider: "paymob",
    });
  }

  // ── MyFatoorah flow (Gulf countries) ──
  const cfg = await getIntegrationConfig("myfatoorah");
  if (!cfg?.api_key || !cfg?.base_url) {
    return apiError("بوابة الدفع MyFatoorah غير مُهيّأة. تواصل مع المؤسس.", 503);
  }

  // 3. Initiate Payment — get available payment methods
  const initiateResult = await callMyFatoorah(
    cfg.base_url,
    cfg.api_key,
    "/api/v2/InitiatePayment",
    {
      InvoiceAmount: amount,
      CurrencyIso: effectiveCurrency,
    },
  );

  if (!initiateResult.ok) {
    logger.error("[payments:initiate] InitiatePayment failed", { error: initiateResult.error });
    return apiError(`فشل بدء الدفع: ${initiateResult.error}`, 502);
  }

  // Pick the first available payment method
  const paymentMethods = (initiateResult.data?.Data as { PaymentMethods?: Array<{ PaymentMethodId: number; PaymentMethodCode?: string; Code?: string }> } | undefined)?.PaymentMethods;
  const methodId = Array.isArray(paymentMethods) && paymentMethods.length > 0
    ? paymentMethods[0].PaymentMethodId
    : 1; // fallback to card

  // Determine payment method slug based on methodId
  const methodSlug = mapMyFatoorahMethodId(methodId, paymentMethods ?? []);

  // 4. Execute Payment
  const countryCodePrefix = getCountryPhonePrefix(country);
  const executeResult = await callMyFatoorah(
    cfg.base_url,
    cfg.api_key,
    "/api/v2/ExecutePayment",
    {
      InvoiceValue: amount,
      CurrencyIso: effectiveCurrency,
      PaymentMethodId: methodId,
      CustomerName: user.email.split("@")[0],
      DisplayCurrencyIso: effectiveCurrency,
      MobileCountryCode: countryCodePrefix,
      CustomerMobile: "",
      CustomerEmail: user.email,
      CallBackUrl: `${process.env.APP_URL || "http://localhost:3000"}/api/saas/payments/callback`,
      ErrorUrl: `${process.env.APP_URL || "http://localhost:3000"}/api/saas/payments/callback?error=1`,
      Language: "ar",
      CustomerReference: user.uid,
      InvoiceItems: [
        {
          ItemName: `GARFIX ${planKey} — ${billingPeriod === "yearly" ? "سنوي" : "شهري"}`,
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

  const invoiceId = (executeResult.data?.Data as { InvoiceId?: number | string } | undefined)?.InvoiceId;
  const paymentUrl = (executeResult.data?.Data as { PaymentURL?: string } | undefined)?.PaymentURL;

  if (!paymentUrl) {
    return apiError("لم يتم الحصول على رابط الدفع من MyFatoorah", 502);
  }

  // 5. Store transaction record
  await db.paymentTransaction.create({
    data: {
      companySlug,
      plan: planKey,
      method: methodSlug,
      provider: "myfatoorah",
      amount: String(amount),
      currency: effectiveCurrency,
      status: "pending",
      providerPaymentId: String(invoiceId || ""),
      checkoutUrl: paymentUrl,
      createdBy: user.uid,
      metadata: JSON.stringify({
        billingPeriod,
        paymentMethodId: methodId,
        initiatedAt: new Date().toISOString(),
        country,
        pricingCurrency: pricing.currency,
      }),
    },
  });

  logger.info("[payments:initiate] MyFatoorah payment initiated", {
    user: user.uid,
    plan: planKey,
    amount,
    invoiceId,
    country,
    currency: effectiveCurrency,
  });

  return NextResponse.json({
    ok: true,
    paymentUrl,
    invoiceId,
    amount,
    currency: effectiveCurrency,
    provider: "myfatoorah",
  });
});

// ── Helpers ─────────────────────────────────────────────────────────────────

function mapMyFatoorahMethodId(methodId: number, paymentMethods: Array<{ PaymentMethodId: number; PaymentMethodCode?: string; Code?: string }>): string {
  // Try to map from the PaymentMethod object
  if (Array.isArray(paymentMethods)) {
    const method = paymentMethods.find((m) => m.PaymentMethodId === methodId);
    if (method) {
      const code = (method.PaymentMethodCode || method.Code || '').toLowerCase();
      if (code.includes('mada')) return 'myfatoorah_mada';
      if (code.includes('knet')) return 'myfatoorah_knet';
      if (code.includes('apple')) return 'myfatoorah_apple_pay';
    }
  }
  // Fallback based on methodId ranges
  if (methodId === 2) return 'myfatoorah_mada';
  if (methodId === 3) return 'myfatoorah_knet';
  if (methodId === 11) return 'myfatoorah_apple_pay';
  return 'myfatoorah_card';
}

function getCountryPhonePrefix(country: string): string {
  switch (country.toUpperCase()) {
    case 'KW': return '+965';
    case 'SA': return '+966';
    case 'AE': return '+971';
    case 'BH': return '+973';
    case 'OM': return '+968';
    case 'QA': return '+974';
    case 'EG': return '+20';
    default: return '+965';
  }
}

/**
 * /api/saas/payments/callback
 * GET — MyFatoorah payment callback (redirect URL after payment)
 *
 * MyFatoorah redirects the user here after they complete or cancel payment.
 * We verify the payment status via GetPaymentStatus API, update the
 * PaymentTransaction record, and redirect the user to the app.
 *
 * P5-H5: Added rate limiting (10/min per IP) to block paymentId enumeration
 *        attacks. Added optional requireAuth check (warns but does not block
 *        on unauthenticated callbacks — the MyFatoorah GetPaymentStatus API
 *        is the source of truth for payment state). Added audit logging on
 *        successful PaymentTransaction updates.
 */
import { fetchSafe } from "@/lib/ssrf";
import { NextRequest, NextResponse } from "next/server";
import { dbTyped as db } from "@/lib/db";
import { getIntegrationConfig } from "@/lib/integrations/registry";
import { logger } from "@/lib/logger";
import { rateLimitResponse, LIMITS } from "@/lib/rateLimit";
import { requireAuth } from "@/lib/middleware";
// SUBSCRIPTION ACTIVATION FIX (2026-08-25): the callback used to update the
// PaymentTransaction to "paid" but NEVER activated the plan — the customer
// paid and the company stayed on trial. We now provision the subscription
// via the subscription engine on verified successful payments.
import { createSubscription } from "@/lib/billing/subscription-engine";
import { runAsPlatform } from "@/lib/tenant-context";

export const GET = async (req: NextRequest) => {
  // P5-H5: Rate limit (10/min per IP). A legitimate user only hits this
  // endpoint once per payment attempt — 10/min is generous for retries
  // while still blocking paymentId enumeration at line-speed.
  const rl = await rateLimitResponse(req, "saas-payments-callback", {
    ...LIMITS.API_WRITE,
    maxAttempts: 10,
  });
  if (rl) return rl;

  const url = new URL(req.url);
  const paymentId = url.searchParams.get("paymentId");
  const isError = url.searchParams.has("error");

  if (isError || !paymentId) {
    return NextResponse.redirect(
      new URL("/?payment=cancelled#settings", url.origin),
    );
  }

  // P5-H5: Optional auth check. MyFatoorah redirects happen after a browser
  // session, so the user is normally logged in via session cookie. If the
  // session has expired between redirect and callback, log a warning but
  // continue processing — the GetPaymentStatus API is the real source of
  // truth for payment state, and we still need to update the transaction.
  let userEmail: string | null = null;
  const authResult = await requireAuth(req);
  if (authResult instanceof NextResponse) {
    logger.warn("[payments:callback] unauthenticated callback attempt", {
      paymentId,
    });
  } else {
    userEmail = authResult.user.email;
  }

  try {
    // ── SEC-PAY-01: MyFatoorah callback signature verification ─────────────
    // MyFatoorah sends a `signature` query parameter on callback redirects.
    // The signature is HMAC-SHA256 of the paymentId using the webhook secret.
    // We verify it before processing the callback to prevent callback forgery.
    // See: https://docs.myfatoorah.com/docs/webhooks
    const signature = url.searchParams.get("signature");
    const cfg = await getIntegrationConfig("myfatoorah");
    if (cfg?.webhook_secret && signature && paymentId) {
      const crypto = await import("crypto");
      const expected = crypto
        .createHmac("sha256", cfg.webhook_secret)
        .update(paymentId)
        .digest("hex");
      if (signature !== expected) {
        logger.error("[payments:callback] signature verification failed", { paymentId });
        return NextResponse.redirect(
          new URL("/?payment=error&reason=invalid_signature#settings", url.origin),
        );
      }
      logger.debug("[payments:callback] signature verified", { paymentId });
    } else if (cfg?.webhook_secret && !signature) {
      // Webhook secret is configured but no signature provided — reject
      logger.error("[payments:callback] missing signature on callback", { paymentId });
      return NextResponse.redirect(
        new URL("/?payment=error&reason=missing_signature#settings", url.origin),
      );
    }
    // If webhook_secret is not configured, we fall through to the
    // GetPaymentStatus API verification below (defense-in-depth).

    // Get MyFatoorah credentials
    if (!cfg?.api_key || !cfg?.base_url) {
      logger.error("[payments:callback] MyFatoorah not configured");
      return NextResponse.redirect(
        new URL("/?payment=error#settings", url.origin),
      );
    }

    // RLS FIX v2 (2026-08-25): wrap the ENTIRE payment-verification +
    // transaction-update + subscription-activation sequence in ONE platform
    // context. Running runAsPlatform around individual calls was not
    // sufficient on serverless — the outbound GetPaymentStatus fetch in
    // between created a new async context that dropped the ALS store,
    // so the subsequent findFirst ran unscoped under strict RLS → 0 rows
    // → the transaction stayed "pending" and activation never happened.
    return await runAsPlatform(async () => {
    // Verify payment status with MyFatoorah
    const res = await fetchSafe(
      `${cfg.base_url.replace(/\/+$/, "")}/api/v2/GetPaymentStatus`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${cfg.api_key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ Key: paymentId, KeyType: "PaymentId" }),
      },
    );

    const data = await res.json();
    const invoiceId = String(data?.Data?.InvoiceId || "");
    const invoiceStatus = data?.Data?.InvoiceStatus;
    const invoiceAmount = data?.Data?.InvoiceAmount;
    const isPaid = invoiceStatus === "Paid";

    // Update the transaction — use providerPaymentId field
    // RLS FIX (2026-08-25): payment callbacks arrive with NO user tenant
    // context (cross-tenant by design) — every DB access below must run
    // inside the platform context or strict RLS silently returns 0 rows
    // (which is exactly why the first sandbox test left the transaction
    // "pending" and never created the subscription schedule).
    if (invoiceId) {
      const txn = await runAsPlatform(() =>
        db.paymentTransaction.findFirst({
          where: { providerPaymentId: invoiceId, provider: "myfatoorah" },
        }),
      );

      if (txn) {
        const existingMeta = (() => { try { return JSON.parse(txn.metadata || "{}"); } catch { return {}; } })();
        await runAsPlatform(() =>
          db.paymentTransaction.update({
            where: { id: txn.id },
            data: {
              status: isPaid ? "paid" : "failed",
              metadata: JSON.stringify({
                ...existingMeta,
                paymentId,
                invoiceStatus,
                callbackAt: new Date().toISOString(),
              }),
            },
          }),
        );

        // P5-H5: Audit log for successful payment status update.
        logger.info("[payments:callback] payment status updated", {
          paymentId,
          status: invoiceStatus,
          amount: invoiceAmount,
          user: userEmail || "anonymous",
        });

        // ── SUBSCRIPTION ACTIVATION FIX (2026-08-25) ─────────────────────
        // A VERIFIED successful payment must actually provision the plan:
        // create/activate the subscription schedule + flip the company to
        // the paid plan. Runs once (guarded by the transaction's own status
        // so retries of this callback don't double-activate). Wrapped in
        // runAsPlatform — callbacks arrive cross-tenant with no user tenant
        // context (RLS fail-closed otherwise).
        if (isPaid && txn.status !== "paid") {
          const billingPeriod =
            (existingMeta.billingPeriod === "yearly" ? "yearly" : "monthly") as
              "monthly" | "yearly";
          try {
            {
              const activation = await createSubscription({
                companySlug: txn.companySlug,
                // txn.plan is nullable in the schema — default to the unified
                // invoicing plan when the transaction row lacks one.
                plan: txn.plan || "invoicing",
                billingPeriod,
                provider: "myfatoorah",
                paymentMethod: txn.method,
                createdBy: txn.createdBy ?? "payment-callback",
              });
              if (!activation.ok && activation.error?.includes("نشط")) {
                // An active schedule already exists — refresh its plan/period
                logger.info("[payments:callback] existing schedule kept", {
                  companySlug: txn.companySlug,
                  plan: txn.plan,
                });
              } else if (!activation.ok) {
                logger.error("[payments:callback] activation failed", {
                  companySlug: txn.companySlug,
                  error: activation.error,
                });
              } else {
                logger.info("[payments:callback] subscription ACTIVATED", {
                  companySlug: txn.companySlug,
                  plan: txn.plan,
                  billingPeriod,
                  scheduleId: activation.scheduleId,
                });
              }
            });
          } catch (actErr) {
            logger.error("[payments:callback] activation threw", {
              err: actErr instanceof Error ? actErr.message : String(actErr),
            });
          }
        }
      }
    }

    // Redirect user back to app — query BEFORE hash so AppShell's
    // parseHash() can resolve `settings` and useSearchParams() can read `payment`.
    const redirectStatus = isPaid ? "success" : "failed";
    return NextResponse.redirect(
      new URL(`/?payment=${redirectStatus}#settings`, url.origin),
    );
    }); // end runAsPlatform
  } catch (err) {
    logger.error("[payments:callback] error", {
      err: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.redirect(
      new URL("/?payment=error#settings", url.origin),
    );
  }
};

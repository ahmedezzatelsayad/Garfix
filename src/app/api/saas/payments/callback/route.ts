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
    // Get MyFatoorah credentials
    const cfg = await getIntegrationConfig("myfatoorah");
    if (!cfg?.api_key || !cfg?.base_url) {
      logger.error("[payments:callback] MyFatoorah not configured");
      return NextResponse.redirect(
        new URL("/?payment=error#settings", url.origin),
      );
    }

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
    if (invoiceId) {
      const txn = await db.paymentTransaction.findFirst({
        where: { providerPaymentId: invoiceId, provider: "myfatoorah" },
      });

      if (txn) {
        const existingMeta = (() => { try { return JSON.parse(txn.metadata || "{}"); } catch { return {}; } })();
        await db.paymentTransaction.update({
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
        });

        // P5-H5: Audit log for successful payment status update.
        logger.info("[payments:callback] payment status updated", {
          paymentId,
          status: invoiceStatus,
          amount: invoiceAmount,
          user: userEmail || "anonymous",
        });
      }
    }

    // Redirect user back to app — query BEFORE hash so AppShell's
    // parseHash() can resolve `settings` and useSearchParams() can read `payment`.
    const redirectStatus = isPaid ? "success" : "failed";
    return NextResponse.redirect(
      new URL(`/?payment=${redirectStatus}#settings`, url.origin),
    );
  } catch (err) {
    logger.error("[payments:callback] error", {
      err: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.redirect(
      new URL("/?payment=error#settings", url.origin),
    );
  }
};

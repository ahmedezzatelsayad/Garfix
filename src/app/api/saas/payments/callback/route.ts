/**
 * /api/saas/payments/callback
 * GET — MyFatoorah payment callback (redirect URL after payment)
 *
 * MyFatoorah redirects the user here after they complete or cancel payment.
 * We verify the payment status via GetPaymentStatus API, update the
 * PaymentTransaction record, and redirect the user to the app.
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getIntegrationConfig } from "@/lib/integrations/registry";
import { logger } from "@/lib/logger";

export const GET = async (req: NextRequest) => {
  const url = new URL(req.url);
  const paymentId = url.searchParams.get("paymentId");
  const isError = url.searchParams.has("error");

  if (isError || !paymentId) {
    return NextResponse.redirect(
      new URL("/#settings?tab=billing&payment=cancelled", url.origin),
    );
  }

  try {
    // Get MyFatoorah credentials
    const cfg = await getIntegrationConfig("myfatoorah");
    if (!cfg?.api_key || !cfg?.base_url) {
      logger.error("[payments:callback] MyFatoorah not configured");
      return NextResponse.redirect(
        new URL("/#settings?tab=billing&payment=error", url.origin),
      );
    }

    // Verify payment status with MyFatoorah
    const res = await fetch(
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

        logger.info("[payments:callback] payment updated", {
          invoiceId,
          status: isPaid ? "paid" : "failed",
        });
      }
    }

    // Redirect user back to app
    const redirectStatus = isPaid ? "success" : "failed";
    return NextResponse.redirect(
      new URL(`/#settings?tab=billing&payment=${redirectStatus}`, url.origin),
    );
  } catch (err) {
    logger.error("[payments:callback] error", {
      err: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.redirect(
      new URL("/#settings?tab=billing&payment=error", url.origin),
    );
  }
};

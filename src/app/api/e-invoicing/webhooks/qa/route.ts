/**
 * /api/e-invoicing/webhooks/qa
 * POST — Qatar GTA (voluntary Peppol) inbound webhook receiver.
 *
 * Qatar does not mandate e-invoicing, but companies that opt in via a
 * Peppol Access Point receive delivery reports through this endpoint.
 *
 * Auth: AP signs requests with an X-AP-Signature header (HMAC-SHA256 using
 * the AP client secret as the key).
 *
 * Public endpoint — no auth, called by the AP server.
 */
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { readRawBody, recordReceipt, safeJsonParse, verifyHmacSignature, WebhookBodyTooLargeError } from "@/lib/e-invoicing/webhooks";
import { getIntegrationConfig } from "@/lib/integrations/registry";
import { logger } from "@/lib/logger";
import { rateLimitResponse } from "@/lib/rateLimit";

interface QaWebhookPayload {
  peppolMessageId?: string;
  documentUuid?: string;
  status?: string; // "delivered" | "rejected" | "failed"
  rejectionReason?: string;
  recipientId?: string;
  companySlug?: string;
  invoiceId?: number;
}

export async function POST(req: NextRequest) {
  // Rate limit: 200 webhooks per minute per IP (authorities retry, so be generous)
  const rl = await rateLimitResponse(req, "post:einvoice-webhook-qa", { windowMs: 60_000, maxAttempts: 200 });
  if (rl) return rl;
  let raw: string;
  try {
    raw = await readRawBody(req);
  } catch (err) {
    if (err instanceof WebhookBodyTooLargeError) {
      return NextResponse.json({ error: "Body too large" }, { status: 413 });
    }
    throw err;
  }
  const signature = req.headers.get("x-ap-signature");
  const payload = safeJsonParse<QaWebhookPayload>(raw);

  if (!payload) {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
  }

  // ─── Signature verification ───────────────────────────────────────────
  let signatureValid: boolean | null = null;
  if (signature) {
    try {
      const cfg = await getIntegrationConfig("einvoice_qa");
      const secret = cfg?.ap_client_secret || null;
      signatureValid = verifyHmacSignature(raw, signature, secret, "hex");
    } catch (err) {
      logger.warn("[webhooks:qa] signature verify failed", {
        err: err instanceof Error ? err.message : String(err),
      });
      signatureValid = false;
    }
  }

  // ─── Reject unsigned or invalid-signature webhooks (security) ───────
  // FIX #1+#16 (CRITICAL): In production, reject webhooks with missing or
  // invalid signatures. In development, allow unsigned for sandbox testing.
  const isDev = process.env.NODE_ENV === "development" || process.env.GARFIX_PREVIEW_MODE === "1";
  if (!isDev) {
    if (signature === null) {
      logger.warn("[webhooks] rejected unsigned webhook (production mode)", { endpoint: req.url });
      return NextResponse.json({ error: "Signature required" }, { status: 401 });
    }
    if (signatureValid === false) {
      logger.warn("[webhooks] rejected invalid-signature webhook", { endpoint: req.url });
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }
  }

  // ─── Map Peppol status → internal status ─────────────────────────────
  const apStatus = (payload.status || "").toLowerCase();
  const internalStatus: "accepted" | "rejected" | "pending" | "cancelled" =
    apStatus === "delivered" || apStatus === "accepted" ? "accepted" :
    apStatus === "rejected" || apStatus === "failed" ? "rejected" :
    "pending";

  const eventType = apStatus === "delivered" ? "delivery_report" : "status_update";

  // ─── Record receipt ───────────────────────────────────────────────────
  try {
    await recordReceipt({
      companySlug: payload.companySlug || "",
      invoiceId: payload.invoiceId ?? null,
      authority: "qatar_gta",
      eventType,
      externalUuid: payload.peppolMessageId || payload.documentUuid || null,
      status: internalStatus,
      rawPayload: raw,
      signatureValid,
      rejectionReason: payload.rejectionReason || null,
    });

    return NextResponse.json({ ok: true, received: true });
  } catch (err) {
    logger.error("[webhooks:qa] recordReceipt failed", {
      err: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ ok: true, endpoint: "qatar" });
}

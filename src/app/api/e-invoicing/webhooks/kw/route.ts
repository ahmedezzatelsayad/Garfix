/**
 * /api/e-invoicing/webhooks/kw
 * POST — Kuwait Ministry of Finance (Decree 10/2026) inbound webhook receiver.
 *
 * MoF sends callbacks for invoice clearance status changes. Payloads follow
 * the MoF e-invoicing API spec.
 *
 * Auth: MoF signs requests with an X-MoF-Signature header (HMAC-SHA256 using
 * the client secret as the key).
 *
 * Public endpoint — no auth, called by MoF servers.
 */
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { readRawBody, recordReceipt, safeJsonParse, verifyHmacSignature, WebhookBodyTooLargeError } from "@/lib/e-invoicing/webhooks";
import { getIntegrationConfig } from "@/lib/integrations/registry";
import { logger } from "@/lib/logger";
import { rateLimitResponse } from "@/lib/rateLimit";

interface KwWebhookPayload {
  invoiceUuid?: string;
  clearanceId?: string;
  status?: string; // "CLEARED" | "REJECTED" | "PENDING" | "CANCELLED"
  rejectionReason?: string;
  phase?: string;
  companySlug?: string;
  invoiceId?: number;
}

export async function POST(req: NextRequest) {
  // Rate limit: 200 webhooks per minute per IP (authorities retry, so be generous)
  const rl = await rateLimitResponse(req, "post:einvoice-webhook-kw", { windowMs: 60_000, maxAttempts: 200 });
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
  const signature = req.headers.get("x-mof-signature");
  const payload = safeJsonParse<KwWebhookPayload>(raw);

  if (!payload) {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
  }

  // ─── Signature verification ───────────────────────────────────────────
  let signatureValid: boolean | null = null;
  if (signature) {
    try {
      const cfg = await getIntegrationConfig("einvoice_kw");
      const secret = cfg?.client_secret || null;
      signatureValid = verifyHmacSignature(raw, signature, secret, "hex");
    } catch (err) {
      logger.warn("[webhooks:kw] signature verify failed", {
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

  // ─── Map MoF status → internal status ────────────────────────────────
  const mofStatus = (payload.status || "").toUpperCase();
  const internalStatus: "accepted" | "rejected" | "pending" | "cancelled" =
    mofStatus === "CLEARED" ? "accepted" :
    mofStatus === "REJECTED" ? "rejected" :
    mofStatus === "CANCELLED" ? "cancelled" :
    "pending";

  const eventType = mofStatus === "CLEARED" ? "cleared" :
                    mofStatus === "REJECTED" ? "rejected" :
                    mofStatus === "CANCELLED" ? "cancelled" :
                    "clearance_requested";

  // ─── Record receipt ───────────────────────────────────────────────────
  try {
    await recordReceipt({
      companySlug: payload.companySlug || "",
      invoiceId: payload.invoiceId ?? null,
      authority: "kuwait_decree_10_2026",
      eventType,
      externalUuid: payload.invoiceUuid || payload.clearanceId || null,
      status: internalStatus,
      rawPayload: raw,
      signatureValid,
      rejectionReason: payload.rejectionReason || null,
    });

    return NextResponse.json({ ok: true, received: true });
  } catch (err) {
    logger.error("[webhooks:kw] recordReceipt failed", {
      err: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ ok: true, endpoint: "kuwait" });
}

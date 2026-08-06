/**
 * /api/e-invoicing/webhooks/uae
 * POST — UAE FTA (Peppol Access Point) inbound webhook receiver.
 *
 * The Peppol Access Point (not FTA directly) sends delivery reports when
 * an invoice is delivered to the recipient's AP. Payloads follow the
 * Peppol BIS Delivery 2.0 envelope.
 *
 * AP signs requests with an X-AP-Signature header (HMAC-SHA256 using
 * the AP client secret as the key).
 *
 * Public endpoint — no auth, called by the AP server.
 */
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { readRawBody, recordReceipt, safeJsonParse, verifyHmacSignature } from "@/lib/e-invoicing/webhooks";
import { getIntegrationConfig } from "@/lib/integrations/registry";
import { logger } from "@/lib/logger";

interface UaeWebhookPayload {
  peppolMessageId?: string;
  documentUuid?: string;
  status?: string; // "delivered" | "rejected" | "failed"
  rejectionReason?: string;
  recipientId?: string;
  deliveredAt?: string;
  companySlug?: string;
  invoiceId?: number;
}

export async function POST(req: NextRequest) {
  const raw = await readRawBody(req);
  const signature = req.headers.get("x-ap-signature");
  const payload = safeJsonParse<UaeWebhookPayload>(raw);

  if (!payload) {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
  }

  // ─── Signature verification ───────────────────────────────────────────
  let signatureValid: boolean | null = null;
  if (signature) {
    try {
      const cfg = await getIntegrationConfig("einvoice_ae");
      const secret = cfg?.ap_client_secret || null;
      signatureValid = verifyHmacSignature(raw, signature, secret, "hex");
    } catch (err) {
      logger.warn("[webhooks:uae] signature verify failed", {
        err: err instanceof Error ? err.message : String(err),
      });
      signatureValid = false;
    }
  }

  // ─── Map Peppol status → internal status ────────────────────────────
  const apStatus = (payload.status || "").toLowerCase();
  const internalStatus: "accepted" | "rejected" | "pending" | "cancelled" =
    apStatus === "delivered" || apStatus === "accepted" ? "accepted" :
    apStatus === "rejected" ? "rejected" :
    apStatus === "failed" ? "rejected" :
    "pending";

  const eventType = apStatus === "delivered" ? "delivery_report" : "status_update";

  // ─── Record receipt ───────────────────────────────────────────────────
  try {
    await recordReceipt({
      companySlug: payload.companySlug || "",
      invoiceId: payload.invoiceId ?? null,
      authority: "uae_fta",
      eventType,
      externalUuid: payload.peppolMessageId || payload.documentUuid || null,
      status: internalStatus,
      rawPayload: raw,
      signatureValid,
      rejectionReason: payload.rejectionReason || null,
    });

    return NextResponse.json({ ok: true, received: true });
  } catch (err) {
    logger.error("[webhooks:uae] recordReceipt failed", {
      err: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ ok: true, endpoint: "uae" });
}

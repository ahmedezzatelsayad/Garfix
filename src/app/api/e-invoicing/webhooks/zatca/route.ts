/**
 * /api/e-invoicing/webhooks/zatca
 * POST — ZATCA (Saudi Arabia) inbound webhook receiver.
 *
 * ZATCA sends callbacks when an invoice clearance request is processed:
 *   - eventType: "clearance_requested" | "cleared" | "rejected" | "cancelled"
 *   - Body contains: invoice UUID, status, QR code (if cleared), rejection reason
 *
 * Auth: ZATCA signs requests with an X-ZATCA-Signature header (HMAC-SHA256
 * using the CSID shared secret). We verify it when present; if absent we
 * log signatureValid: null but still accept (some sandbox environments
 * don't sign callbacks).
 *
 * Public endpoint — no auth, called by ZATCA servers.
 */
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { readRawBody, recordReceipt, safeJsonParse, verifyHmacSignature } from "@/lib/e-invoicing/webhooks";
import { getIntegrationConfig } from "@/lib/integrations/registry";
import { logger } from "@/lib/logger";

interface ZatcaWebhookPayload {
  invoiceUuid?: string;
  invoiceHash?: string;
  status?: string; // "CLEARANCE_REQUESTED" | "CLEARED" | "REJECTED" | "CANCELLED"
  rejectionReason?: string;
  qrCode?: string;
  reportingDate?: string;
  companySlug?: string;
  invoiceId?: number;
}

export async function POST(req: NextRequest) {
  const raw = await readRawBody(req);
  const signature = req.headers.get("x-zatca-signature");
  const payload = safeJsonParse<ZatcaWebhookPayload>(raw);

  if (!payload) {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
  }

  // ─── Signature verification (best-effort) ─────────────────────────────
  // CSID secret is stored under the platform-wide ZATCA integration config
  // (key: csid_secret). If no signature header is present, we log it but
  // still process the webhook (ZATCA sandbox doesn't always sign).
  let signatureValid: boolean | null = null;
  if (signature) {
    try {
      const cfg = await getIntegrationConfig("einvoice_sa");
      const secret = cfg?.csid_secret || null;
      signatureValid = verifyHmacSignature(raw, signature, secret, "base64");
    } catch (err) {
      logger.warn("[webhooks:zatca] signature verify failed", {
        err: err instanceof Error ? err.message : String(err),
      });
      signatureValid = false;
    }
  }

  // ─── Map ZATCA status → internal status ───────────────────────────────
  const zatcaStatus = (payload.status || "").toUpperCase();
  const internalStatus: "accepted" | "rejected" | "pending" | "cancelled" =
    zatcaStatus === "CLEARED" ? "accepted" :
    zatcaStatus === "REJECTED" ? "rejected" :
    zatcaStatus === "CANCELLED" ? "cancelled" :
    "pending";

  const eventType =
    zatcaStatus === "CLEARANCE_REQUESTED" ? "clearance_requested" :
    zatcaStatus === "CLEARED" ? "cleared" :
    zatcaStatus === "REJECTED" ? "rejected" :
    zatcaStatus === "CANCELLED" ? "cancelled" :
    "status_update";

  // ─── Record receipt ───────────────────────────────────────────────────
  try {
    await recordReceipt({
      companySlug: payload.companySlug || "",
      invoiceId: payload.invoiceId ?? null,
      authority: "zatca",
      eventType,
      externalUuid: payload.invoiceUuid || null,
      status: internalStatus,
      rawPayload: raw,
      signatureValid,
      rejectionReason: payload.rejectionReason || null,
    });

    return NextResponse.json({ ok: true, received: true });
  } catch (err) {
    logger.error("[webhooks:zatca] recordReceipt failed", {
      err: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

// Health check
export async function GET() {
  return NextResponse.json({ ok: true, endpoint: "zatca" });
}

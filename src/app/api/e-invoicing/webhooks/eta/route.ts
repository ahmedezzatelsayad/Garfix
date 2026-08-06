/**
 * /api/e-invoicing/webhooks/eta
 * POST — Egypt ETA (Egyptian Tax Authority) inbound webhook receiver.
 *
 * ETA sends callbacks for:
 *   - Document submission status (accepted/rejected)
 *   - Delivery reports (when recipient accepts/rejects)
 *
 * ETA signs requests with an X-Signature header (HMAC-SHA256 using the
 * API token as the secret). We verify when present.
 *
 * Public endpoint — no auth, called by ETA servers.
 */
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { readRawBody, recordReceipt, safeJsonParse, verifyHmacSignature } from "@/lib/e-invoicing/webhooks";
import { getIntegrationConfig } from "@/lib/integrations/registry";
import { logger } from "@/lib/logger";

interface EtaWebhookPayload {
  documentUuid?: string;
  submissionUuid?: string;
  status?: string; // "Valid" | "Invalid" | "Submitted" | "Cancelled" | "Rejected"
  rejectionReason?: string;
  eventType?: string;
  companySlug?: string;
  invoiceId?: number;
}

export async function POST(req: NextRequest) {
  const raw = await readRawBody(req);
  const signature = req.headers.get("x-signature") || req.headers.get("x-eta-signature");
  const payload = safeJsonParse<EtaWebhookPayload>(raw);

  if (!payload) {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
  }

  // ─── Signature verification ───────────────────────────────────────────
  let signatureValid: boolean | null = null;
  if (signature) {
    try {
      const cfg = await getIntegrationConfig("einvoice_eg");
      const secret = cfg?.api_token || null; // ETA uses the API token as HMAC secret
      signatureValid = verifyHmacSignature(raw, signature, secret, "hex");
    } catch (err) {
      logger.warn("[webhooks:eta] signature verify failed", {
        err: err instanceof Error ? err.message : String(err),
      });
      signatureValid = false;
    }
  }

  // ─── Map ETA status → internal status ────────────────────────────────
  const etaStatus = (payload.status || "").toLowerCase();
  const internalStatus: "accepted" | "rejected" | "pending" | "cancelled" =
    etaStatus === "valid" || etaStatus === "accepted" ? "accepted" :
    etaStatus === "invalid" || etaStatus === "rejected" ? "rejected" :
    etaStatus === "cancelled" ? "cancelled" :
    "pending";

  const eventType =
    payload.eventType ||
    (etaStatus === "submitted" ? "submission_received" :
     etaStatus === "valid" || etaStatus === "accepted" ? "cleared" :
     etaStatus === "rejected" || etaStatus === "invalid" ? "rejected" :
     etaStatus === "cancelled" ? "cancelled" :
     "status_update");

  // ─── Record receipt ───────────────────────────────────────────────────
  try {
    await recordReceipt({
      companySlug: payload.companySlug || "",
      invoiceId: payload.invoiceId ?? null,
      authority: "eta_egypt",
      eventType,
      externalUuid: payload.documentUuid || payload.submissionUuid || null,
      status: internalStatus,
      rawPayload: raw,
      signatureValid,
      rejectionReason: payload.rejectionReason || null,
    });

    return NextResponse.json({ ok: true, received: true });
  } catch (err) {
    logger.error("[webhooks:eta] recordReceipt failed", {
      err: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ ok: true, endpoint: "eta" });
}

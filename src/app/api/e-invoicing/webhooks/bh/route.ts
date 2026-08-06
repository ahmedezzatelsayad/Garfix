/**
 * /api/e-invoicing/webhooks/bh
 * POST — Bahrain NBR (National Bureau for Revenue) inbound webhook receiver.
 *
 * NBR sends callbacks when an invoice submission is processed.
 *
 * Auth: NBR signs requests with an X-NBR-Signature header (HMAC-SHA256 using
 * the API key as the secret).
 *
 * Public endpoint — no auth, called by NBR servers.
 */
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { readRawBody, recordReceipt, safeJsonParse, verifyHmacSignature } from "@/lib/e-invoicing/webhooks";
import { getIntegrationConfig } from "@/lib/integrations/registry";
import { logger } from "@/lib/logger";

interface BhWebhookPayload {
  invoiceUuid?: string;
  submissionId?: string;
  status?: string; // "ACCEPTED" | "REJECTED" | "PENDING" | "CANCELLED"
  rejectionReason?: string;
  vatNumber?: string;
  companySlug?: string;
  invoiceId?: number;
}

export async function POST(req: NextRequest) {
  const raw = await readRawBody(req);
  const signature = req.headers.get("x-nbr-signature");
  const payload = safeJsonParse<BhWebhookPayload>(raw);

  if (!payload) {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
  }

  // ─── Signature verification ───────────────────────────────────────────
  let signatureValid: boolean | null = null;
  if (signature) {
    try {
      const cfg = await getIntegrationConfig("einvoice_bh");
      const secret = cfg?.api_key || null;
      signatureValid = verifyHmacSignature(raw, signature, secret, "hex");
    } catch (err) {
      logger.warn("[webhooks:bh] signature verify failed", {
        err: err instanceof Error ? err.message : String(err),
      });
      signatureValid = false;
    }
  }

  // ─── Map NBR status → internal status ────────────────────────────────
  const nbrStatus = (payload.status || "").toUpperCase();
  const internalStatus: "accepted" | "rejected" | "pending" | "cancelled" =
    nbrStatus === "ACCEPTED" || nbrStatus === "CLEARED" ? "accepted" :
    nbrStatus === "REJECTED" ? "rejected" :
    nbrStatus === "CANCELLED" ? "cancelled" :
    "pending";

  const eventType = nbrStatus === "ACCEPTED" || nbrStatus === "CLEARED" ? "cleared" :
                    nbrStatus === "REJECTED" ? "rejected" :
                    nbrStatus === "CANCELLED" ? "cancelled" :
                    "submission_received";

  // ─── Record receipt ───────────────────────────────────────────────────
  try {
    await recordReceipt({
      companySlug: payload.companySlug || "",
      invoiceId: payload.invoiceId ?? null,
      authority: "bahrain_nbr",
      eventType,
      externalUuid: payload.invoiceUuid || payload.submissionId || null,
      status: internalStatus,
      rawPayload: raw,
      signatureValid,
      rejectionReason: payload.rejectionReason || null,
    });

    return NextResponse.json({ ok: true, received: true });
  } catch (err) {
    logger.error("[webhooks:bh] recordReceipt failed", {
      err: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ ok: true, endpoint: "bahrain" });
}

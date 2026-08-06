/**
 * webhooks.ts — Shared helpers for inbound e-invoicing webhook receivers.
 *
 * Each country's tax authority sends callbacks when an invoice is cleared,
 * rejected, or its status changes. This module provides:
 *
 *   - verifyHmacSignature: HMAC-SHA256 verification (used by ETA, Peppol APs)
 *   - recordReceipt: persist a row in EInvoiceReceipt + audit log + update EInvoice
 *   - resolveCompanyFromInvoice: look up companySlug from invoiceId
 *
 * All webhook endpoints are PUBLIC (no auth — they're called by external
 * government servers). They MUST verify a signature header where the
 * authority supports one.
 */
import { dbTyped as db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { createHmac, timingSafeEqual } from "crypto";

// ─── Types ────────────────────────────────────────────────────────────────

export type EInvoiceAuthority =
  | "zatca"
  | "eta_egypt"
  | "uae_fta"
  | "kuwait_decree_10_2026"
  | "bahrain_nbr"
  | "oman_tax"
  | "qatar_gta";

export interface ReceiptInput {
  companySlug: string;
  invoiceId?: number | null;
  authority: EInvoiceAuthority;
  eventType: string; // clearance_requested, cleared, rejected, cancelled, delivery_report
  externalUuid?: string | null;
  status: "accepted" | "rejected" | "pending" | "cancelled";
  rawPayload: string;
  signatureValid?: boolean | null;
  rejectionReason?: string | null;
}

export interface ReceiptRecord {
  id: string;
  receivedAt: Date;
}

// ─── HMAC signature verification ──────────────────────────────────────────

/**
 * Verify an HMAC-SHA256 signature.
 *
 * @param body     Raw request body as a string (the exact bytes the authority signed)
 * @param signature  Hex- or base64-encoded signature from the authority's header
 * @param secret   Shared secret configured by the taxpayer in the authority portal
 * @param encoding "hex" (default) or "base64"
 * @returns true if signature is valid, false otherwise (or if inputs are missing)
 */
export function verifyHmacSignature(
  body: string,
  signature: string | null,
  secret: string | null,
  encoding: "hex" | "base64" = "hex",
): boolean {
  if (!signature || !secret) return false;
  try {
    const computed = createHmac("sha256", secret).update(body).digest(encoding);
    const a = Buffer.from(computed, encoding);
    const b = Buffer.from(signature, encoding);
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch (err) {
    logger.warn("[e-invoicing:webhooks] HMAC verify failed", {
      err: err instanceof Error ? err.message : String(err),
    });
    return false;
  }
}

// ─── Receipt persistence ──────────────────────────────────────────────────

/**
 * Persist an inbound receipt + update the corresponding EInvoice row +
 * write an audit log entry.
 *
 * Idempotent: if the same externalUuid + authority + eventType arrives
 * twice, the second call returns the first row's id (no duplicate).
 */
export async function recordReceipt(input: ReceiptInput): Promise<ReceiptRecord> {
  // ── 1. Idempotency check ─────────────────────────────────────────────
  if (input.externalUuid) {
    const existing = await db.eInvoiceReceipt.findFirst({
      where: {
        externalUuid: input.externalUuid,
        authority: input.authority,
        eventType: input.eventType,
      },
      select: { id: true, receivedAt: true },
    });
    if (existing) {
      logger.info("[e-invoicing:webhooks] duplicate receipt ignored", {
        authority: input.authority,
        externalUuid: input.externalUuid,
        eventType: input.eventType,
      });
      return existing;
    }
  }

  // ── 2. Resolve companySlug from invoiceId if not provided ───────────
  let companySlug = input.companySlug;
  let invoiceId = input.invoiceId ?? null;

  if (!companySlug && invoiceId) {
    const invoice = await db.invoice.findUnique({
      where: { id: invoiceId },
      select: { companySlug: true },
    });
    if (invoice) companySlug = invoice.companySlug;
  }
  if (!companySlug) {
    logger.warn("[e-invoicing:webhooks] cannot resolve companySlug for receipt", {
      authority: input.authority,
      invoiceId,
    });
    companySlug = "_unknown";
  }

  // ── 3. Persist the receipt row ──────────────────────────────────────
  const receipt = await db.eInvoiceReceipt.create({
    data: {
      companySlug,
      invoiceId,
      authority: input.authority,
      eventType: input.eventType,
      externalUuid: input.externalUuid || null,
      status: input.status,
      rawPayload: input.rawPayload,
      signatureValid: input.signatureValid ?? null,
      rejectionReason: input.rejectionReason || null,
    },
  });

  // ── 4. Update the corresponding EInvoice row if applicable ──────────
  if (invoiceId) {
    try {
      const submissionStatus =
        input.status === "accepted" ? "cleared" :
        input.status === "rejected" ? "rejected" :
        input.status === "cancelled" ? "rejected" :
        "submitted";

      const existingEInvoice = await db.eInvoice.findUnique({ where: { invoiceId } });
      if (existingEInvoice) {
        await db.eInvoice.update({
          where: { invoiceId },
          data: {
            submissionStatus,
            ...(input.status === "accepted" && { clearedAt: new Date() }),
            ...(input.rejectionReason && { rejectionReason: input.rejectionReason }),
            ...(input.externalUuid && { uuid: input.externalUuid }),
          },
        });
      } else {
        // Auto-create an EInvoice stub if it doesn't exist
        await db.eInvoice.create({
          data: {
            invoiceId,
            authorityType: input.authority,
            submissionStatus,
            uuid: input.externalUuid || null,
            clearedAt: input.status === "accepted" ? new Date() : null,
            rejectionReason: input.rejectionReason || null,
            companySlug,
            // Required by schema (P2-Reconciliation cols)
            invoiceNumber: `#${invoiceId}`,
            authority: input.authority,
            status: submissionStatus,
          },
        }).catch((err) => {
          // Don't fail the webhook if the stub creation fails
          logger.warn("[e-invoicing:webhooks] EInvoice stub create failed", {
            invoiceId, err: err instanceof Error ? err.message : String(err),
          });
        });
      }
    } catch (err) {
      logger.warn("[e-invoicing:webhooks] EInvoice update failed", {
        invoiceId, err: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // ── 5. Audit log ────────────────────────────────────────────────────
  try {
    await db.auditLog.create({
      data: {
        action: "e_invoice_webhook_received",
        entity: "e_invoice",
        entityId: input.externalUuid || String(invoiceId || receipt.id),
        companySlug,
        details: JSON.stringify({
          authority: input.authority,
          eventType: input.eventType,
          status: input.status,
          signatureValid: input.signatureValid ?? null,
          rejectionReason: input.rejectionReason || null,
          receiptId: receipt.id,
        }),
      },
    });
  } catch (err) {
    // Don't fail the webhook on audit log failure
    logger.warn("[e-invoicing:webhooks] audit log write failed", {
      err: err instanceof Error ? err.message : String(err),
    });
  }

  logger.info("[e-invoicing:webhooks] receipt recorded", {
    authority: input.authority,
    eventType: input.eventType,
    status: input.status,
    invoiceId,
    receiptId: receipt.id,
  });

  // ── 6. Dispatch rejection notification (best-effort, non-blocking) ──
  if (input.status === "rejected") {
    // Don't await — fire and forget so the webhook returns 200 immediately.
    // Errors are logged inside the dispatcher, not propagated to the caller.
    void import("./notifications")
      .then(({ dispatchRejectionNotification }) =>
        dispatchRejectionNotification({
          companySlug,
          invoiceId: invoiceId ?? null,
          externalUuid: input.externalUuid || null,
          authority: input.authority,
          rejectionReason: input.rejectionReason || null,
          receiptId: receipt.id,
        }),
      )
      .catch((err) => {
        logger.warn("[e-invoicing:webhooks] rejection notification failed", {
          receiptId: receipt.id,
          err: err instanceof Error ? err.message : String(err),
        });
      });
  }

  return { id: receipt.id, receivedAt: receipt.receivedAt };
}

// ─── Helpers ──────────────────────────────────────────────────────────────

/**
 * Read raw request body as text (needed for HMAC verification — must be the
 * exact bytes received, not a re-serialized JSON).
 */
export async function readRawBody(req: Request): Promise<string> {
  const buf = Buffer.from(await req.arrayBuffer());
  return buf.toString("utf8");
}

/**
 * Parse a JSON body safely — returns null on parse error.
 */
export function safeJsonParse<T = unknown>(raw: string): T | null {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

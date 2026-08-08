/**
 * webhooks.ts — Shared helpers for inbound e-invoicing webhook receivers.
 *
 * Each country's tax authority sends callbacks when an invoice is cleared,
 * rejected, or its status changes. This module provides:
 *
 *   - verifyHmacSignature: HMAC-SHA256 verification (used by ETA, Peppol APs)
 *   - recordReceipt: persist a row in EInvoiceReceipt + audit log + update EInvoice
 *   - readRawBody: raw body reader with size limit (DoS protection)
 *
 * All webhook endpoints are PUBLIC (no auth — they're called by external
 * government servers). They MUST verify a signature header where the
 * authority supports one.
 *
 * SECURITY: EInvoice status is only updated when signatureValid === true.
 * Unsigned or invalid-signature webhooks are recorded for audit but do NOT
 * mutate invoice status.
 */
import { dbTyped as db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { createHmac, timingSafeEqual } from "crypto";

// ─── Constants ─────────────────────────────────────────────────────────────

/** Maximum webhook body size (256 KB). Larger bodies are rejected with 413. */
export const MAX_WEBHOOK_BODY_BYTES = 256 * 1024;

/** Maximum rawPayload stored in the DB (64 KB). Larger payloads are truncated. */
const MAX_RAW_PAYLOAD_STORE_BYTES = 64 * 1024;

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
 *
 * SECURITY: EInvoice status is only updated when `signatureValid === true`.
 * When `signatureValid` is `false` or `null` (unsigned), the receipt is
 * still recorded for audit but the EInvoice row is NOT mutated — this
 * prevents forged webhooks from marking invoices as "cleared" or "rejected".
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

  // ── 2. Resolve companySlug + invoiceNumber from invoiceId ───────────
  let companySlug = input.companySlug;
  let invoiceId = input.invoiceId ?? null;
  let invoiceNumber: string | null = null;

  if (invoiceId) {
    // FIX #3 (CRITICAL): scope by companySlug when provided, to prevent cross-tenant lookups
    const invoice = await db.invoice.findFirst({
      where: companySlug
        ? { id: invoiceId, companySlug }
        : { id: invoiceId },
      select: { companySlug: true, invoiceNumber: true },
    });
    if (invoice) {
      // FIX #3 (CRITICAL): if input provided a companySlug, verify it matches
      if (companySlug && invoice.companySlug !== companySlug) {
        logger.error("[e-invoicing:webhooks] cross-tenant invoice access blocked", {
          inputCompanySlug: companySlug,
          invoiceCompanySlug: invoice.companySlug,
          invoiceId,
        });
        companySlug = "_unknown";
        invoiceId = null; // prevent EInvoice update for wrong tenant
      } else {
        companySlug = invoice.companySlug;
        invoiceNumber = invoice.invoiceNumber;
      }
    }
  }
  if (!companySlug) {
    logger.warn("[e-invoicing:webhooks] cannot resolve companySlug for receipt", {
      authority: input.authority,
      invoiceId,
    });
    companySlug = "_unknown";
  }

  // ── 3. Truncate rawPayload if too large (DoS protection) ────────────
  const truncatedPayload =
    input.rawPayload.length > MAX_RAW_PAYLOAD_STORE_BYTES
      ? input.rawPayload.slice(0, MAX_RAW_PAYLOAD_STORE_BYTES) + "\n…[truncated]"
      : input.rawPayload;

  // ── 4. Persist the receipt row ──────────────────────────────────────
  const receipt = await db.eInvoiceReceipt.create({
    data: {
      companySlug,
      invoiceId,
      authority: input.authority,
      eventType: input.eventType,
      externalUuid: input.externalUuid || null,
      status: input.status,
      rawPayload: truncatedPayload,
      signatureValid: input.signatureValid ?? null,
      rejectionReason: input.rejectionReason || null,
    },
  });

  // ── 5. Update EInvoice ONLY if signature is valid ───────────────────
  // FIX #2 (CRITICAL): gate EInvoice mutation on signatureValid === true.
  // Forged or unsigned webhooks are recorded for audit but do NOT change
  // invoice status.
  if (invoiceId && input.signatureValid === true) {
    try {
      // FIX #24 (MEDIUM): cancelled → "cancelled" not "rejected"
      const submissionStatus =
        input.status === "accepted" ? "cleared" :
        input.status === "rejected" ? "rejected" :
        input.status === "cancelled" ? "cancelled" :
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
        // FIX #36 (LOW): use real invoice number instead of #id placeholder
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
            invoiceNumber: invoiceNumber || `#${invoiceId}`,
            authority: input.authority,
            status: submissionStatus,
          },
        }).catch((err) => {
          // FIX #25 (MEDIUM): log the error instead of silently swallowing
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
  } else if (invoiceId && input.signatureValid !== true) {
    // Log that we're skipping the EInvoice update due to invalid/missing signature
    logger.warn("[e-invoicing:webhooks] skipping EInvoice update — signature not valid", {
      invoiceId,
      authority: input.authority,
      signatureValid: input.signatureValid,
    });
  }

  // ── 6. Audit log ────────────────────────────────────────────────────
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
          einvoiceUpdated: input.signatureValid === true,
          rejectionReason: input.rejectionReason || null,
          receiptId: receipt.id,
        }),
      },
    });
  } catch (err) {
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
    signatureValid: input.signatureValid,
    einvoiceUpdated: input.signatureValid === true,
  });

  // ── 7. Dispatch rejection notification (best-effort, non-blocking) ──
  if (input.status === "rejected" && input.signatureValid === true) {
    // Don't await — fire and forget so the webhook returns 200 immediately.
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
 * Read raw request body as text with a size limit (DoS protection).
 *
 * FIX #14 (HIGH): rejects bodies larger than MAX_WEBHOOK_BODY_BYTES (256 KB)
 * with a 413 response. This prevents attackers from buffering multi-GB
 * payloads into memory.
 */
export async function readRawBody(req: Request): Promise<string> {
  const contentLength = parseInt(req.headers.get("content-length") || "0", 10);
  if (Number.isFinite(contentLength) && contentLength > MAX_WEBHOOK_BODY_BYTES) {
    throw new WebhookBodyTooLargeError(contentLength);
  }
  const buf = Buffer.from(await req.arrayBuffer());
  if (buf.length > MAX_WEBHOOK_BODY_BYTES) {
    throw new WebhookBodyTooLargeError(buf.length);
  }
  return buf.toString("utf8");
}

/** Error thrown when webhook body exceeds the size limit. */
export class WebhookBodyTooLargeError extends Error {
  statusCode = 413;
  constructor(public actualSize: number) {
    super(`Webhook body too large: ${actualSize} bytes (max ${MAX_WEBHOOK_BODY_BYTES})`);
    this.name = "WebhookBodyTooLargeError";
  }
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

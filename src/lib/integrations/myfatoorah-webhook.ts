/**
 * myfatoorah-webhook.ts — MyFatoorah webhook signature verification & event parsing.
 *
 * The callback route currently doesn't verify MyFatoorah webhook signatures.
 * This module provides:
 *   - HMAC-SHA256 signature verification using the API key
 *   - Webhook event parsing: payment_success, payment_failed, refund_completed
 *   - Rate-limit tracking for webhook processing
 *
 * MyFatoorah webhook format:
 *   - The webhook payload is sent as a POST with JSON body
 *   - Signature is in the `Signature` header
 *   - Signature = HMAC-SHA256(apiKey, JSON.stringify(payload))
 *
 * RUNTIME: Node.js only — uses crypto, db, logger
 */
'use node';

import crypto from 'node:crypto';
import { db } from '@/lib/db';
import { logger } from '@/lib/logger';
import { getIntegrationConfig } from '@/lib/integrations/registry';
import { safeCompare } from '@/lib/cryptoVault';

// ─── Webhook event types ───────────────────────────────────────────────────

export type MyFatoorahEventType =
  | 'payment_success'
  | 'payment_failed'
  | 'refund_completed';

export interface MyFatoorahWebhookPayload {
  EventType: string;
  Data: {
    InvoiceId: number;
    InvoiceStatus: string;
    InvoiceValue: number;
    CurrencyIso: string;
    PaymentMethodId: number;
    PaymentGateway: string;
    CustomerReference: string;
    TrackId: string;
    RefId: string;
    TransId: number;
    PaymentId: number;
    RefundId?: number;
    RefundStatus?: string;
    RefundReference?: string;
    Error?: string;
  };
}

export interface ParsedWebhookEvent {
  eventType: MyFatoorahEventType;
  invoiceId: number;
  invoiceStatus: string;
  invoiceValue: number;
  currencyIso: string;
  paymentId: number;
  refundId?: number;
  refundStatus?: string;
  customerReference: string;
  error?: string;
  raw: MyFatoorahWebhookPayload;
}

// ─── Rate limiting ─────────────────────────────────────────────────────────

/** In-memory rate limit tracker for webhook processing. */
const webhookRateLimiter = new Map<string, { count: number; lastReset: number }>();
const RATE_LIMIT_MAX = 100; // max webhooks per provider per minute
const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute

function checkRateLimit(provider: string): boolean {
  const entry = webhookRateLimiter.get(provider);
  const now = Date.now();

  if (!entry || now - entry.lastReset > RATE_LIMIT_WINDOW_MS) {
    webhookRateLimiter.set(provider, { count: 1, lastReset: now });
    return true;
  }

  if (entry.count >= RATE_LIMIT_MAX) {
    logger.warn('[myfatoorah-webhook] rate limit exceeded', { provider, count: entry.count });
    return false;
  }

  entry.count++;
  return true;
}

// ─── Signature verification ────────────────────────────────────────────────

/**
 * Verify a MyFatoorah webhook signature using HMAC-SHA256.
 *
 * MyFatoorah signs the webhook payload using the API key as the HMAC secret.
 * The signature is computed as: HMAC-SHA256(apiKey, JSON.stringify(payload))
 *
 * @param payload - The raw JSON payload string from the webhook request body
 * @param signature - The `Signature` header value from the request
 * @returns true if the signature is valid, false otherwise
 */
export async function verifyWebhookSignature(
  payload: string,
  signature: string,
): Promise<{ valid: boolean; error?: string }> {
  // Get the API key from stored credentials
  const cfg = await getIntegrationConfig('myfatoorah');
  if (!cfg?.api_key) {
    return { valid: false, error: 'بيانات MyFatoorah غير مُهيّأة — لا يمكن التحقق من التوقيع' };
  }

  try {
    // Compute expected signature: HMAC-SHA256(apiKey, payload)
    const expectedSignature = crypto
      .createHmac('sha256', cfg.api_key)
      .update(payload, 'utf8')
      .digest('hex');

    // Constant-time comparison to prevent timing attacks
    if (safeCompare(signature, expectedSignature)) {
      return { valid: true };
    }

    logger.warn('[myfatoorah-webhook] signature mismatch', {
      providedSignature: signature.substring(0, 8) + '...',
      expectedPrefix: expectedSignature.substring(0, 8) + '...',
    });
    return { valid: false, error: 'توقيع webhook غير صالح — لا يتطابق مع HMAC-SHA256' };
  } catch (err) {
    logger.error('[myfatoorah-webhook] signature verification error', {
      error: err instanceof Error ? err.message : String(err),
    });
    return { valid: false, error: 'خطأ في التحقق من التوقيع' };
  }
}

// ─── Event parsing ─────────────────────────────────────────────────────────

/**
 * Parse a raw webhook payload into a structured event.
 *
 * MyFatoorah doesn't have explicit event types in their webhook — instead,
 * the InvoiceStatus field determines the event:
 *   - Paid → payment_success
 *   - Failed / Cancelled → payment_failed
 *   - Refunded (with RefundId) → refund_completed
 */
export function parseWebhookEvent(payload: MyFatoorahWebhookPayload): ParsedWebhookEvent {
  const { EventType, Data } = payload;
  const invoiceStatus = (Data.InvoiceStatus || '').toLowerCase();

  let eventType: MyFatoorahEventType;
  if (Data.RefundId && Data.RefundStatus) {
    eventType = 'refund_completed';
  } else if (invoiceStatus === 'paid') {
    eventType = 'payment_success';
  } else {
    eventType = 'payment_failed';
  }

  // Override with EventType if explicitly provided (MyFatoorah may add this later)
  if (EventType) {
    const mapped = mapEventType(EventType);
    if (mapped) eventType = mapped;
  }

  return {
    eventType,
    invoiceId: Data.InvoiceId,
    invoiceStatus: Data.InvoiceStatus,
    invoiceValue: Data.InvoiceValue,
    currencyIso: Data.CurrencyIso,
    paymentId: Data.PaymentId,
    refundId: Data.RefundId,
    refundStatus: Data.RefundStatus,
    customerReference: Data.CustomerReference,
    error: Data.Error,
    raw: payload,
  };
}

function mapEventType(raw: string): MyFatoorahEventType | null {
  switch (raw.toLowerCase()) {
    case 'payment_success':
    case 'paymentsuccess':
      return 'payment_success';
    case 'payment_failed':
    case 'paymentfailed':
      return 'payment_failed';
    case 'refund_completed':
    case 'refundcompleted':
      return 'refund_completed';
    default:
      return null;
  }
}

// ─── Webhook processing ────────────────────────────────────────────────────

/**
 * Process a verified webhook event.
 *
 * Called after signature verification succeeds. Updates the database
 * based on the event type:
 *   - payment_success: mark PaymentTransaction as paid, update company plan
 *   - payment_failed: mark PaymentTransaction as failed
 *   - refund_completed: mark RefundTransaction as completed
 */
export async function processWebhookEvent(
  event: ParsedWebhookEvent,
): Promise<{ ok: boolean; error?: string }> {
  // Rate limit check
  if (!checkRateLimit('myfatoorah')) {
    return { ok: false, error: 'تم تجاوز حد معدل webhook — يرجى المحاولة لاحقاً' };
  }

  logger.info('[myfatoorah-webhook] processing event', {
    eventType: event.eventType,
    invoiceId: event.invoiceId,
    paymentId: event.paymentId,
  });

  try {
    switch (event.eventType) {
      case 'payment_success':
        return await handlePaymentSuccess(event);
      case 'payment_failed':
        return await handlePaymentFailed(event);
      case 'refund_completed':
        return await handleRefundCompleted(event);
      default:
        return { ok: false, error: `نوع webhook غير معروف: ${event.eventType}` };
    }
  } catch (err) {
    logger.error('[myfatoorah-webhook] error processing event', {
      eventType: event.eventType,
      invoiceId: event.invoiceId,
      error: err instanceof Error ? err.message : String(err),
    });
    return { ok: false, error: 'خطأ في معالجة webhook' };
  }
}

async function handlePaymentSuccess(event: ParsedWebhookEvent): Promise<{ ok: boolean; error?: string }> {
  const txn = await db.paymentTransaction.findFirst({
    where: { providerPaymentId: String(event.invoiceId), provider: 'myfatoorah' },
  });

  if (!txn) {
    logger.warn('[myfatoorah-webhook] payment_success: no matching transaction', {
      invoiceId: event.invoiceId,
    });
    return { ok: false, error: 'معاملة الدفع غير موجودة' };
  }

  const existingMeta = (() => { try { return JSON.parse(txn.metadata || '{}'); } catch { return {}; } })();
  await db.paymentTransaction.update({
    where: { id: txn.id },
    data: {
      status: 'paid',
      providerEventId: String(event.paymentId),
      metadata: JSON.stringify({
        ...existingMeta,
        webhookPaymentId: event.paymentId,
        webhookInvoiceStatus: event.invoiceStatus,
        webhookProcessedAt: new Date().toISOString(),
      }),
    },
  });

  // Update company plan if this is a subscription upgrade
  if (txn.plan && txn.plan !== 'trial') {
    await db.company.update({
      where: { slug: txn.companySlug },
      data: {
        plan: txn.plan,
        subscriptionStatus: 'active',
      },
    });
  }

  logger.info('[myfatoorah-webhook] payment_success processed', {
    txnId: txn.id,
    invoiceId: event.invoiceId,
    companySlug: txn.companySlug,
    plan: txn.plan,
  });

  return { ok: true };
}

async function handlePaymentFailed(event: ParsedWebhookEvent): Promise<{ ok: boolean; error?: string }> {
  const txn = await db.paymentTransaction.findFirst({
    where: { providerPaymentId: String(event.invoiceId), provider: 'myfatoorah' },
  });

  if (!txn) {
    logger.warn('[myfatoorah-webhook] payment_failed: no matching transaction', {
      invoiceId: event.invoiceId,
    });
    return { ok: false, error: 'معاملة الدفع غير موجودة' };
  }

  const existingMeta = (() => { try { return JSON.parse(txn.metadata || '{}'); } catch { return {}; } })();
  await db.paymentTransaction.update({
    where: { id: txn.id },
    data: {
      status: 'failed',
      failureReason: event.error || 'فشل الدفع عبر webhook',
      providerEventId: String(event.paymentId),
      metadata: JSON.stringify({
        ...existingMeta,
        webhookPaymentId: event.paymentId,
        webhookInvoiceStatus: event.invoiceStatus,
        webhookError: event.error,
        webhookProcessedAt: new Date().toISOString(),
      }),
    },
  });

  logger.info('[myfatoorah-webhook] payment_failed processed', {
    txnId: txn.id,
    invoiceId: event.invoiceId,
    error: event.error,
  });

  return { ok: true };
}

async function handleRefundCompleted(event: ParsedWebhookEvent): Promise<{ ok: boolean; error?: string }> {
  if (!event.refundId) {
    return { ok: false, error: 'بيانات الاسترجاع غير مكتملة — RefundId مفقود' };
  }

  const refund = await db.refundTransaction.findFirst({
    where: { providerRefundId: String(event.refundId) },
  });

  if (!refund) {
    logger.warn('[myfatoorah-webhook] refund_completed: no matching refund record', {
      refundId: event.refundId,
    });
    return { ok: false, error: 'سجل الاسترجاع غير موجود' };
  }

  await db.refundTransaction.update({
    where: { id: refund.id },
    data: {
      status: 'completed',
    },
  });

  logger.info('[myfatoorah-webhook] refund_completed processed', {
    refundId: refund.id,
    providerRefundId: event.refundId,
  });

  return { ok: true };
}

// ─── Utility exports ────────────────────────────────────────────────────────

/** Reset the rate limiter (for testing / admin purposes). */
export function resetRateLimiter(): void {
  webhookRateLimiter.clear();
}

/** Get current rate limiter stats. */
export function getRateLimiterStats(): Record<string, { count: number; remaining: number }> {
  const stats: Record<string, { count: number; remaining: number }> = {};
  for (const [key, entry] of webhookRateLimiter.entries()) {
    stats[key] = {
      count: entry.count,
      remaining: RATE_LIMIT_MAX - entry.count,
    };
  }
  return stats;
}

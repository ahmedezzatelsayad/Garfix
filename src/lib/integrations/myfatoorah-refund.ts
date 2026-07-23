/**
 * myfatoorah-refund.ts — MyFatoorah refund processing.
 *
 * Extends the MyFatoorah integration to handle refund operations:
 *   - initiateRefund: creates a refund request via MyFatoorah API
 *   - getRefundStatus: checks the status of an existing refund
 *
 * MyFatoorah refund API (v2):
 *   POST /api/v2/Refund — initiates a refund for a given invoice
 *   The refund status is tracked via RefundTransaction model in Prisma.
 *
 * Security: base_url is validated using the same SSRF-safe pattern
 * from myfatoorah.ts before any API call is made.
 *
 * RUNTIME: Node.js only — uses db, logger, fetch, cryptoVault
 */
'use node';

import { db } from '@/lib/db';
import { logger } from '@/lib/logger';
import { getIntegrationConfig } from '@/lib/integrations/registry';
import { validateBaseUrl } from '@/lib/integrations/myfatoorah';
import { z } from 'zod';

// ─── Request schemas ───────────────────────────────────────────────────────

export const InitiateRefundSchema = z.object({
  paymentTxnId: z.number().int().positive(),
  amount: z.number().positive(),
  reason: z.string().optional(),
});

export const GetRefundStatusSchema = z.object({
  refundId: z.number().int().positive(),
});

// ─── Refund operations ─────────────────────────────────────────────────────

/**
 * Initiate a refund for a payment transaction via MyFatoorah.
 *
 * Flow:
 *   1. Look up the PaymentTransaction and validate it's paid
 *   2. Create a RefundTransaction record (status=pending)
 *   3. Call MyFatoorah Refund API
 *   4. Update the RefundTransaction with the provider refund ID
 *
 * @param paymentTxnId - ID of the PaymentTransaction to refund
 * @param amount - Amount to refund (may be partial, must be <= original amount)
 * @param reason - Free-text reason for the refund
 * @param createdBy - UID of the user initiating the refund
 */
export async function initiateRefund(
  paymentTxnId: number,
  amount: number,
  reason?: string,
  createdBy?: string,
): Promise<{ ok: boolean; refundId?: number; providerRefundId?: string; error?: string }> {
  // 1. Validate the payment transaction
  const txn = await db.paymentTransaction.findUnique({
    where: { id: paymentTxnId },
  });

  if (!txn) {
    return { ok: false, error: 'معاملة الدفع غير موجودة' };
  }
  if (txn.status !== 'paid') {
    return { ok: false, error: 'لا يمكن استرجاع معاملة غير مكتملة الدفع' };
  }
  if (txn.provider !== 'myfatoorah') {
    return { ok: false, error: 'هذه المعاملة ليست عبر MyFatoorah — يرجى استخدام مزود الاسترجاع المناسب' };
  }
  if (parseFloat(txn.amount) < amount) {
    return { ok: false, error: 'مبلغ الاسترجاع أكبر من مبلغ المعاملة الأصلية' };
  }

  // 2. Create RefundTransaction record
  const refundRecord = await db.refundTransaction.create({
    data: {
      paymentTxnId,
      companySlug: txn.companySlug,
      refundAmount: String(amount),
      currency: txn.currency,
      reason: reason || 'استرجاع بناء على طلب العميل',
      status: 'pending',
      createdBy,
    },
  });

  // 3. Get MyFatoorah config and validate base_url (SSRF protection)
  const cfg = await getIntegrationConfig('myfatoorah');
  if (!cfg?.api_key || !cfg?.base_url) {
    await db.refundTransaction.update({
      where: { id: refundRecord.id },
      data: { status: 'failed', failureReason: 'بوابة الدفع MyFatoorah غير مُهيّأة' },
    });
    return { ok: false, error: 'بوابة الدفع MyFatoorah غير مُهيّأة' };
  }

  try {
    validateBaseUrl(cfg.base_url);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await db.refundTransaction.update({
      where: { id: refundRecord.id },
      data: { status: 'failed', failureReason: msg },
    });
    return { ok: false, error: msg };
  }

  // 4. Call MyFatoorah Refund API
  const baseUrl = cfg.base_url.replace(/\/+$/, '');
  try {
    const refundRes = await fetch(`${baseUrl}/api/v2/Refund`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${cfg.api_key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        Key: txn.providerPaymentId,
        KeyType: 'invoiceid',
        RefundChargeOnCustomer: 0, // no charge to customer for refund
        ServiceChargeOnCustomer: 0,
        Amount: amount,
        Comment: reason || 'استرجاع عبر Garfix ERP',
      }),
    });

    const refundData = await refundRes.json();

    if (!refundRes.ok) {
      const errMsg = refundData?.Message || `MyFatoorah refund error ${refundRes.status}`;
      await db.refundTransaction.update({
        where: { id: refundRecord.id },
        data: {
          status: 'failed',
          failureReason: errMsg,
          metadata: JSON.stringify({ providerResponse: refundData, updatedAt: new Date().toISOString() }),
        },
      });
      logger.error('[myfatoorah-refund] refund API call failed', {
        refundId: refundRecord.id,
        invoiceId: txn.providerPaymentId,
        error: errMsg,
      });
      return { ok: false, error: `فشل الاسترجاع: ${errMsg}` };
    }

    const providerRefundId = String(refundData?.Data?.RefundId || refundData?.Data?.Id || '');
    const refundStatus = refundData?.Data?.RefundStatus || 'processing';

    // 5. Update RefundTransaction with provider result
    await db.refundTransaction.update({
      where: { id: refundRecord.id },
      data: {
        status: refundStatus === 'Complete' ? 'completed' : 'processing',
        providerRefundId,
        metadata: JSON.stringify({
          providerResponse: refundData,
          providerRefundId,
          refundStatus,
          updatedAt: new Date().toISOString(),
        }),
      },
    });

    // Update original payment transaction metadata to reflect refund
    const existingMeta = (() => { try { return JSON.parse(txn.metadata || '{}'); } catch { return {}; } })();
    await db.paymentTransaction.update({
      where: { id: paymentTxnId },
      data: {
        metadata: JSON.stringify({
          ...existingMeta,
          refundId: refundRecord.id,
          refundAmount: String(amount),
          refundStatus,
          refundedAt: new Date().toISOString(),
        }),
      },
    });

    logger.info('[myfatoorah-refund] refund initiated', {
      refundId: refundRecord.id,
      providerRefundId,
      invoiceId: txn.providerPaymentId,
      amount,
      status: refundStatus,
    });

    return {
      ok: true,
      refundId: refundRecord.id,
      providerRefundId,
    };
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : 'Network error';
    await db.refundTransaction.update({
      where: { id: refundRecord.id },
      data: { status: 'failed', failureReason: errMsg },
    });
    logger.error('[myfatoorah-refund] network error', {
      refundId: refundRecord.id,
      error: errMsg,
    });
    return { ok: false, error: errMsg };
  }
}

/**
 * Get the status of an existing refund from the local DB.
 * Optionally also queries MyFatoorah API for the latest status.
 *
 * @param refundId - ID of the RefundTransaction
 * @param refreshFromProvider - If true, also query MyFatoorah API for latest status
 */
export async function getRefundStatus(
  refundId: number,
  refreshFromProvider = false,
): Promise<{
  ok: boolean;
  status?: string;
  providerRefundId?: string;
  amount?: string;
  currency?: string;
  reason?: string;
  error?: string;
}> {
  const refund = await db.refundTransaction.findUnique({ where: { id: refundId } });
  if (!refund) {
    return { ok: false, error: 'سجل الاسترجاع غير موجود' };
  }

  // If already completed or cancelled, return local status
  if (refund.status === 'completed' || refund.status === 'cancelled') {
    return {
      ok: true,
      status: refund.status,
      providerRefundId: refund.providerRefundId ?? undefined,
      amount: refund.refundAmount,
      currency: refund.currency ?? undefined,
      reason: refund.reason ?? undefined,
    };
  }

  // If refresh requested and status is pending/processing, query provider
  if (refreshFromProvider && refund.providerRefundId) {
    const cfg = await getIntegrationConfig('myfatoorah');
    if (!cfg?.api_key || !cfg?.base_url) {
      return {
        ok: true,
        status: refund.status,
        providerRefundId: refund.providerRefundId ?? undefined,
        amount: refund.refundAmount,
        currency: refund.currency ?? undefined,
        reason: refund.reason ?? undefined,
      };
    }

    try {
      validateBaseUrl(cfg.base_url);
    } catch {
      // Can't refresh from provider — return local status
      return {
        ok: true,
        status: refund.status,
        providerRefundId: refund.providerRefundId ?? undefined,
        amount: refund.refundAmount,
        currency: refund.currency ?? undefined,
        reason: refund.reason ?? undefined,
      };
    }

    try {
      const baseUrl = cfg.base_url.replace(/\/+$/, '');
      const res = await fetch(`${baseUrl}/api/v2/GetRefundStatus`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${cfg.api_key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          Key: refund.providerRefundId,
          KeyType: 'refundid',
        }),
      });

      const data = await res.json();
      if (res.ok && data?.Data) {
        const providerStatus = data.Data.RefundStatus || data.Data.Status || '';
        const mappedStatus = mapRefundStatus(providerStatus);

        await db.refundTransaction.update({
          where: { id: refundId },
          data: {
            status: mappedStatus,
            metadata: JSON.stringify({
              ...JSON.parse(refund.metadata || '{}'),
              providerRefreshResponse: data,
              refreshedAt: new Date().toISOString(),
            }),
          },
        });

        return {
          ok: true,
          status: mappedStatus,
          providerRefundId: refund.providerRefundId ?? undefined,
          amount: refund.refundAmount,
          currency: refund.currency ?? undefined,
          reason: refund.reason ?? undefined,
        };
      }
    } catch (err) {
      logger.warn('[myfatoorah-refund] failed to refresh status from provider', {
        refundId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return {
    ok: true,
    status: refund.status,
    providerRefundId: refund.providerRefundId ?? undefined,
    amount: refund.refundAmount,
    currency: refund.currency ?? undefined,
    reason: refund.reason ?? undefined,
  };
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function mapRefundStatus(providerStatus: string): string {
  switch (providerStatus.toLowerCase()) {
    case 'complete':
    case 'completed':
    case 'refunded':
      return 'completed';
    case 'pending':
    case 'processing':
      return 'processing';
    case 'failed':
    case 'rejected':
    case 'cancelled':
      return 'failed';
    default:
      return 'processing';
  }
}

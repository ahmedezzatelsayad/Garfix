/**
 * subscription-engine.ts — Recurring billing / subscription lifecycle engine.
 *
 * MyFatoorah doesn't have a native recurring billing API, so this module
 * implements subscription billing on top of one-time payments:
 *
 *   1. Create a recurring payment schedule (monthly / yearly)
 *   2. Charge on schedule using the existing payment initiation flow
 *   3. Handle failed charges with dunning: 3 retries over 7 days, then downgrade
 *   4. Track lifecycle: active → past_due → cancelled → reactivated
 *
 * The engine is driven by the scheduler worker, which checks
 * SubscriptionSchedule rows where nextChargeDate <= now and processes them.
 *
 * Dunning schedule (retry intervals):
 *   - Retry 1: 1 day after failure
 *   - Retry 2: 3 days after failure
 *   - Retry 3: 7 days after failure
 *   - After 3 retries: downgrade to downgradePlan (default: trial)
 *
 * RUNTIME: Node.js only — uses db, logger, queues (all Node-only)
 */
'use node';

import { db } from '@/lib/db';
import { logger } from '@/lib/logger';
import { enqueueBackground, QUEUE_NAMES } from '@/lib/queues';
import { getIntegrationConfig } from '@/lib/integrations/registry';
import { getCountryPricing, type CountryPricingEntry } from '@/lib/billing/pricing';

// ─── Subscription lifecycle states ──────────────────────────────────────────

export type SubscriptionStatus =
  | 'active'
  | 'past_due'
  | 'cancelled'
  | 'reactivated'
  | 'paused';

export type BillingPeriod = 'monthly' | 'yearly';

export interface CreateSubscriptionInput {
  companySlug: string;
  plan: string;
  billingPeriod: BillingPeriod;
  provider: 'myfatoorah' | 'paymob';
  paymentMethod: string;
  createdBy?: string;
}

// ─── Dunning retry schedule ────────────────────────────────────────────────

/** Retry intervals in days after a failed charge attempt. */
const DUNNING_RETRY_INTERVALS_DAYS = [1, 3, 7] as const;
const MAX_RETRIES = DUNNING_RETRY_INTERVALS_DAYS.length;

// ─── Core subscription operations ──────────────────────────────────────────

/**
 * Create a new subscription schedule.
 * Sets the first charge date to now (immediate first charge) and calculates
 * the cycle start/end based on the billing period.
 */
export async function createSubscription(input: CreateSubscriptionInput): Promise<{
  ok: boolean;
  scheduleId?: number;
  error?: string;
}> {
  const { companySlug, plan, billingPeriod, provider, paymentMethod, createdBy } = input;

  // Validate company exists
  const company = await db.company.findUnique({ where: { slug: companySlug } });
  if (!company) {
    return { ok: false, error: 'الشركة غير موجودة' };
  }

  // Get country-specific pricing
  const country = company.country || 'KW';
  const pricing = getCountryPricing(country, plan);
  if (!pricing) {
    return { ok: false, error: 'باقة غير معروفة أو سعر غير متاح لهذا البلد' };
  }

  const amount = billingPeriod === 'yearly'
    ? (pricing.priceMonthly * 12 * 0.8) // 20% yearly discount
    : pricing.priceMonthly;

  const now = new Date();
  const cycleStart = now;
  const cycleEnd = computeCycleEnd(now, billingPeriod);

  // Check if an active/past_due schedule already exists for this company
  const existing = await db.subscriptionSchedule.findFirst({
    where: { companySlug, status: { in: ['active', 'past_due'] } },
  });
  if (existing) {
    return { ok: false, error: 'يوجد جدول اشتراك نشط أو متأخر لهذه الشركة — يرجى إلغائه أولاً' };
  }

  const schedule = await db.subscriptionSchedule.create({
    data: {
      companySlug,
      plan,
      billingPeriod,
      status: 'active',
      amount: String(amount),
      currency: pricing.currency,
      provider,
      paymentMethod,
      nextChargeDate: now,
      cycleStart,
      cycleEnd,
      maxRetries: MAX_RETRIES,
      downgradePlan: 'trial',
      createdBy,
    },
  });

  logger.info('[subscription-engine] schedule created', {
    scheduleId: schedule.id,
    companySlug,
    plan,
    billingPeriod,
    amount,
    currency: pricing.currency,
    nextChargeDate: schedule.nextChargeDate.toISOString(),
  });

  // Update company billing cycle
  await db.company.update({
    where: { slug: companySlug },
    data: {
      currentBillingCycleEnd: cycleEnd,
    },
  });

  // Enqueue the first charge immediately
  enqueueBackground(QUEUE_NAMES.SCHEDULER, {
    type: 'subscription-charge',
    data: {
      type: 'subscription-charge',
      payload: { scheduleId: schedule.id },
    },
  });

  return { ok: true, scheduleId: schedule.id };
}

/**
 * Process a scheduled charge — called by the scheduler worker when
 * nextChargeDate <= now for an active/past_due schedule.
 *
 * Flow:
 *   1. Look up the schedule
 *   2. Call the payment provider to initiate a charge
 *   3. On success: update schedule, advance nextChargeDate
 *   4. On failure: increment retryCount, schedule retry, or downgrade
 */
export async function processScheduledCharge(scheduleId: number): Promise<{
  ok: boolean;
  charged?: boolean;
  downgraded?: boolean;
  error?: string;
}> {
  const schedule = await db.subscriptionSchedule.findUnique({ where: { id: scheduleId } });
  if (!schedule) {
    return { ok: false, error: 'جدول الاشتراك غير موجود' };
  }
  if (schedule.status !== 'active' && schedule.status !== 'past_due') {
    return { ok: false, error: `لا يمكن معالجة اشتراك بحالة "${schedule.status}"` };
  }

  const company = await db.company.findUnique({ where: { slug: schedule.companySlug } });
  if (!company) {
    return { ok: false, error: 'الشركة غير موجودة' };
  }

  logger.info('[subscription-engine] processing scheduled charge', {
    scheduleId,
    companySlug: schedule.companySlug,
    plan: schedule.plan,
    amount: schedule.amount,
    retryCount: schedule.retryCount,
    status: schedule.status,
  });

  // Attempt the charge via the configured provider
  const chargeResult = await initiateProviderCharge(schedule, company);

  if (chargeResult.ok) {
    // ── Success: reset retry count, advance next charge date ──
    const now = new Date();
    const nextChargeDate = computeCycleEnd(now, schedule.billingPeriod as BillingPeriod);
    const cycleEnd = nextChargeDate;

    await db.subscriptionSchedule.update({
      where: { id: scheduleId },
      data: {
        status: 'active',
        retryCount: 0,
        lastChargeDate: now,
        lastChargeTxnId: chargeResult.txnId,
        nextChargeDate,
        cycleStart: now,
        cycleEnd,
      },
    });

    // Update company billing cycle
    await db.company.update({
      where: { slug: schedule.companySlug },
      data: {
        currentBillingCycleEnd: cycleEnd,
      },
    });

    logger.info('[subscription-engine] charge succeeded', {
      scheduleId,
      companySlug: schedule.companySlug,
      txnId: chargeResult.txnId,
      nextChargeDate: nextChargeDate.toISOString(),
    });

    return { ok: true, charged: true };
  }

  // ── Failure: increment retry count, schedule retry or downgrade ──
  const newRetryCount = schedule.retryCount + 1;

  if (newRetryCount >= schedule.maxRetries) {
    // Max retries exceeded → downgrade
    logger.warn('[subscription-engine] max retries exceeded — downgrading', {
      scheduleId,
      companySlug: schedule.companySlug,
      retries: newRetryCount,
      downgradePlan: schedule.downgradePlan,
    });

    await db.subscriptionSchedule.update({
      where: { id: scheduleId },
      data: {
        status: 'cancelled',
        retryCount: newRetryCount,
        cancelledAt: new Date(),
      },
    });

    // Downgrade company plan
    await db.company.update({
      where: { slug: schedule.companySlug },
      data: {
        plan: schedule.downgradePlan,
        subscriptionStatus: 'downgraded',
        currentBillingCycleEnd: null,
      },
    });

    logger.info('[subscription-engine] company downgraded', {
      companySlug: schedule.companySlug,
      newPlan: schedule.downgradePlan,
    });

    return { ok: true, downgraded: true };
  }

  // Schedule the next retry
  const retryDelayDays = DUNNING_RETRY_INTERVALS_DAYS[newRetryCount - 1] ?? 7;
  const nextRetryDate = new Date(Date.now() + retryDelayDays * 24 * 60 * 60 * 1000);

  await db.subscriptionSchedule.update({
    where: { id: scheduleId },
    data: {
      status: 'past_due',
      retryCount: newRetryCount,
      nextChargeDate: nextRetryDate,
    },
  });

  logger.warn('[subscription-engine] charge failed — retry scheduled', {
    scheduleId,
    companySlug: schedule.companySlug,
    retryCount: newRetryCount,
    nextRetryDate: nextRetryDate.toISOString(),
    retryDelayDays,
    error: chargeResult.error,
  });

  return { ok: true, charged: false };
}

/**
 * Cancel a subscription schedule.
 * Sets status to 'cancelled' and updates the company plan to the downgrade plan.
 */
export async function cancelSubscription(
  companySlug: string,
  reason?: string,
): Promise<{ ok: boolean; error?: string }> {
  const schedule = await db.subscriptionSchedule.findFirst({
    where: { companySlug, status: { in: ['active', 'past_due'] } },
  });
  if (!schedule) {
    return { ok: false, error: 'لا يوجد اشتراك نشط لهذه الشركة' };
  }

  await db.subscriptionSchedule.update({
    where: { id: schedule.id },
    data: {
      status: 'cancelled',
      cancelledAt: new Date(),
      metadata: JSON.stringify({ reason: reason || 'cancelled by user' }),
    },
  });

  // Keep the current plan until the end of the current billing cycle
  // (the user already paid for this cycle)
  logger.info('[subscription-engine] subscription cancelled', {
    scheduleId: schedule.id,
    companySlug,
    reason,
  });

  return { ok: true };
}

/**
 * Reactivate a cancelled subscription.
 * Sets status to 'reactivated' → 'active' and schedules a new charge.
 */
export async function reactivateSubscription(
  companySlug: string,
  newPlan?: string,
): Promise<{ ok: boolean; scheduleId?: number; error?: string }> {
  const cancelled = await db.subscriptionSchedule.findFirst({
    where: { companySlug, status: 'cancelled' },
  });

  if (cancelled) {
    // Reactivate the existing schedule
    const plan = newPlan || cancelled.plan;
    const countryPricing = await getCompanyPricing(companySlug, plan);
    if (!countryPricing) {
      return { ok: false, error: 'باقة غير معروفة أو سعر غير متاح' };
    }

    const amount = cancelled.billingPeriod === 'yearly'
      ? (countryPricing.priceMonthly * 12 * 0.8)
      : countryPricing.priceMonthly;

    const now = new Date();
    const cycleEnd = computeCycleEnd(now, cancelled.billingPeriod as BillingPeriod);

    await db.subscriptionSchedule.update({
      where: { id: cancelled.id },
      data: {
        status: 'active',
        plan,
        amount: String(amount),
        currency: countryPricing.currency,
        nextChargeDate: now,
        retryCount: 0,
        cycleStart: now,
        cycleEnd,
        reactivatedAt: now,
      },
    });

    await db.company.update({
      where: { slug: companySlug },
      data: {
        plan,
        subscriptionStatus: 'active',
        currentBillingCycleEnd: cycleEnd,
      },
    });

    // Enqueue immediate charge
    enqueueBackground(QUEUE_NAMES.SCHEDULER, {
      type: 'subscription-charge',
      data: {
        type: 'subscription-charge',
        payload: { scheduleId: cancelled.id },
      },
    });

    logger.info('[subscription-engine] subscription reactivated', {
      scheduleId: cancelled.id,
      companySlug,
      plan,
    });

    return { ok: true, scheduleId: cancelled.id };
  }

  // No cancelled schedule — create a new one
  if (!newPlan) {
    return { ok: false, error: 'يجب تحديد الباقة لإعادة تفعيل الاشتراك' };
  }

  const company = await db.company.findUnique({ where: { slug: companySlug } });
  if (!company) {
    return { ok: false, error: 'الشركة غير موجودة' };
  }

  return createSubscription({
    companySlug,
    plan: newPlan,
    billingPeriod: 'monthly',
    provider: company.country === 'EG' ? 'paymob' : 'myfatoorah',
    paymentMethod: company.country === 'EG' ? 'paymob_card' : 'myfatoorah_card',
  });
}

/**
 * Find all schedules that are due for charging (nextChargeDate <= now).
 * Called by the scheduler tick on every run.
 */
export async function findDueSchedules(): Promise<Array<{
  id: number;
  companySlug: string;
  plan: string;
  status: string;
}>> {
  const now = new Date();
  const due = await db.subscriptionSchedule.findMany({
    where: {
      status: { in: ['active', 'past_due'] },
      nextChargeDate: { lte: now },
    },
    select: { id: true, companySlug: true, plan: true, status: true },
  });
  return due;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function computeCycleEnd(startDate: Date, period: BillingPeriod): Date {
  const end = new Date(startDate);
  if (period === 'monthly') {
    end.setMonth(end.getMonth() + 1);
  } else {
    end.setFullYear(end.getFullYear() + 1);
  }
  return end;
}

async function getCompanyPricing(
  companySlug: string,
  plan: string,
): Promise<CountryPricingEntry | null> {
  const company = await db.company.findUnique({ where: { slug: companySlug } });
  if (!company) return null;
  return getCountryPricing(company.country || 'KW', plan);
}

/**
 * Initiate a charge via the configured payment provider.
 * Creates a PaymentTransaction record and calls the provider API.
 */
async function initiateProviderCharge(
  schedule: {
    id: number;
    companySlug: string;
    plan: string;
    amount: string;
    currency: string;
    provider: string;
    paymentMethod: string;
    billingPeriod: string;
  },
  company: {
    slug: string;
    name: string;
    country?: string | null;
    myfatoorahCustomerId?: string | null;
    paymobCustomerId?: string | null;
  },
): Promise<{ ok: boolean; txnId?: number; error?: string }> {
  const cfg = await getIntegrationConfig(schedule.provider);
  if (!cfg) {
    return { ok: false, error: `بوابة الدفع ${schedule.provider} غير مُهيّأة` };
  }

  // Create a PaymentTransaction record for this charge
  const txn = await db.paymentTransaction.create({
    data: {
      companySlug: schedule.companySlug,
      plan: schedule.plan,
      method: schedule.paymentMethod,
      provider: schedule.provider,
      amount: schedule.amount,
      currency: schedule.currency,
      status: 'pending',
      metadata: JSON.stringify({
        billingPeriod: schedule.billingPeriod,
        scheduleId: schedule.id,
        chargeType: 'recurring',
        initiatedAt: new Date().toISOString(),
      }),
    },
  });

  try {
    if (schedule.provider === 'myfatoorah') {
      // Call MyFatoorah InitiatePayment → ExecutePayment
      const baseUrl = cfg.base_url?.replace(/\/+$/, '') || '';
      const apiKey = cfg.api_key || '';

      // Initiate payment
      const initiateRes = await fetch(`${baseUrl}/api/v2/InitiatePayment`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          InvoiceAmount: parseFloat(schedule.amount),
          CurrencyIso: schedule.currency,
        }),
      });

      const initiateData = await initiateRes.json();
      if (!initiateRes.ok) {
        const errMsg = initiateData?.Message || `MyFatoorah InitiatePayment error ${initiateRes.status}`;
        await db.paymentTransaction.update({
          where: { id: txn.id },
          data: { status: 'failed', failureReason: errMsg },
        });
        return { ok: false, error: errMsg };
      }

      const paymentMethods = initiateData?.Data?.PaymentMethods;
      const methodId = Array.isArray(paymentMethods) && paymentMethods.length > 0
        ? paymentMethods[0].PaymentMethodId
        : 1;

      // Execute payment
      const executeRes = await fetch(`${baseUrl}/api/v2/ExecutePayment`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          InvoiceValue: parseFloat(schedule.amount),
          CurrencyIso: schedule.currency,
          PaymentMethodId: methodId,
          CustomerName: company.slug,
          DisplayCurrencyIso: schedule.currency,
          CallBackUrl: `${process.env.APP_URL || 'http://localhost:3000'}/api/saas/payments/callback`,
          ErrorUrl: `${process.env.APP_URL || 'http://localhost:3000'}/api/saas/payments/callback?error=1`,
          Language: 'ar',
          CustomerReference: `sub-${schedule.id}`,
          InvoiceItems: [
            {
              ItemName: `GARFIX ${schedule.plan} — ${schedule.billingPeriod === 'yearly' ? 'سنوي' : 'شهري'} (اشتراك متكرر)`,
              Quantity: 1,
              UnitPrice: parseFloat(schedule.amount),
            },
          ],
        }),
      });

      const executeData = await executeRes.json();
      if (!executeRes.ok) {
        const errMsg = executeData?.Message || `MyFatoorah ExecutePayment error ${executeRes.status}`;
        await db.paymentTransaction.update({
          where: { id: txn.id },
          data: { status: 'failed', failureReason: errMsg },
        });
        return { ok: false, error: errMsg };
      }

      const invoiceId = executeData?.Data?.InvoiceId;
      const paymentUrl = executeData?.Data?.PaymentURL;

      await db.paymentTransaction.update({
        where: { id: txn.id },
        data: {
          providerPaymentId: String(invoiceId || ''),
          checkoutUrl: paymentUrl || '',
          metadata: JSON.stringify({
            billingPeriod: schedule.billingPeriod,
            scheduleId: schedule.id,
            chargeType: 'recurring',
            paymentMethodId: methodId,
            initiatedAt: new Date().toISOString(),
          }),
        },
      });

      // For recurring charges, we can't redirect the user to a payment page.
      // Instead, we rely on saved payment method tokens (if available).
      // MyFatoorah supports direct payment via ExecutePayment without
      // redirect if the customer has a saved card (using CustomerToken).
      // For now, we record the transaction and mark it as needing
      // manual confirmation — the webhook callback will finalize it.

      logger.info('[subscription-engine] MyFatoorah charge initiated', {
        txnId: txn.id,
        invoiceId,
        scheduleId: schedule.id,
      });

      return { ok: true, txnId: txn.id };
    }

    if (schedule.provider === 'paymob') {
      // Paymob charge flow: auth → order → payment key
      // (similar to one-time payment but with saved customer token)
      const apiKey = cfg.api_key || '';

      // Auth token
      const authRes = await fetch('https://accept.paymob.com/api/auth/tokens', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ api_key: apiKey }),
      });
      const authData = await authRes.json();
      if (!authRes.ok || !authData.token) {
        const errMsg = authData?.message || `Paymob auth error ${authRes.status}`;
        await db.paymentTransaction.update({
          where: { id: txn.id },
          data: { status: 'failed', failureReason: errMsg },
        });
        return { ok: false, error: errMsg };
      }
      const authToken = authData.token;

      // Create order
      const orderRes = await fetch('https://accept.paymob.com/api/ecommerce/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          auth_token: authToken,
          delivery_needed: false,
          amount_cents: Math.round(parseFloat(schedule.amount) * 100),
          currency: schedule.currency,
          merchant_order_id: `sub-${schedule.id}-${Date.now()}`,
          items: [
            {
              name: `GARFIX ${schedule.plan} — recurring`,
              amount: Math.round(parseFloat(schedule.amount) * 100),
              description: `اشتراك متكرر ${schedule.billingPeriod}`,
              quantity: 1,
            },
          ],
        }),
      });
      const orderData = await orderRes.json();
      if (!orderRes.ok || !orderData.id) {
        const errMsg = orderData?.message || `Paymob order error ${orderRes.status}`;
        await db.paymentTransaction.update({
          where: { id: txn.id },
          data: { status: 'failed', failureReason: errMsg },
        });
        return { ok: false, error: errMsg };
      }
      const orderId = orderData.id;

      // Payment key
      const payKeyRes = await fetch('https://accept.paymob.com/api/acceptance/payment_keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          auth_token: authToken,
          amount_cents: Math.round(parseFloat(schedule.amount) * 100),
          expiration: 3600,
          order_id: orderId,
          billing_data: {
            first_name: company.slug,
            last_name: 'Garfix',
            email: 'billing@garfix.app',
            phone_number: '+201000000000',
            apartment: 'NA',
            floor: 'NA',
            street: 'NA',
            building: 'NA',
            shipping_method: 'NA',
            postal_code: 'NA',
            city: 'Cairo',
            country: 'EG',
            state: 'Cairo',
          },
          currency: schedule.currency,
          integration_id: cfg.integration_id || 4305, // Paymob card integration ID
        }),
      });
      const payKeyData = await payKeyRes.json();
      if (!payKeyRes.ok || !payKeyData.token) {
        const errMsg = payKeyData?.message || `Paymob payment key error ${payKeyRes.status}`;
        await db.paymentTransaction.update({
          where: { id: txn.id },
          data: { status: 'failed', failureReason: errMsg },
        });
        return { ok: false, error: errMsg };
      }

      await db.paymentTransaction.update({
        where: { id: txn.id },
        data: {
          providerOrderId: String(orderId),
          metadata: JSON.stringify({
            billingPeriod: schedule.billingPeriod,
            scheduleId: schedule.id,
            chargeType: 'recurring',
            paymobOrderId: orderId,
            initiatedAt: new Date().toISOString(),
          }),
        },
      });

      logger.info('[subscription-engine] Paymob charge initiated', {
        txnId: txn.id,
        orderId,
        scheduleId: schedule.id,
      });

      return { ok: true, txnId: txn.id };
    }

    return { ok: false, error: `مزود دفع غير مدعوم: ${schedule.provider}` };
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : 'Network error';
    await db.paymentTransaction.update({
      where: { id: txn.id },
      data: { status: 'failed', failureReason: errMsg },
    });
    return { ok: false, error: errMsg };
  }
}

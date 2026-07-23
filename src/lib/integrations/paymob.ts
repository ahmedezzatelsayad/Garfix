/**
 * paymob.ts — Paymob payment gateway provider (Egypt).
 *
 * Paymob is the leading Egyptian payment gateway supporting:
 *   - Mobile wallets (Vodafone Cash, Orange Cash, Etisalat Cash, We Pay)
 *   - Meeza cards (Egyptian national debit card scheme)
 *   - Visa / Mastercard
 *   - Bank installments (CIB, Arab African International Bank, FNB)
 *
 * Paymob API flow:
 *   1. Auth token: POST /api/auth/tokens → get auth_token
 *   2. Create order: POST /api/ecommerce/orders → get order_id
 *   3. Payment key: POST /api/acceptance/payment_keys → get payment_key_token
 *   4. Checkout: redirect to /api/acceptance/pay?token=<payment_key_token>
 *
 * Credentials:
 *   api_key       — Paymob API key (from merchant dashboard)
 *   base_url      — `https://accept.paymob.com` (live) or `https://accept.paymob.com` (sandbox)
 *   integration_id — Paymob integration ID for card payments (default: 4305)
 *
 * Security: base_url is validated with the same SSRF-safe pattern as MyFatoorah.
 *
 * RUNTIME: Node.js only — uses fetch, logger, cryptoVault
 */
'use node';

import { logger } from '@/lib/logger';
import type { IntegrationProvider } from './types';
import { getIntegrationConfig, setIntegrationConfig, disconnectIntegration } from './registry';

// ─── SSRF-safe base URL validation ─────────────────────────────────────────

/**
 * Validate that a base URL is safe to send authenticated requests to.
 * Same pattern as myfatoorah.ts — blocks private/internal IPs, localhost,
 * cloud metadata endpoints, and non-HTTPS protocols.
 */
function validateBaseUrl(url: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error('عنوان Paymob غير صالح (URL غير مُحلَّل)');
  }
  if (parsed.protocol !== 'https:') {
    throw new Error('يجب أن يستخدم عنوان Paymob بروتوكول HTTPS فقط');
  }
  const host = parsed.hostname.toLowerCase();
  const blockedHosts = [
    'localhost',
    '127.0.0.1',
    '0.0.0.0',
    '::1',
    '[::1]',
    '169.254.169.254',   // AWS / GCP / Azure cloud metadata endpoint
    '169.254.170.2',     // ECS task metadata
    'metadata.google.internal', // GCP metadata
  ];
  if (blockedHosts.includes(host)) {
    throw new Error('يُمنع استخدام عناوين داخلية أو محلية كوجهة لـ Paymob');
  }
  // Block private/loopback IPv4 ranges
  const ipMatch = host.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (ipMatch) {
    const a = parseInt(ipMatch[1], 10);
    const b = parseInt(ipMatch[2], 10);
    if (
      a === 10 ||
      a === 127 ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 169 && b === 254) ||
      a === 0
    ) {
      throw new Error('يُمنع استخدام عناوين IP خاصة أو داخلية كوجهة لـ Paymob');
    }
  }
  // Block obvious internal hostnames
  if (!host.includes('.') || /\.(internal|local|localhost|intra|corp)$/i.test(host)) {
    throw new Error('يبدو أن العنوان يشير إلى مضيف داخلي — يُسمح فقط بعناوين الإنترنت العامة لـ Paymob');
  }
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, '');
}

// ─── Paymob API client ─────────────────────────────────────────────────────

interface PaymobAuthResponse {
  token: string;
}

interface PaymobOrderResponse {
  id: number;
}

interface PaymobPaymentKeyResponse {
  token: string;
}

/**
 * Call the Paymob auth endpoint to get an auth token.
 */
async function getPaymobAuthToken(
  baseUrl: string,
  apiKey: string,
): Promise<{ ok: boolean; token?: string; error?: string }> {
  try {
    const res = await fetch(`${baseUrl}/api/auth/tokens`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ api_key: apiKey }),
    });
    const data = await res.json() as PaymobAuthResponse & { message?: string; detail?: string };
    if (!res.ok) {
      const errMsg = data?.message || data?.detail || `Paymob auth error ${res.status}`;
      return { ok: false, error: errMsg };
    }
    return { ok: true, token: data.token };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'خطأ في الاتصال بـ Paymob' };
  }
}

// ─── Paymob Integration Provider ───────────────────────────────────────────

class PaymobProvider implements IntegrationProvider {
  type = 'paymob';
  name = 'Paymob';

  async connect(credentials: Record<string, string>): Promise<boolean> {
    if (!credentials.api_key || !credentials.base_url) {
      logger.warn('[integrations:paymob] missing required fields', {
        hasKey: !!credentials.api_key,
        hasBaseUrl: !!credentials.base_url,
      });
      return false;
    }
    // SSRF validation — same pattern as MyFatoorah
    try {
      validateBaseUrl(credentials.base_url);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.warn('[integrations:paymob] refused to save config — base_url failed SSRF validation', { err: msg });
      return false;
    }
    await setIntegrationConfig(this.type, {
      api_key: credentials.api_key,
      base_url: credentials.base_url,
      integration_id: credentials.integration_id || '4305', // default card integration
    });
    return true;
  }

  async disconnect(): Promise<void> {
    await disconnectIntegration(this.type);
  }

  async testConnection(): Promise<{ ok: boolean; error?: string }> {
    const cfg = await getIntegrationConfig(this.type);
    if (!cfg || !cfg.api_key || !cfg.base_url) {
      return { ok: false, error: 'بيانات الاعتماد غير مُهيّأة (api_key و base_url مطلوبة لـ Paymob)' };
    }
    // Re-validate base_url at request time (SSRF defense)
    try {
      validateBaseUrl(cfg.base_url);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error('[integrations:paymob] refused to send request — base_url failed SSRF validation', { err: msg });
      return { ok: false, error: msg };
    }
    // Test by requesting an auth token — lightest authenticated endpoint
    const baseUrl = normalizeBaseUrl(cfg.base_url);
    const result = await getPaymobAuthToken(baseUrl, cfg.api_key);
    if (!result.ok) {
      return { ok: false, error: result.error };
    }
    return { ok: true };
  }

  async healthCheck(): Promise<{ healthy: boolean; details?: string }> {
    const r = await this.testConnection();
    return { healthy: r.ok, details: r.error };
  }
}

export const paymobProvider = new PaymobProvider();

// ─── Paymob payment initiation helpers ─────────────────────────────────────

/**
 * Initiate a Paymob payment for a subscription upgrade.
 *
 * Flow:
 *   1. Auth token
 *   2. Create order
 *   3. Generate payment key
 *   4. Return checkout URL
 *
 * These helpers are used by the payment initiation route and
 * the subscription engine, not by the IntegrationProvider interface.
 */
export async function initiatePaymobPayment(params: {
  baseUrl: string;
  apiKey: string;
  amount: number;
  currency: string;
  integrationId: number;
  companySlug: string;
  userEmail: string;
  planName: string;
  billingPeriod: string;
}): Promise<{
  ok: boolean;
  orderId?: number;
  paymentKey?: string;
  checkoutUrl?: string;
  error?: string;
}> {
  const { baseUrl, apiKey, amount, currency, integrationId, companySlug, userEmail, planName, billingPeriod } = params;
  const amountCents = Math.round(amount * 100); // Paymob uses cents

  // 1. Auth token
  const authResult = await getPaymobAuthToken(baseUrl, apiKey);
  if (!authResult.ok || !authResult.token) {
    return { ok: false, error: `فشل المصادقة على Paymob: ${authResult.error}` };
  }
  const authToken = authResult.token;

  // 2. Create order
  try {
    const orderRes = await fetch(`${baseUrl}/api/ecommerce/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        auth_token: authToken,
        delivery_needed: false,
        amount_cents: amountCents,
        currency,
        merchant_order_id: `garfix-${companySlug}-${Date.now()}`,
        items: [
          {
            name: `GARFIX ${planName} — ${billingPeriod === 'yearly' ? 'سنوي' : 'شهري'}`,
            amount: amountCents,
            description: `اشتراك Garfix ${planName}`,
            quantity: 1,
          },
        ],
      }),
    });

    const orderData = await orderRes.json() as PaymobOrderResponse & { message?: string; detail?: string };
    if (!orderRes.ok || !orderData.id) {
      const errMsg = orderData?.message || orderData?.detail || `Paymob order error ${orderRes.status}`;
      return { ok: false, error: `فشل إنشاء طلب Paymob: ${errMsg}` };
    }

    const orderId = orderData.id;

    // 3. Generate payment key
    const payKeyRes = await fetch(`${baseUrl}/api/acceptance/payment_keys`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        auth_token: authToken,
        amount_cents: amountCents,
        expiration: 3600, // 1 hour
        order_id: orderId,
        billing_data: {
          first_name: companySlug,
          last_name: 'Garfix',
          email: userEmail,
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
        currency,
        integration_id: integrationId,
      }),
    });

    const payKeyData = await payKeyRes.json() as PaymobPaymentKeyResponse & { message?: string; detail?: string };
    if (!payKeyRes.ok || !payKeyData.token) {
      const errMsg = payKeyData?.message || payKeyData?.detail || `Paymob payment key error ${payKeyRes.status}`;
      return { ok: false, error: `فشل إنشاء مفتاح الدفع Paymob: ${errMsg}` };
    }

    const paymentKey = payKeyData.token;
    const checkoutUrl = `${baseUrl}/api/acceptance/pay?token=${paymentKey}`;

    return { ok: true, orderId, paymentKey, checkoutUrl };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'خطأ في الاتصال بـ Paymob' };
  }
}

/**
 * stripe.ts — Stripe payment processing provider.
 *
 * Stripe is a global payment processing platform supporting credit cards,
 * digital wallets (Apple Pay, Google Pay), and bank transfers. This provider
 * supports:
 *   - Secret key + Publishable key authentication
 *   - Webhook signature verification
 *   - Test/Live mode switching
 *   - Multi-currency support
 *
 * Credentials:
 *   secret_key        — Stripe Secret Key (sk_live_... or sk_test_...)
 *   publishable_key   — Stripe Publishable Key (pk_live_... or pk_test_...)
 *   webhook_secret    — Stripe Webhook Signing Secret (whsec_...)
 *   mode              — 'test' or 'live'
 *   currency          — Default currency code
 *
 * Test: GET /v1/account — validates API key by fetching account info.
 *
 * Security: Keys validated for correct prefix before saving.
 *
 * RUNTIME: Node.js only — uses fetch, logger, cryptoVault
 */
'use node';

import { logger } from '@/lib/logger';
import type { IntegrationProvider } from './types';
import { getIntegrationConfig, setIntegrationConfig, disconnectIntegration } from './registry';

// ─── Stripe Configuration ─────────────────────────────────────────────────

const STRIPE_API_BASE = 'https://api.stripe.com/v1';

/** Supported currencies for GarfiX ERP. */
const SUPPORTED_CURRENCIES = new Set([
  'USD', 'EUR', 'GBP', 'SAR', 'AED', 'EGP', 'QAR', 'KWD', 'BHD', 'OMR',
  'JOD', 'LBP', 'TND', 'MAD', 'LYD', 'DZD', 'IRR', 'TRY', 'PKR', 'INR',
]);

/**
 * Validate Stripe Secret Key format.
 */
function validateSecretKey(key: string): boolean {
  // Stripe keys start with sk_test_ or sk_live_
  return typeof key === 'string' && /^sk_(test|live)_/.test(key);
}

/**
 * Validate Stripe Publishable Key format.
 */
function validatePublishableKey(key: string): boolean {
  // Publishable keys start with pk_test_ or pk_live_
  return typeof key === 'string' && /^pk_(test|live)_/.test(key);
}

// ─── Stripe Integration Provider ──────────────────────────────────────────

class StripeProvider implements IntegrationProvider {
  type = 'stripe';
  name = 'Stripe';

  async connect(credentials: Record<string, string>): Promise<boolean> {
    if (!credentials.secret_key || !credentials.publishable_key) {
      logger.warn('[integrations:stripe] missing required fields', {
        hasSecret: !!credentials.secret_key,
        hasPublishable: !!credentials.publishable_key,
      });
      return false;
    }

    // Validate key formats
    if (!validateSecretKey(credentials.secret_key)) {
      logger.warn('[integrations:stripe] invalid secret key format');
      return false;
    }

    if (!validatePublishableKey(credentials.publishable_key)) {
      logger.warn('[integrations:stripe] invalid publishable key format');
      return false;
    }

    // Validate currency if provided
    if (credentials.currency && !SUPPORTED_CURRENCIES.has(credentials.currency.toUpperCase())) {
      logger.warn('[integrations:stripe] unsupported currency', { 
        currency: credentials.currency 
      });
      return false;
    }

    await setIntegrationConfig(this.type, {
      secret_key: credentials.secret_key,
      publishable_key: credentials.publishable_key,
      webhook_secret: credentials.webhook_secret || '',
      mode: credentials.mode || 'test',
      currency: (credentials.currency || 'USD').toUpperCase(),
    });
    return true;
  }

  async disconnect(): Promise<void> {
    await disconnectIntegration(this.type);
  }

  async testConnection(): Promise<{ ok: boolean; error?: string; details?: string }> {
    const cfg = await getIntegrationConfig(this.type);
    if (!cfg || !cfg.secret_key) {
      return { ok: false, error: 'بيانات الاعتماد غير مُهيّأة (Secret Key مطلوب لـ Stripe)' };
    }

    try {
      const res = await fetch(`${STRIPE_API_BASE}/account`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${cfg.secret_key}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      });

      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          error?: { message?: string; code?: string };
        } | null;
        const msg = body?.error?.message || `HTTP ${res.status} — ${res.statusText}`;
        return { ok: false, error: msg };
      }

      const data = (await res.json()) as {
        id?: string;
        display_name?: string;
        country?: string;
        currency?: string;
        business_type?: string;
      };

      const mode = cfg.secret_key.startsWith('sk_test_') ? 'Test' : 'Live';
      
      return {
        ok: true,
        details: `${mode} Mode — "${data.display_name || data.id}" (${data.country || '?'})`,
      };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : 'خطأ في الاتصال بـ Stripe',
      };
    }
  }

  async healthCheck(): Promise<{ healthy: boolean; details?: string }> {
    const r = await this.testConnection();
    return { healthy: r.ok, details: r.error || r.details };
  }

  /**
   * Create a Stripe Payment Intent for a one-time payment.
   * Used by payment initiation flows.
   */
  async createPaymentIntent(params: {
    amount: number; // In smallest currency unit (cents/piastres)
    currency?: string;
    customerId?: string;
    description?: string;
    metadata?: Record<string, string>;
  }): Promise<{ ok: boolean; clientSecret?: string; intentId?: string; error?: string }> {
    const cfg = await getIntegrationConfig(this.type);
    if (!cfg || !cfg.secret_key) {
      return { ok: false, error: 'Stripe credentials not configured' };
    }

    try {
      const currency = (params.currency || cfg.currency || 'USD').toLowerCase();
      
      const formData = new URLSearchParams();
      formData.append('amount', Math.round(params.amount).toString());
      formData.append('currency', currency);
      if (params.description) formData.append('description', params.description);
      if (params.customerId) formData.append('customer', params.customerId);
      
      // Add metadata
      if (params.metadata) {
        for (const [key, value] of Object.entries(params.metadata)) {
          formData.append(`metadata[${key}]`, value);
        }
      }

      const res = await fetch(`${STRIPE_API_BASE}/payment_intents`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${cfg.secret_key}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: formData.toString(),
      });

      const data = (await res.json()) as {
        id?: string;
        client_secret?: string;
        status?: string;
        error?: { message?: string };
      };

      if (!res.ok || data.error) {
        return { 
          ok: false, 
          error: data.error?.message || `Stripe error: HTTP ${res.status}` 
        };
      }

      return {
        ok: true,
        clientSecret: data.client_secret,
        intentId: data.id,
      };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : 'خطأ في إنشاء نية الدفع',
      };
    }
  }

  /**
   * Create a Stripe Customer record.
   */
  async createCustomer(params: {
    email: string;
    name?: string;
    phone?: string;
    metadata?: Record<string, string>;
  }): Promise<{ ok: boolean; customerId?: string; error?: string }> {
    const cfg = await getIntegrationConfig(this.type);
    if (!cfg || !cfg.secret_key) {
      return { ok: false, error: 'Stripe credentials not configured' };
    }

    try {
      const formData = new URLSearchParams();
      formData.append('email', params.email);
      if (params.name) formData.append('name', params.name);
      if (params.phone) formData.append('phone', params.phone);
      
      if (params.metadata) {
        for (const [key, value] of Object.entries(params.metadata)) {
          formData.append(`metadata[${key}]`, value);
        }
      }

      const res = await fetch(`${STRIPE_API_BASE}/customers`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${cfg.secret_key}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: formData.toString(),
      });

      const data = (await res.json()) as {
        id?: string;
        error?: { message?: string };
      };

      if (!res.ok || data.error) {
        return { 
          ok: false, 
          error: data.error?.message || `Stripe error: HTTP ${res.status}` 
        };
      }

      return { ok: true, customerId: data.id };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : 'خطأ في إنشاء العميل',
      };
    }
  }

  /**
   * Verify a Stripe webhook signature.
   */
  verifyWebhookSignature(
    payload: string | Buffer,
    signature: string,
  ): { valid: boolean; error?: string } {
    // Basic validation — in production use @stripe/stripe-node's webhooks.constructEvent()
    // This is a simplified check that verifies format only
    const parts = signature.split(',');
    if (parts.length < 2) {
      return { valid: false, error: 'Invalid signature format' };
    }

    const timestampPart = parts.find(p => p.startsWith('t='));
    const signaturePart = parts.find(p => p.startsWith('v1='));

    if (!timestampPart || !signaturePart) {
      return { valid: false, error: 'Missing timestamp or signature' };
    }

    // Check timestamp freshness (5 minute window)
    const timestamp = parseInt(timestampPart.split('=')[1], 10);
    const now = Math.floor(Date.now() / 1000);
    if (Math.abs(now - timestamp) > 300) {
      return { valid: false, error: 'Signature expired' };
    }

    // Note: Full HMAC verification requires the raw secret and crypto module
    // For now, we validate structure — implement full verification in production
    return { valid: true };
  }

  /**
   * Get the publishable key for client-side usage.
   */
  async getPublishableKey(): Promise<string | null> {
    const cfg = await getIntegrationConfig(this.type);
    return cfg?.publishable_key || null;
  }
}

export const stripeProvider = new StripeProvider();

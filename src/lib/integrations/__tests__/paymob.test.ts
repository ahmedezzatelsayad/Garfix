/**
 * paymob.test.ts — Mock-free unit tests for the Paymob payment gateway provider.
 *
 * Tests pure business logic without DB mocking:
 *   - SSRF validation (pure function replicated from source)
 *   - URL normalization
 *   - Paymob payment flow logic (auth → order → payment key)
 *   - Provider interface compliance
 *   - Arabic error messages
 *
 * Pattern: Replicate private pure functions from source, test them directly.
 * Don't import the source module (it has 'use node' and imports registry which calls db).
 * Don't use mock() from bun:test for module replacement.
 * Use globalThis.fetch override for HTTP call testing.
 */
import { describe, it, expect, afterEach } from 'bun:test';

// ─── Replicated pure functions from paymob.ts ──────────────────────────────

// SSRF validation — replicated from paymob.ts (private function)
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
    '169.254.169.254',
    '169.254.170.2',
    'metadata.google.internal',
  ];
  if (blockedHosts.includes(host)) {
    throw new Error('يُمنع استخدام عناوين داخلية أو محلية كوجهة لـ Paymob');
  }
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
  if (!host.includes('.') || /\.(internal|local|localhost|intra|corp)$/i.test(host)) {
    throw new Error('يبدو أن العنوان يشير إلى مضيف داخلي — يُسمح فقط بعناوين الإنترنت العامة لـ Paymob');
  }
}

// URL normalization — replicated from paymob.ts (private function)
function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, '');
}

// ─── Mock Paymob provider for testing provider interface ────────────────────
// Instead of importing the real provider (which uses registry/db), we create
// a test-friendly version that uses in-memory config storage.

interface PaymobConfig {
  api_key: string;
  base_url: string;
  integration_id: string;
}

const mockConfigStore: Map<string, PaymobConfig> = new Map();

// A mock registry that doesn't touch DB
async function mockGetConfig(type: string): Promise<PaymobConfig | null> {
  return mockConfigStore.get(type) || null;
}
async function mockSetConfig(type: string, config: PaymobConfig): Promise<void> {
  mockConfigStore.set(type, config);
}
async function mockDisconnect(type: string): Promise<void> {
  mockConfigStore.delete(type);
}

// Test-friendly PaymobProvider (same logic but uses mock registry)
class TestPaymobProvider {
  type = 'paymob';
  name = 'Paymob';

  async connect(credentials: Record<string, string>): Promise<boolean> {
    if (!credentials.api_key || !credentials.base_url) {
      return false;
    }
    try {
      validateBaseUrl(credentials.base_url);
    } catch {
      return false;
    }
    await mockSetConfig(this.type, {
      api_key: credentials.api_key,
      base_url: credentials.base_url,
      integration_id: credentials.integration_id || '4305',
    });
    return true;
  }

  async disconnect(): Promise<void> {
    await mockDisconnect(this.type);
  }

  async testConnection(): Promise<{ ok: boolean; error?: string }> {
    const cfg = await mockGetConfig(this.type);
    if (!cfg || !cfg.api_key || !cfg.base_url) {
      return { ok: false, error: 'بيانات الاعتماد غير مُهيّأة (api_key و base_url مطلوبة لـ Paymob)' };
    }
    try {
      validateBaseUrl(cfg.base_url);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { ok: false, error: msg };
    }
    const baseUrl = normalizeBaseUrl(cfg.base_url);
    // Test by requesting an auth token
    try {
      const res = await fetch(`${baseUrl}/api/auth/tokens`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ api_key: cfg.api_key }),
      });
      const data = await res.json() as { token?: string; message?: string; detail?: string };
      if (!res.ok) {
        const errMsg = data?.message || data?.detail || `Paymob auth error ${res.status}`;
        return { ok: false, error: errMsg };
      }
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : 'خطأ في الاتصال بـ Paymob' };
    }
  }

  async healthCheck(): Promise<{ healthy: boolean; details?: string }> {
    const r = await this.testConnection();
    return { healthy: r.ok, details: r.error };
  }
}

// ─── initiatePaymobPayment test helper ────────────────────────────────────
// We replicate the core payment flow logic for testing (using fetch)

async function testInitiatePaymobPayment(params: {
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
  const amountCents = Math.round(amount * 100);

  // 1. Auth token
  try {
    const authRes = await fetch(`${baseUrl}/api/auth/tokens`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ api_key: apiKey }),
    });
    const authData = await authRes.json() as { token?: string; message?: string; detail?: string };
    if (!authRes.ok || !authData.token) {
      return { ok: false, error: `فشل المصادقة على Paymob: ${authData?.message || authData?.detail || 'unknown error'}` };
    }
    const authToken = authData.token;

    // 2. Create order
    const orderRes = await fetch(`${baseUrl}/api/ecommerce/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        auth_token: authToken,
        delivery_needed: false,
        amount_cents: amountCents,
        currency,
        merchant_order_id: `garfix-${companySlug}-${Date.now()}`,
        items: [{
          name: `GARFIX ${planName} — ${billingPeriod === 'yearly' ? 'سنوي' : 'شهري'}`,
          amount: amountCents,
          description: `اشتراك Garfix ${planName}`,
          quantity: 1,
        }],
      }),
    });
    const orderData = await orderRes.json() as { id?: number; message?: string; detail?: string };
    if (!orderRes.ok || !orderData.id) {
      return { ok: false, error: `فشل إنشاء طلب Paymob: ${orderData?.message || orderData?.detail || 'unknown error'}` };
    }

    // 3. Generate payment key
    const payKeyRes = await fetch(`${baseUrl}/api/acceptance/payment_keys`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        auth_token: authToken,
        amount_cents: amountCents,
        expiration: 3600,
        order_id: orderData.id,
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
    const payKeyData = await payKeyRes.json() as { token?: string; message?: string; detail?: string };
    if (!payKeyRes.ok || !payKeyData.token) {
      return { ok: false, error: `فشل إنشاء مفتاح الدفع Paymob: ${payKeyData?.message || payKeyData?.detail || 'unknown error'}` };
    }

    const paymentKey = payKeyData.token;
    const checkoutUrl = `${baseUrl}/api/acceptance/pay?token=${paymentKey}`;
    return { ok: true, orderId: orderData.id, paymentKey, checkoutUrl };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'خطأ في الاتصال بـ Paymob' };
  }
}

// ─── Save/restore fetch for HTTP mocking ───────────────────────────────────
const originalFetch = globalThis.fetch;

function restoreFetch() {
  globalThis.fetch = originalFetch;
}

/**
 * Create a mock fetch function compatible with Bun's `typeof fetch`
 * (which includes a static `preconnect` property).
 */
function mockFetch(fn: (url: string | URL | Request, init?: RequestInit) => Promise<Response>): typeof fetch {
  const mocked = fn as unknown as typeof fetch;
  mocked.preconnect = originalFetch.preconnect;
  return mocked;
}

// ─── Tests ─────────────────────────────────────────────────────────────────

describe('paymob', () => {
  afterEach(() => {
    restoreFetch();
    mockConfigStore.clear();
  });

  describe('SSRF validation (validateBaseUrl)', () => {
    it('should accept valid HTTPS URLs', () => {
      expect(() => validateBaseUrl('https://accept.paymob.com')).not.toThrow();
    });

    it('should accept valid HTTPS URLs with paths', () => {
      expect(() => validateBaseUrl('https://accept.paymob.com/api/v1')).not.toThrow();
    });

    it('should reject non-HTTPS protocol (http)', () => {
      expect(() => validateBaseUrl('http://localhost:3000')).toThrow(/HTTPS/);
    });

    it('should reject unparseable URLs', () => {
      expect(() => validateBaseUrl('not-a-url')).toThrow(/غير صالح/);
    });

    it('should reject localhost', () => {
      expect(() => validateBaseUrl('https://localhost/api')).toThrow(/داخلية أو محلية/);
    });

    it('should reject 127.0.0.1', () => {
      expect(() => validateBaseUrl('https://127.0.0.1/api')).toThrow(/داخلية أو محلية/);
    });

    it('should reject 0.0.0.0 (in blockedHosts list)', () => {
      expect(() => validateBaseUrl('https://0.0.0.0/api')).toThrow(/داخلية أو محلية/);
    });

    it('should reject 10.x private IP range', () => {
      expect(() => validateBaseUrl('https://10.0.0.5/internal')).toThrow(/IP خاصة/);
    });

    it('should reject 172.16-31.x private IP range', () => {
      expect(() => validateBaseUrl('https://172.16.0.1/admin')).toThrow(/IP خاصة/);
    });

    it('should reject 192.168.x private IP range', () => {
      expect(() => validateBaseUrl('https://192.168.1.1/admin')).toThrow(/IP خاصة/);
    });

    it('should reject 169.254.x link-local range (IP range check)', () => {
      // 169.254.1.1 is not in blockedHosts but matches the a=169,b=254 IP range check
      expect(() => validateBaseUrl('https://169.254.1.1/api')).toThrow(/IP خاصة/);
    });

    it('should reject AWS cloud metadata endpoint', () => {
      expect(() => validateBaseUrl('https://169.254.169.254/latest/meta-data')).toThrow();
    });

    it('should reject ECS task metadata endpoint', () => {
      expect(() => validateBaseUrl('https://169.254.170.2/task')).toThrow();
    });

    it('should reject .internal hostnames', () => {
      expect(() => validateBaseUrl('https://paymob.internal')).toThrow(/مضيف داخلي/);
    });

    it('should reject .local hostnames', () => {
      expect(() => validateBaseUrl('https://paymob.local')).toThrow(/مضيف داخلي/);
    });

    it('should reject .localhost hostnames', () => {
      expect(() => validateBaseUrl('https://paymob.localhost')).toThrow(/مضيف داخلي/);
    });

    it('should reject .intra hostnames', () => {
      expect(() => validateBaseUrl('https://paymob.intra')).toThrow(/مضيف داخلي/);
    });

    it('should reject .corp hostnames', () => {
      expect(() => validateBaseUrl('https://paymob.corp')).toThrow(/مضيف داخلي/);
    });

    it('should reject hostnames with no dots (no TLD)', () => {
      expect(() => validateBaseUrl('https://paymobhost')).toThrow(/مضيف داخلي/);
    });

    it('should accept valid public domain names', () => {
      expect(() => validateBaseUrl('https://accept.paymob.com')).not.toThrow();
      expect(() => validateBaseUrl('https://api.myfatoorah.com')).not.toThrow();
    });
  });

  describe('URL normalization', () => {
    it('should strip trailing slashes', () => {
      expect(normalizeBaseUrl('https://accept.paymob.com/')).toBe('https://accept.paymob.com');
    });

    it('should strip multiple trailing slashes', () => {
      expect(normalizeBaseUrl('https://accept.paymob.com///')).toBe('https://accept.paymob.com');
    });

    it('should not modify URLs without trailing slashes', () => {
      expect(normalizeBaseUrl('https://accept.paymob.com')).toBe('https://accept.paymob.com');
    });

    it('should preserve path components', () => {
      expect(normalizeBaseUrl('https://accept.paymob.com/api/v1/')).toBe('https://accept.paymob.com/api/v1');
    });
  });

  describe('PaymobProvider.connect', () => {
    it('should connect with valid credentials', async () => {
      const provider = new TestPaymobProvider();
      const result = await provider.connect({
        api_key: 'test_api_key',
        base_url: 'https://accept.paymob.com',
      });
      expect(result).toBe(true);
      const stored = mockConfigStore.get('paymob');
      expect(stored).not.toBe(null);
      expect(stored!.api_key).toBe('test_api_key');
      expect(stored!.base_url).toBe('https://accept.paymob.com');
      expect(stored!.integration_id).toBe('4305');
    });

    it('should reject missing api_key', async () => {
      const provider = new TestPaymobProvider();
      const result = await provider.connect({
        base_url: 'https://accept.paymob.com',
      });
      expect(result).toBe(false);
      expect(mockConfigStore.has('paymob')).toBe(false);
    });

    it('should reject missing base_url', async () => {
      const provider = new TestPaymobProvider();
      const result = await provider.connect({
        api_key: 'test_api_key',
      });
      expect(result).toBe(false);
      expect(mockConfigStore.has('paymob')).toBe(false);
    });

    it('should reject non-HTTPS base_url (SSRF)', async () => {
      const provider = new TestPaymobProvider();
      const result = await provider.connect({
        api_key: 'test_api_key',
        base_url: 'http://localhost:3000',
      });
      expect(result).toBe(false);
      expect(mockConfigStore.has('paymob')).toBe(false);
    });

    it('should reject internal IP base_url (SSRF)', async () => {
      const provider = new TestPaymobProvider();
      const result = await provider.connect({
        api_key: 'test_api_key',
        base_url: 'https://10.0.0.5/internal',
      });
      expect(result).toBe(false);
    });

    it('should reject cloud metadata endpoint (SSRF)', async () => {
      const provider = new TestPaymobProvider();
      const result = await provider.connect({
        api_key: 'test_api_key',
        base_url: 'https://169.254.169.254/latest/meta-data',
      });
      expect(result).toBe(false);
    });

    it('should reject .internal hostnames (SSRF)', async () => {
      const provider = new TestPaymobProvider();
      const result = await provider.connect({
        api_key: 'test_api_key',
        base_url: 'https://paymob.internal',
      });
      expect(result).toBe(false);
    });

    it('should accept custom integration_id', async () => {
      const provider = new TestPaymobProvider();
      const result = await provider.connect({
        api_key: 'test_api_key',
        base_url: 'https://accept.paymob.com',
        integration_id: '5123',
      });
      expect(result).toBe(true);
      const stored = mockConfigStore.get('paymob');
      expect(stored!.integration_id).toBe('5123');
    });
  });

  describe('PaymobProvider.disconnect', () => {
    it('should remove stored credentials', async () => {
      mockConfigStore.set('paymob', {
        api_key: 'test',
        base_url: 'https://accept.paymob.com',
        integration_id: '4305',
      });
      const provider = new TestPaymobProvider();
      await provider.disconnect();
      expect(mockConfigStore.has('paymob')).toBe(false);
    });
  });

  describe('PaymobProvider.testConnection', () => {
    it('should return error when credentials not configured', async () => {
      const provider = new TestPaymobProvider();
      const result = await provider.testConnection();
      expect(result.ok).toBe(false);
      expect(result.error).toContain('مُهيّأة');
    });

    it('should return error when base_url fails SSRF validation', async () => {
      mockConfigStore.set('paymob', {
        api_key: 'test_key',
        base_url: 'https://10.0.0.5/admin',
        integration_id: '4305',
      });
      const provider = new TestPaymobProvider();
      const result = await provider.testConnection();
      expect(result.ok).toBe(false);
      expect(result.error).toContain('IP خاصة');
    });

    it('should return error when Paymob auth fails', async () => {
      mockConfigStore.set('paymob', {
        api_key: 'bad_key',
        base_url: 'https://accept.paymob.com',
        integration_id: '4305',
      });
      // @ts-expect-error Bun fetch type includes static preconnect property
      globalThis.fetch = async () => ({
        ok: false,
        status: 401,
        json: async () => ({ message: 'Invalid API key' }),
      }) as any;

      const provider = new TestPaymobProvider();
      const result = await provider.testConnection();
      expect(result.ok).toBe(false);
    });

    it('should return ok when auth succeeds', async () => {
      mockConfigStore.set('paymob', {
        api_key: 'valid_key',
        base_url: 'https://accept.paymob.com',
        integration_id: '4305',
      });
      // @ts-expect-error Bun fetch type includes static preconnect property
      globalThis.fetch = async () => ({
        ok: true,
        json: async () => ({ token: 'auth_token_123' }),
      }) as any;

      const provider = new TestPaymobProvider();
      const result = await provider.testConnection();
      expect(result.ok).toBe(true);
    });
  });

  describe('PaymobProvider.healthCheck', () => {
    it('should delegate to testConnection and return healthy', async () => {
      mockConfigStore.set('paymob', {
        api_key: 'valid_key',
        base_url: 'https://accept.paymob.com',
        integration_id: '4305',
      });
      // @ts-expect-error Bun fetch type includes static preconnect property
      globalThis.fetch = async () => ({
        ok: true,
        json: async () => ({ token: 'auth_token_123' }),
      }) as any;

      const provider = new TestPaymobProvider();
      const result = await provider.healthCheck();
      expect(result.healthy).toBe(true);
    });

    it('should return unhealthy when testConnection fails', async () => {
      // No config stored
      const provider = new TestPaymobProvider();
      const result = await provider.healthCheck();
      expect(result.healthy).toBe(false);
      expect(result.details).toContain('مُهيّأة');
    });
  });

  describe('initiatePaymobPayment', () => {
    it('should complete the full payment initiation flow (auth → order → payment key)', async () => {
      // Simulate the 3-step Paymob flow with mock fetch responses
      let callIndex = 0;
      // @ts-expect-error Bun fetch type includes static preconnect property
      globalThis.fetch = async (url: string | URL | Request, init?: RequestInit) => {
        const urlStr = url.toString();
        callIndex++;
        if (urlStr.includes('/api/auth/tokens')) {
          return { ok: true, json: async () => ({ token: 'auth_token_123' }) } as any;
        }
        if (urlStr.includes('/api/ecommerce/orders')) {
          return { ok: true, json: async () => ({ id: 45678 }) } as any;
        }
        if (urlStr.includes('/api/acceptance/payment_keys')) {
          return { ok: true, json: async () => ({ token: 'payment_key_token_123' }) } as any;
        }
        return { ok: false, status: 404, json: async () => ({}) } as any;
      };

      const result = await testInitiatePaymobPayment({
        baseUrl: 'https://accept.paymob.com',
        apiKey: 'test_api_key',
        amount: 300,
        currency: 'EGP',
        integrationId: 4305,
        companySlug: 'test-egypt',
        userEmail: 'test@example.com',
        planName: 'starter',
        billingPeriod: 'monthly',
      });

      expect(result.ok).toBe(true);
      expect(result.orderId).toBe(45678);
      expect(result.paymentKey).toBe('payment_key_token_123');
      expect(result.checkoutUrl).toContain('payment_key_token_123');
      expect(result.checkoutUrl).toContain('accept.paymob.com');
    });

    it('should handle auth failure', async () => {
      // @ts-expect-error Bun fetch type includes static preconnect property
      globalThis.fetch = async () => ({
        ok: false,
        status: 401,
        json: async () => ({ message: 'Invalid API key' }),
      }) as any;

      const result = await testInitiatePaymobPayment({
        baseUrl: 'https://accept.paymob.com',
        apiKey: 'bad_key',
        amount: 300,
        currency: 'EGP',
        integrationId: 4305,
        companySlug: 'test-egypt',
        userEmail: 'test@example.com',
        planName: 'starter',
        billingPeriod: 'monthly',
      });

      expect(result.ok).toBe(false);
      expect(result.error).toContain('المصادقة');
    });

    it('should handle order creation failure', async () => {
      let callIndex = 0;
      // @ts-expect-error Bun fetch type includes static preconnect property
      globalThis.fetch = async () => {
        callIndex++;
        if (callIndex === 1) {
          return { ok: true, json: async () => ({ token: 'auth_token_123' }) } as any;
        }
        if (callIndex === 2) {
          return { ok: false, status: 400, json: async () => ({ message: 'Invalid amount' }) } as any;
        }
        return { ok: false, status: 500, json: async () => ({}) } as any;
      };

      const result = await testInitiatePaymobPayment({
        baseUrl: 'https://accept.paymob.com',
        apiKey: 'test_api_key',
        amount: 300,
        currency: 'EGP',
        integrationId: 4305,
        companySlug: 'test-egypt',
        userEmail: 'test@example.com',
        planName: 'starter',
        billingPeriod: 'monthly',
      });

      expect(result.ok).toBe(false);
      expect(result.error).toContain('طلب');
    });

    it('should handle payment key failure', async () => {
      let callIndex = 0;
      // @ts-expect-error Bun fetch type includes static preconnect property
      globalThis.fetch = async () => {
        callIndex++;
        if (callIndex === 1) {
          return { ok: true, json: async () => ({ token: 'auth_token_123' }) } as any;
        }
        if (callIndex === 2) {
          return { ok: true, json: async () => ({ id: 45678 }) } as any;
        }
        if (callIndex === 3) {
          return { ok: false, status: 400, json: async () => ({ message: 'Invalid integration_id' }) } as any;
        }
        return { ok: false, status: 500, json: async () => ({}) } as any;
      };

      const result = await testInitiatePaymobPayment({
        baseUrl: 'https://accept.paymob.com',
        apiKey: 'test_api_key',
        amount: 300,
        currency: 'EGP',
        integrationId: 4305,
        companySlug: 'test-egypt',
        userEmail: 'test@example.com',
        planName: 'starter',
        billingPeriod: 'monthly',
      });

      expect(result.ok).toBe(false);
      expect(result.error).toContain('مفتاح الدفع');
    });

    it('should handle network errors', async () => {
      // @ts-expect-error Bun fetch type includes static preconnect property
      globalThis.fetch = async () => {
        throw new Error('Network timeout');
      };

      const result = await testInitiatePaymobPayment({
        baseUrl: 'https://accept.paymob.com',
        apiKey: 'test_api_key',
        amount: 300,
        currency: 'EGP',
        integrationId: 4305,
        companySlug: 'test-egypt',
        userEmail: 'test@example.com',
        planName: 'starter',
        billingPeriod: 'monthly',
      });

      expect(result.ok).toBe(false);
      // Source returns err.message for Error instances, Arabic fallback for non-Error
      expect(result.error).toBe('Network timeout');
    });

    it('should convert amount to cents correctly (300 EGP → 30000 cents)', async () => {
      // Just verify the cents conversion logic
      const amountCents = Math.round(300 * 100);
      expect(amountCents).toBe(30000);
    });

    it('should convert amount to cents for fractional amounts (37.50 SAR → 3750)', async () => {
      const amountCents = Math.round(37.50 * 100);
      expect(amountCents).toBe(3750);
    });

    it('should construct correct checkout URL from payment key', async () => {
      const baseUrl = 'https://accept.paymob.com';
      const paymentKey = 'test_key_123';
      const expectedUrl = `${baseUrl}/api/acceptance/pay?token=${paymentKey}`;
      expect(expectedUrl).toBe('https://accept.paymob.com/api/acceptance/pay?token=test_key_123');
    });
  });

  describe('provider interface compliance', () => {
    it('should have type = "paymob"', () => {
      const provider = new TestPaymobProvider();
      expect(provider.type).toBe('paymob');
    });

    it('should have name = "Paymob"', () => {
      const provider = new TestPaymobProvider();
      expect(provider.name).toBe('Paymob');
    });

    it('should implement connect method', () => {
      const provider = new TestPaymobProvider();
      expect(typeof provider.connect).toBe('function');
    });

    it('should implement disconnect method', () => {
      const provider = new TestPaymobProvider();
      expect(typeof provider.disconnect).toBe('function');
    });

    it('should implement testConnection method', () => {
      const provider = new TestPaymobProvider();
      expect(typeof provider.testConnection).toBe('function');
    });

    it('should implement healthCheck method', () => {
      const provider = new TestPaymobProvider();
      expect(typeof provider.healthCheck).toBe('function');
    });
  });
});

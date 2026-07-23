/**
 * paymob.test.ts — Unit tests for the Paymob payment gateway provider.
 *
 * Tests the IntegrationProvider interface:
 *   - connect (with SSRF validation)
 *   - disconnect
 *   - testConnection (with SSRF re-validation)
 *   - healthCheck
 *   - initiatePaymobPayment helper
 *
 * Mocks: getIntegrationConfig, setIntegrationConfig, disconnectIntegration, fetch
 *
 * Converted from vitest to bun:test — uses mock() and mock.fn() from bun:test.
 */
import { describe, it, expect, mock, beforeEach } from 'bun:test';

// Helper to track all mock functions for clearing between tests
const allMockFns: any[] = [];
function createMockFn() {
  const fn = mock.fn();
  allMockFns.push(fn);
  return fn as any;
}
function clearAllMocks() {
  for (const fn of allMockFns) {
    fn.mock.clear();
  }
}

// Mock registry
mock('@/lib/integrations/registry', () => ({
  getIntegrationConfig: createMockFn(),
  setIntegrationConfig: createMockFn(),
  disconnectIntegration: createMockFn(),
}));

// Mock logger
mock('@/lib/logger', () => ({
  logger: {
    info: createMockFn(),
    warn: createMockFn(),
    error: createMockFn(),
    debug: createMockFn(),
  },
}));

// Import after mocks
import { paymobProvider, initiatePaymobPayment } from '@/lib/integrations/paymob';
import { getIntegrationConfig, setIntegrationConfig, disconnectIntegration } from '@/lib/integrations/registry';

describe('paymob', () => {
  beforeEach(() => {
    clearAllMocks();
  });

  describe('PaymobProvider.connect', () => {
    it('should connect with valid credentials', async () => {
      const result = await paymobProvider.connect({
        api_key: 'test_api_key',
        base_url: 'https://accept.paymob.com',
      });

      expect(result).toBe(true);
      expect(setIntegrationConfig).toHaveBeenCalledWith('paymob', {
        api_key: 'test_api_key',
        base_url: 'https://accept.paymob.com',
        integration_id: '4305',
      });
    });

    it('should reject missing api_key', async () => {
      const result = await paymobProvider.connect({
        base_url: 'https://accept.paymob.com',
      });

      expect(result).toBe(false);
      expect(setIntegrationConfig).not.toHaveBeenCalled();
    });

    it('should reject missing base_url', async () => {
      const result = await paymobProvider.connect({
        api_key: 'test_api_key',
      });

      expect(result).toBe(false);
      expect(setIntegrationConfig).not.toHaveBeenCalled();
    });

    it('should reject non-HTTPS base_url (SSRF validation)', async () => {
      const result = await paymobProvider.connect({
        api_key: 'test_api_key',
        base_url: 'http://localhost:3000',
      });

      expect(result).toBe(false);
      expect(setIntegrationConfig).not.toHaveBeenCalled();
    });

    it('should reject internal IP base_url (SSRF validation)', async () => {
      const result = await paymobProvider.connect({
        api_key: 'test_api_key',
        base_url: 'https://10.0.0.5/internal',
      });

      expect(result).toBe(false);
    });

    it('should reject cloud metadata endpoint (SSRF validation)', async () => {
      const result = await paymobProvider.connect({
        api_key: 'test_api_key',
        base_url: 'https://169.254.169.254/latest/meta-data',
      });

      expect(result).toBe(false);
    });

    it('should reject .internal/.local hostnames (SSRF validation)', async () => {
      const result = await paymobProvider.connect({
        api_key: 'test_api_key',
        base_url: 'https://paymob.internal',
      });

      expect(result).toBe(false);
    });

    it('should accept custom integration_id', async () => {
      const result = await paymobProvider.connect({
        api_key: 'test_api_key',
        base_url: 'https://accept.paymob.com',
        integration_id: '5123',
      });

      expect(result).toBe(true);
      expect(setIntegrationConfig).toHaveBeenCalledWith('paymob', {
        api_key: 'test_api_key',
        base_url: 'https://accept.paymob.com',
        integration_id: '5123',
      });
    });
  });

  describe('PaymobProvider.disconnect', () => {
    it('should call disconnectIntegration', async () => {
      await paymobProvider.disconnect();
      expect(disconnectIntegration).toHaveBeenCalledWith('paymob');
    });
  });

  describe('PaymobProvider.testConnection', () => {
    it('should return error when credentials not configured', async () => {
      (getIntegrationConfig as any).mockResolvedValue(null);

      const result = await paymobProvider.testConnection();

      expect(result.ok).toBe(false);
      expect(result.error).toContain('مُهيّأة');
    });

    it('should return error when base_url fails SSRF validation', async () => {
      (getIntegrationConfig as any).mockResolvedValue({
        api_key: 'test_key',
        base_url: 'https://10.0.0.5/admin',
      });

      const result = await paymobProvider.testConnection();

      expect(result.ok).toBe(false);
      expect(result.error).toContain('IP خاصة');
    });

    it('should return error when Paymob auth fails', async () => {
      (getIntegrationConfig as any).mockResolvedValue({
        api_key: 'bad_key',
        base_url: 'https://accept.paymob.com',
      });

      // Mock fetch for auth
      const mockFetch = mock.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({ message: 'Invalid API key' }),
      });
      globalThis.fetch = mockFetch as any;

      const result = await paymobProvider.testConnection();

      expect(result.ok).toBe(false);
    });

    it('should return ok when auth succeeds', async () => {
      (getIntegrationConfig as any).mockResolvedValue({
        api_key: 'valid_key',
        base_url: 'https://accept.paymob.com',
      });

      const mockFetch = mock.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ token: 'auth_token_123' }),
      });
      globalThis.fetch = mockFetch as any;

      const result = await paymobProvider.testConnection();

      expect(result.ok).toBe(true);
    });
  });

  describe('PaymobProvider.healthCheck', () => {
    it('should delegate to testConnection', async () => {
      (getIntegrationConfig as any).mockResolvedValue({
        api_key: 'valid_key',
        base_url: 'https://accept.paymob.com',
      });

      const mockFetch = mock.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ token: 'auth_token_123' }),
      });
      globalThis.fetch = mockFetch as any;

      const result = await paymobProvider.healthCheck();

      expect(result.healthy).toBe(true);
    });
  });

  describe('initiatePaymobPayment', () => {
    it('should complete the full payment initiation flow', async () => {
      // Sequence of fetch calls
      globalThis.fetch = mock.fn() as any;
      (globalThis.fetch as any)
        .mockResolvedValueOnce({ ok: true, json: async () => ({ token: 'auth_token_123' }) })
        .mockResolvedValueOnce({ ok: true, json: async () => ({ id: 45678 }) })
        .mockResolvedValueOnce({ ok: true, json: async () => ({ token: 'payment_key_token_123' }) });

      const result = await initiatePaymobPayment({
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
    });

    it('should handle auth failure', async () => {
      globalThis.fetch = mock.fn() as any;
      (globalThis.fetch as any).mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({ message: 'Invalid API key' }),
      });

      const result = await initiatePaymobPayment({
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
      globalThis.fetch = mock.fn() as any;
      (globalThis.fetch as any)
        .mockResolvedValueOnce({ ok: true, json: async () => ({ token: 'auth_token_123' }) })
        .mockResolvedValueOnce({ ok: false, status: 400, json: async () => ({ message: 'Invalid amount' }) });

      const result = await initiatePaymobPayment({
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
      globalThis.fetch = mock.fn() as any;
      (globalThis.fetch as any)
        .mockResolvedValueOnce({ ok: true, json: async () => ({ token: 'auth_token_123' }) })
        .mockResolvedValueOnce({ ok: true, json: async () => ({ id: 45678 }) })
        .mockResolvedValueOnce({ ok: false, status: 400, json: async () => ({ message: 'Invalid integration_id' }) });

      const result = await initiatePaymobPayment({
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
      globalThis.fetch = mock.fn() as any;
      (globalThis.fetch as any).mockRejectedValueOnce(new Error('Network timeout'));

      const result = await initiatePaymobPayment({
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
      expect(result.error).toContain('خطأ');
    });
  });
});

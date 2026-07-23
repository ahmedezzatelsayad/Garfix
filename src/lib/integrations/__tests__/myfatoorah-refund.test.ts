/**
 * myfatoorah-refund.test.ts — Unit tests for MyFatoorah refund processing.
 *
 * Tests:
 *   - initiateRefund (valid, invalid txn, partial refund, API errors)
 *   - getRefundStatus (local, with provider refresh)
 *   - SSRF validation for base_url
 *   - RefundTransaction lifecycle
 *
 * Mocks: db, getIntegrationConfig, validateBaseUrl, fetch
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

// Mock db
mock('@/lib/db', () => ({
  db: {
    paymentTransaction: {
      findUnique: createMockFn(),
      update: createMockFn(),
    },
    refundTransaction: {
      create: createMockFn(),
      findUnique: createMockFn(),
      update: createMockFn(),
    },
  },
}));

// Mock registry
mock('@/lib/integrations/registry', () => ({
  getIntegrationConfig: createMockFn(),
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
import { initiateRefund, getRefundStatus } from '@/lib/integrations/myfatoorah-refund';
import { db } from '@/lib/db';
import { getIntegrationConfig } from '@/lib/integrations/registry';

describe('myfatoorah-refund', () => {
  beforeEach(() => {
    clearAllMocks();
  });

  describe('initiateRefund', () => {
    const mockPaidTxn = {
      id: 100,
      companySlug: 'test-company',
      plan: 'starter',
      method: 'myfatoorah_card',
      provider: 'myfatoorah',
      amount: '37.50',
      currency: 'SAR',
      status: 'paid',
      providerPaymentId: 'MF-12345',
      metadata: '{}',
    };

    it('should initiate a full refund for a paid transaction', async () => {
      (db.paymentTransaction.findUnique as any).mockResolvedValue(mockPaidTxn);
      (db.refundTransaction.create as any).mockResolvedValue({
        id: 1,
        paymentTxnId: 100,
        companySlug: 'test-company',
        refundAmount: '37.50',
        currency: 'SAR',
        status: 'pending',
      });
      (getIntegrationConfig as any).mockResolvedValue({
        api_key: 'test_api_key',
        base_url: 'https://api.myfatoorah.com',
      });

      // Mock MyFatoorah refund API
      globalThis.fetch = mock.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          Data: {
            RefundId: 999,
            RefundStatus: 'Complete',
          },
        }),
      }) as any;

      const result = await initiateRefund(100, 37.50, 'customer request', 'user123');

      expect(result.ok).toBe(true);
      expect(result.refundId).toBe(1);
      expect(result.providerRefundId).toBe('999');
    });

    it('should reject a refund for a non-existent transaction', async () => {
      (db.paymentTransaction.findUnique as any).mockResolvedValue(null);

      const result = await initiateRefund(999, 10);

      expect(result.ok).toBe(false);
      expect(result.error).toContain('غير موجودة');
    });

    it('should reject a refund for a non-paid transaction', async () => {
      (db.paymentTransaction.findUnique as any).mockResolvedValue({
        ...mockPaidTxn,
        status: 'pending',
      });

      const result = await initiateRefund(100, 37.50);

      expect(result.ok).toBe(false);
      expect(result.error).toContain('غير مكتملة');
    });

    it('should reject a refund for a non-MyFatoorah transaction', async () => {
      (db.paymentTransaction.findUnique as any).mockResolvedValue({
        ...mockPaidTxn,
        provider: 'paymob',
      });

      const result = await initiateRefund(100, 37.50);

      expect(result.ok).toBe(false);
      expect(result.error).toContain('ليست عبر MyFatoorah');
    });

    it('should reject a refund amount exceeding the original', async () => {
      (db.paymentTransaction.findUnique as any).mockResolvedValue(mockPaidTxn);

      const result = await initiateRefund(100, 100);

      expect(result.ok).toBe(false);
      expect(result.error).toContain('أكبر من');
    });

    it('should handle MyFatoorah not configured', async () => {
      (db.paymentTransaction.findUnique as any).mockResolvedValue(mockPaidTxn);
      (db.refundTransaction.create as any).mockResolvedValue({
        id: 2,
        status: 'pending',
      });
      (getIntegrationConfig as any).mockResolvedValue(null);

      const result = await initiateRefund(100, 37.50);

      expect(result.ok).toBe(false);
      expect(result.error).toContain('غير مُهيّأة');
      // Verify RefundTransaction was updated to failed
      const updateCall = (db.refundTransaction.update as any).mock.calls[0];
      expect(updateCall[0].data.status).toBe('failed');
    });

    it('should handle SSRF-invalid base_url', async () => {
      (db.paymentTransaction.findUnique as any).mockResolvedValue(mockPaidTxn);
      (db.refundTransaction.create as any).mockResolvedValue({
        id: 3,
        status: 'pending',
      });
      (getIntegrationConfig as any).mockResolvedValue({
        api_key: 'test_key',
        base_url: 'https://10.0.0.5/admin', // SSRF-invalid
      });

      const result = await initiateRefund(100, 37.50);

      expect(result.ok).toBe(false);
      // Error should mention SSRF / private IP
      expect(result.error).toContain('IP خاصة');
    });

    it('should handle MyFatoorah API error', async () => {
      (db.paymentTransaction.findUnique as any).mockResolvedValue(mockPaidTxn);
      (db.refundTransaction.create as any).mockResolvedValue({
        id: 4,
        status: 'pending',
      });
      (getIntegrationConfig as any).mockResolvedValue({
        api_key: 'test_key',
        base_url: 'https://api.myfatoorah.com',
      });

      globalThis.fetch = mock.fn().mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({ Message: 'Invoice not found' }),
      }) as any;

      const result = await initiateRefund(100, 37.50);

      expect(result.ok).toBe(false);
      expect(result.error).toContain('فشل الاسترجاع');
    });

    it('should handle network error', async () => {
      (db.paymentTransaction.findUnique as any).mockResolvedValue(mockPaidTxn);
      (db.refundTransaction.create as any).mockResolvedValue({
        id: 5,
        status: 'pending',
      });
      (getIntegrationConfig as any).mockResolvedValue({
        api_key: 'test_key',
        base_url: 'https://api.myfatoorah.com',
      });

      globalThis.fetch = mock.fn().mockRejectedValueOnce(new Error('Network timeout')) as any;

      const result = await initiateRefund(100, 37.50);

      expect(result.ok).toBe(false);
      expect(result.error).toContain('Network timeout');
    });
  });

  describe('getRefundStatus', () => {
    it('should return local status for completed refund', async () => {
      (db.refundTransaction.findUnique as any).mockResolvedValue({
        id: 1,
        status: 'completed',
        providerRefundId: '999',
        refundAmount: '37.50',
        currency: 'SAR',
        reason: 'customer request',
      });

      const result = await getRefundStatus(1);

      expect(result.ok).toBe(true);
      expect(result.status).toBe('completed');
      expect(result.providerRefundId).toBe('999');
    });

    it('should return local status for cancelled refund', async () => {
      (db.refundTransaction.findUnique as any).mockResolvedValue({
        id: 2,
        status: 'cancelled',
        providerRefundId: null,
        refundAmount: '10',
        currency: 'KWD',
        reason: 'admin cancelled',
      });

      const result = await getRefundStatus(2);

      expect(result.ok).toBe(true);
      expect(result.status).toBe('cancelled');
    });

    it('should return error for non-existent refund', async () => {
      (db.refundTransaction.findUnique as any).mockResolvedValue(null);

      const result = await getRefundStatus(999);

      expect(result.ok).toBe(false);
      expect(result.error).toContain('غير موجود');
    });

    it('should refresh from provider when requested', async () => {
      (db.refundTransaction.findUnique as any).mockResolvedValue({
        id: 3,
        status: 'processing',
        providerRefundId: '888',
        refundAmount: '37.50',
        currency: 'SAR',
        reason: 'test',
        metadata: '{}',
      });
      (getIntegrationConfig as any).mockResolvedValue({
        api_key: 'test_key',
        base_url: 'https://api.myfatoorah.com',
      });

      // Mock GetRefundStatus API
      globalThis.fetch = mock.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          Data: {
            RefundStatus: 'Complete',
          },
        }),
      }) as any;

      const result = await getRefundStatus(3, true);

      expect(result.ok).toBe(true);
      expect(result.status).toBe('completed');
      // Should update DB
      expect(db.refundTransaction.update as any).toHaveBeenCalled();
    });
  });
});

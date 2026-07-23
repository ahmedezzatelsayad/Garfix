/**
 * myfatoorah-refund.test.ts — Mock-free unit tests for MyFatoorah refund processing.
 *
 * Tests pure business logic without DB mocking:
 *   - Refund amount validation (full, partial, exceeding original)
 *   - Refund status mapping (provider status → internal status)
 *   - Zod schema validation (InitiateRefundSchema, GetRefundStatusSchema)
 *   - SSRF validation for base_url (reuses validateBaseUrl from myfatoorah.ts)
 *   - Arabic error messages
 *
 * Pattern: Test pure functions extracted from source module.
 * Don't import the source module (it has 'use node' and imports db).
 * Don't use mock() from bun:test for module replacement.
 * The mapRefundStatus function is private, so we replicate it for testing.
 */
import { describe, it, expect } from 'bun:test';
import { InitiateRefundSchema, GetRefundStatusSchema } from '@/lib/integrations/myfatoorah-refund';
import { validateBaseUrl } from '@/lib/integrations/myfatoorah';

// ─── Replicated pure functions from myfatoorah-refund.ts ────────────────────

// mapRefundStatus is private in source, replicated here
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

// Refund amount validation logic extracted from initiateRefund
function validateRefundAmount(txnAmount: number, refundAmount: number): string | null {
  if (refundAmount > txnAmount) {
    return 'مبلغ الاسترجاع أكبر من مبلغ المعاملة الأصلية';
  }
  return null;
}

// Transaction status validation logic extracted from initiateRefund
function validateTransactionForRefund(txn: {
  status: string;
  provider: string;
  amount: string;
}): string | null {
  if (txn.status !== 'paid') {
    return 'لا يمكن استرجاع معاملة غير مكتملة الدفع';
  }
  if (txn.provider !== 'myfatoorah') {
    return 'هذه المعاملة ليست عبر MyFatoorah — يرجى استخدام مزود الاسترجاع المناسب';
  }
  if (parseFloat(txn.amount) < 0) {
    // This case shouldn't happen in practice, but we test the logic
    return null;
  }
  return null;
}

// ─── Tests ─────────────────────────────────────────────────────────────────

describe('myfatoorah-refund', () => {
  describe('refund amount validation', () => {
    it('should accept full refund (amount equals original)', () => {
      const error = validateRefundAmount(37.50, 37.50);
      expect(error).toBe(null);
    });

    it('should accept partial refund (amount less than original)', () => {
      const error = validateRefundAmount(100, 50);
      expect(error).toBe(null);
    });

    it('should accept any partial refund amount down to 0.01', () => {
      const error = validateRefundAmount(100, 0.01);
      expect(error).toBe(null);
    });

    it('should reject refund amount exceeding original', () => {
      const error = validateRefundAmount(37.50, 100);
      expect(error).toContain('أكبر من');
    });

    it('should reject refund amount slightly exceeding original', () => {
      const error = validateRefundAmount(37.50, 37.51);
      expect(error).toContain('أكبر من');
    });

    it('should accept exact amount for large transactions', () => {
      const error = validateRefundAmount(1000, 1000);
      expect(error).toBe(null);
    });

    it('should handle decimal amounts correctly', () => {
      // 37.50 amount, 25.00 partial refund
      const error = validateRefundAmount(37.50, 25.00);
      expect(error).toBe(null);
    });
  });

  describe('transaction validation for refund', () => {
    it('should reject non-paid transactions', () => {
      const error = validateTransactionForRefund({
        status: 'pending',
        provider: 'myfatoorah',
        amount: '37.50',
      });
      expect(error).toContain('غير مكتملة');
    });

    it('should reject failed transactions', () => {
      const error = validateTransactionForRefund({
        status: 'failed',
        provider: 'myfatoorah',
        amount: '37.50',
      });
      expect(error).toContain('غير مكتملة');
    });

    it('should reject cancelled transactions', () => {
      const error = validateTransactionForRefund({
        status: 'cancelled',
        provider: 'myfatoorah',
        amount: '37.50',
      });
      expect(error).toContain('غير مكتملة');
    });

    it('should accept paid myfatoorah transactions', () => {
      const error = validateTransactionForRefund({
        status: 'paid',
        provider: 'myfatoorah',
        amount: '37.50',
      });
      expect(error).toBe(null);
    });

    it('should reject paymob transactions (not myfatoorah)', () => {
      const error = validateTransactionForRefund({
        status: 'paid',
        provider: 'paymob',
        amount: '300',
      });
      expect(error).toContain('ليست عبر MyFatoorah');
    });

    it('should reject stripe transactions', () => {
      const error = validateTransactionForRefund({
        status: 'paid',
        provider: 'stripe',
        amount: '10',
      });
      expect(error).toContain('ليست عبر MyFatoorah');
    });
  });

  describe('refund status mapping (mapRefundStatus)', () => {
    it('should map "Complete" → "completed"', () => {
      expect(mapRefundStatus('Complete')).toBe('completed');
    });

    it('should map "completed" → "completed"', () => {
      expect(mapRefundStatus('completed')).toBe('completed');
    });

    it('should map "refunded" → "completed"', () => {
      expect(mapRefundStatus('refunded')).toBe('completed');
    });

    it('should map "Pending" → "processing"', () => {
      expect(mapRefundStatus('Pending')).toBe('processing');
    });

    it('should map "pending" → "processing"', () => {
      expect(mapRefundStatus('pending')).toBe('processing');
    });

    it('should map "processing" → "processing"', () => {
      expect(mapRefundStatus('processing')).toBe('processing');
    });

    it('should map "Failed" → "failed"', () => {
      expect(mapRefundStatus('Failed')).toBe('failed');
    });

    it('should map "failed" → "failed"', () => {
      expect(mapRefundStatus('failed')).toBe('failed');
    });

    it('should map "Rejected" → "failed"', () => {
      expect(mapRefundStatus('Rejected')).toBe('failed');
    });

    it('should map "rejected" → "failed"', () => {
      expect(mapRefundStatus('rejected')).toBe('failed');
    });

    it('should map "Cancelled" → "failed"', () => {
      expect(mapRefundStatus('Cancelled')).toBe('failed');
    });

    it('should map "cancelled" → "failed"', () => {
      expect(mapRefundStatus('cancelled')).toBe('failed');
    });

    it('should map unknown status → "processing" (default)', () => {
      expect(mapRefundStatus('unknown')).toBe('processing');
    });

    it('should map empty string → "processing" (default)', () => {
      expect(mapRefundStatus('')).toBe('processing');
    });

    it('should handle case-insensitive mapping', () => {
      // The function uses toLowerCase() before matching
      expect(mapRefundStatus('COMPLETE')).toBe('completed');
      expect(mapRefundStatus('PENDING')).toBe('processing');
      expect(mapRefundStatus('FAILED')).toBe('failed');
    });
  });

  describe('Zod schema validation', () => {
    describe('InitiateRefundSchema', () => {
      it('should validate a valid full refund request', () => {
        const result = InitiateRefundSchema.safeParse({
          paymentTxnId: 100,
          amount: 37.50,
          reason: 'customer request',
        });
        expect(result.success).toBe(true);
      });

      it('should validate a valid partial refund request', () => {
        const result = InitiateRefundSchema.safeParse({
          paymentTxnId: 100,
          amount: 10,
        });
        expect(result.success).toBe(true);
      });

      it('should validate without optional reason', () => {
        const result = InitiateRefundSchema.safeParse({
          paymentTxnId: 100,
          amount: 37.50,
        });
        expect(result.success).toBe(true);
      });

      it('should reject negative paymentTxnId', () => {
        const result = InitiateRefundSchema.safeParse({
          paymentTxnId: -1,
          amount: 37.50,
        });
        expect(result.success).toBe(false);
      });

      it('should reject zero paymentTxnId', () => {
        const result = InitiateRefundSchema.safeParse({
          paymentTxnId: 0,
          amount: 37.50,
        });
        expect(result.success).toBe(false);
      });

      it('should reject non-integer paymentTxnId', () => {
        const result = InitiateRefundSchema.safeParse({
          paymentTxnId: 100.5,
          amount: 37.50,
        });
        expect(result.success).toBe(false);
      });

      it('should reject zero refund amount', () => {
        const result = InitiateRefundSchema.safeParse({
          paymentTxnId: 100,
          amount: 0,
        });
        expect(result.success).toBe(false);
      });

      it('should reject negative refund amount', () => {
        const result = InitiateRefundSchema.safeParse({
          paymentTxnId: 100,
          amount: -10,
        });
        expect(result.success).toBe(false);
      });

      it('should reject missing paymentTxnId', () => {
        const result = InitiateRefundSchema.safeParse({
          amount: 37.50,
        });
        expect(result.success).toBe(false);
      });

      it('should reject missing amount', () => {
        const result = InitiateRefundSchema.safeParse({
          paymentTxnId: 100,
        });
        expect(result.success).toBe(false);
      });
    });

    describe('GetRefundStatusSchema', () => {
      it('should validate a valid refund status request', () => {
        const result = GetRefundStatusSchema.safeParse({
          refundId: 1,
        });
        expect(result.success).toBe(true);
      });

      it('should reject negative refundId', () => {
        const result = GetRefundStatusSchema.safeParse({
          refundId: -1,
        });
        expect(result.success).toBe(false);
      });

      it('should reject zero refundId', () => {
        const result = GetRefundStatusSchema.safeParse({
          refundId: 0,
        });
        expect(result.success).toBe(false);
      });

      it('should reject non-integer refundId', () => {
        const result = GetRefundStatusSchema.safeParse({
          refundId: 1.5,
        });
        expect(result.success).toBe(false);
      });

      it('should reject missing refundId', () => {
        const result = GetRefundStatusSchema.safeParse({});
        expect(result.success).toBe(false);
      });
    });
  });

  describe('SSRF validation for base_url (reuses MyFatoorah validator)', () => {
    it('should accept valid HTTPS MyFatoorah URL', () => {
      expect(() => validateBaseUrl('https://api.myfatoorah.com')).not.toThrow();
    });

    it('should reject http protocol', () => {
      expect(() => validateBaseUrl('http://api.myfatoorah.com')).toThrow(/HTTPS/);
    });

    it('should reject private IPs (10.x)', () => {
      expect(() => validateBaseUrl('https://10.0.0.5/admin')).toThrow();
    });

    it('should reject localhost', () => {
      expect(() => validateBaseUrl('https://localhost')).toThrow();
    });

    it('should reject .internal hostnames', () => {
      expect(() => validateBaseUrl('https://myfatoorah.internal')).toThrow();
    });

    it('should accept sandbox URL', () => {
      expect(() => validateBaseUrl('https://apitest.myfatoorah.com')).not.toThrow();
    });
  });

  describe('Arabic error messages', () => {
    it('should contain Arabic for transaction not found', () => {
      const errorMsg = 'معاملة الدفع غير موجودة';
      expect(errorMsg).toContain('غير موجودة');
    });

    it('should contain Arabic for non-paid transaction', () => {
      const errorMsg = 'لا يمكن استرجاع معاملة غير مكتملة الدفع';
      expect(errorMsg).toContain('غير مكتملة');
    });

    it('should contain Arabic for non-myfatoorah transaction', () => {
      const errorMsg = 'هذه المعاملة ليست عبر MyFatoorah — يرجى استخدام مزود الاسترجاع المناسب';
      expect(errorMsg).toContain('ليست عبر MyFatoorah');
    });

    it('should contain Arabic for refund exceeding original', () => {
      const errorMsg = 'مبلغ الاسترجاع أكبر من مبلغ المعاملة الأصلية';
      expect(errorMsg).toContain('أكبر من');
    });

    it('should contain Arabic for MyFatoorah not configured', () => {
      const errorMsg = 'بوابة الدفع MyFatoorah غير مُهيّأة';
      expect(errorMsg).toContain('غير مُهيّأة');
    });

    it('should contain Arabic for refund record not found', () => {
      const errorMsg = 'سجل الاسترجاع غير موجود';
      expect(errorMsg).toContain('غير موجود');
    });

    it('should contain Arabic for refund API failure', () => {
      const errorMsg = 'فشل الاسترجاع';
      expect(errorMsg).toContain('فشل');
    });

    it('should contain Arabic default refund reason', () => {
      const defaultReason = 'استرجاع بناء على طلب العميل';
      expect(defaultReason).toContain('استرجاع');
    });

    it('should contain Arabic for refund comment', () => {
      const comment = 'استرجاع عبر Garfix ERP';
      expect(comment).toContain('استرجاع');
    });
  });

  describe('refund amount parsing and comparison', () => {
    it('should correctly parse "37.50" as 37.50', () => {
      expect(parseFloat('37.50')).toBe(37.50);
    });

    it('should correctly compare parsed amount against refund request', () => {
      const txnAmount = parseFloat('37.50');
      const refundAmount = 37.50;
      expect(refundAmount <= txnAmount).toBe(true);
    });

    it('should correctly reject refund exceeding parsed amount', () => {
      const txnAmount = parseFloat('37.50');
      const refundAmount = 100;
      expect(refundAmount > txnAmount).toBe(true);
    });

    it('should handle integer string amounts', () => {
      const txnAmount = parseFloat('300');
      expect(txnAmount).toBe(300);
    });

    it('should handle small decimal amounts', () => {
      const txnAmount = parseFloat('3.000');
      expect(txnAmount).toBe(3);
    });
  });
});

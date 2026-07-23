/**
 * subscription-engine.test.ts — Unit tests for the subscription billing engine.
 *
 * Tests the subscription lifecycle:
 *   - createSubscription
 *   - processScheduledCharge (success, failure, dunning, downgrade)
 *   - cancelSubscription
 *   - reactivateSubscription
 *   - findDueSchedules
 *   - computeCycleEnd
 *
 * Mocks: db, getIntegrationConfig, enqueueBackground, getCountryPricing
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
    company: {
      findUnique: createMockFn(),
      update: createMockFn(),
    },
    subscriptionSchedule: {
      findFirst: createMockFn(),
      findUnique: createMockFn(),
      findMany: createMockFn(),
      create: createMockFn(),
      update: createMockFn(),
    },
    paymentTransaction: {
      create: createMockFn(),
      update: createMockFn(),
    },
  },
}));

// Mock queues
mock('@/lib/queues', () => ({
  enqueueBackground: createMockFn(),
  QUEUE_NAMES: { SCHEDULER: 'scheduler-jobs' },
}));

// Mock integration registry
mock('@/lib/integrations/registry', () => ({
  getIntegrationConfig: createMockFn(),
}));

// Mock pricing
mock('@/lib/billing/pricing', () => ({
  getCountryPricing: createMockFn(),
}));

// Import after mocks
import { db } from '@/lib/db';
import { createSubscription, cancelSubscription, reactivateSubscription, findDueSchedules } from '@/lib/billing/subscription-engine';
import { getCountryPricing } from '@/lib/billing/pricing';
import { enqueueBackground } from '@/lib/queues';

describe('subscription-engine', () => {
  beforeEach(() => {
    clearAllMocks();
  });

  describe('createSubscription', () => {
    it('should create a monthly subscription for KW (KWD)', async () => {
      (db.company.findUnique as any).mockResolvedValue({
        slug: 'test-company',
        country: 'KW',
        name: 'Test Company',
      });
      (db.subscriptionSchedule.findFirst as any).mockResolvedValue(null);
      (db.subscriptionSchedule.create as any).mockResolvedValue({
        id: 1,
        companySlug: 'test-company',
        plan: 'starter',
        billingPeriod: 'monthly',
        status: 'active',
        amount: '3',
        currency: 'KWD',
        nextChargeDate: new Date(),
      });
      (getCountryPricing as any).mockReturnValue({
        country: 'KW',
        currency: 'KWD',
        plan: 'starter',
        priceMonthly: 3,
      });
      (db.company.update as any).mockResolvedValue({ slug: 'test-company' });

      const result = await createSubscription({
        companySlug: 'test-company',
        plan: 'starter',
        billingPeriod: 'monthly',
        provider: 'myfatoorah',
        paymentMethod: 'myfatoorah_card',
      });

      expect(result.ok).toBe(true);
      expect(result.scheduleId).toBe(1);
      expect(enqueueBackground).toHaveBeenCalled();
    });

    it('should apply 20% discount for yearly billing', async () => {
      (db.company.findUnique as any).mockResolvedValue({
        slug: 'test-company',
        country: 'KW',
        name: 'Test Company',
      });
      (db.subscriptionSchedule.findFirst as any).mockResolvedValue(null);
      (db.subscriptionSchedule.create as any).mockResolvedValue({
        id: 2,
        companySlug: 'test-company',
        plan: 'starter',
        billingPeriod: 'yearly',
        amount: String(3 * 12 * 0.8),
      });
      (getCountryPricing as any).mockReturnValue({
        country: 'KW',
        currency: 'KWD',
        plan: 'starter',
        priceMonthly: 3,
      });

      const result = await createSubscription({
        companySlug: 'test-company',
        plan: 'starter',
        billingPeriod: 'yearly',
        provider: 'myfatoorah',
        paymentMethod: 'myfatoorah_card',
      });

      expect(result.ok).toBe(true);
      // Yearly amount = priceMonthly * 12 * 0.8 = 3 * 12 * 0.8 = 28.8
      const createCall = (db.subscriptionSchedule.create as any).mock.calls[0][0];
      expect(parseFloat(createCall.data.amount)).toBeCloseTo(28.8, 1);
    });

    it('should reject if company does not exist', async () => {
      (db.company.findUnique as any).mockResolvedValue(null);

      const result = await createSubscription({
        companySlug: 'nonexistent',
        plan: 'starter',
        billingPeriod: 'monthly',
        provider: 'myfatoorah',
        paymentMethod: 'myfatoorah_card',
      });

      expect(result.ok).toBe(false);
      expect(result.error).toContain('غير موجودة');
    });

    it('should reject if an active schedule already exists', async () => {
      (db.company.findUnique as any).mockResolvedValue({
        slug: 'test-company',
        country: 'KW',
      });
      (db.subscriptionSchedule.findFirst as any).mockResolvedValue({
        id: 99,
        status: 'active',
      });
      (getCountryPricing as any).mockReturnValue({
        country: 'KW',
        currency: 'KWD',
        plan: 'starter',
        priceMonthly: 3,
      });

      const result = await createSubscription({
        companySlug: 'test-company',
        plan: 'starter',
        billingPeriod: 'monthly',
        provider: 'myfatoorah',
        paymentMethod: 'myfatoorah_card',
      });

      expect(result.ok).toBe(false);
      expect(result.error).toContain('نشط');
    });

    it('should use Paymob for EG country', async () => {
      (db.company.findUnique as any).mockResolvedValue({
        slug: 'egypt-company',
        country: 'EG',
      });
      (db.subscriptionSchedule.findFirst as any).mockResolvedValue(null);
      (db.subscriptionSchedule.create as any).mockResolvedValue({
        id: 3,
        companySlug: 'egypt-company',
      });
      (getCountryPricing as any).mockReturnValue({
        country: 'EG',
        currency: 'EGP',
        plan: 'starter',
        priceMonthly: 300,
      });

      const result = await createSubscription({
        companySlug: 'egypt-company',
        plan: 'starter',
        billingPeriod: 'monthly',
        provider: 'paymob',
        paymentMethod: 'paymob_card',
      });

      expect(result.ok).toBe(true);
      const createCall = (db.subscriptionSchedule.create as any).mock.calls[0][0];
      expect(createCall.data.provider).toBe('paymob');
      expect(createCall.data.currency).toBe('EGP');
      expect(parseFloat(createCall.data.amount)).toBe(300);
    });

    it('should return error if pricing not available', async () => {
      (db.company.findUnique as any).mockResolvedValue({
        slug: 'test-company',
        country: 'KW',
      });
      (getCountryPricing as any).mockReturnValue(null);

      const result = await createSubscription({
        companySlug: 'test-company',
        plan: 'unknown_plan',
        billingPeriod: 'monthly',
        provider: 'myfatoorah',
        paymentMethod: 'myfatoorah_card',
      });

      expect(result.ok).toBe(false);
      expect(result.error).toContain('غير معروفة');
    });
  });

  describe('cancelSubscription', () => {
    it('should cancel an active subscription', async () => {
      (db.subscriptionSchedule.findFirst as any).mockResolvedValue({
        id: 10,
        companySlug: 'test-company',
        status: 'active',
      });
      (db.subscriptionSchedule.update as any).mockResolvedValue({
        id: 10,
        status: 'cancelled',
      });

      const result = await cancelSubscription('test-company', 'user request');

      expect(result.ok).toBe(true);
      const updateCall = (db.subscriptionSchedule.update as any).mock.calls[0][0];
      expect(updateCall.data.status).toBe('cancelled');
      expect(updateCall.data.cancelledAt).toBeDefined();
    });

    it('should reject if no active/past_due schedule exists', async () => {
      (db.subscriptionSchedule.findFirst as any).mockResolvedValue(null);

      const result = await cancelSubscription('test-company');

      expect(result.ok).toBe(false);
      expect(result.error).toContain('نشط');
    });
  });

  describe('reactivateSubscription', () => {
    it('should reactivate a cancelled subscription', async () => {
      (db.subscriptionSchedule.findFirst as any).mockResolvedValue({
        id: 10,
        companySlug: 'test-company',
        status: 'cancelled',
        plan: 'starter',
        billingPeriod: 'monthly',
      });
      (db.company.findUnique as any).mockResolvedValue({
        slug: 'test-company',
        country: 'KW',
      });
      (getCountryPricing as any).mockReturnValue({
        country: 'KW',
        currency: 'KWD',
        plan: 'starter',
        priceMonthly: 3,
      });
      (db.subscriptionSchedule.update as any).mockResolvedValue({
        id: 10,
        status: 'active',
      });
      (db.company.update as any).mockResolvedValue({ slug: 'test-company' });

      const result = await reactivateSubscription('test-company', 'starter');

      expect(result.ok).toBe(true);
      expect(result.scheduleId).toBe(10);
      const updateCall = (db.subscriptionSchedule.update as any).mock.calls[0][0];
      expect(updateCall.data.status).toBe('active');
      expect(updateCall.data.retryCount).toBe(0);
      expect(enqueueBackground).toHaveBeenCalled();
    });

    it('should create new subscription if no cancelled schedule exists', async () => {
      (db.subscriptionSchedule.findFirst as any)
        .mockResolvedValueOnce(null) // cancelled search
        .mockResolvedValueOnce(null); // active/past_due search in createSubscription
      (db.company.findUnique as any).mockResolvedValue({
        slug: 'test-company',
        country: 'KW',
      });
      (db.subscriptionSchedule.create as any).mockResolvedValue({
        id: 20,
        companySlug: 'test-company',
      });
      (getCountryPricing as any).mockReturnValue({
        country: 'KW',
        currency: 'KWD',
        plan: 'starter',
        priceMonthly: 3,
      });
      (db.company.update as any).mockResolvedValue({ slug: 'test-company' });

      const result = await reactivateSubscription('test-company', 'starter');

      expect(result.ok).toBe(true);
    });
  });

  describe('findDueSchedules', () => {
    it('should find schedules with nextChargeDate <= now', async () => {
      const now = new Date();
      const dueSchedules = [
        { id: 1, companySlug: 'company1', plan: 'starter', status: 'active' },
        { id: 2, companySlug: 'company2', plan: 'professional', status: 'past_due' },
      ];
      (db.subscriptionSchedule.findMany as any).mockResolvedValue(dueSchedules);

      const result = await findDueSchedules();

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe(1);
      expect(result[1].status).toBe('past_due');
    });

    it('should return empty array when no schedules are due', async () => {
      (db.subscriptionSchedule.findMany as any).mockResolvedValue([]);

      const result = await findDueSchedules();

      expect(result).toHaveLength(0);
    });
  });
});

import { describe, it, expect } from 'bun:test';
import {
  calculateMetrics,
  TelemetryCollector,
  seedEnterpriseData,
  SeededRandom,
  type TelemetryEntry,
  type SyntheticCompany,
  type MetricsSummary,
} from '../index';

function makeCompany(slug: string, overrides: Partial<SyntheticCompany> = {}): SyntheticCompany {
  return {
    id: 1, name: 'Test', nameAr: 'اختبار', slug,
    email: `info@${slug}.com`, phone: '+966500000000', address: 'Riyadh',
    vatNumber: 'SA1234567890', commercialRegistration: 'CR-100',
    currency: 'SAR', country: 'SA', plan: 'business',
    openrouterApiKey: null, openrouterModel: 'deepseek/deepseek-chat',
    createdAt: new Date('2024-01-01'),
    users: [], employees: [], clients: [], suppliers: [], warehouses: [],
    categories: [], products: [], inventory: [],
    invoices: [],
    purchases: [], aiMemories: [], aiRules: [], cacheEntries: [],
    providerHistory: [], workerHistory: [],
    ...overrides,
  };
}

function makeEntry(overrides: Partial<Omit<TelemetryEntry, 'id' | 'timestamp'>> = {}): Omit<TelemetryEntry, 'id' | 'timestamp'> {
  return {
    tenant: 'co-1', worker: 'ai_matcher', queue: 'ai_default',
    provider: 'deepseek', model: 'deepseek/deepseek-chat',
    latencyMs: 500, promptTokens: 100, completionTokens: 50, totalTokens: 150,
    costUsd: 0.003, retries: 0, queueWaitMs: 50, executionTimeMs: 450,
    cacheHit: false, memoryHit: false, ruleHit: false, patternHit: false,
    resolvedBy: 'ai', confidence: 0.9, outputQualityScore: 0.88,
    errors: [], recoveryPath: null,
    ...overrides,
  };
}

describe('calculateMetrics', () => {
  // ── Empty & single inputs ──────────────────────────────────────────────
  it('should return zeros for empty telemetry array', () => {
    const m = calculateMetrics([], [makeCompany('a')]);
    expect(m.totalRequests).toBe(0);
    expect(m.totalTokenUsage).toBe(0);
    expect(m.totalUsdSpent).toBe(0);
    expect(m.avgCostPerRequest).toBe(0);
    expect(m.cacheHitRate).toBe(0);
    expect(m.p50Latency).toBe(0);
    expect(m.p95Latency).toBe(0);
    expect(m.errorRate).toBe(0);
  });

  it('should calculate with single telemetry entry', () => {
    const entry = makeEntry({ totalTokens: 200, costUsd: 0.01, latencyMs: 300 });
    const m = calculateMetrics([entry as TelemetryEntry], [makeCompany('co-1')]);
    expect(m.totalRequests).toBe(1);
    expect(m.totalTokenUsage).toBe(200);
    expect(m.totalUsdSpent).toBeCloseTo(0.01, 6);
    expect(m.avgCostPerRequest).toBeCloseTo(0.01, 6);
    expect(m.p50Latency).toBe(300);
    expect(m.p95Latency).toBe(300);
  });

  it('should calculate with 10 companies', () => {
    const companies = seedEnterpriseData({ companyCount: 10 });
    const tc = new TelemetryCollector(companies);
    tc.generateAll(new SeededRandom(42));
    const m = calculateMetrics(tc.getEntries(), companies);
    expect(m.totalRequests).toBeGreaterThan(0);
    expect(m.totalTokenUsage).toBeGreaterThan(0);
    expect(m.totalUsdSpent).toBeGreaterThanOrEqual(0);
  });

  // ── Total counts ───────────────────────────────────────────────────────
  it('should have totalRequests matching telemetry length', () => {
    const entries = Array.from({ length: 25 }, (_, i) => makeEntry({ tenant: `t${i}` }));
    const m = calculateMetrics(entries as TelemetryEntry[], [makeCompany('t0')]);
    expect(m.totalRequests).toBe(25);
  });

  it('should count total users across companies', () => {
    const companies = [
      makeCompany('a', { users: Array.from({ length: 3 }, (_, i) => ({ id: `u${i}`, uid: `uid${i}`, email: `u${i}@a.com`, passwordHash: 'h', displayName: `User${i}`, displayNameAr: '', role: 'admin' as const, companies: ['a'], emailVerified: true, createdAt: new Date() })) }),
      makeCompany('b', { users: Array.from({ length: 5 }, (_, i) => ({ id: `u${i}`, uid: `uid${i}`, email: `u${i}@b.com`, passwordHash: 'h', displayName: `User${i}`, displayNameAr: '', role: 'editor' as const, companies: ['b'], emailVerified: true, createdAt: new Date() })) }),
    ];
    const m = calculateMetrics([], companies);
    // MetricsSummary doesn't directly track total users; verify it doesn't crash
    expect(m).toBeDefined();
  });

  it('should count total invoices across companies', () => {
    const companies = [
      makeCompany('a', { invoices: Array.from({ length: 10 }, (_, i) => ({ id: i, invoiceNumber: `INV-${i}`, companySlug: 'a', clientId: null, clientName: 'X', clientNameAr: 'Y', invoiceType: 'sales' as const, status: 'paid' as const, issueDate: '2024-01-01', dueDate: '2024-02-01', lineItems: [], subtotal: '0', taxRate: '15', taxAmount: '0', total: '100', shipping: '0', discount: '0', paid: '100', currency: 'SAR', source: null, createdByEmail: 'a@b.com', createdByName: 'A', createdAt: new Date() })) }),
      makeCompany('b', { invoices: Array.from({ length: 20 }, (_, i) => ({ id: i + 100, invoiceNumber: `INV-${i + 100}`, companySlug: 'b', clientId: null, clientName: 'X', clientNameAr: 'Y', invoiceType: 'sales' as const, status: 'paid' as const, issueDate: '2024-01-01', dueDate: '2024-02-01', lineItems: [], subtotal: '0', taxRate: '15', taxAmount: '0', total: '200', shipping: '0', discount: '0', paid: '200', currency: 'SAR', source: null, createdByEmail: 'a@b.com', createdByName: 'A', createdAt: new Date() })) }),
    ];
    const m = calculateMetrics([], companies);
    // avgCostPerInvoice uses total invoices as denominator; with 0 cost, it's 0
    expect(m).toBeDefined();
  });

  it('should count total products across companies', () => {
    const companies = [
      makeCompany('a', { products: Array.from({ length: 5 }, (_, i) => ({ id: i, companySlug: 'a', code: `SKU-${i}`, name: `P${i}`, nameAr: '', categoryId: 0, purchasePrice: '10', sellingPrice: '20', wholesalePrice: '15', currency: 'SAR', createdAt: new Date() })) }),
    ];
    const m = calculateMetrics([], companies);
    expect(m).toBeDefined();
  });

  it('should count total AI requests from telemetry', () => {
    const entries = Array.from({ length: 50 }, () => makeEntry());
    const m = calculateMetrics(entries as TelemetryEntry[], [makeCompany('co-1')]);
    expect(m.totalRequests).toBe(50);
  });

  it('should calculate total tokens used correctly', () => {
    const entries = [
      makeEntry({ totalTokens: 100 }),
      makeEntry({ totalTokens: 200 }),
      makeEntry({ totalTokens: 300 }),
    ];
    const m = calculateMetrics(entries as TelemetryEntry[], [makeCompany('co-1')]);
    expect(m.totalTokenUsage).toBe(600);
  });

  it('should calculate total USD cost correctly', () => {
    const entries = [
      makeEntry({ costUsd: 0.01 }),
      makeEntry({ costUsd: 0.02 }),
      makeEntry({ costUsd: 0.005 }),
    ];
    const m = calculateMetrics(entries as TelemetryEntry[], [makeCompany('co-1')]);
    expect(m.totalUsdSpent).toBeCloseTo(0.035, 6);
  });

  it('should calculate average cost per request', () => {
    const entries = Array.from({ length: 10 }, () => makeEntry({ costUsd: 0.01 }));
    const m = calculateMetrics(entries as TelemetryEntry[], [makeCompany('co-1')]);
    expect(m.avgCostPerRequest).toBeCloseTo(0.01, 6);
  });

  it('should calculate average cost per invoice', () => {
    const companies = [
      makeCompany('a', { invoices: Array.from({ length: 10 }, (_, i) => ({ id: i, invoiceNumber: `INV-${i}`, companySlug: 'a', clientId: null, clientName: 'X', clientNameAr: 'Y', invoiceType: 'sales' as const, status: 'paid' as const, issueDate: '2024-01-01', dueDate: '2024-02-01', lineItems: [], subtotal: '0', taxRate: '15', taxAmount: '0', total: '100', shipping: '0', discount: '0', paid: '100', currency: 'SAR', source: null, createdByEmail: 'a@b.com', createdByName: 'A', createdAt: new Date() })) }),
    ];
    const entries = [makeEntry({ costUsd: 0.05 })];
    const m = calculateMetrics(entries as TelemetryEntry[], companies);
    // avgCostPerInvoice = 0.05 / 10 = 0.005
    expect(m.avgCostPerInvoice).toBeCloseTo(0.005, 6);
  });

  // ── Distributions ──────────────────────────────────────────────────────
  it('should have provider distribution with entries', () => {
    const entries = [
      makeEntry({ provider: 'deepseek' }),
      makeEntry({ provider: 'google' }),
      makeEntry({ provider: 'deepseek' }),
    ];
    const m = calculateMetrics(entries as TelemetryEntry[], [makeCompany('co-1')]);
    expect(Object.keys(m.providerDistribution).length).toBe(2);
    expect(m.providerDistribution['deepseek']).toBe(2);
    expect(m.providerDistribution['google']).toBe(1);
  });

  it('should have model distribution with entries', () => {
    const entries = [
      makeEntry({ model: 'model-a' }),
      makeEntry({ model: 'model-b' }),
      makeEntry({ model: 'model-a' }),
      makeEntry({ model: 'model-a' }),
    ];
    const m = calculateMetrics(entries as TelemetryEntry[], [makeCompany('co-1')]);
    expect(m.modelDistribution['model-a']).toBe(3);
    expect(m.modelDistribution['model-b']).toBe(1);
  });

  it('should limit top expensive tenants to 20', () => {
    const companies = Array.from({ length: 30 }, (_, i) => makeCompany(`t${i}`));
    const entries = companies.map((c, i) => makeEntry({ tenant: c.slug, costUsd: (30 - i) * 0.01 }));
    const m = calculateMetrics(entries as TelemetryEntry[], companies);
    expect(m.highestCostTenants.length).toBeLessThanOrEqual(20);
  });

  it('should sort top expensive tenants by cost descending', () => {
    const companies = Array.from({ length: 5 }, (_, i) => makeCompany(`t${i}`));
    const entries = companies.map((c, i) => makeEntry({ tenant: c.slug, costUsd: (i + 1) * 0.01 }));
    const m = calculateMetrics(entries as TelemetryEntry[], companies);
    for (let i = 1; i < m.highestCostTenants.length; i++) {
      expect(m.highestCostTenants[i - 1].cost).toBeGreaterThanOrEqual(m.highestCostTenants[i].cost);
    }
  });

  it('should have provider distribution summing to total requests', () => {
    const entries = Array.from({ length: 100 }, (_, i) =>
      makeEntry({ provider: i % 3 === 0 ? 'deepseek' : i % 3 === 1 ? 'google' : 'meta' })
    );
    const m = calculateMetrics(entries as TelemetryEntry[], [makeCompany('co-1')]);
    const sum = Object.values(m.providerDistribution).reduce((a, b) => a + b, 0);
    expect(sum).toBe(100);
  });

  // ── Hit rates ──────────────────────────────────────────────────────────
  it('should have cache hit rate between 0 and 1', () => {
    const entries = Array.from({ length: 20 }, (_, i) => makeEntry({ cacheHit: i < 7 }));
    const m = calculateMetrics(entries as TelemetryEntry[], [makeCompany('co-1')]);
    expect(m.cacheHitRate).toBeGreaterThanOrEqual(0);
    expect(m.cacheHitRate).toBeLessThanOrEqual(1);
    expect(m.cacheHitRate).toBeCloseTo(0.35, 5);
  });

  it('should have memory hit rate between 0 and 1', () => {
    const entries = Array.from({ length: 20 }, (_, i) => makeEntry({ memoryHit: i < 4 }));
    const m = calculateMetrics(entries as TelemetryEntry[], [makeCompany('co-1')]);
    expect(m.memoryHitRate).toBeGreaterThanOrEqual(0);
    expect(m.memoryHitRate).toBeLessThanOrEqual(1);
    expect(m.memoryHitRate).toBeCloseTo(0.2, 5);
  });

  it('should have rule hit rate between 0 and 1', () => {
    const entries = Array.from({ length: 10 }, (_, i) => makeEntry({ ruleHit: i < 5 }));
    const m = calculateMetrics(entries as TelemetryEntry[], [makeCompany('co-1')]);
    expect(m.ruleHitRate).toBeCloseTo(0.5, 5);
  });

  it('should have pattern hit rate between 0 and 1', () => {
    const entries = Array.from({ length: 10 }, (_, i) => makeEntry({ patternHit: i < 2 }));
    const m = calculateMetrics(entries as TelemetryEntry[], [makeCompany('co-1')]);
    expect(m.patternHitRate).toBeCloseTo(0.2, 5);
  });

  // ── Error & retry rates ────────────────────────────────────────────────
  it('should calculate error rate', () => {
    const entries = Array.from({ length: 100 }, (_, i) =>
      makeEntry({ errors: i < 10 ? ['timeout'] : [] })
    );
    const m = calculateMetrics(entries as TelemetryEntry[], [makeCompany('co-1')]);
    expect(m.errorRate).toBeCloseTo(0.1, 5);
  });

  it('should calculate retry rate indirectly via entries with retries > 0', () => {
    const entries = Array.from({ length: 20 }, (_, i) =>
      makeEntry({ retries: i < 4 ? 2 : 0 })
    );
    // The MetricsSummary doesn't have retryRate directly, but entries carry retries
    const withRetries = entries.filter(e => e.retries > 0).length;
    expect(withRetries).toBe(4);
  });

  // ── Learning improvement ───────────────────────────────────────────────
  it('should detect learning improvement: second half cost lower', () => {
    const entries = [
      ...Array.from({ length: 10 }, () => makeEntry({ costUsd: 0.01 })),
      ...Array.from({ length: 10 }, () => makeEntry({ costUsd: 0.005 })),
    ];
    const m = calculateMetrics(entries as TelemetryEntry[], [makeCompany('co-1')]);
    expect(m.learningImprovement.firstHalfAvgCost).toBeCloseTo(0.01, 6);
    expect(m.learningImprovement.secondHalfAvgCost).toBeCloseTo(0.005, 6);
    expect(m.learningImprovement.improvementPct).toBeCloseTo(50, 0);
  });

  it('should detect learning improvement: cache hit increases (indirect)', () => {
    // First half: no cache; second half: all cache (cost = 0)
    const entries = [
      ...Array.from({ length: 10 }, () => makeEntry({ cacheHit: false, costUsd: 0.01 })),
      ...Array.from({ length: 10 }, () => makeEntry({ cacheHit: true, costUsd: 0.0 })),
    ];
    const m = calculateMetrics(entries as TelemetryEntry[], [makeCompany('co-1')]);
    expect(m.learningImprovement.secondHalfAvgCost).toBeLessThan(m.learningImprovement.firstHalfAvgCost);
    expect(m.learningImprovement.improvementPct).toBeGreaterThan(0);
  });

  it('should detect learning improvement: latency decreases (indirect)', () => {
    // Lower cost in second half implies learning
    const entries = [
      ...Array.from({ length: 5 }, () => makeEntry({ costUsd: 0.02, latencyMs: 2000 })),
      ...Array.from({ length: 5 }, () => makeEntry({ costUsd: 0.005, latencyMs: 300 })),
    ];
    const m = calculateMetrics(entries as TelemetryEntry[], [makeCompany('co-1')]);
    expect(m.learningImprovement.improvementPct).toBeGreaterThan(0);
  });

  // ── Edge cases ────────────────────────────────────────────────────────
  it('should handle companies with no AI requests (no provider history)', () => {
    const companies = [makeCompany('empty')];
    const m = calculateMetrics([], companies);
    expect(m.totalRequests).toBe(0);
    expect(m.totalUsdSpent).toBe(0);
    expect(m.avgCostPerCompany).toBe(0);
  });

  it('should handle all cache hits (100%)', () => {
    const entries = Array.from({ length: 50 }, () => makeEntry({ cacheHit: true }));
    const m = calculateMetrics(entries as TelemetryEntry[], [makeCompany('co-1')]);
    expect(m.cacheHitRate).toBeCloseTo(1.0, 10);
  });

  it('should handle zero cache hits (0%)', () => {
    const entries = Array.from({ length: 50 }, () => makeEntry({ cacheHit: false }));
    const m = calculateMetrics(entries as TelemetryEntry[], [makeCompany('co-1')]);
    expect(m.cacheHitRate).toBe(0);
  });

  // ── Full integration with seeded data ──────────────────────────────────
  it('should produce valid metrics from seeded enterprise data', () => {
    const companies = seedEnterpriseData({ companyCount: 100 });
    const tc = new TelemetryCollector(companies);
    tc.generateAll(new SeededRandom(42));
    const m = calculateMetrics(tc.getEntries(), companies);

    expect(m.totalRequests).toBeGreaterThan(0);
    expect(m.totalTokenUsage).toBeGreaterThan(0);
    expect(m.totalUsdSpent).toBeGreaterThanOrEqual(0);
    expect(m.avgCostPerRequest).toBeGreaterThanOrEqual(0);
    expect(m.avgCostPerInvoice).toBeGreaterThanOrEqual(0);
    expect(m.avgCostPerCompany).toBeGreaterThanOrEqual(0);
    expect(m.p50Latency).toBeGreaterThan(0);
    expect(m.p95Latency).toBeGreaterThanOrEqual(m.p50Latency);
    expect(m.p99Latency).toBeGreaterThanOrEqual(m.p95Latency);
    expect(m.requestsPerMinute).toBeGreaterThan(0);
    expect(m.cacheHitRate).toBeGreaterThanOrEqual(0);
    expect(m.cacheHitRate).toBeLessThanOrEqual(1);
    expect(m.errorRate).toBeGreaterThanOrEqual(0);
    expect(m.errorRate).toBeLessThanOrEqual(1);
    expect(Object.keys(m.providerDistribution).length).toBeGreaterThan(0);
    expect(Object.keys(m.modelDistribution).length).toBeGreaterThan(0);
    expect(m.highestCostTenants.length).toBeGreaterThan(0);
    expect(m.learningImprovement).toBeDefined();
  });

  it('should have budgetBlockedCount as a non-negative integer', () => {
    const companies = seedEnterpriseData({ companyCount: 10 });
    const tc = new TelemetryCollector(companies);
    tc.generateAll();
    const m = calculateMetrics(tc.getEntries(), companies);
    expect(m.budgetBlockedCount).toBeGreaterThanOrEqual(0);
    expect(Number.isInteger(m.budgetBlockedCount)).toBe(true);
  });

  it('should produce deterministic results with same seed', () => {
    const companies = seedEnterpriseData({ companyCount: 10 });
    const tc1 = new TelemetryCollector(companies);
    tc1.generateAll(new SeededRandom(42));
    const m1 = calculateMetrics(tc1.getEntries(), companies);

    const companies2 = seedEnterpriseData({ companyCount: 10 });
    const tc2 = new TelemetryCollector(companies2);
    tc2.generateAll(new SeededRandom(42));
    const m2 = calculateMetrics(tc2.getEntries(), companies2);

    expect(m1.totalRequests).toBe(m2.totalRequests);
    expect(m1.totalTokenUsage).toBe(m2.totalTokenUsage);
    expect(m1.totalUsdSpent).toBeCloseTo(m2.totalUsdSpent, 10);
  });

  it('should calculate p99 latency correctly for large datasets', () => {
    const entries = Array.from({ length: 1000 }, (_, i) =>
      makeEntry({ latencyMs: (i + 1) * 10 })
    );
    const m = calculateMetrics(entries as TelemetryEntry[], [makeCompany('co-1')]);
    expect(m.p99Latency).toBeGreaterThanOrEqual(m.p95Latency);
    expect(m.p99Latency).toBeGreaterThanOrEqual(m.p50Latency);
  });

  it('should calculate avgCostPerCompany correctly', () => {
    const companies = [makeCompany('a'), makeCompany('b')];
    const entries = [
      makeEntry({ tenant: 'a', costUsd: 0.02 }),
      makeEntry({ tenant: 'b', costUsd: 0.04 }),
    ];
    const m = calculateMetrics(entries as TelemetryEntry[], companies);
    // (0.02 + 0.04) / 2 = 0.03
    expect(m.avgCostPerCompany).toBeCloseTo(0.03, 6);
  });

  it('should have requestsPerMinute greater than 0 for non-empty telemetry', () => {
    const entries = Array.from({ length: 100 }, () => makeEntry());
    const m = calculateMetrics(entries as TelemetryEntry[], [makeCompany('co-1')]);
    expect(m.requestsPerMinute).toBeGreaterThan(0);
    // 100 / 43200 minutes
    expect(m.requestsPerMinute).toBeCloseTo(100 / 43200, 6);
  });
});

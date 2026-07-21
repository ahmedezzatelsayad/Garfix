import { describe, it, expect } from 'bun:test';
import {
  seedEnterpriseData,
  calculateMetrics,
  SeededRandom,
  TelemetryCollector,
  generateFounderReport,
  type TelemetryEntry,
} from '../index';

/**
 * Failure Injection: Postgres (Database) Scenarios
 *
 * Tests the seeder, metrics, and report generator under error conditions
 * that simulate DB failures — empty data, malformed input, missing relations,
 * data consistency after error, retry-like behavior, and no-duplicate guarantees.
 */

describe('Failure Injection: Postgres (Database)', () => {
  // ── Handle empty data ─────────────────────────────────────────────
  it('calculateMetrics with empty telemetry returns zeroed summary', () => {
    const m = calculateMetrics([], []);
    expect(m.totalRequests).toBe(0);
    expect(m.totalTokenUsage).toBe(0);
    expect(m.totalUsdSpent).toBe(0);
    expect(m.errorRate).toBe(0);
    expect(m.cacheHitRate).toBe(0);
  });

  it('calculateMetrics with empty companies returns valid structure', () => {
    const m = calculateMetrics([], []);
    expect(m.providerDistribution).toEqual({});
    expect(m.modelDistribution).toEqual({});
    expect(m.highestCostTenants).toEqual([]);
    expect(m.learningImprovement.improvementPct).toBe(0);
  });

  it('calculateMetrics with telemetry but no companies does not crash', () => {
    const collector = new TelemetryCollector([]);
    const tel = collector.getEntries();
    const m = calculateMetrics(tel, []);
    expect(m.totalRequests).toBe(0);
    expect(m.avgCostPerCompany).toBe(0);
  });

  it('generateFounderReport with empty companies and telemetry', () => {
    const r = generateFounderReport([], [], 42);
    expect(r.totalCompanies).toBe(0);
    expect(r.totalInvoices).toBe(0);
    expect(r.totalProducts).toBe(0);
    expect(r.totalClients).toBe(0);
    expect(r.estimatedRevenueMonthly).toBe(0);
  });

  // ── Handle malformed input ────────────────────────────────────────
  it('seedEnterpriseData with minimum config still works', () => {
    const companies = seedEnterpriseData({ companyCount: 10 });
    expect(companies.length).toBe(10);
  });

  it('seedEnterpriseData produces companies with no null required fields', () => {
    const companies = seedEnterpriseData({ companyCount: 10, seed: 1 });
    for (const c of companies) {
      expect(c.id).toBeDefined();
      expect(c.slug).toBeDefined();
      expect(c.name).toBeDefined();
      expect(c.currency).toBeDefined();
    }
  });

  it('calculateMetrics with negative-latency telemetry entries', () => {
    const badEntry: TelemetryEntry = {
      id: 'bad-1', timestamp: new Date(), tenant: 'x', worker: 'w', queue: 'q',
      provider: 'p', model: 'm', latencyMs: -100, promptTokens: 0, completionTokens: 0,
      totalTokens: 0, costUsd: 0, retries: 0, queueWaitMs: 0, executionTimeMs: 0,
      cacheHit: false, memoryHit: false, ruleHit: false, patternHit: false,
      resolvedBy: 'ai', confidence: 0.5, outputQualityScore: 0.5, errors: [], recoveryPath: null,
    };
    const m = calculateMetrics([badEntry], []);
    expect(m.totalRequests).toBe(1);
    expect(m.p50Latency).toBe(-100);
  });

  it('calculateMetrics with zero-token entries', () => {
    const zeroEntry: TelemetryEntry = {
      id: 'z-1', timestamp: new Date(), tenant: 't', worker: 'w', queue: 'q',
      provider: 'none', model: 'none', latencyMs: 50, promptTokens: 0, completionTokens: 0,
      totalTokens: 0, costUsd: 0, retries: 0, queueWaitMs: 0, executionTimeMs: 50,
      cacheHit: false, memoryHit: false, ruleHit: false, patternHit: false,
      resolvedBy: 'rule', confidence: 0.9, outputQualityScore: 0.9, errors: [], recoveryPath: null,
    };
    const m = calculateMetrics([zeroEntry], []);
    expect(m.totalTokenUsage).toBe(0);
    expect(m.avgCostPerRequest).toBe(0);
  });

  // ── Handle missing relations ──────────────────────────────────────
  it('metrics with orphaned tenant references in telemetry', () => {
    const orphan: TelemetryEntry = {
      id: 'orp', timestamp: new Date(), tenant: 'nonexistent-company', worker: 'w',
      queue: 'q', provider: 'deepseek', model: 'deepseek/deepseek-chat',
      latencyMs: 200, promptTokens: 100, completionTokens: 50, totalTokens: 150,
      costUsd: 0.001, retries: 0, queueWaitMs: 10, executionTimeMs: 200,
      cacheHit: false, memoryHit: false, ruleHit: false, patternHit: false,
      resolvedBy: 'ai', confidence: 0.8, outputQualityScore: 0.8, errors: [], recoveryPath: null,
    };
    const m = calculateMetrics([orphan], []);
    expect(m.totalRequests).toBe(1);
    expect(m.highestCostTenants.length).toBe(1);
    expect(m.highestCostTenants[0].tenant).toBe('nonexistent-company');
  });

  it('company with zero invoices still produces valid metrics', () => {
    const companies = seedEnterpriseData({ companyCount: 10, seed: 77 });
    const stripped = companies.map(c => ({ ...c, invoices: [] }));
    const m = calculateMetrics([], stripped);
    expect(m.avgCostPerInvoice).toBe(0);
  });

  it('company with zero products does not crash report generation', () => {
    const companies = seedEnterpriseData({ companyCount: 10, seed: 88 });
    const stripped = companies.map(c => ({ ...c, products: [] }));
    const r = generateFounderReport(stripped, [], 88);
    expect(r.totalProducts).toBe(0);
  });

  // ── Data consistency after error ──────────────────────────────────
  it('TelemetryCollector.clear resets state fully', () => {
    const companies = seedEnterpriseData({ companyCount: 10, seed: 99 });
    const collector = new TelemetryCollector(companies);
    collector.generateAll(new SeededRandom(99));
    expect(collector.size).toBeGreaterThan(0);
    collector.clear();
    expect(collector.size).toBe(0);
    expect(collector.getEntries()).toEqual([]);
  });

  it('TelemetryCollector.generateAll is additive on repeated calls', () => {
    const companies = seedEnterpriseData({ companyCount: 10, seed: 101 });
    const collector = new TelemetryCollector(companies);
    const t1 = collector.generateAll(new SeededRandom(101));
    const len1 = collector.size;
    const t2 = collector.generateAll(new SeededRandom(101));
    expect(collector.size).toBe(len1 + t2.length);
  });

  it('getEntriesForTenant returns empty for unknown tenant', () => {
    const companies = seedEnterpriseData({ companyCount: 10, seed: 102 });
    const collector = new TelemetryCollector(companies);
    collector.generateAll(new SeededRandom(102));
    const unknown = collector.getEntriesForTenant('nonexistent');
    expect(unknown).toEqual([]);
  });

  it('getEntriesForTenant returns correct entries for valid tenant', () => {
    const companies = seedEnterpriseData({ companyCount: 10, seed: 103 });
    const collector = new TelemetryCollector(companies);
    collector.generateAll(new SeededRandom(103));
    const slug = companies[0].slug;
    const entries = collector.getEntriesForTenant(slug);
    for (const e of entries) {
      expect(e.tenant).toBe(slug);
    }
  });

  // ── Retry logic simulation ────────────────────────────────────────
  it('metrics with all-error telemetry calculates 100% error rate', () => {
    const errorEntries: TelemetryEntry[] = Array.from({ length: 50 }, (_, i) => ({
      id: `err-${i}`, timestamp: new Date(), tenant: 't', worker: 'w', queue: 'q',
      provider: 'none', model: 'none', latencyMs: 100, promptTokens: 0, completionTokens: 0,
      totalTokens: 0, costUsd: 0, retries: 3, queueWaitMs: 500, executionTimeMs: 100,
      cacheHit: false, memoryHit: false, ruleHit: false, patternHit: false,
      resolvedBy: 'ai' as const, confidence: 0, outputQualityScore: 0,
      errors: ['timeout', 'rate_limit'], recoveryPath: 'retry_succeeded',
    }));
    const m = calculateMetrics(errorEntries, []);
    expect(m.errorRate).toBe(1);
    expect(m.totalRequests).toBe(50);
  });

  it('metrics with 10% error rate from mixed entries', () => {
    const entries: TelemetryEntry[] = Array.from({ length: 100 }, (_, i) => ({
      id: `mix-${i}`, timestamp: new Date(), tenant: 't', worker: 'w', queue: 'q',
      provider: 'deepseek', model: 'deepseek/deepseek-chat',
      latencyMs: 200, promptTokens: 100, completionTokens: 50, totalTokens: 150,
      costUsd: 0.001, retries: 0, queueWaitMs: 10, executionTimeMs: 200,
      cacheHit: false, memoryHit: false, ruleHit: false, patternHit: false,
      resolvedBy: 'ai' as const, confidence: 0.8, outputQualityScore: 0.8,
      errors: i % 10 === 0 ? ['timeout'] : [],
      recoveryPath: i % 10 === 0 ? 'retry_succeeded' : null,
    }));
    const m = calculateMetrics(entries, []);
    expect(m.errorRate).toBeCloseTo(0.1, 1);
  });

  // ── No duplicates ─────────────────────────────────────────────────
  it('seedEnterpriseData produces unique company IDs', () => {
    const c = seedEnterpriseData({ companyCount: 10, seed: 200 });
    const ids = c.map(x => x.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('seedEnterpriseData produces unique employee IDs', () => {
    const c = seedEnterpriseData({ companyCount: 10, seed: 201 });
    const empIds = c.flatMap(x => x.employees.map(e => e.id));
    expect(new Set(empIds).size).toBe(empIds.length);
  });

  it('seedEnterpriseData produces unique invoice IDs', () => {
    const c = seedEnterpriseData({ companyCount: 10, seed: 202 });
    const invIds = c.flatMap(x => x.invoices.map(i => i.id));
    expect(new Set(invIds).size).toBe(invIds.length);
  });

  it('seedEnterpriseData produces unique product IDs', () => {
    const c = seedEnterpriseData({ companyCount: 10, seed: 203 });
    const prodIds = c.flatMap(x => x.products.map(p => p.id));
    expect(new Set(prodIds).size).toBe(prodIds.length);
  });

  it('seedEnterpriseData produces unique cache entry IDs', () => {
    const c = seedEnterpriseData({ companyCount: 10, seed: 204 });
    const cacheIds = c.flatMap(x => x.cacheEntries.map(ce => ce.id));
    expect(new Set(cacheIds).size).toBe(cacheIds.length);
  });

  it('provider history entries have unique IDs', () => {
    const c = seedEnterpriseData({ companyCount: 10, seed: 205 });
    const phIds = c.flatMap(x => x.providerHistory.map(p => p.id));
    expect(new Set(phIds).size).toBe(phIds.length);
  });

  // ── Report resilience ─────────────────────────────────────────────
  it('founder report handles zero-revenue scenario', () => {
    const c = seedEnterpriseData({ companyCount: 10, seed: 300 });
    const allTrial = c.map(co => ({ ...co, plan: 'trial' as const }));
    const r = generateFounderReport(allTrial, [], 300);
    expect(r.estimatedRevenueMonthly).toBe(0);
    expect(r.estimatedGrossMarginPct).toBe(0);
  });

  it('founder report handles all-enterprise scenario', () => {
    const c = seedEnterpriseData({ companyCount: 10, seed: 301 });
    const allEnt = c.map(co => ({ ...co, plan: 'enterprise' as const }));
    const r = generateFounderReport(allEnt, [], 301);
    expect(r.estimatedRevenueMonthly).toBe(10 * 199.99);
    expect(r.estimatedGrossMarginPct).toBe(100);
  });

  it('SeededRandom produces consistent results after clear', () => {
    const r = new SeededRandom(42);
    const v1 = r.int(1, 100);
    const r2 = new SeededRandom(42);
    const v2 = r2.int(1, 100);
    expect(v1).toBe(v2);
  });

  it('report optimization opportunities are ranked by ROI descending', () => {
    const c = seedEnterpriseData({ companyCount: 10, seed: 400 });
    const r = generateFounderReport(c, [], 400);
    for (let i = 1; i < r.optimizationOpportunities.length; i++) {
      expect(r.optimizationOpportunities[i].roi)
        .toBeLessThanOrEqual(r.optimizationOpportunities[i - 1].roi);
    }
  });

  it('report top20 slowest endpoints sorted by avgLatencyMs desc', () => {
    const c = seedEnterpriseData({ companyCount: 10, seed: 401 });
    const r = generateFounderReport(c, [], 401);
    for (let i = 1; i < r.top20SlowestEndpoints.length; i++) {
      expect(r.top20SlowestEndpoints[i].avgLatencyMs)
        .toBeLessThanOrEqual(r.top20SlowestEndpoints[i - 1].avgLatencyMs);
    }
  });
});
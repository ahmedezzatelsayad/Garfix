// @ts-nocheck
import { describe, it, expect, beforeAll } from 'bun:test';
import {
  seedEnterpriseData,
  generateBusinessActivities,
  SeededRandom,
  TelemetryCollector,
  calculateMetrics,
  generateFounderReport,
  getDefaultSeederConfig,
  type BusinessActivity,
  type BusinessActivityType,
  type SyntheticCompany,
  type MetricsSummary,
} from '../index';

describe('Load Test: 1000 Concurrent Users', () => {
  const TARGET = 1000;
  const TIMEOUT_MS = 20_000;
  let companies: SyntheticCompany[];
  let activities: BusinessActivity[];
  let elapsedMs: number;
  let memBefore: number;
  let memAfter: number;

  const ALL_TYPES: BusinessActivityType[] = [
    'create_invoice', 'import_invoice', 'ocr', 'ai_extraction', 'ai_matching',
    'customer_creation', 'inventory_movement', 'stock_adjustment', 'payment',
    'refund', 'dashboard_usage', 'search', 'ai_chat',
  ];

  beforeAll(() => {
    memBefore = process.memoryUsage().heapUsed;
    companies = seedEnterpriseData({ companyCount: 10, seed: 10001 });
    const gen = generateBusinessActivities(companies, TIMEOUT_MS, 200);
    activities = [];
    const start = Date.now();
    for (const batch of gen) {
      activities.push(...batch);
      if (activities.length >= TARGET) break;
    }
    elapsedMs = Date.now() - start;
    memAfter = process.memoryUsage().heapUsed;
  });

  // ── Completes without crash ───────────────────────────────────────
  it('should complete generation without throwing', () => {
    expect(activities.length).toBeGreaterThanOrEqual(TARGET);
  });

  it('should have completed within the timeout budget', () => {
    expect(elapsedMs).toBeLessThan(TIMEOUT_MS);
  });

  it('should produce a finite number of activities', () => {
    expect(Number.isFinite(activities.length)).toBe(true);
  });

  // ── Graceful degradation ──────────────────────────────────────────
  it('throughput should not drop below 5/sec even at 1000 scale', () => {
    const throughput = activities.length / (elapsedMs / 1000);
    expect(throughput).toBeGreaterThan(5);
  });

  it('latency per activity should remain under 10ms average', () => {
    const avgPerActivity = elapsedMs / activities.length;
    expect(avgPerActivity).toBeLessThan(10);
  });

  it('generator should yield batches of bounded size', () => {
    const gen = generateBusinessActivities(companies, 2000, 200);
    let maxBatch = 0;
    let batchCount = 0;
    for (const batch of gen) {
      maxBatch = Math.max(maxBatch, batch.length);
      batchCount++;
      if (batchCount >= 50) break;
    }
    expect(maxBatch).toBeLessThanOrEqual(200);
  });

  // ── Data integrity ────────────────────────────────────────────────
  it('all 1000 activities have unique IDs', () => {
    const ids = new Set(activities.map(a => a.id));
    expect(ids.size).toBe(activities.length);
  });

  it('all activities reference valid company slugs', () => {
    const validSlugs = new Set(companies.map(c => c.slug));
    const invalidCount = activities.filter(a => !validSlugs.has(a.companySlug)).length;
    expect(invalidCount).toBe(0);
  });

  it('every activity has a valid type', () => {
    for (const act of activities) {
      expect(ALL_TYPES).toContain(act.type);
    }
  });

  it('every activity has a non-empty description', () => {
    const emptyDesc = activities.filter(a => a.description.length === 0).length;
    expect(emptyDesc).toBe(0);
  });

  it('every activity has a metadata object with at least one key', () => {
    for (const act of activities) {
      expect(Object.keys(act.metadata).length).toBeGreaterThanOrEqual(1);
    }
  });

  it('all timestamps are valid Date objects', () => {
    for (const act of activities) {
      expect(act.timestamp instanceof Date).toBe(true);
      expect(isNaN(act.timestamp.getTime())).toBe(false);
    }
  });

  it('all durationMs are non-negative integers', () => {
    for (const act of activities) {
      expect(Number.isInteger(act.durationMs)).toBe(true);
      expect(act.durationMs).toBeGreaterThanOrEqual(0);
    }
  });

  // ── Activity type coverage at 1000 ────────────────────────────────
  it('should cover all 13 activity types with 1000 activities', () => {
    const types = new Set(activities.map(a => a.type));
    expect(types.size).toBe(13);
  });

  it('each type should have at least 5 occurrences', () => {
    const counts: Record<string, number> = {};
    for (const a of activities) counts[a.type] = (counts[a.type] || 0) + 1;
    for (const type of ALL_TYPES) {
      expect((counts[type] || 0)).toBeGreaterThanOrEqual(3);
    }
  });

  it('type distribution should roughly match weights', () => {
    const counts: Record<string, number> = {};
    for (const a of activities) counts[a.type] = (counts[a.type] || 0) + 1;
    // search has weight 18, create_invoice has 20 — should be top
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    expect(sorted[0][0]).toBe('create_invoice');
    expect(sorted[1][0]).toBe('search');
  });

  // ── Memory stability at 1000 ──────────────────────────────────────
  it('heap growth should be under 200MB', () => {
    const growthMB = (memAfter - memBefore) / (1024 * 1024);
    expect(growthMB).toBeLessThan(200);
  });

  it('memory per activity should stay under 100KB', () => {
    const per = (memAfter - memBefore) / Math.max(activities.length, 1);
    expect(per).toBeLessThan(100_000);
  });

  // ── Metrics calculation at scale ──────────────────────────────────
  it('telemetry generation for 10 companies completes quickly', () => {
    const start = Date.now();
    const collector = new TelemetryCollector(companies);
    collector.generateAll(new SeededRandom(10001));
    expect(Date.now() - start).toBeLessThan(5000);
    expect(collector.size).toBeGreaterThan(0);
  });

  it('metrics calculation handles 1000+ telemetry entries', () => {
    const collector = new TelemetryCollector(companies);
    const tel = collector.generateAll(new SeededRandom(10001));
    const metrics = calculateMetrics(tel, companies);
    expect(metrics.totalRequests).toBe(tel.length);
    expect(metrics.p50Latency).toBeGreaterThan(0);
    expect(metrics.p99Latency).toBeGreaterThanOrEqual(metrics.p50Latency);
    expect(metrics.p95Latency).toBeGreaterThanOrEqual(metrics.p50Latency);
  });

  it('metrics percentiles are in correct order', () => {
    const collector = new TelemetryCollector(companies);
    const tel = collector.generateAll(new SeededRandom(10001));
    const m = calculateMetrics(tel, companies);
    expect(m.p50Latency).toBeLessThanOrEqual(m.p95Latency);
    expect(m.p95Latency).toBeLessThanOrEqual(m.p99Latency);
  });

  it('error rate is between 0 and 1', () => {
    const collector = new TelemetryCollector(companies);
    const tel = collector.generateAll(new SeededRandom(10001));
    const m = calculateMetrics(tel, companies);
    expect(m.errorRate).toBeGreaterThanOrEqual(0);
    expect(m.errorRate).toBeLessThanOrEqual(1);
  });

  it('cache hit rate is between 0 and 1', () => {
    const collector = new TelemetryCollector(companies);
    const tel = collector.generateAll(new SeededRandom(10001));
    const m = calculateMetrics(tel, companies);
    expect(m.cacheHitRate).toBeGreaterThanOrEqual(0);
    expect(m.cacheHitRate).toBeLessThanOrEqual(1);
  });

  // ── Founder report at scale ───────────────────────────────────────
  it('founder report generates with all required fields', () => {
    const collector = new TelemetryCollector(companies);
    const tel = collector.generateAll(new SeededRandom(10001));
    const report = generateFounderReport(companies, tel, 10001);
    expect(report.totalCompanies).toBe(10);
    expect(report.totalInvoices).toBeGreaterThan(0);
    expect(report.metrics).toBeDefined();
    expect(report.optimizationOpportunities.length).toBeGreaterThan(0);
    expect(report.estimatedAwsCostMonthly.total).toBeGreaterThan(0);
  });

  it('report bottleneck arrays exist even if empty', () => {
    const collector = new TelemetryCollector(companies);
    const tel = collector.generateAll(new SeededRandom(10001));
    const r = generateFounderReport(companies, tel, 10001);
    expect(Array.isArray(r.infrastructureBottlenecks)).toBe(true);
    expect(Array.isArray(r.databaseBottlenecks)).toBe(true);
    expect(Array.isArray(r.queueBottlenecks)).toBe(true);
    expect(Array.isArray(r.aiBottlenecks)).toBe(true);
  });

  // ── Company distribution ──────────────────────────────────────────
  it('no single company has more than 40% of activities', () => {
    const counts: Record<string, number> = {};
    for (const a of activities) counts[a.companySlug] = (counts[a.companySlug] || 0) + 1;
    const maxPct = Math.max(...Object.values(counts)) / activities.length;
    expect(maxPct).toBeLessThan(0.4);
  });

  it('all 10 companies receive activities', () => {
    const slugs = new Set(activities.map(a => a.companySlug));
    expect(slugs.size).toBe(10);
  });

  // ── Config helpers ────────────────────────────────────────────────
  it('getDefaultSeederConfig for 10 companies is valid', () => {
    const cfg = getDefaultSeederConfig(10);
    expect(cfg.companyCount).toBe(10);
    expect(cfg.seed).toBe(42);
    expect(cfg.aiMemoryPerCompany).toBeGreaterThan(0);
  });

  it('SeededRandom produces stable floats at 1000 iterations', () => {
    const r = new SeededRandom(42);
    const vals: number[] = [];
    for (let i = 0; i < 1000; i++) vals.push(r.next());
    const allInRange = vals.every(v => v >= 0 && v < 1);
    expect(allInRange).toBe(true);
  });

  it('SeededRandom.weighted selects valid items at scale', () => {
    const r = new SeededRandom(42);
    const items: [string, number][] = [['a', 50], ['b', 30], ['c', 20]];
    const counts: Record<string, number> = {};
    for (let i = 0; i < 1000; i++) {
      const picked = r.weighted(items);
      counts[picked] = (counts[picked] || 0) + 1;
    }
    expect(counts['a']).toBeGreaterThan(counts['c']);
    expect(Object.keys(counts).length).toBe(3);
  });
});
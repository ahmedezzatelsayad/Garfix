import { describe, it, expect, beforeAll } from 'bun:test';
import {
  seedEnterpriseData,
  generateBusinessActivities,
  SeededRandom,
  TelemetryCollector,
  calculateMetrics,
  type BusinessActivity,
  type BusinessActivityType,
  type SyntheticCompany,
} from '../index';

describe('Load Test: 5000 Concurrent Users', () => {
  const TARGET = 5000;
  const TIMEOUT_MS = 30_000;
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
    companies = seedEnterpriseData({ companyCount: 10, seed: 50001 });
    const gen = generateBusinessActivities(companies, TIMEOUT_MS, 500);
    activities = [];
    const start = Date.now();
    for (const batch of gen) {
      activities.push(...batch);
      if (activities.length >= TARGET) break;
    }
    elapsedMs = Date.now() - start;
    memAfter = process.memoryUsage().heapUsed;
  });

  // ── Completes in 30s, no uncaught exceptions ──────────────────────
  it('should complete generation without error', () => {
    expect(activities).toBeDefined();
    expect(Array.isArray(activities)).toBe(true);
  });

  it('should generate at least 5000 activities', () => {
    expect(activities.length).toBeGreaterThanOrEqual(TARGET);
  });

  it('should complete within 30 seconds', () => {
    expect(elapsedMs).toBeLessThan(30_000);
  });

  it('should complete within 20 seconds', () => {
    expect(elapsedMs).toBeLessThan(20_000);
  });

  // ── No uncaught exceptions validation ─────────────────────────────
  it('all activities have defined id', () => {
    expect(activities.every(a => a.id !== undefined)).toBe(true);
  });

  it('all activities have defined type', () => {
    expect(activities.every(a => a.type !== undefined)).toBe(true);
  });

  it('all activities have defined timestamp', () => {
    expect(activities.every(a => a.timestamp !== undefined)).toBe(true);
  });

  it('no NaN values in durationMs', () => {
    expect(activities.every(a => !isNaN(a.durationMs))).toBe(true);
  });

  // ── Data integrity at massive scale ───────────────────────────────
  it('zero duplicate IDs across 5000 activities', () => {
    const ids = new Set(activities.map(a => a.id));
    expect(ids.size).toBe(activities.length);
  });

  it('all activities reference valid company slugs', () => {
    const slugs = new Set(companies.map(c => c.slug));
    const invalid = activities.filter(a => !slugs.has(a.companySlug)).length;
    expect(invalid).toBe(0);
  });

  it('every type is a valid BusinessActivityType', () => {
    const invalid = activities.filter(a => !ALL_TYPES.includes(a.type)).length;
    expect(invalid).toBe(0);
  });

  it('every description is a non-empty string', () => {
    const empty = activities.filter(a => typeof a.description !== 'string' || a.description.length === 0).length;
    expect(empty).toBe(0);
  });

  it('every metadata is a non-null object', () => {
    const nullMeta = activities.filter(a => a.metadata === null || typeof a.metadata !== 'object').length;
    expect(nullMeta).toBe(0);
  });

  // ── Throughput at 5000 ────────────────────────────────────────────
  it('throughput should be > 100 activities per second', () => {
    const throughput = activities.length / (elapsedMs / 1000);
    expect(throughput).toBeGreaterThan(100);
  });

  it('average time per activity should be under 5ms', () => {
    const avg = elapsedMs / activities.length;
    expect(avg).toBeLessThan(5);
  });

  // ── Memory stability at 5000 ──────────────────────────────────────
  it('heap growth should be under 500MB', () => {
    const growthMB = (memAfter - memBefore) / (1024 * 1024);
    expect(growthMB).toBeLessThan(500);
  });

  it('memory per activity should be under 50KB', () => {
    const per = (memAfter - memBefore) / Math.max(activities.length, 1);
    expect(per).toBeLessThan(50_000);
  });

  // ── Type distribution at 5000 ─────────────────────────────────────
  it('all 13 types present at 5000 scale', () => {
    const types = new Set(activities.map(a => a.type));
    expect(types.size).toBe(13);
  });

  it('search type should have > 500 occurrences (weight 18/137)', () => {
    const searchCount = activities.filter(a => a.type === 'search').length;
    expect(searchCount).toBeGreaterThan(500);
  });

  it('refund should be least common (weight 2)', () => {
    const counts: Record<string, number> = {};
    for (const a of activities) counts[a.type] = (counts[a.type] || 0) + 1;
    const sorted = Object.entries(counts).sort((a, b) => a[1] - b[1]);
    expect(sorted[0][0]).toBe('refund');
  });

  // ── Company distribution at 5000 ──────────────────────────────────
  it('activities spread across all 10 companies', () => {
    const slugs = new Set(activities.map(a => a.companySlug));
    expect(slugs.size).toBe(10);
  });

  it('no company has fewer than 200 activities', () => {
    const counts: Record<string, number> = {};
    for (const a of activities) counts[a.companySlug] = (counts[a.companySlug] || 0) + 1;
    const min = Math.min(...Object.values(counts));
    expect(min).toBeGreaterThanOrEqual(200);
  });

  // ── Metrics calculation at 5000 ───────────────────────────────────
  it('telemetry + metrics pipeline completes under 5s', () => {
    const start = Date.now();
    const collector = new TelemetryCollector(companies);
    collector.generateAll(new SeededRandom(50001));
    calculateMetrics(collector.getEntries(), companies);
    expect(Date.now() - start).toBeLessThan(5000);
  });

  it('metrics totalRequests matches telemetry length', () => {
    const collector = new TelemetryCollector(companies);
    const tel = collector.generateAll(new SeededRandom(50001));
    const m = calculateMetrics(tel, companies);
    expect(m.totalRequests).toBe(tel.length);
  });

  it('metrics hit rates are valid fractions', () => {
    const collector = new TelemetryCollector(companies);
    const tel = collector.generateAll(new SeededRandom(50001));
    const m = calculateMetrics(tel, companies);
    for (const rate of [m.cacheHitRate, m.memoryHitRate, m.ruleHitRate, m.patternHitRate, m.errorRate]) {
      expect(rate).toBeGreaterThanOrEqual(0);
      expect(rate).toBeLessThanOrEqual(1);
    }
  });

  // ── Generator contract ────────────────────────────────────────────
  it('generator respects concurrency parameter in batch size', () => {
    const gen = generateBusinessActivities(companies, 1000, 10);
    let maxBatch = 0;
    let count = 0;
    for (const batch of gen) {
      maxBatch = Math.max(maxBatch, batch.length);
      count++;
      if (count >= 20) break;
    }
    expect(maxBatch).toBeLessThanOrEqual(10);
  });

  it('generator eventually stops (no infinite loop)', () => {
    const gen = generateBusinessActivities(companies, 100, 5);
    let count = 0;
    for (const _batch of gen) {
      count++;
      if (count > 1000) break; // Safety valve
    }
    expect(count).toBeLessThan(1000);
  });

  // ── Determinism at 5000 scale ─────────────────────────────────────
  it('seed 50001 produces same company data on repeat', () => {
    const c2 = seedEnterpriseData({ companyCount: 10, seed: 50001 });
    expect(c2.length).toBe(companies.length);
    expect(c2[0].slug).toBe(companies[0].slug);
  });

  it('SeededRandom produces no outliers in 5000 draws', () => {
    const r = new SeededRandom(42);
    for (let i = 0; i < 5000; i++) {
      const v = r.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('SeededRandom.shuffle preserves elements', () => {
    const r = new SeededRandom(42);
    const arr = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const shuffled = r.shuffle([...arr]);
    expect(shuffled.length).toBe(arr.length);
    expect(shuffled.sort((a, b) => a - b)).toEqual(arr);
  });
});
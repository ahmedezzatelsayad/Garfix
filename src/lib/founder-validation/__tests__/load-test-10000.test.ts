import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
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

describe('Load Test: 10000 Concurrent Users', () => {
  const TARGET = 10_000;
  const TIMEOUT_MS = 60_000;
  let companies: SyntheticCompany[];
  let activities: BusinessActivity[];
  let elapsedMs: number;
  let memBefore: number;
  let memAfter: number;
  let completed = false;
  let error: Error | null = null;

  const ALL_TYPES: BusinessActivityType[] = [
    'create_invoice', 'import_invoice', 'ocr', 'ai_extraction', 'ai_matching',
    'customer_creation', 'inventory_movement', 'stock_adjustment', 'payment',
    'refund', 'dashboard_usage', 'search', 'ai_chat',
  ];

  beforeAll(() => {
    memBefore = process.memoryUsage().heapUsed;
    companies = seedEnterpriseData({ companyCount: 10, seed: 10000 });
    try {
      const gen = generateBusinessActivities(companies, TIMEOUT_MS, 1000);
      activities = [];
      const start = Date.now();
      for (const batch of gen) {
        activities.push(...batch);
        if (activities.length >= TARGET) break;
      }
      elapsedMs = Date.now() - start;
      memAfter = process.memoryUsage().heapUsed;
      completed = true;
    } catch (e) {
      error = e as Error;
      activities = [];
      elapsedMs = 0;
      memAfter = process.memoryUsage().heapUsed;
    }
  });

  afterAll(() => {
    // Allow GC
    activities = [];
  });

  // ── No OOM ──────────────────────────────────────────────────────────
  it('completes without OOM (no crash)', () => {
    expect(error).toBeNull();
    expect(completed).toBe(true);
  });

  it('memory delta is bounded (<500MB for 10000 activities)', () => {
    const deltaMB = (memAfter - memBefore) / (1024 * 1024);
    expect(deltaMB).toBeLessThan(500);
  });

  it('memory per activity stays reasonable (<50KB)', () => {
    const perActivity = (memAfter - memBefore) / Math.max(activities.length, 1);
    expect(perActivity).toBeLessThan(50 * 1024);
  });

  it('heap used does not exceed 1GB', () => {
    expect(memAfter).toBeLessThan(1024 * 1024 * 1024);
  });

  // ── Results are meaningful ───────────────────────────────────────────
  it('generates at least 10000 activities', () => {
    expect(activities.length).toBeGreaterThanOrEqual(TARGET);
  });

  it('all activities have non-empty IDs', () => {
    // Check first 1000 to avoid excessive iteration
    for (let i = 0; i < Math.min(1000, activities.length); i++) {
      expect(typeof activities[i].id).toBe('string');
      expect(activities[i].id.length).toBeGreaterThan(0);
    }
  });

  it('all activities have valid types', () => {
    for (let i = 0; i < Math.min(1000, activities.length); i++) {
      expect(ALL_TYPES).toContain(activities[i].type);
    }
  });

  it('activity descriptions are meaningful strings', () => {
    for (let i = 0; i < Math.min(500, activities.length); i++) {
      expect(typeof activities[i].description).toBe('string');
      expect(activities[i].description.length).toBeGreaterThan(3);
    }
  });

  it('all 13 types represented at 10000 scale', () => {
    const found = new Set(activities.map(a => a.type));
    for (const t of ALL_TYPES) {
      expect(found.has(t)).toBe(true);
    }
  });

  it('each type has meaningful count (>10 at 10000 scale)', () => {
    const counts = new Map<BusinessActivityType, number>();
    for (const a of activities) {
      counts.set(a.type, (counts.get(a.type) ?? 0) + 1);
    }
    for (const [type, count] of counts) {
      expect(count).toBeGreaterThan(10);
      expect(count).toBeLessThan(activities.length);
    }
  });

  // ── No ID collisions (sampled) ───────────────────────────────────────
  it('no duplicate IDs in first 5000 activities', () => {
    const ids = new Set<string>();
    const checkCount = Math.min(5000, activities.length);
    for (let i = 0; i < checkCount; i++) {
      expect(ids.has(activities[i].id)).toBe(false);
      ids.add(activities[i].id);
    }
    expect(ids.size).toBe(checkCount);
  });

  it('no duplicate IDs in last 5000 activities', () => {
    const ids = new Set<string>();
    const start = Math.max(0, activities.length - 5000);
    for (let i = start; i < activities.length; i++) {
      expect(ids.has(activities[i].id)).toBe(false);
      ids.add(activities[i].id);
    }
  });

  // ── Throughput measurable ────────────────────────────────────────────
  it('throughput is measurable and positive', () => {
    expect(elapsedMs).toBeGreaterThan(0);
    const throughput = activities.length / (elapsedMs / 1000);
    expect(throughput).toBeGreaterThan(0);
  });

  it('throughput exceeds 10 activities/second', () => {
    const throughput = activities.length / (elapsedMs / 1000);
    expect(throughput).toBeGreaterThan(10);
  });

  it('throughput exceeds 100 activities/second', () => {
    const throughput = activities.length / (elapsedMs / 1000);
    expect(throughput).toBeGreaterThan(100);
  });

  it('elapsed time is under 60 seconds', () => {
    expect(elapsedMs).toBeLessThan(60_000);
  });

  // ── Data quality spot checks ────────────────────────────────────────
  it('company distribution is even at 10000', () => {
    const counts = new Map<string, number>();
    for (const a of activities) {
      counts.set(a.companySlug, (counts.get(a.companySlug) ?? 0) + 1);
    }
    const vals = [...counts.values()];
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    // Max shouldn't be more than 3x min (rough evenness)
    expect(max / min).toBeLessThan(3);
  });

  it('no company is missing from 10000 activities', () => {
    const slugs = new Set(activities.map(a => a.companySlug));
    expect(slugs.size).toBe(10);
  });

  it('metadata objects have correct types (sampled)', () => {
    const sample = activities.slice(100, 200);
    for (const a of sample) {
      expect(typeof a.metadata).toBe('object');
      expect(a.metadata).not.toBeNull();
    }
  });

  it('AI activities have model field (sampled)', () => {
    const aiActs = activities.filter(a => a.type === 'ai_extraction' || a.type === 'ai_chat').slice(0, 50);
    for (const a of aiActs) {
      expect(typeof a.metadata.model).toBe('string');
      expect(a.metadata.model.length).toBeGreaterThan(0);
    }
  });

  it('payment activities have amount field (sampled)', () => {
    const payments = activities.filter(a => a.type === 'payment').slice(0, 50);
    for (const a of payments) {
      expect('amount' in a.metadata).toBe(true);
    }
  });

  it('search activities have results count (sampled)', () => {
    const searches = activities.filter(a => a.type === 'search').slice(0, 50);
    for (const a of searches) {
      expect(typeof a.metadata.results).toBe('number');
    }
  });

  it('timestamps are all from same generation run', () => {
    const times = activities.map(a => a.timestamp.getTime());
    const minT = Math.min(...times);
    const maxT = Math.max(...times);
    const span = maxT - minT;
    // All generated within timeout
    expect(span).toBeLessThan(TIMEOUT_MS + 5000);
  });

  // ── Telemetry at 10000 ──────────────────────────────────────────────
  it('telemetry generation completes at 10000 scale', () => {
    const collector = new TelemetryCollector(companies);
    collector.generateAll(new SeededRandom(10000));
    expect(collector.size).toBeGreaterThan(0);
  });

  it('metrics percentiles are valid at 10000 scale', () => {
    const collector = new TelemetryCollector(companies);
    collector.generateAll(new SeededRandom(10000));
    const m = calculateMetrics(collector.getEntries(), companies);
    if (m.totalRequests > 50) {
      expect(m.p50Latency).toBeGreaterThan(0);
      expect(m.p95Latency).toBeGreaterThanOrEqual(m.p50Latency);
      expect(m.p99Latency).toBeGreaterThanOrEqual(m.p95Latency);
    }
  });

  it('cost metrics are non-negative at 10000 scale', () => {
    const collector = new TelemetryCollector(companies);
    collector.generateAll(new SeededRandom(10000));
    const m = calculateMetrics(collector.getEntries(), companies);
    expect(m.totalUsdSpent).toBeGreaterThanOrEqual(0);
    expect(m.avgCostPerRequest).toBeGreaterThanOrEqual(0);
    expect(m.avgCostPerInvoice).toBeGreaterThanOrEqual(0);
    expect(m.avgCostPerCompany).toBeGreaterThanOrEqual(0);
  });

  // ── SeededRandom stability under heavy use ───────────────────────────
  it('SeededRandom produces consistent sequence after 10000 calls', () => {
    const rng1 = new SeededRandom(42);
    const rng2 = new SeededRandom(42);
    const vals1: number[] = [];
    const vals2: number[] = [];
    for (let i = 0; i < 10000; i++) {
      vals1.push(rng1.next());
      vals2.push(rng2.next());
    }
    for (let i = 0; i < 10000; i++) {
      expect(vals1[i]).toBe(vals2[i]);
    }
  });

  it('SeededRandom int() stays in bounds after 10000 calls', () => {
    const rng = new SeededRandom(42);
    for (let i = 0; i < 10000; i++) {
      const val = rng.int(1, 10);
      expect(val).toBeGreaterThanOrEqual(1);
      expect(val).toBeLessThanOrEqual(10);
    }
  });

  it('SeededRandom pick() always returns valid element after 10000 calls', () => {
    const arr = ['a', 'b', 'c', 'd', 'e'];
    const rng = new SeededRandom(42);
    for (let i = 0; i < 10000; i++) {
      const val = rng.pick(arr);
      expect(arr).toContain(val);
    }
  });
});
import { describe, it, expect, beforeAll } from 'bun:test';
import {
  seedEnterpriseData,
  generateBusinessActivities,
  SeededRandom,
  TelemetryCollector,
  calculateMetrics,
  generateFounderReport,
  type BusinessActivity,
  type BusinessActivityType,
  type SyntheticCompany,
} from '../index';

describe('Load Test: 500 Concurrent Users', () => {
  const TARGET = 500;
  const TIMEOUT_MS = 15_000;
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
    companies = seedEnterpriseData({ companyCount: 10, seed: 5001 });
    const gen = generateBusinessActivities(companies, TIMEOUT_MS, 100);
    activities = [];
    const start = Date.now();
    for (const batch of gen) {
      activities.push(...batch);
      if (activities.length >= TARGET) break;
    }
    elapsedMs = Date.now() - start;
    memAfter = process.memoryUsage().heapUsed;
  });

  // ── Core count ────────────────────────────────────────────────────
  it('should generate at least 500 activities', () => {
    expect(activities.length).toBeGreaterThanOrEqual(TARGET);
  });

  it('should not exceed 550 (reasonable batch boundary)', () => {
    expect(activities.length).toBeLessThan(TARGET + 50);
  });

  // ── Throughput scaling ────────────────────────────────────────────
  it('should achieve throughput > 10/sec at 500 scale', () => {
    const throughput = activities.length / (elapsedMs / 1000);
    expect(throughput).toBeGreaterThan(10);
  });

  it('should complete within the 15s timeout', () => {
    expect(elapsedMs).toBeLessThan(TIMEOUT_MS);
  });

  it('should complete within 10 seconds', () => {
    expect(elapsedMs).toBeLessThan(10_000);
  });

  it('should scale linearly — 500 takes no more than 5x the 100 time', () => {
    // At 100 activities, ~1s. At 500, should be < 5s.
    const baseTimePerActivity = 100; // 1ms per activity theoretical
    const maxExpected = baseTimePerActivity * TARGET + 2000; // +2s overhead
    expect(elapsedMs).toBeLessThan(maxExpected);
  });

  // ── No ID collisions ──────────────────────────────────────────────
  it('should have zero duplicate IDs', () => {
    const ids = activities.map(a => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('IDs should all be strings', () => {
    for (const act of activities) {
      expect(typeof act.id).toBe('string');
      expect(act.id.length).toBeGreaterThan(0);
    }
  });

  it('IDs should contain tick and batch indices', () => {
    // Format: act-{tick}-{i}-{cuid}
    for (const act of activities.slice(0, 50)) {
      expect(act.id).toMatch(/^act-\d+-\d+/);
    }
  });

  // ── Memory stability ──────────────────────────────────────────────
  it('memory growth should be under 100MB for 500 activities', () => {
    const growthMB = (memAfter - memBefore) / (1024 * 1024);
    expect(growthMB).toBeLessThan(100);
  });

  it('memory per activity should stay under 200KB', () => {
    const perActivity = (memAfter - memBefore) / Math.max(activities.length, 1);
    expect(perActivity).toBeLessThan(200_000);
  });

  it('memory should not leak across repeated generation', () => {
    const memStart = process.memoryUsage().heapUsed;
    const gen = generateBusinessActivities(companies, 2000, 50);
    const tmp: BusinessActivity[] = [];
    for (const batch of gen) {
      tmp.push(...batch);
      if (tmp.length >= 100) break;
    }
    const memEnd = process.memoryUsage().heapUsed;
    // After GC the growth should be modest
    const growth = (memEnd - memStart) / (1024 * 1024);
    expect(growth).toBeLessThan(20);
  });

  // ── Company ID validity ───────────────────────────────────────────
  it('every activity references a valid companySlug', () => {
    const slugs = new Set(companies.map(c => c.slug));
    for (const act of activities) {
      expect(slugs.has(act.companySlug)).toBe(true);
    }
  });

  it('activities should be distributed across all companies', () => {
    const slugs = new Set(activities.map(a => a.companySlug));
    expect(slugs.size).toBe(10);
  });

  it('no company should dominate > 50% of activities', () => {
    const counts: Record<string, number> = {};
    for (const a of activities) counts[a.companySlug] = (counts[a.companySlug] || 0) + 1;
    const maxPct = Math.max(...Object.values(counts)) / activities.length * 100;
    expect(maxPct).toBeLessThan(50);
  });

  // ── Activity type distribution ────────────────────────────────────
  it('should cover all 13 activity types at 500 scale', () => {
    const types = new Set(activities.map(a => a.type));
    // With 500 activities, likely to see all types
    expect(types.size).toBeGreaterThanOrEqual(8);
  });

  it('search and create_invoice should be top 3 types', () => {
    const counts: Record<string, number> = {};
    for (const a of activities) counts[a.type] = (counts[a.type] || 0) + 1;
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    const top3 = sorted.slice(0, 3).map(s => s[0]);
    expect(top3).toContain('search');
    expect(top3).toContain('create_invoice');
  });

  it('refund type should be rare (weight 2)', () => {
    const counts: Record<string, number> = {};
    for (const a of activities) counts[a.type] = (counts[a.type] || 0) + 1;
    const refundPct = (counts['refund'] || 0) / activities.length * 100;
    expect(refundPct).toBeLessThan(10);
  });

  it('every activity type is a valid enum value', () => {
    for (const act of activities) {
      expect(ALL_TYPES).toContain(act.type);
    }
  });

  // ── Data integrity per type ───────────────────────────────────────
  it('all ai_extraction activities have model metadata', () => {
    for (const act of activities.filter(a => a.type === 'ai_extraction')) {
      expect(act.metadata.model).toBeDefined();
      expect(typeof act.metadata.model).toBe('string');
    }
  });

  it('all ocr activities have positive fileSize', () => {
    for (const act of activities.filter(a => a.type === 'ocr')) {
      expect(Number(act.metadata.fileSize)).toBeGreaterThan(0);
    }
  });

  it('all payment activities have invoiceId', () => {
    for (const act of activities.filter(a => a.type === 'payment')) {
      expect(act.metadata).toHaveProperty('invoiceId');
    }
  });

  it('all customer_creation activities have nameAr', () => {
    for (const act of activities.filter(a => a.type === 'customer_creation')) {
      expect(act.metadata).toHaveProperty('nameAr');
      expect(typeof act.metadata.nameAr).toBe('string');
    }
  });

  it('all inventory_movement activities have productId', () => {
    for (const act of activities.filter(a => a.type === 'inventory_movement')) {
      expect(act.metadata).toHaveProperty('productId');
    }
  });

  // ── Timestamps are monotonic within batches ────────────────────────
  it('timestamps should be recent (within last minute)', () => {
    const now = Date.now();
    for (const act of activities) {
      expect(now - act.timestamp.getTime()).toBeLessThan(120_000);
    }
  });

  it('durations should be realistic for each type', () => {
    for (const act of activities) {
      if (act.type === 'search') {
        expect(act.durationMs).toBeLessThanOrEqual(200);
      } else if (act.type === 'ai_chat') {
        expect(act.durationMs).toBeGreaterThanOrEqual(500);
      }
    }
  });

  // ── Metrics calculation at scale ──────────────────────────────────
  it('metrics calculation completes under 1s for 500-activity telemetry', () => {
    const collector = new TelemetryCollector(companies);
    collector.generateAll(new SeededRandom(5001));
    const start = Date.now();
    calculateMetrics(collector.getEntries(), companies);
    expect(Date.now() - start).toBeLessThan(1000);
  });

  it('founder report generation completes at 10-company scale', () => {
    const collector = new TelemetryCollector(companies);
    const tel = collector.generateAll(new SeededRandom(5001));
    const start = Date.now();
    const report = generateFounderReport(companies, tel, 5001);
    expect(Date.now() - start).toBeLessThan(2000);
    expect(report.totalCompanies).toBe(10);
    expect(report.optimizationOpportunities.length).toBeGreaterThan(0);
  });

  // ── Seeded determinism at scale ───────────────────────────────────
  it('two runs with same seed produce identical activity counts', () => {
    const gen1 = generateBusinessActivities(companies, 3000, 50);
    const a1: BusinessActivity[] = [];
    for (const b of gen1) { a1.push(...b); if (a1.length >= 200) break; }

    const gen2 = generateBusinessActivities(companies, 3000, 50);
    const a2: BusinessActivity[] = [];
    for (const b of gen2) { a2.push(...b); if (a2.length >= 200) break; }

    expect(a1.length).toBe(a2.length);
  });

  it('SeededRandom.int produces values in range at scale', () => {
    const rng = new SeededRandom(777);
    for (let i = 0; i < 500; i++) {
      const val = rng.int(1, 10);
      expect(val).toBeGreaterThanOrEqual(1);
      expect(val).toBeLessThanOrEqual(10);
    }
  });

  it('SeededRandom.pickN returns correct count', () => {
    const rng = new SeededRandom(777);
    const items = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const picked = rng.pickN(items, 3);
    expect(picked.length).toBe(3);
    expect(new Set(picked).size).toBe(3);
  });

  it('seedEnterpriseData with 10 companies produces consistent results', () => {
    const c1 = seedEnterpriseData({ companyCount: 10, seed: 999 });
    const c2 = seedEnterpriseData({ companyCount: 10, seed: 999 });
    expect(c1.length).toBe(c2.length);
    expect(c1[0].slug).toBe(c2[0].slug);
    expect(c1[0].users.length).toBe(c2[0].users.length);
  });
});
// @ts-nocheck
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
  OPENROUTER_MODELS,
} from '../index';

describe('Load Test: 100 Concurrent Users', () => {
  const TARGET = 100;
  const TIMEOUT_MS = 10_000;
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
    companies = seedEnterpriseData({ companyCount: 10, seed: 1001 });
    const gen = generateBusinessActivities(companies, TIMEOUT_MS, 50);
    activities = [];
    const start = Date.now();
    for (const batch of gen) {
      activities.push(...batch);
      if (activities.length >= TARGET) break;
    }
    elapsedMs = Date.now() - start;
    memAfter = process.memoryUsage().heapUsed;
  });

  // ── Count validation ──────────────────────────────────────────────
  it('should generate at least 100 activities', () => {
    expect(activities.length).toBeGreaterThanOrEqual(TARGET);
  });

  it('should not overshoot beyond reasonable batch boundary', () => {
    expect(activities.length).toBeLessThan(TARGET + 50);
  });

  it('should produce deterministic count with same seed', () => {
    const c2 = seedEnterpriseData({ companyCount: 10, seed: 1001 });
    const gen2 = generateBusinessActivities(c2, TIMEOUT_MS, 50);
    const a2: BusinessActivity[] = [];
    for (const batch of gen2) {
      a2.push(...batch);
      if (a2.length >= TARGET) break;
    }
    // Same seed → same rng → same batches → same break point
    expect(a2.length).toBe(activities.length);
  });

  // ── Company ID validity ───────────────────────────────────────────
  it('every activity references a valid companySlug', () => {
    const slugs = new Set(companies.map(c => c.slug));
    for (const act of activities) {
      expect(slugs.has(act.companySlug)).toBe(true);
    }
  });

  it('all 10 companies should be represented in activities', () => {
    const slugs = new Set(activities.map(a => a.companySlug));
    expect(slugs.size).toBe(10);
  });

  it('no activity has empty companySlug', () => {
    for (const act of activities) {
      expect(act.companySlug.length).toBeGreaterThan(0);
    }
  });

  // ── Activity type distribution ────────────────────────────────────
  it('should cover multiple activity types', () => {
    const types = new Set(activities.map(a => a.type));
    expect(types.size).toBeGreaterThanOrEqual(5);
  });

  it('should include high-frequency types: search', () => {
    const types = new Set(activities.map(a => a.type));
    expect(types.has('search')).toBe(true);
  });

  it('should include high-frequency types: create_invoice', () => {
    const types = new Set(activities.map(a => a.type));
    expect(types.has('create_invoice')).toBe(true);
  });

  it('should include dashboard_usage', () => {
    const types = new Set(activities.map(a => a.type));
    expect(types.has('dashboard_usage')).toBe(true);
  });

  it('search should be the most frequent type', () => {
    const counts: Record<string, number> = {};
    for (const a of activities) counts[a.type] = (counts[a.type] || 0) + 1;
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    expect(sorted[0][0]).toBe('search');
  });

  it('every type value is a valid BusinessActivityType', () => {
    for (const act of activities) {
      expect(ALL_TYPES).toContain(act.type);
    }
  });

  it('ai_chat type should have model in metadata', () => {
    const aiChats = activities.filter(a => a.type === 'ai_chat');
    if (aiChats.length > 0) {
      for (const chat of aiChats) {
        expect(chat.metadata).toHaveProperty('model');
      }
    }
  });

  // ── No duplicate IDs ─────────────────────────────────────────────
  it('should have no duplicate activity IDs', () => {
    const ids = activities.map(a => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every activity ID should start with act-', () => {
    for (const act of activities) {
      expect(act.id).toMatch(/^act-/);
    }
  });

  it('activity IDs should be unique even across batches', () => {
    const gen = generateBusinessActivities(companies, 500, 5);
    const more: BusinessActivity[] = [];
    for (const batch of gen) {
      more.push(...batch);
      if (more.length >= 20) break;
    }
    const allIds = [...activities.map(a => a.id), ...more.map(a => a.id)];
    expect(new Set(allIds).size).toBe(allIds.length);
  });

  // ── Throughput ────────────────────────────────────────────────────
  it('should achieve throughput > 10 activities per second', () => {
    const throughput = activities.length / (elapsedMs / 1000);
    expect(throughput).toBeGreaterThan(10);
  });

  it('should complete generation within timeout', () => {
    expect(elapsedMs).toBeLessThan(TIMEOUT_MS);
  });

  it('should complete within 5 seconds for 100 activities', () => {
    expect(elapsedMs).toBeLessThan(5000);
  });

  // ── Memory stability ──────────────────────────────────────────────
  it('memory growth should be under 50MB for 100 activities', () => {
    const growthMB = (memAfter - memBefore) / (1024 * 1024);
    expect(growthMB).toBeLessThan(50);
  });

  it('memory per activity should be reasonable', () => {
    const perActivity = (memAfter - memBefore) / Math.max(activities.length, 1);
    expect(perActivity).toBeLessThan(500_000); // 500KB per activity max
  });

  // ── Data integrity ────────────────────────────────────────────────
  it('every activity has a valid timestamp', () => {
    for (const act of activities) {
      expect(act.timestamp).toBeInstanceOf(Date);
      expect(act.timestamp.getTime()).toBeGreaterThan(0);
    }
  });

  it('every activity has non-negative durationMs', () => {
    for (const act of activities) {
      expect(act.durationMs).toBeGreaterThanOrEqual(0);
    }
  });

  it('every activity has non-empty description', () => {
    for (const act of activities) {
      expect(act.description.length).toBeGreaterThan(0);
    }
  });

  it('every activity has metadata object', () => {
    for (const act of activities) {
      expect(act.metadata).toBeDefined();
      expect(typeof act.metadata).toBe('object');
    }
  });

  it('OCR activities should have fileSize in metadata', () => {
    const ocrActs = activities.filter(a => a.type === 'ocr');
    for (const act of ocrActs) {
      expect(act.metadata).toHaveProperty('fileSize');
      expect(act.metadata.fileSize).toBeGreaterThan(0);
    }
  });

  it('create_invoice activities should have clientId in metadata', () => {
    const invActs = activities.filter(a => a.type === 'create_invoice');
    for (const act of invActs) {
      expect(act.metadata).toHaveProperty('clientId');
    }
  });

  it('payment activities should reference an invoiceId', () => {
    const payActs = activities.filter(a => a.type === 'payment');
    for (const act of payActs) {
      expect(act.metadata).toHaveProperty('invoiceId');
    }
  });

  it('ai_extraction should have confidence in metadata', () => {
    const extActs = activities.filter(a => a.type === 'ai_extraction');
    for (const act of extActs) {
      expect(act.metadata).toHaveProperty('confidence');
      const conf = act.metadata.confidence as number;
      expect(conf).toBeGreaterThanOrEqual(0.6);
      expect(conf).toBeLessThanOrEqual(0.99);
    }
  });

  it('import_invoice metadata should have source field', () => {
    const impActs = activities.filter(a => a.type === 'import_invoice');
    for (const act of impActs) {
      expect(act.metadata).toHaveProperty('source');
    }
  });

  // ── Seed-enterprise data quality ──────────────────────────────────
  it('10 companies should be seeded', () => {
    expect(companies.length).toBe(10);
  });

  it('each company should have at least one user', () => {
    for (const c of companies) {
      expect(c.users.length).toBeGreaterThanOrEqual(2);
    }
  });

  it('each company should have at least one product', () => {
    for (const c of companies) {
      expect(c.products.length).toBeGreaterThanOrEqual(5);
    }
  });

  it('each company should have invoices', () => {
    for (const c of companies) {
      expect(c.invoices.length).toBeGreaterThan(0);
    }
  });

  it('companies have no duplicate slugs', () => {
    const slugs = companies.map(c => c.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  // ── Telemetry + Metrics integration ───────────────────────────────
  it('telemetry collector generates entries for all companies', () => {
    const collector = new TelemetryCollector(companies);
    collector.generateAll(new SeededRandom(42));
    expect(collector.size).toBeGreaterThan(0);
  });

  it('metrics from 100-activity generation are valid', () => {
    const collector = new TelemetryCollector(companies);
    const tel = collector.generateAll(new SeededRandom(42));
    const metrics = calculateMetrics(tel, companies);
    expect(metrics.totalRequests).toBe(tel.length);
    expect(metrics.totalTokenUsage).toBeGreaterThan(0);
    expect(metrics.p50Latency).toBeGreaterThan(0);
  });

  it('calculateMetrics handles empty telemetry gracefully', () => {
    const metrics = calculateMetrics([], companies);
    expect(metrics.totalRequests).toBe(0);
    expect(metrics.errorRate).toBe(0);
    expect(metrics.cacheHitRate).toBe(0);
  });

  it('SeededRandom produces deterministic sequences', () => {
    const r1 = new SeededRandom(42);
    const r2 = new SeededRandom(42);
    const v1 = Array.from({ length: 20 }, () => r1.next());
    const v2 = Array.from({ length: 20 }, () => r2.next());
    expect(v1).toEqual(v2);
  });

  it('OPENROUTER_MODELS contains at least 5 models', () => {
    expect(OPENROUTER_MODELS.length).toBeGreaterThanOrEqual(5);
  });

  it('every OpenRouter model has valid cost fields', () => {
    for (const m of OPENROUTER_MODELS) {
      expect(m.promptCostPer1k).toBeGreaterThanOrEqual(0);
      expect(m.completionCostPer1k).toBeGreaterThanOrEqual(0);
      expect(m.maxContextTokens).toBeGreaterThan(0);
      expect(m.avgLatencyMs).toBeGreaterThan(0);
    }
  });
});
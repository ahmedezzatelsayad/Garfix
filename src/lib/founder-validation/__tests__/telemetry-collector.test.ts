import { describe, it, expect } from 'bun:test';
import {
  TelemetryCollector,
  seedEnterpriseData,
  SeededRandom,
  type TelemetryEntry,
  type SyntheticCompany,
} from '../index';

/** Create a minimal valid company for TelemetryCollector construction */
function makeMinimalCompany(slug: string = 'test-co'): SyntheticCompany {
  return {
    id: 1, name: 'Test Co', nameAr: 'شركة اختبار', slug,
    email: `info@${slug}.com`, phone: '+966500000000', address: 'Riyadh',
    vatNumber: 'SA1234567890', commercialRegistration: 'CR-100',
    currency: 'SAR', country: 'SA', plan: 'business',
    openrouterApiKey: null, openrouterModel: 'deepseek/deepseek-chat',
    createdAt: new Date('2024-01-01'),
    users: [{ id: 'u1', uid: 'uid-1', email: `admin@${slug}.com`, passwordHash: 'hash',
      displayName: 'Admin', displayNameAr: 'مدير', role: 'admin', companies: [slug],
      emailVerified: true, createdAt: new Date('2024-01-01') }],
    employees: [], clients: [], suppliers: [], warehouses: [],
    categories: [], products: [], inventory: [], invoices: [],
    purchases: [], aiMemories: [], aiRules: [], cacheEntries: [],
    providerHistory: [], workerHistory: [],
  };
}

/** Helper: build a raw telemetry entry (minus id & timestamp) */
function makeRawEntry(overrides: Partial<Omit<TelemetryEntry, 'id' | 'timestamp'>> = {}): Omit<TelemetryEntry, 'id' | 'timestamp'> {
  return {
    tenant: 'test-co',
    worker: 'ai_matcher',
    queue: 'ai_default',
    provider: 'deepseek',
    model: 'deepseek/deepseek-chat',
    latencyMs: 500,
    promptTokens: 100,
    completionTokens: 50,
    totalTokens: 150,
    costUsd: 0.003,
    retries: 0,
    queueWaitMs: 50,
    executionTimeMs: 450,
    cacheHit: false,
    memoryHit: false,
    ruleHit: false,
    patternHit: false,
    resolvedBy: 'ai',
    confidence: 0.9,
    outputQualityScore: 0.88,
    errors: [],
    recoveryPath: null,
    ...overrides,
  };
}

describe('TelemetryCollector', () => {
  // ── Creation ──────────────────────────────────────────────────────────
  describe('instance creation', () => {
    it('should create an instance with empty entries', () => {
      const tc = new TelemetryCollector([]);
      expect(tc.size).toBe(0);
      expect(tc.getEntries()).toEqual([]);
    });

    it('should create an instance with companies', () => {
      const companies = [makeMinimalCompany('a'), makeMinimalCompany('b')];
      const tc = new TelemetryCollector(companies);
      expect(tc.size).toBe(0);
      expect(tc.getEntries()).toEqual([]);
    });

    it('should handle single company', () => {
      const tc = new TelemetryCollector([makeMinimalCompany('solo')]);
      expect(tc.size).toBe(0);
    });
  });

  // ── Basic record ──────────────────────────────────────────────────────
  describe('record', () => {
    it('should record a basic telemetry entry', () => {
      const tc = new TelemetryCollector([makeMinimalCompany()]);
      const entry = tc.record(makeRawEntry());
      expect(entry).toBeDefined();
      expect(entry.id).toMatch(/^tel-/);
      expect(entry.tenant).toBe('test-co');
      expect(entry.latencyMs).toBe(500);
      expect(entry.totalTokens).toBe(150);
      expect(tc.size).toBe(1);
    });

    it('should auto-generate a timestamp', () => {
      const tc = new TelemetryCollector([makeMinimalCompany()]);
      const before = new Date();
      const entry = tc.record(makeRawEntry());
      const after = new Date();
      expect(entry.timestamp.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(entry.timestamp.getTime()).toBeLessThanOrEqual(after.getTime());
    });

    it('should record entries with cache hit', () => {
      const tc = new TelemetryCollector([makeMinimalCompany()]);
      const entry = tc.record(makeRawEntry({ cacheHit: true, resolvedBy: 'cache', confidence: 0.99 }));
      expect(entry.cacheHit).toBe(true);
      expect(entry.resolvedBy).toBe('cache');
      expect(entry.confidence).toBe(0.99);
    });

    it('should record entries with memory hit', () => {
      const tc = new TelemetryCollector([makeMinimalCompany()]);
      const entry = tc.record(makeRawEntry({ memoryHit: true, resolvedBy: 'memory', confidence: 0.88 }));
      expect(entry.memoryHit).toBe(true);
      expect(entry.resolvedBy).toBe('memory');
    });

    it('should record entries with rule hit', () => {
      const tc = new TelemetryCollector([makeMinimalCompany()]);
      const entry = tc.record(makeRawEntry({ ruleHit: true, resolvedBy: 'rule', confidence: 0.92 }));
      expect(entry.ruleHit).toBe(true);
      expect(entry.resolvedBy).toBe('rule');
    });

    it('should record entries with pattern hit', () => {
      const tc = new TelemetryCollector([makeMinimalCompany()]);
      const entry = tc.record(makeRawEntry({ patternHit: true, resolvedBy: 'pattern', confidence: 0.94 }));
      expect(entry.patternHit).toBe(true);
      expect(entry.resolvedBy).toBe('pattern');
    });

    it('should record entry with errors array', () => {
      const tc = new TelemetryCollector([makeMinimalCompany()]);
      const entry = tc.record(makeRawEntry({ errors: ['timeout', 'rate_limit'] }));
      expect(entry.errors).toEqual(['timeout', 'rate_limit']);
    });

    it('should record entry with recovery path', () => {
      const tc = new TelemetryCollector([makeMinimalCompany()]);
      const entry = tc.record(makeRawEntry({ recoveryPath: 'retry_succeeded' }));
      expect(entry.recoveryPath).toBe('retry_succeeded');
    });

    it('should record entry with retries', () => {
      const tc = new TelemetryCollector([makeMinimalCompany()]);
      const entry = tc.record(makeRawEntry({ retries: 3 }));
      expect(entry.retries).toBe(3);
    });
  });

  // ── Computed metrics from entries ─────────────────────────────────────
  describe('computed metrics from entries', () => {
    it('should calculate total tokens across all entries', () => {
      const tc = new TelemetryCollector([makeMinimalCompany()]);
      tc.record(makeRawEntry({ totalTokens: 100 }));
      tc.record(makeRawEntry({ totalTokens: 200 }));
      tc.record(makeRawEntry({ totalTokens: 300 }));
      const total = tc.getEntries().reduce((s, e) => s + e.totalTokens, 0);
      expect(total).toBe(600);
    });

    it('should calculate total cost across all entries', () => {
      const tc = new TelemetryCollector([makeMinimalCompany()]);
      tc.record(makeRawEntry({ costUsd: 0.01 }));
      tc.record(makeRawEntry({ costUsd: 0.02 }));
      tc.record(makeRawEntry({ costUsd: 0.03 }));
      const total = tc.getEntries().reduce((s, e) => s + e.costUsd, 0);
      expect(total).toBeCloseTo(0.06, 6);
    });

    it('should calculate average latency', () => {
      const tc = new TelemetryCollector([makeMinimalCompany()]);
      tc.record(makeRawEntry({ latencyMs: 200 }));
      tc.record(makeRawEntry({ latencyMs: 400 }));
      tc.record(makeRawEntry({ latencyMs: 600 }));
      const entries = tc.getEntries();
      const avg = entries.reduce((s, e) => s + e.latencyMs, 0) / entries.length;
      expect(avg).toBeCloseTo(400, 0);
    });

    it('should calculate P50 latency', () => {
      const tc = new TelemetryCollector([makeMinimalCompany()]);
      const latencies = [100, 200, 300, 400, 500];
      for (const l of latencies) tc.record(makeRawEntry({ latencyMs: l }));
      const sorted = tc.getEntries().map(e => e.latencyMs).sort((a, b) => a - b);
      const p50 = sorted[Math.floor(sorted.length * 0.5)];
      expect(p50).toBe(300);
    });

    it('should calculate P95 latency', () => {
      const tc = new TelemetryCollector([makeMinimalCompany()]);
      for (let i = 1; i <= 100; i++) tc.record(makeRawEntry({ latencyMs: i * 10 }));
      const sorted = tc.getEntries().map(e => e.latencyMs).sort((a, b) => a - b);
      const p95 = sorted[Math.floor(sorted.length * 0.95)];
      expect(p95).toBe(960);
    });

    it('should calculate cache hit rate', () => {
      const tc = new TelemetryCollector([makeMinimalCompany()]);
      for (let i = 0; i < 7; i++) tc.record(makeRawEntry({ cacheHit: true }));
      for (let i = 0; i < 3; i++) tc.record(makeRawEntry({ cacheHit: false }));
      const entries = tc.getEntries();
      const rate = entries.filter(e => e.cacheHit).length / entries.length;
      expect(rate).toBeCloseTo(0.7, 5);
    });

    it('should calculate memory hit rate', () => {
      const tc = new TelemetryCollector([makeMinimalCompany()]);
      for (let i = 0; i < 2; i++) tc.record(makeRawEntry({ memoryHit: true }));
      for (let i = 0; i < 8; i++) tc.record(makeRawEntry({ memoryHit: false }));
      const entries = tc.getEntries();
      const rate = entries.filter(e => e.memoryHit).length / entries.length;
      expect(rate).toBeCloseTo(0.2, 5);
    });

    it('should calculate rule hit rate', () => {
      const tc = new TelemetryCollector([makeMinimalCompany()]);
      for (let i = 0; i < 5; i++) tc.record(makeRawEntry({ ruleHit: true }));
      for (let i = 0; i < 5; i++) tc.record(makeRawEntry({ ruleHit: false }));
      const entries = tc.getEntries();
      const rate = entries.filter(e => e.ruleHit).length / entries.length;
      expect(rate).toBeCloseTo(0.5, 5);
    });

    it('should calculate pattern hit rate', () => {
      const tc = new TelemetryCollector([makeMinimalCompany()]);
      for (let i = 0; i < 3; i++) tc.record(makeRawEntry({ patternHit: true }));
      for (let i = 0; i < 7; i++) tc.record(makeRawEntry({ patternHit: false }));
      const entries = tc.getEntries();
      const rate = entries.filter(e => e.patternHit).length / entries.length;
      expect(rate).toBeCloseTo(0.3, 5);
    });
  });

  // ── Filtering ─────────────────────────────────────────────────────────
  describe('filtering', () => {
    it('should get entries by tenant', () => {
      const tc = new TelemetryCollector([makeMinimalCompany('a'), makeMinimalCompany('b')]);
      tc.record(makeRawEntry({ tenant: 'a' }));
      tc.record(makeRawEntry({ tenant: 'a' }));
      tc.record(makeRawEntry({ tenant: 'b' }));
      expect(tc.getEntriesForTenant('a').length).toBe(2);
      expect(tc.getEntriesForTenant('b').length).toBe(1);
      expect(tc.getEntriesForTenant('nonexistent').length).toBe(0);
    });

    it('should filter entries by provider', () => {
      const tc = new TelemetryCollector([makeMinimalCompany()]);
      tc.record(makeRawEntry({ provider: 'deepseek' }));
      tc.record(makeRawEntry({ provider: 'google' }));
      tc.record(makeRawEntry({ provider: 'deepseek' }));
      const deepseek = tc.getEntries().filter(e => e.provider === 'deepseek');
      expect(deepseek.length).toBe(2);
      const google = tc.getEntries().filter(e => e.provider === 'google');
      expect(google.length).toBe(1);
    });

    it('should filter entries by model', () => {
      const tc = new TelemetryCollector([makeMinimalCompany()]);
      tc.record(makeRawEntry({ model: 'deepseek/deepseek-chat' }));
      tc.record(makeRawEntry({ model: 'google/gemini-2.0-flash-001' }));
      const filtered = tc.getEntries().filter(e => e.model === 'deepseek/deepseek-chat');
      expect(filtered.length).toBe(1);
    });

    it('should get entries with errors', () => {
      const tc = new TelemetryCollector([makeMinimalCompany()]);
      tc.record(makeRawEntry({ errors: [] }));
      tc.record(makeRawEntry({ errors: ['timeout'] }));
      tc.record(makeRawEntry({ errors: ['rate_limit', 'model_unavailable'] }));
      tc.record(makeRawEntry({ errors: [] }));
      const withErrors = tc.getEntries().filter(e => e.errors.length > 0);
      expect(withErrors.length).toBe(2);
    });

    it('should get entries sorted by cost descending', () => {
      const tc = new TelemetryCollector([makeMinimalCompany()]);
      tc.record(makeRawEntry({ costUsd: 0.01 }));
      tc.record(makeRawEntry({ costUsd: 0.05 }));
      tc.record(makeRawEntry({ costUsd: 0.03 }));
      const sorted = [...tc.getEntries()].sort((a, b) => b.costUsd - a.costUsd);
      expect(sorted[0].costUsd).toBeCloseTo(0.05, 6);
      expect(sorted[1].costUsd).toBeCloseTo(0.03, 6);
      expect(sorted[2].costUsd).toBeCloseTo(0.01, 6);
    });

    it('should get entries sorted by latency descending', () => {
      const tc = new TelemetryCollector([makeMinimalCompany()]);
      tc.record(makeRawEntry({ latencyMs: 1200 }));
      tc.record(makeRawEntry({ latencyMs: 300 }));
      tc.record(makeRawEntry({ latencyMs: 800 }));
      const sorted = [...tc.getEntries()].sort((a, b) => b.latencyMs - a.latencyMs);
      expect(sorted[0].latencyMs).toBe(1200);
      expect(sorted[1].latencyMs).toBe(800);
      expect(sorted[2].latencyMs).toBe(300);
    });
  });

  // ── Edge cases ────────────────────────────────────────────────────────
  describe('edge cases', () => {
    it('should handle empty collector - all computations return zero', () => {
      const tc = new TelemetryCollector([makeMinimalCompany()]);
      const entries = tc.getEntries();
      expect(entries.length).toBe(0);
      expect(tc.size).toBe(0);
      expect(entries.reduce((s, e) => s + e.totalTokens, 0)).toBe(0);
      expect(entries.reduce((s, e) => s + e.costUsd, 0)).toBe(0);
    });

    it('should handle single entry', () => {
      const tc = new TelemetryCollector([makeMinimalCompany()]);
      tc.record(makeRawEntry({ latencyMs: 750, totalTokens: 500, costUsd: 0.025 }));
      expect(tc.size).toBe(1);
      const e = tc.getEntries()[0];
      expect(e.latencyMs).toBe(750);
      expect(e.totalTokens).toBe(500);
      expect(e.costUsd).toBeCloseTo(0.025, 6);
    });

    it('should handle 10000 entries without memory issues', () => {
      const tc = new TelemetryCollector([makeMinimalCompany()]);
      const rng = new SeededRandom(42);
      for (let i = 0; i < 10000; i++) {
        tc.record(makeRawEntry({
          latencyMs: rng.int(50, 5000),
          totalTokens: rng.int(100, 5000),
          costUsd: rng.float(0.001, 0.05),
          cacheHit: rng.bool(0.35),
        }));
      }
      expect(tc.size).toBe(10000);
      expect(tc.getEntries().length).toBe(10000);
    });

    it('should isolate entries by tenant', () => {
      const tc = new TelemetryCollector([
        makeMinimalCompany('tenant-a'),
        makeMinimalCompany('tenant-b'),
        makeMinimalCompany('tenant-c'),
      ]);
      for (let i = 0; i < 5; i++) {
        tc.record(makeRawEntry({ tenant: 'tenant-a', costUsd: 0.01 * (i + 1) }));
        tc.record(makeRawEntry({ tenant: 'tenant-b', costUsd: 0.02 * (i + 1) }));
        tc.record(makeRawEntry({ tenant: 'tenant-c', costUsd: 0.03 * (i + 1) }));
      }
      const a = tc.getEntriesForTenant('tenant-a');
      const b = tc.getEntriesForTenant('tenant-b');
      const c = tc.getEntriesForTenant('tenant-c');
      expect(a.length).toBe(5);
      expect(b.length).toBe(5);
      expect(c.length).toBe(5);
      expect(a.every(e => e.tenant === 'tenant-a')).toBe(true);
      expect(b.every(e => e.tenant === 'tenant-b')).toBe(true);
      expect(c.every(e => e.tenant === 'tenant-c')).toBe(true);
      const aTotal = a.reduce((s, e) => s + e.costUsd, 0);
      const bTotal = b.reduce((s, e) => s + e.costUsd, 0);
      const cTotal = c.reduce((s, e) => s + e.costUsd, 0);
      expect(aTotal).toBeCloseTo(0.15, 6);
      expect(bTotal).toBeCloseTo(0.30, 6);
      expect(cTotal).toBeCloseTo(0.45, 6);
    });
  });

  // ── JSON serialization / deserialization ──────────────────────────────
  describe('JSON round-trip', () => {
    it('should export entries to JSON', () => {
      const tc = new TelemetryCollector([makeMinimalCompany()]);
      tc.record(makeRawEntry({ latencyMs: 123, costUsd: 0.015 }));
      tc.record(makeRawEntry({ latencyMs: 456, costUsd: 0.030 }));
      const json = JSON.stringify(tc.getEntries());
      const parsed = JSON.parse(json);
      expect(parsed).toHaveLength(2);
      expect(parsed[0].latencyMs).toBe(123);
      expect(parsed[1].latencyMs).toBe(456);
    });

    it('should import entries from JSON into a new collector', () => {
      const tc1 = new TelemetryCollector([makeMinimalCompany()]);
      tc1.record(makeRawEntry({ latencyMs: 999, costUsd: 0.05, provider: 'meta' }));
      const json = JSON.stringify(tc1.getEntries());
      const restored = JSON.parse(json) as TelemetryEntry[];
      const tc2 = new TelemetryCollector([makeMinimalCompany()]);
      for (const entry of restored) {
        const { id: _id, timestamp: _ts, ...raw } = entry;
        tc2.record(raw);
      }
      expect(tc2.size).toBe(1);
      expect(tc2.getEntries()[0].latencyMs).toBe(999);
      expect(tc2.getEntries()[0].provider).toBe('meta');
    });
  });

  // ── Reset / clear ─────────────────────────────────────────────────────
  describe('clear / reset', () => {
    it('should reset collector to empty via clear()', () => {
      const tc = new TelemetryCollector([makeMinimalCompany()]);
      tc.record(makeRawEntry());
      tc.record(makeRawEntry());
      tc.record(makeRawEntry());
      expect(tc.size).toBe(3);
      tc.clear();
      expect(tc.size).toBe(0);
      expect(tc.getEntries()).toEqual([]);
    });

    it('should allow recording after clear', () => {
      const tc = new TelemetryCollector([makeMinimalCompany()]);
      tc.record(makeRawEntry());
      tc.clear();
      tc.record(makeRawEntry({ latencyMs: 777 }));
      expect(tc.size).toBe(1);
      expect(tc.getEntries()[0].latencyMs).toBe(777);
    });
  });

  // ── generateFromCompany ───────────────────────────────────────────────
  describe('generateFromCompany', () => {
    it('should generate entries from a company provider history', () => {
      const companies = seedEnterpriseData({ companyCount: 10 });
      const tc = new TelemetryCollector(companies);
      const entries = tc.generateFromCompany(companies[0]);
      expect(entries.length).toBeGreaterThan(0);
      expect(entries.every(e => e.tenant === companies[0].slug)).toBe(true);
    });

    it('should produce entries with correct structure', () => {
      const companies = seedEnterpriseData({ companyCount: 10 });
      const tc = new TelemetryCollector(companies);
      const entries = tc.generateFromCompany(companies[0]);
      const entry = entries[0];
      expect(entry.id).toMatch(/^tel-/);
      expect(entry.timestamp).toBeInstanceOf(Date);
      expect(typeof entry.tenant).toBe('string');
      expect(typeof entry.worker).toBe('string');
      expect(typeof entry.queue).toBe('string');
      expect(typeof entry.latencyMs).toBe('number');
      expect(typeof entry.totalTokens).toBe('number');
      expect(typeof entry.costUsd).toBe('number');
      expect(typeof entry.confidence).toBe('number');
      expect(Array.isArray(entry.errors)).toBe(true);
    });

    it('should respect custom RNG for deterministic output', () => {
      const companies = seedEnterpriseData({ companyCount: 10 });
      const rng1 = new SeededRandom(123);
      const rng2 = new SeededRandom(123);
      const tc1 = new TelemetryCollector(companies);
      const tc2 = new TelemetryCollector(companies);
      const entries1 = tc1.generateFromCompany(companies[0], rng1);
      const entries2 = tc2.generateFromCompany(companies[0], rng2);
      expect(entries1.length).toBe(entries2.length);
      for (let i = 0; i < entries1.length; i++) {
        expect(entries1[i].cacheHit).toBe(entries2[i].cacheHit);
        expect(entries1[i].memoryHit).toBe(entries2[i].memoryHit);
        expect(entries1[i].ruleHit).toBe(entries2[i].ruleHit);
        expect(entries1[i].patternHit).toBe(entries2[i].patternHit);
      }
    });

    it('should add generated entries to the collector', () => {
      const companies = seedEnterpriseData({ companyCount: 10 });
      const tc = new TelemetryCollector(companies);
      const before = tc.size;
      tc.generateFromCompany(companies[0]);
      expect(tc.size).toBeGreaterThan(before);
    });
  });

  // ── generateAll ────────────────────────────────────────────────────────
  describe('generateAll', () => {
    it('should generate telemetry for all companies', () => {
      const companies = seedEnterpriseData({ companyCount: 10 });
      const tc = new TelemetryCollector(companies);
      const all = tc.generateAll();
      expect(all.length).toBeGreaterThan(0);
      expect(tc.size).toBe(all.length);
    });

    it('should produce entries spanning all tenants', () => {
      const companies = seedEnterpriseData({ companyCount: 10 });
      const tc = new TelemetryCollector(companies);
      tc.generateAll();
      const slugs = new Set(tc.getEntries().map(e => e.tenant));
      for (const c of companies) {
        expect(slugs.has(c.slug)).toBe(true);
      }
    });
  });

  // ── size property ─────────────────────────────────────────────────────
  describe('size property', () => {
    it('should reflect the number of entries', () => {
      const tc = new TelemetryCollector([makeMinimalCompany()]);
      expect(tc.size).toBe(0);
      tc.record(makeRawEntry());
      expect(tc.size).toBe(1);
      tc.record(makeRawEntry());
      expect(tc.size).toBe(2);
      tc.clear();
      expect(tc.size).toBe(0);
    });
  });
});

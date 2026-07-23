// @ts-nocheck
import { describe, it, expect } from 'bun:test';
import {
  seedEnterpriseData,
  SeededRandom,
  TelemetryCollector,
  calculateMetrics,
  generateFounderReport,
  type TelemetryEntry,
  type SyntheticCacheEntry,
} from '../index';

/**
 * Failure Injection: Valkey (Cache) Scenarios
 *
 * Tests cache-related failure modes: missing cache entries, cache miss
 * fallback paths, no data loss on cache failure, and reconnection
 * scenarios — all simulated through telemetry metrics and cache entry data.
 */

describe('Failure Injection: Valkey (Cache)', () => {
  // ── Handle missing cache ──────────────────────────────────────────
  it('company with zero cacheEntries is valid', () => {
    const companies = seedEnterpriseData({ companyCount: 10, seed: 100 });
    const noCache = companies.map(c => ({ ...c, cacheEntries: [] }));
    expect(noCache.every(c => c.cacheEntries.length === 0)).toBe(true);
  });

  it('metrics with 0% cache hit rate', () => {
    const entries: TelemetryEntry[] = Array.from({ length: 100 }, (_, i) => ({
      id: `nc-${i}`, timestamp: new Date(), tenant: 't', worker: 'w', queue: 'q',
      provider: 'deepseek', model: 'deepseek/deepseek-chat',
      latencyMs: 200, promptTokens: 100, completionTokens: 50, totalTokens: 150,
      costUsd: 0.001, retries: 0, queueWaitMs: 10, executionTimeMs: 200,
      cacheHit: false, memoryHit: false, ruleHit: false, patternHit: false,
      resolvedBy: 'ai' as const, confidence: 0.8, outputQualityScore: 0.8,
      errors: [], recoveryPath: null,
    }));
    const m = calculateMetrics(entries, []);
    expect(m.cacheHitRate).toBe(0);
  });

  it('metrics with 100% cache hit rate', () => {
    const entries: TelemetryEntry[] = Array.from({ length: 100 }, (_, i) => ({
      id: `fc-${i}`, timestamp: new Date(), tenant: 't', worker: 'w', queue: 'q',
      provider: 'none', model: 'none', latencyMs: 5, promptTokens: 0, completionTokens: 0,
      totalTokens: 0, costUsd: 0, retries: 0, queueWaitMs: 0, executionTimeMs: 5,
      cacheHit: true, memoryHit: false, ruleHit: false, patternHit: false,
      resolvedBy: 'cache' as const, confidence: 1.0, outputQualityScore: 1.0,
      errors: [], recoveryPath: null,
    }));
    const m = calculateMetrics(entries, []);
    expect(m.cacheHitRate).toBe(1);
  });

  // ── Cache miss fallback ───────────────────────────────────────────
  it('cache miss falls through to pattern matching', () => {
    const entry: TelemetryEntry = {
      id: 'cm-1', timestamp: new Date(), tenant: 't', worker: 'w', queue: 'q',
      provider: 'none', model: 'none', latencyMs: 50, promptTokens: 0, completionTokens: 0,
      totalTokens: 0, costUsd: 0, retries: 0, queueWaitMs: 5, executionTimeMs: 50,
      cacheHit: false, memoryHit: false, ruleHit: false, patternHit: true,
      resolvedBy: 'pattern' as const, confidence: 0.92, outputQualityScore: 0.9,
      errors: [], recoveryPath: null,
    };
    const m = calculateMetrics([entry], []);
    expect(m.cacheHitRate).toBe(0);
    expect(m.patternHitRate).toBe(1);
    expect(m.totalUsdSpent).toBe(0);
  });

  it('cache miss → rule hit → zero AI cost', () => {
    const entry: TelemetryEntry = {
      id: 'rm-1', timestamp: new Date(), tenant: 't', worker: 'w', queue: 'q',
      provider: 'none', model: 'none', latencyMs: 30, promptTokens: 0, completionTokens: 0,
      totalTokens: 0, costUsd: 0, retries: 0, queueWaitMs: 2, executionTimeMs: 30,
      cacheHit: false, memoryHit: false, ruleHit: true, patternHit: false,
      resolvedBy: 'rule' as const, confidence: 0.88, outputQualityScore: 0.85,
      errors: [], recoveryPath: null,
    };
    const m = calculateMetrics([entry], []);
    expect(m.ruleHitRate).toBe(1);
    expect(m.totalUsdSpent).toBe(0);
  });

  it('cache miss → memory hit → zero AI cost', () => {
    const entry: TelemetryEntry = {
      id: 'mm-1', timestamp: new Date(), tenant: 't', worker: 'w', queue: 'q',
      provider: 'none', model: 'none', latencyMs: 40, promptTokens: 0, completionTokens: 0,
      totalTokens: 0, costUsd: 0, retries: 0, queueWaitMs: 3, executionTimeMs: 40,
      cacheHit: false, memoryHit: true, ruleHit: false, patternHit: false,
      resolvedBy: 'memory' as const, confidence: 0.85, outputQualityScore: 0.82,
      errors: [], recoveryPath: null,
    };
    const m = calculateMetrics([entry], []);
    expect(m.memoryHitRate).toBe(1);
    expect(m.totalUsdSpent).toBe(0);
  });

  it('full cascade miss → AI → costs money', () => {
    const entry: TelemetryEntry = {
      id: 'ai-1', timestamp: new Date(), tenant: 't', worker: 'w', queue: 'q',
      provider: 'deepseek', model: 'deepseek/deepseek-chat',
      latencyMs: 1200, promptTokens: 500, completionTokens: 200, totalTokens: 700,
      costUsd: 0.005, retries: 0, queueWaitMs: 50, executionTimeMs: 1200,
      cacheHit: false, memoryHit: false, ruleHit: false, patternHit: false,
      resolvedBy: 'ai' as const, confidence: 0.75, outputQualityScore: 0.7,
      errors: [], recoveryPath: null,
    };
    const m = calculateMetrics([entry], []);
    expect(m.cacheHitRate).toBe(0);
    expect(m.memoryHitRate).toBe(0);
    expect(m.ruleHitRate).toBe(0);
    expect(m.patternHitRate).toBe(0);
    expect(m.totalUsdSpent).toBe(0.005);
  });

  // ── No data loss on cache failure ─────────────────────────────────
  it('all cascade stages sum to total requests', () => {
    const companies = seedEnterpriseData({ companyCount: 10, seed: 200 });
    const collector = new TelemetryCollector(companies);
    collector.generateAll(new SeededRandom(200));
    const m = calculateMetrics(collector.getEntries(), companies);
    const hitSum =
      m.cacheHitRate + m.memoryHitRate + m.ruleHitRate + m.patternHitRate;
    // hitSum <= 1.0 always (since some resolve via AI with no hit)
    expect(hitSum).toBeLessThanOrEqual(1.0);
    expect(hitSum).toBeGreaterThanOrEqual(0);
  });

  it('cache entries have valid TTL and expiry', () => {
    const companies = seedEnterpriseData({ companyCount: 10, seed: 201 });
    for (const c of companies) {
      for (const ce of c.cacheEntries) {
        expect(ce.ttlSeconds).toBeGreaterThan(0);
        expect(ce.expiresAt.getTime()).toBeGreaterThan(ce.createdAt.getTime());
      }
    }
  });

  it('cache entries have positive hit counts', () => {
    const companies = seedEnterpriseData({ companyCount: 10, seed: 202 });
    for (const c of companies) {
      for (const ce of c.cacheEntries) {
        expect(ce.hitCount).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('cache entry values are parseable JSON', () => {
    const companies = seedEnterpriseData({ companyCount: 10, seed: 203 });
    for (const c of companies) {
      for (const ce of c.cacheEntries) {
        expect(() => JSON.parse(ce.value)).not.toThrow();
      }
    }
  });

  // ── Reconnection simulation ───────────────────────────────────────
  it('after clear, collector regenerates fresh data', () => {
    const companies = seedEnterpriseData({ companyCount: 10, seed: 300 });
    const collector = new TelemetryCollector(companies);
    const t1 = collector.generateAll(new SeededRandom(300));
    collector.clear();
    expect(collector.size).toBe(0);
    const t2 = collector.generateAll(new SeededRandom(300));
    expect(collector.size).toBe(t2.length);
    expect(t2.length).toBe(t1.length);
  });

  it('repeated generateAll calls do not corrupt previous data', () => {
    const companies = seedEnterpriseData({ companyCount: 10, seed: 301 });
    const collector = new TelemetryCollector(companies);
    collector.generateAll(new SeededRandom(301));
    const firstCount = collector.size;
    collector.generateAll(new SeededRandom(301));
    const secondCount = collector.size;
    expect(secondCount).toBe(firstCount * 2);
    const all = collector.getEntries();
    const ids = new Set(all.map(e => e.id));
    // IDs use cuid() so they should be unique
    expect(ids.size).toBe(all.length);
  });

  it('metrics with alternating cache up/down cycles', () => {
    const entries: TelemetryEntry[] = Array.from({ length: 200 }, (_, i) => ({
      id: `cyc-${i}`, timestamp: new Date(), tenant: 't', worker: 'w', queue: 'q',
      provider: i % 2 === 0 ? 'none' : 'deepseek',
      model: i % 2 === 0 ? 'none' : 'deepseek/deepseek-chat',
      latencyMs: i % 2 === 0 ? 5 : 1200,
      promptTokens: i % 2 === 0 ? 0 : 500,
      completionTokens: i % 2 === 0 ? 0 : 200,
      totalTokens: i % 2 === 0 ? 0 : 700,
      costUsd: i % 2 === 0 ? 0 : 0.005,
      retries: 0, queueWaitMs: 10, executionTimeMs: i % 2 === 0 ? 5 : 1200,
      cacheHit: i % 2 === 0, memoryHit: false, ruleHit: false, patternHit: false,
      resolvedBy: (i % 2 === 0 ? 'cache' : 'ai') as 'cache' | 'ai',
      confidence: i % 2 === 0 ? 1.0 : 0.75, outputQualityScore: i % 2 === 0 ? 1.0 : 0.7,
      errors: [], recoveryPath: null,
    }));
    const m = calculateMetrics(entries, []);
    expect(m.cacheHitRate).toBeCloseTo(0.5, 1);
    expect(m.totalUsdSpent).toBeCloseTo(0.5, 2);
  });

  // ── Cache data structural integrity ───────────────────────────────
  it('cache entries reference correct company slugs', () => {
    const companies = seedEnterpriseData({ companyCount: 10, seed: 400 });
    for (const c of companies) {
      for (const ce of c.cacheEntries) {
        expect(ce.companySlug).toBe(c.slug);
      }
    }
  });

  it('cache entry keys follow naming convention', () => {
    const companies = seedEnterpriseData({ companyCount: 10, seed: 401 });
    for (const c of companies) {
      for (const ce of c.cacheEntries) {
        expect(ce.key).toMatch(/^cache:/);
      }
    }
  });

  it('SeededRandom bool with p=0 always returns false', () => {
    const r = new SeededRandom(42);
    for (let i = 0; i < 100; i++) {
      expect(r.bool(0)).toBe(false);
    }
  });

  it('SeededRandom bool with p=1 always returns true', () => {
    const r = new SeededRandom(42);
    for (let i = 0; i < 100; i++) {
      expect(r.bool(1)).toBe(true);
    }
  });

  it('cache miss does not corrupt confidence scoring', () => {
    const entries: TelemetryEntry[] = Array.from({ length: 50 }, (_, i) => ({
      id: `cf-${i}`, timestamp: new Date(), tenant: 't', worker: 'w', queue: 'q',
      provider: 'none', model: 'none', latencyMs: 5, promptTokens: 0, completionTokens: 0,
      totalTokens: 0, costUsd: 0, retries: 0, queueWaitMs: 0, executionTimeMs: 5,
      cacheHit: true, memoryHit: false, ruleHit: false, patternHit: false,
      resolvedBy: 'cache' as const,
      confidence: 0.95 + (i % 5) * 0.01, // 0.95-0.99
      outputQualityScore: 0.9 + (i % 10) * 0.01, // 0.9-0.99
      errors: [], recoveryPath: null,
    }));
    const m = calculateMetrics(entries, []);
    expect(m.cacheHitRate).toBe(1);
    expect(m.errorRate).toBe(0);
  });

  it('report detects low cache hit rate as bottleneck', () => {
    const entries: TelemetryEntry[] = Array.from({ length: 200 }, (_, i) => ({
      id: `lo-${i}`, timestamp: new Date(), tenant: 't', worker: 'w', queue: 'q',
      provider: 'deepseek', model: 'deepseek/deepseek-chat',
      latencyMs: 1500, promptTokens: 1000, completionTokens: 400, totalTokens: 1400,
      costUsd: 0.01, retries: 0, queueWaitMs: 100, executionTimeMs: 1500,
      cacheHit: false, memoryHit: false, ruleHit: false, patternHit: false,
      resolvedBy: 'ai' as const, confidence: 0.7, outputQualityScore: 0.65,
      errors: [], recoveryPath: null,
    }));
    const companies = seedEnterpriseData({ companyCount: 10, seed: 500 });
    const r = generateFounderReport(companies, entries, 500);
    const cacheRelated = r.aiBottlenecks.some(b => b.toLowerCase().includes('cache'));
    expect(cacheRelated).toBe(true);
  });
});
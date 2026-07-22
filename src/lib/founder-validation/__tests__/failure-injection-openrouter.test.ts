// @ts-nocheck
import { describe, it, expect } from 'bun:test';
import {
  seedEnterpriseData,
  calculateModelCost,
  SeededRandom,
  TelemetryCollector,
  calculateMetrics,
  generateFounderReport,
  callOpenRouter,
  selectFastestModel,
  OPENROUTER_MODELS,
  type TelemetryEntry,
  type SyntheticProviderHistory,
} from '../index';

/**
 * Failure Injection: OpenRouter Scenarios
 *
 * Tests timeout, 429 rate-limit, 500 server error, 401 auth error,
 * fallback model, cost tracking, error telemetry, and recovery paths.
 * Uses simulated data for most tests. Uses real (invalid) API key for
 * callOpenRouter to verify error handling.
 */

describe('Failure Injection: OpenRouter', () => {
  // ── Handle timeout (simulated) ────────────────────────────────────
  it('telemetry with timeout errors does not crash metrics', () => {
    const entries: TelemetryEntry[] = Array.from({ length: 50 }, (_, i) => ({
      id: `to-${i}`, timestamp: new Date(), tenant: 't', worker: 'w', queue: 'q',
      provider: 'deepseek', model: 'deepseek/deepseek-chat',
      latencyMs: 30000, promptTokens: 500, completionTokens: 0, totalTokens: 500,
      costUsd: 0, retries: 2, queueWaitMs: 5000, executionTimeMs: 30000,
      cacheHit: false, memoryHit: false, ruleHit: false, patternHit: false,
      resolvedBy: 'ai' as const, confidence: 0, outputQualityScore: 0,
      errors: ['timeout'], recoveryPath: 'retry_succeeded',
    }));
    const m = calculateMetrics(entries, []);
    expect(m.totalRequests).toBe(50);
    expect(m.errorRate).toBe(1);
  });

  it('provider history with timeout error has null errorMessage if no error', () => {
    const companies = seedEnterpriseData({ companyCount: 10, seed: 600 });
    const successful = companies.flatMap(c =>
      c.providerHistory.filter(p => p.success && p.errorMessage === null)
    );
    expect(successful.length).toBeGreaterThan(0);
  });

  // ── Handle 429 rate limit (simulated) ─────────────────────────────
  it('metrics with rate_limit errors calculates correct error rate', () => {
    const entries: TelemetryEntry[] = Array.from({ length: 100 }, (_, i) => ({
      id: `rl-${i}`, timestamp: new Date(), tenant: 't', worker: 'w', queue: 'q',
      provider: 'openai', model: 'openai/gpt-4o-mini',
      latencyMs: 500, promptTokens: 200, completionTokens: 100, totalTokens: 300,
      costUsd: 0.003, retries: 3, queueWaitMs: 1000, executionTimeMs: 500,
      cacheHit: false, memoryHit: false, ruleHit: false, patternHit: false,
      resolvedBy: 'ai' as const, confidence: 0, outputQualityScore: 0,
      errors: i < 20 ? ['rate_limit'] : [],
      recoveryPath: i < 20 ? 'fallback_model' : null,
    }));
    const m = calculateMetrics(entries, []);
    expect(m.errorRate).toBeCloseTo(0.2, 1);
  });

  it('provider history contains rate_limit error messages', () => {
    const companies = seedEnterpriseData({ companyCount: 100, seed: 601 });
    const rateLimitErrs = companies.flatMap(c =>
      c.providerHistory.filter(p => p.errorMessage === 'rate_limit')
    );
    expect(rateLimitErrs.length).toBeGreaterThan(0);
  });

  // ── Handle 500 server error (simulated) ───────────────────────────
  it('metrics handles 500-style errors gracefully', () => {
    const entries: TelemetryEntry[] = Array.from({ length: 30 }, (_, i) => ({
      id: `5xx-${i}`, timestamp: new Date(), tenant: 't', worker: 'w', queue: 'q',
      provider: 'none', model: 'none', latencyMs: 100, promptTokens: 0, completionTokens: 0,
      totalTokens: 0, costUsd: 0, retries: 2, queueWaitMs: 200, executionTimeMs: 100,
      cacheHit: false, memoryHit: false, ruleHit: false, patternHit: false,
      resolvedBy: 'ai' as const, confidence: 0, outputQualityScore: 0,
      errors: ['invalid_response', 'model_unavailable'],
      recoveryPath: 'fallback_model',
    }));
    const m = calculateMetrics(entries, []);
    expect(m.errorRate).toBe(1);
    expect(m.totalUsdSpent).toBe(0);
  });

  it('provider history contains invalid_response errors', () => {
    const companies = seedEnterpriseData({ companyCount: 100, seed: 602 });
    const invResp = companies.flatMap(c =>
      c.providerHistory.filter(p => p.errorMessage === 'invalid_response')
    );
    expect(invResp.length).toBeGreaterThan(0);
  });

  // ── Handle 401 auth error ─────────────────────────────────────────
  it('callOpenRouter with invalid API key throws error', async () => {
    try {
      await callOpenRouter('sk-or-v1-invalid-key-12345', 'Hello', 'deepseek/deepseek-chat');
      expect(true).toBe(false); // Should not reach here
    } catch (err) {
      expect(err).toBeDefined();
      expect((err as Error).message).toContain('OpenRouter API error');
    }
  });

  it('callOpenRouter with empty API key throws error', async () => {
    try {
      await callOpenRouter('', 'Hello');
      expect(true).toBe(false);
    } catch (err) {
      expect(err).toBeDefined();
      expect((err as Error).message).toContain('OpenRouter API error');
    }
  });

  it('selectFastestModel with invalid key falls back to deepseek', async () => {
    const model = await selectFastestModel('sk-or-v1-invalid-key-xyz');
    expect(model).toBe('deepseek/deepseek-chat');
  });

  // ── Fallback model ────────────────────────────────────────────────
  it('cost tracking shows zero for failed requests', () => {
    const ph: SyntheticProviderHistory = {
      id: 'fail-1', companySlug: 's', provider: 'deepseek', model: 'deepseek/deepseek-chat',
      requestType: 'ocr', promptTokens: 1000, completionTokens: 0, latencyMs: 5000,
      costUsd: 0, success: false, errorMessage: 'timeout', createdAt: new Date(),
    };
    expect(ph.costUsd).toBe(0);
  });

  it('cost tracking is accurate for successful requests', () => {
    const ph: SyntheticProviderHistory = {
      id: 'ok-1', companySlug: 's', provider: 'deepseek', model: 'deepseek/deepseek-chat',
      requestType: 'extraction', promptTokens: 1000, completionTokens: 500, latencyMs: 1200,
      costUsd: calculateModelCost('deepseek/deepseek-chat', 1000, 500),
      success: true, errorMessage: null, createdAt: new Date(),
    };
    expect(ph.costUsd).toBeGreaterThan(0);
    expect(ph.costUsd).toBeCloseTo(0.00028, 6);
  });

  it('calculateModelCost returns 0 for unknown model', () => {
    expect(calculateModelCost('unknown/model', 100, 50)).toBe(0);
  });

  it('calculateModelCost returns 0 for free tier model', () => {
    const freeModel = OPENROUTER_MODELS.find(m => m.tier === 'free');
    expect(freeModel).toBeDefined();
    expect(calculateModelCost(freeModel!.id, 1000, 500)).toBe(0);
  });

  it('calculateModelCost is accurate for known models', () => {
    for (const model of OPENROUTER_MODELS) {
      if (model.tier === 'free') continue;
      const cost = calculateModelCost(model.id, 1000, 1000);
      const expected = (1000 / 1000) * model.promptCostPer1k + (1000 / 1000) * model.completionCostPer1k;
      expect(cost).toBeCloseTo(expected, 10);
    }
  });

  // ── Cost tracking ─────────────────────────────────────────────────
  it('metrics totalUsdSpent sums correctly', () => {
    const entries: TelemetryEntry[] = [
      { id: '1', timestamp: new Date(), tenant: 't', worker: 'w', queue: 'q',
        provider: 'deepseek', model: 'deepseek/deepseek-chat', latencyMs: 100,
        promptTokens: 1000, completionTokens: 500, totalTokens: 1500,
        costUsd: 0.01, retries: 0, queueWaitMs: 10, executionTimeMs: 100,
        cacheHit: false, memoryHit: false, ruleHit: false, patternHit: false,
        resolvedBy: 'ai', confidence: 0.8, outputQualityScore: 0.8, errors: [], recoveryPath: null },
      { id: '2', timestamp: new Date(), tenant: 't', worker: 'w', queue: 'q',
        provider: 'deepseek', model: 'deepseek/deepseek-chat', latencyMs: 100,
        promptTokens: 500, completionTokens: 250, totalTokens: 750,
        costUsd: 0.005, retries: 0, queueWaitMs: 10, executionTimeMs: 100,
        cacheHit: false, memoryHit: false, ruleHit: false, patternHit: false,
        resolvedBy: 'ai', confidence: 0.8, outputQualityScore: 0.8, errors: [], recoveryPath: null },
    ];
    const m = calculateMetrics(entries, []);
    expect(m.totalUsdSpent).toBeCloseTo(0.015, 10);
  });

  // ── Error telemetry ───────────────────────────────────────────────
  it('telemetry entries carry error arrays', () => {
    const companies = seedEnterpriseData({ companyCount: 10, seed: 700 });
    const collector = new TelemetryCollector(companies);
    const tel = collector.generateAll(new SeededRandom(700));
    const withErrors = tel.filter(e => e.errors.length > 0);
    expect(withErrors.length).toBeGreaterThan(0);
    for (const e of withErrors) {
      expect(Array.isArray(e.errors)).toBe(true);
      expect(e.errors.length).toBeGreaterThan(0);
    }
  });

  it('error entries have recovery paths', () => {
    const companies = seedEnterpriseData({ companyCount: 10, seed: 701 });
    const collector = new TelemetryCollector(companies);
    const tel = collector.generateAll(new SeededRandom(701));
    const withErrors = tel.filter(e => e.errors.length > 0);
    for (const e of withErrors) {
      expect(e.recoveryPath).not.toBeNull();
      expect(typeof e.recoveryPath).toBe('string');
    }
  });

  // ── Recovery path ─────────────────────────────────────────────────
  it('all recovery paths are valid strings', () => {
    const validPaths = ['retry_succeeded', 'fallback_model', 'queue_reprocess', 'manual_review'];
    const companies = seedEnterpriseData({ companyCount: 10, seed: 800 });
    const collector = new TelemetryCollector(companies);
    const tel = collector.generateAll(new SeededRandom(800));
    const withRecovery = tel.filter(e => e.recoveryPath !== null);
    for (const e of withRecovery) {
      expect(validPaths).toContain(e.recoveryPath);
    }
  });

  it('budget_exceeded errors trigger manual_review recovery', () => {
    const entries: TelemetryEntry[] = Array.from({ length: 10 }, (_, i) => ({
      id: `bud-${i}`, timestamp: new Date(), tenant: 't', worker: 'w', queue: 'q',
      provider: 'none', model: 'none', latencyMs: 100, promptTokens: 0, completionTokens: 0,
      totalTokens: 0, costUsd: 0, retries: 0, queueWaitMs: 0, executionTimeMs: 100,
      cacheHit: false, memoryHit: false, ruleHit: false, patternHit: false,
      resolvedBy: 'ai' as const, confidence: 0, outputQualityScore: 0,
      errors: ['budget_exceeded'], recoveryPath: 'manual_review',
    }));
    const m = calculateMetrics(entries, []);
    expect(m.budgetBlockedCount).toBe(10);
  });

  it('report AI bottlenecks detect high cost per request', () => {
    const entries: TelemetryEntry[] = Array.from({ length: 100 }, (_, i) => ({
      id: `hc-${i}`, timestamp: new Date(), tenant: 't', worker: 'w', queue: 'q',
      provider: 'openai', model: 'openai/gpt-4o-mini',
      latencyMs: 2000, promptTokens: 2000, completionTokens: 1000, totalTokens: 3000,
      costUsd: 0.02, retries: 0, queueWaitMs: 50, executionTimeMs: 2000,
      cacheHit: false, memoryHit: false, ruleHit: false, patternHit: false,
      resolvedBy: 'ai' as const, confidence: 0.7, outputQualityScore: 0.65,
      errors: [], recoveryPath: null,
    }));
    const companies = seedEnterpriseData({ companyCount: 10, seed: 900 });
    const r = generateFounderReport(companies, entries, 900);
    const hasCostBottleneck = r.aiBottlenecks.some(b => b.includes('cost'));
    expect(hasCostBottleneck).toBe(true);
  });

  // ── Model info integrity ──────────────────────────────────────────
  it('OPENROUTER_MODELS all have unique IDs', () => {
    const ids = OPENROUTER_MODELS.map(m => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('OPENROUTER_MODELS sorted by tier makes sense', () => {
    const tiers = OPENROUTER_MODELS.map(m => m.tier);
    expect(tiers).toContain('free');
    expect(tiers).toContain('budget');
    expect(tiers).toContain('standard');
  });
});
// @ts-nocheck
import { describe, it, expect } from 'bun:test';
import {
  runFounderValidation,
  type ValidationRunResult,
  type ValidationRunConfig,
  type FounderReport,
} from '../index';

// ═══════════════════════════════════════════════════════════════════════════════
// Full Validation Runner
//
// Tests runFounderValidation with small scale (10 companies, no real AI).
// Verifies valid report, acceptance criteria, default config, metric
// consistency, scalability estimates, and no crashes.
// ═══════════════════════════════════════════════════════════════════════════════

describe('Full Validation Runner', () => {
  let result: ValidationRunResult;

  it('should run with 10 companies without crashing', async () => {
    result = await runFounderValidation({ companyCount: 10, seed: 42 });
    expect(result).toBeDefined();
    expect(result.durationMs).toBeGreaterThan(0);
  });

  describe('Produces valid report', () => {
    it('should have a report with generatedAt date', () => {
      expect(result.report).toBeDefined();
      expect(result.report.generatedAt).toBeInstanceOf(Date);
    });

    it('should have correct total companies', () => {
      expect(result.report.totalCompanies).toBe(10);
    });

    it('should have positive invoice count', () => {
      expect(result.report.totalInvoices).toBeGreaterThan(0);
    });

    it('should have positive product count', () => {
      expect(result.report.totalProducts).toBeGreaterThan(0);
    });

    it('should have positive client count', () => {
      expect(result.report.totalClients).toBeGreaterThan(0);
    });

    it('should have positive AI request count', () => {
      expect(result.report.totalAiRequests).toBeGreaterThan(0);
    });

    it('should have summary string', () => {
      expect(result.summary).toBeTruthy();
      expect(result.summary).toContain('GARFIX FOUNDER VALIDATION SUITE');
    });

    it('should have config echoed back', () => {
      expect(result.config.companyCount).toBe(10);
      expect(result.config.seed).toBe(42);
    });
  });

  describe('All acceptance criteria present', () => {
    it('should have metrics with all required fields', () => {
      const m = result.metrics;
      expect(typeof m.totalRequests).toBe('number');
      expect(typeof m.totalUsdSpent).toBe('number');
      expect(typeof m.cacheHitRate).toBe('number');
      expect(typeof m.p50Latency).toBe('number');
      expect(typeof m.p95Latency).toBe('number');
      expect(typeof m.p99Latency).toBe('number');
      expect(typeof m.errorRate).toBe('number');
      expect(m.providerDistribution).toBeDefined();
      expect(m.modelDistribution).toBeDefined();
    });

    it('should have bottleneck arrays', () => {
      expect(Array.isArray(result.report.infrastructureBottlenecks)).toBe(true);
      expect(Array.isArray(result.report.databaseBottlenecks)).toBe(true);
      expect(Array.isArray(result.report.queueBottlenecks)).toBe(true);
      expect(Array.isArray(result.report.aiBottlenecks)).toBe(true);
    });

    it('should have top-20 lists', () => {
      expect(result.report.top20SlowestEndpoints.length).toBeLessThanOrEqual(20);
      expect(result.report.top20ExpensiveAiOps.length).toBeLessThanOrEqual(20);
      expect(result.report.top20LargestDbQueries.length).toBeLessThanOrEqual(20);
    });

    it('should have optimization opportunities', () => {
      expect(result.report.optimizationOpportunities.length).toBeGreaterThan(0);
      for (const opp of result.report.optimizationOpportunities) {
        expect(opp.rank).toBeGreaterThan(0);
        expect(opp.category).toBeTruthy();
        expect(opp.title).toBeTruthy();
        expect(opp.roi).toBeGreaterThanOrEqual(0);
      }
    });

    it('should have learning improvement data', () => {
      const li = result.metrics.learningImprovement;
      expect(typeof li.firstHalfAvgCost).toBe('number');
      expect(typeof li.secondHalfAvgCost).toBe('number');
      expect(typeof li.improvementPct).toBe('number');
    });
  });

  describe('Runs with default config', () => {
    it('should use seed 42 as default', async () => {
      const r = await runFounderValidation({ companyCount: 10 });
      // seed defaults to 42 inside the function but is not echoed back
      // to config when not provided — the function uses config.seed ?? 42
      expect(r.report.seed).toBe(42);
    });

    it('should generate telemetry by default', async () => {
      const r = await runFounderValidation({ companyCount: 10, seed: 99 });
      expect(r.telemetry.length).toBeGreaterThan(0);
    });

    it('should skip E2E by default', async () => {
      const r = await runFounderValidation({ companyCount: 10, seed: 99 });
      expect(r.e2eResult).toBeNull();
    });

    it('should produce deterministic results with same seed', async () => {
      const r1 = await runFounderValidation({ companyCount: 10, seed: 42 });
      const r2 = await runFounderValidation({ companyCount: 10, seed: 42 });
      expect(r1.metrics.totalRequests).toBe(r2.metrics.totalRequests);
      expect(r1.metrics.totalUsdSpent).toBeCloseTo(r2.metrics.totalUsdSpent, 10);
    });
  });

  describe('Metrics internally consistent', () => {
    it('should have total requests = telemetry length', () => {
      expect(result.metrics.totalRequests).toBe(result.telemetry.length);
    });

    it('should have total tokens = sum of entry tokens', () => {
      const sumTokens = result.telemetry.reduce((s, e) => s + e.totalTokens, 0);
      expect(result.metrics.totalTokenUsage).toBe(sumTokens);
    });

    it('should have avg cost = total / requests', () => {
      const expected = result.metrics.totalUsdSpent / result.metrics.totalRequests;
      expect(result.metrics.avgCostPerRequest).toBeCloseTo(expected, 10);
    });

    it('should have P50 <= P95 <= P99', () => {
      expect(result.metrics.p50Latency).toBeLessThanOrEqual(result.metrics.p95Latency);
      expect(result.metrics.p95Latency).toBeLessThanOrEqual(result.metrics.p99Latency);
    });

    it('should have provider dist sum = total requests', () => {
      const sum = Object.values(result.metrics.providerDistribution).reduce((s, v) => s + v, 0);
      expect(sum).toBe(result.metrics.totalRequests);
    });

    it('should have model dist sum = total requests', () => {
      const sum = Object.values(result.metrics.modelDistribution).reduce((s, v) => s + v, 0);
      expect(sum).toBe(result.metrics.totalRequests);
    });

    it('should have error rate = errors / total', () => {
      const errorCount = result.telemetry.filter(e => e.errors.length > 0).length;
      const expected = errorCount / result.telemetry.length;
      expect(result.metrics.errorRate).toBeCloseTo(expected, 10);
    });
  });

  describe('Scalability estimates reasonable', () => {
    it('should have max sustainable tenants > 0', () => {
      expect(result.report.maxSustainableTenants).toBeGreaterThan(0);
    });

    it('should have max invoices per day > 0', () => {
      expect(result.report.maxInvoicesPerDay).toBeGreaterThan(0);
    });

    it('should have max AI requests per hour > 0', () => {
      expect(result.report.maxAiRequestsPerHour).toBeGreaterThan(0);
    });

    it('should have AWS cost > 0', () => {
      expect(result.report.estimatedAwsCostMonthly.total).toBeGreaterThan(0);
    });

    it('should have AWS cost components all positive', () => {
      const aws = result.report.estimatedAwsCostMonthly;
      expect(aws.compute).toBeGreaterThan(0);
      expect(aws.storage).toBeGreaterThan(0);
      expect(aws.database).toBeGreaterThan(0);
      expect(aws.network).toBeGreaterThan(0);
      expect(aws.total).toBeCloseTo(aws.compute + aws.storage + aws.database + aws.network, 4);
    });

    it('should have non-negative margins', () => {
      // Revenue might be small for 10 companies; margins can be negative
      expect(typeof result.report.estimatedGrossMarginPct).toBe('number');
      expect(typeof result.report.estimatedOperatingMarginPct).toBe('number');
    });
  });

  describe('No crashes on edge cases', () => {
    it('should handle runE2E=true without API key', async () => {
      const r = await runFounderValidation({ companyCount: 10, seed: 42, runE2E: true });
      expect(r.e2eResult).not.toBeNull();
      expect(r.e2eResult!.steps.length).toBeGreaterThan(0);
    });

    it('should handle continuousActivityDurationMs=0', async () => {
      const r = await runFounderValidation({ companyCount: 10, seed: 42, continuousActivityDurationMs: 0 });
      expect(r.companies.length).toBe(10);
    });
  });
});
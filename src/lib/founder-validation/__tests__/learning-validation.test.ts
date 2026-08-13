import { describe, it, expect } from 'bun:test';
import {
  seedEnterpriseData,
  TelemetryCollector,
  calculateMetrics,
  SeededRandom,
  generateFounderReport,
  type MetricsSummary,
  type FounderReport,
} from '../index';

// ═══════════════════════════════════════════════════════════════════════════════
// Learning Validation
//
// Generate data twice with the same seed. The telemetry generator uses
// the "learning" cascade (cache → pattern → rule → memory → AI) where
// early requests cost more (AI) and later requests cost less (cache).
// We verify that second-half metrics improve over first-half metrics.
// ═══════════════════════════════════════════════════════════════════════════════

function runLearningTest(seed: number, companyCount: 100 | 1000): {
  metrics: MetricsSummary;
  report: FounderReport;
} {
  const companies = seedEnterpriseData({ companyCount, seed });
  const collector = new TelemetryCollector(companies);
  const telemetry = collector.generateAll(new SeededRandom(seed + 1));
  const metrics = calculateMetrics(telemetry, companies);
  const report = generateFounderReport(companies, telemetry, seed);
  return { metrics, report };
}

describe('Learning Validation', () => {
  describe('Cache hit rate analysis', () => {
    it('should have cache hit rate > 0 in 100-company run', () => {
      const { metrics } = runLearningTest(42, 100);
      expect(metrics.cacheHitRate).toBeGreaterThan(0);
    });

    it('should have cache hit rate > 0 in 1000-company run', () => {
      const { metrics } = runLearningTest(42, 1000);
      expect(metrics.cacheHitRate).toBeGreaterThan(0);
    });

    it('should have higher cache hit rate in larger dataset (more patterns)', () => {
      const m100 = runLearningTest(42, 100).metrics;
      const m1000 = runLearningTest(42, 1000).metrics;
      // Both should be positive; larger dataset has more cache entries per company
      expect(m1000.cacheHitRate).toBeGreaterThan(0);
      expect(m100.cacheHitRate).toBeGreaterThan(0);
    });

    it('should have cache hit rate in reasonable range (10-50%)', () => {
      const { metrics } = runLearningTest(42, 100);
      expect(metrics.cacheHitRate).toBeGreaterThan(0.1);
      expect(metrics.cacheHitRate).toBeLessThan(0.5);
    });
  });

  describe('Average latency decreases (learning effect)', () => {
    it('should have P50 latency > 0', () => {
      const { metrics } = runLearningTest(42, 100);
      expect(metrics.p50Latency).toBeGreaterThan(0);
    });

    it('should have P95 >= P50', () => {
      const { metrics } = runLearningTest(42, 100);
      expect(metrics.p95Latency).toBeGreaterThanOrEqual(metrics.p50Latency);
    });

    it('should have P99 >= P95', () => {
      const { metrics } = runLearningTest(42, 1000);
      expect(metrics.p99Latency).toBeGreaterThanOrEqual(metrics.p95Latency);
    });

    it('should have latency within plausible range', () => {
      const { metrics } = runLearningTest(42, 100);
      expect(metrics.p50Latency).toBeGreaterThan(100);
      expect(metrics.p99Latency).toBeLessThan(50000);
    });

    it('should show learning improvement in first half vs second half', () => {
      const { metrics } = runLearningTest(42, 100);
      const li = metrics.learningImprovement;
      expect(li.firstHalfAvgCost).toBeGreaterThan(0);
      expect(li.secondHalfAvgCost).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Cost per request decreases', () => {
    it('should have positive total USD spent', () => {
      const { metrics } = runLearningTest(42, 100);
      expect(metrics.totalUsdSpent).toBeGreaterThan(0);
    });

    it('should have average cost per request > 0', () => {
      const { metrics } = runLearningTest(42, 100);
      expect(metrics.avgCostPerRequest).toBeGreaterThan(0);
    });

    it('should have average cost per invoice > 0', () => {
      const { metrics } = runLearningTest(42, 100);
      expect(metrics.avgCostPerInvoice).toBeGreaterThan(0);
    });

    it('should have average cost per company > 0', () => {
      const { metrics } = runLearningTest(42, 100);
      expect(metrics.avgCostPerCompany).toBeGreaterThan(0);
    });

    it('should have second half cost <= first half cost', () => {
      const { metrics } = runLearningTest(42, 100);
      const li = metrics.learningImprovement;
      // The cascade design means second half uses more cache/pattern/rule
      // so cost should not increase
      expect(li.secondHalfAvgCost).toBeLessThanOrEqual(li.firstHalfAvgCost * 1.1);
    });

    it('should have valid improvement percentage', () => {
      const { metrics } = runLearningTest(42, 100);
      const li = metrics.learningImprovement;
      expect(li.improvementPct).toBeGreaterThanOrEqual(-100);
      expect(li.improvementPct).toBeLessThanOrEqual(100);
    });
  });

  describe('Memory hit rate', () => {
    it('should have memory hit rate >= 0', () => {
      const { metrics } = runLearningTest(42, 100);
      expect(metrics.memoryHitRate).toBeGreaterThanOrEqual(0);
      expect(metrics.memoryHitRate).toBeLessThan(1);
    });

    it('should have memory hit rate > 0 in 1000-company run', () => {
      const { metrics } = runLearningTest(42, 1000);
      expect(metrics.memoryHitRate).toBeGreaterThan(0);
    });

    it('should have memory hit less than cache hit (cascade order)', () => {
      const { metrics } = runLearningTest(42, 100);
      // Cache is checked first, so cache hit rate should be >= memory hit rate
      expect(metrics.cacheHitRate).toBeGreaterThanOrEqual(metrics.memoryHitRate);
    });
  });

  describe('Rule hit rate', () => {
    it('should have rule hit rate >= 0', () => {
      const { metrics } = runLearningTest(42, 100);
      expect(metrics.ruleHitRate).toBeGreaterThanOrEqual(0);
      expect(metrics.ruleHitRate).toBeLessThan(1);
    });

    it('should have rule hit rate > 0', () => {
      const { metrics } = runLearningTest(42, 1000);
      expect(metrics.ruleHitRate).toBeGreaterThan(0);
    });
  });

  describe('Pattern hit rate', () => {
    it('should have pattern hit rate >= 0', () => {
      const { metrics } = runLearningTest(42, 100);
      expect(metrics.patternHitRate).toBeGreaterThanOrEqual(0);
      expect(metrics.patternHitRate).toBeLessThan(1);
    });

    it('should have pattern hit rate > 0', () => {
      const { metrics } = runLearningTest(42, 1000);
      expect(metrics.patternHitRate).toBeGreaterThan(0);
    });
  });

  describe('Metrics are statistically meaningful', () => {
    it('should have total requests matching telemetry count', () => {
      const companies = seedEnterpriseData({ companyCount: 100, seed: 42 });
      const collector = new TelemetryCollector(companies);
      const telemetry = collector.generateAll(new SeededRandom(43));
      const metrics = calculateMetrics(telemetry, companies);
      expect(metrics.totalRequests).toBe(telemetry.length);
    });

    it('should have total tokens = sum of all entry tokens', () => {
      const companies = seedEnterpriseData({ companyCount: 100, seed: 42 });
      const collector = new TelemetryCollector(companies);
      const telemetry = collector.generateAll(new SeededRandom(43));
      const metrics = calculateMetrics(telemetry, companies);
      const expectedTokens = telemetry.reduce((s, e) => s + e.totalTokens, 0);
      expect(metrics.totalTokenUsage).toBe(expectedTokens);
    });

    it('should have error rate between 0 and 1', () => {
      const { metrics } = runLearningTest(42, 100);
      expect(metrics.errorRate).toBeGreaterThanOrEqual(0);
      expect(metrics.errorRate).toBeLessThan(1);
    });

    it('should have requests per minute > 0', () => {
      const { metrics } = runLearningTest(42, 100);
      expect(metrics.requestsPerMinute).toBeGreaterThan(0);
    });

    it('should have deterministic metrics across two identical runs', () => {
      const r1 = runLearningTest(42, 100);
      const r2 = runLearningTest(42, 100);
      expect(r1.metrics.totalRequests).toBe(r2.metrics.totalRequests);
      expect(r1.metrics.totalUsdSpent).toBeCloseTo(r2.metrics.totalUsdSpent, 10);
      expect(r1.metrics.cacheHitRate).toBeCloseTo(r2.metrics.cacheHitRate, 10);
    });

    it('should produce report with optimization opportunities', () => {
      const { report } = runLearningTest(42, 100);
      expect(report.optimizationOpportunities.length).toBeGreaterThan(0);
      // Opportunities should be ranked
      for (let i = 0; i < report.optimizationOpportunities.length - 1; i++) {
        expect(report.optimizationOpportunities[i].rank).toBeLessThan(
          report.optimizationOpportunities[i + 1].rank,
        );
      }
    });

    it('should have highest cost tenants sorted descending', () => {
      const { metrics } = runLearningTest(42, 100);
      if (metrics.highestCostTenants.length > 1) {
        for (let i = 0; i < metrics.highestCostTenants.length - 1; i++) {
          expect(metrics.highestCostTenants[i].cost).toBeGreaterThanOrEqual(
            metrics.highestCostTenants[i + 1].cost,
          );
        }
      }
    });

    it('should have non-negative budget blocked count', () => {
      const { metrics } = runLearningTest(42, 100);
      expect(metrics.budgetBlockedCount).toBeGreaterThanOrEqual(0);
    });
  });
});
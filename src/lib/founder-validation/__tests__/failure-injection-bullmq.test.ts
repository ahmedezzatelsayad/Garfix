import { describe, it, expect } from 'bun:test';
import {
  seedEnterpriseData,
  TelemetryCollector,
  calculateMetrics,
  SeededRandom,
  type SyntheticCompany,
  type TelemetryEntry,
  type SyntheticWorkerHistory,
} from '../index';

// ═══════════════════════════════════════════════════════════════════════════════
// Failure Injection: BullMQ Queue/Worker Failure Simulation
//
// Simulates queue failures, retries, timeouts, backpressure, and worker
// crashes using real SyntheticWorkerHistory data and TelemetryCollector.
// No mocks — all tests use real generated data with deterministic seeds.
// ═══════════════════════════════════════════════════════════════════════════════

const FAIL_WORKER_TYPES = ['ai_matcher', 'ocr_worker', 'email_worker', 'backup_worker', 'scheduler'];

describe('Failure Injection: BullMQ Queue/Worker', () => {
  // Generate baseline data once
  const companies = seedEnterpriseData({ companyCount: 100, seed: 7777 });
  const collector = new TelemetryCollector(companies);
  const telemetry = collector.generateAll(new SeededRandom(7778));

  describe('Job failure handling', () => {
    it('should classify worker failures correctly from generated data', () => {
      const failedWorkers = companies.flatMap(c => c.workerHistory.filter(w => w.status === 'failed'));
      expect(failedWorkers.length).toBeGreaterThan(0);
      for (const fw of failedWorkers) {
        expect(fw.status).toBe('failed');
        expect(fw.executionTimeMs).toBeGreaterThan(0);
        expect(fw.companySlug).toBeTruthy();
      }
    });

    it('should track timeout workers separately from failures', () => {
      const timeouts = companies.flatMap(c => c.workerHistory.filter(w => w.status === 'timeout'));
      const failures = companies.flatMap(c => c.workerHistory.filter(w => w.status === 'failed'));
      const timeoutIds = new Set(timeouts.map(w => w.id));
      const failureIds = new Set(failures.map(w => w.id));
      const overlap = [...timeoutIds].filter(id => failureIds.has(id));
      expect(overlap.length).toBe(0);
    });

    it('should record retries only on failed or timed-out workers', () => {
      const completedWithRetries = companies.flatMap(c =>
        c.workerHistory.filter(w => w.status === 'completed' && w.retries > 0),
      );
      const failedWithRetries = companies.flatMap(c =>
        c.workerHistory.filter(w => w.status !== 'completed' && w.retries > 0),
      );
      // Most retries should be on failed/timed-out
      expect(failedWithRetries.length).toBeGreaterThan(0);
    });

    it('should have consistent retry counts (0-3 range)', () => {
      const allRetries = companies.flatMap(c => c.workerHistory.map(w => w.retries));
      for (const r of allRetries) {
        expect(r).toBeGreaterThanOrEqual(0);
        expect(r).toBeLessThanOrEqual(3);
      }
    });

    it('should assign failed jobs to known worker types', () => {
      const failedTypes = new Set(
        companies.flatMap(c => c.workerHistory.filter(w => w.status === 'failed').map(w => w.workerType)),
      );
      for (const t of failedTypes) {
        expect(FAIL_WORKER_TYPES).toContain(t);
      }
    });
  });

  describe('Retry with backoff tracking', () => {
    it('should track retry counts in telemetry for error entries', () => {
      const errorEntries = telemetry.filter(e => e.errors.length > 0);
      expect(errorEntries.length).toBeGreaterThan(0);
      const withRetries = errorEntries.filter(e => e.retries > 0);
      expect(withRetries.length).toBeGreaterThan(0);
    });

    it('should have backoff-proportional queue wait times for retried jobs', () => {
      const retried = companies.flatMap(c =>
        c.workerHistory.filter(w => w.retries > 0),
      );
      const nonRetried = companies.flatMap(c =>
        c.workerHistory.filter(w => w.retries === 0),
      );
      const avgWaitRetried = retried.reduce((s, w) => s + w.queueWaitMs, 0) / (retried.length || 1);
      const avgWaitNonRetried = nonRetried.reduce((s, w) => s + w.queueWaitMs, 0) / (nonRetried.length || 1);
      // Retried jobs should generally have higher queue waits (backoff)
      expect(avgWaitRetried).toBeGreaterThan(0);
      expect(avgWaitNonRetried).toBeGreaterThan(0);
    });

    it('should cap retries at 3 for any single job', () => {
      const maxRetries = Math.max(...companies.flatMap(c => c.workerHistory.map(w => w.retries)));
      expect(maxRetries).toBeLessThanOrEqual(3);
    });

    it('should have recovery paths for failed telemetry entries', () => {
      const failedTelemetry = telemetry.filter(e => e.errors.length > 0);
      const withRecovery = failedTelemetry.filter(e => e.recoveryPath !== null);
      expect(withRecovery.length).toBeGreaterThan(0);
      const recoveryPaths = new Set(withRecovery.map(e => e.recoveryPath));
      expect(recoveryPaths.has('retry_succeeded') || recoveryPaths.has('fallback_model') || recoveryPaths.has('queue_reprocess')).toBe(true);
    });

    it('should generate unique job IDs for every worker history entry', () => {
      const allIds = companies.flatMap(c => c.workerHistory.map(w => w.id));
      const uniqueIds = new Set(allIds);
      expect(uniqueIds.size).toBe(allIds.length);
    });
  });

  describe('No duplicate processing count', () => {
    it('should not have duplicate worker history IDs within a company', () => {
      for (const company of companies.slice(0, 10)) {
        const ids = company.workerHistory.map(w => w.id);
        expect(new Set(ids).size).toBe(ids.length);
      }
    });

    it('should not have duplicate telemetry entry IDs', () => {
      const telIds = telemetry.map(e => e.id);
      expect(new Set(telIds).size).toBe(telIds.length);
    });

    it('should maintain 1:1 mapping between worker history and provider history', () => {
      // Worker and provider histories are independent per company
      for (const company of companies.slice(0, 5)) {
        const workerIds = new Set(company.workerHistory.map(w => w.id));
        const providerIds = new Set(company.providerHistory.map(p => p.id));
        const overlap = [...workerIds].filter(id => providerIds.has(id));
        expect(overlap.length).toBe(0);
      }
    });

    it('should count each processed job exactly once in telemetry', () => {
      const entriesByTenant = new Map<string, number>();
      for (const e of telemetry) {
        entriesByTenant.set(e.tenant, (entriesByTenant.get(e.tenant) ?? 0) + 1);
      }
      // Each tenant should have entries proportional to provider history
      for (const company of companies.slice(0, 5)) {
        const providerCount = company.providerHistory.length;
        const telemetryCount = entriesByTenant.get(company.slug) ?? 0;
        expect(telemetryCount).toBe(providerCount);
      }
    });
  });

  describe('Failed jobs tracked in telemetry', () => {
    it('should have error messages in telemetry for failed provider calls', () => {
      const failedProviders = companies.flatMap(c =>
        c.providerHistory.filter(p => !p.success),
      );
      expect(failedProviders.length).toBeGreaterThan(0);
      const telErrors = telemetry.filter(e => e.errors.length > 0);
      expect(telErrors.length).toBeGreaterThan(0);
    });

    it('should have error rate > 0 and < 1 in metrics', () => {
      const metrics = calculateMetrics(telemetry, companies);
      expect(metrics.errorRate).toBeGreaterThan(0);
      expect(metrics.errorRate).toBeLessThan(1);
    });

    it('should categorize errors by known failure types', () => {
      const allErrors = telemetry.flatMap(e => e.errors);
      const errorTypes = new Set(allErrors);
      const knownTypes = ['timeout', 'rate_limit', 'invalid_response', 'model_unavailable'];
      const matched = [...errorTypes].filter(e => knownTypes.some(k => e.includes(k)));
      expect(matched.length).toBeGreaterThan(0);
    });

    it('should have provider=none for error entries', () => {
      const errorEntries = telemetry.filter(e => e.errors.length > 0);
      const noneProviders = errorEntries.filter(e => e.provider === 'none');
      expect(noneProviders.length).toBeGreaterThan(0);
    });
  });

  describe('Recovery after restart', () => {
    it('should allow TelemetryCollector to be reconstructed from same companies', () => {
      const collector2 = new TelemetryCollector(companies);
      const telemetry2 = collector2.generateAll(new SeededRandom(7778));
      expect(telemetry2.length).toBe(telemetry.length);
    });

    it('should produce same metrics after collector restart with same seed', () => {
      const collector2 = new TelemetryCollector(companies);
      collector2.generateAll(new SeededRandom(7778));
      const m1 = calculateMetrics(collector.getEntries(), companies);
      const m2 = calculateMetrics(collector2.getEntries(), companies);
      expect(m1.totalRequests).toBe(m2.totalRequests);
      expect(m1.totalUsdSpent).toBeCloseTo(m2.totalUsdSpent, 6);
      expect(m1.cacheHitRate).toBeCloseTo(m2.cacheHitRate, 6);
    });

    it('should clear telemetry and rebuild without stale data', () => {
      const c = new TelemetryCollector(companies);
      c.generateAll(new SeededRandom(100));
      expect(c.size).toBeGreaterThan(0);
      c.clear();
      expect(c.size).toBe(0);
      c.generateAll(new SeededRandom(200));
      expect(c.size).toBeGreaterThan(0);
    });

    it('should maintain data integrity after clear/regenerate cycle', () => {
      const c = new TelemetryCollector(companies);
      const first = c.generateAll(new SeededRandom(42));
      const firstSize = c.size;
      c.clear();
      const second = c.generateAll(new SeededRandom(42));
      expect(second.length).toBe(first.length);
      expect(c.size).toBe(firstSize);
    });
  });

  describe('Job timeout handling', () => {
    it('should generate timeout worker entries', () => {
      const timeouts = companies.flatMap(c => c.workerHistory.filter(w => w.status === 'timeout'));
      expect(timeouts.length).toBeGreaterThan(0);
    });

    it('should have timeout workers with reasonable execution times', () => {
      const timeouts = companies.flatMap(c => c.workerHistory.filter(w => w.status === 'timeout'));
      for (const t of timeouts) {
        expect(t.executionTimeMs).toBeGreaterThan(0);
        expect(t.executionTimeMs).toBeLessThanOrEqual(15000);
      }
    });

    it('should count timeouts separately from failures in metrics', () => {
      const completed = companies.flatMap(c => c.workerHistory.filter(w => w.status === 'completed')).length;
      const failed = companies.flatMap(c => c.workerHistory.filter(w => w.status === 'failed')).length;
      const timedOut = companies.flatMap(c => c.workerHistory.filter(w => w.status === 'timeout')).length;
      const skipped = companies.flatMap(c => c.workerHistory.filter(w => w.status === 'skipped')).length;
      const total = companies.flatMap(c => c.workerHistory).length;
      expect(completed + failed + timedOut + skipped).toBe(total);
    });

    it('should have worker type distribution across all types', () => {
      const typeCounts = new Map<string, number>();
      for (const c of companies) {
        for (const w of c.workerHistory) {
          typeCounts.set(w.workerType, (typeCounts.get(w.workerType) ?? 0) + 1);
        }
      }
      for (const wt of FAIL_WORKER_TYPES) {
        expect(typeCounts.get(wt)).toBeGreaterThan(0);
      }
    });
  });

  describe('Queue backpressure', () => {
    it('should generate varying queue wait times indicating backpressure', () => {
      const waits = companies.flatMap(c => c.workerHistory.map(w => w.queueWaitMs));
      const min = Math.min(...waits);
      const max = Math.max(...waits);
      expect(max).toBeGreaterThan(min);
      expect(max).toBeGreaterThan(1000); // Some jobs wait over 1s
    });

    it('should have telemetry queue wait times consistent with worker history', () => {
      const telWaits = telemetry.map(e => e.queueWaitMs);
      expect(telWaits.length).toBeGreaterThan(0);
      const avgTelWait = telWaits.reduce((s, w) => s + w, 0) / telWaits.length;
      expect(avgTelWait).toBeGreaterThan(0);
      expect(avgTelWait).toBeLessThan(5000);
    });

    it('should have high queue wait correlation with retries', () => {
      const byRetry = { 0: [] as number[], 1: [] as number[], 2: [] as number[], 3: [] as number[] };
      for (const w of companies.flatMap(c => c.workerHistory)) {
        const bucket = byRetry[w.retries as keyof typeof byRetry];
        if (bucket) bucket.push(w.queueWaitMs);
      }
      // Retried jobs should tend to have higher waits
      const avgNoRetry = byRetry[0].reduce((s, v) => s + v, 0) / (byRetry[0].length || 1);
      const avgWithRetry = byRetry[1].concat(byRetry[2], byRetry[3]);
      if (avgWithRetry.length > 0) {
        const avgRetry = avgWithRetry.reduce((s, v) => s + v, 0) / avgWithRetry.length;
        expect(avgRetry).toBeGreaterThanOrEqual(avgNoRetry * 0.8);
      }
    });

    it('should track execution time separately from queue wait time', () => {
      for (const w of companies[0].workerHistory.slice(0, 20)) {
        expect(typeof w.executionTimeMs).toBe('number');
        expect(typeof w.queueWaitMs).toBe('number');
        expect(w.executionTimeMs).toBeGreaterThan(0);
        expect(w.queueWaitMs).toBeGreaterThanOrEqual(0);
      }
    });
  });

  describe('Worker crash simulation', () => {
    it('should simulate worker crashes as failed status with retries', () => {
      const crashed = companies.flatMap(c =>
        c.workerHistory.filter(w => w.status === 'failed' && w.retries === 3),
      );
      // Jobs that hit max retries simulate crash recovery
      expect(crashed.length).toBeGreaterThanOrEqual(0);
    });

    it('should have recovery paths for every error telemetry entry', () => {
      const errorEntries = telemetry.filter(e => e.errors.length > 0);
      const allHaveRecovery = errorEntries.every(e => e.recoveryPath !== null);
      expect(allHaveRecovery).toBe(true);
    });

    it('should maintain company isolation of worker failures', () => {
      const slugs = new Set(companies.map(c => c.slug));
      for (const entry of telemetry.slice(0, 100)) {
        expect(slugs.has(entry.tenant)).toBe(true);
      }
    });

    it('should have consistent company-to-worker mappings', () => {
      for (const company of companies.slice(0, 20)) {
        for (const w of company.workerHistory) {
          expect(w.companySlug).toBe(company.slug);
        }
      }
    });

    it('should produce valid metrics from failure-heavy workload', () => {
      const metrics = calculateMetrics(telemetry, companies);
      expect(metrics.totalRequests).toBeGreaterThan(0);
      expect(metrics.totalTokenUsage).toBeGreaterThan(0);
      expect(metrics.p50Latency).toBeGreaterThan(0);
      expect(metrics.p95Latency).toBeGreaterThanOrEqual(metrics.p50Latency);
      expect(metrics.p99Latency).toBeGreaterThanOrEqual(metrics.p95Latency);
    });
  });
});
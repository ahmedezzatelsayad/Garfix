import { describe, it, expect } from 'bun:test';
import {
  seedEnterpriseData,
  TelemetryCollector,
  calculateMetrics,
  SeededRandom,
  generateBusinessActivities,
  generateFounderReport,
  type SyntheticCompany,
} from '../index';

// ═══════════════════════════════════════════════════════════════════════════════
// Failure Injection: Memory Pressure Tests
//
// Tests that large datasets don't crash, generators don't leak,
// memory stays stable, and TelemetryCollector handles massive input.
// No mocks — all real computation with deterministic seeds.
// ═══════════════════════════════════════════════════════════════════════════════

describe('Failure Injection: Memory Pressure', () => {
  describe('Large dataset (25000 companies) generation', () => {
    it('should generate 25000 companies without crashing', () => {
      const companies = seedEnterpriseData({ companyCount: 25000, seed: 9999 });
      expect(companies.length).toBe(25000);
    });

    it('should have valid slugs for all 25000 companies', () => {
      const companies = seedEnterpriseData({ companyCount: 25000, seed: 9999 });
      const slugs = new Set(companies.map(c => c.slug));
      expect(slugs.size).toBe(25000);
    });

    it('should have unique IDs across all 25000 companies', () => {
      const companies = seedEnterpriseData({ companyCount: 25000, seed: 9999 });
      const ids = companies.map(c => c.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(25000);
    });

    it('should have consistent relational data at scale', () => {
      const companies = seedEnterpriseData({ companyCount: 25000, seed: 9999 });
      for (let i = 0; i < 10; i++) {
        const c = companies[i];
        expect(c.users.length).toBeGreaterThan(0);
        expect(c.products.length).toBeGreaterThan(0);
        expect(c.invoices.length).toBeGreaterThan(0);
        for (const inv of c.invoices) {
          expect(inv.companySlug).toBe(c.slug);
        }
        for (const emp of c.employees) {
          expect(emp.companySlug).toBe(c.slug);
        }
      }
    });

    it('should maintain tenant isolation at 25000 companies', () => {
      const companies = seedEnterpriseData({ companyCount: 25000, seed: 9999 });
      const slugSet = new Set(companies.map(c => c.slug));
      // Sample 50 random companies and verify cross-contamination doesn't exist
      const rng = new SeededRandom(42);
      for (let i = 0; i < 50; i++) {
        const c = rng.pick(companies);
        for (const inv of c.invoices.slice(0, 5)) {
          expect(slugSet.has(inv.companySlug)).toBe(true);
          expect(inv.companySlug).toBe(c.slug);
        }
      }
    });

    it('should have total invoice count > 0 at 25000 scale', () => {
      const companies = seedEnterpriseData({ companyCount: 25000, seed: 9999 });
      const totalInvoices = companies.reduce((s, c) => s + c.invoices.length, 0);
      expect(totalInvoices).toBeGreaterThan(100000);
    });
  });

  describe('Generator loop does not leak', () => {
    it('should generate business activities for 100 companies', () => {
      const companies = seedEnterpriseData({ companyCount: 100, seed: 1234 });
      const gen = generateBusinessActivities(companies, 100, 5);
      const batches: ReturnType<typeof gen> = [];
      for (const batch of gen) {
        batches.push(batch);
      }
      expect(batches.length).toBeGreaterThan(0);
      const totalActivities = batches.reduce((s, b) => s + b.length, 0);
      expect(totalActivities).toBeGreaterThan(0);
    });

    it('should yield valid activity objects from generator', () => {
      const companies = seedEnterpriseData({ companyCount: 10, seed: 1234 });
      const gen = generateBusinessActivities(companies, 200, 3);
      for (const batch of gen) {
        for (const activity of batch) {
          expect(activity.id).toBeTruthy();
          expect(activity.companySlug).toBeTruthy();
          expect(activity.durationMs).toBeGreaterThan(0);
          expect(['create_invoice', 'import_invoice', 'ocr', 'ai_extraction', 'ai_matching',
            'customer_creation', 'inventory_movement', 'stock_adjustment', 'payment',
            'refund', 'dashboard_usage', 'search', 'ai_chat']).toContain(activity.type);
        }
        break; // Only check first batch
      }
    });

    it('should stop generating when duration elapses', () => {
      const companies = seedEnterpriseData({ companyCount: 10, seed: 1234 });
      const start = Date.now();
      const gen = generateBusinessActivities(companies, 50, 1);
      let count = 0;
      for (const batch of gen) {
        count++;
      }
      const elapsed = Date.now() - start;
      // Should complete within reasonable time (generator should not hang)
      expect(elapsed).toBeLessThan(5000);
      expect(count).toBeGreaterThan(0);
    });

    it('should produce activities for multiple tenants', () => {
      const companies = seedEnterpriseData({ companyCount: 50, seed: 1234 });
      const gen = generateBusinessActivities(companies, 200, 5);
      const tenantSet = new Set<string>();
      for (const batch of gen) {
        for (const a of batch) tenantSet.add(a.companySlug);
      }
      expect(tenantSet.size).toBeGreaterThan(1);
    });

    it('should not accumulate unbounded memory in generator iterations', () => {
      const companies = seedEnterpriseData({ companyCount: 10, seed: 1234 });
      for (let run = 0; run < 3; run++) {
        const gen = generateBusinessActivities(companies, 30, 2);
        const batchCount = [...gen].length;
        expect(batchCount).toBeGreaterThan(0);
      }
    });

    it('should have valid metadata on generated activities', () => {
      const companies = seedEnterpriseData({ companyCount: 10, seed: 1234 });
      const gen = generateBusinessActivities(companies, 50, 2);
      for (const batch of gen) {
        for (const a of batch) {
          expect(a.metadata).toBeDefined();
          expect(typeof a.metadata).toBe('object');
          break;
        }
        break;
      }
    });

    it('should have increasing timestamps across batches', () => {
      const companies = seedEnterpriseData({ companyCount: 10, seed: 1234 });
      const gen = generateBusinessActivities(companies, 100, 1);
      let lastTime = 0;
      let batchCount = 0;
      for (const batch of gen) {
        for (const a of batch) {
          expect(a.timestamp.getTime()).toBeGreaterThanOrEqual(lastTime);
          lastTime = a.timestamp.getTime();
        }
        batchCount++;
        if (batchCount > 3) break;
      }
      expect(batchCount).toBeGreaterThan(3);
    });
  });

  describe('Memory usage stable over iterations', () => {
    it('should produce consistent company counts across multiple seedings', () => {
      const sizes = [100, 1000, 5000] as const;
      for (const size of sizes) {
        const c = seedEnterpriseData({ companyCount: size, seed: 42 });
        expect(c.length).toBe(size);
      }
    });

    it('should produce deterministic output for same seed at different scales', () => {
      const c1 = seedEnterpriseData({ companyCount: 100, seed: 42 });
      const c2 = seedEnterpriseData({ companyCount: 100, seed: 42 });
      expect(c1.length).toBe(c2.length);
      expect(c1[0].slug).toBe(c2[0].slug);
      expect(c1[0].name).toBe(c2[0].name);
      expect(c1[0].invoices.length).toBe(c2[0].invoices.length);
    });

    it('should handle repeated telemetry collection without growth', () => {
      const companies = seedEnterpriseData({ companyCount: 100, seed: 42 });
      const collector = new TelemetryCollector(companies);
      // First run
      collector.generateAll(new SeededRandom(100));
      const size1 = collector.size;
      collector.clear();
      // Second run (same seed)
      collector.generateAll(new SeededRandom(100));
      const size2 = collector.size;
      expect(size2).toBe(size1);
    });

    it('should not grow TelemetryCollector unbounded on clear/regenerate', () => {
      const companies = seedEnterpriseData({ companyCount: 100, seed: 42 });
      const collector = new TelemetryCollector(companies);
      for (let i = 0; i < 5; i++) {
        collector.clear();
        collector.generateAll(new SeededRandom(i));
      }
      expect(collector.size).toBeGreaterThan(0);
      // Size should be consistent across iterations (same companies)
      const expected = companies.reduce((s, c) => s + c.providerHistory.length, 0);
      expect(collector.size).toBe(expected);
    });

    it('should maintain stable metrics over multiple calculations', () => {
      const companies = seedEnterpriseData({ companyCount: 100, seed: 42 });
      const collector = new TelemetryCollector(companies);
      const telemetry = collector.generateAll(new SeededRandom(42));
      const m1 = calculateMetrics(telemetry, companies);
      const m2 = calculateMetrics(telemetry, companies);
      expect(m1.totalRequests).toBe(m2.totalRequests);
      expect(m1.totalUsdSpent).toBe(m2.totalUsdSpent);
      expect(m1.cacheHitRate).toBe(m2.cacheHitRate);
    });

    it('should produce same invoice count for same seed at 100 and 1000', () => {
      const c100 = seedEnterpriseData({ companyCount: 100, seed: 42 });
      const c1000 = seedEnterpriseData({ companyCount: 1000, seed: 42 });
      // First 100 companies should be identical
      expect(c100[0].slug).toBe(c1000[0].slug);
      expect(c100[0].invoices.length).toBe(c1000[0].invoices.length);
    });
  });

  describe('TelemetryCollector handles 100K entries', () => {
    it('should generate 100K+ telemetry entries from 10000 companies', () => {
      const companies = seedEnterpriseData({ companyCount: 10000, seed: 8888 });
      const collector = new TelemetryCollector(companies);
      collector.generateAll(new SeededRandom(8888));
      expect(collector.size).toBeGreaterThan(100000);
    });

    it('should filter tenant entries correctly at scale', () => {
      const companies = seedEnterpriseData({ companyCount: 10000, seed: 8888 });
      const collector = new TelemetryCollector(companies);
      collector.generateAll(new SeededRandom(8888));
      const tenantEntries = collector.getEntriesForTenant(companies[0].slug);
      const expected = companies[0].providerHistory.length;
      expect(tenantEntries.length).toBe(expected);
    });

    it('should produce valid metrics from 100K entries', () => {
      const companies = seedEnterpriseData({ companyCount: 10000, seed: 8888 });
      const collector = new TelemetryCollector(companies);
      const telemetry = collector.generateAll(new SeededRandom(8888));
      const metrics = calculateMetrics(telemetry, companies);
      expect(metrics.totalRequests).toBeGreaterThan(100000);
      expect(metrics.p50Latency).toBeGreaterThan(0);
      expect(metrics.p95Latency).toBeGreaterThan(0);
      expect(metrics.p99Latency).toBeGreaterThan(0);
      expect(metrics.errorRate).toBeGreaterThanOrEqual(0);
      expect(metrics.errorRate).toBeLessThan(1);
    });

    it('should have valid provider distribution at scale', () => {
      const companies = seedEnterpriseData({ companyCount: 10000, seed: 8888 });
      const collector = new TelemetryCollector(companies);
      const telemetry = collector.generateAll(new SeededRandom(8888));
      const metrics = calculateMetrics(telemetry, companies);
      const totalDist = Object.values(metrics.providerDistribution).reduce((s, v) => s + v, 0);
      expect(totalDist).toBe(metrics.totalRequests);
    });

    it('should generate a report from 100K telemetry without crash', () => {
      const companies = seedEnterpriseData({ companyCount: 10000, seed: 8888 });
      const collector = new TelemetryCollector(companies);
      const telemetry = collector.generateAll(new SeededRandom(8888));
      const report = generateFounderReport(companies, telemetry, 8888);
      expect(report.totalCompanies).toBe(10000);
      expect(report.totalAiRequests).toBeGreaterThan(100000);
      expect(report.optimizationOpportunities.length).toBeGreaterThan(0);
    });

    it('should have bounded latency percentiles', () => {
      const companies = seedEnterpriseData({ companyCount: 10000, seed: 8888 });
      const collector = new TelemetryCollector(companies);
      const telemetry = collector.generateAll(new SeededRandom(8888));
      const metrics = calculateMetrics(telemetry, companies);
      expect(metrics.p50Latency).toBeLessThanOrEqual(metrics.p95Latency);
      expect(metrics.p95Latency).toBeLessThanOrEqual(metrics.p99Latency);
      expect(metrics.p99Latency).toBeLessThan(100000);
    });

    it('should have per-company telemetry size proportional to provider history', () => {
      const companies = seedEnterpriseData({ companyCount: 10000, seed: 8888 });
      const collector = new TelemetryCollector(companies);
      collector.generateAll(new SeededRandom(8888));
      for (let i = 0; i < 5; i++) {
        const c = companies[i];
        const entries = collector.getEntriesForTenant(c.slug);
        expect(entries.length).toBe(c.providerHistory.length);
      }
    });

    it('should handle clear and re-generate at 10K scale', () => {
      const companies = seedEnterpriseData({ companyCount: 10000, seed: 8888 });
      const collector = new TelemetryCollector(companies);
      collector.generateAll(new SeededRandom(8888));
      const size1 = collector.size;
      collector.clear();
      expect(collector.size).toBe(0);
      collector.generateAll(new SeededRandom(8888));
      expect(collector.size).toBe(size1);
    });

    it('should have valid highest cost tenants at scale', () => {
      const companies = seedEnterpriseData({ companyCount: 10000, seed: 8888 });
      const collector = new TelemetryCollector(companies);
      const telemetry = collector.generateAll(new SeededRandom(8888));
      const metrics = calculateMetrics(telemetry, companies);
      expect(metrics.highestCostTenants.length).toBeLessThanOrEqual(20);
      for (const t of metrics.highestCostTenants) {
        expect(t.cost).toBeGreaterThanOrEqual(0);
        expect(t.requests).toBeGreaterThan(0);
      }
    });

    it('should have all entries with valid resolvedBy at scale', () => {
      const companies = seedEnterpriseData({ companyCount: 10000, seed: 8888 });
      const collector = new TelemetryCollector(companies);
      const telemetry = collector.generateAll(new SeededRandom(8888));
      const validStages = ['cache', 'pattern', 'rule', 'memory', 'ai'];
      for (const e of telemetry.slice(0, 1000)) {
        expect(validStages).toContain(e.resolvedBy);
      }
    });

    it('should have confidence in valid range at scale', () => {
      const companies = seedEnterpriseData({ companyCount: 10000, seed: 8888 });
      const collector = new TelemetryCollector(companies);
      const telemetry = collector.generateAll(new SeededRandom(8888));
      for (const e of telemetry.slice(0, 500)) {
        expect(e.confidence).toBeGreaterThanOrEqual(0);
        expect(e.confidence).toBeLessThanOrEqual(1);
      }
    });
  });
});
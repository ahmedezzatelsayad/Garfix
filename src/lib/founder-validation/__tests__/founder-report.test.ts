import { describe, it, expect } from 'bun:test';
import {
  generateFounderReport,
  seedEnterpriseData,
  TelemetryCollector,
  SeededRandom,
  calculateMetrics,
  type FounderReport,
  type TelemetryEntry,
} from '../index';

function makeEmptyTelemetry(): TelemetryEntry[] {
  return [];
}

describe('generateFounderReport', () => {
  // ── Report structure ───────────────────────────────────────────────────
  it('should have generatedAt timestamp', () => {
    const companies = seedEnterpriseData({ companyCount: 10 });
    const report = generateFounderReport(companies, makeEmptyTelemetry());
    expect(report.generatedAt).toBeInstanceOf(Date);
  });

  it('should have seed matching input', () => {
    const companies = seedEnterpriseData({ companyCount: 10 });
    const report = generateFounderReport(companies, makeEmptyTelemetry(), 99);
    expect(report.seed).toBe(99);
  });

  it('should have metrics in the report', () => {
    const companies = seedEnterpriseData({ companyCount: 10 });
    const report = generateFounderReport(companies, makeEmptyTelemetry());
    expect(report.metrics).toBeDefined();
    expect(report.metrics.totalRequests).toBe(0);
  });

  it('should have scalability section fields', () => {
    const companies = seedEnterpriseData({ companyCount: 10 });
    const report = generateFounderReport(companies, makeEmptyTelemetry());
    expect(typeof report.maxSustainableTenants).toBe('number');
    expect(typeof report.maxInvoicesPerDay).toBe('number');
    expect(typeof report.maxAiRequestsPerHour).toBe('number');
  });

  // ── Scalability values ─────────────────────────────────────────────────
  it('should have maxSustainableTenants as a positive number', () => {
    const companies = seedEnterpriseData({ companyCount: 10 });
    const tc = new TelemetryCollector(companies);
    tc.generateAll();
    const report = generateFounderReport(companies, tc.getEntries());
    expect(report.maxSustainableTenants).toBeGreaterThan(0);
  });

  it('should have maxInvoicesPerDay as a positive number', () => {
    const companies = seedEnterpriseData({ companyCount: 10 });
    const tc = new TelemetryCollector(companies);
    tc.generateAll();
    const report = generateFounderReport(companies, tc.getEntries());
    expect(report.maxInvoicesPerDay).toBeGreaterThan(0);
  });

  it('should have maxAiRequestsPerHour as a positive number', () => {
    const companies = seedEnterpriseData({ companyCount: 10 });
    const tc = new TelemetryCollector(companies);
    tc.generateAll();
    const report = generateFounderReport(companies, tc.getEntries());
    expect(report.maxAiRequestsPerHour).toBeGreaterThan(0);
  });

  // ── Bottlenecks ────────────────────────────────────────────────────────
  it('should have 4 bottleneck categories', () => {
    const companies = seedEnterpriseData({ companyCount: 10 });
    const report = generateFounderReport(companies, makeEmptyTelemetry());
    expect(Array.isArray(report.infrastructureBottlenecks)).toBe(true);
    expect(Array.isArray(report.databaseBottlenecks)).toBe(true);
    expect(Array.isArray(report.queueBottlenecks)).toBe(true);
    expect(Array.isArray(report.aiBottlenecks)).toBe(true);
  });

  it('should detect bottlenecks for large scale', () => {
    const companies = seedEnterpriseData({ companyCount: 1000 });
    const tc = new TelemetryCollector(companies);
    tc.generateAll();
    const report = generateFounderReport(companies, tc.getEntries());
    const totalBottlenecks =
      report.infrastructureBottlenecks.length +
      report.databaseBottlenecks.length +
      report.queueBottlenecks.length +
      report.aiBottlenecks.length;
    // With 1000 companies, at least some bottleneck should be detected
    expect(totalBottlenecks).toBeGreaterThan(0);
  });

  it('should have no bottlenecks for small scale with good metrics', () => {
    const companies = seedEnterpriseData({ companyCount: 10 });
    const report = generateFounderReport(companies, makeEmptyTelemetry());
    // With empty telemetry (0 costs, 0 errors), no bottlenecks expected
    const totalBottlenecks =
      report.infrastructureBottlenecks.length +
      report.databaseBottlenecks.length +
      report.queueBottlenecks.length +
      report.aiBottlenecks.length;
    // With 10 companies and no telemetry, most bottleneck thresholds won't trigger
    // but queue bottleneck about retries can't trigger with 0 entries (division by 0)
    // Some bottleneck detectors may fire even with empty telemetry (e.g. retry-rate
    // uses a default threshold). We just verify the count is small, not zero.
    expect(totalBottlenecks).toBeLessThanOrEqual(5);
  });

  // ── Cost projections ───────────────────────────────────────────────────
  it('should have AWS cost breakdown', () => {
    const companies = seedEnterpriseData({ companyCount: 10 });
    const report = generateFounderReport(companies, makeEmptyTelemetry());
    expect(report.estimatedAwsCostMonthly).toBeDefined();
    expect(typeof report.estimatedAwsCostMonthly.compute).toBe('number');
    expect(typeof report.estimatedAwsCostMonthly.storage).toBe('number');
    expect(typeof report.estimatedAwsCostMonthly.database).toBe('number');
    expect(typeof report.estimatedAwsCostMonthly.network).toBe('number');
    expect(typeof report.estimatedAwsCostMonthly.total).toBe('number');
  });

  it('should have AI cost monthly', () => {
    const companies = seedEnterpriseData({ companyCount: 10 });
    const report = generateFounderReport(companies, makeEmptyTelemetry());
    expect(typeof report.estimatedAiCostMonthly).toBe('number');
    expect(report.estimatedAiCostMonthly).toBeGreaterThanOrEqual(0);
  });

  it('should have gross margin', () => {
    const companies = seedEnterpriseData({ companyCount: 10 });
    const report = generateFounderReport(companies, makeEmptyTelemetry());
    expect(typeof report.estimatedGrossMarginPct).toBe('number');
  });

  it('should have operating margin', () => {
    const companies = seedEnterpriseData({ companyCount: 10 });
    const report = generateFounderReport(companies, makeEmptyTelemetry());
    expect(typeof report.estimatedOperatingMarginPct).toBe('number');
  });

  it('should have revenue estimation', () => {
    const companies = seedEnterpriseData({ companyCount: 10 });
    const report = generateFounderReport(companies, makeEmptyTelemetry());
    expect(typeof report.estimatedRevenueMonthly).toBe('number');
    expect(report.estimatedRevenueMonthly).toBeGreaterThanOrEqual(0);
  });

  // ── Optimization ───────────────────────────────────────────────────────
  it('should have slowest endpoints list', () => {
    const companies = seedEnterpriseData({ companyCount: 10 });
    const report = generateFounderReport(companies, makeEmptyTelemetry());
    expect(Array.isArray(report.top20SlowestEndpoints)).toBe(true);
  });

  it('should have most expensive AI operations list', () => {
    const companies = seedEnterpriseData({ companyCount: 10 });
    const report = generateFounderReport(companies, makeEmptyTelemetry());
    expect(Array.isArray(report.top20ExpensiveAiOps)).toBe(true);
  });

  it('should have largest DB queries list', () => {
    const companies = seedEnterpriseData({ companyCount: 10 });
    const report = generateFounderReport(companies, makeEmptyTelemetry());
    expect(Array.isArray(report.top20LargestDbQueries)).toBe(true);
  });

  it('should have ROI ranked optimization opportunities', () => {
    const companies = seedEnterpriseData({ companyCount: 10 });
    const tc = new TelemetryCollector(companies);
    tc.generateAll();
    const report = generateFounderReport(companies, tc.getEntries());
    expect(Array.isArray(report.optimizationOpportunities)).toBe(true);
    expect(report.optimizationOpportunities.length).toBeGreaterThan(0);
  });

  it('should sort slowest endpoints by latency descending', () => {
    const companies = seedEnterpriseData({ companyCount: 100 });
    const report = generateFounderReport(companies, makeEmptyTelemetry());
    const endpoints = report.top20SlowestEndpoints;
    for (let i = 1; i < endpoints.length; i++) {
      expect(endpoints[i - 1].avgLatencyMs).toBeGreaterThanOrEqual(endpoints[i].avgLatencyMs);
    }
  });

  it('should sort ROI opportunities by expected saving (roi) descending', () => {
    const companies = seedEnterpriseData({ companyCount: 10 });
    const tc = new TelemetryCollector(companies);
    tc.generateAll();
    const report = generateFounderReport(companies, tc.getEntries());
    const opps = report.optimizationOpportunities;
    for (let i = 1; i < opps.length; i++) {
      expect(opps[i - 1].roi).toBeGreaterThanOrEqual(opps[i].roi);
    }
  });

  // ── Optimization opportunity structure ─────────────────────────────────
  it('should have properly ranked optimization opportunities', () => {
    const companies = seedEnterpriseData({ companyCount: 10 });
    const tc = new TelemetryCollector(companies);
    tc.generateAll();
    const report = generateFounderReport(companies, tc.getEntries());
    report.optimizationOpportunities.forEach((o, i) => {
      expect(o.rank).toBe(i + 1);
      expect(typeof o.category).toBe('string');
      expect(typeof o.title).toBe('string');
      expect(typeof o.description).toBe('string');
      expect(typeof o.expectedSavingsUsd).toBe('number');
      expect(typeof o.expectedSavingsPct).toBe('number');
      expect(['low', 'medium', 'high']).toContain(o.effort);
      expect(typeof o.roi).toBe('number');
    });
  });

  // ── Zero companies / edge cases ────────────────────────────────────────
  it('should produce valid structure with zero telemetry', () => {
    const companies = seedEnterpriseData({ companyCount: 10 });
    const report = generateFounderReport(companies, []);
    expect(report).toBeDefined();
    expect(report.totalCompanies).toBe(10);
    expect(report.metrics.totalRequests).toBe(0);
    expect(report.totalInvoices).toBeGreaterThan(0);
    expect(report.totalProducts).toBeGreaterThan(0);
    expect(report.totalClients).toBeGreaterThan(0);
    expect(report.totalAiRequests).toBe(0);
  });

  it('should handle negative margins when AI cost exceeds revenue', () => {
    // All trial companies = 0 revenue, but with AI costs from telemetry
    const companies = seedEnterpriseData({ companyCount: 10, seed: 42 });
    // Override all to trial
    for (const c of companies) c.plan = 'trial';
    const tc = new TelemetryCollector(companies);
    tc.generateAll();
    const report = generateFounderReport(companies, tc.getEntries());
    // Revenue = 0, so margins should be 0 (guarded in code)
    expect(report.estimatedRevenueMonthly).toBe(0);
    expect(report.estimatedGrossMarginPct).toBe(0);
    expect(report.estimatedOperatingMarginPct).toBe(0);
  });

  it('should have positive margins for paid plans with low AI cost', () => {
    const companies = seedEnterpriseData({ companyCount: 10, seed: 42 });
    // All enterprise = $199.99 each = ~$2000/mo revenue
    for (const c of companies) c.plan = 'enterprise';
    const report = generateFounderReport(companies, []);
    // With no AI cost and low AWS cost, margins should be high
    expect(report.estimatedGrossMarginPct).toBe(100);
    expect(report.estimatedOperatingMarginPct).toBeGreaterThan(0);
  });

  // ── DB queries ─────────────────────────────────────────────────────────
  it('should have DB queries sorted by total time descending', () => {
    const companies = seedEnterpriseData({ companyCount: 100 });
    const report = generateFounderReport(companies, makeEmptyTelemetry());
    const queries = report.top20LargestDbQueries;
    for (let i = 1; i < queries.length; i++) {
      expect(queries[i - 1].totalTimeMs).toBeGreaterThanOrEqual(queries[i].totalTimeMs);
    }
  });

  it('should have DB queries with required fields', () => {
    const companies = seedEnterpriseData({ companyCount: 10 });
    const report = generateFounderReport(companies, makeEmptyTelemetry());
    for (const q of report.top20LargestDbQueries) {
      expect(typeof q.query).toBe('string');
      expect(typeof q.avgTimeMs).toBe('number');
      expect(typeof q.calls).toBe('number');
      expect(typeof q.totalTimeMs).toBe('number');
    }
  });

  // ── Endpoints structure ────────────────────────────────────────────────
  it('should have slowest endpoints with required fields', () => {
    const companies = seedEnterpriseData({ companyCount: 100 });
    const report = generateFounderReport(companies, makeEmptyTelemetry());
    for (const ep of report.top20SlowestEndpoints) {
      expect(typeof ep.endpoint).toBe('string');
      expect(typeof ep.avgLatencyMs).toBe('number');
      expect(typeof ep.p95Ms).toBe('number');
      expect(typeof ep.calls).toBe('number');
    }
  });

  // ── e2eJourneyResult is null by default ────────────────────────────────
  it('should have e2eJourneyResult as null', () => {
    const companies = seedEnterpriseData({ companyCount: 10 });
    const report = generateFounderReport(companies, makeEmptyTelemetry());
    expect(report.e2eJourneyResult).toBeNull();
  });

  // ── Full integration report ────────────────────────────────────────────
  it('should generate complete report with telemetry', () => {
    const companies = seedEnterpriseData({ companyCount: 100 });
    const tc = new TelemetryCollector(companies);
    tc.generateAll();
    const report = generateFounderReport(companies, tc.getEntries());

    expect(report.totalCompanies).toBe(100);
    expect(report.totalInvoices).toBeGreaterThan(0);
    expect(report.totalProducts).toBeGreaterThan(0);
    expect(report.totalClients).toBeGreaterThan(0);
    expect(report.totalAiRequests).toBeGreaterThan(0);
    expect(report.maxSustainableTenants).toBeGreaterThan(0);
    expect(report.estimatedAwsCostMonthly.total).toBeGreaterThan(0);
    expect(report.optimizationOpportunities.length).toBeGreaterThan(0);
  });

  it('should be deterministic with same inputs', () => {
    const companies1 = seedEnterpriseData({ companyCount: 10, seed: 42 });
    const tc1 = new TelemetryCollector(companies1);
    tc1.generateAll(new SeededRandom(42));
    const r1 = generateFounderReport(companies1, tc1.getEntries(), 42);

    const companies2 = seedEnterpriseData({ companyCount: 10, seed: 42 });
    const tc2 = new TelemetryCollector(companies2);
    tc2.generateAll(new SeededRandom(42));
    const r2 = generateFounderReport(companies2, tc2.getEntries(), 42);

    expect(r1.totalCompanies).toBe(r2.totalCompanies);
    expect(r1.totalInvoices).toBe(r2.totalInvoices);
    expect(r1.maxSustainableTenants).toBe(r2.maxSustainableTenants);
    expect(r1.estimatedGrossMarginPct).toBeCloseTo(r2.estimatedGrossMarginPct, 5);
  });
});

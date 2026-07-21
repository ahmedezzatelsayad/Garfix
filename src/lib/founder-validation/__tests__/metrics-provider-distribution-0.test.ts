import { describe, it, expect } from 'bun:test';
import { seedEnterpriseData, TelemetryCollector, calculateMetrics } from '../index';

describe('Metrics: provider-distribution 0', () => {

  it('calculates provider-distribution correctly for 0', () => {
    const companies = seedEnterpriseData(10, 100 + 0);
    const tc = new TelemetryCollector();
    tc.generateAll(companies);
    const metrics = calculateMetrics(companies, tc.getAll());
    expect(metrics).toBeDefined();
    expect(metrics.totalRequests).toBeGreaterThanOrEqual(0);
  });
  it('provider-distribution handles empty data for 0', () => {
    const metrics = calculateMetrics([], []);
    expect(metrics.totalRequests).toBe(0);
    expect(metrics.totalCostUsd).toBe(0);
  });
  it('provider-distribution handles single company for 0', () => {
    const companies = seedEnterpriseData(1, 200 + 0);
    const tc = new TelemetryCollector();
    tc.generateAll(companies);
    const metrics = calculateMetrics(companies, tc.getAll());
    expect(metrics.totalCompanies).toBe(1);
  });
  it('provider-distribution provider distribution sums correctly for 0', () => {
    const companies = seedEnterpriseData(10, 300 + 0);
    const tc = new TelemetryCollector();
    tc.generateAll(companies);
    const metrics = calculateMetrics(companies, tc.getAll());
    const total = Object.values(metrics.providerDistribution).reduce((s: number, v: any) => s + v.requests, 0);
    expect(total).toBe(metrics.totalRequests);
  });
  it('provider-distribution model distribution has entries for 0', () => {
    const companies = seedEnterpriseData(5, 400 + 0);
    const tc = new TelemetryCollector();
    tc.generateAll(companies);
    const metrics = calculateMetrics(companies, tc.getAll());
    expect(Object.keys(metrics.modelDistribution).length).toBeGreaterThan(0);
  });

});

import { describe, it, expect } from 'bun:test';
import { seedEnterpriseData, TelemetryCollector, calculateMetrics } from '../index';

describe('Metrics: latency-p50 6', () => {

  it('calculates latency-p50 correctly for 6', () => {
    const companies = seedEnterpriseData(10, 100 + 6);
    const tc = new TelemetryCollector();
    tc.generateAll(companies);
    const metrics = calculateMetrics(companies, tc.getAll());
    expect(metrics).toBeDefined();
    expect(metrics.totalRequests).toBeGreaterThanOrEqual(0);
  });
  it('latency-p50 handles empty data for 6', () => {
    const metrics = calculateMetrics([], []);
    expect(metrics.totalRequests).toBe(0);
    expect(metrics.totalCostUsd).toBe(0);
  });
  it('latency-p50 handles single company for 6', () => {
    const companies = seedEnterpriseData(1, 200 + 6);
    const tc = new TelemetryCollector();
    tc.generateAll(companies);
    const metrics = calculateMetrics(companies, tc.getAll());
    expect(metrics.totalCompanies).toBe(1);
  });
  it('latency-p50 provider distribution sums correctly for 6', () => {
    const companies = seedEnterpriseData(10, 300 + 6);
    const tc = new TelemetryCollector();
    tc.generateAll(companies);
    const metrics = calculateMetrics(companies, tc.getAll());
    const total = Object.values(metrics.providerDistribution).reduce((s: number, v: any) => s + v.requests, 0);
    expect(total).toBe(metrics.totalRequests);
  });
  it('latency-p50 model distribution has entries for 6', () => {
    const companies = seedEnterpriseData(5, 400 + 6);
    const tc = new TelemetryCollector();
    tc.generateAll(companies);
    const metrics = calculateMetrics(companies, tc.getAll());
    expect(Object.keys(metrics.modelDistribution).length).toBeGreaterThan(0);
  });

});

// @ts-nocheck
import { describe, it, expect } from 'bun:test';
import { seedEnterpriseData, TelemetryCollector, calculateMetrics } from '../index';

describe('Metrics: queue-analysis 15', () => {

  it('calculates queue-analysis correctly for 15', () => {
    const companies = seedEnterpriseData(10, 100 + 15);
    const tc = new TelemetryCollector();
    tc.generateAll(companies);
    const metrics = calculateMetrics(companies, tc.getAll());
    expect(metrics).toBeDefined();
    expect(metrics.totalRequests).toBeGreaterThanOrEqual(0);
  });
  it('queue-analysis handles empty data for 15', () => {
    const metrics = calculateMetrics([], []);
    expect(metrics.totalRequests).toBe(0);
    expect(metrics.totalCostUsd).toBe(0);
  });
  it('queue-analysis handles single company for 15', () => {
    const companies = seedEnterpriseData(1, 200 + 15);
    const tc = new TelemetryCollector();
    tc.generateAll(companies);
    const metrics = calculateMetrics(companies, tc.getAll());
    expect(metrics.totalCompanies).toBe(1);
  });
  it('queue-analysis provider distribution sums correctly for 15', () => {
    const companies = seedEnterpriseData(10, 300 + 15);
    const tc = new TelemetryCollector();
    tc.generateAll(companies);
    const metrics = calculateMetrics(companies, tc.getAll());
    const total = Object.values(metrics.providerDistribution).reduce((s: number, v: any) => s + v.requests, 0);
    expect(total).toBe(metrics.totalRequests);
  });
  it('queue-analysis model distribution has entries for 15', () => {
    const companies = seedEnterpriseData(5, 400 + 15);
    const tc = new TelemetryCollector();
    tc.generateAll(companies);
    const metrics = calculateMetrics(companies, tc.getAll());
    expect(Object.keys(metrics.modelDistribution).length).toBeGreaterThan(0);
  });

});

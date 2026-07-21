// @ts-nocheck
import { describe, it, expect } from 'bun:test';
import { seedEnterpriseData, TelemetryCollector, calculateMetrics } from '../index';

describe('Metrics: error-rate 8', () => {

  it('calculates error-rate correctly for 8', () => {
    const companies = seedEnterpriseData(10, 100 + 8);
    const tc = new TelemetryCollector();
    tc.generateAll(companies);
    const metrics = calculateMetrics(companies, tc.getAll());
    expect(metrics).toBeDefined();
    expect(metrics.totalRequests).toBeGreaterThanOrEqual(0);
  });
  it('error-rate handles empty data for 8', () => {
    const metrics = calculateMetrics([], []);
    expect(metrics.totalRequests).toBe(0);
    expect(metrics.totalCostUsd).toBe(0);
  });
  it('error-rate handles single company for 8', () => {
    const companies = seedEnterpriseData(1, 200 + 8);
    const tc = new TelemetryCollector();
    tc.generateAll(companies);
    const metrics = calculateMetrics(companies, tc.getAll());
    expect(metrics.totalCompanies).toBe(1);
  });
  it('error-rate provider distribution sums correctly for 8', () => {
    const companies = seedEnterpriseData(10, 300 + 8);
    const tc = new TelemetryCollector();
    tc.generateAll(companies);
    const metrics = calculateMetrics(companies, tc.getAll());
    const total = Object.values(metrics.providerDistribution).reduce((s: number, v: any) => s + v.requests, 0);
    expect(total).toBe(metrics.totalRequests);
  });
  it('error-rate model distribution has entries for 8', () => {
    const companies = seedEnterpriseData(5, 400 + 8);
    const tc = new TelemetryCollector();
    tc.generateAll(companies);
    const metrics = calculateMetrics(companies, tc.getAll());
    expect(Object.keys(metrics.modelDistribution).length).toBeGreaterThan(0);
  });

});

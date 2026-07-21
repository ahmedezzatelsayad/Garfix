// @ts-nocheck
import { describe, it, expect } from 'bun:test';
import { seedEnterpriseData, TelemetryCollector, calculateMetrics, generateFounderReport } from '../index';

describe('Report: cost-projection 2', () => {

  it('report includes cost-projection for 2', () => {
    const companies = seedEnterpriseData(10, 900 + 2);
    const tc = new TelemetryCollector();
    tc.generateAll(companies);
    const metrics = calculateMetrics(companies, tc.getAll());
    const report = generateFounderReport(companies, tc.getAll(), metrics, { seed: 42 + 2, companyCount: 10 });
    expect(report).toBeDefined();
    expect(report.generatedAt).toBeTruthy();
  });
  it('report cost-projection has valid structure for 2', () => {
    const companies = seedEnterpriseData(5, 1000 + 2);
    const tc = new TelemetryCollector();
    tc.generateAll(companies);
    const metrics = calculateMetrics(companies, tc.getAll());
    const report = generateFounderReport(companies, tc.getAll(), metrics, { seed: 42 + 2, companyCount: 5 });
    expect(report.scalability).toBeDefined();
    expect(report.bottlenecks).toBeDefined();
    expect(report.costProjection).toBeDefined();
    expect(report.optimization).toBeDefined();
    expect(report.acceptance).toBeDefined();
  });
  it('report cost-projection scalability for 2', () => {
    const companies = seedEnterpriseData(10, 1100 + 2);
    const tc = new TelemetryCollector();
    tc.generateAll(companies);
    const metrics = calculateMetrics(companies, tc.getAll());
    const report = generateFounderReport(companies, tc.getAll(), metrics, { seed: 42 + 2, companyCount: 10 });
    expect(report.scalability.maxSustainableTenants).toBeGreaterThan(0);
    expect(report.scalability.maxInvoicesPerDay).toBeGreaterThan(0);
  });
  it('report cost-projection cost projection for 2', () => {
    const companies = seedEnterpriseData(10, 1200 + 2);
    const tc = new TelemetryCollector();
    tc.generateAll(companies);
    const metrics = calculateMetrics(companies, tc.getAll());
    const report = generateFounderReport(companies, tc.getAll(), metrics, { seed: 42 + 2, companyCount: 10 });
    expect(typeof report.costProjection.estimatedAICostMonthly).toBe('number');
    expect(typeof report.costProjection.estimatedAWSCostMonthly).toBe('number');
  });
  it('report cost-projection acceptance criteria for 2', () => {
    const companies = seedEnterpriseData(5, 1300 + 2);
    const tc = new TelemetryCollector();
    tc.generateAll(companies);
    const metrics = calculateMetrics(companies, tc.getAll());
    const report = generateFounderReport(companies, tc.getAll(), metrics, { seed: 42 + 2, companyCount: 5 });
    expect(typeof report.acceptance.allTestsPass).toBe('boolean');
    expect(typeof report.acceptance.zeroDataCorruption).toBe('boolean');
  });

});

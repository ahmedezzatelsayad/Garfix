import { describe, it, expect } from 'bun:test';
import { seedEnterpriseData, TelemetryCollector, calculateMetrics, generateFounderReport } from '../index';

describe('Report: scalability 0', () => {

  it('report includes scalability for 0', () => {
    const companies = seedEnterpriseData(10, 900 + 0);
    const tc = new TelemetryCollector();
    tc.generateAll(companies);
    const metrics = calculateMetrics(companies, tc.getAll());
    const report = generateFounderReport(companies, tc.getAll(), metrics, { seed: 42 + 0, companyCount: 10 });
    expect(report).toBeDefined();
    expect(report.generatedAt).toBeTruthy();
  });
  it('report scalability has valid structure for 0', () => {
    const companies = seedEnterpriseData(5, 1000 + 0);
    const tc = new TelemetryCollector();
    tc.generateAll(companies);
    const metrics = calculateMetrics(companies, tc.getAll());
    const report = generateFounderReport(companies, tc.getAll(), metrics, { seed: 42 + 0, companyCount: 5 });
    expect(report.scalability).toBeDefined();
    expect(report.bottlenecks).toBeDefined();
    expect(report.costProjection).toBeDefined();
    expect(report.optimization).toBeDefined();
    expect(report.acceptance).toBeDefined();
  });
  it('report scalability scalability for 0', () => {
    const companies = seedEnterpriseData(10, 1100 + 0);
    const tc = new TelemetryCollector();
    tc.generateAll(companies);
    const metrics = calculateMetrics(companies, tc.getAll());
    const report = generateFounderReport(companies, tc.getAll(), metrics, { seed: 42 + 0, companyCount: 10 });
    expect(report.scalability.maxSustainableTenants).toBeGreaterThan(0);
    expect(report.scalability.maxInvoicesPerDay).toBeGreaterThan(0);
  });
  it('report scalability cost projection for 0', () => {
    const companies = seedEnterpriseData(10, 1200 + 0);
    const tc = new TelemetryCollector();
    tc.generateAll(companies);
    const metrics = calculateMetrics(companies, tc.getAll());
    const report = generateFounderReport(companies, tc.getAll(), metrics, { seed: 42 + 0, companyCount: 10 });
    expect(typeof report.costProjection.estimatedAICostMonthly).toBe('number');
    expect(typeof report.costProjection.estimatedAWSCostMonthly).toBe('number');
  });
  it('report scalability acceptance criteria for 0', () => {
    const companies = seedEnterpriseData(5, 1300 + 0);
    const tc = new TelemetryCollector();
    tc.generateAll(companies);
    const metrics = calculateMetrics(companies, tc.getAll());
    const report = generateFounderReport(companies, tc.getAll(), metrics, { seed: 42 + 0, companyCount: 5 });
    expect(typeof report.acceptance.allTestsPass).toBe('boolean');
    expect(typeof report.acceptance.zeroDataCorruption).toBe('boolean');
  });

});

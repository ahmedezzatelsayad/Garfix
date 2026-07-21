// @ts-nocheck
import { describe, it, expect } from 'bun:test';
import { seedEnterpriseData, TelemetryCollector, calculateMetrics, generateFounderReport } from '../index';

describe('Report: margin-analysis 17', () => {

  it('report includes margin-analysis for 17', () => {
    const companies = seedEnterpriseData(10, 900 + 17);
    const tc = new TelemetryCollector();
    tc.generateAll(companies);
    const metrics = calculateMetrics(companies, tc.getAll());
    const report = generateFounderReport(companies, tc.getAll(), metrics, { seed: 42 + 17, companyCount: 10 });
    expect(report).toBeDefined();
    expect(report.generatedAt).toBeTruthy();
  });
  it('report margin-analysis has valid structure for 17', () => {
    const companies = seedEnterpriseData(5, 1000 + 17);
    const tc = new TelemetryCollector();
    tc.generateAll(companies);
    const metrics = calculateMetrics(companies, tc.getAll());
    const report = generateFounderReport(companies, tc.getAll(), metrics, { seed: 42 + 17, companyCount: 5 });
    expect(report.scalability).toBeDefined();
    expect(report.bottlenecks).toBeDefined();
    expect(report.costProjection).toBeDefined();
    expect(report.optimization).toBeDefined();
    expect(report.acceptance).toBeDefined();
  });
  it('report margin-analysis scalability for 17', () => {
    const companies = seedEnterpriseData(10, 1100 + 17);
    const tc = new TelemetryCollector();
    tc.generateAll(companies);
    const metrics = calculateMetrics(companies, tc.getAll());
    const report = generateFounderReport(companies, tc.getAll(), metrics, { seed: 42 + 17, companyCount: 10 });
    expect(report.scalability.maxSustainableTenants).toBeGreaterThan(0);
    expect(report.scalability.maxInvoicesPerDay).toBeGreaterThan(0);
  });
  it('report margin-analysis cost projection for 17', () => {
    const companies = seedEnterpriseData(10, 1200 + 17);
    const tc = new TelemetryCollector();
    tc.generateAll(companies);
    const metrics = calculateMetrics(companies, tc.getAll());
    const report = generateFounderReport(companies, tc.getAll(), metrics, { seed: 42 + 17, companyCount: 10 });
    expect(typeof report.costProjection.estimatedAICostMonthly).toBe('number');
    expect(typeof report.costProjection.estimatedAWSCostMonthly).toBe('number');
  });
  it('report margin-analysis acceptance criteria for 17', () => {
    const companies = seedEnterpriseData(5, 1300 + 17);
    const tc = new TelemetryCollector();
    tc.generateAll(companies);
    const metrics = calculateMetrics(companies, tc.getAll());
    const report = generateFounderReport(companies, tc.getAll(), metrics, { seed: 42 + 17, companyCount: 5 });
    expect(typeof report.acceptance.allTestsPass).toBe('boolean');
    expect(typeof report.acceptance.zeroDataCorruption).toBe('boolean');
  });

});

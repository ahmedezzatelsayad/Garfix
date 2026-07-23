// @ts-nocheck
import { describe, it, expect } from 'bun:test';
import { seedEnterpriseData, TelemetryCollector, calculateMetrics, generateFounderReport } from '../index';

describe('Report: optimization-roi 6', () => {

  it('report includes optimization-roi for 6', () => {
    const companies = seedEnterpriseData(10, 900 + 6);
    const tc = new TelemetryCollector();
    tc.generateAll(companies);
    const metrics = calculateMetrics(companies, tc.getAll());
    const report = generateFounderReport(companies, tc.getAll(), metrics, { seed: 42 + 6, companyCount: 10 });
    expect(report).toBeDefined();
    expect(report.generatedAt).toBeTruthy();
  });
  it('report optimization-roi has valid structure for 6', () => {
    const companies = seedEnterpriseData(5, 1000 + 6);
    const tc = new TelemetryCollector();
    tc.generateAll(companies);
    const metrics = calculateMetrics(companies, tc.getAll());
    const report = generateFounderReport(companies, tc.getAll(), metrics, { seed: 42 + 6, companyCount: 5 });
    expect(report.scalability).toBeDefined();
    expect(report.bottlenecks).toBeDefined();
    expect(report.costProjection).toBeDefined();
    expect(report.optimization).toBeDefined();
    expect(report.acceptance).toBeDefined();
  });
  it('report optimization-roi scalability for 6', () => {
    const companies = seedEnterpriseData(10, 1100 + 6);
    const tc = new TelemetryCollector();
    tc.generateAll(companies);
    const metrics = calculateMetrics(companies, tc.getAll());
    const report = generateFounderReport(companies, tc.getAll(), metrics, { seed: 42 + 6, companyCount: 10 });
    expect(report.scalability.maxSustainableTenants).toBeGreaterThan(0);
    expect(report.scalability.maxInvoicesPerDay).toBeGreaterThan(0);
  });
  it('report optimization-roi cost projection for 6', () => {
    const companies = seedEnterpriseData(10, 1200 + 6);
    const tc = new TelemetryCollector();
    tc.generateAll(companies);
    const metrics = calculateMetrics(companies, tc.getAll());
    const report = generateFounderReport(companies, tc.getAll(), metrics, { seed: 42 + 6, companyCount: 10 });
    expect(typeof report.costProjection.aiMonthly).toBe('number');
    expect(typeof report.costProjection.awsMonthly.total).toBe('number');
  });
  it('report optimization-roi acceptance criteria for 6', () => {
    const companies = seedEnterpriseData(5, 1300 + 6);
    const tc = new TelemetryCollector();
    tc.generateAll(companies);
    const metrics = calculateMetrics(companies, tc.getAll());
    const report = generateFounderReport(companies, tc.getAll(), metrics, { seed: 42 + 6, companyCount: 5 });
    expect(typeof report.acceptance.allPassed).toBe('boolean');
    expect(Array.isArray(report.acceptance.failures)).toBe(true);
  });

});

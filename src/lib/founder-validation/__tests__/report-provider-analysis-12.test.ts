// @ts-nocheck
import { describe, it, expect } from 'bun:test';
import { seedEnterpriseData, TelemetryCollector, calculateMetrics, generateFounderReport } from '../index';

describe('Report: provider-analysis 12', () => {

  it('report includes provider-analysis for 12', () => {
    const companies = seedEnterpriseData(10, 900 + 12);
    const tc = new TelemetryCollector();
    tc.generateAll(companies);
    const metrics = calculateMetrics(companies, tc.getAll());
    const report = generateFounderReport(companies, tc.getAll(), metrics, { seed: 42 + 12, companyCount: 10 });
    expect(report).toBeDefined();
    expect(report.generatedAt).toBeTruthy();
  });
  it('report provider-analysis has valid structure for 12', () => {
    const companies = seedEnterpriseData(5, 1000 + 12);
    const tc = new TelemetryCollector();
    tc.generateAll(companies);
    const metrics = calculateMetrics(companies, tc.getAll());
    const report = generateFounderReport(companies, tc.getAll(), metrics, { seed: 42 + 12, companyCount: 5 });
    expect(report.scalability).toBeDefined();
    expect(report.bottlenecks).toBeDefined();
    expect(report.costProjection).toBeDefined();
    expect(report.optimization).toBeDefined();
    expect(report.acceptance).toBeDefined();
  });
  it('report provider-analysis scalability for 12', () => {
    const companies = seedEnterpriseData(10, 1100 + 12);
    const tc = new TelemetryCollector();
    tc.generateAll(companies);
    const metrics = calculateMetrics(companies, tc.getAll());
    const report = generateFounderReport(companies, tc.getAll(), metrics, { seed: 42 + 12, companyCount: 10 });
    expect(report.scalability.maxSustainableTenants).toBeGreaterThan(0);
    expect(report.scalability.maxInvoicesPerDay).toBeGreaterThan(0);
  });
  it('report provider-analysis cost projection for 12', () => {
    const companies = seedEnterpriseData(10, 1200 + 12);
    const tc = new TelemetryCollector();
    tc.generateAll(companies);
    const metrics = calculateMetrics(companies, tc.getAll());
    const report = generateFounderReport(companies, tc.getAll(), metrics, { seed: 42 + 12, companyCount: 10 });
    expect(typeof report.costProjection.aiMonthly).toBe('number');
    expect(typeof report.costProjection.awsMonthly.total).toBe('number');
  });
  it('report provider-analysis acceptance criteria for 12', () => {
    const companies = seedEnterpriseData(5, 1300 + 12);
    const tc = new TelemetryCollector();
    tc.generateAll(companies);
    const metrics = calculateMetrics(companies, tc.getAll());
    const report = generateFounderReport(companies, tc.getAll(), metrics, { seed: 42 + 12, companyCount: 5 });
    expect(typeof report.acceptance.allPassed).toBe('boolean');
    expect(Array.isArray(report.acceptance.failures)).toBe(true);
  });

});

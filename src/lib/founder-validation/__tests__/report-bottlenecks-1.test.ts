// @ts-nocheck
import { describe, it, expect } from 'bun:test';
import { seedEnterpriseData, TelemetryCollector, calculateMetrics, generateFounderReport } from '../index';

describe('Report: bottlenecks 1', () => {

  it('report includes bottlenecks for 1', () => {
    const companies = seedEnterpriseData(10, 900 + 1);
    const tc = new TelemetryCollector();
    tc.generateAll(companies);
    const metrics = calculateMetrics(companies, tc.getAll());
    const report = generateFounderReport(companies, tc.getAll(), metrics, { seed: 42 + 1, companyCount: 10 });
    expect(report).toBeDefined();
    expect(report.generatedAt).toBeTruthy();
  });
  it('report bottlenecks has valid structure for 1', () => {
    const companies = seedEnterpriseData(5, 1000 + 1);
    const tc = new TelemetryCollector();
    tc.generateAll(companies);
    const metrics = calculateMetrics(companies, tc.getAll());
    const report = generateFounderReport(companies, tc.getAll(), metrics, { seed: 42 + 1, companyCount: 5 });
    expect(report.scalability).toBeDefined();
    expect(report.bottlenecks).toBeDefined();
    expect(report.costProjection).toBeDefined();
    expect(report.optimization).toBeDefined();
    expect(report.acceptance).toBeDefined();
  });
  it('report bottlenecks scalability for 1', () => {
    const companies = seedEnterpriseData(10, 1100 + 1);
    const tc = new TelemetryCollector();
    tc.generateAll(companies);
    const metrics = calculateMetrics(companies, tc.getAll());
    const report = generateFounderReport(companies, tc.getAll(), metrics, { seed: 42 + 1, companyCount: 10 });
    expect(report.scalability.maxSustainableTenants).toBeGreaterThan(0);
    expect(report.scalability.maxInvoicesPerDay).toBeGreaterThan(0);
  });
  it('report bottlenecks cost projection for 1', () => {
    const companies = seedEnterpriseData(10, 1200 + 1);
    const tc = new TelemetryCollector();
    tc.generateAll(companies);
    const metrics = calculateMetrics(companies, tc.getAll());
    const report = generateFounderReport(companies, tc.getAll(), metrics, { seed: 42 + 1, companyCount: 10 });
    expect(typeof report.costProjection.estimatedAICostMonthly).toBe('number');
    expect(typeof report.costProjection.estimatedAWSCostMonthly).toBe('number');
  });
  it('report bottlenecks acceptance criteria for 1', () => {
    const companies = seedEnterpriseData(5, 1300 + 1);
    const tc = new TelemetryCollector();
    tc.generateAll(companies);
    const metrics = calculateMetrics(companies, tc.getAll());
    const report = generateFounderReport(companies, tc.getAll(), metrics, { seed: 42 + 1, companyCount: 5 });
    expect(typeof report.acceptance.allTestsPass).toBe('boolean');
    expect(typeof report.acceptance.zeroDataCorruption).toBe('boolean');
  });

});

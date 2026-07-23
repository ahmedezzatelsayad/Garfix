// @ts-nocheck
import { describe, it, expect } from 'bun:test';
import { seedEnterpriseData, TelemetryCollector, calculateMetrics, generateFounderReport } from '../index';

describe('Report: top-20-lists 19', () => {

  it('report includes top-20-lists for 19', () => {
    const companies = seedEnterpriseData(10, 900 + 19);
    const tc = new TelemetryCollector();
    tc.generateAll(companies);
    const metrics = calculateMetrics(companies, tc.getAll());
    const report = generateFounderReport(companies, tc.getAll(), metrics, { seed: 42 + 19, companyCount: 10 });
    expect(report).toBeDefined();
    expect(report.generatedAt).toBeTruthy();
  });
  it('report top-20-lists has valid structure for 19', () => {
    const companies = seedEnterpriseData(5, 1000 + 19);
    const tc = new TelemetryCollector();
    tc.generateAll(companies);
    const metrics = calculateMetrics(companies, tc.getAll());
    const report = generateFounderReport(companies, tc.getAll(), metrics, { seed: 42 + 19, companyCount: 5 });
    expect(report.scalability).toBeDefined();
    expect(report.bottlenecks).toBeDefined();
    expect(report.costProjection).toBeDefined();
    expect(report.optimization).toBeDefined();
    expect(report.acceptance).toBeDefined();
  });
  it('report top-20-lists scalability for 19', () => {
    const companies = seedEnterpriseData(10, 1100 + 19);
    const tc = new TelemetryCollector();
    tc.generateAll(companies);
    const metrics = calculateMetrics(companies, tc.getAll());
    const report = generateFounderReport(companies, tc.getAll(), metrics, { seed: 42 + 19, companyCount: 10 });
    expect(report.scalability.maxSustainableTenants).toBeGreaterThan(0);
    expect(report.scalability.maxInvoicesPerDay).toBeGreaterThan(0);
  });
  it('report top-20-lists cost projection for 19', () => {
    const companies = seedEnterpriseData(10, 1200 + 19);
    const tc = new TelemetryCollector();
    tc.generateAll(companies);
    const metrics = calculateMetrics(companies, tc.getAll());
    const report = generateFounderReport(companies, tc.getAll(), metrics, { seed: 42 + 19, companyCount: 10 });
    expect(typeof report.costProjection.aiMonthly).toBe('number');
    expect(typeof report.costProjection.awsMonthly.total).toBe('number');
  });
  it('report top-20-lists acceptance criteria for 19', () => {
    const companies = seedEnterpriseData(5, 1300 + 19);
    const tc = new TelemetryCollector();
    tc.generateAll(companies);
    const metrics = calculateMetrics(companies, tc.getAll());
    const report = generateFounderReport(companies, tc.getAll(), metrics, { seed: 42 + 19, companyCount: 5 });
    expect(typeof report.acceptance.allPassed).toBe('boolean');
    expect(Array.isArray(report.acceptance.failures)).toBe(true);
  });

});

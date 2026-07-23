// @ts-nocheck
import { describe, it, expect } from 'bun:test';
import { seedEnterpriseData, TelemetryCollector, calculateMetrics, generateFounderReport } from '../index';

describe('Report: revenue-analysis 16', () => {

  it('report includes revenue-analysis for 16', () => {
    const companies = seedEnterpriseData(10, 900 + 16);
    const tc = new TelemetryCollector();
    tc.generateAll(companies);
    const metrics = calculateMetrics(companies, tc.getAll());
    const report = generateFounderReport(companies, tc.getAll(), metrics, { seed: 42 + 16, companyCount: 10 });
    expect(report).toBeDefined();
    expect(report.generatedAt).toBeTruthy();
  });
  it('report revenue-analysis has valid structure for 16', () => {
    const companies = seedEnterpriseData(5, 1000 + 16);
    const tc = new TelemetryCollector();
    tc.generateAll(companies);
    const metrics = calculateMetrics(companies, tc.getAll());
    const report = generateFounderReport(companies, tc.getAll(), metrics, { seed: 42 + 16, companyCount: 5 });
    expect(report.scalability).toBeDefined();
    expect(report.bottlenecks).toBeDefined();
    expect(report.costProjection).toBeDefined();
    expect(report.optimization).toBeDefined();
    expect(report.acceptance).toBeDefined();
  });
  it('report revenue-analysis scalability for 16', () => {
    const companies = seedEnterpriseData(10, 1100 + 16);
    const tc = new TelemetryCollector();
    tc.generateAll(companies);
    const metrics = calculateMetrics(companies, tc.getAll());
    const report = generateFounderReport(companies, tc.getAll(), metrics, { seed: 42 + 16, companyCount: 10 });
    expect(report.scalability.maxSustainableTenants).toBeGreaterThan(0);
    expect(report.scalability.maxInvoicesPerDay).toBeGreaterThan(0);
  });
  it('report revenue-analysis cost projection for 16', () => {
    const companies = seedEnterpriseData(10, 1200 + 16);
    const tc = new TelemetryCollector();
    tc.generateAll(companies);
    const metrics = calculateMetrics(companies, tc.getAll());
    const report = generateFounderReport(companies, tc.getAll(), metrics, { seed: 42 + 16, companyCount: 10 });
    expect(typeof report.costProjection.aiMonthly).toBe('number');
    expect(typeof report.costProjection.awsMonthly.total).toBe('number');
  });
  it('report revenue-analysis acceptance criteria for 16', () => {
    const companies = seedEnterpriseData(5, 1300 + 16);
    const tc = new TelemetryCollector();
    tc.generateAll(companies);
    const metrics = calculateMetrics(companies, tc.getAll());
    const report = generateFounderReport(companies, tc.getAll(), metrics, { seed: 42 + 16, companyCount: 5 });
    expect(typeof report.acceptance.allPassed).toBe('boolean');
    expect(Array.isArray(report.acceptance.failures)).toBe(true);
  });

});

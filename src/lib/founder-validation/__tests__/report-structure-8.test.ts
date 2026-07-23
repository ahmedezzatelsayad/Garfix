// @ts-nocheck
import { describe, it, expect } from 'bun:test';
import { seedEnterpriseData, TelemetryCollector, calculateMetrics, generateFounderReport } from '../index';

describe('Report: structure 8', () => {

  it('report includes structure for 8', () => {
    const companies = seedEnterpriseData(10, 900 + 8);
    const tc = new TelemetryCollector();
    tc.generateAll(companies);
    const metrics = calculateMetrics(companies, tc.getAll());
    const report = generateFounderReport(companies, tc.getAll(), metrics, { seed: 42 + 8, companyCount: 10 });
    expect(report).toBeDefined();
    expect(report.generatedAt).toBeTruthy();
  });
  it('report structure has valid structure for 8', () => {
    const companies = seedEnterpriseData(5, 1000 + 8);
    const tc = new TelemetryCollector();
    tc.generateAll(companies);
    const metrics = calculateMetrics(companies, tc.getAll());
    const report = generateFounderReport(companies, tc.getAll(), metrics, { seed: 42 + 8, companyCount: 5 });
    expect(report.scalability).toBeDefined();
    expect(report.bottlenecks).toBeDefined();
    expect(report.costProjection).toBeDefined();
    expect(report.optimization).toBeDefined();
    expect(report.acceptance).toBeDefined();
  });
  it('report structure scalability for 8', () => {
    const companies = seedEnterpriseData(10, 1100 + 8);
    const tc = new TelemetryCollector();
    tc.generateAll(companies);
    const metrics = calculateMetrics(companies, tc.getAll());
    const report = generateFounderReport(companies, tc.getAll(), metrics, { seed: 42 + 8, companyCount: 10 });
    expect(report.scalability.maxSustainableTenants).toBeGreaterThan(0);
    expect(report.scalability.maxInvoicesPerDay).toBeGreaterThan(0);
  });
  it('report structure cost projection for 8', () => {
    const companies = seedEnterpriseData(10, 1200 + 8);
    const tc = new TelemetryCollector();
    tc.generateAll(companies);
    const metrics = calculateMetrics(companies, tc.getAll());
    const report = generateFounderReport(companies, tc.getAll(), metrics, { seed: 42 + 8, companyCount: 10 });
    expect(typeof report.costProjection.aiMonthly).toBe('number');
    expect(typeof report.costProjection.awsMonthly).toBeDefined();
  });
  it('report structure acceptance criteria for 8', () => {
    const companies = seedEnterpriseData(5, 1300 + 8);
    const tc = new TelemetryCollector();
    tc.generateAll(companies);
    const metrics = calculateMetrics(companies, tc.getAll());
    const report = generateFounderReport(companies, tc.getAll(), metrics, { seed: 42 + 8, companyCount: 5 });
    expect(typeof report.acceptance.allPassed).toBe('boolean');
    expect(report.acceptance.failures).toBeDefined();
  });

});

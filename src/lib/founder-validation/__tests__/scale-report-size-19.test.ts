// @ts-nocheck
import { describe, it, expect } from 'bun:test';
import { seedEnterpriseData, TelemetryCollector, calculateMetrics, generateFounderReport } from '../index';
describe('Scale: report-size 19', () => {
  it('scale report-size generates valid data for 19', () => { const c = seedEnterpriseData(10, 3000+19); expect(c.length).toBe(10); });
  it('scale report-size has proportional volume for 19', () => { const c = seedEnterpriseData(100, 3100+19); expect(c.length).toBe(100); });
  it('scale report-size no ID collisions at scale for 19', () => { const c = seedEnterpriseData(50, 3200+19); const ids = new Set(c.map(x=>x.id)); expect(ids.size).toBe(50); });
  it('scale report-size metrics calculate at scale for 19', () => { const c = seedEnterpriseData(50, 3300+19); const tc = new TelemetryCollector(); tc.generateAll(c); const m = calculateMetrics(c, tc.getAll()); expect(m.totalCompanies).toBe(50); });
  it('scale report-size report generates at scale for 19', () => { const c = seedEnterpriseData(20, 3400+19); const tc = new TelemetryCollector(); tc.generateAll(c); const m = calculateMetrics(c, tc.getAll()); const r = generateFounderReport(c, tc.getAll(), m, {seed:42+19, companyCount:20}); expect(r).toBeDefined(); });
});

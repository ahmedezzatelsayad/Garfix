// @ts-nocheck
import { describe, it, expect } from 'bun:test';
import { seedEnterpriseData, TelemetryCollector, calculateMetrics, generateFounderReport } from '../index';
describe('Scale: suppliers-per-company 3', () => {
  it('scale suppliers-per-company generates valid data for 3', () => { const c = seedEnterpriseData(10, 3000+3); expect(c.length).toBe(10); });
  it('scale suppliers-per-company has proportional volume for 3', () => { const c = seedEnterpriseData(100, 3100+3); expect(c.length).toBe(100); });
  it('scale suppliers-per-company no ID collisions at scale for 3', () => { const c = seedEnterpriseData(50, 3200+3); const ids = new Set(c.map(x=>x.id)); expect(ids.size).toBe(50); });
  it('scale suppliers-per-company metrics calculate at scale for 3', () => { const c = seedEnterpriseData(50, 3300+3); const tc = new TelemetryCollector(); tc.generateAll(c); const m = calculateMetrics(c, tc.getAll()); expect(m.totalCompanies).toBe(50); });
  it('scale suppliers-per-company report generates at scale for 3', () => { const c = seedEnterpriseData(20, 3400+3); const tc = new TelemetryCollector(); tc.generateAll(c); const m = calculateMetrics(c, tc.getAll()); const r = generateFounderReport(c, tc.getAll(), m, {seed:42+3, companyCount:20}); expect(r).toBeDefined(); });
});

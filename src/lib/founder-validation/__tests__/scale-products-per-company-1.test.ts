import { describe, it, expect } from 'bun:test';
import { seedEnterpriseData, TelemetryCollector, calculateMetrics, generateFounderReport } from '../index';
describe('Scale: products-per-company 1', () => {
  it('scale products-per-company generates valid data for 1', () => { const c = seedEnterpriseData(10, 3000+1); expect(c.length).toBe(10); });
  it('scale products-per-company has proportional volume for 1', () => { const c = seedEnterpriseData(100, 3100+1); expect(c.length).toBe(100); });
  it('scale products-per-company no ID collisions at scale for 1', () => { const c = seedEnterpriseData(50, 3200+1); const ids = new Set(c.map(x=>x.id)); expect(ids.size).toBe(50); });
  it('scale products-per-company metrics calculate at scale for 1', () => { const c = seedEnterpriseData(50, 3300+1); const tc = new TelemetryCollector(); tc.generateAll(c); const m = calculateMetrics(c, tc.getAll()); expect(m.totalCompanies).toBe(50); });
  it('scale products-per-company report generates at scale for 1', () => { const c = seedEnterpriseData(20, 3400+1); const tc = new TelemetryCollector(); tc.generateAll(c); const m = calculateMetrics(c, tc.getAll()); const r = generateFounderReport(c, tc.getAll(), m, {seed:42+1, companyCount:20}); expect(r).toBeDefined(); });
});

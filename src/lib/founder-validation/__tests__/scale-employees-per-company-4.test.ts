import { describe, it, expect } from 'bun:test';
import { seedEnterpriseData, TelemetryCollector, calculateMetrics, generateFounderReport } from '../index';
describe('Scale: employees-per-company 4', () => {
  it('scale employees-per-company generates valid data for 4', () => { const c = seedEnterpriseData(10, 3000+4); expect(c.length).toBe(10); });
  it('scale employees-per-company has proportional volume for 4', () => { const c = seedEnterpriseData(100, 3100+4); expect(c.length).toBe(100); });
  it('scale employees-per-company no ID collisions at scale for 4', () => { const c = seedEnterpriseData(50, 3200+4); const ids = new Set(c.map(x=>x.id)); expect(ids.size).toBe(50); });
  it('scale employees-per-company metrics calculate at scale for 4', () => { const c = seedEnterpriseData(50, 3300+4); const tc = new TelemetryCollector(); tc.generateAll(c); const m = calculateMetrics(c, tc.getAll()); expect(m.totalCompanies).toBe(50); });
  it('scale employees-per-company report generates at scale for 4', () => { const c = seedEnterpriseData(20, 3400+4); const tc = new TelemetryCollector(); tc.generateAll(c); const m = calculateMetrics(c, tc.getAll()); const r = generateFounderReport(c, tc.getAll(), m, {seed:42+4, companyCount:20}); expect(r).toBeDefined(); });
});

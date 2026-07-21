import { describe, it, expect } from 'bun:test';
import { seedEnterpriseData, TelemetryCollector, calculateMetrics, generateFounderReport } from '../index';
describe('Scale: customers-per-company 2', () => {
  it('scale customers-per-company generates valid data for 2', () => { const c = seedEnterpriseData(10, 3000+2); expect(c.length).toBe(10); });
  it('scale customers-per-company has proportional volume for 2', () => { const c = seedEnterpriseData(100, 3100+2); expect(c.length).toBe(100); });
  it('scale customers-per-company no ID collisions at scale for 2', () => { const c = seedEnterpriseData(50, 3200+2); const ids = new Set(c.map(x=>x.id)); expect(ids.size).toBe(50); });
  it('scale customers-per-company metrics calculate at scale for 2', () => { const c = seedEnterpriseData(50, 3300+2); const tc = new TelemetryCollector(); tc.generateAll(c); const m = calculateMetrics(c, tc.getAll()); expect(m.totalCompanies).toBe(50); });
  it('scale customers-per-company report generates at scale for 2', () => { const c = seedEnterpriseData(20, 3400+2); const tc = new TelemetryCollector(); tc.generateAll(c); const m = calculateMetrics(c, tc.getAll()); const r = generateFounderReport(c, tc.getAll(), m, {seed:42+2, companyCount:20}); expect(r).toBeDefined(); });
});

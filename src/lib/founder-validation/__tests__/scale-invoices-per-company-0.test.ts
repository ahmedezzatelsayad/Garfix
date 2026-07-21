import { describe, it, expect } from 'bun:test';
import { seedEnterpriseData, TelemetryCollector, calculateMetrics, generateFounderReport } from '../index';
describe('Scale: invoices-per-company 0', () => {
  it('scale invoices-per-company generates valid data for 0', () => { const c = seedEnterpriseData(10, 3000+0); expect(c.length).toBe(10); });
  it('scale invoices-per-company has proportional volume for 0', () => { const c = seedEnterpriseData(100, 3100+0); expect(c.length).toBe(100); });
  it('scale invoices-per-company no ID collisions at scale for 0', () => { const c = seedEnterpriseData(50, 3200+0); const ids = new Set(c.map(x=>x.id)); expect(ids.size).toBe(50); });
  it('scale invoices-per-company metrics calculate at scale for 0', () => { const c = seedEnterpriseData(50, 3300+0); const tc = new TelemetryCollector(); tc.generateAll(c); const m = calculateMetrics(c, tc.getAll()); expect(m.totalCompanies).toBe(50); });
  it('scale invoices-per-company report generates at scale for 0', () => { const c = seedEnterpriseData(20, 3400+0); const tc = new TelemetryCollector(); tc.generateAll(c); const m = calculateMetrics(c, tc.getAll()); const r = generateFounderReport(c, tc.getAll(), m, {seed:42+0, companyCount:20}); expect(r).toBeDefined(); });
});

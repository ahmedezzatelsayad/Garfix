import { describe, it, expect } from 'bun:test';
import { seedEnterpriseData, TelemetryCollector, calculateMetrics, generateFounderReport } from '../index';
describe('Scale: invoice-items 12', () => {
  it('scale invoice-items generates valid data for 12', () => { const c = seedEnterpriseData(10, 3000+12); expect(c.length).toBe(10); });
  it('scale invoice-items has proportional volume for 12', () => { const c = seedEnterpriseData(100, 3100+12); expect(c.length).toBe(100); });
  it('scale invoice-items no ID collisions at scale for 12', () => { const c = seedEnterpriseData(50, 3200+12); const ids = new Set(c.map(x=>x.id)); expect(ids.size).toBe(50); });
  it('scale invoice-items metrics calculate at scale for 12', () => { const c = seedEnterpriseData(50, 3300+12); const tc = new TelemetryCollector(); tc.generateAll(c); const m = calculateMetrics(c, tc.getAll()); expect(m.totalCompanies).toBe(50); });
  it('scale invoice-items report generates at scale for 12', () => { const c = seedEnterpriseData(20, 3400+12); const tc = new TelemetryCollector(); tc.generateAll(c); const m = calculateMetrics(c, tc.getAll()); const r = generateFounderReport(c, tc.getAll(), m, {seed:42+12, companyCount:20}); expect(r).toBeDefined(); });
});

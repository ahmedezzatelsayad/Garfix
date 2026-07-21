import { describe, it, expect } from 'bun:test';
import { seedEnterpriseData, TelemetryCollector, calculateMetrics, generateFounderReport } from '../index';
describe('Scale: tokens-total 7', () => {
  it('scale tokens-total generates valid data for 7', () => { const c = seedEnterpriseData(10, 3000+7); expect(c.length).toBe(10); });
  it('scale tokens-total has proportional volume for 7', () => { const c = seedEnterpriseData(100, 3100+7); expect(c.length).toBe(100); });
  it('scale tokens-total no ID collisions at scale for 7', () => { const c = seedEnterpriseData(50, 3200+7); const ids = new Set(c.map(x=>x.id)); expect(ids.size).toBe(50); });
  it('scale tokens-total metrics calculate at scale for 7', () => { const c = seedEnterpriseData(50, 3300+7); const tc = new TelemetryCollector(); tc.generateAll(c); const m = calculateMetrics(c, tc.getAll()); expect(m.totalCompanies).toBe(50); });
  it('scale tokens-total report generates at scale for 7', () => { const c = seedEnterpriseData(20, 3400+7); const tc = new TelemetryCollector(); tc.generateAll(c); const m = calculateMetrics(c, tc.getAll()); const r = generateFounderReport(c, tc.getAll(), m, {seed:42+7, companyCount:20}); expect(r).toBeDefined(); });
});

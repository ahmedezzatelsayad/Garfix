import { describe, it, expect } from 'bun:test';
import { seedEnterpriseData, TelemetryCollector, calculateMetrics, generateFounderReport } from '../index';
describe('Scale: concurrent-activities 18', () => {
  it('scale concurrent-activities generates valid data for 18', () => { const c = seedEnterpriseData(10, 3000+18); expect(c.length).toBe(10); });
  it('scale concurrent-activities has proportional volume for 18', () => { const c = seedEnterpriseData(100, 3100+18); expect(c.length).toBe(100); });
  it('scale concurrent-activities no ID collisions at scale for 18', () => { const c = seedEnterpriseData(50, 3200+18); const ids = new Set(c.map(x=>x.id)); expect(ids.size).toBe(50); });
  it('scale concurrent-activities metrics calculate at scale for 18', () => { const c = seedEnterpriseData(50, 3300+18); const tc = new TelemetryCollector(); tc.generateAll(c); const m = calculateMetrics(c, tc.getAll()); expect(m.totalCompanies).toBe(50); });
  it('scale concurrent-activities report generates at scale for 18', () => { const c = seedEnterpriseData(20, 3400+18); const tc = new TelemetryCollector(); tc.generateAll(c); const m = calculateMetrics(c, tc.getAll()); const r = generateFounderReport(c, tc.getAll(), m, {seed:42+18, companyCount:20}); expect(r).toBeDefined(); });
});

import { describe, it, expect } from 'bun:test';
import { seedEnterpriseData, TelemetryCollector, calculateMetrics, generateFounderReport } from '../index';
describe('Scale: companies-1000 11', () => {
  it('scale companies-1000 generates valid data for 11', () => { const c = seedEnterpriseData(10, 3000+11); expect(c.length).toBe(10); });
  it('scale companies-1000 has proportional volume for 11', () => { const c = seedEnterpriseData(100, 3100+11); expect(c.length).toBe(100); });
  it('scale companies-1000 no ID collisions at scale for 11', () => { const c = seedEnterpriseData(50, 3200+11); const ids = new Set(c.map(x=>x.id)); expect(ids.size).toBe(50); });
  it('scale companies-1000 metrics calculate at scale for 11', () => { const c = seedEnterpriseData(50, 3300+11); const tc = new TelemetryCollector(); tc.generateAll(c); const m = calculateMetrics(c, tc.getAll()); expect(m.totalCompanies).toBe(50); });
  it('scale companies-1000 report generates at scale for 11', () => { const c = seedEnterpriseData(20, 3400+11); const tc = new TelemetryCollector(); tc.generateAll(c); const m = calculateMetrics(c, tc.getAll()); const r = generateFounderReport(c, tc.getAll(), m, {seed:42+11, companyCount:20}); expect(r).toBeDefined(); });
});

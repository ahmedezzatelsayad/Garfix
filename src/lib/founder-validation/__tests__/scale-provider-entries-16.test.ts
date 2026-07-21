import { describe, it, expect } from 'bun:test';
import { seedEnterpriseData, TelemetryCollector, calculateMetrics, generateFounderReport } from '../index';
describe('Scale: provider-entries 16', () => {
  it('scale provider-entries generates valid data for 16', () => { const c = seedEnterpriseData(10, 3000+16); expect(c.length).toBe(10); });
  it('scale provider-entries has proportional volume for 16', () => { const c = seedEnterpriseData(100, 3100+16); expect(c.length).toBe(100); });
  it('scale provider-entries no ID collisions at scale for 16', () => { const c = seedEnterpriseData(50, 3200+16); const ids = new Set(c.map(x=>x.id)); expect(ids.size).toBe(50); });
  it('scale provider-entries metrics calculate at scale for 16', () => { const c = seedEnterpriseData(50, 3300+16); const tc = new TelemetryCollector(); tc.generateAll(c); const m = calculateMetrics(c, tc.getAll()); expect(m.totalCompanies).toBe(50); });
  it('scale provider-entries report generates at scale for 16', () => { const c = seedEnterpriseData(20, 3400+16); const tc = new TelemetryCollector(); tc.generateAll(c); const m = calculateMetrics(c, tc.getAll()); const r = generateFounderReport(c, tc.getAll(), m, {seed:42+16, companyCount:20}); expect(r).toBeDefined(); });
});

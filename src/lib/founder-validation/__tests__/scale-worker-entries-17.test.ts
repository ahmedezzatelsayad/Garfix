import { describe, it, expect } from 'bun:test';
import { seedEnterpriseData, TelemetryCollector, calculateMetrics, generateFounderReport } from '../index';
describe('Scale: worker-entries 17', () => {
  it('scale worker-entries generates valid data for 17', () => { const c = seedEnterpriseData(10, 3000+17); expect(c.length).toBe(10); });
  it('scale worker-entries has proportional volume for 17', () => { const c = seedEnterpriseData(100, 3100+17); expect(c.length).toBe(100); });
  it('scale worker-entries no ID collisions at scale for 17', () => { const c = seedEnterpriseData(50, 3200+17); const ids = new Set(c.map(x=>x.id)); expect(ids.size).toBe(50); });
  it('scale worker-entries metrics calculate at scale for 17', () => { const c = seedEnterpriseData(50, 3300+17); const tc = new TelemetryCollector(); tc.generateAll(c); const m = calculateMetrics(c, tc.getAll()); expect(m.totalCompanies).toBe(50); });
  it('scale worker-entries report generates at scale for 17', () => { const c = seedEnterpriseData(20, 3400+17); const tc = new TelemetryCollector(); tc.generateAll(c); const m = calculateMetrics(c, tc.getAll()); const r = generateFounderReport(c, tc.getAll(), m, {seed:42+17, companyCount:20}); expect(r).toBeDefined(); });
});

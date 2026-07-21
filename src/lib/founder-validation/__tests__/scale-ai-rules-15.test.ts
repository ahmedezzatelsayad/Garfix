import { describe, it, expect } from 'bun:test';
import { seedEnterpriseData, TelemetryCollector, calculateMetrics, generateFounderReport } from '../index';
describe('Scale: ai-rules 15', () => {
  it('scale ai-rules generates valid data for 15', () => { const c = seedEnterpriseData(10, 3000+15); expect(c.length).toBe(10); });
  it('scale ai-rules has proportional volume for 15', () => { const c = seedEnterpriseData(100, 3100+15); expect(c.length).toBe(100); });
  it('scale ai-rules no ID collisions at scale for 15', () => { const c = seedEnterpriseData(50, 3200+15); const ids = new Set(c.map(x=>x.id)); expect(ids.size).toBe(50); });
  it('scale ai-rules metrics calculate at scale for 15', () => { const c = seedEnterpriseData(50, 3300+15); const tc = new TelemetryCollector(); tc.generateAll(c); const m = calculateMetrics(c, tc.getAll()); expect(m.totalCompanies).toBe(50); });
  it('scale ai-rules report generates at scale for 15', () => { const c = seedEnterpriseData(20, 3400+15); const tc = new TelemetryCollector(); tc.generateAll(c); const m = calculateMetrics(c, tc.getAll()); const r = generateFounderReport(c, tc.getAll(), m, {seed:42+15, companyCount:20}); expect(r).toBeDefined(); });
});

// @ts-nocheck
import { describe, it, expect } from 'bun:test';
import { seedEnterpriseData, TelemetryCollector, calculateMetrics, generateFounderReport } from '../index';
describe('Scale: companies-100 10', () => {
  it('scale companies-100 generates valid data for 10', () => { const c = seedEnterpriseData(10, 3000+10); expect(c.length).toBe(10); });
  it('scale companies-100 has proportional volume for 10', () => { const c = seedEnterpriseData(100, 3100+10); expect(c.length).toBe(100); });
  it('scale companies-100 no ID collisions at scale for 10', () => { const c = seedEnterpriseData(50, 3200+10); const ids = new Set(c.map(x=>x.id)); expect(ids.size).toBe(50); });
  it('scale companies-100 metrics calculate at scale for 10', () => { const c = seedEnterpriseData(50, 3300+10); const tc = new TelemetryCollector(); tc.generateAll(c); const m = calculateMetrics(c, tc.getAll()); expect(m.totalCompanies).toBe(50); });
  it('scale companies-100 report generates at scale for 10', () => { const c = seedEnterpriseData(20, 3400+10); const tc = new TelemetryCollector(); tc.generateAll(c); const m = calculateMetrics(c, tc.getAll()); const r = generateFounderReport(c, tc.getAll(), m, {seed:42+10, companyCount:20}); expect(r).toBeDefined(); });
});

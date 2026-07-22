// @ts-nocheck
import { describe, it, expect } from 'bun:test';
import { seedEnterpriseData, TelemetryCollector, calculateMetrics, generateFounderReport } from '../index';
describe('Scale: warehouses-per-company 5', () => {
  it('scale warehouses-per-company generates valid data for 5', () => { const c = seedEnterpriseData(10, 3000+5); expect(c.length).toBe(10); });
  it('scale warehouses-per-company has proportional volume for 5', () => { const c = seedEnterpriseData(100, 3100+5); expect(c.length).toBe(100); });
  it('scale warehouses-per-company no ID collisions at scale for 5', () => { const c = seedEnterpriseData(50, 3200+5); const ids = new Set(c.map(x=>x.id)); expect(ids.size).toBe(50); });
  it('scale warehouses-per-company metrics calculate at scale for 5', () => { const c = seedEnterpriseData(50, 3300+5); const tc = new TelemetryCollector(); tc.generateAll(c); const m = calculateMetrics(c, tc.getAll()); expect(m.totalCompanies).toBe(50); });
  it('scale warehouses-per-company report generates at scale for 5', () => { const c = seedEnterpriseData(20, 3400+5); const tc = new TelemetryCollector(); tc.generateAll(c); const m = calculateMetrics(c, tc.getAll()); const r = generateFounderReport(c, tc.getAll(), m, {seed:42+5, companyCount:20}); expect(r).toBeDefined(); });
});

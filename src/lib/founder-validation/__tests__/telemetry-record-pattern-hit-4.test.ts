import { describe, it, expect } from 'bun:test';
import { TelemetryCollector, seedEnterpriseData } from '../index';

describe('Telemetry: record-pattern-hit 4', () => {

  it('telemetry record-pattern-hit works for 4', () => {
    const tc = new TelemetryCollector();
    const companies = seedEnterpriseData(5, 500 + 4);
    tc.generateAll(companies);
    expect(tc.size).toBeGreaterThan(0);
  });
  it('telemetry record-pattern-hit handles empty for 4', () => {
    const tc = new TelemetryCollector();
    expect(tc.size).toBe(0);
    expect(tc.getAll()).toEqual([]);
  });
  it('telemetry record-pattern-hit filters correctly for 4', () => {
    const tc = new TelemetryCollector();
    const companies = seedEnterpriseData(5, 600 + 4);
    tc.generateAll(companies);
    const all = tc.getAll();
    if (all.length > 0) {
      const tenant = all[0].tenantId;
      const filtered = tc.getByTenant(tenant);
      for (const e of filtered) {
        expect(e.tenantId).toBe(tenant);
      }
    }
  });
  it('telemetry record-pattern-hit calculates totals for 4', () => {
    const tc = new TelemetryCollector();
    const companies = seedEnterpriseData(3, 700 + 4);
    tc.generateAll(companies);
    const entries = tc.getAll();
    const totalTokens = entries.reduce((s, e) => s + e.totalTokens, 0);
    expect(totalTokens).toBeGreaterThan(0);
  });
  it('telemetry record-pattern-hit JSON roundtrip for 4', () => {
    const tc = new TelemetryCollector();
    const companies = seedEnterpriseData(2, 800 + 4);
    tc.generateAll(companies);
    const json = JSON.stringify(tc.getAll());
    const parsed = JSON.parse(json);
    expect(parsed.length).toBe(tc.size);
  });

});

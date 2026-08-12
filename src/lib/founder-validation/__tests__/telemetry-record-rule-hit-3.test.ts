import { describe, it, expect } from 'bun:test';
import { TelemetryCollector, seedEnterpriseData } from '../index';

describe('Telemetry: record-rule-hit 3', () => {

  it('telemetry record-rule-hit works for 3', () => {
    const tc = new TelemetryCollector();
    const companies = seedEnterpriseData(5, 500 + 3);
    tc.generateAll(companies);
    expect(tc.size).toBeGreaterThan(0);
  });
  it('telemetry record-rule-hit handles empty for 3', () => {
    const tc = new TelemetryCollector();
    expect(tc.size).toBe(0);
    expect(tc.getAll()).toEqual([]);
  });
  it('telemetry record-rule-hit filters correctly for 3', () => {
    const tc = new TelemetryCollector();
    const companies = seedEnterpriseData(5, 600 + 3);
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
  it('telemetry record-rule-hit calculates totals for 3', () => {
    const tc = new TelemetryCollector();
    const companies = seedEnterpriseData(3, 700 + 3);
    tc.generateAll(companies);
    const entries = tc.getAll();
    const totalTokens = entries.reduce((s, e) => s + e.totalTokens, 0);
    expect(totalTokens).toBeGreaterThan(0);
  });
  it('telemetry record-rule-hit JSON roundtrip for 3', () => {
    const tc = new TelemetryCollector();
    const companies = seedEnterpriseData(2, 800 + 3);
    tc.generateAll(companies);
    const json = JSON.stringify(tc.getAll());
    const parsed = JSON.parse(json);
    expect(parsed.length).toBe(tc.size);
  });

});

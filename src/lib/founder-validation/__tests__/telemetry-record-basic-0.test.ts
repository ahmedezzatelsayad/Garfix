import { describe, it, expect } from 'bun:test';
import { TelemetryCollector, seedEnterpriseData } from '../index';

describe('Telemetry: record-basic 0', () => {

  it('telemetry record-basic works for 0', () => {
    const tc = new TelemetryCollector();
    const companies = seedEnterpriseData(5, 500 + 0);
    tc.generateAll(companies);
    expect(tc.size).toBeGreaterThan(0);
  });
  it('telemetry record-basic handles empty for 0', () => {
    const tc = new TelemetryCollector();
    expect(tc.size).toBe(0);
    expect(tc.getAll()).toEqual([]);
  });
  it('telemetry record-basic filters correctly for 0', () => {
    const tc = new TelemetryCollector();
    const companies = seedEnterpriseData(5, 600 + 0);
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
  it('telemetry record-basic calculates totals for 0', () => {
    const tc = new TelemetryCollector();
    const companies = seedEnterpriseData(3, 700 + 0);
    tc.generateAll(companies);
    const entries = tc.getAll();
    const totalTokens = entries.reduce((s, e) => s + e.totalTokens, 0);
    expect(totalTokens).toBeGreaterThan(0);
  });
  it('telemetry record-basic JSON roundtrip for 0', () => {
    const tc = new TelemetryCollector();
    const companies = seedEnterpriseData(2, 800 + 0);
    tc.generateAll(companies);
    const json = JSON.stringify(tc.getAll());
    const parsed = JSON.parse(json);
    expect(parsed.length).toBe(tc.size);
  });

});

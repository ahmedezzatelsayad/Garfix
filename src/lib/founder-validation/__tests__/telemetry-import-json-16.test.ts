import { describe, it, expect } from 'bun:test';
import { TelemetryCollector, seedEnterpriseData } from '../index';

describe('Telemetry: import-json 16', () => {

  it('telemetry import-json works for 16', () => {
    const tc = new TelemetryCollector();
    const companies = seedEnterpriseData(5, 500 + 16);
    tc.generateAll(companies);
    expect(tc.size).toBeGreaterThan(0);
  });
  it('telemetry import-json handles empty for 16', () => {
    const tc = new TelemetryCollector();
    expect(tc.size).toBe(0);
    expect(tc.getAll()).toEqual([]);
  });
  it('telemetry import-json filters correctly for 16', () => {
    const tc = new TelemetryCollector();
    const companies = seedEnterpriseData(5, 600 + 16);
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
  it('telemetry import-json calculates totals for 16', () => {
    const tc = new TelemetryCollector();
    const companies = seedEnterpriseData(3, 700 + 16);
    tc.generateAll(companies);
    const entries = tc.getAll();
    const totalTokens = entries.reduce((s, e) => s + e.totalTokens, 0);
    expect(totalTokens).toBeGreaterThan(0);
  });
  it('telemetry import-json JSON roundtrip for 16', () => {
    const tc = new TelemetryCollector();
    const companies = seedEnterpriseData(2, 800 + 16);
    tc.generateAll(companies);
    const json = JSON.stringify(tc.getAll());
    const parsed = JSON.parse(json);
    expect(parsed.length).toBe(tc.size);
  });

});

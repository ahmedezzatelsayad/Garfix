import { describe, it, expect } from 'bun:test';
import { TelemetryCollector, seedEnterpriseData } from '../index';

describe('Telemetry: record-retry 6', () => {

  it('telemetry record-retry works for 6', () => {
    const tc = new TelemetryCollector();
    const companies = seedEnterpriseData(5, 500 + 6);
    tc.generateAll(companies);
    expect(tc.size).toBeGreaterThan(0);
  });
  it('telemetry record-retry handles empty for 6', () => {
    const tc = new TelemetryCollector();
    expect(tc.size).toBe(0);
    expect(tc.getAll()).toEqual([]);
  });
  it('telemetry record-retry filters correctly for 6', () => {
    const tc = new TelemetryCollector();
    const companies = seedEnterpriseData(5, 600 + 6);
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
  it('telemetry record-retry calculates totals for 6', () => {
    const tc = new TelemetryCollector();
    const companies = seedEnterpriseData(3, 700 + 6);
    tc.generateAll(companies);
    const entries = tc.getAll();
    const totalTokens = entries.reduce((s, e) => s + e.totalTokens, 0);
    expect(totalTokens).toBeGreaterThan(0);
  });
  it('telemetry record-retry JSON roundtrip for 6', () => {
    const tc = new TelemetryCollector();
    const companies = seedEnterpriseData(2, 800 + 6);
    tc.generateAll(companies);
    const json = JSON.stringify(tc.getAll());
    const parsed = JSON.parse(json);
    expect(parsed.length).toBe(tc.size);
  });

});

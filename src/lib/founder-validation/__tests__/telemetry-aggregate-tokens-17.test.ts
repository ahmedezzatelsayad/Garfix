// @ts-nocheck
import { describe, it, expect } from 'bun:test';
import { TelemetryCollector, seedEnterpriseData } from '../index';

describe('Telemetry: aggregate-tokens 17', () => {

  it('telemetry aggregate-tokens works for 17', () => {
    const tc = new TelemetryCollector();
    const companies = seedEnterpriseData(5, 500 + 17);
    tc.generateAll(companies);
    expect(tc.size).toBeGreaterThan(0);
  });
  it('telemetry aggregate-tokens handles empty for 17', () => {
    const tc = new TelemetryCollector();
    expect(tc.size).toBe(0);
    expect(tc.getAll()).toEqual([]);
  });
  it('telemetry aggregate-tokens filters correctly for 17', () => {
    const tc = new TelemetryCollector();
    const companies = seedEnterpriseData(5, 600 + 17);
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
  it('telemetry aggregate-tokens calculates totals for 17', () => {
    const tc = new TelemetryCollector();
    const companies = seedEnterpriseData(3, 700 + 17);
    tc.generateAll(companies);
    const entries = tc.getAll();
    const totalTokens = entries.reduce((s, e) => s + e.totalTokens, 0);
    expect(totalTokens).toBeGreaterThan(0);
  });
  it('telemetry aggregate-tokens JSON roundtrip for 17', () => {
    const tc = new TelemetryCollector();
    const companies = seedEnterpriseData(2, 800 + 17);
    tc.generateAll(companies);
    const json = JSON.stringify(tc.getAll());
    const parsed = JSON.parse(json);
    expect(parsed.length).toBe(tc.size);
  });

});

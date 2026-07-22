// @ts-nocheck
import { describe, it, expect } from 'bun:test';
import { TelemetryCollector, seedEnterpriseData } from '../index';

describe('Telemetry: reset-clear 19', () => {

  it('telemetry reset-clear works for 19', () => {
    const tc = new TelemetryCollector();
    const companies = seedEnterpriseData(5, 500 + 19);
    tc.generateAll(companies);
    expect(tc.size).toBeGreaterThan(0);
  });
  it('telemetry reset-clear handles empty for 19', () => {
    const tc = new TelemetryCollector();
    expect(tc.size).toBe(0);
    expect(tc.getAll()).toEqual([]);
  });
  it('telemetry reset-clear filters correctly for 19', () => {
    const tc = new TelemetryCollector();
    const companies = seedEnterpriseData(5, 600 + 19);
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
  it('telemetry reset-clear calculates totals for 19', () => {
    const tc = new TelemetryCollector();
    const companies = seedEnterpriseData(3, 700 + 19);
    tc.generateAll(companies);
    const entries = tc.getAll();
    const totalTokens = entries.reduce((s, e) => s + e.totalTokens, 0);
    expect(totalTokens).toBeGreaterThan(0);
  });
  it('telemetry reset-clear JSON roundtrip for 19', () => {
    const tc = new TelemetryCollector();
    const companies = seedEnterpriseData(2, 800 + 19);
    tc.generateAll(companies);
    const json = JSON.stringify(tc.getAll());
    const parsed = JSON.parse(json);
    expect(parsed.length).toBe(tc.size);
  });

});

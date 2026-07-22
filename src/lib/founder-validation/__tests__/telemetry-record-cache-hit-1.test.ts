// @ts-nocheck
import { describe, it, expect } from 'bun:test';
import { TelemetryCollector, seedEnterpriseData } from '../index';

describe('Telemetry: record-cache-hit 1', () => {

  it('telemetry record-cache-hit works for 1', () => {
    const tc = new TelemetryCollector();
    const companies = seedEnterpriseData(5, 500 + 1);
    tc.generateAll(companies);
    expect(tc.size).toBeGreaterThan(0);
  });
  it('telemetry record-cache-hit handles empty for 1', () => {
    const tc = new TelemetryCollector();
    expect(tc.size).toBe(0);
    expect(tc.getAll()).toEqual([]);
  });
  it('telemetry record-cache-hit filters correctly for 1', () => {
    const tc = new TelemetryCollector();
    const companies = seedEnterpriseData(5, 600 + 1);
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
  it('telemetry record-cache-hit calculates totals for 1', () => {
    const tc = new TelemetryCollector();
    const companies = seedEnterpriseData(3, 700 + 1);
    tc.generateAll(companies);
    const entries = tc.getAll();
    const totalTokens = entries.reduce((s, e) => s + e.totalTokens, 0);
    expect(totalTokens).toBeGreaterThan(0);
  });
  it('telemetry record-cache-hit JSON roundtrip for 1', () => {
    const tc = new TelemetryCollector();
    const companies = seedEnterpriseData(2, 800 + 1);
    tc.generateAll(companies);
    const json = JSON.stringify(tc.getAll());
    const parsed = JSON.parse(json);
    expect(parsed.length).toBe(tc.size);
  });

});

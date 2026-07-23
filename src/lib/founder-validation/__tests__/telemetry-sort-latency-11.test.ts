// @ts-nocheck
import { describe, it, expect } from 'bun:test';
import { TelemetryCollector, seedEnterpriseData } from '../index';

describe('Telemetry: sort-latency 11', () => {

  it('telemetry sort-latency works for 11', () => {
    const tc = new TelemetryCollector();
    const companies = seedEnterpriseData(5, 500 + 11);
    tc.generateAll(companies);
    expect(tc.size).toBeGreaterThan(0);
  });
  it('telemetry sort-latency handles empty for 11', () => {
    const tc = new TelemetryCollector();
    expect(tc.size).toBe(0);
    expect(tc.getAll()).toEqual([]);
  });
  it('telemetry sort-latency filters correctly for 11', () => {
    const tc = new TelemetryCollector();
    const companies = seedEnterpriseData(5, 600 + 11);
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
  it('telemetry sort-latency calculates totals for 11', () => {
    const tc = new TelemetryCollector();
    const companies = seedEnterpriseData(3, 700 + 11);
    tc.generateAll(companies);
    const entries = tc.getAll();
    const totalTokens = entries.reduce((s, e) => s + e.totalTokens, 0);
    expect(totalTokens).toBeGreaterThan(0);
  });
  it('telemetry sort-latency JSON roundtrip for 11', () => {
    const tc = new TelemetryCollector();
    const companies = seedEnterpriseData(2, 800 + 11);
    tc.generateAll(companies);
    const json = JSON.stringify(tc.getAll());
    const parsed = JSON.parse(json);
    expect(parsed.length).toBe(tc.size);
  });

});

// @ts-nocheck
import { describe, it, expect } from 'bun:test';
import { TelemetryCollector, seedEnterpriseData } from '../index';

describe('Telemetry: filter-tenant 7', () => {

  it('telemetry filter-tenant works for 7', () => {
    const tc = new TelemetryCollector();
    const companies = seedEnterpriseData(5, 500 + 7);
    tc.generateAll(companies);
    expect(tc.size).toBeGreaterThan(0);
  });
  it('telemetry filter-tenant handles empty for 7', () => {
    const tc = new TelemetryCollector();
    expect(tc.size).toBe(0);
    expect(tc.getAll()).toEqual([]);
  });
  it('telemetry filter-tenant filters correctly for 7', () => {
    const tc = new TelemetryCollector();
    const companies = seedEnterpriseData(5, 600 + 7);
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
  it('telemetry filter-tenant calculates totals for 7', () => {
    const tc = new TelemetryCollector();
    const companies = seedEnterpriseData(3, 700 + 7);
    tc.generateAll(companies);
    const entries = tc.getAll();
    const totalTokens = entries.reduce((s, e) => s + e.totalTokens, 0);
    expect(totalTokens).toBeGreaterThan(0);
  });
  it('telemetry filter-tenant JSON roundtrip for 7', () => {
    const tc = new TelemetryCollector();
    const companies = seedEnterpriseData(2, 800 + 7);
    tc.generateAll(companies);
    const json = JSON.stringify(tc.getAll());
    const parsed = JSON.parse(json);
    expect(parsed.length).toBe(tc.size);
  });

});

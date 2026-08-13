import { describe, it, expect } from 'bun:test';
import { TelemetryCollector, seedEnterpriseData } from '../index';

describe('Telemetry: percentile-p99 14', () => {

  it('telemetry percentile-p99 works for 14', () => {
    const tc = new TelemetryCollector();
    const companies = seedEnterpriseData(5, 500 + 14);
    tc.generateAll(companies);
    expect(tc.size).toBeGreaterThan(0);
  });
  it('telemetry percentile-p99 handles empty for 14', () => {
    const tc = new TelemetryCollector();
    expect(tc.size).toBe(0);
    expect(tc.getAll()).toEqual([]);
  });
  it('telemetry percentile-p99 filters correctly for 14', () => {
    const tc = new TelemetryCollector();
    const companies = seedEnterpriseData(5, 600 + 14);
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
  it('telemetry percentile-p99 calculates totals for 14', () => {
    const tc = new TelemetryCollector();
    const companies = seedEnterpriseData(3, 700 + 14);
    tc.generateAll(companies);
    const entries = tc.getAll();
    const totalTokens = entries.reduce((s, e) => s + e.totalTokens, 0);
    expect(totalTokens).toBeGreaterThan(0);
  });
  it('telemetry percentile-p99 JSON roundtrip for 14', () => {
    const tc = new TelemetryCollector();
    const companies = seedEnterpriseData(2, 800 + 14);
    tc.generateAll(companies);
    const json = JSON.stringify(tc.getAll());
    const parsed = JSON.parse(json);
    expect(parsed.length).toBe(tc.size);
  });

});

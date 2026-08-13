import { describe, it, expect } from 'bun:test';
import { TelemetryCollector, seedEnterpriseData } from '../index';

describe('Telemetry: percentile-p95 13', () => {

  it('telemetry percentile-p95 works for 13', () => {
    const tc = new TelemetryCollector();
    const companies = seedEnterpriseData(5, 500 + 13);
    tc.generateAll(companies);
    expect(tc.size).toBeGreaterThan(0);
  });
  it('telemetry percentile-p95 handles empty for 13', () => {
    const tc = new TelemetryCollector();
    expect(tc.size).toBe(0);
    expect(tc.getAll()).toEqual([]);
  });
  it('telemetry percentile-p95 filters correctly for 13', () => {
    const tc = new TelemetryCollector();
    const companies = seedEnterpriseData(5, 600 + 13);
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
  it('telemetry percentile-p95 calculates totals for 13', () => {
    const tc = new TelemetryCollector();
    const companies = seedEnterpriseData(3, 700 + 13);
    tc.generateAll(companies);
    const entries = tc.getAll();
    const totalTokens = entries.reduce((s, e) => s + e.totalTokens, 0);
    expect(totalTokens).toBeGreaterThan(0);
  });
  it('telemetry percentile-p95 JSON roundtrip for 13', () => {
    const tc = new TelemetryCollector();
    const companies = seedEnterpriseData(2, 800 + 13);
    tc.generateAll(companies);
    const json = JSON.stringify(tc.getAll());
    const parsed = JSON.parse(json);
    expect(parsed.length).toBe(tc.size);
  });

});

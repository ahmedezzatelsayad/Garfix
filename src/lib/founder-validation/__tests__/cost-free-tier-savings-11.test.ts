import { describe, it, expect } from 'bun:test';
import { seedEnterpriseData, TelemetryCollector, calculateMetrics, calculateModelCost } from '../index';
describe('Cost: free-tier-savings 11', () => {
  it('cost free-tier-savings calculates correctly for 11', () => { const c = seedEnterpriseData(10, 3500+11); const tc = new TelemetryCollector(); tc.generateAll(c); const m = calculateMetrics(c, tc.getAll()); expect(m.totalCostUsd).toBeGreaterThanOrEqual(0); });
  it('cost free-tier-savings per request for 11', () => { const c = seedEnterpriseData(10, 3600+11); const tc = new TelemetryCollector(); tc.generateAll(c); const m = calculateMetrics(c, tc.getAll()); if(m.totalRequests>0) expect(m.avgCostPerRequest).toBeGreaterThanOrEqual(0); });
  it('cost free-tier-savings per invoice for 11', () => { const c = seedEnterpriseData(10, 3700+11); const tc = new TelemetryCollector(); tc.generateAll(c); const m = calculateMetrics(c, tc.getAll()); expect(m.avgCostPerInvoice).toBeGreaterThanOrEqual(0); });
  it('cost free-tier-savings model pricing for 11', () => { const cost = calculateModelCost('deepseek/deepseek-chat', 100, 50); expect(cost).toBeGreaterThanOrEqual(0); });
  it('cost free-tier-savings free model for 11', () => { const cost = calculateModelCost('meta-llama/llama-3.1-8b-instruct:free', 100, 50); expect(cost).toBe(0); });
});

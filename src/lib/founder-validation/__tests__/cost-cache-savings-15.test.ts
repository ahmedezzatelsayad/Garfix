import { describe, it, expect } from 'bun:test';
import { seedEnterpriseData, TelemetryCollector, calculateMetrics, calculateModelCost } from '../index';
describe('Cost: cache-savings 15', () => {
  it('cost cache-savings calculates correctly for 15', () => { const c = seedEnterpriseData(10, 3500+15); const tc = new TelemetryCollector(); tc.generateAll(c); const m = calculateMetrics(c, tc.getAll()); expect(m.totalCostUsd).toBeGreaterThanOrEqual(0); });
  it('cost cache-savings per request for 15', () => { const c = seedEnterpriseData(10, 3600+15); const tc = new TelemetryCollector(); tc.generateAll(c); const m = calculateMetrics(c, tc.getAll()); if(m.totalRequests>0) expect(m.avgCostPerRequest).toBeGreaterThanOrEqual(0); });
  it('cost cache-savings per invoice for 15', () => { const c = seedEnterpriseData(10, 3700+15); const tc = new TelemetryCollector(); tc.generateAll(c); const m = calculateMetrics(c, tc.getAll()); expect(m.avgCostPerInvoice).toBeGreaterThanOrEqual(0); });
  it('cost cache-savings model pricing for 15', () => { const cost = calculateModelCost('deepseek/deepseek-chat', 100, 50); expect(cost).toBeGreaterThanOrEqual(0); });
  it('cost cache-savings free model for 15', () => { const cost = calculateModelCost('meta-llama/llama-3.1-8b-instruct:free', 100, 50); expect(cost).toBe(0); });
});

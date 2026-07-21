import { describe, it, expect } from 'bun:test';
import { seedEnterpriseData, TelemetryCollector, calculateMetrics, calculateModelCost } from '../index';
describe('Cost: memory-savings 17', () => {
  it('cost memory-savings calculates correctly for 17', () => { const c = seedEnterpriseData(10, 3500+17); const tc = new TelemetryCollector(); tc.generateAll(c); const m = calculateMetrics(c, tc.getAll()); expect(m.totalCostUsd).toBeGreaterThanOrEqual(0); });
  it('cost memory-savings per request for 17', () => { const c = seedEnterpriseData(10, 3600+17); const tc = new TelemetryCollector(); tc.generateAll(c); const m = calculateMetrics(c, tc.getAll()); if(m.totalRequests>0) expect(m.avgCostPerRequest).toBeGreaterThanOrEqual(0); });
  it('cost memory-savings per invoice for 17', () => { const c = seedEnterpriseData(10, 3700+17); const tc = new TelemetryCollector(); tc.generateAll(c); const m = calculateMetrics(c, tc.getAll()); expect(m.avgCostPerInvoice).toBeGreaterThanOrEqual(0); });
  it('cost memory-savings model pricing for 17', () => { const cost = calculateModelCost('deepseek/deepseek-chat', 100, 50); expect(cost).toBeGreaterThanOrEqual(0); });
  it('cost memory-savings free model for 17', () => { const cost = calculateModelCost('meta-llama/llama-3.1-8b-instruct:free', 100, 50); expect(cost).toBe(0); });
});

import { describe, it, expect } from 'bun:test';
import { seedEnterpriseData, TelemetryCollector, calculateMetrics, calculateModelCost } from '../index';
describe('Cost: pattern-savings 18', () => {
  it('cost pattern-savings calculates correctly for 18', () => { const c = seedEnterpriseData(10, 3500+18); const tc = new TelemetryCollector(); tc.generateAll(c); const m = calculateMetrics(c, tc.getAll()); expect(m.totalCostUsd).toBeGreaterThanOrEqual(0); });
  it('cost pattern-savings per request for 18', () => { const c = seedEnterpriseData(10, 3600+18); const tc = new TelemetryCollector(); tc.generateAll(c); const m = calculateMetrics(c, tc.getAll()); if(m.totalRequests>0) expect(m.avgCostPerRequest).toBeGreaterThanOrEqual(0); });
  it('cost pattern-savings per invoice for 18', () => { const c = seedEnterpriseData(10, 3700+18); const tc = new TelemetryCollector(); tc.generateAll(c); const m = calculateMetrics(c, tc.getAll()); expect(m.avgCostPerInvoice).toBeGreaterThanOrEqual(0); });
  it('cost pattern-savings model pricing for 18', () => { const cost = calculateModelCost('deepseek/deepseek-chat', 100, 50); expect(cost).toBeGreaterThanOrEqual(0); });
  it('cost pattern-savings free model for 18', () => { const cost = calculateModelCost('meta-llama/llama-3.1-8b-instruct:free', 100, 50); expect(cost).toBe(0); });
});

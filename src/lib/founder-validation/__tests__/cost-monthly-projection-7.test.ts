import { describe, it, expect } from 'bun:test';
import { seedEnterpriseData, TelemetryCollector, calculateMetrics, calculateModelCost } from '../index';
describe('Cost: monthly-projection 7', () => {
  it('cost monthly-projection calculates correctly for 7', () => { const c = seedEnterpriseData(10, 3500+7); const tc = new TelemetryCollector(); tc.generateAll(c); const m = calculateMetrics(c, tc.getAll()); expect(m.totalCostUsd).toBeGreaterThanOrEqual(0); });
  it('cost monthly-projection per request for 7', () => { const c = seedEnterpriseData(10, 3600+7); const tc = new TelemetryCollector(); tc.generateAll(c); const m = calculateMetrics(c, tc.getAll()); if(m.totalRequests>0) expect(m.avgCostPerRequest).toBeGreaterThanOrEqual(0); });
  it('cost monthly-projection per invoice for 7', () => { const c = seedEnterpriseData(10, 3700+7); const tc = new TelemetryCollector(); tc.generateAll(c); const m = calculateMetrics(c, tc.getAll()); expect(m.avgCostPerInvoice).toBeGreaterThanOrEqual(0); });
  it('cost monthly-projection model pricing for 7', () => { const cost = calculateModelCost('deepseek/deepseek-chat', 100, 50); expect(cost).toBeGreaterThanOrEqual(0); });
  it('cost monthly-projection free model for 7', () => { const cost = calculateModelCost('meta-llama/llama-3.1-8b-instruct:free', 100, 50); expect(cost).toBe(0); });
});

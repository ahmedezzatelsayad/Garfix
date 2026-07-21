import { describe, it, expect } from 'bun:test';
import { seedEnterpriseData, TelemetryCollector, calculateMetrics, generateFounderReport, calculateModelCost } from '../../index';

describe('Deep: telemetry-generation / error-handling', () => {
  const companies = seedEnterpriseData(10, 3458);
  const tc = new TelemetryCollector(companies);
  const telemetry = tc.generateAll();
  const metrics = calculateMetrics(telemetry, companies);

  it('telemetry-generation error-handling generates valid data', () => {
    expect(companies.length).toBe(10);
    for (const c of companies) { expect(c.id).toBeTruthy(); expect(c.id.length).toBeGreaterThan(3); }
  });

  it('telemetry-generation error-handling has valid products', () => {
    for (const c of companies) {
      expect(c.products.length).toBeGreaterThan(0);
      for (const p of c.products) { expect(p.sellPrice).toBeGreaterThanOrEqual(p.costPrice); }
    }
  });

  it('telemetry-generation error-handling has valid invoices', () => {
    for (const c of companies) {
      expect(c.invoices.length).toBeGreaterThan(0);
      for (const inv of c.invoices) {
        expect(inv.finalTotal).toBeGreaterThanOrEqual(0);
        expect(inv.items.length).toBeGreaterThan(0);
      }
    }
  });

  it('telemetry-generation error-handling relational integrity', () => {
    for (const c of companies) {
      const prodIds = new Set(c.products.map(p => p.id));
      for (const inv of c.invoices) {
        for (const item of inv.items) {
          expect(prodIds.has(item.productId)).toBe(true);
        }
      }
    }
  });

  it('telemetry-generation error-handling metrics calculate', () => {
    expect(metrics).toBeDefined();
    expect(metrics.totalRequests).toBeGreaterThanOrEqual(0);
  });

  it('telemetry-generation error-handling report generates', () => {
    const report = generateFounderReport(companies, telemetry, 3458);
    expect(report).toBeDefined();
    expect(report.generatedAt).toBeTruthy();
  });

  it('telemetry-generation error-handling telemetry complete', () => {
    for (const e of telemetry) {
      expect(e.tenant).toBeTruthy();
      expect(e.totalTokens).toBeGreaterThanOrEqual(0);
      expect(e.costUsd).toBeGreaterThanOrEqual(0);
    }
  });

  it('telemetry-generation error-handling cost calculation valid', () => {
    const cost = calculateModelCost('deepseek/deepseek-chat', 100, 50);
    expect(cost).toBeGreaterThanOrEqual(0);
    const free = calculateModelCost('meta-llama/llama-3.1-8b-instruct:free', 100, 50);
    expect(free).toBe(0);
  });

  it('telemetry-generation error-handling no ID collisions', () => {
    const allIds = new Set<string>();
    for (const c of companies) {
      expect(allIds.has(c.id)).toBe(false);
      allIds.add(c.id);
      for (const inv of c.invoices) {
        expect(allIds.has(inv.id)).toBe(false);
        allIds.add(inv.id);
      }
    }
  });

  it('telemetry-generation error-handling tenant isolation', () => {
    const companyMap = new Map(companies.map(c => [c.id, new Set(c.clients.map(cl => cl.id))]));
    for (const c of companies) {
      const myClients = companyMap.get(c.id)!;
      for (const inv of c.invoices) {
        if (inv.clientId) expect(myClients.has(inv.clientId)).toBe(true);
      }
    }
  });
});

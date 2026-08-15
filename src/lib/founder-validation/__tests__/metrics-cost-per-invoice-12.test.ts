import { describe, it, expect } from "bun:test";
import { TelemetryCollector, calculateMetrics, seedEnterpriseData, type TelemetryEntry } from "../index";

describe("Metrics cost per invoice", () => {
  function base(o: Partial<TelemetryEntry> = {}): TelemetryEntry {
    return {
      id: "t-1", timestamp: new Date(), tenant: "a", worker: "w", queue: "q",
      provider: "openrouter", model: "m", latencyMs: 100, promptTokens: 10,
      completionTokens: 10, totalTokens: 20, costUsd: 0.001, retries: 0,
      queueWaitMs: 10, executionTimeMs: 90, cacheHit: false, memoryHit: false,
      ruleHit: false, patternHit: false, resolvedBy: "ai", confidence: 0.9,
      outputQualityScore: 0.8, errors: [], recoveryPath: null, ...o,
    };
  }

  it("cost per invoice uses company invoice counts", () => {
    const companies = seedEnterpriseData({ companyCount: 10 });
    const totalInvoices = companies.reduce((s, c) => s + c.invoices.length, 0);
    const c = new TelemetryCollector("t");
    for (let i = 0; i < 10; i++) c.record(base({ costUsd: 0.1, id: `t-${i}` }));
    const m = calculateMetrics(c.getEntries(), companies);
    if (totalInvoices > 0) expect(m.avgCostPerInvoice).toBeGreaterThan(0);
  });

  it("zero invoices = zero cost per invoice", () => {
    const c = new TelemetryCollector("t");
    c.record(base({ costUsd: 1.0 }));
    const m = calculateMetrics(c.getEntries(), []);
    expect(m.avgCostPerInvoice).toBe(0);
  });

  it("cost per company = total / companyCount", () => {
    const c = new TelemetryCollector("t");
    c.record(base({ costUsd: 0.5 }));
    const m = calculateMetrics(c.getEntries(), [{ id: 1, name: "", nameAr: "", slug: "a", email: "", phone: "", address: "", vatNumber: "", commercialRegistration: "", currency: "SAR", country: "SA", plan: "trial", openrouterApiKey: null, openrouterModel: "m/m", createdAt: new Date(), users: [], employees: [], clients: [], suppliers: [], warehouses: [], categories: [], products: [], inventory: [], invoices: [], purchases: [], aiMemories: [], aiRules: [], cacheEntries: [], providerHistory: [], workerHistory: [] }]);
    expect(m.avgCostPerCompany).toBe(0.5);
  });
});

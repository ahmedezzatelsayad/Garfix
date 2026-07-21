import { describe, it, expect } from "bun:test";
import { calculateMetrics } from "../index";

describe("Metrics with empty inputs", () => {
  it("empty telemetry + empty companies = zero metrics", () => {
    const m = calculateMetrics([], []);
    expect(m.totalRequests).toBe(0);
    expect(m.totalTokenUsage).toBe(0);
    expect(m.totalUsdSpent).toBe(0);
    expect(m.avgCostPerRequest).toBe(0);
    expect(m.errorRate).toBe(0);
    expect(m.cacheHitRate).toBe(0);
    expect(m.memoryHitRate).toBe(0);
    expect(m.ruleHitRate).toBe(0);
    expect(m.patternHitRate).toBe(0);
  });

  it("empty telemetry with companies = zero cost per company", () => {
    const m = calculateMetrics([], [{ id: 1, name: "", nameAr: "", slug: "a", email: "", phone: "", address: "", vatNumber: "", commercialRegistration: "", currency: "SAR", country: "SA", plan: "trial", openrouterApiKey: null, openrouterModel: "m/m", createdAt: new Date(), users: [], employees: [], clients: [], suppliers: [], warehouses: [], categories: [], products: [], inventory: [], invoices: [], purchases: [], aiMemories: [], aiRules: [], cacheEntries: [], providerHistory: [], workerHistory: [] }]);
    expect(m.avgCostPerCompany).toBe(0);
    expect(m.avgCostPerInvoice).toBe(0);
  });
});

// @ts-nocheck
import { describe, it, expect } from "bun:test";
import { TelemetryCollector, calculateMetrics, type TelemetryEntry } from "../index";

describe("Metrics highest cost tenants", () => {
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

  it("groups costs by tenant", () => {
    const c = new TelemetryCollector("t");
    for (let i = 0; i < 10; i++) c.record(base({ tenant: "high", costUsd: 1.0, id: `h-${i}` }));
    for (let i = 0; i < 5; i++) c.record(base({ tenant: "low", costUsd: 0.1, id: `l-${i}` }));
    const top = calculateMetrics(c.getEntries(), []).highestCostTenants;
    expect(top[0].tenant).toBe("high");
    expect(top[0].cost).toBe(10.0);
  });

  it("sorts descending by cost", () => {
    const c = new TelemetryCollector("t");
    c.record(base({ tenant: "a", costUsd: 5, id: "1" }));
    c.record(base({ tenant: "b", costUsd: 10, id: "2" }));
    c.record(base({ tenant: "c", costUsd: 2, id: "3" }));
    const top = calculateMetrics(c.getEntries(), []).highestCostTenants;
    expect(top[0].cost).toBeGreaterThanOrEqual(top[1]?.cost ?? 0);
  });

  it("counts requests per tenant", () => {
    const c = new TelemetryCollector("t");
    for (let i = 0; i < 3; i++) c.record(base({ tenant: "x", id: `t-${i}` }));
    const top = calculateMetrics(c.getEntries(), []).highestCostTenants;
    expect(top[0].requests).toBe(3);
  });
});

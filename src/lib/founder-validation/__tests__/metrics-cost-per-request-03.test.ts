// @ts-nocheck
import { describe, it, expect } from "bun:test";
import { TelemetryCollector, calculateMetrics, type TelemetryEntry } from "../index";

describe("Metrics cost per request", () => {
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

  it("avgCostPerRequest = total / count", () => {
    const c = new TelemetryCollector("t");
    c.record(base({ costUsd: 0.01 }));
    c.record(base({ costUsd: 0.03 }));
    const m = calculateMetrics(c.getEntries(), []);
    expect(m.avgCostPerRequest).toBeCloseTo(0.02, 6);
  });

  it("zero cost entries produce zero avg", () => {
    const c = new TelemetryCollector("t");
    for (let i = 0; i < 5; i++) c.record(base({ costUsd: 0, id: `t-${i}` }));
    expect(calculateMetrics(c.getEntries(), []).avgCostPerRequest).toBe(0);
  });

  it("single entry avg equals its cost", () => {
    const c = new TelemetryCollector("t");
    c.record(base({ costUsd: 0.005 }));
    expect(calculateMetrics(c.getEntries(), []).avgCostPerRequest).toBeCloseTo(0.005, 6);
  });

  it("empty telemetry has zero avg cost", () => {
    expect(calculateMetrics([], []).avgCostPerRequest).toBe(0);
  });

  it("totalUsdSpent sums all costs", () => {
    const c = new TelemetryCollector("t");
    c.record(base({ costUsd: 1.0 })); c.record(base({ costUsd: 2.0 }));
    expect(calculateMetrics(c.getEntries(), []).totalUsdSpent).toBe(3.0);
  });
});

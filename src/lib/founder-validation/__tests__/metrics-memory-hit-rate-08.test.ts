import { describe, it, expect } from "bun:test";
import { TelemetryCollector, calculateMetrics, type TelemetryEntry } from "../index";

describe("Metrics memory hit rate", () => {
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

  it("100% memory hits", () => {
    const c = new TelemetryCollector("t");
    for (let i = 0; i < 10; i++) c.record(base({ memoryHit: true, id: `t-${i}` }));
    expect(calculateMetrics(c.getEntries(), []).memoryHitRate).toBe(1);
  });

  it("0% memory hits", () => {
    const c = new TelemetryCollector("t");
    for (let i = 0; i < 10; i++) c.record(base({ memoryHit: false, id: `t-${i}` }));
    expect(calculateMetrics(c.getEntries(), []).memoryHitRate).toBe(0);
  });

  it("partial memory hits calculated correctly", () => {
    const c = new TelemetryCollector("t");
    c.record(base({ memoryHit: true, id: "1" }));
    c.record(base({ memoryHit: true, id: "2" }));
    c.record(base({ memoryHit: false, id: "3" }));
    c.record(base({ memoryHit: false, id: "4" }));
    c.record(base({ memoryHit: true, id: "5" }));
    expect(calculateMetrics(c.getEntries(), []).memoryHitRate).toBeCloseTo(0.6, 6);
  });

  it("empty = 0", () => {
    expect(calculateMetrics([], []).memoryHitRate).toBe(0);
  });
});

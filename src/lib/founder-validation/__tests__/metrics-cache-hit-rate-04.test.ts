import { describe, it, expect } from "bun:test";
import { TelemetryCollector, calculateMetrics, type TelemetryEntry } from "../index";

describe("Metrics cache hit rate", () => {
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

  it("all cache hits = 100% hit rate", () => {
    const c = new TelemetryCollector("t");
    for (let i = 0; i < 10; i++) c.record(base({ cacheHit: true, id: `t-${i}` }));
    expect(calculateMetrics(c.getEntries(), []).cacheHitRate).toBe(1);
  });

  it("no cache hits = 0% hit rate", () => {
    const c = new TelemetryCollector("t");
    for (let i = 0; i < 10; i++) c.record(base({ cacheHit: false, id: `t-${i}` }));
    expect(calculateMetrics(c.getEntries(), []).cacheHitRate).toBe(0);
  });

  it("half cache hits = 0.5 rate", () => {
    const c = new TelemetryCollector("t");
    for (let i = 0; i < 5; i++) c.record(base({ cacheHit: true, id: `h-${i}` }));
    for (let i = 0; i < 5; i++) c.record(base({ cacheHit: false, id: `m-${i}` }));
    expect(calculateMetrics(c.getEntries(), []).cacheHitRate).toBeCloseTo(0.5, 6);
  });

  it("empty entries = 0 hit rate", () => {
    expect(calculateMetrics([], []).cacheHitRate).toBe(0);
  });
});

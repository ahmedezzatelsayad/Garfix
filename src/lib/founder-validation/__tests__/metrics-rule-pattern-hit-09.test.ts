import { describe, it, expect } from "bun:test";
import { TelemetryCollector, calculateMetrics, type TelemetryEntry } from "../index";

describe("Metrics rule and pattern hit rates", () => {
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

  it("rule hit rate matches ratio", () => {
    const c = new TelemetryCollector("t");
    for (let i = 0; i < 7; i++) c.record(base({ ruleHit: true, id: `r-${i}` }));
    for (let i = 0; i < 3; i++) c.record(base({ ruleHit: false, id: `n-${i}` }));
    expect(calculateMetrics(c.getEntries(), []).ruleHitRate).toBeCloseTo(0.7, 6);
  });

  it("pattern hit rate matches ratio", () => {
    const c = new TelemetryCollector("t");
    for (let i = 0; i < 3; i++) c.record(base({ patternHit: true, id: `p-${i}` }));
    for (let i = 0; i < 7; i++) c.record(base({ patternHit: false, id: `n-${i}` }));
    expect(calculateMetrics(c.getEntries(), []).patternHitRate).toBeCloseTo(0.3, 6);
  });

  it("both can be 1.0 simultaneously", () => {
    const c = new TelemetryCollector("t");
    for (let i = 0; i < 5; i++) c.record(base({ ruleHit: true, patternHit: true, id: `t-${i}` }));
    const m = calculateMetrics(c.getEntries(), []);
    expect(m.ruleHitRate).toBe(1);
    expect(m.patternHitRate).toBe(1);
  });

  it("both zero when no hits", () => {
    expect(calculateMetrics([], []).ruleHitRate).toBe(0);
    expect(calculateMetrics([], []).patternHitRate).toBe(0);
  });
});

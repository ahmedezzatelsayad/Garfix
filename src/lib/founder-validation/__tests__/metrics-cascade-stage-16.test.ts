import { describe, it, expect } from "bun:test";
import { TelemetryCollector, calculateMetrics, type TelemetryEntry } from "../index";

describe("Metrics cascade stage resolvedBy", () => {
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

  it("all resolvedBy values are valid stages", () => {
    const valid = ["cache", "pattern", "rule", "memory", "ai"];
    const c = new TelemetryCollector("t");
    for (const stage of valid)
      c.record(base({ resolvedBy: stage as any, id: `t-${stage}` }));
    expect(calculateMetrics(c.getEntries(), []).totalRequests).toBe(5);
  });

  it("cache-resolved entries have cacheHit=true", () => {
    const c = new TelemetryCollector("t");
    c.record(base({ resolvedBy: "cache", cacheHit: true }));
    expect(calculateMetrics(c.getEntries(), []).cacheHitRate).toBe(1);
  });

  it("ai-resolved entries counted in total requests", () => {
    const c = new TelemetryCollector("t");
    for (let i = 0; i < 10; i++) c.record(base({ resolvedBy: "ai", id: `t-${i}` }));
    expect(calculateMetrics(c.getEntries(), []).totalRequests).toBe(10);
  });
});

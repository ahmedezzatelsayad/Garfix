// @ts-nocheck
import { describe, it, expect } from "bun:test";
import { TelemetryCollector, calculateMetrics, type TelemetryEntry } from "../index";

describe("Metrics recovery path tracking", () => {
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

  it("null recovery path is valid", () => {
    const c = new TelemetryCollector("t");
    c.record(base({ recoveryPath: null }));
    expect(calculateMetrics(c.getEntries(), []).totalRequests).toBe(1);
  });

  it("string recovery path is valid", () => {
    const c = new TelemetryCollector("t");
    c.record(base({ recoveryPath: "cache->rule->ai" }));
    expect(calculateMetrics(c.getEntries(), []).totalRequests).toBe(1);
  });

  it("recovery path does not affect error rate when no errors", () => {
    const c = new TelemetryCollector("t");
    for (let i = 0; i < 5; i++)
      c.record(base({ recoveryPath: "fallback", id: `t-${i}` }));
    expect(calculateMetrics(c.getEntries(), []).errorRate).toBe(0);
  });
});

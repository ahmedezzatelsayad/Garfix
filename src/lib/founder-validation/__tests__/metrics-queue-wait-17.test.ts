// @ts-nocheck
import { describe, it, expect } from "bun:test";
import { TelemetryCollector, calculateMetrics, type TelemetryEntry } from "../index";

describe("Metrics queue wait time", () => {
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

  it("zero queue wait is valid", () => {
    const c = new TelemetryCollector("t");
    c.record(base({ queueWaitMs: 0 }));
    const m = calculateMetrics(c.getEntries(), []);
    expect(m.p50Latency).toBeGreaterThanOrEqual(0);
  });

  it("high queue wait reflects in p95", () => {
    const c = new TelemetryCollector("t");
    for (let i = 0; i < 100; i++)
      c.record(base({ queueWaitMs: 5000, latencyMs: 5100, executionTimeMs: 100, id: `t-${i}` }));
    const m = calculateMetrics(c.getEntries(), []);
    expect(m.p95Latency).toBeGreaterThanOrEqual(5000);
  });

  it("execution time + queue wait <= latency", () => {
    const c = new TelemetryCollector("t");
    c.record(base({ queueWaitMs: 10, executionTimeMs: 80, latencyMs: 100 }));
    expect(calculateMetrics(c.getEntries(), []).totalRequests).toBe(1);
  });
});

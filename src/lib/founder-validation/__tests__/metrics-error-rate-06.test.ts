import { describe, it, expect } from "bun:test";
import { TelemetryCollector, calculateMetrics, type TelemetryEntry } from "../index";

describe("Metrics error rate", () => {
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

  it("no errors = 0 error rate", () => {
    const c = new TelemetryCollector("t");
    for (let i = 0; i < 10; i++) c.record(base({ id: `t-${i}` }));
    expect(calculateMetrics(c.getEntries(), []).errorRate).toBe(0);
  });

  it("all errors = 1.0 error rate", () => {
    const c = new TelemetryCollector("t");
    for (let i = 0; i < 5; i++) c.record(base({ errors: ["timeout"], id: `t-${i}` }));
    expect(calculateMetrics(c.getEntries(), []).errorRate).toBe(1);
  });

  it("mixed success/error = correct rate", () => {
    const c = new TelemetryCollector("t");
    for (let i = 0; i < 8; i++) c.record(base({ id: `ok-${i}` }));
    for (let i = 0; i < 2; i++) c.record(base({ errors: ["fail"], id: `er-${i}` }));
    expect(calculateMetrics(c.getEntries(), []).errorRate).toBeCloseTo(0.2, 6);
  });

  it("empty = 0 error rate", () => {
    expect(calculateMetrics([], []).errorRate).toBe(0);
  });
});

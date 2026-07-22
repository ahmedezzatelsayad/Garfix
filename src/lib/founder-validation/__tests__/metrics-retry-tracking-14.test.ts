// @ts-nocheck
import { describe, it, expect } from "bun:test";
import { TelemetryCollector, calculateMetrics, type TelemetryEntry } from "../index";

describe("Metrics retry tracking", () => {
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

  it("zero retries is valid", () => {
    const c = new TelemetryCollector("t");
    c.record(base({ retries: 0 }));
    expect(calculateMetrics(c.getEntries(), []).totalRequests).toBe(1);
  });

  it("high retry count entries are counted", () => {
    const c = new TelemetryCollector("t");
    c.record(base({ retries: 10, id: "t-1" }));
    c.record(base({ retries: 5, id: "t-2" }));
    expect(calculateMetrics(c.getEntries(), []).totalRequests).toBe(2);
  });

  it("retries with errors are counted", () => {
    const c = new TelemetryCollector("t");
    c.record(base({ retries: 3, errors: ["timeout"], id: "t-1" }));
    expect(calculateMetrics(c.getEntries(), []).errorRate).toBe(1);
  });
});

// @ts-nocheck
import { describe, it, expect } from "bun:test";
import { TelemetryCollector, calculateMetrics, type TelemetryEntry } from "../index";

describe("Metrics confidence score handling", () => {
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

  it("handles confidence 0.0 entries", () => {
    const c = new TelemetryCollector("t");
    for (let i = 0; i < 5; i++) c.record(base({ confidence: 0.0, id: `t-${i}` }));
    const m = calculateMetrics(c.getEntries(), []);
    expect(m.totalRequests).toBe(5);
  });

  it("handles confidence 1.0 entries", () => {
    const c = new TelemetryCollector("t");
    for (let i = 0; i < 5; i++) c.record(base({ confidence: 1.0, id: `t-${i}` }));
    expect(calculateMetrics(c.getEntries(), []).totalRequests).toBe(5);
  });

  it("handles mixed confidence values", () => {
    const c = new TelemetryCollector("t");
    [0.1, 0.5, 0.9, 1.0, 0.0].forEach((conf, i) =>
      c.record(base({ confidence: conf, id: `t-${i}` }))
    );
    expect(calculateMetrics(c.getEntries(), []).totalRequests).toBe(5);
  });

  it("output quality score does not affect request count", () => {
    const c = new TelemetryCollector("t");
    c.record(base({ outputQualityScore: 0.1 }));
    c.record(base({ outputQualityScore: 0.9 }));
    expect(calculateMetrics(c.getEntries(), []).totalRequests).toBe(2);
  });
});

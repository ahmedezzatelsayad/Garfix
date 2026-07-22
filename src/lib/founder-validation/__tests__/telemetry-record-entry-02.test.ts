// @ts-nocheck
import { describe, it, expect } from "bun:test";
import { TelemetryCollector, type TelemetryEntry } from "../index";

describe("TelemetryCollector record", () => {
  function make(id: string): TelemetryEntry {
    return {
      id, timestamp: new Date(), tenant: "t", worker: "w", queue: "q",
      provider: "p", model: "m", latencyMs: 100, promptTokens: 10,
      completionTokens: 10, totalTokens: 20, costUsd: 0.01, retries: 0,
      queueWaitMs: 10, executionTimeMs: 90, cacheHit: false, memoryHit: false,
      ruleHit: false, patternHit: false, resolvedBy: "ai", confidence: 0.9,
      outputQualityScore: 0.8, errors: [], recoveryPath: null,
    };
  }

  it("records single entry", () => {
    const c = new TelemetryCollector("t");
    c.record(make("1"));
    expect(c.getEntries()).toHaveLength(1);
  });

  it("records multiple entries", () => {
    const c = new TelemetryCollector("t");
    for (let i = 0; i < 50; i++) c.record(make(String(i)));
    expect(c.getEntries()).toHaveLength(50);
  });

  it("preserves entry data", () => {
    const c = new TelemetryCollector("t");
    c.record(make("x"));
    expect(c.getEntries()[0].provider).toBe("p");
    expect(c.getEntries()[0].model).toBe("m");
  });
});

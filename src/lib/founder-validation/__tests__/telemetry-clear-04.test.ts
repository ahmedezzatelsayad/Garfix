import { describe, it, expect } from "bun:test";
import { TelemetryCollector, type TelemetryEntry } from "../index";

describe("TelemetryCollector clear", () => {
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

  it("clear removes all entries", () => {
    const c = new TelemetryCollector("t");
    for (let i = 0; i < 10; i++) c.record(make(String(i)));
    c.clear();
    expect(c.getEntries()).toHaveLength(0);
  });

  it("clear then record works", () => {
    const c = new TelemetryCollector("t");
    c.record(make("1"));
    c.clear();
    c.record(make("2"));
    expect(c.getEntries()).toHaveLength(1);
    expect(c.getEntries()[0].id).toBe("2");
  });

  it("clear on empty is safe", () => {
    const c = new TelemetryCollector("t");
    c.clear();
    expect(c.getEntries()).toHaveLength(0);
  });
});

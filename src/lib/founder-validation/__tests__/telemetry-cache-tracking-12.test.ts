import { describe, it, expect } from "bun:test";
import { TelemetryCollector, type TelemetryEntry } from "../index";

describe("TelemetryCollector cache hit tracking", () => {
  function make(id: string, cacheHit: boolean): TelemetryEntry {
    return {
      id, timestamp: new Date(), tenant: "t", worker: "w", queue: "q",
      provider: "p", model: "m", latencyMs: 100, promptTokens: 10,
      completionTokens: 10, totalTokens: 20, costUsd: 0.01, retries: 0,
      queueWaitMs: 10, executionTimeMs: 90, cacheHit, memoryHit: false,
      ruleHit: false, patternHit: false, resolvedBy: "cache", confidence: 0.9,
      outputQualityScore: 0.8, errors: [], recoveryPath: null,
    };
  }

  it("tracks cache hit/miss ratio", () => {
    const c = new TelemetryCollector("t");
    for (let i = 0; i < 30; i++) c.record(make(String(i), i < 18));
    const entries = c.getEntries();
    expect(entries.filter(e => e.cacheHit)).toHaveLength(18);
    expect(entries.filter(e => !e.cacheHit)).toHaveLength(12);
  });
});

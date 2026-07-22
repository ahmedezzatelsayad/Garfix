// @ts-nocheck
import { describe, it, expect } from "bun:test";
import { TelemetryCollector, type TelemetryEntry } from "../index";

describe("TelemetryCollector recovery path tracking", () => {
  function make(id: string, recovery: string | null): TelemetryEntry {
    return {
      id, timestamp: new Date(), tenant: "t", worker: "w", queue: "q",
      provider: "p", model: "m", latencyMs: 100, promptTokens: 10,
      completionTokens: 10, totalTokens: 20, costUsd: 0.01, retries: 0,
      queueWaitMs: 10, executionTimeMs: 90, cacheHit: false, memoryHit: false,
      ruleHit: false, patternHit: false, resolvedBy: "ai", confidence: 0.9,
      outputQualityScore: 0.8, errors: [], recoveryPath: recovery,
    };
  }

  it("null recovery path stored", () => {
    const c = new TelemetryCollector("t");
    c.record(make("1", null));
    expect(c.getEntries()[0].recoveryPath).toBeNull();
  });

  it("string recovery path stored", () => {
    const c = new TelemetryCollector("t");
    c.record(make("1", "cache->rule->ai"));
    expect(c.getEntries()[0].recoveryPath).toBe("cache->rule->ai");
  });

  it("filter entries with recovery paths", () => {
    const c = new TelemetryCollector("t");
    c.record(make("1", null));
    c.record(make("2", "fallback"));
    c.record(make("3", null));
    expect(c.getEntries().filter(e => e.recoveryPath !== null)).toHaveLength(1);
  });
});

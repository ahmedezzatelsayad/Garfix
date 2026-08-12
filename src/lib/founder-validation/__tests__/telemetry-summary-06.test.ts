import { describe, it, expect } from "bun:test";
import { TelemetryCollector, type TelemetryEntry } from "../index";

describe("TelemetryCollector summary methods", () => {
  function make(id: string, o: Partial<TelemetryEntry> = {}): TelemetryEntry {
    return {
      id, timestamp: new Date(), tenant: "t", worker: "w", queue: "q",
      provider: "p", model: "m", latencyMs: 100, promptTokens: 10,
      completionTokens: 10, totalTokens: 20, costUsd: 0.01, retries: 0,
      queueWaitMs: 10, executionTimeMs: 90, cacheHit: false, memoryHit: false,
      ruleHit: false, patternHit: false, resolvedBy: "ai", confidence: 0.9,
      outputQualityScore: 0.8, errors: [], recoveryPath: null, ...o,
    };
  }

  it("entry count matches recorded", () => {
    const c = new TelemetryCollector("t");
    for (let i = 0; i < 15; i++) c.record(make(String(i)));
    expect(c.getEntries()).toHaveLength(15);
  });

  it("unique tenants in entries", () => {
    const c = new TelemetryCollector("t");
    c.record(make("1", { tenant: "a" }));
    c.record(make("2", { tenant: "a" }));
    c.record(make("3", { tenant: "b" }));
    const tenants = new Set(c.getEntries().map(e => e.tenant));
    expect(tenants.size).toBe(2);
  });

  it("can filter by cacheHit", () => {
    const c = new TelemetryCollector("t");
    c.record(make("1", { cacheHit: true }));
    c.record(make("2", { cacheHit: false }));
    const hits = c.getEntries().filter(e => e.cacheHit);
    expect(hits).toHaveLength(1);
  });
});

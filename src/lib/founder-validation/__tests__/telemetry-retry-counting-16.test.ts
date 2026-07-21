// @ts-nocheck
import { describe, it, expect } from "bun:test";
import { TelemetryCollector, type TelemetryEntry } from "../index";

describe("TelemetryCollector retry counting", () => {
  function make(id: string, retries: number): TelemetryEntry {
    return {
      id, timestamp: new Date(), tenant: "t", worker: "w", queue: "q",
      provider: "p", model: "m", latencyMs: 100, promptTokens: 10,
      completionTokens: 10, totalTokens: 20, costUsd: 0.01, retries,
      queueWaitMs: 10, executionTimeMs: 90, cacheHit: false, memoryHit: false,
      ruleHit: false, patternHit: false, resolvedBy: "ai", confidence: 0.9,
      outputQualityScore: 0.8, errors: [], recoveryPath: null,
    };
  }

  it("tracks retry counts", () => {
    const c = new TelemetryCollector("t");
    [0, 1, 2, 3, 5].forEach((r, i) => c.record(make(String(i), r)));
    const retries = c.getEntries().map(e => e.retries);
    expect(retries).toEqual([0, 1, 2, 3, 5]);
  });

  it("high retries are stored correctly", () => {
    const c = new TelemetryCollector("t");
    c.record(make("1", 100));
    expect(c.getEntries()[0].retries).toBe(100);
  });
});

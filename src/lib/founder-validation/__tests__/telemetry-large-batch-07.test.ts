// @ts-nocheck
import { describe, it, expect } from "bun:test";
import { TelemetryCollector, type TelemetryEntry } from "../index";

describe("TelemetryCollector large batch recording", () => {
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

  it("records 1000 entries", () => {
    const c = new TelemetryCollector("t");
    for (let i = 0; i < 1000; i++) c.record(make(String(i)));
    expect(c.getEntries()).toHaveLength(1000);
  });

  it("clears 1000 entries", () => {
    const c = new TelemetryCollector("t");
    for (let i = 0; i < 1000; i++) c.record(make(String(i)));
    c.clear();
    expect(c.getEntries()).toHaveLength(0);
  });

  it("unique IDs across 1000 entries", () => {
    const c = new TelemetryCollector("t");
    for (let i = 0; i < 1000; i++) c.record(make(String(i)));
    const ids = new Set(c.getEntries().map(e => e.id));
    expect(ids.size).toBe(1000);
  });
});

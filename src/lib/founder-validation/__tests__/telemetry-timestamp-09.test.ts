// @ts-nocheck
import { describe, it, expect } from "bun:test";
import { TelemetryCollector, type TelemetryEntry } from "../index";

describe("TelemetryCollector timestamp tracking", () => {
  function make(id: string, ts?: Date): TelemetryEntry {
    return {
      id, timestamp: ts ?? new Date(), tenant: "t", worker: "w", queue: "q",
      provider: "p", model: "m", latencyMs: 100, promptTokens: 10,
      completionTokens: 10, totalTokens: 20, costUsd: 0.01, retries: 0,
      queueWaitMs: 10, executionTimeMs: 90, cacheHit: false, memoryHit: false,
      ruleHit: false, patternHit: false, resolvedBy: "ai", confidence: 0.9,
      outputQualityScore: 0.8, errors: [], recoveryPath: null,
    };
  }

  it("entries preserve their timestamps", () => {
    const c = new TelemetryCollector("t");
    const now = new Date("2024-06-15T12:00:00Z");
    c.record(make("1", now));
    expect(c.getEntries()[0].timestamp).toEqual(now);
  });

  it("entries can have different timestamps", () => {
    const c = new TelemetryCollector("t");
    c.record(make("1", new Date("2024-01-01")));
    c.record(make("2", new Date("2024-12-31")));
    const ts = c.getEntries().map(e => e.timestamp.getTime());
    expect(ts[0]).toBeLessThan(ts[1]);
  });
});

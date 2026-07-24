// @ts-nocheck
import { describe, it, expect } from "bun:test";
import { TelemetryCollector, type TelemetryEntry } from "../index";

describe("TelemetryCollector timestamp tracking", () => {
  function make(overrides?: Partial<TelemetryEntry>): Omit<TelemetryEntry, 'id' | 'timestamp'> {
    return {
      tenant: "t", worker: "w", queue: "q",
      provider: "p", model: "m", latencyMs: 100, promptTokens: 10,
      completionTokens: 10, totalTokens: 20, costUsd: 0.01, retries: 0,
      queueWaitMs: 10, executionTimeMs: 90, cacheHit: false, memoryHit: false,
      ruleHit: false, patternHit: false, resolvedBy: "ai", confidence: 0.9,
      outputQualityScore: 0.8, errors: [], recoveryPath: null,
      ...overrides,
    };
  }

  it("entries auto-generate timestamps", () => {
    const c = new TelemetryCollector("t");
    const before = new Date();
    c.record(make());
    const after = new Date();
    const ts = c.getEntries()[0].timestamp;
    expect(ts.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(ts.getTime()).toBeLessThanOrEqual(after.getTime());
  });

  it("entries get timestamps on record", () => {
    const c = new TelemetryCollector("t");
    c.record(make());
    c.record(make());
    const ts = c.getEntries().map(e => e.timestamp.getTime());
    // Both timestamps are auto-generated near the current time;
    // the second should be >= the first (sequential recording)
    expect(ts[1]).toBeGreaterThanOrEqual(ts[0]);
  });
});

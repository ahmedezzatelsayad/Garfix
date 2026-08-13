import { describe, it, expect } from "bun:test";
import { TelemetryCollector, type TelemetryEntry } from "../index";

describe("TelemetryCollector error entries", () => {
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

  it("entries with empty error array are valid", () => {
    const c = new TelemetryCollector("t");
    c.record(make("1", { errors: [] }));
    expect(c.getEntries()).toHaveLength(1);
  });

  it("entries with error strings are valid", () => {
    const c = new TelemetryCollector("t");
    c.record(make("1", { errors: ["timeout", "rate_limit"] }));
    expect(c.getEntries()[0].errors).toHaveLength(2);
  });

  it("filter entries with errors", () => {
    const c = new TelemetryCollector("t");
    c.record(make("1", { errors: [] }));
    c.record(make("2", { errors: ["fail"] }));
    c.record(make("3", { errors: [] }));
    expect(c.getEntries().filter(e => e.errors.length > 0)).toHaveLength(1);
  });
});

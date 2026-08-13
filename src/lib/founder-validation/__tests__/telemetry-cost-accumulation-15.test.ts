import { describe, it, expect } from "bun:test";
import { TelemetryCollector, type TelemetryEntry } from "../index";

describe("TelemetryCollector cost accumulation", () => {
  function make(id: string, cost: number): TelemetryEntry {
    return {
      id, timestamp: new Date(), tenant: "t", worker: "w", queue: "q",
      provider: "p", model: "m", latencyMs: 100, promptTokens: 10,
      completionTokens: 10, totalTokens: 20, costUsd: cost, retries: 0,
      queueWaitMs: 10, executionTimeMs: 90, cacheHit: false, memoryHit: false,
      ruleHit: false, patternHit: false, resolvedBy: "ai", confidence: 0.9,
      outputQualityScore: 0.8, errors: [], recoveryPath: null,
    };
  }

  it("sums total cost across entries", () => {
    const c = new TelemetryCollector("t");
    c.record(make("1", 0.5)); c.record(make("2", 1.5)); c.record(make("3", 3.0));
    const total = c.getEntries().reduce((s, e) => s + e.costUsd, 0);
    expect(total).toBe(5.0);
  });

  it("zero cost entries contribute zero", () => {
    const c = new TelemetryCollector("t");
    c.record(make("1", 0)); c.record(make("2", 0));
    expect(c.getEntries().reduce((s, e) => s + e.costUsd, 0)).toBe(0);
  });

  it("handles very small costs", () => {
    const c = new TelemetryCollector("t");
    c.record(make("1", 0.0001));
    expect(c.getEntries()[0].costUsd).toBe(0.0001);
  });
});

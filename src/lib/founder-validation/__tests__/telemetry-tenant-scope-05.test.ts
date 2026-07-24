// @ts-nocheck
import { describe, it, expect } from "bun:test";
import { TelemetryCollector, type TelemetryEntry } from "../index";

describe("TelemetryCollector tenant isolation", () => {
  function make(id: string, tenant: string): TelemetryEntry {
    return {
      id, timestamp: new Date(), tenant, worker: "w", queue: "q",
      provider: "p", model: "m", latencyMs: 100, promptTokens: 10,
      completionTokens: 10, totalTokens: 20, costUsd: 0.01, retries: 0,
      queueWaitMs: 10, executionTimeMs: 90, cacheHit: false, memoryHit: false,
      ruleHit: false, patternHit: false, resolvedBy: "ai", confidence: 0.9,
      outputQualityScore: 0.8, errors: [], recoveryPath: null,
    };
  }

  it("each collector has its own entries", () => {
    const a = new TelemetryCollector("tenant-a");
    const b = new TelemetryCollector("tenant-b");
    a.record(make("1", "tenant-a"));
    b.record(make("2", "tenant-b"));
    expect(a.getEntries()).toHaveLength(1);
    expect(b.getEntries()).toHaveLength(1);
    expect(a.getEntries()[0].tenant).toBe("tenant-a");
    expect(b.getEntries()[0].tenant).toBe("tenant-b");
  });

  it("clearing one does not affect the other", () => {
    const a = new TelemetryCollector("a"), b = new TelemetryCollector("b");
    a.record(make("1", "a")); b.record(make("2", "b"));
    a.clear();
    expect(a.getEntries()).toHaveLength(0);
    expect(b.getEntries()).toHaveLength(1);
  });
});

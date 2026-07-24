// @ts-nocheck
import { describe, it, expect } from "bun:test";
import { TelemetryCollector, type TelemetryEntry } from "../index";

describe("TelemetryCollector getEntries", () => {
  function make(id: string, overrides?: Partial<TelemetryEntry>): TelemetryEntry {
    return {
      id, timestamp: new Date(), tenant: "t", worker: "w", queue: "q",
      provider: "p", model: "m", latencyMs: 100, promptTokens: 10,
      completionTokens: 10, totalTokens: 20, costUsd: 0.01, retries: 0,
      queueWaitMs: 10, executionTimeMs: 90, cacheHit: false, memoryHit: false,
      ruleHit: false, patternHit: false, resolvedBy: "ai", confidence: 0.9,
      outputQualityScore: 0.8, errors: [], recoveryPath: null,
      ...overrides,
    };
  }

  it("returns array of recorded entries", () => {
    const c = new TelemetryCollector("t");
    c.record(make("1")); c.record(make("2"));
    expect(c.getEntries()).toHaveLength(2);
  });

  it("returns copy not reference", () => {
    const c = new TelemetryCollector("t");
    c.record(make("1"));
    const a = c.getEntries();
    const b = c.getEntries();
    expect(a).not.toBe(b);
    expect(a.length).toBe(b.length);
  });

  it("returns entries in insertion order", () => {
    const c = new TelemetryCollector("t");
    for (let i = 0; i < 10; i++) c.record(make(String(i), { latencyMs: i * 100 }));
    const latencies = c.getEntries().map(e => e.latencyMs);
    expect(latencies).toEqual([0, 100, 200, 300, 400, 500, 600, 700, 800, 900]);
  });
});

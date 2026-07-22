// @ts-nocheck
import { describe, it, expect } from "bun:test";
import { TelemetryCollector, calculateMetrics, type TelemetryEntry } from "../index";

describe("Metrics token usage tracking", () => {
  function base(overrides: Partial<TelemetryEntry> = {}): TelemetryEntry {
    return {
      id: "t-1", timestamp: new Date(), tenant: "a", worker: "w", queue: "q",
      provider: "openrouter", model: "m", latencyMs: 100, promptTokens: 100,
      completionTokens: 50, totalTokens: 150, costUsd: 0.01, retries: 0,
      queueWaitMs: 10, executionTimeMs: 90, cacheHit: false, memoryHit: false,
      ruleHit: false, patternHit: false, resolvedBy: "ai", confidence: 0.9,
      outputQualityScore: 0.8, errors: [], recoveryPath: null, ...overrides,
    };
  }

  it("totalTokenUsage sums all entries", () => {
    const c = new TelemetryCollector("t");
    c.record(base()); c.record(base()); c.record(base());
    const m = calculateMetrics(c.getEntries(), []);
    expect(m.totalTokenUsage).toBe(450);
  });

  it("empty entries produce zero total tokens", () => {
    expect(calculateMetrics([], []).totalTokenUsage).toBe(0);
  });

  it("handles zero token entries", () => {
    const c = new TelemetryCollector("t");
    c.record(base({ promptTokens: 0, completionTokens: 0, totalTokens: 0 }));
    const m = calculateMetrics(c.getEntries(), []);
    expect(m.totalTokenUsage).toBe(0);
  });

  it("handles large token counts", () => {
    const c = new TelemetryCollector("t");
    c.record(base({ promptTokens: 100000, completionTokens: 50000, totalTokens: 150000 }));
    const m = calculateMetrics(c.getEntries(), []);
    expect(m.totalTokenUsage).toBe(150000);
  });

  it("totalRequests counts entries", () => {
    const c = new TelemetryCollector("t");
    for (let i = 0; i < 25; i++) c.record(base({ id: `t-${i}` }));
    expect(calculateMetrics(c.getEntries(), []).totalRequests).toBe(25);
  });
});

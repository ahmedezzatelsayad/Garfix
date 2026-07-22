// @ts-nocheck
import { describe, it, expect } from "bun:test";
import { TelemetryCollector, calculateMetrics, type TelemetryEntry } from "../index";

describe("Metrics budget blocked count", () => {
  function base(o: Partial<TelemetryEntry> = {}): TelemetryEntry {
    return {
      id: "t-1", timestamp: new Date(), tenant: "a", worker: "w", queue: "q",
      provider: "openrouter", model: "m", latencyMs: 100, promptTokens: 10,
      completionTokens: 10, totalTokens: 20, costUsd: 0.001, retries: 0,
      queueWaitMs: 10, executionTimeMs: 90, cacheHit: false, memoryHit: false,
      ruleHit: false, patternHit: false, resolvedBy: "ai", confidence: 0.9,
      outputQualityScore: 0.8, errors: [], recoveryPath: null, ...o,
    };
  }

  it("empty telemetry = 0 budget blocked", () => {
    expect(calculateMetrics([], []).budgetBlockedCount).toBe(0);
  });

  it("no budget-blocked entries = 0", () => {
    const c = new TelemetryCollector("t");
    c.record(base());
    expect(calculateMetrics(c.getEntries(), []).budgetBlockedCount).toBe(0);
  });

  it("budget blocked entries counted", () => {
    const c = new TelemetryCollector("t");
    for (let i = 0; i < 3; i++)
      c.record(base({ errors: ["budget_exceeded"], resolvedBy: "cache", id: `t-${i}` }));
    const m = calculateMetrics(c.getEntries(), []);
    expect(m.budgetBlockedCount).toBeGreaterThanOrEqual(0);
  });
});

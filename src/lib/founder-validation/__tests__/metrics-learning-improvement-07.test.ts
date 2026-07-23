// @ts-nocheck
import { describe, it, expect } from "bun:test";
import { TelemetryCollector, calculateMetrics, type TelemetryEntry } from "../index";

describe("Metrics learning improvement", () => {
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

  it("improvementPct is zero when costs are equal", () => {
    const c = new TelemetryCollector("t");
    for (let i = 0; i < 20; i++) c.record(base({ costUsd: 0.01, id: `t-${i}` }));
    const m = calculateMetrics(c.getEntries(), []);
    expect(m.learningImprovement.improvementPct).toBe(0);
  });

  it("improvementPct is positive when second half cheaper", () => {
    const c = new TelemetryCollector("t");
    for (let i = 0; i < 10; i++) c.record(base({ costUsd: 0.10, id: `h-${i}` }));
    for (let i = 0; i < 10; i++) c.record(base({ costUsd: 0.05, id: `l-${i}` }));
    const m = calculateMetrics(c.getEntries(), []);
    expect(m.learningImprovement.improvementPct).toBeGreaterThan(0);
    expect(m.learningImprovement.firstHalfAvgCost).toBeGreaterThan(
      m.learningImprovement.secondHalfAvgCost
    );
  });

  it("single entry has zero improvement", () => {
    const c = new TelemetryCollector("t");
    c.record(base());
    const m = calculateMetrics(c.getEntries(), []);
    expect(m.learningImprovement.improvementPct).toBe(0);
  });
});

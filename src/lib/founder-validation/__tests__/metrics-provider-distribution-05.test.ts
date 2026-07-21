import { describe, it, expect } from "bun:test";
import { TelemetryCollector, calculateMetrics, type TelemetryEntry } from "../index";

describe("Metrics provider distribution", () => {
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

  it("single provider has count 1", () => {
    const c = new TelemetryCollector("t");
    c.record(base({ provider: "anthropic" }));
    const d = calculateMetrics(c.getEntries(), []).providerDistribution;
    expect(d["anthropic"]).toBe(1);
  });

  it("multiple providers counted correctly", () => {
    const c = new TelemetryCollector("t");
    for (let i = 0; i < 7; i++) c.record(base({ provider: "openai", id: `a-${i}` }));
    for (let i = 0; i < 3; i++) c.record(base({ provider: "anthropic", id: `b-${i}` }));
    const d = calculateMetrics(c.getEntries(), []).providerDistribution;
    expect(d["openai"]).toBe(7);
    expect(d["anthropic"]).toBe(3);
  });

  it("empty entries produce empty distribution", () => {
    expect(calculateMetrics([], []).providerDistribution).toEqual({});
  });

  it("model distribution tracks models", () => {
    const c = new TelemetryCollector("t");
    c.record(base({ model: "gpt-4" }));
    c.record(base({ model: "claude-3" }));
    const d = calculateMetrics(c.getEntries(), []).modelDistribution;
    expect(d["gpt-4"]).toBe(1);
    expect(d["claude-3"]).toBe(1);
  });
});

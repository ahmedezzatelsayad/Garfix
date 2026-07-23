// @ts-nocheck
import { describe, it, expect } from "bun:test";
import { TelemetryCollector, calculateMetrics, type TelemetryEntry } from "../index";

describe("Metrics with single entry", () => {
  const entry: TelemetryEntry = {
    id: "single", timestamp: new Date(), tenant: "solo", worker: "w1", queue: "q1",
    provider: "anthropic", model: "claude-3", latencyMs: 250, promptTokens: 500,
    completionTokens: 200, totalTokens: 700, costUsd: 0.05, retries: 2,
    queueWaitMs: 50, executionTimeMs: 200, cacheHit: true, memoryHit: true,
    ruleHit: true, patternHit: true, resolvedBy: "cache", confidence: 0.95,
    outputQualityScore: 0.9, errors: [], recoveryPath: null,
  };

  it("totalRequests = 1", () => {
    const c = new TelemetryCollector("t"); c.record(entry);
    expect(calculateMetrics(c.getEntries(), []).totalRequests).toBe(1);
  });

  it("all hit rates = 1.0", () => {
    const c = new TelemetryCollector("t"); c.record(entry);
    const m = calculateMetrics(c.getEntries(), []);
    expect(m.cacheHitRate).toBe(1);
    expect(m.memoryHitRate).toBe(1);
    expect(m.ruleHitRate).toBe(1);
    expect(m.patternHitRate).toBe(1);
  });

  it("costs match entry", () => {
    const c = new TelemetryCollector("t"); c.record(entry);
    const m = calculateMetrics(c.getEntries(), []);
    expect(m.totalUsdSpent).toBe(0.05);
    expect(m.avgCostPerRequest).toBe(0.05);
  });

  it("tokens match entry", () => {
    const c = new TelemetryCollector("t"); c.record(entry);
    expect(calculateMetrics(c.getEntries(), []).totalTokenUsage).toBe(700);
  });
});

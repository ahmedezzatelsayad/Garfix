import { describe, it, expect } from "bun:test";
import { TelemetryCollector, calculateMetrics, type TelemetryEntry } from "../index";

describe("Metrics performance characteristics with 100 entries", () => {
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

  it("calculates 100 entries efficiently", () => {
    const c = new TelemetryCollector("t");
    for (let i = 0; i < 100; i++) c.record(base({ id: `t-${i}` }));
    const start = Date.now();
    const m = calculateMetrics(c.getEntries(), []);
    expect(Date.now() - start).toBeLessThan(1000);
    expect(m.totalRequests).toBe(100);
  });

  it("p50 < p95 < p99", () => {
    const c = new TelemetryCollector("t");
    for (let i = 0; i < 100; i++) c.record(base({ latencyMs: i, id: `t-${i}` }));
    const m = calculateMetrics(c.getEntries(), []);
    expect(m.p50Latency).toBeLessThanOrEqual(m.p95Latency);
    expect(m.p95Latency).toBeLessThanOrEqual(m.p99Latency);
  });

  it("top tenants limited in count", () => {
    const c = new TelemetryCollector("t");
    for (let i = 0; i < 100; i++) c.record(base({ tenant: `tenant-${i}`, costUsd: i, id: `t-${i}` }));
    const top = calculateMetrics(c.getEntries(), []).highestCostTenants;
    expect(top.length).toBeLessThanOrEqual(10);
  });
});

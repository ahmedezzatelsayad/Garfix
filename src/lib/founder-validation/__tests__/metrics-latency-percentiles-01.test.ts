import { describe, it, expect } from "bun:test";
import { TelemetryCollector, calculateMetrics, seedEnterpriseData, type TelemetryEntry } from "../index";

describe("Metrics latency percentile calculations", () => {
  function makeEntry(overrides: Partial<TelemetryEntry> = {}): TelemetryEntry {
    return {
      id: "t-1", timestamp: new Date(), tenant: "a", worker: "w", queue: "q",
      provider: "openrouter", model: "m", latencyMs: 100, promptTokens: 10,
      completionTokens: 10, totalTokens: 20, costUsd: 0.01, retries: 0,
      queueWaitMs: 10, executionTimeMs: 90, cacheHit: false, memoryHit: false,
      ruleHit: false, patternHit: false, resolvedBy: "ai", confidence: 0.9,
      outputQualityScore: 0.8, errors: [], recoveryPath: null, ...overrides,
    };
  }

  it("p50 should be median of sorted latencies", () => {
    const c = new TelemetryCollector("test");
    [10, 20, 30, 40, 50].forEach(ms => c.record({ ...makeEntry(), latencyMs: ms, id: `t-${ms}` }));
    const metrics = calculateMetrics(c.getEntries(), []);
    expect(metrics.p50Latency).toBe(30);
  });

  it("p95 should be high percentile", () => {
    const c = new TelemetryCollector("test");
    for (let i = 0; i < 100; i++) c.record({ ...makeEntry(), latencyMs: i * 10, id: `t-${i}` });
    const metrics = calculateMetrics(c.getEntries(), []);
    expect(metrics.p95Latency).toBeGreaterThanOrEqual(900);
  });

  it("p99 should be near max", () => {
    const c = new TelemetryCollector("test");
    for (let i = 0; i < 100; i++) c.record({ ...makeEntry(), latencyMs: i, id: `t-${i}` });
    const metrics = calculateMetrics(c.getEntries(), []);
    expect(metrics.p99Latency).toBeGreaterThanOrEqual(95);
  });

  it("single entry has all percentiles equal", () => {
    const c = new TelemetryCollector("test");
    c.record(makeEntry());
    const m = calculateMetrics(c.getEntries(), []);
    expect(m.p50Latency).toBe(100);
    expect(m.p95Latency).toBe(100);
    expect(m.p99Latency).toBe(100);
  });

  it("all zero latencies produce zero percentiles", () => {
    const c = new TelemetryCollector("test");
    for (let i = 0; i < 10; i++) c.record({ ...makeEntry(), latencyMs: 0, id: `t-${i}` });
    const m = calculateMetrics(c.getEntries(), []);
    expect(m.p50Latency).toBe(0);
    expect(m.p95Latency).toBe(0);
    expect(m.p99Latency).toBe(0);
  });

  it("requestsPerMinute should be non-negative", () => {
    const m = calculateMetrics([], []);
    expect(m.requestsPerMinute).toBeGreaterThanOrEqual(0);
  });
});

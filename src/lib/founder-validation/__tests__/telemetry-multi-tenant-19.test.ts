// @ts-nocheck
import { describe, it, expect } from "bun:test";
import { TelemetryCollector, type TelemetryEntry } from "../index";

describe("TelemetryCollector multi-tenant isolation", () => {
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

  it("20 tenants each have their own collector", () => {
    const collectors = Array.from({ length: 20 }, (_, i) => new TelemetryCollector(`t-${i}`));
    collectors.forEach((c, i) => c.record(make(`e-${i}`, `t-${i}`)));
    collectors.forEach((c, i) => {
      expect(c.getEntries()).toHaveLength(1);
      expect(c.getEntries()[0].tenant).toBe(`t-${i}`);
    });
  });

  it("entries in one collector never appear in another", () => {
    const a = new TelemetryCollector("a"), b = new TelemetryCollector("b");
    a.record(make("a1", "a")); a.record(make("a2", "a"));
    b.record(make("b1", "b"));
    const aIds = new Set(a.getEntries().map(e => e.id));
    b.getEntries().forEach(e => expect(aIds.has(e.id)).toBe(false));
  });
});

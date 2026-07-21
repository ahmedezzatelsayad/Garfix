// @ts-nocheck
import { describe, it, expect } from "bun:test";
import { TelemetryCollector, type TelemetryEntry } from "../index";

describe("TelemetryCollector provider tracking", () => {
  function make(id: string, provider: string): TelemetryEntry {
    return {
      id, timestamp: new Date(), tenant: "t", worker: "w", queue: "q",
      provider, model: "m", latencyMs: 100, promptTokens: 10,
      completionTokens: 10, totalTokens: 20, costUsd: 0.01, retries: 0,
      queueWaitMs: 10, executionTimeMs: 90, cacheHit: false, memoryHit: false,
      ruleHit: false, patternHit: false, resolvedBy: "ai", confidence: 0.9,
      outputQualityScore: 0.8, errors: [], recoveryPath: null,
    };
  }

  it("tracks multiple providers", () => {
    const c = new TelemetryCollector("t");
    ["openai", "anthropic", "google", "deepseek"].forEach((p, i) => c.record(make(String(i), p)));
    const providers = c.getEntries().map(e => e.provider);
    expect(new Set(providers).size).toBe(4);
  });

  it("counts per provider", () => {
    const c = new TelemetryCollector("t");
    for (let i = 0; i < 10; i++) c.record(make(String(i), i < 7 ? "openai" : "anthropic"));
    const providers = c.getEntries().map(e => e.provider);
    expect(providers.filter(p => p === "openai")).toHaveLength(7);
    expect(providers.filter(p => p === "anthropic")).toHaveLength(3);
  });
});

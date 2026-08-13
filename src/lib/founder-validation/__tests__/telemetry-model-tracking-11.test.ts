import { describe, it, expect } from "bun:test";
import { TelemetryCollector, type TelemetryEntry } from "../index";

describe("TelemetryCollector model tracking", () => {
  function make(id: string, model: string): TelemetryEntry {
    return {
      id, timestamp: new Date(), tenant: "t", worker: "w", queue: "q",
      provider: "p", model, latencyMs: 100, promptTokens: 10,
      completionTokens: 10, totalTokens: 20, costUsd: 0.01, retries: 0,
      queueWaitMs: 10, executionTimeMs: 90, cacheHit: false, memoryHit: false,
      ruleHit: false, patternHit: false, resolvedBy: "ai", confidence: 0.9,
      outputQualityScore: 0.8, errors: [], recoveryPath: null,
    };
  }

  it("tracks different models", () => {
    const c = new TelemetryCollector("t");
    ["gpt-4", "claude-3", "gemini-pro"].forEach((m, i) => c.record(make(String(i), m)));
    expect(new Set(c.getEntries().map(e => e.model)).size).toBe(3);
  });

  it("model count matches entries", () => {
    const c = new TelemetryCollector("t");
    for (let i = 0; i < 20; i++) c.record(make(String(i), "gpt-4"));
    expect(c.getEntries().filter(e => e.model === "gpt-4")).toHaveLength(20);
  });
});

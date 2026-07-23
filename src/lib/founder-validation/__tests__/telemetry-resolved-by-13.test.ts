// @ts-nocheck
import { describe, it, expect } from "bun:test";
import { TelemetryCollector, type TelemetryEntry, type CascadeStage } from "../index";

describe("TelemetryCollector resolvedBy tracking", () => {
  function make(id: string, stage: CascadeStage): TelemetryEntry {
    return {
      id, timestamp: new Date(), tenant: "t", worker: "w", queue: "q",
      provider: "p", model: "m", latencyMs: 100, promptTokens: 10,
      completionTokens: 10, totalTokens: 20, costUsd: 0.01, retries: 0,
      queueWaitMs: 10, executionTimeMs: 90, cacheHit: false, memoryHit: false,
      ruleHit: false, patternHit: false, resolvedBy: stage, confidence: 0.9,
      outputQualityScore: 0.8, errors: [], recoveryPath: null,
    };
  }

  it("all cascade stages represented", () => {
    const stages: CascadeStage[] = ["cache", "pattern", "rule", "memory", "ai"];
    const c = new TelemetryCollector("t");
    stages.forEach((s, i) => c.record(make(String(i), s)));
    expect(new Set(c.getEntries().map(e => e.resolvedBy)).size).toBe(5);
  });

  it("counts per stage", () => {
    const c = new TelemetryCollector("t");
    for (let i = 0; i < 10; i++) c.record(make(String(i), "ai"));
    for (let i = 0; i < 5; i++) c.record(make(`c${i}`, "cache"));
    const entries = c.getEntries();
    expect(entries.filter(e => e.resolvedBy === "ai")).toHaveLength(10);
    expect(entries.filter(e => e.resolvedBy === "cache")).toHaveLength(5);
  });
});

// @ts-nocheck
import { describe, it, expect } from "bun:test";
import { TelemetryCollector, type TelemetryEntry } from "../index";

describe("TelemetryCollector output quality scores", () => {
  function make(id: string, score: number): TelemetryEntry {
    return {
      id, timestamp: new Date(), tenant: "t", worker: "w", queue: "q",
      provider: "p", model: "m", latencyMs: 100, promptTokens: 10,
      completionTokens: 10, totalTokens: 20, costUsd: 0.01, retries: 0,
      queueWaitMs: 10, executionTimeMs: 90, cacheHit: false, memoryHit: false,
      ruleHit: false, patternHit: false, resolvedBy: "ai", confidence: 0.9,
      outputQualityScore: score, errors: [], recoveryPath: null,
    };
  }

  it("tracks quality from 0 to 1", () => {
    const c = new TelemetryCollector("t");
    [0, 0.25, 0.5, 0.75, 1.0].forEach((s, i) => c.record(make(String(i), s)));
    const scores = c.getEntries().map(e => e.outputQualityScore);
    expect(Math.min(...scores)).toBe(0);
    expect(Math.max(...scores)).toBe(1);
  });

  it("average quality is calculable", () => {
    const c = new TelemetryCollector("t");
    [0.6, 0.7, 0.8, 0.9].forEach((s, i) => c.record(make(String(i), s)));
    const avg = c.getEntries().reduce((s, e) => s + e.outputQualityScore, 0) / 4;
    expect(avg).toBeCloseTo(0.75, 6);
  });

  it("all perfect quality entries", () => {
    const c = new TelemetryCollector("t");
    for (let i = 0; i < 10; i++) c.record(make(String(i), 1.0));
    expect(c.getEntries().every(e => e.outputQualityScore === 1.0)).toBe(true);
  });
});

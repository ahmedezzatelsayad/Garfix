// @ts-nocheck
import { describe, it, expect } from "bun:test";
import { TelemetryCollector, type TelemetryEntry } from "../index";

describe("TelemetryCollector confidence range", () => {
  function make(id: string, conf: number): TelemetryEntry {
    return {
      id, timestamp: new Date(), tenant: "t", worker: "w", queue: "q",
      provider: "p", model: "m", latencyMs: 100, promptTokens: 10,
      completionTokens: 10, totalTokens: 20, costUsd: 0.01, retries: 0,
      queueWaitMs: 10, executionTimeMs: 90, cacheHit: false, memoryHit: false,
      ruleHit: false, patternHit: false, resolvedBy: "ai", confidence: conf,
      outputQualityScore: 0.8, errors: [], recoveryPath: null,
    };
  }

  it("records confidence from 0 to 1", () => {
    const c = new TelemetryCollector("t");
    [0, 0.1, 0.5, 0.9, 1.0].forEach((conf, i) => c.record(make(String(i), conf)));
    const confs = c.getEntries().map(e => e.confidence);
    expect(Math.min(...confs)).toBe(0);
    expect(Math.max(...confs)).toBe(1);
  });

  it("average confidence is calculable", () => {
    const c = new TelemetryCollector("t");
    [0.8, 0.9, 1.0].forEach((conf, i) => c.record(make(String(i), conf)));
    const avg = c.getEntries().reduce((s, e) => s + e.confidence, 0) / 3;
    expect(avg).toBeCloseTo(0.9, 6);
  });
});

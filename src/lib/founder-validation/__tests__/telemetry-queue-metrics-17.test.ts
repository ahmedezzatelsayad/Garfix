// @ts-nocheck
import { describe, it, expect } from "bun:test";
import { TelemetryCollector, type TelemetryEntry } from "../index";

describe("TelemetryCollector queue metrics", () => {
  function make(id: string, queue: string, waitMs: number): TelemetryEntry {
    return {
      id, timestamp: new Date(), tenant: "t", worker: "w", queue,
      provider: "p", model: "m", latencyMs: 100, promptTokens: 10,
      completionTokens: 10, totalTokens: 20, costUsd: 0.01, retries: 0,
      queueWaitMs: waitMs, executionTimeMs: 90, cacheHit: false, memoryHit: false,
      ruleHit: false, patternHit: false, resolvedBy: "ai", confidence: 0.9,
      outputQualityScore: 0.8, errors: [], recoveryPath: null,
    };
  }

  it("tracks different queues", () => {
    const c = new TelemetryCollector("t");
    ["ai-jobs", "email-jobs", "backup-jobs"].forEach((q, i) => c.record(make(String(i), q, 10)));
    expect(new Set(c.getEntries().map(e => e.queue)).size).toBe(3);
  });

  it("queue wait times stored correctly", () => {
    const c = new TelemetryCollector("t");
    c.record(make("1", "q", 5000));
    expect(c.getEntries()[0].queueWaitMs).toBe(5000);
  });
});

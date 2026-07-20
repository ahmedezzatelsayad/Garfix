/**
 * observatory.test.ts — Comprehensive tests for the AI Observatory module.
 *
 * Tests recordDecisionTrace, getDecisionTrace, getDecisionTraces, and
 * getExplainabilitySummary with mocked Prisma DB.
 */

import { describe, it, expect, beforeEach, jest } from "bun:test";

// ─── Mock setup ──────────────────────────────────────────────────────────────

const mockDb = {
  companyRuntime: { findUnique: jest.fn(), upsert: jest.fn(), findMany: jest.fn(), update: jest.fn() },
  aIRequestLog: { create: jest.fn(), findMany: jest.fn(), aggregate: jest.fn(), groupBy: jest.fn(), count: jest.fn() },
  cacheEntry: { findUnique: jest.fn(), upsert: jest.fn(), update: jest.fn(), delete: jest.fn() },
  budgetConfig: { findUnique: jest.fn(), upsert: jest.fn(), update: jest.fn() },
  providerConfig: { findFirst: jest.fn(), findMany: jest.fn(), upsert: jest.fn(), create: jest.fn() },
  ruleCandidate: { findMany: jest.fn(), updateMany: jest.fn(), count: jest.fn() },
  aIMemoryEntry: { create: jest.fn(), findMany: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
  profitSnapshot: { create: jest.fn(), findMany: jest.fn(), groupBy: jest.fn() },
  globalPattern: { create: jest.fn(), findFirst: jest.fn(), findMany: jest.fn(), aggregate: jest.fn() },
  company: { findMany: jest.fn(), findUnique: jest.fn() },
  notification: { create: jest.fn(), findMany: jest.fn() },
  aiScoreSnapshot: { upsert: jest.fn(), findMany: jest.fn() },
  compiledRule: { create: jest.fn() },
  jobQueue: { findMany: jest.fn() },
};

jest.mock("@/lib/db", () => ({ db: mockDb }));
jest.mock("@/lib/logger", () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() } }));

import {
  recordDecisionTrace,
  getDecisionTrace,
  getDecisionTraces,
  getExplainabilitySummary,
  type DecisionTrace,
} from "@/lib/observatory";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeTrace(overrides?: Partial<DecisionTrace>): DecisionTrace {
  return {
    companyId: "co-1",
    timestamp: new Date().toISOString(),
    requestType: "ocr",
    normalizedInputHash: "hash-abc",
    stages: [
      { stage: "cache", hit: false, latencyMs: 2 },
      { stage: "pattern", hit: true, latencyMs: 10, confidence: 0.95 },
    ],
    finalResolvedBy: "pattern",
    provider: undefined,
    tokensUsed: undefined,
    costUsd: 0,
    latencyMs: 12,
    ...overrides,
  };
}

// ─── Test Suite ───────────────────────────────────────────────────────────────

describe("Observatory — recordDecisionTrace", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDb.aIMemoryEntry.create.mockResolvedValue({ id: "mem-1" });
  });

  it("stores trace as AIMemoryEntry with category 'decision_trace'", async () => {
    const trace = makeTrace();
    await recordDecisionTrace(trace);

    expect(mockDb.aIMemoryEntry.create).toHaveBeenCalledWith({
      data: {
        companySlug: "co-1",
        category: "decision_trace",
        content: JSON.stringify(trace),
      },
    });
  });

  it("stores complete trace data as JSON in content field", async () => {
    const trace = makeTrace({
      provider: "openrouter/deepseek",
      tokensUsed: 500,
      costUsd: 0.003,
      budgetStatus: "ok",
      economyMode: false,
    });
    await recordDecisionTrace(trace);

    const callData = mockDb.aIMemoryEntry.create.mock.calls[0][0].data;
    const parsed = JSON.parse(callData.content);
    expect(parsed.provider).toBe("openrouter/deepseek");
    expect(parsed.tokensUsed).toBe(500);
    expect(parsed.costUsd).toBe(0.003);
    expect(parsed.budgetStatus).toBe("ok");
    expect(parsed.economyMode).toBe(false);
  });

  it("uses companyId as companySlug", async () => {
    const trace = makeTrace({ companyId: "my-company" });
    await recordDecisionTrace(trace);

    expect(mockDb.aIMemoryEntry.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ companySlug: "my-company" }),
      }),
    );
  });

  it("handles storage errors non-fatally (does not throw)", async () => {
    mockDb.aIMemoryEntry.create.mockRejectedValue(new Error("DB write failed"));

    // Should not throw
    await expect(recordDecisionTrace(makeTrace())).resolves.toBeUndefined();
  });

  it("logs error on storage failure", async () => {
    const { logger } = await import("@/lib/logger");
    mockDb.aIMemoryEntry.create.mockRejectedValue(new Error("fail"));

    await recordDecisionTrace(makeTrace());
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining("failed to record decision trace"),
      expect.objectContaining({ err: "fail" }),
    );
  });
});

describe("Observatory — getDecisionTrace", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("finds trace by normalizedInputHash", async () => {
    const trace = makeTrace({ normalizedInputHash: "target-hash" });
    mockDb.aIMemoryEntry.findMany.mockResolvedValue([
      {
        id: "mem-1",
        companySlug: "co-1",
        category: "decision_trace",
        content: JSON.stringify(trace),
        createdAt: new Date(),
      },
    ]);

    const result = await getDecisionTrace("co-1", "target-hash");
    expect(result).not.toBeNull();
    expect(result!.normalizedInputHash).toBe("target-hash");
    expect(result!.finalResolvedBy).toBe("pattern");
  });

  it("returns null when hash not found", async () => {
    mockDb.aIMemoryEntry.findMany.mockResolvedValue([
      {
        id: "mem-2",
        companySlug: "co-1",
        category: "decision_trace",
        content: JSON.stringify(makeTrace({ normalizedInputHash: "other-hash" })),
        createdAt: new Date(),
      },
    ]);

    const result = await getDecisionTrace("co-1", "target-hash");
    expect(result).toBeNull();
  });

  it("returns null when no traces exist", async () => {
    mockDb.aIMemoryEntry.findMany.mockResolvedValue([]);

    const result = await getDecisionTrace("co-1", "any-hash");
    expect(result).toBeNull();
  });

  it("skips corrupted entries and continues searching", async () => {
    mockDb.aIMemoryEntry.findMany.mockResolvedValue([
      {
        id: "mem-bad",
        companySlug: "co-1",
        category: "decision_trace",
        content: "not-json{{{",
        createdAt: new Date(),
      },
      {
        id: "mem-good",
        companySlug: "co-1",
        category: "decision_trace",
        content: JSON.stringify(makeTrace({ normalizedInputHash: "find-me" })),
        createdAt: new Date(),
      },
    ]);

    const result = await getDecisionTrace("co-1", "find-me");
    expect(result).not.toBeNull();
    expect(result!.normalizedInputHash).toBe("find-me");
  });

  it("searches category 'decision_trace'", async () => {
    mockDb.aIMemoryEntry.findMany.mockResolvedValue([]);

    await getDecisionTrace("co-1", "hash");
    expect(mockDb.aIMemoryEntry.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          companySlug: "co-1",
          category: "decision_trace",
        }),
      }),
    );
  });

  it("handles DB error gracefully (returns null)", async () => {
    mockDb.aIMemoryEntry.findMany.mockRejectedValue(new Error("DB error"));

    const result = await getDecisionTrace("co-1", "hash");
    expect(result).toBeNull();
  });

  it("limits search to 100 recent entries", async () => {
    mockDb.aIMemoryEntry.findMany.mockResolvedValue([]);

    await getDecisionTrace("co-1", "hash");
    expect(mockDb.aIMemoryEntry.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 100 }),
    );
  });
});

describe("Observatory — getDecisionTraces", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns all traces when no filters", async () => {
    const trace1 = makeTrace({ normalizedInputHash: "h1", requestType: "ocr" });
    const trace2 = makeTrace({ normalizedInputHash: "h2", requestType: "matching" });

    mockDb.aIMemoryEntry.findMany.mockResolvedValue([
      { id: "m1", companySlug: "co-1", category: "decision_trace", content: JSON.stringify(trace1), createdAt: new Date() },
      { id: "m2", companySlug: "co-1", category: "decision_trace", content: JSON.stringify(trace2), createdAt: new Date() },
    ]);

    const traces = await getDecisionTraces({ companyId: "co-1" });
    expect(traces.length).toBe(2);
  });

  it("filters by requestType", async () => {
    const trace1 = makeTrace({ requestType: "ocr" });
    const trace2 = makeTrace({ requestType: "matching" });

    mockDb.aIMemoryEntry.findMany.mockResolvedValue([
      { id: "m1", companySlug: "co-1", category: "decision_trace", content: JSON.stringify(trace1), createdAt: new Date() },
      { id: "m2", companySlug: "co-1", category: "decision_trace", content: JSON.stringify(trace2), createdAt: new Date() },
    ]);

    const traces = await getDecisionTraces({ companyId: "co-1", requestType: "ocr" });
    expect(traces.length).toBe(1);
    expect(traces[0].requestType).toBe("ocr");
  });

  it("filters by resolvedBy", async () => {
    const trace1 = makeTrace({ finalResolvedBy: "cache" });
    const trace2 = makeTrace({ finalResolvedBy: "ai" });

    mockDb.aIMemoryEntry.findMany.mockResolvedValue([
      { id: "m1", companySlug: "co-1", category: "decision_trace", content: JSON.stringify(trace1), createdAt: new Date() },
      { id: "m2", companySlug: "co-1", category: "decision_trace", content: JSON.stringify(trace2), createdAt: new Date() },
    ]);

    const traces = await getDecisionTraces({ companyId: "co-1", resolvedBy: "ai" });
    expect(traces.length).toBe(1);
    expect(traces[0].finalResolvedBy).toBe("ai");
  });

  it("respects limit parameter", async () => {
    mockDb.aIMemoryEntry.findMany.mockResolvedValue([]);

    await getDecisionTraces({ companyId: "co-1", limit: 10 });
    expect(mockDb.aIMemoryEntry.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 10 }),
    );
  });

  it("uses default limit of 50", async () => {
    mockDb.aIMemoryEntry.findMany.mockResolvedValue([]);

    await getDecisionTraces({ companyId: "co-1" });
    expect(mockDb.aIMemoryEntry.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 50 }),
    );
  });

  it("handles corrupted entries gracefully (filters them out)", async () => {
    mockDb.aIMemoryEntry.findMany.mockResolvedValue([
      { id: "m-bad", companySlug: "co-1", category: "decision_trace", content: "broken", createdAt: new Date() },
      { id: "m-ok", companySlug: "co-1", category: "decision_trace", content: JSON.stringify(makeTrace()), createdAt: new Date() },
    ]);

    const traces = await getDecisionTraces({ companyId: "co-1" });
    expect(traces.length).toBe(1);
  });

  it("filters by both requestType and resolvedBy", async () => {
    const traces = [
      makeTrace({ requestType: "ocr", finalResolvedBy: "cache" }),
      makeTrace({ requestType: "ocr", finalResolvedBy: "ai" }),
      makeTrace({ requestType: "matching", finalResolvedBy: "cache" }),
    ];

    mockDb.aIMemoryEntry.findMany.mockResolvedValue(
      traces.map((t, i) => ({
        id: `m${i}`,
        companySlug: "co-1",
        category: "decision_trace",
        content: JSON.stringify(t),
        createdAt: new Date(),
      })),
    );

    const result = await getDecisionTraces({
      companyId: "co-1",
      requestType: "ocr",
      resolvedBy: "cache",
    });
    expect(result.length).toBe(1);
    expect(result[0].requestType).toBe("ocr");
    expect(result[0].finalResolvedBy).toBe("cache");
  });
});

describe("Observatory — getExplainabilitySummary", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns correct total requests", async () => {
    const logs = [
      { resolvedBy: "cache", latencyMs: 5, costUsd: 0, createdAt: new Date() },
      { resolvedBy: "ai", latencyMs: 500, costUsd: 0.002, createdAt: new Date() },
      { resolvedBy: "pattern", latencyMs: 10, costUsd: 0, createdAt: new Date() },
    ];
    mockDb.aIRequestLog.findMany.mockResolvedValue(logs);

    const summary = await getExplainabilitySummary("co-1");
    expect(summary.totalRequests).toBe(3);
  });

  it("returns correct average latency", async () => {
    const logs = [
      { resolvedBy: "cache", latencyMs: 100, costUsd: 0, createdAt: new Date() },
      { resolvedBy: "ai", latencyMs: 300, costUsd: 0.001, createdAt: new Date() },
    ];
    mockDb.aIRequestLog.findMany.mockResolvedValue(logs);

    const summary = await getExplainabilitySummary("co-1");
    expect(summary.avgLatencyMs).toBe(200); // (100 + 300) / 2
  });

  it("returns correct total cost", async () => {
    const logs = [
      { resolvedBy: "ai", latencyMs: 100, costUsd: 0.003, createdAt: new Date() },
      { resolvedBy: "ai", latencyMs: 200, costUsd: 0.007, createdAt: new Date() },
    ];
    mockDb.aIRequestLog.findMany.mockResolvedValue(logs);

    const summary = await getExplainabilitySummary("co-1");
    expect(summary.totalCostUsd).toBe("0.0100");
  });

  it("returns correct breakdown percentages", async () => {
    // 10 cache, 5 ai, 5 pattern = 20 total
    const logs: Array<{ resolvedBy: string; latencyMs: number; costUsd: number; createdAt: Date }> = [];
    for (let i = 0; i < 10; i++) logs.push({ resolvedBy: "cache", latencyMs: 5, costUsd: 0, createdAt: new Date() });
    for (let i = 0; i < 5; i++) logs.push({ resolvedBy: "ai", latencyMs: 500, costUsd: 0.001, createdAt: new Date() });
    for (let i = 0; i < 5; i++) logs.push({ resolvedBy: "pattern", latencyMs: 10, costUsd: 0, createdAt: new Date() });

    mockDb.aIRequestLog.findMany.mockResolvedValue(logs);

    const summary = await getExplainabilitySummary("co-1");
    const cacheBreakdown = summary.breakdown.find((b) => b.stage === "cache");
    const aiBreakdown = summary.breakdown.find((b) => b.stage === "ai");
    const patternBreakdown = summary.breakdown.find((b) => b.stage === "pattern");

    expect(cacheBreakdown!.count).toBe(10);
    expect(cacheBreakdown!.percentage).toBe("50.0%");

    expect(aiBreakdown!.count).toBe(5);
    expect(aiBreakdown!.percentage).toBe("25.0%");

    expect(patternBreakdown!.count).toBe(5);
    expect(patternBreakdown!.percentage).toBe("25.0%");
  });

  it("handles empty data (no logs)", async () => {
    mockDb.aIRequestLog.findMany.mockResolvedValue([]);

    const summary = await getExplainabilitySummary("co-1");
    expect(summary.totalRequests).toBe(0);
    expect(summary.avgLatencyMs).toBe(0);
    expect(summary.totalCostUsd).toBe("0.0000");
    expect(summary.breakdown).toEqual([]);
  });

  it("filters by period using periodDays", async () => {
    mockDb.aIRequestLog.findMany.mockResolvedValue([]);

    await getExplainabilitySummary("co-1", 7);
    expect(mockDb.aIRequestLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          companySlug: "co-1",
          createdAt: expect.any(Object),
        }),
      }),
    );
  });

  it("returns avgCostUsd as formatted string", async () => {
    const logs = [
      { resolvedBy: "ai", latencyMs: 100, costUsd: 0.002, createdAt: new Date() },
    ];
    mockDb.aIRequestLog.findMany.mockResolvedValue(logs);

    const summary = await getExplainabilitySummary("co-1");
    expect(summary.avgCostUsd).toBeDefined();
    expect(typeof summary.avgCostUsd).toBe("string");
  });

  it("handles zero-cost logs in cost calculation", async () => {
    const logs = [
      { resolvedBy: "cache", latencyMs: 5, costUsd: 0, createdAt: new Date() },
      { resolvedBy: "cache", latencyMs: 3, costUsd: 0, createdAt: new Date() },
    ];
    mockDb.aIRequestLog.findMany.mockResolvedValue(logs);

    const summary = await getExplainabilitySummary("co-1");
    expect(summary.totalCostUsd).toBe("0.0000");
  });

  it("includes period string in result", async () => {
    mockDb.aIRequestLog.findMany.mockResolvedValue([]);

    const summary = await getExplainabilitySummary("co-1", 30);
    expect(summary.period).toBe("30 days");
  });
});

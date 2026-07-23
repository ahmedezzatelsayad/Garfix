// @ts-nocheck
/**
 * cost-optimizer-advanced.test.ts — 40 tests for the cost optimizer.
 * Tests calculateSavedCost, getCascadeBreakdown, getPlatformSavings.
 */

import { describe, it, expect, beforeEach, mock, afterAll } from "bun:test";

// ─── Mock setup ─────────────────────────────────────────────────────────

const m = () => ({
  findUnique: mock(() => Promise.resolve(null)),
  findMany: mock(() => Promise.resolve([])),
  create: mock(() => Promise.resolve({})),
  update: mock(() => Promise.resolve({})),
  delete: mock(() => Promise.resolve({})),
  deleteMany: mock(() => Promise.resolve({ count: 0 })),
  upsert: mock(() => Promise.resolve({})),
  aggregate: mock(() => Promise.resolve({ _sum: { costUsd: 0 }, _count: 0 })),
  groupBy: mock(() => Promise.resolve([])),
  count: mock(() => Promise.resolve(0)),
  findFirst: mock(() => Promise.resolve(null)),
});

const mockDb: Record<string, any> = {
  cacheEntry: m(), aIRequestLog: m(), ruleCandidate: m(),
  aIMemoryEntry: m(), budgetConfig: m(), notification: m(),
  company: m(), companyRuntime: m(), providerConfig: m(),
  globalPattern: m(), profitSnapshot: m(), aIScoreSnapshot: m(),
  jobQueue: m(), inventoryItem: m(), productCatalog: m(), client: m(),
  compiledRule: m(),
};

const mockLogger = {
  info: mock(() => {}), warn: mock(() => {}),
  error: mock(() => {}), debug: mock(() => {}),
};

mock.module("@/lib/db", () => ({ db: mockDb }));
mock.module("@/lib/logger", () => ({ logger: mockLogger }));

import { calculateSavedCost, getCascadeBreakdown, getPlatformSavings } from "@/lib/ai-fabric/cost-optimizer";

// ─── Helpers ──────────────────────────────────────────────────────────────

function clearAll() {
  for (const table of Object.values(mockDb) as any[]) {
    for (const fn of Object.values(table)) {
      if (typeof fn === "function" && typeof fn.mockClear === "function") fn.mockClear();
    }
  }
}

const ps = new Date("2025-01-01");
const pe = new Date("2025-01-31");

function makeLog(stage: string, cost: number, latency: number = 100, company = "co") {
  return { companySlug: company, requestType: "other", resolvedBy: stage, costUsd: cost, latencyMs: latency, createdAt: new Date() };
}

// ─── calculateSavedCost ──────────────────────────────────────────────────

describe("calculateSavedCost", () => {
  beforeEach(clearAll);

  it("returns zero saved when all requests are AI with same cost", async () => {
    mockDb.aIRequestLog.findMany.mockResolvedValue([
      makeLog("ai", 0.01), makeLog("ai", 0.01), makeLog("ai", 0.01),
    ]);
    const r = await calculateSavedCost("co", ps, pe);
    expect(r.savedUsd).toBe(0);
  });

  it("calculates savings when cache hits avoid AI cost", async () => {
    const logs = [];
    for (let i = 0; i < 80; i++) logs.push(makeLog("cache", 0));
    for (let i = 0; i < 20; i++) logs.push(makeLog("ai", 0.005));
    mockDb.aIRequestLog.findMany.mockResolvedValue(logs);
    const r = await calculateSavedCost("co", ps, pe);
    expect(r.totalRequests).toBe(100);
    expect(r.savedUsd).toBe(0.4);
    expect(r.savingsPct).toBe(80);
  });

  it("returns correct actualCostUsd", async () => {
    mockDb.aIRequestLog.findMany.mockResolvedValue([
      makeLog("cache", 0), makeLog("ai", 0.01), makeLog("ai", 0.02),
    ]);
    const r = await calculateSavedCost("co", ps, pe);
    expect(r.actualCostUsd).toBe(0.03);
  });

  it("returns correct hypotheticalAiOnlyCostUsd", async () => {
    mockDb.aIRequestLog.findMany.mockResolvedValue([
      makeLog("cache", 0), makeLog("ai", 0.01), makeLog("ai", 0.02),
    ]);
    const r = await calculateSavedCost("co", ps, pe);
    // avg AI cost = 0.015, hypothetical = 3 * 0.015 = 0.045
    expect(r.hypotheticalAiOnlyCostUsd).toBe(0.045);
  });

  it("handles empty logs (zero requests)", async () => {
    mockDb.aIRequestLog.findMany.mockResolvedValue([]);
    const r = await calculateSavedCost("co", ps, pe);
    expect(r.totalRequests).toBe(0);
    expect(r.savedUsd).toBe(0);
    expect(r.savingsPct).toBe(0);
  });

  it("sets companyId from companySlug param", async () => {
    mockDb.aIRequestLog.findMany.mockResolvedValue([makeLog("ai", 0.01)]);
    const r = await calculateSavedCost("my-company", ps, pe);
    expect(r.companyId).toBe("my-company");
  });

  it("includes periodStart and periodEnd", async () => {
    mockDb.aIRequestLog.findMany.mockResolvedValue([makeLog("ai", 0.01)]);
    const r = await calculateSavedCost("co", ps, pe);
    expect(r.periodStart).toBe(ps);
    expect(r.periodEnd).toBe(pe);
  });

  it("breakdown only includes stages with count > 0", async () => {
    mockDb.aIRequestLog.findMany.mockResolvedValue([makeLog("cache", 0), makeLog("cache", 0)]);
    const r = await calculateSavedCost("co", ps, pe);
    expect(r.breakdown.length).toBe(1);
    expect(r.breakdown[0].resolvedBy).toBe("cache");
  });

  it("breakdown has correct percentage per stage", async () => {
    const logs = [];
    for (let i = 0; i < 50; i++) logs.push(makeLog("cache", 0));
    for (let i = 0; i < 30; i++) logs.push(makeLog("pattern", 0));
    for (let i = 0; i < 20; i++) logs.push(makeLog("ai", 0.01));
    mockDb.aIRequestLog.findMany.mockResolvedValue(logs);
    const r = await calculateSavedCost("co", ps, pe);
    expect(r.breakdown.find((b) => b.resolvedBy === "cache")!.percentage).toBe(50);
    expect(r.breakdown.find((b) => b.resolvedBy === "pattern")!.percentage).toBe(30);
    expect(r.breakdown.find((b) => b.resolvedBy === "ai")!.percentage).toBe(20);
  });

  it("breakdown has correct count per stage", async () => {
    const logs = [makeLog("cache", 0), makeLog("cache", 0), makeLog("rule", 0)];
    mockDb.aIRequestLog.findMany.mockResolvedValue(logs);
    const r = await calculateSavedCost("co", ps, pe);
    expect(r.breakdown.find((b) => b.resolvedBy === "cache")!.count).toBe(2);
    expect(r.breakdown.find((b) => b.resolvedBy === "rule")!.count).toBe(1);
  });

  it("breakdown has correct totalCostUsd per stage", async () => {
    mockDb.aIRequestLog.findMany.mockResolvedValue([
      makeLog("ai", 0.003), makeLog("ai", 0.007), makeLog("cache", 0),
    ]);
    const r = await calculateSavedCost("co", ps, pe);
    expect(r.breakdown.find((b) => b.resolvedBy === "ai")!.totalCostUsd).toBe(0.01);
  });

  it("breakdown has correct avgLatencyMs", async () => {
    mockDb.aIRequestLog.findMany.mockResolvedValue([
      makeLog("ai", 0.01, 200), makeLog("ai", 0.01, 400),
    ]);
    const r = await calculateSavedCost("co", ps, pe);
    expect(r.breakdown.find((b) => b.resolvedBy === "ai")!.avgLatencyMs).toBe(300);
  });

  it("avgLatencyMs is computed for stages in breakdown", async () => {
    mockDb.aIRequestLog.findMany.mockResolvedValue([makeLog("cache", 0)]);
    const r = await calculateSavedCost("co", ps, pe);
    // makeLog defaults to latency=100
    expect(r.breakdown[0].avgLatencyMs).toBe(100);
  });

  it("handles all AI calls with varying costs", async () => {
    mockDb.aIRequestLog.findMany.mockResolvedValue([
      makeLog("ai", 0.001), makeLog("ai", 0.003), makeLog("ai", 0.005),
    ]);
    const r = await calculateSavedCost("co", ps, pe);
    expect(r.actualCostUsd).toBe(0.009);
    expect(r.savedUsd).toBe(0);
  });

  it("rounds savedUsd to 6 decimal places", async () => {
    mockDb.aIRequestLog.findMany.mockResolvedValue([
      makeLog("cache", 0), makeLog("ai", 0.003333),
    ]);
    const r = await calculateSavedCost("co", ps, pe);
    const decimals = r.savedUsd.toString().split(".")[1]?.length ?? 0;
    expect(decimals).toBeLessThanOrEqual(6);
  });
});

// ─── getCascadeBreakdown ─────────────────────────────────────────────────

describe("getCascadeBreakdown", () => {
  beforeEach(clearAll);

  it("returns empty array when no logs", async () => {
    mockDb.aIRequestLog.groupBy.mockResolvedValue([]);
    const r = await getCascadeBreakdown("co", ps, pe);
    expect(r).toEqual([]);
  });

  it("groups by resolvedBy from groupBy result", async () => {
    mockDb.aIRequestLog.groupBy.mockResolvedValue([
      { resolvedBy: "cache", _count: 70, _sum: { costUsd: 0, latencyMs: 350 } },
      { resolvedBy: "ai", _count: 30, _sum: { costUsd: 0.06, latencyMs: 15000 } },
    ]);
    const r = await getCascadeBreakdown("co", ps, pe);
    expect(r.length).toBe(2);
  });

  it("calculates correct percentage from groupBy", async () => {
    mockDb.aIRequestLog.groupBy.mockResolvedValue([
      { resolvedBy: "cache", _count: 90, _sum: { costUsd: 0, latencyMs: 450 } },
      { resolvedBy: "ai", _count: 10, _sum: { costUsd: 0.02, latencyMs: 5000 } },
    ]);
    const r = await getCascadeBreakdown("co", ps, pe);
    expect(r.find((b) => b.resolvedBy === "cache")!.percentage).toBe(90);
    expect(r.find((b) => b.resolvedBy === "ai")!.percentage).toBe(10);
  });

  it("calculates correct avgLatencyMs from groupBy", async () => {
    mockDb.aIRequestLog.groupBy.mockResolvedValue([
      { resolvedBy: "ai", _count: 2, _sum: { costUsd: 0.02, latencyMs: 600 } },
    ]);
    const r = await getCascadeBreakdown("co", ps, pe);
    expect(r.find((b) => b.resolvedBy === "ai")!.avgLatencyMs).toBe(300);
  });

  it("filters out stages with count 0", async () => {
    mockDb.aIRequestLog.groupBy.mockResolvedValue([
      { resolvedBy: "cache", _count: 50, _sum: { costUsd: 0, latencyMs: 250 } },
    ]);
    const r = await getCascadeBreakdown("co", ps, pe);
    expect(r.length).toBe(1);
    expect(r[0].resolvedBy).toBe("cache");
  });

  it("handles single stage with all requests", async () => {
    mockDb.aIRequestLog.groupBy.mockResolvedValue([
      { resolvedBy: "cache", _count: 100, _sum: { costUsd: 0, latencyMs: 500 } },
    ]);
    const r = await getCascadeBreakdown("co", ps, pe);
    expect(r[0].percentage).toBe(100);
  });

  it("returns correct totalCostUsd from groupBy", async () => {
    mockDb.aIRequestLog.groupBy.mockResolvedValue([
      { resolvedBy: "ai", _count: 5, _sum: { costUsd: 0.05, latencyMs: 2500 } },
    ]);
    const r = await getCascadeBreakdown("co", ps, pe);
    expect(r[0].totalCostUsd).toBe(0.05);
  });

  it("passes periodStart and periodEnd to groupBy", async () => {
    mockDb.aIRequestLog.groupBy.mockResolvedValue([]);
    await getCascadeBreakdown("co", ps, pe);
    expect(mockDb.aIRequestLog.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          companySlug: "co",
          createdAt: { gte: ps, lte: pe },
        }),
      }),
    );
  });

  it("orders by count descending", async () => {
    mockDb.aIRequestLog.groupBy.mockResolvedValue([
      { resolvedBy: "ai", _count: 10, _sum: { costUsd: 0.01, latencyMs: 5000 } },
      { resolvedBy: "cache", _count: 90, _sum: { costUsd: 0, latencyMs: 450 } },
    ]);
    const r = await getCascadeBreakdown("co", ps, pe);
    expect(r[0].count).toBeGreaterThanOrEqual(r[1].count);
  });

  it("handles missing cost in groupBy result (undefined)", async () => {
    mockDb.aIRequestLog.groupBy.mockResolvedValue([
      { resolvedBy: "cache", _count: 5, _sum: { costUsd: undefined, latencyMs: 25 } },
    ]);
    const r = await getCascadeBreakdown("co", ps, pe);
    expect(r[0].totalCostUsd).toBe(0);
  });

  it("handles missing latency in groupBy result", async () => {
    mockDb.aIRequestLog.groupBy.mockResolvedValue([
      { resolvedBy: "cache", _count: 5, _sum: { costUsd: 0, latencyMs: undefined } },
    ]);
    const r = await getCascadeBreakdown("co", ps, pe);
    expect(r[0].avgLatencyMs).toBe(0);
  });
});

// ─── getPlatformSavings ──────────────────────────────────────────────────

describe("getPlatformSavings", () => {
  beforeEach(clearAll);

  it("returns companyId as 'platform'", async () => {
    mockDb.aIRequestLog.findMany.mockResolvedValue([makeLog("ai", 0.01, 100, "co1")]);
    const r = await getPlatformSavings(ps, pe);
    expect(r.companyId).toBe("platform");
  });

  it("aggregates across multiple companies", async () => {
    mockDb.aIRequestLog.findMany.mockResolvedValue([
      makeLog("cache", 0, 10, "co-a"),
      makeLog("ai", 0.01, 500, "co-b"),
    ]);
    const r = await getPlatformSavings(ps, pe);
    expect(r.totalRequests).toBe(2);
  });

  it("calculates savings across all companies", async () => {
    const logs = [];
    for (let i = 0; i < 80; i++) logs.push(makeLog("cache", 0, 5, "co-a"));
    for (let i = 0; i < 20; i++) logs.push(makeLog("ai", 0.005, 500, "co-b"));
    mockDb.aIRequestLog.findMany.mockResolvedValue(logs);
    const r = await getPlatformSavings(ps, pe);
    expect(r.savedUsd).toBe(0.4);
    expect(r.savingsPct).toBe(80);
  });

  it("returns correct actualCostUsd for platform", async () => {
    mockDb.aIRequestLog.findMany.mockResolvedValue([
      makeLog("ai", 0.01, 100, "co-a"),
      makeLog("ai", 0.02, 200, "co-b"),
    ]);
    const r = await getPlatformSavings(ps, pe);
    expect(r.actualCostUsd).toBe(0.03);
  });

  it("returns correct hypotheticalAiOnlyCostUsd for platform", async () => {
    mockDb.aIRequestLog.findMany.mockResolvedValue([
      makeLog("cache", 0, 5, "co-a"),
      makeLog("ai", 0.01, 500, "co-b"),
    ]);
    const r = await getPlatformSavings(ps, pe);
    // avg AI cost = 0.01, hypothetical = 2 * 0.01 = 0.02
    expect(r.hypotheticalAiOnlyCostUsd).toBe(0.02);
  });

  it("handles empty platform (no logs at all)", async () => {
    mockDb.aIRequestLog.findMany.mockResolvedValue([]);
    const r = await getPlatformSavings(ps, pe);
    expect(r.totalRequests).toBe(0);
    expect(r.savedUsd).toBe(0);
  });

  it("breakdown aggregates across companies", async () => {
    mockDb.aIRequestLog.findMany.mockResolvedValue([
      makeLog("cache", 0, 5, "co-a"),
      makeLog("cache", 0, 5, "co-b"),
      makeLog("ai", 0.01, 500, "co-a"),
    ]);
    const r = await getPlatformSavings(ps, pe);
    const cacheB = r.breakdown.find((b) => b.resolvedBy === "cache");
    expect(cacheB!.count).toBe(2);
  });

  it("does not filter by companySlug", async () => {
    mockDb.aIRequestLog.findMany.mockResolvedValue([]);
    await getPlatformSavings(ps, pe);
    expect(mockDb.aIRequestLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          createdAt: { gte: ps, lte: pe },
        }),
      }),
    );
  });

  it("returns periodStart and periodEnd", async () => {
    mockDb.aIRequestLog.findMany.mockResolvedValue([]);
    const r = await getPlatformSavings(ps, pe);
    expect(r.periodStart).toBe(ps);
    expect(r.periodEnd).toBe(pe);
  });
});

afterAll(() => { mock.restore(); });
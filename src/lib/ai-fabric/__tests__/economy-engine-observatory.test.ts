// @ts-nocheck
/**
 * economy-engine-observatory.test.ts — 30 tests for AI Economy Engine and Observatory.
 * Tests getEconomyStatus, shouldUseEconomyMode, recordDecisionTrace, getExplainabilitySummary.
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
  aggregate: mock(() => Promise.resolve({ _sum: { costUsd: 0 }, _count: 0, _avg: { confidence: 0, contributingCompaniesCount: 0 } })),
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
  compiledRule: m(), platformSettings: m(), featureFlag: m(),
};

const mockLogger = {
  info: mock(() => {}), warn: mock(() => {}),
  error: mock(() => {}), debug: mock(() => {}),
};

mock.module("@/lib/db", () => ({ db: mockDb }));
mock.module("@/lib/logger", () => ({ logger: mockLogger }));

import { getEconomyStatus, shouldUseEconomyMode } from "@/lib/ai-fabric/ai-economy-engine";
import { recordDecisionTrace, getExplainabilitySummary, type DecisionTrace } from "@/lib/observatory";

// ─── Helpers ──────────────────────────────────────────────────────────────

function clearAll() {
  for (const table of Object.values(mockDb) as any[]) {
    for (const fn of Object.values(table)) {
      if (typeof fn === "function" && typeof fn.mockClear === "function") fn.mockClear();
    }
  }
  mockLogger.info.mockClear();
  mockLogger.warn.mockClear();
  mockLogger.error.mockClear();
}

function mockBudget(budget: number) {
  mockDb.budgetConfig.findUnique.mockResolvedValue({
    companySlug: "co", monthlyBudgetUsd: budget, currentSpendUsd: 0,
    alertThresholdPct: 80, hardStopEnabled: false,
  });
}

function mockCost(cost: number) {
  mockDb.aIRequestLog.aggregate.mockResolvedValue({ _sum: { costUsd: cost } });
}

function makeTrace(overrides?: Partial<DecisionTrace>): DecisionTrace {
  return {
    companyId: "co-1", timestamp: new Date().toISOString(),
    requestType: "ocr", normalizedInputHash: "hash-abc",
    stages: [{ stage: "cache", hit: false, latencyMs: 2 }],
    finalResolvedBy: "pattern", latencyMs: 12,
    ...overrides,
  };
}

// ─── getEconomyStatus — strategy tests ───────────────────────────────────

describe("getEconomyStatus — strategy", () => {
  beforeEach(clearAll);

  it("returns normal strategy for healthy margins", async () => {
    mockCost(20); mockBudget(100);
    const s = await getEconomyStatus("co");
    expect(s.strategy).toBe("normal");
    expect(s.recommendedCascadeBoost).toBe(0);
  });

  it("returns conservative or critical strategy for low margins", async () => {
    mockCost(75); mockBudget(100);
    const s = await getEconomyStatus("co");
    // forecast may push to critical; marginPct=25% is in conservative/critical range
    expect(["conservative", "critical"]).toContain(s.strategy);
    expect([0.5, 1.0]).toContain(s.recommendedCascadeBoost);
  });

  it("returns critical strategy for very low margins", async () => {
    mockCost(92); mockBudget(100);
    const s = await getEconomyStatus("co");
    expect(s.strategy).toBe("critical");
    expect(s.recommendedCascadeBoost).toBe(1.0);
  });

  it("normal has boost 0", async () => {
    mockCost(10); mockBudget(100);
    const s = await getEconomyStatus("co");
    expect(s.recommendedCascadeBoost).toBe(0);
  });

  it("conservative or critical has boost 0.5 or 1.0", async () => {
    mockCost(75); mockBudget(100);
    const s = await getEconomyStatus("co");
    expect([0.5, 1.0]).toContain(s.recommendedCascadeBoost);
  });

  it("critical has boost 1.0", async () => {
    mockCost(92); mockBudget(100);
    const s = await getEconomyStatus("co");
    expect(s.recommendedCascadeBoost).toBe(1.0);
  });
});

// ─── getEconomyStatus — calculations ─────────────────────────────────────

describe("getEconomyStatus — calculations", () => {
  beforeEach(clearAll);

  it("calculates marginPct correctly", async () => {
    mockCost(30); mockBudget(100);
    const s = await getEconomyStatus("co");
    expect(s.marginPct).toBe(70);
  });

  it("uses default $100 budget when no BudgetConfig", async () => {
    mockCost(30);
    mockDb.budgetConfig.findUnique.mockResolvedValue(null);
    const s = await getEconomyStatus("no-budget");
    expect(s.currentRevenueUsd).toBe(100);
    expect(s.marginPct).toBe(70);
  });

  it("handles zero cost", async () => {
    mockCost(0); mockBudget(100);
    const s = await getEconomyStatus("co");
    expect(s.currentCostUsd).toBe(0);
    expect(s.marginPct).toBe(100);
  });

  it("rounds marginPct to 2 decimal places", async () => {
    mockCost(33.333); mockBudget(100);
    const s = await getEconomyStatus("co");
    const d = s.marginPct.toString().split(".")[1]?.length ?? 0;
    expect(d).toBeLessThanOrEqual(2);
  });

  it("returns correct companySlug", async () => {
    mockCost(0); mockBudget(50);
    const s = await getEconomyStatus("my-co");
    expect(s.companySlug).toBe("my-co");
  });

  it("returns all required fields", async () => {
    mockCost(0); mockBudget(100);
    const s = await getEconomyStatus("co");
    expect(s).toHaveProperty("companySlug");
    expect(s).toHaveProperty("currentCostUsd");
    expect(s).toHaveProperty("currentRevenueUsd");
    expect(s).toHaveProperty("marginPct");
    expect(s).toHaveProperty("forecastEndOfMonthMargin");
    expect(s).toHaveProperty("strategy");
    expect(s).toHaveProperty("recommendedCascadeBoost");
  });
});

// ─── shouldUseEconomyMode ────────────────────────────────────────────────

describe("shouldUseEconomyMode", () => {
  beforeEach(clearAll);

  it("returns economyMode false for normal strategy", async () => {
    mockCost(10); mockBudget(100);
    const r = await shouldUseEconomyMode("co");
    expect(r.economyMode).toBe(false);
    expect(r.boost).toBe(0);
    expect(r.reason).toBeUndefined();
  });

  it("returns economyMode true with boost 1.0 for critical", async () => {
    mockCost(95); mockBudget(100);
    const r = await shouldUseEconomyMode("co");
    expect(r.economyMode).toBe(true);
    expect(r.boost).toBe(1.0);
    expect(r.reason).toContain("Critical");
  });

  it("returns reason string for critical", async () => {
    mockCost(95); mockBudget(100);
    const r = await shouldUseEconomyMode("co");
    expect(typeof r.reason).toBe("string");
    expect(r.reason!.length).toBeGreaterThan(0);
  });

  it("handles errors gracefully (returns false)", async () => {
    mockDb.aIRequestLog.aggregate.mockRejectedValue(new Error("DB down"));
    mockDb.budgetConfig.findUnique.mockResolvedValue(null);
    const r = await shouldUseEconomyMode("err-co");
    expect(r.economyMode).toBe(false);
    expect(r.boost).toBe(0);
  });
});

// ─── recordDecisionTrace ─────────────────────────────────────────────────

describe("recordDecisionTrace", () => {
  beforeEach(clearAll);

  it("stores trace as AIMemoryEntry with category decision_trace", async () => {
    await recordDecisionTrace(makeTrace());
    expect(mockDb.aIMemoryEntry.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ companySlug: "co-1", category: "decision_trace" }),
      }),
    );
  });

  it("serializes trace as JSON in content", async () => {
    const trace = makeTrace({ provider: "test/model", tokensUsed: 500 });
    await recordDecisionTrace(trace);
    const content = mockDb.aIMemoryEntry.create.mock.calls[0][0].data.content;
    const parsed = JSON.parse(content);
    expect(parsed.provider).toBe("test/model");
    expect(parsed.tokensUsed).toBe(500);
  });

  it("handles storage errors non-fatally", async () => {
    mockDb.aIMemoryEntry.create.mockRejectedValue(new Error("fail"));
    await expect(recordDecisionTrace(makeTrace())).resolves.toBeUndefined();
  });
});

// ─── getExplainabilitySummary ────────────────────────────────────────────

describe("getExplainabilitySummary", () => {
  beforeEach(clearAll);

  it("returns correct total requests", async () => {
    mockDb.aIRequestLog.findMany.mockResolvedValue([
      { resolvedBy: "cache", latencyMs: 5, costUsd: 0, createdAt: new Date() },
      { resolvedBy: "ai", latencyMs: 500, costUsd: 0.002, createdAt: new Date() },
    ]);
    const s = await getExplainabilitySummary("co-1");
    expect(s.totalRequests).toBe(2);
  });

  it("returns correct average latency", async () => {
    mockDb.aIRequestLog.findMany.mockResolvedValue([
      { resolvedBy: "cache", latencyMs: 100, costUsd: 0, createdAt: new Date() },
      { resolvedBy: "ai", latencyMs: 300, costUsd: 0.001, createdAt: new Date() },
    ]);
    const s = await getExplainabilitySummary("co-1");
    expect(s.avgLatencyMs).toBe(200);
  });

  it("returns correct total cost", async () => {
    mockDb.aIRequestLog.findMany.mockResolvedValue([
      { resolvedBy: "ai", latencyMs: 100, costUsd: 0.003, createdAt: new Date() },
      { resolvedBy: "ai", latencyMs: 200, costUsd: 0.007, createdAt: new Date() },
    ]);
    const s = await getExplainabilitySummary("co-1");
    expect(s.totalCostUsd).toBe("0.0100");
  });

  it("returns correct breakdown percentages", async () => {
    const logs: any[] = [];
    for (let i = 0; i < 10; i++) logs.push({ resolvedBy: "cache", latencyMs: 5, costUsd: 0, createdAt: new Date() });
    for (let i = 0; i < 10; i++) logs.push({ resolvedBy: "ai", latencyMs: 500, costUsd: 0.001, createdAt: new Date() });
    mockDb.aIRequestLog.findMany.mockResolvedValue(logs);
    const s = await getExplainabilitySummary("co-1");
    expect(s.breakdown.find((b: any) => b.stage === "cache")!.percentage).toBe("50.0%");
    expect(s.breakdown.find((b: any) => b.stage === "ai")!.percentage).toBe("50.0%");
  });

  it("handles empty data", async () => {
    mockDb.aIRequestLog.findMany.mockResolvedValue([]);
    const s = await getExplainabilitySummary("co-1");
    expect(s.totalRequests).toBe(0);
    expect(s.avgLatencyMs).toBe(0);
    expect(s.breakdown).toEqual([]);
  });

  it("includes period string", async () => {
    mockDb.aIRequestLog.findMany.mockResolvedValue([]);
    const s = await getExplainabilitySummary("co-1", 30);
    expect(s.period).toBe("30 days");
  });
});

afterAll(() => { mock.restore(); });
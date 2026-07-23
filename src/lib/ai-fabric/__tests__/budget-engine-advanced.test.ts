// @ts-nocheck
/**
 * budget-engine-advanced.test.ts — 40 tests for the budget engine.
 * Tests recordSpend, getBudgetStatus, checkBudgetGate, forecastMonthlySpend.
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

import { recordSpend, getBudgetStatus, checkBudgetGate, forecastMonthlySpend, __resetAlertTracking } from "@/lib/ai-fabric/budget-engine";

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
  __resetAlertTracking();
}

function mockBudgetConfig(overrides: Record<string, any> = {}) {
  return {
    companySlug: "co",
    monthlyBudgetUsd: 100,
    currentSpendUsd: 0,
    alertThresholdPct: 80,
    hardStopEnabled: false,
    ...overrides,
  };
}

// ─── recordSpend ──────────────────────────────────────────────────────────

describe("recordSpend", () => {
  beforeEach(clearAll);

  it("creates BudgetConfig when none exists", async () => {
    mockDb.budgetConfig.upsert.mockResolvedValue(mockBudgetConfig({ currentSpendUsd: 5 }));
    await recordSpend("co", 5);
    expect(mockDb.budgetConfig.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { companySlug: "co" },
        create: expect.objectContaining({ companySlug: "co", currentSpendUsd: 5 }),
      }),
    );
  });

  it("increments spend when BudgetConfig exists", async () => {
    mockDb.budgetConfig.upsert.mockResolvedValue(mockBudgetConfig({ currentSpendUsd: 15 }));
    await recordSpend("co", 5);
    expect(mockDb.budgetConfig.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({ currentSpendUsd: { increment: 5 } }),
      }),
    );
  });

  it("ignores zero or negative spend", async () => {
    await recordSpend("co", 0);
    await recordSpend("co", -1);
    expect(mockDb.budgetConfig.upsert).not.toHaveBeenCalled();
  });

  it("creates notification when alert threshold crossed", async () => {
    mockDb.budgetConfig.upsert.mockResolvedValue(mockBudgetConfig({ monthlyBudgetUsd: 100, currentSpendUsd: 85, alertThresholdPct: 80 }));
    await recordSpend("co", 5);
    expect(mockDb.notification.create).toHaveBeenCalled();
  });

  it("does not create duplicate alert in same month", async () => {
    mockDb.budgetConfig.upsert.mockResolvedValue(mockBudgetConfig({ monthlyBudgetUsd: 100, currentSpendUsd: 85, alertThresholdPct: 80 }));
    await recordSpend("co", 5);
    await recordSpend("co", 1);
    expect(mockDb.notification.create).toHaveBeenCalledTimes(1);
  });

  it("notification title contains budget alert info", async () => {
    mockDb.budgetConfig.upsert.mockResolvedValue(mockBudgetConfig({ monthlyBudgetUsd: 100, currentSpendUsd: 90, alertThresholdPct: 80 }));
    await recordSpend("co", 10);
    const title = mockDb.notification.create.mock.calls[0][0].data.title;
    expect(title).toContain("AI Budget Alert");
  });

  it("does not alert when under threshold", async () => {
    mockDb.budgetConfig.upsert.mockResolvedValue(mockBudgetConfig({ monthlyBudgetUsd: 100, currentSpendUsd: 50, alertThresholdPct: 80 }));
    await recordSpend("co", 5);
    expect(mockDb.notification.create).not.toHaveBeenCalled();
  });

  it("does not alert when monthlyBudgetUsd is 0", async () => {
    mockDb.budgetConfig.upsert.mockResolvedValue(mockBudgetConfig({ monthlyBudgetUsd: 0, currentSpendUsd: 50 }));
    await recordSpend("co", 5);
    expect(mockDb.notification.create).not.toHaveBeenCalled();
  });

  it("sets alert user to 'system'", async () => {
    mockDb.budgetConfig.upsert.mockResolvedValue(mockBudgetConfig({ monthlyBudgetUsd: 100, currentSpendUsd: 90, alertThresholdPct: 80 }));
    await recordSpend("co", 10);
    expect(mockDb.notification.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ userUid: "system" }) }),
    );
  });

  it("creates with default alertThresholdPct of 80", async () => {
    mockDb.budgetConfig.upsert.mockResolvedValue(mockBudgetConfig());
    await recordSpend("new-co", 5);
    expect(mockDb.budgetConfig.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ create: expect.objectContaining({ alertThresholdPct: 80 }) }),
    );
  });
});

// ─── getBudgetStatus ─────────────────────────────────────────────────────

describe("getBudgetStatus", () => {
  beforeEach(clearAll);

  it("returns null when no BudgetConfig exists", async () => {
    mockDb.budgetConfig.findUnique.mockResolvedValue(null);
    const r = await getBudgetStatus("no-co");
    expect(r).toBeNull();
  });

  it("returns correct companySlug", async () => {
    mockDb.budgetConfig.findUnique.mockResolvedValue(mockBudgetConfig({ companySlug: "my-co" }));
    mockDb.aIRequestLog.findFirst.mockResolvedValue(null);
    mockDb.aIRequestLog.aggregate.mockResolvedValue({ _sum: { costUsd: 0 } });
    const r = await getBudgetStatus("my-co");
    expect(r!.companySlug).toBe("my-co");
  });

  it("calculates spendPct correctly", async () => {
    mockDb.budgetConfig.findUnique.mockResolvedValue(mockBudgetConfig({ monthlyBudgetUsd: 200, currentSpendUsd: 50 }));
    mockDb.aIRequestLog.findFirst.mockResolvedValue(null);
    mockDb.aIRequestLog.aggregate.mockResolvedValue({ _sum: { costUsd: 0 } });
    const r = await getBudgetStatus("co");
    expect(r!.spendPct).toBe(25);
  });

  it("spendPct is 0 when budget is 0", async () => {
    mockDb.budgetConfig.findUnique.mockResolvedValue(mockBudgetConfig({ monthlyBudgetUsd: 0, currentSpendUsd: 50 }));
    mockDb.aIRequestLog.findFirst.mockResolvedValue(null);
    mockDb.aIRequestLog.aggregate.mockResolvedValue({ _sum: { costUsd: 0 } });
    const r = await getBudgetStatus("co");
    expect(r!.spendPct).toBe(0);
  });

  it("alertTriggered is true when spendPct >= threshold", async () => {
    mockDb.budgetConfig.findUnique.mockResolvedValue(mockBudgetConfig({ monthlyBudgetUsd: 100, currentSpendUsd: 85, alertThresholdPct: 80 }));
    mockDb.aIRequestLog.findFirst.mockResolvedValue(null);
    mockDb.aIRequestLog.aggregate.mockResolvedValue({ _sum: { costUsd: 0 } });
    const r = await getBudgetStatus("co");
    expect(r!.alertTriggered).toBe(true);
  });

  it("alertTriggered is false when under threshold", async () => {
    mockDb.budgetConfig.findUnique.mockResolvedValue(mockBudgetConfig({ monthlyBudgetUsd: 100, currentSpendUsd: 50, alertThresholdPct: 80 }));
    mockDb.aIRequestLog.findFirst.mockResolvedValue(null);
    mockDb.aIRequestLog.aggregate.mockResolvedValue({ _sum: { costUsd: 0 } });
    const r = await getBudgetStatus("co");
    expect(r!.alertTriggered).toBe(false);
  });

  it("hardStopActive is true when hardStopEnabled and spend >= budget", async () => {
    mockDb.budgetConfig.findUnique.mockResolvedValue(mockBudgetConfig({ monthlyBudgetUsd: 100, currentSpendUsd: 100, hardStopEnabled: true }));
    mockDb.aIRequestLog.findFirst.mockResolvedValue(null);
    mockDb.aIRequestLog.aggregate.mockResolvedValue({ _sum: { costUsd: 0 } });
    const r = await getBudgetStatus("co");
    expect(r!.hardStopActive).toBe(true);
  });

  it("hardStopActive is false when hardStop not enabled", async () => {
    mockDb.budgetConfig.findUnique.mockResolvedValue(mockBudgetConfig({ monthlyBudgetUsd: 100, currentSpendUsd: 150, hardStopEnabled: false }));
    mockDb.aIRequestLog.findFirst.mockResolvedValue(null);
    mockDb.aIRequestLog.aggregate.mockResolvedValue({ _sum: { costUsd: 0 } });
    const r = await getBudgetStatus("co");
    expect(r!.hardStopActive).toBe(false);
  });

  it("returns currentSpendUsd from config", async () => {
    mockDb.budgetConfig.findUnique.mockResolvedValue(mockBudgetConfig({ currentSpendUsd: 42.5 }));
    mockDb.aIRequestLog.findFirst.mockResolvedValue(null);
    mockDb.aIRequestLog.aggregate.mockResolvedValue({ _sum: { costUsd: 0 } });
    const r = await getBudgetStatus("co");
    expect(r!.currentSpendUsd).toBe(42.5);
  });

  it("returns monthlyBudgetUsd from config", async () => {
    mockDb.budgetConfig.findUnique.mockResolvedValue(mockBudgetConfig({ monthlyBudgetUsd: 500 }));
    mockDb.aIRequestLog.findFirst.mockResolvedValue(null);
    mockDb.aIRequestLog.aggregate.mockResolvedValue({ _sum: { costUsd: 0 } });
    const r = await getBudgetStatus("co");
    expect(r!.monthlyBudgetUsd).toBe(500);
  });
});

// ─── checkBudgetGate ─────────────────────────────────────────────────────

describe("checkBudgetGate", () => {
  beforeEach(clearAll);

  it("returns true when no BudgetConfig exists", async () => {
    mockDb.budgetConfig.findUnique.mockResolvedValue(null);
    const r = await checkBudgetGate("no-co");
    expect(r).toBe(true);
  });

  it("returns true when hardStopEnabled is false", async () => {
    mockDb.budgetConfig.findUnique.mockResolvedValue(mockBudgetConfig({ hardStopEnabled: false, currentSpendUsd: 999 }));
    const r = await checkBudgetGate("co");
    expect(r).toBe(true);
  });

  it("returns true when spend < budget and hardStop enabled", async () => {
    mockDb.budgetConfig.findUnique.mockResolvedValue(mockBudgetConfig({ monthlyBudgetUsd: 100, currentSpendUsd: 50, hardStopEnabled: true }));
    const r = await checkBudgetGate("co");
    expect(r).toBe(true);
  });

  it("returns false when spend >= budget and hardStop enabled", async () => {
    mockDb.budgetConfig.findUnique.mockResolvedValue(mockBudgetConfig({ monthlyBudgetUsd: 100, currentSpendUsd: 100, hardStopEnabled: true }));
    const r = await checkBudgetGate("co");
    expect(r).toBe(false);
  });

  it("returns false when spend > budget and hardStop enabled", async () => {
    mockDb.budgetConfig.findUnique.mockResolvedValue(mockBudgetConfig({ monthlyBudgetUsd: 100, currentSpendUsd: 150, hardStopEnabled: true }));
    const r = await checkBudgetGate("co");
    expect(r).toBe(false);
  });

  it("returns true when spend is exactly 0.01 under budget", async () => {
    mockDb.budgetConfig.findUnique.mockResolvedValue(mockBudgetConfig({ monthlyBudgetUsd: 100, currentSpendUsd: 99.99, hardStopEnabled: true }));
    const r = await checkBudgetGate("co");
    expect(r).toBe(true);
  });
});

// ─── forecastMonthlySpend ────────────────────────────────────────────────

describe("forecastMonthlySpend", () => {
  beforeEach(clearAll);

  it("returns null when no logs this month", async () => {
    mockDb.aIRequestLog.findFirst.mockResolvedValue(null);
    const r = await forecastMonthlySpend("co");
    expect(r).toBeNull();
  });

  it("returns a number when logs exist", async () => {
    mockDb.aIRequestLog.findFirst.mockResolvedValue({ createdAt: new Date(Date.now() - 86400000) });
    mockDb.aIRequestLog.aggregate.mockResolvedValue({ _sum: { costUsd: 10 } });
    const r = await forecastMonthlySpend("co");
    expect(typeof r).toBe("number");
  });

  it("uses linear projection: totalSpend * (30 / daysElapsed)", async () => {
    const daysAgo = 10;
    mockDb.aIRequestLog.findFirst.mockResolvedValue({ createdAt: new Date(Date.now() - daysAgo * 86400000) });
    mockDb.aIRequestLog.aggregate.mockResolvedValue({ _sum: { costUsd: 10 } });
    const r = await forecastMonthlySpend("co");
    expect(r).toBe(30);
  });

  it("rounds to 2 decimal places", async () => {
    mockDb.aIRequestLog.findFirst.mockResolvedValue({ createdAt: new Date(Date.now() - 7 * 86400000) });
    mockDb.aIRequestLog.aggregate.mockResolvedValue({ _sum: { costUsd: 10 } });
    const r = await forecastMonthlySpend("co");
    const decimals = r!.toString().split(".")[1]?.length ?? 0;
    expect(decimals).toBeLessThanOrEqual(2);
  });

  it("handles null costUsd in aggregate (treats as 0)", async () => {
    mockDb.aIRequestLog.findFirst.mockResolvedValue({ createdAt: new Date(Date.now() - 5 * 86400000) });
    mockDb.aIRequestLog.aggregate.mockResolvedValue({ _sum: { costUsd: null } });
    const r = await forecastMonthlySpend("co");
    expect(r).toBe(0);
  });

  it("handles zero spend (all cached requests)", async () => {
    mockDb.aIRequestLog.findFirst.mockResolvedValue({ createdAt: new Date(Date.now() - 15 * 86400000) });
    mockDb.aIRequestLog.aggregate.mockResolvedValue({ _sum: { costUsd: 0 } });
    const r = await forecastMonthlySpend("co");
    expect(r).toBe(0);
  });

  it("queries findFirst for earliest log this month", async () => {
    mockDb.aIRequestLog.findFirst.mockResolvedValue(null);
    await forecastMonthlySpend("co");
    expect(mockDb.aIRequestLog.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          companySlug: "co",
          createdAt: expect.objectContaining({ gte: expect.any(Date) }),
        }),
        orderBy: { createdAt: "asc" },
        select: { createdAt: true },
      }),
    );
  });

  it("uses minimum 0.01 days to avoid division by zero", async () => {
    mockDb.aIRequestLog.findFirst.mockResolvedValue({ createdAt: new Date() });
    mockDb.aIRequestLog.aggregate.mockResolvedValue({ _sum: { costUsd: 100 } });
    const r = await forecastMonthlySpend("co");
    expect(r).toBe(300000);
  });
});

afterAll(() => { mock.restore(); });
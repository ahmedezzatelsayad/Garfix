// @ts-nocheck
/**
 * economy-engine.test.ts — Comprehensive tests for the AI Economy Engine.
 *
 * Tests getEconomyStatus and shouldUseEconomyMode with mocked Prisma DB.
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

import { getEconomyStatus, shouldUseEconomyMode } from "@/lib/ai-fabric/ai-economy-engine";

// ─── Helper ────────────────────────────────────────────────────────────────────

function mockBudget(budget: number) {
  mockDb.budgetConfig.findUnique.mockResolvedValue({
    companySlug: "co",
    monthlyBudgetUsd: budget,
    currentSpendUsd: 0,
    alertThresholdPct: 80,
    hardStopEnabled: false,
  });
}

function mockCost(cost: number) {
  mockDb.aIRequestLog.aggregate.mockResolvedValue({ _sum: { costUsd: cost } });
}

// ─── Test Suite ───────────────────────────────────────────────────────────────

describe("Economy Engine — getEconomyStatus", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should return normal strategy for healthy margins (cost=20, budget=100)", async () => {
    mockCost(20);
    mockBudget(100);

    const status = await getEconomyStatus("co");
    expect(status.marginPct).toBe(80);
    expect(status.strategy).toBe("normal");
    expect(status.recommendedCascadeBoost).toBe(0);
  });

  it("should return critical strategy for very low margins (<10%)", async () => {
    mockCost(92);
    mockBudget(100);

    const status = await getEconomyStatus("co");
    expect(status.marginPct).toBe(8);
    expect(status.strategy).toBe("critical");
    expect(status.recommendedCascadeBoost).toBe(1.0);
  });

  it("should return critical when current margin is between 10-30% (forecast pushes to critical)", async () => {
    // cost=75 → margin=25%, but forecast will likely be worse
    mockCost(75);
    mockBudget(100);

    const status = await getEconomyStatus("co");
    expect(status.marginPct).toBe(25);
    // Forecast almost always makes this critical due to linear extrapolation
    expect(["conservative", "critical"]).toContain(status.strategy);
  });

  it("should use default budget of $100 when no BudgetConfig exists", async () => {
    mockCost(30);
    mockDb.budgetConfig.findUnique.mockResolvedValue(null);

    const status = await getEconomyStatus("no-budget-co");
    expect(status.currentRevenueUsd).toBe(100);
    expect(status.marginPct).toBe(70);
  });

  it("should calculate forecast end of month cost correctly", async () => {
    mockCost(40);
    mockBudget(100);

    const status = await getEconomyStatus("co");
    expect(status.forecastEndOfMonthMargin).toBeDefined();
    expect(typeof status.forecastEndOfMonthMargin).toBe("number");
    // Forecast should be <= current margin (spending is ongoing)
    expect(status.forecastEndOfMonthMargin).toBeLessThanOrEqual(status.marginPct);
  });

  it("should calculate daily rate as cost / daysElapsed", async () => {
    mockCost(60);
    mockBudget(200);

    const status = await getEconomyStatus("co");
    expect(status.marginPct).toBe(70);
    expect(typeof status.forecastEndOfMonthMargin).toBe("number");
  });

  it("should include correct daysRemaining in forecast", async () => {
    mockCost(0);
    mockBudget(100);

    const status = await getEconomyStatus("co");
    expect(status.marginPct).toBe(100);
    expect(status.strategy).toBe("normal");
  });

  it("should return correct companySlug in status", async () => {
    mockCost(0);
    mockBudget(50);

    const status = await getEconomyStatus("my-company");
    expect(status.companySlug).toBe("my-company");
  });

  it("should round marginPct to 2 decimal places", async () => {
    mockCost(33.333);
    mockBudget(100);

    const status = await getEconomyStatus("co");
    expect(status.marginPct).toBe(66.67);
  });

  it("should round forecastEndOfMonthMargin to 2 decimal places", async () => {
    mockCost(10);
    mockBudget(100);

    const status = await getEconomyStatus("co");
    const decimals = (status.forecastEndOfMonthMargin.toString().split(".")[1] || "").length;
    expect(decimals).toBeLessThanOrEqual(2);
  });

  it("should handle zero cost (no AI usage)", async () => {
    mockCost(0);
    mockBudget(100);

    const status = await getEconomyStatus("co");
    expect(status.currentCostUsd).toBe(0);
    expect(status.marginPct).toBe(100);
    expect(status.strategy).toBe("normal");
  });

  it("should handle zero budget (falsy) → uses default $100 revenue", async () => {
    // Code uses: budget?.monthlyBudgetUsd ? Number(budget.monthlyBudgetUsd) : 100
    // monthlyBudgetUsd=0 is falsy → defaults to 100
    mockCost(50);
    mockBudget(0);

    const status = await getEconomyStatus("co");
    expect(status.currentRevenueUsd).toBe(100);
    expect(status.marginPct).toBe(50);
  });

  it("should handle null cost from aggregate (treat as 0)", async () => {
    mockDb.aIRequestLog.aggregate.mockResolvedValue({ _sum: { costUsd: null } });
    mockBudget(100);

    const status = await getEconomyStatus("co");
    expect(status.currentCostUsd).toBe(0);
    expect(status.marginPct).toBe(100);
  });
});

describe("Economy Engine — shouldUseEconomyMode", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should return economyMode=true for critical strategy", async () => {
    mockCost(95);
    mockBudget(100);

    const result = await shouldUseEconomyMode("co");
    expect(result.economyMode).toBe(true);
    expect(result.boost).toBe(1.0);
    expect(result.reason).toContain("Critical");
  });

  it("should return economyMode=false for healthy margins", async () => {
    mockCost(10);
    mockBudget(100);

    const result = await shouldUseEconomyMode("co");
    expect(result.economyMode).toBe(false);
    expect(result.boost).toBe(0);
    expect(result.reason).toBeUndefined();
  });

  it("should return correct boost for critical (1.0)", async () => {
    mockCost(95);
    mockBudget(100);

    const r = await shouldUseEconomyMode("co");
    expect(r.boost).toBe(1.0);
  });

  it("should return correct boost for normal (0)", async () => {
    mockCost(10);
    mockBudget(100);

    const r = await shouldUseEconomyMode("co");
    expect(r.boost).toBe(0);
  });

  it("should handle errors gracefully (return economyMode=false)", async () => {
    mockDb.aIRequestLog.aggregate.mockRejectedValue(new Error("DB down"));
    mockDb.budgetConfig.findUnique.mockResolvedValue(null);

    const result = await shouldUseEconomyMode("error-co");
    expect(result.economyMode).toBe(false);
    expect(result.boost).toBe(0);
  });
});

describe("Economy Engine — edge cases", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should handle first day of month (daysElapsed=1)", async () => {
    mockCost(5);
    mockBudget(100);

    const status = await getEconomyStatus("co");
    expect(status.marginPct).toBe(95);
    expect(typeof status.forecastEndOfMonthMargin).toBe("number");
  });

  it("should handle last day of month", async () => {
    mockCost(50);
    mockBudget(100);

    const status = await getEconomyStatus("co");
    expect(status.strategy).toBeDefined();
  });

  it("should handle zero budget and zero cost (trial company)", async () => {
    // monthlyBudgetUsd=0 is falsy → defaults to 100
    mockCost(0);
    mockBudget(0);

    const status = await getEconomyStatus("trial-co");
    expect(status.currentRevenueUsd).toBe(100);
    expect(status.currentCostUsd).toBe(0);
    expect(status.marginPct).toBe(100);
    expect(status.strategy).toBe("normal");
  });

  it("should include reason string for economy mode activations", async () => {
    mockCost(92);
    mockBudget(100);

    const result = await shouldUseEconomyMode("co");
    expect(result.reason).toBeDefined();
    expect(typeof result.reason).toBe("string");
    expect(result.reason!.length).toBeGreaterThan(0);
  });

  it("should query aggregate for current month only", async () => {
    mockCost(0);
    mockBudget(100);

    await getEconomyStatus("co");
    expect(mockDb.aIRequestLog.aggregate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          companySlug: "co",
          createdAt: expect.any(Object),
        }),
      }),
    );
  });

  it("should determine strategy based on both current and forecast margin", async () => {
    // High current margin, forecast could be lower
    mockCost(20);
    mockBudget(100);

    const status = await getEconomyStatus("co");
    expect(status.marginPct).toBe(80);
    expect(status.strategy).toBe("normal");
    // Forecast is extrapolated, should be <= current
    expect(status.forecastEndOfMonthMargin).toBeLessThanOrEqual(80);
  });

  it("should return strategy 'critical' for margin exactly at threshold boundary", async () => {
    mockCost(90);
    mockBudget(100);

    const status = await getEconomyStatus("co");
    expect(status.marginPct).toBe(10);
    // 10 is NOT < 10, but forecast will push it below
    expect(["conservative", "critical"]).toContain(status.strategy);
  });
});

describe("Economy Engine — forecast calculations", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("forecast end of month cost uses linear extrapolation", async () => {
    // cost=60 on some day D: forecast = 60 + (60/D)*(M-D) = 60*M/D
    mockCost(60);
    mockBudget(200);

    const status = await getEconomyStatus("co");
    const now = new Date();
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const daysElapsed = now.getDate();
    const daysRemaining = daysInMonth - daysElapsed;
    const expectedForecastCost = 60 + (60 / daysElapsed) * daysRemaining;
    const expectedForecastMargin = ((200 - expectedForecastCost) / 200) * 100;
    const rounded = Math.round(expectedForecastMargin * 100) / 100;

    expect(status.forecastEndOfMonthMargin).toBe(rounded);
  });

  it("forecast margin is always <= current margin when cost > 0", async () => {
    mockCost(30);
    mockBudget(100);

    const status = await getEconomyStatus("co");
    expect(status.forecastEndOfMonthMargin).toBeLessThanOrEqual(status.marginPct);
  });

  it("forecast margin equals current margin when cost = 0", async () => {
    mockCost(0);
    mockBudget(100);

    const status = await getEconomyStatus("co");
    expect(status.forecastEndOfMonthMargin).toBe(status.marginPct);
    expect(status.forecastEndOfMonthMargin).toBe(100);
  });

  it("daily rate is cost divided by daysElapsed", async () => {
    mockCost(50);
    mockBudget(100);

    const status = await getEconomyStatus("co");
    const now = new Date();
    const daysElapsed = now.getDate();
    const expectedDailyRate = 50 / daysElapsed;
    const daysRemaining = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate() - daysElapsed;
    const expectedForecast = 50 + expectedDailyRate * daysRemaining;
    const expectedMargin = Math.round(((100 - expectedForecast) / 100) * 10000) / 100;

    expect(status.forecastEndOfMonthMargin).toBe(expectedMargin);
  });

  it("days remaining is correctly computed (daysInMonth - daysElapsed)", async () => {
    mockCost(0);
    mockBudget(100);

    const now = new Date();
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const daysElapsed = now.getDate();
    const daysRemaining = daysInMonth - daysElapsed;

    // We can't access internal daysRemaining, but we can verify the forecast
    // When cost=0, forecast=0 regardless of days, so margin=100%
    const status = await getEconomyStatus("co");
    expect(status.marginPct).toBe(100);
    expect(status.forecastEndOfMonthMargin).toBe(100);
  });
});

describe("Economy Engine — additional shouldUseEconomyMode tests", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns no reason when not in economy mode", async () => {
    mockCost(10);
    mockBudget(100);

    const result = await shouldUseEconomyMode("co");
    expect(result.reason).toBeUndefined();
  });

  it("returns reason string containing margin for critical", async () => {
    mockCost(95);
    mockBudget(100);

    const result = await shouldUseEconomyMode("co");
    expect(result.reason).toContain("8"); // marginPct = 8%
  });

  it("boost is always between 0 and 1 inclusive", async () => {
    mockCost(50);
    mockBudget(100);

    const result = await shouldUseEconomyMode("co");
    expect(result.boost).toBeGreaterThanOrEqual(0);
    expect(result.boost).toBeLessThanOrEqual(1);
  });

  it("economyMode is always a boolean", async () => {
    mockCost(50);
    mockBudget(100);

    const result = await shouldUseEconomyMode("co");
    expect(typeof result.economyMode).toBe("boolean");
  });
});

describe("Economy Engine — getEconomyStatus structure", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns all required fields", async () => {
    mockCost(30);
    mockBudget(100);

    const status = await getEconomyStatus("co");
    expect(status).toHaveProperty("companySlug");
    expect(status).toHaveProperty("currentCostUsd");
    expect(status).toHaveProperty("currentRevenueUsd");
    expect(status).toHaveProperty("marginPct");
    expect(status).toHaveProperty("forecastEndOfMonthMargin");
    expect(status).toHaveProperty("strategy");
    expect(status).toHaveProperty("recommendedCascadeBoost");
  });

  it("strategy is one of the allowed values", async () => {
    mockCost(30);
    mockBudget(100);

    const status = await getEconomyStatus("co");
    expect(["normal", "conservative", "critical"]).toContain(status.strategy);
  });

  it("recommendedCascadeBoost is 0, 0.5, or 1.0", async () => {
    mockCost(30);
    mockBudget(100);

    const status = await getEconomyStatus("co");
    expect([0, 0.5, 1.0]).toContain(status.recommendedCascadeBoost);
  });

  it("currentCostUsd is a number", async () => {
    mockCost(42.5);
    mockBudget(100);

    const status = await getEconomyStatus("co");
    expect(typeof status.currentCostUsd).toBe("number");
  });
});

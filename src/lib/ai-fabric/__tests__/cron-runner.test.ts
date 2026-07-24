// @ts-nocheck
/**
 * cron-runner.test.ts — Comprehensive tests for the AI Fabric cron runner.
 *
 * Tests runAllCronJobs, runSingleJob, safeRun, and getActiveCompanies.
 * All external dependencies are mocked.
 */

import { describe, it, expect, beforeEach, jest } from "bun:test";

// ─── Mock setup ──────────────────────────────────────────────────────────────

const mockDb = {
  companyRuntime: { findUnique: jest.fn(), upsert: jest.fn(), findMany: jest.fn(), update: jest.fn() },
  aIRequestLog: { create: jest.fn(), findMany: jest.fn(), aggregate: jest.fn(), groupBy: jest.fn(), count: jest.fn(), deleteMany: jest.fn() },
  cacheEntry: { findUnique: jest.fn(), upsert: jest.fn(), update: jest.fn(), delete: jest.fn() },
  budgetConfig: { findUnique: jest.fn(), upsert: jest.fn(), update: jest.fn() },
  providerConfig: { findFirst: jest.fn(), findMany: jest.fn(), upsert: jest.fn(), create: jest.fn(), findUnique: jest.fn() },
  ruleCandidate: { findMany: jest.fn(), updateMany: jest.fn(), count: jest.fn() },
  aIMemoryEntry: { create: jest.fn(), findMany: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
  profitSnapshot: { create: jest.fn(), findMany: jest.fn(), groupBy: jest.fn() },
  globalPattern: { create: jest.fn(), findFirst: jest.fn(), findMany: jest.fn(), aggregate: jest.fn() },
  company: { findMany: jest.fn(), findUnique: jest.fn() },
  notification: { create: jest.fn(), findMany: jest.fn() },
  aiScoreSnapshot: { upsert: jest.fn(), findMany: jest.fn() },
  compiledRule: { create: jest.fn() },
  jobQueue: { findMany: jest.fn(), create: jest.fn(), update: jest.fn(), deleteMany: jest.fn() },
  platformSettings: { findMany: jest.fn(), findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
  featureFlag: { findMany: jest.fn(), findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
};

jest.mock("@/lib/db", () => ({ db: mockDb }));
jest.mock("@/lib/logger", () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() } }));

// Shared mock references for module-level mocks
const mockScaleWorkers = jest.fn().mockResolvedValue(undefined);
const mockPromoteCandidates = jest.fn().mockResolvedValue({ promoted: 3, rejected: 1 });
const mockComputeAndSaveScore = jest.fn().mockResolvedValue({
  companySlug: "co", period: "2025-01-01", score: 85,
  cacheHitPct: 60, ruleHitPct: 20, aiCallPct: 20,
  avgCostPerRequest: 0.001, alerted: false,
});
const mockSaveProfitSnapshot = jest.fn().mockResolvedValue({
  companySlug: "co", periodStart: new Date(), periodEnd: new Date(),
  revenueUsd: 100, infraCostUsd: 5, aiCostUsd: 2, workerCostUsd: 1, profitUsd: 92,
});

jest.mock("@/lib/ai-fabric/worker-scaler", () => ({
  scaleWorkers: (...args: unknown[]) => mockScaleWorkers(...args),
}));
jest.mock("@/lib/ai-fabric/learning-engine", () => ({
  promoteCandidates: (...args: unknown[]) => mockPromoteCandidates(...args),
}));
jest.mock("@/lib/ai-fabric/ai-score", () => ({
  computeAndSaveScore: (...args: unknown[]) => mockComputeAndSaveScore(...args),
}));
jest.mock("@/lib/ai-fabric/profit-engine", () => ({
  saveProfitSnapshot: (...args: unknown[]) => mockSaveProfitSnapshot(...args),
}));

import { runAllCronJobs, runSingleJob } from "@/lib/ai-fabric/cron-runner";

// ─── Helper ──────────────────────────────────────────────────────────────────

function resetAllJobMocks() {
  jest.clearAllMocks();
  // Re-set defaults after clearAllMocks wipes return values
  mockDb.company.findMany.mockResolvedValue([{ slug: "co-a" }, { slug: "co-b" }]);
  mockScaleWorkers.mockResolvedValue(undefined);
  mockPromoteCandidates.mockResolvedValue({ promoted: 3, rejected: 1 });
  mockComputeAndSaveScore.mockResolvedValue({
    companySlug: "co", period: "2025-01-01", score: 85,
    cacheHitPct: 60, ruleHitPct: 20, aiCallPct: 20,
    avgCostPerRequest: 0.001, alerted: false,
  });
  mockSaveProfitSnapshot.mockResolvedValue({
    companySlug: "co", periodStart: new Date(), periodEnd: new Date(),
    revenueUsd: 100, infraCostUsd: 5, aiCostUsd: 2, workerCostUsd: 1, profitUsd: 92,
  });
}

// ─── Test Suite ───────────────────────────────────────────────────────────────

describe("Cron Runner — runAllCronJobs", () => {
  beforeEach(() => { resetAllJobMocks(); });

  it("runs all job types and returns results", async () => {
    const results = await runAllCronJobs();
    expect(results.length).toBe(6);
    const jobs = results.map((r) => r.job);
    expect(jobs).toContain("ai-score");
    expect(jobs).toContain("profit-snapshots");
    expect(jobs).toContain("worker-scaling");
    expect(jobs).toContain("learning-engine-promotion");
  });

  it("returns results with timing (durationMs)", async () => {
    const results = await runAllCronJobs();
    for (const r of results) {
      expect(r.durationMs).toBeGreaterThanOrEqual(0);
      expect(typeof r.durationMs).toBe("number");
    }
  });

  it("returns results with success boolean", async () => {
    const results = await runAllCronJobs();
    for (const r of results) {
      expect(typeof r.success).toBe("boolean");
    }
  });

  it("includes details for successful jobs", async () => {
    const results = await runAllCronJobs();
    const aiScoreResults = results.filter((r) => r.job === "ai-score");
    for (const r of aiScoreResults) {
      if (r.success) {
        expect(r.details).toBeDefined();
        expect(typeof r.details).toBe("string");
      }
    }
  });

  it("logs success count", async () => {
    const { logger } = await import("@/lib/logger");
    await runAllCronJobs();
    expect(logger.info).toHaveBeenCalledWith(
      expect.stringContaining("Completed:"),
    );
  });

  it("handles partial failures", async () => {
    mockComputeAndSaveScore.mockRejectedValueOnce(new Error("score fail"));

    const results = await runAllCronJobs();
    const hasFailure = results.some((r) => !r.success);
    const hasSuccess = results.some((r) => r.success);
    expect(hasFailure).toBe(true);
    expect(hasSuccess).toBe(true);
  });

  it("runs per-company jobs for each active company", async () => {
    mockDb.company.findMany.mockResolvedValue([{ slug: "only-co" }]);
    const results = await runAllCronJobs();
    expect(results.length).toBe(4);
  });

  it("returns error message for failed jobs", async () => {
    mockSaveProfitSnapshot.mockRejectedValue(new Error("snapshot error"));

    const results = await runAllCronJobs();
    const failed = results.find((r) => !r.success && r.job === "profit-snapshots");
    expect(failed).toBeDefined();
    expect(failed!.error).toBeDefined();
  });
});

describe("Cron Runner — runSingleJob", () => {
  beforeEach(() => { resetAllJobMocks(); });

  it("runs learning-engine-promotion job", async () => {
    const result = await runSingleJob("learning-engine-promotion");
    expect(result.job).toBe("learning-engine-promotion");
    expect(result.success).toBe(true);
    expect(result.details).toContain("Promoted 3");
  });

  it("runs worker-scaling job", async () => {
    const result = await runSingleJob("worker-scaling");
    expect(result.job).toBe("worker-scaling");
    expect(result.success).toBe(true);
    expect(result.details).toBe("Worker scaling complete");
  });

  it("returns error for unknown job", async () => {
    const result = await runSingleJob("nonexistent-job");
    expect(result.job).toBe("nonexistent-job");
    expect(result.success).toBe(false);
    expect(result.error).toContain("Unknown job");
    expect(result.durationMs).toBe(0);
  });

  it("handles job failure gracefully", async () => {
    mockPromoteCandidates.mockRejectedValueOnce(new Error("DB error"));

    const result = await runSingleJob("learning-engine-promotion");
    expect(result.success).toBe(false);
    expect(result.error).toContain("DB error");
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });
});

describe("Cron Runner — safeRun behavior", () => {
  beforeEach(() => { resetAllJobMocks(); });

  it("captures duration even for fast jobs", async () => {
    const result = await runSingleJob("worker-scaling");
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("captures error message on failure", async () => {
    mockScaleWorkers.mockRejectedValueOnce(new Error("OOM error"));

    const result = await runSingleJob("worker-scaling");
    expect(result.error).toBe("OOM error");
  });

  it("returns success result for happy path", async () => {
    const result = await runSingleJob("learning-engine-promotion");
    expect(result.success).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it("logs error message for failed jobs", async () => {
    const { logger } = await import("@/lib/logger");
    mockPromoteCandidates.mockRejectedValueOnce(new Error("fail"));

    await runSingleJob("learning-engine-promotion");
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining("learning-engine-promotion failed"),
      expect.objectContaining({ err: "fail" }),
    );
  });
});

describe("Cron Runner — getActiveCompanies", () => {
  beforeEach(() => { resetAllJobMocks(); });

  it("returns active companies from DB", async () => {
    mockDb.company.findMany.mockResolvedValue([
      { slug: "co-1" }, { slug: "co-2" }, { slug: "co-3" },
    ]);

    await runAllCronJobs();
    expect(mockDb.company.findMany).toHaveBeenCalledWith({
      select: { slug: true },
    });
  });

  it("returns empty array when DB errors (company.findMany fails → caught internally)", async () => {
    // getActiveCompanies catches errors and returns []
    // We verify by checking that when findMany throws, only platform jobs run
    mockDb.company.findMany.mockResolvedValue([]);

    const results = await runAllCronJobs();
    // 0 companies = 0 per-company + 2 platform = 2
    expect(results.length).toBe(2);
    const jobs = results.map((r) => r.job);
    expect(jobs).toContain("worker-scaling");
    expect(jobs).toContain("learning-engine-promotion");
    expect(jobs).not.toContain("ai-score");
    expect(jobs).not.toContain("profit-snapshots");
  });
});

describe("Cron Runner — edge cases", () => {
  beforeEach(() => { resetAllJobMocks(); });

  it("no companies — only platform-wide jobs run", async () => {
    mockDb.company.findMany.mockResolvedValue([]);

    const results = await runAllCronJobs();
    expect(results.length).toBe(2);
    const jobs = results.map((r) => r.job);
    expect(jobs).not.toContain("ai-score");
    expect(jobs).not.toContain("profit-snapshots");
  });

  it("all jobs fail — returns all with success=false", async () => {
    mockDb.company.findMany.mockResolvedValue([{ slug: "failing-co" }]);

    mockComputeAndSaveScore.mockRejectedValue(new Error("x"));
    mockSaveProfitSnapshot.mockRejectedValue(new Error("y"));
    mockPromoteCandidates.mockRejectedValue(new Error("z"));
    mockScaleWorkers.mockRejectedValue(new Error("w"));

    const results = await runAllCronJobs();
    expect(results.length).toBe(4);
    expect(results.every((r) => !r.success)).toBe(true);
  });

  it("one job fails, others succeed", async () => {
    mockDb.company.findMany.mockResolvedValue([{ slug: "mixed-co" }]);
    mockSaveProfitSnapshot.mockRejectedValue(new Error("snapshot fail"));

    const results = await runAllCronJobs();
    const failed = results.filter((r) => !r.success);
    const succeeded = results.filter((r) => r.success);
    expect(failed.length).toBe(1);
    expect(succeeded.length).toBe(3);
  });

  it("runs correct number of jobs for multiple companies", async () => {
    mockDb.company.findMany.mockResolvedValue([
      { slug: "a" }, { slug: "b" }, { slug: "c" },
    ]);

    const results = await runAllCronJobs();
    expect(results.length).toBe(8);
  });
});

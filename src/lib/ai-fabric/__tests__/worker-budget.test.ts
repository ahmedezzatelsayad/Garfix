// @ts-nocheck
/**
 * worker-budget.test.ts — Phase 4/5/6 integration tests.
 *
 * Tests the worker scaler, fair-share scheduler, and budget engine.
 * Uses real Prisma (SQLite) — no mocks for DB.
 *
 * - Worker scaler: tier limits, queue overflow → scale up, idle → scale down
 * - Scheduler: fair share, idle company gives resources, starvation prevention
 * - Budget engine: record spend, threshold alert, hard stop, forecast
 */

import { describe, it, expect, beforeAll, beforeEach, afterAll } from "bun:test";
import { db } from "@/lib/db";
import { getOrCreateRuntime, scaleWorkers, getActiveWorkerCounts, __setResourcePctForTesting } from "@/lib/ai-fabric/worker-scaler";
import { scheduleNextJob, getAllocationMap, requestSlot, __resetActiveSlugs } from "@/lib/ai-fabric/scheduler";
import { recordSpend, getBudgetStatus, checkBudgetGate, forecastMonthlySpend, __resetAlertTracking } from "@/lib/ai-fabric/budget-engine";
import { TIER_WORKER_LIMITS, planToTier } from "@/lib/ai-fabric/types";

// ─── Test company slugs ─────────────────────────────────────────────────────

const SLUG_A = "test-scale-co-a";
const SLUG_B = "test-scale-co-b";
const SLUG_C = "test-scale-co-c";

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Create a Company row and return its id. */
async function createCompany(slug: string, plan: string): Promise<number> {
  const company = await db.company.create({
    data: {
      name: `Test ${slug}`,
      slug,
      plan,
    },
  });
  return company.id;
}

/** Create a CompanyRuntime for a company. */
async function createRuntime(companyId: number, poolSize: number, status = "active") {
  return db.companyRuntime.create({
    data: { companyId, workerPoolSize: poolSize, status },
  });
}

/** Create a BudgetConfig for a company. */
async function createBudgetConfig(
  companySlug: string,
  monthlyBudgetUsd: number,
  opts: { currentSpendUsd?: number; alertThresholdPct?: number; hardStopEnabled?: boolean } = {},
) {
  return db.budgetConfig.create({
    data: {
      companySlug,
      monthlyBudgetUsd,
      currentSpendUsd: opts.currentSpendUsd ?? 0,
      alertThresholdPct: opts.alertThresholdPct ?? 80,
      hardStopEnabled: opts.hardStopEnabled ?? false,
    },
  });
}

/**
 * Seed N pending jobs into the per-company queue (batch).
 */
async function seedQueueJobs(companySlug: string, count: number) {
  const now = new Date();
  // Prisma createMany doesn't support auto-increment well in SQLite, so we batch
  const BATCH = 50;
  for (let i = 0; i < count; i += BATCH) {
    const batch = Math.min(BATCH, count - i);
    const data = Array.from({ length: batch }, () => ({
      queue: `ai-queue:${companySlug}`,
      type: "ai-test",
      data: "{}",
      status: "pending" as const,
      attempts: 0,
      maxAttempts: 3,
      scheduledAt: now,
    }));
    await db.jobQueue.createMany({ data });
  }
}

/** Create an AIRequestLog entry with cost. */
async function createAIRequestLog(companySlug: string, costUsd: number, daysAgo?: number) {
  const createdAt = daysAgo
    ? new Date(Date.now() - daysAgo * 86_400_000)
    : new Date();
  return db.aIRequestLog.create({
    data: {
      companySlug,
      requestType: "other",
      resolvedBy: "ai",
      costUsd,
      latencyMs: 100,
      createdAt,
    },
  });
}

/** Full cleanup for test isolation. */
async function cleanTestData() {
  const slugs = [SLUG_A, SLUG_B, SLUG_C];
  await db.jobQueue.deleteMany({
    where: { queue: { in: slugs.map(s => `ai-queue:${s}`) } },
  });
  await db.aIRequestLog.deleteMany({
    where: { companySlug: { in: slugs } },
  });
  await db.budgetConfig.deleteMany({
    where: { companySlug: { in: slugs } },
  });
  await db.companyRuntime.deleteMany({
    where: { companyId: { in: [] } }, // placeholder
  });
  // Delete runtimes for our test companies
  for (const slug of slugs) {
    const company = await db.company.findUnique({ where: { slug } });
    if (company) {
      await db.companyRuntime.deleteMany({ where: { companyId: company.id } });
    }
  }
  await db.company.deleteMany({
    where: { slug: { in: slugs } },
  });
  await db.notification.deleteMany({
    where: { companySlug: { in: slugs } },
  });

  // Reset internal state
  __resetActiveSlugs();
  __resetAlertTracking();
  __setResourcePctForTesting(null);
}

// ─── Test Suite ─────────────────────────────────────────────────────────────

describe("AI Fabric: Worker Scaler (Phase 4)", () => {
  beforeEach(async () => {
    await cleanTestData();
  });

  afterAll(async () => {
    await cleanTestData();
  });

  // ── Tier limits ────────────────────────────────────────────────────────

  it("TIER_WORKER_LIMITS should have correct values", () => {
    expect(TIER_WORKER_LIMITS.trial).toBe(1);
    expect(TIER_WORKER_LIMITS.starter).toBe(1);
    expect(TIER_WORKER_LIMITS.business).toBe(4);
    expect(TIER_WORKER_LIMITS.enterprise).toBe(64);
  });

  it("planToTier maps plan strings correctly", () => {
    expect(planToTier("trial")).toBe("trial");
    expect(planToTier("starter")).toBe("starter");
    expect(planToTier("business")).toBe("business");
    expect(planToTier("enterprise")).toBe("enterprise");
    expect(planToTier("unknown")).toBe("trial"); // default
  });

  // ── getOrCreateRuntime ─────────────────────────────────────────────────

  it("should create a new runtime with tier default pool size", async () => {
    const companyId = await createCompany(SLUG_A, "business");
    const rt = await getOrCreateRuntime(companyId, "business");

    expect(rt.companyId).toBe(companyId);
    expect(rt.workerPoolSize).toBe(TIER_WORKER_LIMITS.business); // 4
    expect(rt.status).toBe("active");
  });

  it("should return existing runtime without changing pool size", async () => {
    const companyId = await createCompany(SLUG_A, "business");
    // Create with non-default pool size
    await createRuntime(companyId, 2);

    const rt = await getOrCreateRuntime(companyId, "business");
    expect(rt.workerPoolSize).toBe(2); // preserved, not reset to 4
  });

  it("trial plan should cap at 1 worker", async () => {
    const companyId = await createCompany(SLUG_A, "trial");
    const rt = await getOrCreateRuntime(companyId, "trial");

    expect(rt.workerPoolSize).toBe(1);
  });

  it("enterprise plan should default to 64 workers", async () => {
    const companyId = await createCompany(SLUG_A, "enterprise");
    const rt = await getOrCreateRuntime(companyId, "enterprise");

    expect(rt.workerPoolSize).toBe(64);
  });

  // ── scaleWorkers: queue overflow → scale up ────────────────────────────

  it("should scale up when queue exceeds 200 for sustained period", async () => {
    const companyId = await createCompany(SLUG_A, "business");
    await createRuntime(companyId, 2); // start with 2, ceiling is 4
    await seedQueueJobs(SLUG_A, 250);

    // First check: counter = 1 (not enough)
    await scaleWorkers();
    let rt = await db.companyRuntime.findUniqueOrThrow({ where: { companyId } });
    expect(rt.workerPoolSize).toBe(2); // no change yet

    // Second check: counter = 2 → triggers scale up (+2)
    await scaleWorkers();
    rt = await db.companyRuntime.findUniqueOrThrow({ where: { companyId } });
    expect(rt.workerPoolSize).toBe(4); // 2 + 2, capped at ceiling
  });

  it("should not scale beyond tier ceiling", async () => {
    const companyId = await createCompany(SLUG_A, "business");
    await createRuntime(companyId, 3); // ceiling is 4
    await seedQueueJobs(SLUG_A, 250);

    // Run sustained overflow twice
    await scaleWorkers();
    await scaleWorkers();

    const rt = await db.companyRuntime.findUniqueOrThrow({ where: { companyId } });
    expect(rt.workerPoolSize).toBe(4); // capped at tier ceiling, not 3+2=5
  });

  it("should NOT scale up when system resources > 80%", async () => {
    __setResourcePctForTesting(90); // simulate high CPU/memory
    const companyId = await createCompany(SLUG_A, "business");
    await createRuntime(companyId, 2);
    await seedQueueJobs(SLUG_A, 250);

    // Run sustained overflow twice
    await scaleWorkers();
    await scaleWorkers();

    const rt = await db.companyRuntime.findUniqueOrThrow({ where: { companyId } });
    expect(rt.workerPoolSize).toBe(2); // no scale-up due to resource pressure
  });

  // ── scaleWorkers: idle → scale down gradually ──────────────────────────

  it("should scale down gradually when queue is empty for sustained period", async () => {
    const companyId = await createCompany(SLUG_A, "business");
    await createRuntime(companyId, 4); // start with 4, no queue

    // First + second check: counter accumulates
    await scaleWorkers();
    await scaleWorkers();
    let rt = await db.companyRuntime.findUniqueOrThrow({ where: { companyId } });
    expect(rt.workerPoolSize).toBe(4); // no change yet (need 3 checks)

    // Third check: triggers scale down (−1)
    await scaleWorkers();
    rt = await db.companyRuntime.findUniqueOrThrow({ where: { companyId } });
    expect(rt.workerPoolSize).toBe(3); // 4 - 1 = 3
  });

  it("should not scale below 1 worker", async () => {
    const companyId = await createCompany(SLUG_A, "trial");
    await createRuntime(companyId, 1);

    // Run idle checks 4 times
    for (let i = 0; i < 4; i++) {
      await scaleWorkers();
    }

    const rt = await db.companyRuntime.findUniqueOrThrow({ where: { companyId } });
    expect(rt.workerPoolSize).toBe(1); // floor is 1
  });

  // ── getActiveWorkerCounts ──────────────────────────────────────────────

  it("should return worker counts for all active runtimes", async () => {
    const idA = await createCompany(SLUG_A, "business");
    const idB = await createCompany(SLUG_B, "enterprise");
    await createRuntime(idA, 2);
    await createRuntime(idB, 10);

    const counts = await getActiveWorkerCounts();
    expect(counts[SLUG_A]).toBe(2);
    expect(counts[SLUG_B]).toBe(10);
  });
});

describe("AI Fabric: Scheduler (Phase 5)", () => {
  beforeEach(async () => {
    await cleanTestData();
  });

  afterAll(async () => {
    await cleanTestData();
  });

  // ── Fair share basics ──────────────────────────────────────────────────

  it("each company should get base allocation equal to workerPoolSize", async () => {
    const idA = await createCompany(SLUG_A, "business");
    const idB = await createCompany(SLUG_B, "business");
    await createRuntime(idA, 2);
    await createRuntime(idB, 3);

    const map = await getAllocationMap();

    expect(map[SLUG_A].baseAllocation).toBe(2);
    expect(map[SLUG_B].baseAllocation).toBe(3);
    expect(map[SLUG_A].borrowedSlots).toBe(0);
    expect(map[SLUG_B].borrowedSlots).toBe(0);
  });

  // ── Idle company gives resources ───────────────────────────────────────

  it("idle company's slots should be distributed to busy companies", async () => {
    const idA = await createCompany(SLUG_A, "business");
    const idB = await createCompany(SLUG_B, "business");
    await createRuntime(idA, 4); // will be idle
    await createRuntime(idB, 2); // will be busy

    // B has jobs, A has none
    await seedQueueJobs(SLUG_B, 10);

    const map = await getAllocationMap();

    // A is idle, B should get borrowed slots
    expect(map[SLUG_A].isIdle).toBe(true);
    // B should have borrowed slots from A (4 idle / 1 busy = 4 extra, but capped by ceiling)
    // B's ceiling is 4, base is 2, so max borrow = 2
    expect(map[SLUG_B].borrowedSlots).toBeGreaterThan(0);
    expect(map[SLUG_B].totalAvailable).toBeGreaterThan(map[SLUG_B].baseAllocation);
  });

  it("borrowed slots should not exceed busy company's tier ceiling", async () => {
    const idA = await createCompany(SLUG_A, "enterprise"); // big idle company
    const idB = await createCompany(SLUG_B, "business");   // busy, ceiling=4
    await createRuntime(idA, 64);
    await createRuntime(idB, 4); // already at ceiling

    await seedQueueJobs(SLUG_B, 10);

    const map = await getAllocationMap();

    // B is at its ceiling, so no more borrowing allowed
    expect(map[SLUG_B].totalAvailable).toBeLessThanOrEqual(TIER_WORKER_LIMITS.business);
  });

  // ── Starvation prevention ──────────────────────────────────────────────

  it("previously idle company should reclaim slots when it becomes active", async () => {
    const idA = await createCompany(SLUG_A, "business");
    const idB = await createCompany(SLUG_B, "business");
    await createRuntime(idA, 4);
    await createRuntime(idB, 2);

    // B has jobs, A is idle
    await seedQueueJobs(SLUG_B, 10);

    // A is idle → B borrows
    const mapBefore = await getAllocationMap();
    expect(mapBefore[SLUG_A].isIdle).toBe(true);

    // Now A gets a job → mark it active
    await seedQueueJobs(SLUG_A, 5);
    await requestSlot(SLUG_A);

    // Re-evaluate allocation
    const mapAfter = await getAllocationMap();
    // A should now be considered active (not idle)
    expect(mapAfter[SLUG_A].isIdle).toBe(false);
    // A's slots are no longer available to B
    expect(mapAfter[SLUG_A].borrowedSlots).toBe(0);
  });

  // ── scheduleNextJob ────────────────────────────────────────────────────

  it("should pick the company with highest queue depth", async () => {
    const idA = await createCompany(SLUG_A, "business");
    const idB = await createCompany(SLUG_B, "business");
    await createRuntime(idA, 2);
    await createRuntime(idB, 2);

    await seedQueueJobs(SLUG_A, 5);
    await seedQueueJobs(SLUG_B, 20); // B has more work

    const next = await scheduleNextJob();
    expect(next).not.toBeNull();
    expect(next!.companySlug).toBe(SLUG_B);
  });

  it("should return null when no company needs capacity", async () => {
    const idA = await createCompany(SLUG_A, "business");
    await createRuntime(idA, 2);
    // No queue jobs

    const next = await scheduleNextJob();
    expect(next).toBeNull();
  });

  // ── requestSlot ────────────────────────────────────────────────────────

  it("should grant slot when under allocation", async () => {
    const idA = await createCompany(SLUG_A, "business");
    await createRuntime(idA, 4);

    const granted = await requestSlot(SLUG_A);
    expect(granted).toBe(true);
  });

  it("should deny slot when at capacity (running jobs = allocation)", async () => {
    const idA = await createCompany(SLUG_A, "business");
    await createRuntime(idA, 1);

    // Create 1 running job = fills allocation
    await db.jobQueue.create({
      data: {
        queue: `ai-queue:${SLUG_A}`,
        type: "ai-test",
        data: "{}",
        status: "running",
        attempts: 0,
        maxAttempts: 3,
        scheduledAt: new Date(),
        startedAt: new Date(),
      },
    });

    const granted = await requestSlot(SLUG_A);
    expect(granted).toBe(false);
  });
});

describe("AI Fabric: Budget Engine (Phase 6)", () => {
  beforeEach(async () => {
    await cleanTestData();
  });

  afterAll(async () => {
    await cleanTestData();
  });

  // ── recordSpend ────────────────────────────────────────────────────────

  it("should increment currentSpendUsd on each recordSpend call", async () => {
    await createBudgetConfig(SLUG_A, 100, { currentSpendUsd: 10 });

    await recordSpend(SLUG_A, 5);
    await recordSpend(SLUG_A, 3);

    const config = await db.budgetConfig.findUniqueOrThrow({ where: { companySlug: SLUG_A } });
    expect(config.currentSpendUsd).toBe(18); // 10 + 5 + 3
  });

  it("should create BudgetConfig if it does not exist", async () => {
    await recordSpend(SLUG_A, 2.5);

    const config = await db.budgetConfig.findUniqueOrThrow({ where: { companySlug: SLUG_A } });
    expect(config.currentSpendUsd).toBe(2.5);
  });

  it("should ignore zero or negative spend", async () => {
    await createBudgetConfig(SLUG_A, 100, { currentSpendUsd: 10 });

    await recordSpend(SLUG_A, 0);
    await recordSpend(SLUG_A, -5);

    const config = await db.budgetConfig.findUniqueOrThrow({ where: { companySlug: SLUG_A } });
    expect(config.currentSpendUsd).toBe(10); // unchanged
  });

  // ── Threshold alert ────────────────────────────────────────────────────

  it("should create notification when spend crosses alert threshold", async () => {
    await createBudgetConfig(SLUG_A, 100, {
      currentSpendUsd: 75, // 75%
      alertThresholdPct: 80,
    });

    // Push past 80%
    await recordSpend(SLUG_A, 10); // 85 → 85%

    const notifications = await db.notification.findMany({
      where: { companySlug: SLUG_A },
    });
    expect(notifications.length).toBe(1);
    expect(notifications[0].title).toContain("Budget Alert");
  });

  it("should not create duplicate alerts in same month", async () => {
    await createBudgetConfig(SLUG_A, 100, {
      currentSpendUsd: 75,
      alertThresholdPct: 80,
    });

    await recordSpend(SLUG_A, 10); // triggers alert
    await recordSpend(SLUG_A, 5);  // should NOT trigger again

    const notifications = await db.notification.findMany({
      where: { companySlug: SLUG_A },
    });
    expect(notifications.length).toBe(1); // only one alert
  });

  // ── Hard stop ──────────────────────────────────────────────────────────

  it("checkBudgetGate should return false when hard stop enabled and at limit", async () => {
    await createBudgetConfig(SLUG_A, 100, {
      currentSpendUsd: 100, // exactly at limit
      hardStopEnabled: true,
    });

    const allowed = await checkBudgetGate(SLUG_A);
    expect(allowed).toBe(false);
  });

  it("checkBudgetGate should return true when hard stop disabled", async () => {
    await createBudgetConfig(SLUG_A, 100, {
      currentSpendUsd: 150, // over limit
      hardStopEnabled: false,
    });

    const allowed = await checkBudgetGate(SLUG_A);
    expect(allowed).toBe(true); // no gate without hard stop
  });

  it("checkBudgetGate should return true when under budget", async () => {
    await createBudgetConfig(SLUG_A, 100, {
      currentSpendUsd: 50,
      hardStopEnabled: true,
    });

    const allowed = await checkBudgetGate(SLUG_A);
    expect(allowed).toBe(true);
  });

  it("checkBudgetGate should return true when no config exists", async () => {
    const allowed = await checkBudgetGate(SLUG_A);
    expect(allowed).toBe(true);
  });

  // ── getBudgetStatus ────────────────────────────────────────────────────

  it("should return complete budget status", async () => {
    await createBudgetConfig(SLUG_A, 100, {
      currentSpendUsd: 60,
      alertThresholdPct: 80,
      hardStopEnabled: false,
    });

    const status = await getBudgetStatus(SLUG_A);

    expect(status).not.toBeNull();
    expect(status!.companySlug).toBe(SLUG_A);
    expect(status!.monthlyBudgetUsd).toBe(100);
    expect(status!.currentSpendUsd).toBe(60);
    expect(status!.spendPct).toBe(60);
    expect(status!.alertTriggered).toBe(false);
    expect(status!.hardStopActive).toBe(false);
  });

  it("should show alertTriggered when past threshold", async () => {
    await createBudgetConfig(SLUG_A, 100, {
      currentSpendUsd: 85,
      alertThresholdPct: 80,
    });

    const status = await getBudgetStatus(SLUG_A);
    expect(status!.alertTriggered).toBe(true);
  });

  it("should show hardStopActive when hard stop enabled and at limit", async () => {
    await createBudgetConfig(SLUG_A, 100, {
      currentSpendUsd: 100,
      hardStopEnabled: true,
    });

    const status = await getBudgetStatus(SLUG_A);
    expect(status!.hardStopActive).toBe(true);
  });

  it("should return null when no config exists", async () => {
    const status = await getBudgetStatus(SLUG_A);
    expect(status).toBeNull();
  });

  // ── forecastMonthlySpend ───────────────────────────────────────────────

  it("should forecast monthly spend based on current rate", async () => {
    // Create AI request logs: $10 over 15 days → $20/month projected
    await createAIRequestLog(SLUG_A, 5, 15); // 15 days ago
    await createAIRequestLog(SLUG_A, 5, 1);  // 1 day ago

    const forecast = await forecastMonthlySpend(SLUG_A);
    expect(forecast).not.toBeNull();
    // Linear projection: $10 spent over ~14 days → $10 * (30/14) ≈ $21.43
    expect(forecast!).toBeGreaterThan(18);
    expect(forecast!).toBeLessThan(25);
  });

  it("should return null when no logs exist", async () => {
    const forecast = await forecastMonthlySpend(SLUG_A);
    expect(forecast).toBeNull();
  });

  it("getBudgetStatus should include forecast", async () => {
    await createBudgetConfig(SLUG_A, 100, { currentSpendUsd: 10 });
    await createAIRequestLog(SLUG_A, 10, 5); // $10 over 5 days

    const status = await getBudgetStatus(SLUG_A);
    expect(status!.forecastMonthlySpendUsd).not.toBeNull();
    expect(status!.forecastMonthlySpendUsd!).toBeGreaterThan(0);
  });
});
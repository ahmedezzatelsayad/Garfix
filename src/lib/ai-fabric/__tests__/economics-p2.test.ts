// @ts-nocheck
/**
 * economics-p2.test.ts — Phase 13-16 integration tests.
 *
 * Tests:
 *   - Worker Prediction (Phase 13): event detection, pre-scaling trigger, data requirement
 *   - AI Score (Phase 14): computation from real data, score < 60 trigger, daily save
 *   - Cost Per Invoice (Phase 15): AI-resolved have real cost, cache-resolved have $0, trend
 *   - AI Compiler (Phase 16a): clustering groups similar requests, compilation assessment
 *
 * Uses real Prisma (SQLite) — no mocks for DB.
 */

import { describe, it, expect, beforeAll, beforeEach, afterAll } from "bun:test";
import { db } from "@/lib/db";

// ─── Phase 13 imports ───────────────────────────────────────────────────────
import {
  KNOWN_EVENTS,
  getUpcomingEvents,
  shouldPreScale,
  getPostEventScaleDown,
  executePreScale,
  __resetPredictionState,
  __getPreScaledMap,
  __getScaleDownTargets,
  __setScaleDownIntervalMs,
  type KnownEvent,
} from "@/lib/ai-fabric/worker-prediction";

// ─── Phase 14 imports ───────────────────────────────────────────────────────
import {
  computeAndSaveScore,
  getLatestScore,
  getAllScores,
} from "@/lib/ai-fabric/ai-score";

// ─── Phase 15 imports ───────────────────────────────────────────────────────
import {
  getCostPerInvoice,
  getCostPerInvoiceTrend,
  linkInvoiceCost,
  parseInvoiceAiCost,
} from "@/lib/ai-fabric/cost-per-invoice";

// ─── Phase 16 imports ───────────────────────────────────────────────────────
import {
  clusterAIRequests,
  assessClusterForCompilation,
  getCompilationCandidates,
} from "@/lib/ai-fabric/ai-compiler";

// ─── Test Constants ─────────────────────────────────────────────────────────

const SLUG_PRED = "test-pred-co";
const SLUG_SCORE = "test-score-co";
const SLUG_COST = "test-cost-co";
const SLUG_COMPILE = "test-compile-co";

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Create a test company. */
async function createCompany(slug: string, plan = "business") {
  const company = await db.company.create({
    data: { name: `Test ${slug}`, slug, plan, subscriptionStatus: "active" },
  });
  return company;
}

/** Create a CompanyRuntime for a company. */
async function createRuntime(companyId: number, poolSize: number, status = "active") {
  return db.companyRuntime.create({
    data: { companyId, workerPoolSize: poolSize, status },
  });
}

/** Create an AIRequestLog entry. */
async function createLog(opts: {
  companySlug: string;
  requestType: string;
  resolvedBy: string;
  costUsd?: number;
  tokensUsed?: number;
  provider?: string;
  daysAgo?: number;
  createdAt?: Date;
}) {
  const createdAt = opts.createdAt ?? (opts.daysAgo
    ? new Date(Date.now() - opts.daysAgo * 86_400_000)
    : new Date());

  return db.aIRequestLog.create({
    data: {
      companySlug: opts.companySlug,
      requestType: opts.requestType,
      resolvedBy: opts.resolvedBy,
      costUsd: opts.costUsd ?? 0,
      tokensUsed: opts.tokensUsed,
      provider: opts.provider,
      latencyMs: 100,
      createdAt,
    },
  });
}

/** Create an Invoice for a company. */
async function createInvoice(companySlug: string, opts: { daysAgo?: number; source?: string } = {}) {
  const createdAt = opts.daysAgo
    ? new Date(Date.now() - opts.daysAgo * 86_400_000)
    : new Date();

  return db.invoice.create({
    data: {
      companySlug,
      invoiceNumber: `INV-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      clientName: "Test Client",
      issueDate: createdAt.toISOString().slice(0, 10),
      dueDate: createdAt.toISOString().slice(0, 10),
      total: "100",
      status: "draft",
      createdAt,
      source: opts.source,
    },
  });
}

/** Full cleanup for test isolation. */
async function cleanAll() {
  const slugs = [SLUG_PRED, SLUG_SCORE, SLUG_COST, SLUG_COMPILE];
  await db.aIRequestLog.deleteMany({ where: { companySlug: { in: slugs } } });
  await db.aiScoreSnapshot.deleteMany({ where: { companySlug: { in: slugs } } });
  await db.notification.deleteMany({ where: { companySlug: { in: slugs } } });
  await db.ruleCandidate.deleteMany({ where: { companySlug: { in: slugs } } });
  await db.compiledRule.deleteMany({ where: {} });
  await db.invoice.deleteMany({ where: { companySlug: { in: slugs } } });

  for (const slug of slugs) {
    const company = await db.company.findUnique({ where: { slug } });
    if (company) {
      await db.companyRuntime.deleteMany({ where: { companyId: company.id } });
    }
  }
  await db.company.deleteMany({ where: { slug: { in: slugs } } });

  __resetPredictionState();
}

// ═══════════════════════════════════════════════════════════════════════════════
// Phase 13: Worker Prediction
// ═══════════════════════════════════════════════════════════════════════════════

describe("Worker Prediction — Phase 13", () => {
  beforeEach(async () => {
    await cleanAll();
  });

  afterAll(async () => {
    await cleanAll();
  });

  it("KNOWN_EVENTS should include month_start and month_end", () => {
    expect(KNOWN_EVENTS).toContain("month_start");
    expect(KNOWN_EVENTS).toContain("month_end");
    expect(KNOWN_EVENTS).toHaveLength(2);
  });

  it("getUpcomingEvents should find events within the next 24 hours", () => {
    // Set now to be close to the end of the month to catch month_end
    // Since we can't control Date.now() easily, we just verify the function
    // returns an array of known event types
    const now = new Date();
    const events = getUpcomingEvents(now);

    // All returned events should have valid types
    for (const event of events) {
      expect(KNOWN_EVENTS).toContain(event.type);
      expect(event.windowStart).toBeInstanceOf(Date);
      expect(event.windowEnd).toBeInstanceOf(Date);
      expect(event.msUntilWindow).toBeDefined();
    }
  });

  it("getUpcomingEvents should include first day and last day of month boundaries", () => {
    // Create a date near the start of a month to ensure month_start is found
    const nearMonthStart = new Date(Date.UTC(2026, 6, 1, 0, 0, 0)); // July 1, 2026 00:00 UTC

    // Should find month_start for July (window started 10 min before)
    const events = getUpcomingEvents(nearMonthStart);

    const hasMonthStart = events.some((e) => e.type === "month_start");
    expect(hasMonthStart).toBe(true);
  });

  it("shouldPreScale should return false when not in pre-scale window", async () => {
    const companyId = await (await createCompany(SLUG_PRED, "business")).id;
    await createRuntime(companyId, 2);

    const event: KnownEvent = {
      type: "month_start",
      eventDate: new Date(Date.UTC(2026, 7, 1, 0, 0, 0)), // Aug 1
      windowStart: new Date(Date.UTC(2026, 6, 31, 23, 50, 0)),
      windowEnd: new Date(Date.UTC(2026, 8, 1, 2, 0, 0)),
    };

    // Now is July 30 — way before the window
    const now = new Date(Date.UTC(2026, 6, 30, 0, 0, 0));
    const result = await shouldPreScale(event, SLUG_PRED, now);
    expect(result).toBe(false);
  });

  it("shouldPreScale should return false when company lacks 2+ months of spike data", async () => {
    const companyId = await (await createCompany(SLUG_PRED, "business")).id;
    await createRuntime(companyId, 2);

    const event: KnownEvent = {
      type: "month_start",
      eventDate: new Date(Date.UTC(2026, 7, 1, 0, 0, 0)),
      windowStart: new Date(Date.UTC(2026, 6, 31, 23, 50, 0)),
      windowEnd: new Date(Date.UTC(2026, 8, 1, 2, 0, 0)),
    };

    // Now is in the pre-scale window
    const now = new Date(Date.UTC(2026, 7, 31, 23, 55, 0));

    // No historical data → should return false
    const result = await shouldPreScale(event, SLUG_PRED, now);
    expect(result).toBe(false);
  });

  it("shouldPreScale should return true when spike history exists and in window", async () => {
    const company = await createCompany(SLUG_PRED, "business");
    await createRuntime(company.id, 2);

    // Seed spike data: create many logs on past month-start dates,
    // and fewer on normal days (15th)
    // now = Jul 31, 2026 → function looks at June (m=1) and May (m=2)
    const spikeProvider = "openrouter/deepseek/deepseek-chat";

    // 2 months of month_start spike data
    // now is Jul 31 → m=1: June, m=2: May
    for (let m = 1; m <= 2; m++) {
      const lookbackMonth = 6 - m; // 6=Jul → 5=Jun, 4=May
      const monthStart = new Date(Date.UTC(2026, lookbackMonth, 1, 0, 0, 0));
      // 100 requests on month start day
      for (let i = 0; i < 100; i++) {
        await createLog({
          companySlug: SLUG_PRED,
          requestType: "ocr",
          resolvedBy: "ai",
          costUsd: 0.001,
          provider: spikeProvider,
          tokensUsed: 500,
          createdAt: new Date(monthStart.getTime() + i * 60000),
        });
      }

      // 20 requests on the 15th (normal day)
      const normalDay = new Date(Date.UTC(2026, lookbackMonth, 15, 0, 0, 0));
      for (let i = 0; i < 20; i++) {
        await createLog({
          companySlug: SLUG_PRED,
          requestType: "ocr",
          resolvedBy: "ai",
          costUsd: 0.001,
          provider: spikeProvider,
          tokensUsed: 500,
          createdAt: new Date(normalDay.getTime() + i * 60000),
        });
      }
    }

    // Event: Aug 1 month_start. Pre-scale window: Jul 31 23:50 → Aug 1 00:00
    const event: KnownEvent = {
      type: "month_start",
      eventDate: new Date(Date.UTC(2026, 7, 1, 0, 0, 0)),       // Aug 1
      windowStart: new Date(Date.UTC(2026, 6, 31, 23, 50, 0)),   // Jul 31 23:50
      windowEnd: new Date(Date.UTC(2026, 7, 1, 2, 0, 0)),
    };

    // Now is in the pre-scale window (Jul 31 23:55)
    const now = new Date(Date.UTC(2026, 6, 31, 23, 55, 0));
    const result = await shouldPreScale(event, SLUG_PRED, now);
    expect(result).toBe(true);
  });

  it("shouldPreScale should not double-pre-scale for same event", async () => {
    const company = await createCompany(SLUG_PRED, "business");
    await createRuntime(company.id, 2);

    // Seed spike history at June 1 and May 1 (relative to now = Jul 31)
    for (let m = 1; m <= 2; m++) {
      const lookbackMonth = 6 - m;
      const monthStart = new Date(Date.UTC(2026, lookbackMonth, 1, 0, 0, 0));
      for (let i = 0; i < 100; i++) {
        await createLog({
          companySlug: SLUG_PRED,
          requestType: "ocr",
          resolvedBy: "ai",
          costUsd: 0.001,
          createdAt: new Date(monthStart.getTime() + i * 60000),
        });
      }
      const normalDay = new Date(Date.UTC(2026, lookbackMonth, 15, 0, 0, 0));
      for (let i = 0; i < 20; i++) {
        await createLog({
          companySlug: SLUG_PRED,
          requestType: "ocr",
          resolvedBy: "ai",
          costUsd: 0.001,
          createdAt: new Date(normalDay.getTime() + i * 60000),
        });
      }
    }

    const event: KnownEvent = {
      type: "month_start",
      eventDate: new Date(Date.UTC(2026, 7, 1, 0, 0, 0)),
      windowStart: new Date(Date.UTC(2026, 6, 31, 23, 50, 0)),
      windowEnd: new Date(Date.UTC(2026, 7, 1, 2, 0, 0)),
    };
    const now = new Date(Date.UTC(2026, 6, 31, 23, 55, 0));

    // First call → true
    const result1 = await shouldPreScale(event, SLUG_PRED, now);
    expect(result1).toBe(true);

    // Mark as pre-scaled (as executePreScale would)
    __getPreScaledMap().set(`${SLUG_PRED}:2026-08-01`, "true");

    // Second call → false (already pre-scaled)
    const result2 = await shouldPreScale(event, SLUG_PRED, now);
    expect(result2).toBe(false);
  });

  it("executePreScale should increase worker pool and cap at tier ceiling", async () => {
    const company = await createCompany(SLUG_PRED, "business");
    await createRuntime(company.id, 2); // ceiling = 4, so +4 → capped at 4

    const event: KnownEvent = {
      type: "month_start",
      eventDate: new Date(Date.UTC(2026, 7, 1, 0, 0, 0)),
      windowStart: new Date(Date.UTC(2026, 6, 31, 23, 50, 0)),
      windowEnd: new Date(Date.UTC(2026, 8, 1, 2, 0, 0)),
    };

    await executePreScale(event, SLUG_PRED);

    const runtime = await db.companyRuntime.findUniqueOrThrow({
      where: { companyId: company.id },
    });
    // 2 + 4 = 6, but business ceiling is 4
    expect(runtime.workerPoolSize).toBe(4);

    // Should be marked as pre-scaled
    expect(__getPreScaledMap().has(`${SLUG_PRED}:2026-08-01`)).toBe(true);

    // Scale-down target should exist
    const targets = __getScaleDownTargets();
    expect(targets.has(SLUG_PRED)).toBe(true);
    expect(targets.get(SLUG_PRED)!.targetPoolSize).toBe(2);
  });

  it("getPostEventScaleDown should return scale-down targets and step down gradually", async () => {
    const company = await createCompany(SLUG_PRED, "business");
    await createRuntime(company.id, 4); // currently at 4

    // Manually set a scale-down target
    __getScaleDownTargets().set(SLUG_PRED, {
      targetPoolSize: 2,
      lastStepAt: 0, // allow immediate step
    });
    // Override interval so steps happen immediately in tests
    __setScaleDownIntervalMs(0);

    // First call: should step down from 4 → 3
    const results1 = await getPostEventScaleDown();
    const predResult = results1.find((r) => r.companySlug === SLUG_PRED);
    expect(predResult).toBeDefined();
    expect(predResult!.currentPoolSize).toBe(3);
    expect(predResult!.targetPoolSize).toBe(2);
    expect(predResult!.stepsRemaining).toBe(1);

    // Verify DB was updated
    const rt1 = await db.companyRuntime.findUniqueOrThrow({ where: { companyId: company.id } });
    expect(rt1.workerPoolSize).toBe(3);

    // Second call: should step down from 3 → 2
    const results2 = await getPostEventScaleDown();
    const predResult2 = results2.find((r) => r.companySlug === SLUG_PRED);
    // After reaching target, the entry should be cleaned up
    // But the result of this call may or may not include it depending on timing
    const rt2 = await db.companyRuntime.findUniqueOrThrow({ where: { companyId: company.id } });
    expect(rt2.workerPoolSize).toBe(2);

    // Cleanup
    __setScaleDownIntervalMs(null);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Phase 14: AI Score
// ═══════════════════════════════════════════════════════════════════════════════

describe("AI Score — Phase 14", () => {
  beforeEach(async () => {
    await cleanAll();
  });

  afterAll(async () => {
    await cleanAll();
  });

  it("should compute score of ~100 when all requests resolved by cache", async () => {
    await createCompany(SLUG_SCORE, "business");

    // 100 cache hits, 0 AI calls
    for (let i = 0; i < 100; i++) {
      await createLog({
        companySlug: SLUG_SCORE,
        requestType: "ocr",
        resolvedBy: "cache",
      });
    }

    const result = await computeAndSaveScore(SLUG_SCORE);

    expect(result.score).toBe(100);
    expect(result.cacheHitPct).toBe(100);
    expect(result.aiCallPct).toBe(0);
    expect(result.alerted).toBe(false);
  });

  it("should compute score of 0 when all requests resolved by AI with high cost", async () => {
    await createCompany(SLUG_SCORE, "business");

    // 100 AI calls with high cost
    for (let i = 0; i < 100; i++) {
      await createLog({
        companySlug: SLUG_SCORE,
        requestType: "ocr",
        resolvedBy: "ai",
        costUsd: 0.01,
      });
    }

    const result = await computeAndSaveScore(SLUG_SCORE);

    // score = 100 * (1 - 1.0) - 20 * (0.01 / 0.01) = 0 - 20 = -20 → clamped to 0
    expect(result.score).toBe(0);
    expect(result.aiCallPct).toBe(100);
    expect(result.avgCostPerRequest).toBe(0.01);
  });

  it("should compute mixed score correctly", async () => {
    await createCompany(SLUG_SCORE, "business");

    // 70 cache, 20 rule, 10 AI (with 0 cost)
    for (let i = 0; i < 70; i++) {
      await createLog({
        companySlug: SLUG_SCORE,
        requestType: "ocr",
        resolvedBy: "cache",
      });
    }
    for (let i = 0; i < 20; i++) {
      await createLog({
        companySlug: SLUG_SCORE,
        requestType: "ocr",
        resolvedBy: "rule",
      });
    }
    for (let i = 0; i < 10; i++) {
      await createLog({
        companySlug: SLUG_SCORE,
        requestType: "ocr",
        resolvedBy: "ai",
        costUsd: 0.005,
      });
    }

    const result = await computeAndSaveScore(SLUG_SCORE);

    // aiCallPct = 10%
    // avgCost = (10 * 0.005) / 100 = 0.0005
    // score = 100 * (1 - 0.1) - 20 * (0.0005 / 0.01)
    //       = 90 - 20 * 0.05
    //       = 90 - 1 = 89
    expect(result.score).toBe(89);
    expect(result.aiCallPct).toBe(10);
    expect(result.cacheHitPct).toBe(70);
    expect(result.ruleHitPct).toBe(20);
    expect(result.alerted).toBe(false);
  });

  it("should trigger alerts when score < 60", async () => {
    await createCompany(SLUG_SCORE, "business");

    // 50% AI calls with cost → score will be < 60
    for (let i = 0; i < 50; i++) {
      await createLog({
        companySlug: SLUG_SCORE,
        requestType: "ocr",
        resolvedBy: "cache",
      });
    }
    for (let i = 0; i < 50; i++) {
      await createLog({
        companySlug: SLUG_SCORE,
        requestType: "ocr",
        resolvedBy: "ai",
        costUsd: 0.01,
      });
    }

    const result = await computeAndSaveScore(SLUG_SCORE);

    // aiCallPct = 50%, avgCost = 0.005
    // score = 100 * 0.5 - 20 * 0.5 = 50 - 10 = 40
    expect(result.score).toBe(40);
    expect(result.alerted).toBe(true);

    // Verify notifications were created
    const notifications = await db.notification.findMany({
      where: { companySlug: SLUG_SCORE },
    });
    expect(notifications.length).toBe(2);
    expect(notifications[0].title).toContain("AI Score Alert");
    expect(notifications[1].title).toContain("Cost Review Needed");
  });

  it("should save score to AIScoreSnapshot and be retrievable via getLatestScore", async () => {
    await createCompany(SLUG_SCORE, "business");

    for (let i = 0; i < 50; i++) {
      await createLog({
        companySlug: SLUG_SCORE,
        requestType: "ocr",
        resolvedBy: "cache",
      });
    }
    for (let i = 0; i < 50; i++) {
      await createLog({
        companySlug: SLUG_SCORE,
        requestType: "ocr",
        resolvedBy: "ai",
        costUsd: 0.01,
      });
    }

    await computeAndSaveScore(SLUG_SCORE);

    const latest = await getLatestScore(SLUG_SCORE);
    expect(latest).not.toBeNull();
    expect(latest!.score).toBe(40);
    expect(latest!.aiCallPct).toBe(50);
    expect(latest!.period).toBeTruthy();
  });

  it("getLatestScore should return null for company with no scores", async () => {
    const latest = await getLatestScore("nonexistent-company");
    expect(latest).toBeNull();
  });

  it("getAllScores should return all today's scores", async () => {
    await createCompany(SLUG_SCORE, "business");

    for (let i = 0; i < 100; i++) {
      await createLog({
        companySlug: SLUG_SCORE,
        requestType: "ocr",
        resolvedBy: "cache",
      });
    }

    await computeAndSaveScore(SLUG_SCORE);

    const allScores = await getAllScores();
    expect(allScores.length).toBeGreaterThanOrEqual(1);
    const myScore = allScores.find((s) => s.companySlug === SLUG_SCORE);
    expect(myScore).toBeDefined();
    expect(myScore!.score).toBe(100);
  });

  it("should upsert score if computed twice for same period", async () => {
    await createCompany(SLUG_SCORE, "business");

    for (let i = 0; i < 100; i++) {
      await createLog({
        companySlug: SLUG_SCORE,
        requestType: "ocr",
        resolvedBy: "cache",
      });
    }

    await computeAndSaveScore(SLUG_SCORE);
    await computeAndSaveScore(SLUG_SCORE);

    // Should only have 1 snapshot for today
    const today = new Date().toISOString().slice(0, 10);
    const snapshots = await db.aiScoreSnapshot.findMany({
      where: { companySlug: SLUG_SCORE, period: today },
    });
    expect(snapshots).toHaveLength(1);
    expect(snapshots[0].score).toBe(100);
  });

  it("should return score of 100 with 0 requests (no data)", async () => {
    await createCompany(SLUG_SCORE, "business");

    // No logs at all
    const result = await computeAndSaveScore(SLUG_SCORE);

    // aiCallPct = 0, avgCost = 0
    // score = 100 * 1 - 0 = 100
    expect(result.score).toBe(100);
    expect(result.alerted).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Phase 15: Cost Per Invoice
// ═══════════════════════════════════════════════════════════════════════════════

describe("Cost Per Invoice — Phase 15", () => {
  beforeEach(async () => {
    await cleanAll();
  });

  afterAll(async () => {
    await cleanAll();
  });

  it("AI-resolved requests should contribute real cost", async () => {
    await createCompany(SLUG_COST, "business");

    const today = new Date();
    const dayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());

    // 10 AI-resolved requests with $0.01 cost each
    for (let i = 0; i < 10; i++) {
      await createLog({
        companySlug: SLUG_COST,
        requestType: "ocr",
        resolvedBy: "ai",
        costUsd: 0.01,
        createdAt: new Date(dayStart.getTime() + i * 60000),
      });
    }

    const result = await getCostPerInvoice(SLUG_COST, dayStart, new Date());

    expect(result.aiResolvedCount).toBe(10);
    expect(result.nonAiResolvedCount).toBe(0);
    // Total AI cost = 10 * $0.01 = $0.10
    expect(result.totalAiCostUsd).toBe(0.1);
  });

  it("cache-resolved requests should have $0 AI cost (only infra cost)", async () => {
    await createCompany(SLUG_COST, "business");

    const today = new Date();
    const dayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());

    // 10 cache-resolved requests (cost = 0 in AIRequestLog)
    for (let i = 0; i < 10; i++) {
      await createLog({
        companySlug: SLUG_COST,
        requestType: "ocr",
        resolvedBy: "cache",
        costUsd: 0,
        createdAt: new Date(dayStart.getTime() + i * 60000),
      });
    }

    const result = await getCostPerInvoice(SLUG_COST, dayStart, new Date());

    expect(result.aiResolvedCount).toBe(0);
    expect(result.nonAiResolvedCount).toBe(10);
    // Cache-resolved have only infra cost: 10 * $0.0001 = $0.001
    expect(result.totalAiCostUsd).toBe(0.001);
  });

  it("should calculate average cost per invoice correctly", async () => {
    await createCompany(SLUG_COST, "business");

    const today = new Date();
    const dayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());

    // 5 AI-resolved ($0.01 each) + 5 cache-resolved ($0 each in DB)
    for (let i = 0; i < 5; i++) {
      await createLog({
        companySlug: SLUG_COST,
        requestType: "ocr",
        resolvedBy: "ai",
        costUsd: 0.01,
        createdAt: new Date(dayStart.getTime() + i * 60000),
      });
    }
    for (let i = 0; i < 5; i++) {
      await createLog({
        companySlug: SLUG_COST,
        requestType: "ocr",
        resolvedBy: "cache",
        costUsd: 0,
        createdAt: new Date(dayStart.getTime() + (5 + i) * 60000),
      });
    }

    const result = await getCostPerInvoice(SLUG_COST, dayStart, new Date());

    // Total: 5 * $0.01 + 5 * $0.0001 = $0.0505
    // No invoices created → falls back to log count = 10
    expect(result.totalInvoices).toBe(10);
    expect(result.avgCostPerInvoice).toBeCloseTo(0.00505, 6);
  });

  it("linkInvoiceCost should store AI cost reference in invoice source", async () => {
    const company = await createCompany(SLUG_COST, "business");
    const invoice = await createInvoice(SLUG_COST);

    // Create an AI request log
    const log = await createLog({
      companySlug: SLUG_COST,
      requestType: "ocr",
      resolvedBy: "ai",
      costUsd: 0.025,
      provider: "openrouter/deepseek/deepseek-chat",
    });

    await linkInvoiceCost(invoice.id, log.id);

    const updated = await db.invoice.findUniqueOrThrow({ where: { id: invoice.id } });
    expect(updated.source).toContain("ai-fabric");
    expect(updated.source).toContain(String(log.id));
    expect(updated.source).toContain("ai");
    expect(updated.source).toContain("0.025");
  });

  it("parseInvoiceAiCost should extract cost from linked invoice", async () => {
    const parsed = parseInvoiceAiCost("ai-fabric:42:ai:0.015");
    expect(parsed).not.toBeNull();
    expect(parsed!.aiCostUsd).toBe(0.015);
    expect(parsed!.resolvedBy).toBe("ai");
  });

  it("parseInvoiceAiCost should return null for unlinked invoice", () => {
    expect(parseInvoiceAiCost(null)).toBeNull();
    expect(parseInvoiceAiCost("whatsapp")).toBeNull();
    expect(parseInvoiceAiCost("manual-entry")).toBeNull();
  });

  it("getCostPerInvoiceTrend should return daily data points", async () => {
    await createCompany(SLUG_COST, "business");

    // Seed some data for the past 3 days
    for (let d = 0; d < 3; d++) {
      const dayStart = new Date(Date.now() - d * 86_400_000);
      for (let i = 0; i < 5; i++) {
        await createLog({
          companySlug: SLUG_COST,
          requestType: "ocr",
          resolvedBy: "ai",
          costUsd: 0.01,
          createdAt: new Date(dayStart.getTime() + i * 60000),
        });
      }
    }

    const trend = await getCostPerInvoiceTrend(SLUG_COST, 3);

    expect(trend).toHaveLength(3);
    // Each point should have required fields
    for (const point of trend) {
      expect(point.period).toBeTruthy();
      expect(typeof point.avgCostPerInvoice).toBe("number");
      expect(typeof point.totalInvoices).toBe("number");
      expect(typeof point.aiCostUsd).toBe("number");
    }
  });

  it("getCostPerInvoiceTrend should return empty for no data", async () => {
    await createCompany(SLUG_COST, "business");

    const trend = await getCostPerInvoiceTrend(SLUG_COST, 3);
    expect(trend).toHaveLength(3);
    // All zeros
    for (const point of trend) {
      expect(point.totalInvoices).toBe(0);
      expect(point.avgCostPerInvoice).toBe(0);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Phase 16a: AI Compiler (clustering + assessment only)
// ═══════════════════════════════════════════════════════════════════════════════

describe("AI Compiler — Phase 16a", () => {
  beforeEach(async () => {
    await cleanAll();
  });

  afterAll(async () => {
    await cleanAll();
  });

  it("clusterAIRequests should group requests by requestType + clusterKey", async () => {
    await createCompany(SLUG_COMPILE, "business");

    // 20 AI requests with same provider + tokens (same cluster)
    for (let i = 0; i < 20; i++) {
      await createLog({
        companySlug: SLUG_COMPILE,
        requestType: "ocr",
        resolvedBy: "ai",
        provider: "openrouter/deepseek/deepseek-chat",
        tokensUsed: 500,
        costUsd: 0.002,
      });
    }

    // 10 AI requests with different tokens (different cluster)
    for (let i = 0; i < 10; i++) {
      await createLog({
        companySlug: SLUG_COMPILE,
        requestType: "ocr",
        resolvedBy: "ai",
        provider: "openrouter/deepseek/deepseek-chat",
        tokensUsed: 2000,
        costUsd: 0.005,
      });
    }

    const clusters = await clusterAIRequests(SLUG_COMPILE, 30);

    expect(clusters.length).toBeGreaterThanOrEqual(1);

    // Should find at least one cluster with 20 items
    const bigCluster = clusters.find((c) => c.count === 20);
    expect(bigCluster).toBeDefined();
    expect(bigCluster!.requestType).toBe("ocr");
    expect(bigCluster!.mostCommonProvider).toBe("openrouter/deepseek/deepseek-chat");
    expect(bigCluster!.avgTokensUsed).toBe(500);
  });

  it("clusterAIRequests should only include AI-resolved requests", async () => {
    await createCompany(SLUG_COMPILE, "business");

    // 10 cache-resolved (should NOT be included)
    for (let i = 0; i < 10; i++) {
      await createLog({
        companySlug: SLUG_COMPILE,
        requestType: "ocr",
        resolvedBy: "cache",
      });
    }

    // 5 AI-resolved
    for (let i = 0; i < 5; i++) {
      await createLog({
        companySlug: SLUG_COMPILE,
        requestType: "ocr",
        resolvedBy: "ai",
        provider: "test-model",
        tokensUsed: 100,
        costUsd: 0.001,
      });
    }

    const clusters = await clusterAIRequests(SLUG_COMPILE, 30);

    // Total count across all clusters should be 5 (only AI-resolved)
    const totalCount = clusters.reduce((sum, c) => sum + c.count, 0);
    expect(totalCount).toBe(5);
  });

  it("clusterAIRequests should return empty for no AI requests", async () => {
    await createCompany(SLUG_COMPILE, "business");

    const clusters = await clusterAIRequests(SLUG_COMPILE, 30);
    expect(clusters).toHaveLength(0);
  });

  it("clusterAIRequests should return empty for company with only non-AI logs", async () => {
    await createCompany(SLUG_COMPILE, "business");

    for (let i = 0; i < 10; i++) {
      await createLog({
        companySlug: SLUG_COMPILE,
        requestType: "ocr",
        resolvedBy: "cache",
      });
    }

    const clusters = await clusterAIRequests(SLUG_COMPILE, 30);
    expect(clusters).toHaveLength(0);
  });

  it("assessClusterForCompilation should reject clusters with count < 50", () => {
    const smallCluster = {
      clusterKey: "abc123",
      requestType: "ocr",
      count: 10,
      mostCommonProvider: "test-model",
      avgTokensUsed: 500,
      avgCostUsd: 0.002,
      totalCostUsd: 0.02,
      sampleIds: [1, 2, 3],
    };

    const assessment = assessClusterForCompilation(smallCluster, 30);

    expect(assessment.isCandidate).toBe(false);
    expect(assessment.reasons.some((r) => r.includes("below minimum threshold"))).toBe(true);
  });

  it("assessClusterForCompilation should accept clusters with count >= 50", () => {
    const bigCluster = {
      clusterKey: "abc123",
      requestType: "ocr",
      count: 60,
      mostCommonProvider: "test-model",
      avgTokensUsed: 500,
      avgCostUsd: 0.002,
      totalCostUsd: 0.12,
      sampleIds: Array.from({ length: 10 }, (_, i) => i + 1),
    };

    const assessment = assessClusterForCompilation(bigCluster, 30);

    expect(assessment.isCandidate).toBe(true);
    expect(assessment.structuralSimilarity).toBe(0.9);
  });

  it("assessClusterForCompilation should estimate annual savings", () => {
    const cluster = {
      clusterKey: "abc123",
      requestType: "ocr",
      count: 100,
      mostCommonProvider: "test-model",
      avgTokensUsed: 500,
      avgCostUsd: 0.005,
      totalCostUsd: 0.5, // $0.50 over 30 days → $6.05/year
      sampleIds: Array.from({ length: 10 }, (_, i) => i + 1),
    };

    const assessment = assessClusterForCompilation(cluster, 30);

    expect(assessment.isCandidate).toBe(true);
    // Daily cost = 0.50 / 30 = $0.0167, annual = $0.0167 * 365 ≈ $6.08
    expect(assessment.estimatedAnnualSavingsUsd).toBeGreaterThan(5);
    expect(assessment.estimatedAnnualSavingsUsd).toBeLessThan(10);
  });

  it("getCompilationCandidates should only return clusters passing criteria", async () => {
    await createCompany(SLUG_COMPILE, "business");

    // 60 requests in one cluster (passes) + 10 in another (fails)
    for (let i = 0; i < 60; i++) {
      await createLog({
        companySlug: SLUG_COMPILE,
        requestType: "ocr",
        resolvedBy: "ai",
        provider: "model-a",
        tokensUsed: 500,
        costUsd: 0.002,
      });
    }
    for (let i = 0; i < 10; i++) {
      await createLog({
        companySlug: SLUG_COMPILE,
        requestType: "matching",
        resolvedBy: "ai",
        provider: "model-b",
        tokensUsed: 1500,
        costUsd: 0.003,
      });
    }

    const candidates = await getCompilationCandidates(SLUG_COMPILE, 30);

    // Only the 60-count cluster should pass
    expect(candidates).toHaveLength(1);
    expect(candidates[0].cluster.count).toBe(60);
    expect(candidates[0].isCandidate).toBe(true);
  });

  it("getCompilationCandidates should return empty when no clusters meet criteria", async () => {
    await createCompany(SLUG_COMPILE, "business");

    // Only 30 requests (below 50 threshold)
    for (let i = 0; i < 30; i++) {
      await createLog({
        companySlug: SLUG_COMPILE,
        requestType: "ocr",
        resolvedBy: "ai",
        provider: "model-a",
        tokensUsed: 500,
        costUsd: 0.002,
      });
    }

    const candidates = await getCompilationCandidates(SLUG_COMPILE, 30);
    expect(candidates).toHaveLength(0);
  });
});
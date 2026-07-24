// @ts-nocheck
/**
 * economics-p1.test.ts — Phases 9-12 integration tests.
 *
 * Tests:
 *   - Phase 9 (worker-marketplace): priority ordering, enterprise preemption, SLA limits
 *   - Phase 10 (heat-map): insufficient data returns null, builds correct matrix
 *   - Phase 11 (learning-engine): observation recording, promotion at threshold, rejection
 *   - Phase 12 (cross-company): pattern contribution, lookup, privacy filtering
 *
 * Uses real Prisma (SQLite) — no mocks for DB.
 */

import { describe, it, expect, beforeAll, beforeEach, afterAll } from "bun:test";
import { db } from "@/lib/db";

// Phase 9
import {
  prioritizeRequest,
  canPreempt,
  getGlobalPoolStatus,
  SLA_LATENCY_DEFAULTS,
} from "@/lib/ai-fabric/worker-marketplace";

// Phase 10
import {
  getHeatMap,
  getPredictiveScale,
  hasEnoughData,
} from "@/lib/ai-fabric/heat-map";

// Phase 11
import {
  recordObservation,
  promoteCandidates,
  getLearningStatus,
  MIN_SAMPLES,
  MIN_CONFIDENCE,
} from "@/lib/ai-fabric/learning-engine";

// Phase 12
import {
  contributePattern,
  lookupGlobalPattern,
  getPatternStats,
  verifyNoSensitiveData,
} from "@/lib/ai-fabric/cross-company-intelligence";

import { fabricHash } from "@/lib/ai-fabric/types";

// ─── Test company slugs ─────────────────────────────────────────────────────

const SLUG_A = "test-econ-co-a";
const SLUG_B = "test-econ-co-b";
const SLUG_C = "test-econ-co-c";
const SLUG_D = "test-econ-co-d";

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Create a Company row and return its id. */
async function createCompany(slug: string, plan: string): Promise<number> {
  const company = await db.company.create({
    data: { name: `Test ${slug}`, slug, plan },
  });
  return company.id;
}

/** Create a CompanyRuntime for a company with SLA tier. */
async function createRuntime(
  companyId: number,
  opts: {
    workerPoolSize?: number;
    status?: string;
    slaTier?: string;
    maxAcceptableLatencyMs?: number;
  } = {},
) {
  return db.companyRuntime.create({
    data: {
      companyId,
      workerPoolSize: opts.workerPoolSize ?? 2,
      status: opts.status ?? "active",
      slaTier: opts.slaTier ?? "starter",
      maxAcceptableLatencyMs: opts.maxAcceptableLatencyMs ?? 2000,
    },
  });
}

/** Create an AIRequestLog entry. */
async function createAIRequestLog(
  companySlug: string,
  opts: {
    requestType?: string;
    resolvedBy?: string;
    costUsd?: number;
    latencyMs?: number;
    createdAt?: Date;
    provider?: string;
    tokensUsed?: number;
  } = {},
) {
  return db.aIRequestLog.create({
    data: {
      companySlug,
      requestType: opts.requestType ?? "other",
      resolvedBy: opts.resolvedBy ?? "ai",
      costUsd: opts.costUsd ?? 0,
      latencyMs: opts.latencyMs ?? 100,
      createdAt: opts.createdAt ?? new Date(),
      provider: opts.provider ?? null,
      tokensUsed: opts.tokensUsed ?? null,
    },
  });
}

/** Create a pending job in the queue. */
async function createPendingJob(companySlug: string) {
  return db.jobQueue.create({
    data: {
      queue: `ai-queue:${companySlug}`,
      type: "ai-test",
      data: "{}",
      status: "pending",
      attempts: 0,
      maxAttempts: 3,
      scheduledAt: new Date(),
    },
  });
}

/** Create a running job in the queue. */
async function createRunningJob(companySlug: string) {
  return db.jobQueue.create({
    data: {
      queue: `ai-queue:${companySlug}`,
      type: "ai-test",
      data: "{}",
      status: "running",
      attempts: 0,
      maxAttempts: 3,
      scheduledAt: new Date(),
      startedAt: new Date(),
    },
  });
}

/** Full cleanup for test isolation. */
async function cleanTestData() {
  const slugs = [SLUG_A, SLUG_B, SLUG_C, SLUG_D];

  await db.jobQueue.deleteMany({
    where: { queue: { in: slugs.map((s) => `ai-queue:${s}`) } },
  });
  await db.aIRequestLog.deleteMany({
    where: { companySlug: { in: slugs } },
  });
  await db.budgetConfig.deleteMany({
    where: { companySlug: { in: slugs } },
  });
  await db.ruleCandidate.deleteMany({
    where: { companySlug: { in: slugs } },
  });
  await db.globalPattern.deleteMany({
    where: { patternKey: { in: ["test widget", "safe product"] } },
  });
  // Broader cleanup for cross-company tests
  await db.globalPattern.deleteMany();

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
}

// ═══════════════════════════════════════════════════════════════════════════════
// Phase 9: Worker Marketplace
// ═══════════════════════════════════════════════════════════════════════════════

describe("Phase 9: Worker Marketplace", () => {
  beforeEach(async () => {
    await cleanTestData();
  });

  afterAll(async () => {
    await cleanTestData();
  });

  // ── SLA defaults ────────────────────────────────────────────────────────

  it("SLA_LATENCY_DEFAULTS should have correct values", () => {
    expect(SLA_LATENCY_DEFAULTS.enterprise).toBe(200);
    expect(SLA_LATENCY_DEFAULTS.business).toBe(800);
    expect(SLA_LATENCY_DEFAULTS.starter).toBe(2000);
  });

  // ── prioritizeRequest: tier ordering ─────────────────────────────────────

  it("enterprise request should have higher priority than business at same wait time", () => {
    const waitTime = 100;
    const ent = prioritizeRequest("ent-co", "ocr", waitTime, "enterprise");
    const bus = prioritizeRequest("bus-co", "ocr", waitTime, "business");

    expect(ent).toBeGreaterThan(bus);
  });

  it("business request should have higher priority than starter at same wait time", () => {
    const waitTime = 100;
    const bus = prioritizeRequest("bus-co", "ocr", waitTime, "business");
    const sta = prioritizeRequest("sta-co", "ocr", waitTime, "starter");

    expect(bus).toBeGreaterThan(sta);
  });

  it("longer wait time should increase priority within same tier", () => {
    const ent1 = prioritizeRequest("co", "ocr", 50, "enterprise");
    const ent2 = prioritizeRequest("co", "ocr", 150, "enterprise");

    expect(ent2).toBeGreaterThan(ent1);
  });

  it("enterprise at 0 wait should still outrank starter at max wait", () => {
    const ent = prioritizeRequest("ent-co", "ocr", 0, "enterprise");
    const sta = prioritizeRequest("sta-co", "ocr", 2000, "starter");

    expect(ent).toBeGreaterThan(sta);
  });

  // ── canPreempt ──────────────────────────────────────────────────────────

  it("enterprise can preempt from starter", () => {
    expect(canPreempt("starter", "enterprise")).toBe(true);
  });

  it("enterprise can preempt from business", () => {
    expect(canPreempt("business", "enterprise")).toBe(true);
  });

  it("business can preempt from starter", () => {
    expect(canPreempt("starter", "business")).toBe(true);
  });

  it("starter cannot preempt from anyone", () => {
    expect(canPreempt("enterprise", "starter")).toBe(false);
    expect(canPreempt("business", "starter")).toBe(false);
    expect(canPreempt("starter", "starter")).toBe(false);
  });

  it("cannot preempt from same tier", () => {
    expect(canPreempt("enterprise", "enterprise")).toBe(false);
    expect(canPreempt("business", "business")).toBe(false);
  });

  it("cannot preempt from a higher tier", () => {
    // canPreempt(fromTier, toTier): can toTier preempt FROM fromTier?
    // A lower toTier can NEVER preempt from a higher fromTier
    expect(canPreempt("enterprise", "business")).toBe(false); // business can't take from enterprise
    expect(canPreempt("enterprise", "starter")).toBe(false);  // starter can't take from enterprise
    expect(canPreempt("business", "starter")).toBe(false);    // starter can't take from business
  });

  // ── getGlobalPoolStatus ─────────────────────────────────────────────────

  it("should return correct pool status with multiple companies", async () => {
    const idA = await createCompany(SLUG_A, "enterprise");
    const idB = await createCompany(SLUG_B, "starter");
    await createRuntime(idA, { workerPoolSize: 10, slaTier: "enterprise", maxAcceptableLatencyMs: 200 });
    await createRuntime(idB, { workerPoolSize: 1, slaTier: "starter", maxAcceptableLatencyMs: 2000 });

    // Create some jobs
    await createRunningJob(SLUG_A);
    await createRunningJob(SLUG_A);
    await createPendingJob(SLUG_A);
    await createPendingJob(SLUG_B);

    const status = await getGlobalPoolStatus();

    expect(status.totalWorkers).toBe(11); // 10 + 1
    expect(status.runningJobs).toBe(2);
    expect(status.waitingJobs).toBe(2);
    expect(status.waitingByTier.enterprise).toBe(1);
    expect(status.waitingByTier.starter).toBe(1);
    expect(status.runningByTier.enterprise).toBe(2);
  });

  it("should return zeroed status with no active runtimes", async () => {
    const status = await getGlobalPoolStatus();

    expect(status.totalWorkers).toBe(0);
    expect(status.runningJobs).toBe(0);
    expect(status.waitingJobs).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Phase 10: Heat Map
// ═══════════════════════════════════════════════════════════════════════════════

describe("Phase 10: Heat Map", () => {
  beforeEach(async () => {
    await cleanTestData();
  });

  afterAll(async () => {
    await cleanTestData();
  });

  // ── hasEnoughData ───────────────────────────────────────────────────────

  it("should return false when no data exists", async () => {
    const result = await hasEnoughData(SLUG_A);
    expect(result).toBe(false);
  });

  it("should return false when data spans less than 7 days", async () => {
    // Create logs only for today and yesterday (2 days)
    await createAIRequestLog(SLUG_A, { createdAt: new Date() });
    await createAIRequestLog(SLUG_A, { createdAt: new Date(Date.now() - 1 * 86_400_000) });

    const result = await hasEnoughData(SLUG_A);
    expect(result).toBe(false);
  });

  it("should return true when data spans 7+ days", async () => {
    // Create a log 8 days ago
    await createAIRequestLog(SLUG_A, {
      createdAt: new Date(Date.now() - 8 * 86_400_000),
    });
    // And a recent one
    await createAIRequestLog(SLUG_A, { createdAt: new Date() });

    const result = await hasEnoughData(SLUG_A);
    expect(result).toBe(true);
  });

  // ── getHeatMap ──────────────────────────────────────────────────────────

  it("should return null when insufficient data", async () => {
    // Only 2 days of data
    await createAIRequestLog(SLUG_A, { createdAt: new Date() });
    await createAIRequestLog(SLUG_A, {
      createdAt: new Date(Date.now() - 2 * 86_400_000),
    });

    const heatMap = await getHeatMap(SLUG_A);
    expect(heatMap).toBeNull();
  });

  it("should return 24x7 matrix with sufficient data", async () => {
    // Seed 10 days of data: 5 requests per day at hour 14 (2 PM)
    // Use 10 days to ensure >= 7 days span regardless of time of day
    for (let d = 0; d < 10; d++) {
      const date = new Date(Date.now() - d * 86_400_000);
      date.setHours(14, 0, 0, 0);
      for (let i = 0; i < 5; i++) {
        await createAIRequestLog(SLUG_A, { createdAt: date });
      }
    }

    const heatMap = await getHeatMap(SLUG_A);

    expect(heatMap).not.toBeNull();
    expect(heatMap!.length).toBe(24); // 24 hours
    expect(heatMap![0].length).toBe(7); // 7 days of week

    // Hour 14 should have data
    const hour14Data = heatMap![14];
    const hasData = hour14Data.some((v) => v > 0);
    expect(hasData).toBe(true);
  });

  it("should return a matrix with all zeros for empty hour slots", async () => {
    // Seed 10 days of data at hour 0 only
    for (let d = 0; d < 10; d++) {
      const date = new Date(Date.now() - d * 86_400_000);
      date.setHours(0, 0, 0, 0);
      await createAIRequestLog(SLUG_A, { createdAt: date });
    }

    const heatMap = await getHeatMap(SLUG_A);
    expect(heatMap).not.toBeNull();

    // Hour 3 should be all zeros (no data)
    const hour3Data = heatMap![3];
    for (const val of hour3Data) {
      expect(val).toBe(0);
    }
  });

  // ── getPredictiveScale ──────────────────────────────────────────────────

  it("should return null when insufficient data", async () => {
    const scale = await getPredictiveScale(SLUG_A);
    expect(scale).toBeNull();
  });

  it("should return a number when data is available", async () => {
    // Seed 8 days of data with requests at the current hour
    const now = new Date();
    for (let d = 0; d < 8; d++) {
      const date = new Date(Date.now() - d * 86_400_000);
      date.setHours(now.getHours(), 0, 0, 0);
      for (let i = 0; i < 10; i++) {
        await createAIRequestLog(SLUG_A, { createdAt: date });
      }
    }

    const scale = await getPredictiveScale(SLUG_A);
    expect(scale).not.toBeNull();
    expect(scale!).toBeGreaterThanOrEqual(1);
    expect(scale!).toBeLessThanOrEqual(64);
  });

  it("should return at least 1 worker minimum", async () => {
    // Seed 10 days of data — very few requests
    for (let d = 0; d < 10; d++) {
      const date = new Date(Date.now() - d * 86_400_000);
      date.setHours(3, 0, 0, 0); // 3 AM — low traffic hour
      await createAIRequestLog(SLUG_A, { createdAt: date });
    }

    const scale = await getPredictiveScale(SLUG_A);
    expect(scale).not.toBeNull();
    expect(scale!).toBeGreaterThanOrEqual(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Phase 11: Learning Engine
// ═══════════════════════idence══════════════════════════════════════════════════

describe("Phase 11: Learning Engine", () => {
  beforeEach(async () => {
    await cleanTestData();
  });

  afterAll(async () => {
    await cleanTestData();
  });

  // ── recordObservation ───────────────────────────────────────────────────

  it("should create a new candidate on first observation", async () => {
    const hash = fabricHash("test-input");
    await recordObservation(SLUG_A, "matching", hash, { product: "Widget" });

    const candidates = await db.ruleCandidate.findMany({
      where: { companySlug: SLUG_A },
    });

    expect(candidates.length).toBe(1);
    expect(candidates[0].sampleCount).toBe(1);
    expect(candidates[0].confidence).toBe(1.0);
    expect(candidates[0].status).toBe("observing");
    expect(candidates[0].consistentOutput).toBe(JSON.stringify({ product: "Widget" }));
  });

  it("should increment sampleCount on repeated observation with same output", async () => {
    const hash = fabricHash("test-input");
    const output = { product: "Widget" };

    for (let i = 0; i < 5; i++) {
      await recordObservation(SLUG_A, "matching", hash, output);
    }

    const candidate = await db.ruleCandidate.findFirst({
      where: { companySlug: SLUG_A, patternSignature: hash },
    });

    expect(candidate).not.toBeNull();
    expect(candidate!.sampleCount).toBe(5);
    expect(candidate!.confidence).toBe(1.0); // all same → 100%
  });

  it("should decrease confidence on different output", async () => {
    const hash = fabricHash("test-input");

    // 5 identical, then 5 different
    for (let i = 0; i < 5; i++) {
      await recordObservation(SLUG_A, "matching", hash, { product: "Widget" });
    }
    for (let i = 0; i < 5; i++) {
      await recordObservation(SLUG_A, "matching", hash, { product: "Gadget" });
    }

    const candidate = await db.ruleCandidate.findFirst({
      where: { companySlug: SLUG_A, patternSignature: hash },
    });

    expect(candidate).not.toBeNull();
    expect(candidate!.sampleCount).toBe(10);
    expect(candidate!.confidence).toBeLessThan(1.0);
    // 5/10 = 0.5
    expect(candidate!.confidence).toBe(0.5);
  });

  // ── promoteCandidates ───────────────────────────────────────────────────

  it("should promote candidate when sampleCount >= 20 and confidence >= 0.95", async () => {
    const hash = fabricHash("consistent-input");
    const output = { product: "Consistent Widget" };

    // Record 20 identical observations → confidence = 1.0
    for (let i = 0; i < 20; i++) {
      await recordObservation(SLUG_A, "matching", hash, output);
    }

    const result = await promoteCandidates();

    expect(result.promoted).toBe(1);
    expect(result.rejected).toBe(0);

    const candidate = await db.ruleCandidate.findFirst({
      where: { companySlug: SLUG_A, patternSignature: hash },
    });
    expect(candidate!.status).toBe("promoted");
  });

  it("should NOT promote when sampleCount < 20", async () => {
    const hash = fabricHash("few-input");
    const output = { product: "Widget" };

    // Only 10 observations — below threshold
    for (let i = 0; i < 10; i++) {
      await recordObservation(SLUG_A, "matching", hash, output);
    }

    const result = await promoteCandidates();

    expect(result.promoted).toBe(0);

    const candidate = await db.ruleCandidate.findFirst({
      where: { companySlug: SLUG_A, patternSignature: hash },
    });
    expect(candidate!.status).toBe("observing"); // still observing
  });

  it("should reject candidate when confidence < 0.5 with enough samples", async () => {
    const hash = fabricHash("inconsistent-input");

    // 20 observations: 9 matching, 11 different → confidence < 0.5
    for (let i = 0; i < 9; i++) {
      await recordObservation(SLUG_A, "matching", hash, { product: "Widget" });
    }
    for (let i = 0; i < 11; i++) {
      await recordObservation(SLUG_A, "matching", hash, { product: "Other" });
    }

    const result = await promoteCandidates();

    expect(result.promoted).toBe(0);
    expect(result.rejected).toBe(1);

    const candidate = await db.ruleCandidate.findFirst({
      where: { companySlug: SLUG_A, patternSignature: hash },
    });
    expect(candidate!.status).toBe("rejected");
  });

  it("should keep candidate observing when 0.5 <= confidence < 0.95 with enough samples", async () => {
    const hash = fabricHash("middle-input");

    // 20 observations: 18 matching, 2 different → confidence = 0.90
    for (let i = 0; i < 18; i++) {
      await recordObservation(SLUG_A, "matching", hash, { product: "Widget" });
    }
    for (let i = 0; i < 2; i++) {
      await recordObservation(SLUG_A, "matching", hash, { product: "Other" });
    }

    const result = await promoteCandidates();

    expect(result.promoted).toBe(0); // 18/20 = 0.90 < 0.95
    expect(result.rejected).toBe(0); // 0.90 >= 0.5

    const candidate = await db.ruleCandidate.findFirst({
      where: { companySlug: SLUG_A, patternSignature: hash },
    });
    expect(candidate!.status).toBe("observing");
  });

  // ── getLearningStatus ───────────────────────────────────────────────────

  it("should return correct status counts", async () => {
    // Create some candidates directly
    await db.ruleCandidate.create({
      data: {
        companySlug: SLUG_A,
        requestType: "matching",
        patternSignature: "obs-1",
        sampleCount: 5,
        consistentOutput: "{}",
        confidence: 0.8,
        status: "observing",
      },
    });
    await db.ruleCandidate.create({
      data: {
        companySlug: SLUG_A,
        requestType: "matching",
        patternSignature: "obs-2",
        sampleCount: 5,
        consistentOutput: "{}",
        confidence: 0.7,
        status: "observing",
      },
    });
    await db.ruleCandidate.create({
      data: {
        companySlug: SLUG_A,
        requestType: "ocr",
        patternSignature: "prom-1",
        sampleCount: 25,
        consistentOutput: "{}",
        confidence: 1.0,
        status: "promoted",
      },
    });
    await db.ruleCandidate.create({
      data: {
        companySlug: SLUG_A,
        requestType: "ocr",
        patternSignature: "rej-1",
        sampleCount: 25,
        consistentOutput: "{}",
        confidence: 0.3,
        status: "rejected",
      },
    });

    const status = await getLearningStatus(SLUG_A);

    expect(status.companySlug).toBe(SLUG_A);
    expect(status.observing).toBe(2);
    expect(status.promoted).toBe(1);
    expect(status.rejected).toBe(1);
    expect(status.total).toBe(4);
  });

  it("should return zeroed status for company with no candidates", async () => {
    const status = await getLearningStatus(SLUG_A);

    expect(status.companySlug).toBe(SLUG_A);
    expect(status.observing).toBe(0);
    expect(status.promoted).toBe(0);
    expect(status.rejected).toBe(0);
    expect(status.total).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Phase 12: Cross-Company Intelligence
// ═══════════════════════════════════════════════════════════════════════════════

describe("Phase 12: Cross-Company Intelligence", () => {
  beforeEach(async () => {
    await cleanTestData();
  });

  afterAll(async () => {
    await cleanTestData();
  });

  // ── contributePattern ───────────────────────────────────────────────────

  it("should store a valid pattern with high confidence", async () => {
    const result = await contributePattern(
      "test widget",
      "SKU-001",
      "standard",
      "electronics",
      0.95,
    );

    expect(result).toBe(true);

    const pattern = await db.globalPattern.findUnique({
      where: { patternKey: "test widget" },
    });
    expect(pattern).not.toBeNull();
    expect(pattern!.suggestedSku).toBe("SKU-001");
    expect(pattern!.suggestedVatCategory).toBe("standard");
    expect(pattern!.suggestedCategory).toBe("electronics");
    expect(pattern!.contributingCompaniesCount).toBe(1);
    expect(pattern!.confidence).toBe(0.95);
  });

  it("should reject pattern with low confidence (< 0.90)", async () => {
    const result = await contributePattern(
      "test widget",
      "SKU-001",
      "standard",
      "electronics",
      0.85, // below threshold
    );

    expect(result).toBe(false);

    const pattern = await db.globalPattern.findUnique({
      where: { patternKey: "test widget" },
    });
    expect(pattern).toBeNull();
  });

  it("should increment contributingCompaniesCount on repeated contribution", async () => {
    await contributePattern("test widget", "SKU-001", "standard", "electronics", 0.95);
    await contributePattern("test widget", "SKU-002", "reduced", "electronics", 0.92);

    const pattern = await db.globalPattern.findUnique({
      where: { patternKey: "test widget" },
    });

    expect(pattern).not.toBeNull();
    expect(pattern!.contributingCompaniesCount).toBe(2);
    // Confidence should be average of 0.95 and 0.92
    expect(pattern!.confidence).toBeCloseTo(0.935, 3);
    // SKU should keep the first one
    expect(pattern!.suggestedSku).toBe("SKU-001");
    // VAT category should keep the first one
    expect(pattern!.suggestedVatCategory).toBe("standard");
  });

  // ── lookupGlobalPattern ─────────────────────────────────────────────────

  it("should return null for non-existent pattern", async () => {
    const result = await lookupGlobalPattern("nonexistent product");
    expect(result).toBeNull();
  });

  it("should return pattern data for existing pattern", async () => {
    await contributePattern("test widget", "SKU-001", "standard", "electronics", 0.95);

    const result = await lookupGlobalPattern("test widget");

    expect(result).not.toBeNull();
    expect(result!.patternKey).toBe("test widget");
    expect(result!.suggestedSku).toBe("SKU-001");
    expect(result!.suggestedVatCategory).toBe("standard");
    expect(result!.suggestedCategory).toBe("electronics");
    expect(result!.contributingCompaniesCount).toBe(1);
    expect(result!.confidence).toBe(0.95);
  });

  it("should lookup case-insensitively (normalized)", async () => {
    await contributePattern("Test Widget", "SKU-001", "standard", "electronics", 0.95);

    const result = await lookupGlobalPattern("TEST WIDGET");

    expect(result).not.toBeNull();
    expect(result!.patternKey).toBe("test widget"); // normalized
  });

  // ── Privacy filtering ──────────────────────────────────────────────────

  it("should reject pattern containing price information", async () => {
    const result = await contributePattern(
      "widget price $19.99",
      "SKU-001",
      "standard",
      "electronics",
      0.95,
    );

    expect(result).toBe(false);
  });

  it("should reject pattern containing customer data", async () => {
    const result = await contributePattern(
      "widget for customer John",
      "SKU-001",
      "standard",
      "electronics",
      0.95,
    );

    expect(result).toBe(false);
  });

  it("should reject pattern containing company data", async () => {
    const result = await contributePattern(
      "widget from company Acme Corp",
      "SKU-001",
      "standard",
      "electronics",
      0.95,
    );

    expect(result).toBe(false);
  });

  it("should reject pattern containing invoice data", async () => {
    const result = await contributePattern(
      "widget invoice #12345",
      "SKU-001",
      "standard",
      "electronics",
      0.95,
    );

    expect(result).toBe(false);
  });

  it("should reject pattern containing email", async () => {
    const result = await contributePattern(
      "widget email contact",
      "SKU-001",
      "standard",
      "electronics",
      0.95,
    );

    expect(result).toBe(false);
  });

  it("should reject pattern containing financial terms in VAT category", async () => {
    const result = await contributePattern(
      "safe product",
      "SKU-001",
      "reduced tax payment due",
      "electronics",
      0.95,
    );

    expect(result).toBe(false);
  });

  it("should accept clean pattern data", async () => {
    const result = await contributePattern(
      "safe product",
      "SKU-001",
      "standard",
      "electronics",
      0.95,
    );

    expect(result).toBe(true);
  });

  // ── verifyNoSensitiveData (unit) ────────────────────────────────────────

  it("verifyNoSensitiveData should detect price in product name", () => {
    expect(verifyNoSensitiveData("usb cable price", "SKU-1", "std", "elec")).toBe(false);
  });

  it("verifyNoSensitiveData should detect customer in product name", () => {
    expect(verifyNoSensitiveData("cable for customer", "SKU-1", "std", "elec")).toBe(false);
  });

  it("verifyNoSensitiveData should accept clean data", () => {
    expect(verifyNoSensitiveData("usb cable", "SKU-1", "standard", "electronics")).toBe(true);
  });

  it("verifyNoSensitiveData should detect quantity in any field", () => {
    expect(verifyNoSensitiveData("safe product", "SKU-1", "std", "qty 5")).toBe(false);
  });

  // ── getPatternStats ─────────────────────────────────────────────────────

  it("should return empty stats when no patterns exist", async () => {
    const stats = await getPatternStats();

    expect(stats.totalPatterns).toBe(0);
    expect(stats.avgConfidence).toBe(0);
    expect(stats.avgContributingCompanies).toBe(0);
    expect(stats.topPatterns).toHaveLength(0);
  });

  it("should return correct stats with patterns", async () => {
    await contributePattern("widget a", "SKU-1", "std", "elec", 0.95);
    await contributePattern("widget b", "SKU-2", "red", "elec", 0.90);
    await contributePattern("widget a", "SKU-3", "std", "elec", 0.92); // contributes to a

    const stats = await getPatternStats();

    expect(stats.totalPatterns).toBe(2);
    expect(stats.avgConfidence).toBeGreaterThan(0);
    expect(stats.topPatterns.length).toBeLessThanOrEqual(10);
  });
});
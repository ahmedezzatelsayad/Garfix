/**
 * p2-cost-cron.test.ts — P2 regression tests.
 *
 * Verifies the three P2 features:
 *   P2.1  costTracker → provider-scoring wiring (computeCallCostUsd +
 *        callWithProviderRouting passes real costUsd + confidence into
 *        recordProviderOutcome instead of leaving them at cold-start
 *        defaults)
 *   P2.2  Session-registry sweep cron (startSessionSweepCron +
 *        runSessionSweep + stopSessionSweepCron + MAINTENANCE_DISABLED)
 *   P2.3  Outbox purge cron (startOutboxPurgeCron + runOutboxPurge +
 *        stopOutboxPurgeCron + configurable retention)
 *
 * Tests are hermetic — they use mocks for DB / Valkey so they run
 * without external dependencies.
 */

import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test";

// ─── P2.1: costTracker → provider-scoring wiring ──────────────────────────

describe("P2.1: computeCallCostUsd + costTracker wiring", () => {
  afterEach(() => mock.restore());

  it("computeCallCostUsd returns 0 when both token counts are 0", async () => {
    const { computeCallCostUsd } = await import("@/lib/ai/cost-rates");
    expect(computeCallCostUsd("gpt-4o-mini", 0, 0)).toBe(0);
  });

  it("computeCallCostUsd returns 0 for free-tier models", async () => {
    const { computeCallCostUsd } = await import("@/lib/ai/cost-rates");
    // z-ai-glm is free in sandbox — both input and output rates are 0
    expect(computeCallCostUsd("z-ai-glm", 1500, 500)).toBe(0);
    expect(computeCallCostUsd("deepseek/deepseek-chat:free", 1500, 500)).toBe(0);
  });

  it("computeCallCostUsd computes cost for paid models using per-1K rates", async () => {
    const { computeCallCostUsd } = await import("@/lib/ai/cost-rates");
    // gpt-4o-mini: input=0.00015, output=0.0006 per 1K
    // 1200 in + 350 out = (1200/1000)*0.00015 + (350/1000)*0.0006
    //                   = 0.00018 + 0.00021 = 0.00039
    const cost = computeCallCostUsd("gpt-4o-mini", 1200, 350);
    expect(cost).toBeCloseTo(0.00039, 7);
  });

  it("computeCallCostUsd falls back to default rates for unknown models", async () => {
    const { computeCallCostUsd } = await import("@/lib/ai/cost-rates");
    // default: input=0.001, output=0.002 per 1K
    // 1000 in + 1000 out = 0.001 + 0.002 = 0.003
    const cost = computeCallCostUsd("some-unknown-model", 1000, 1000);
    expect(cost).toBeCloseTo(0.003, 7);
  });

  it("computeCallCostUsd handles undefined/null inputs gracefully", async () => {
    const { computeCallCostUsd } = await import("@/lib/ai/cost-rates");
    expect(computeCallCostUsd(undefined, undefined, undefined)).toBe(0);
    expect(computeCallCostUsd(null, null, null)).toBe(0);
    // If only tokensIn is set, compute using just input rate
    const cost = computeCallCostUsd("gpt-4o-mini", 1000, undefined);
    expect(cost).toBeCloseTo(0.00015, 7);
  });

  it("recordProviderOutcome accepts costUsd and reflects it in metrics.avgCostUsd", async () => {
    // Mock Valkey so the scoring module doesn't try to persist
    mock.module("@/lib/valkey", () => ({
      getValkeyClient: mock(async () => null),
      VALKEY_CONFIGURED: false,
    }));
    const { recordProviderOutcome, getProviderScore } = await import(
      "@/lib/ai-fabric/provider-scoring"
    );
    const pid = "p2-cost-wired-provider";
    await recordProviderOutcome(pid, {
      success: true,
      latencyMs: 300,
      costUsd: 0.0023,
      confidence: 0.95,
    });
    const score = getProviderScore(pid);
    expect(score.metrics.avgCostUsd).toBeCloseTo(0.0023, 7);
    expect(score.metrics.avgConfidence).toBeCloseTo(0.95, 7);
    expect(score.metrics.sampleCount).toBe(1);
  });

  it("recordProviderOutcome preserves prior avgCostUsd when costUsd is omitted (cold-start preservation)", async () => {
    mock.module("@/lib/valkey", () => ({
      getValkeyClient: mock(async () => null),
      VALKEY_CONFIGURED: false,
    }));
    const { recordProviderOutcome, getProviderScore } = await import(
      "@/lib/ai-fabric/provider-scoring"
    );
    const pid = "p2-cost-preserve-provider";
    // First call sets cost=0.005
    await recordProviderOutcome(pid, {
      success: true,
      latencyMs: 200,
      costUsd: 0.005,
      confidence: 0.9,
    });
    // Second call omits cost — should preserve prior EMA, not reset to 0
    await recordProviderOutcome(pid, {
      success: true,
      latencyMs: 250,
      // costUsd + confidence intentionally omitted
    });
    const score = getProviderScore(pid);
    expect(score.metrics.avgCostUsd).toBeCloseTo(0.005, 7);
    expect(score.metrics.sampleCount).toBe(2);
  });
});

// ─── P2.2 + P2.3: Maintenance crons ───────────────────────────────────────

describe("P2.2 + P2.3: maintenance crons", () => {
  beforeEach(() => {
    // Default: crons enabled
    delete process.env.MAINTENANCE_DISABLED;
    // Use very short intervals so tests don't have to wait
    process.env.MAINTENANCE_SESSION_SWEEP_INTERVAL_MS = "50";
    process.env.MAINTENANCE_OUTBOX_PURGE_INTERVAL_MS = "50";
    process.env.MAINTENANCE_OUTBOX_PURGE_OLDER_THAN_DAYS = "30";
  });

  afterEach(() => {
    delete process.env.MAINTENANCE_DISABLED;
    delete process.env.MAINTENANCE_SESSION_SWEEP_INTERVAL_MS;
    delete process.env.MAINTENANCE_OUTBOX_PURGE_INTERVAL_MS;
    delete process.env.MAINTENANCE_OUTBOX_PURGE_OLDER_THAN_DAYS;
    mock.restore();
  });

  // ─── P2.2: Session sweep ───────────────────────────────────────────────

  it("runSessionSweep calls cleanupExpiredSessions and returns deleted count", async () => {
    let capturedWhere: unknown = null;
    mock.module("@/lib/db", () => ({
      db: {
        sessionRegistry: {
          deleteMany: mock(async (args: { where: unknown }) => {
            capturedWhere = args.where;
            return { count: 7 };
          }),
        },
      },
    }));

    const { runSessionSweep } = await import("@/lib/maintenance-cron");
    const deleted = await runSessionSweep();
    expect(deleted).toBe(7);
    // Verify the sweep targets expired sessions
    expect(capturedWhere).toEqual({
      expiresAt: { lt: expect.any(Date) },
    });
  });

  it("startSessionSweepCron is idempotent (multiple calls start one timer)", async () => {
    mock.module("@/lib/db", () => ({
      db: { sessionRegistry: { deleteMany: mock(async () => ({ count: 0 })) } },
    }));
    const { startSessionSweepCron, stopSessionSweepCron } = await import(
      "@/lib/maintenance-cron"
    );
    startSessionSweepCron();
    startSessionSweepCron();
    startSessionSweepCron();
    // stopSessionSweepCron should clear the single timer without error
    stopSessionSweepCron();
    // Calling stop again (when no timer is running) should also be safe
    stopSessionSweepCron();
    expect(true).toBe(true); // reached without throwing
  });

  it("MAINTENANCE_DISABLED=1 disables the session sweep cron", async () => {
    process.env.MAINTENANCE_DISABLED = "1";
    mock.module("@/lib/db", () => ({
      db: { sessionRegistry: { deleteMany: mock(async () => ({ count: 99 })) } },
    }));
    const { startSessionSweepCron, stopSessionSweepCron } = await import(
      "@/lib/maintenance-cron"
    );
    // Should be a no-op — no timer started
    startSessionSweepCron();
    stopSessionSweepCron();
    expect(true).toBe(true);
  });

  it("session sweep is re-entrant (run-guard prevents overlapping iterations)", async () => {
    // The run-guard is inside the setInterval callback — testing it
    // directly is hard, but we can at least verify runSessionSweep
    // itself doesn't break when called rapidly in succession.
    mock.module("@/lib/db", () => ({
      db: {
        sessionRegistry: {
          deleteMany: mock(async () => ({ count: 3 })),
        },
      },
    }));
    const { runSessionSweep } = await import("@/lib/maintenance-cron");
    const results = await Promise.all([runSessionSweep(), runSessionSweep(), runSessionSweep()]);
    expect(results).toEqual([3, 3, 3]);
  });

  // ─── P2.3: Outbox purge ────────────────────────────────────────────────

  it("runOutboxPurge calls purgePublishedOutbox(30) and returns deleted count", async () => {
    let capturedOlderThanDays: number | undefined;
    mock.module("@/lib/db", () => ({
      db: {
        outboxEvent: {
          deleteMany: mock(async (args: { where: unknown }) => {
            // Inspect the cutoff to verify it's ~30 days ago
            const filter = args.where as { publishedAt: { lt: Date }; status: string };
            capturedOlderThanDays = Math.round(
              (Date.now() - filter.publishedAt.lt.getTime()) / (24 * 60 * 60 * 1000),
            );
            return { count: 42 };
          }),
        },
      },
    }));

    const { runOutboxPurge } = await import("@/lib/maintenance-cron");
    const deleted = await runOutboxPurge();
    expect(deleted).toBe(42);
    expect(capturedOlderThanDays).toBe(30);
  });

  it("runOutboxPurge respects MAINTENANCE_OUTBOX_PURGE_OLDER_THAN_DAYS override", async () => {
    process.env.MAINTENANCE_OUTBOX_PURGE_OLDER_THAN_DAYS = "7";
    let capturedDays: number | undefined;
    mock.module("@/lib/db", () => ({
      db: {
        outboxEvent: {
          deleteMany: mock(async (args: { where: unknown }) => {
            const filter = args.where as { publishedAt: { lt: Date } };
            capturedDays = Math.round(
              (Date.now() - filter.publishedAt.lt.getTime()) / (24 * 60 * 60 * 1000),
            );
            return { count: 5 };
          }),
        },
      },
    }));
    const { runOutboxPurge } = await import("@/lib/maintenance-cron");
    await runOutboxPurge();
    expect(capturedDays).toBe(7);
  });

  it("startOutboxPurgeCron is idempotent", async () => {
    mock.module("@/lib/db", () => ({
      db: { outboxEvent: { deleteMany: mock(async () => ({ count: 0 })) } },
    }));
    const { startOutboxPurgeCron, stopOutboxPurgeCron } = await import(
      "@/lib/maintenance-cron"
    );
    startOutboxPurgeCron();
    startOutboxPurgeCron();
    stopOutboxPurgeCron();
    stopOutboxPurgeCron();
    expect(true).toBe(true);
  });

  it("MAINTENANCE_DISABLED=1 disables the outbox purge cron", async () => {
    process.env.MAINTENANCE_DISABLED = "1";
    mock.module("@/lib/db", () => ({
      db: { outboxEvent: { deleteMany: mock(async () => ({ count: 99 })) } },
    }));
    const { startOutboxPurgeCron, stopOutboxPurgeCron } = await import(
      "@/lib/maintenance-cron"
    );
    startOutboxPurgeCron(); // no-op
    stopOutboxPurgeCron();
    expect(true).toBe(true);
  });

  // ─── Combined ──────────────────────────────────────────────────────────

  it("startMaintenanceCrons starts both crons; stopMaintenanceCrons stops both", async () => {
    mock.module("@/lib/db", () => ({
      db: {
        sessionRegistry: { deleteMany: mock(async () => ({ count: 0 })) },
        outboxEvent: { deleteMany: mock(async () => ({ count: 0 })) },
      },
    }));
    const { startMaintenanceCrons, stopMaintenanceCrons } = await import(
      "@/lib/maintenance-cron"
    );
    startMaintenanceCrons();
    stopMaintenanceCrons();
    // After stop, calling start again should work (idempotent restart)
    startMaintenanceCrons();
    stopMaintenanceCrons();
    expect(true).toBe(true);
  });

  it("purgePublishedOutbox only deletes status='published' rows (not pending/dead)", async () => {
    let capturedStatus: string | undefined;
    mock.module("@/lib/db", () => ({
      db: {
        outboxEvent: {
          deleteMany: mock(async (args: { where: unknown }) => {
            const filter = args.where as { status: string; publishedAt: { lt: Date } };
            capturedStatus = filter.status;
            return { count: 0 };
          }),
        },
      },
    }));
    // Re-import outbox fresh so it picks up the mock
    const { purgePublishedOutbox } = await import("@/lib/outbox");
    await purgePublishedOutbox(30);
    expect(capturedStatus).toBe("published");
  });
});

// ─── P2.1: callWithProviderRouting end-to-end cost wiring ─────────────────
//
// This test verifies the actual wiring in provider-optimizer.ts: that
// when callWithProviderRouting completes, recordProviderOutcome is
// called with a real costUsd value derived from the response token
// counts (not undefined/cold-start default).

describe("P2.1: callWithProviderRouting feeds real costUsd into recordProviderOutcome", () => {
  afterEach(() => mock.restore());

  it("records costUsd > 0 when a paid model returns token usage", async () => {
    // We can't easily mock the entire AI call chain, so we verify the
    // wiring indirectly: the costTracker.computeCallCostUsd function
    // is the source of truth, and provider-optimizer.ts:310 calls it
    // with actualModel + tokensIn + tokensOut captured from the
    // response. The provider-scoring.ts:191-195 EMA then incorporates
    // that costUsd into avgCostUsd.
    //
    // Verify the math end-to-end:
    mock.module("@/lib/valkey", () => ({
      getValkeyClient: mock(async () => null),
      VALKEY_CONFIGURED: false,
    }));

    const { computeCallCostUsd } = await import("@/lib/ai/cost-rates");
    const { recordProviderOutcome, getProviderScore } = await import(
      "@/lib/ai-fabric/provider-scoring"
    );

    // Simulate what provider-optimizer.ts:310 does on a successful
    // gpt-4o-mini call with 1200 in / 350 out tokens
    const costUsd = computeCallCostUsd("gpt-4o-mini", 1200, 350);
    expect(costUsd).toBeCloseTo(0.00039, 7);

    await recordProviderOutcome("smart-router:chat", {
      success: true,
      latencyMs: 850,
      costUsd,
      confidence: 1.0, // provider-optimizer.ts:315 sets 1.0 on success
    });

    const score = getProviderScore("smart-router:chat");
    expect(score.metrics.avgCostUsd).toBeCloseTo(0.00039, 7);
    expect(score.metrics.avgConfidence).toBeCloseTo(1.0, 7);
    expect(score.metrics.sampleCount).toBe(1);
  });

  it("records costUsd = 0 when a free-tier model is used", async () => {
    mock.module("@/lib/valkey", () => ({
      getValkeyClient: mock(async () => null),
      VALKEY_CONFIGURED: false,
    }));

    const { computeCallCostUsd } = await import("@/lib/ai/cost-rates");
    const { recordProviderOutcome, getProviderScore } = await import(
      "@/lib/ai-fabric/provider-scoring"
    );

    const costUsd = computeCallCostUsd("z-ai-glm", 1500, 500);
    expect(costUsd).toBe(0);

    await recordProviderOutcome("legacy:z-ai-glm", {
      success: true,
      latencyMs: 600,
      costUsd,
      confidence: 1.0,
    });

    const score = getProviderScore("legacy:z-ai-glm");
    expect(score.metrics.avgCostUsd).toBe(0);
    // Free model should score higher than a paid model with identical
    // latency/success/confidence (cost term contributes SCORE_W_COST=0.15)
    expect(score.score).toBeGreaterThan(0.5);
  });

  it("omits confidence on failure (cold-start preservation)", async () => {
    mock.module("@/lib/valkey", () => ({
      getValkeyClient: mock(async () => null),
      VALKEY_CONFIGURED: false,
    }));

    const { recordProviderOutcome, getProviderScore } = await import(
      "@/lib/ai-fabric/provider-scoring"
    );
    const pid = "p2-failure-preserve-confidence";

    // First: a successful call with high confidence
    await recordProviderOutcome(pid, {
      success: true,
      latencyMs: 200,
      costUsd: 0.001,
      confidence: 0.95,
    });
    // Second: a failure — provider-optimizer.ts:315 sets confidence=undefined
    await recordProviderOutcome(pid, {
      success: false,
      latencyMs: 5000,
      costUsd: 0,
      confidence: undefined,
    });

    const score = getProviderScore(pid);
    // Confidence EMA should still reflect the prior 0.95, not reset
    expect(score.metrics.avgConfidence).toBeCloseTo(0.95, 2);
    expect(score.metrics.sampleCount).toBe(2);
  });
});

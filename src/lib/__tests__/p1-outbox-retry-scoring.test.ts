/**
 * p1-outbox-retry-scoring.test.ts — P1 regression tests.
 *
 * Verifies the four P1 features:
 *   P1.1 Outbox pattern (appendToOutbox + processOutboxBatch)
 *   P1.3 E-Invoicing retry/backoff + ack-polling
 *   P1.4 AI provider scoring + circuit breaker
 *
 * Tests are hermetic — they use mocks for DB / Valkey / fetch so they
 * run without external dependencies.
 */

import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test";

// ─── P1.1: Outbox Pattern ─────────────────────────────────────────────────

describe("P1.1: Outbox pattern", () => {
  beforeEach(() => {
    // Mock db with an in-memory outboxEvent store
    const store: any[] = [];
    const dbMock = {
      outboxEvent: {
        create: mock(async ({ data }: any) => {
          const row = {
            id: `evt-${store.length + 1}`,
            ...data,
            createdAt: new Date(),
            publishedAt: null,
            attempts: 0,
            lastError: null,
            status: "pending",
          };
          store.push(row);
          return row;
        }),
        findMany: mock(async ({ where, take }: any) => {
          let rows = store;
          if (where?.status) rows = rows.filter((r) => r.status === where.status);
          return rows.slice(0, take);
        }),
        update: mock(async ({ where, data }: any) => {
          const row = store.find((r) => r.id === where.id);
          if (row) Object.assign(row, data);
          return row;
        }),
        deleteMany: mock(async () => ({ count: 0 })),
      },
      _store: store,
    };
    mock.module("@/lib/db", () => ({ db: dbMock, dbTyped: dbMock }));
    // Mock queues.enqueue
    mock.module("@/lib/queues", () => ({
      enqueue: mock(async () => ({ id: "job-1" })),
      QUEUE_NAMES: { EVENTS: "events-jobs" },
    }));
  });

  afterEach(() => mock.restore());

  it("appendToOutbox writes a row with correct fields", async () => {
    // We need to import dynamically AFTER the mock is set up
    const { appendToOutbox } = await import("@/lib/outbox");
    const fakeTx = {
      outboxEvent: {
        create: async ({ data }: any) => ({
          id: "evt-1",
          aggregateType: data.aggregateType,
          aggregateId: data.aggregateId,
          eventType: data.eventType,
          payload: data.payload,
          headers: data.headers,
          createdAt: new Date(),
          attempts: 0,
          status: "pending",
        }),
      },
    };
    const row = await appendToOutbox(fakeTx as any, {
      aggregateType: "invoice",
      aggregateId: "inv-123",
      eventType: "invoice.issued",
      payload: { id: "inv-123", total: 100 },
      headers: { correlationId: "corr-1" },
    });
    expect(row.aggregateType).toBe("invoice");
    expect(row.aggregateId).toBe("inv-123");
    expect(row.eventType).toBe("invoice.issued");
    expect(row.payload).toEqual({ id: "inv-123", total: 100 });
    expect(row.headers).toEqual({ correlationId: "corr-1" });
    expect(row.status).toBe("pending");
  });

  it("processOutboxBatch publishes pending events and marks them published", async () => {
    const { db } = await import("@/lib/db");
    const { processOutboxBatch } = await import("@/lib/outbox");

    // Seed two pending events directly into the store
    (db as any)._store.push(
      { id: "e1", aggregateType: "invoice", aggregateId: "1", eventType: "invoice.issued", payload: "{}", headers: null, createdAt: new Date(), publishedAt: null, attempts: 0, lastError: null, status: "pending" },
      { id: "e2", aggregateType: "voucher", aggregateId: "2", eventType: "voucher.posted", payload: "{}", headers: null, createdAt: new Date(), publishedAt: null, attempts: 0, lastError: null, status: "pending" },
    );

    const result = await processOutboxBatch();
    expect(result.published).toBe(2);
    expect(result.failed).toBe(0);
    expect(result.dead).toBe(0);
    // Both events should now be marked published
    expect((db as any)._store.every((r: any) => r.status === "published")).toBe(true);
  });

  it("processOutboxBatch marks events as dead after MAX_ATTEMPTS", async () => {
    // Override enqueue to always throw
    mock.module("@/lib/queues", () => ({
      enqueue: mock(async () => { throw new Error("queue down"); }),
      QUEUE_NAMES: { EVENTS: "events-jobs" },
    }));
    process.env.OUTBOX_MAX_ATTEMPTS = "2";

    const { db } = await import("@/lib/db");
    const { processOutboxBatch } = await import("@/lib/outbox");

    (db as any)._store.push({
      id: "e1", aggregateType: "x", aggregateId: "1", eventType: "x.y",
      payload: "{}", headers: null, createdAt: new Date(), publishedAt: null,
      attempts: 0, lastError: null, status: "pending",
    });

    // First attempt: failed
    const r1 = await processOutboxBatch();
    expect(r1.failed).toBe(1);
    expect(r1.dead).toBe(0);
    // Second attempt: dead
    const r2 = await processOutboxBatch();
    expect(r2.dead).toBe(1);
    expect((db as any)._store[0].status).toBe("dead");

    delete process.env.OUTBOX_MAX_ATTEMPTS;
  });
});

// ─── P1.3: Retry + Ack-Polling ────────────────────────────────────────────

describe("P1.3: E-Invoicing retry + ack-polling", () => {
  afterEach(() => mock.restore());

  it("withRetry succeeds on first attempt", async () => {
    const { withRetry } = await import("@/lib/e-invoicing/retry");
    const fn = mock(async () => "ok");
    const result = await withRetry(fn, { operationName: "test" });
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("withRetry retries on network errors and eventually succeeds", async () => {
    const { withRetry } = await import("@/lib/e-invoicing/retry");
    let calls = 0;
    const fn = async () => {
      calls++;
      if (calls < 3) throw new TypeError("network error");
      return "ok";
    };
    const result = await withRetry(fn, {
      maxAttempts: 5,
      baseDelayMs: 1, // speed up the test
      operationName: "test",
    });
    expect(result).toBe("ok");
    expect(calls).toBe(3);
  });

  it("withRetry does NOT retry on 4xx (non-429) errors", async () => {
    const { withRetry } = await import("@/lib/e-invoicing/retry");
    const fn = async () => {
      const err = new Error("Bad Request") as any;
      err.status = 400;
      throw err;
    };
    await expect(withRetry(fn, { maxAttempts: 5, operationName: "test" }))
      .rejects.toThrow("Bad Request");
  });

  it("withRetry DOES retry on 429 (rate limit)", async () => {
    const { withRetry } = await import("@/lib/e-invoicing/retry");
    let calls = 0;
    const fn = async () => {
      calls++;
      if (calls < 2) {
        const err = new Error("Too Many Requests") as any;
        err.status = 429;
        throw err;
      }
      return "ok";
    };
    const result = await withRetry(fn, {
      maxAttempts: 3, baseDelayMs: 1, operationName: "test",
    });
    expect(result).toBe("ok");
    expect(calls).toBe(2);
  });

  it("withRetry exhausts retries and throws the last error", async () => {
    const { withRetry } = await import("@/lib/e-invoicing/retry");
    const fn = async () => {
      throw new TypeError("persistent network error");
    };
    await expect(withRetry(fn, {
      maxAttempts: 3, baseDelayMs: 1, operationName: "test",
    })).rejects.toThrow("persistent network error");
  });

  it("pollSubmissionAck returns immediately on success state", async () => {
    const { pollSubmissionAck } = await import("@/lib/e-invoicing/retry");
    const result = await pollSubmissionAck({
      checkStatus: async () => ({ state: "CLEARED" }),
      successStates: ["CLEARED"],
      failureStates: ["REJECTED"],
      operationName: "test",
    });
    expect(result.state).toBe("CLEARED");
    expect(result.attempts).toBe(1);
  });

  it("pollSubmissionAck returns immediately on failure state", async () => {
    const { pollSubmissionAck } = await import("@/lib/e-invoicing/retry");
    const result = await pollSubmissionAck({
      checkStatus: async () => ({ state: "REJECTED" }),
      successStates: ["CLEARED"],
      failureStates: ["REJECTED"],
      operationName: "test",
    });
    expect(result.state).toBe("REJECTED");
    expect(result.attempts).toBe(1);
  });

  it("pollSubmissionAck polls until terminal state reached", async () => {
    const { pollSubmissionAck } = await import("@/lib/e-invoicing/retry");
    let calls = 0;
    const result = await pollSubmissionAck({
      checkStatus: async () => {
        calls++;
        if (calls < 3) return { state: "PENDING" };
        return { state: "CLEARED" };
      },
      successStates: ["CLEARED"],
      failureStates: ["REJECTED"],
      pendingStates: ["PENDING"],
      pollIntervalMs: 1,
      maxAttempts: 10,
      operationName: "test",
    });
    expect(result.state).toBe("CLEARED");
    expect(result.attempts).toBe(3);
  });

  it("pollSubmissionAck returns TIMEOUT when budget exhausted", async () => {
    const { pollSubmissionAck } = await import("@/lib/e-invoicing/retry");
    type TestState = "CLEARED" | "REJECTED" | "PENDING" | "TIMEOUT";
    const result = await pollSubmissionAck<TestState>({
      checkStatus: async () => ({ state: "PENDING" as TestState }),
      successStates: ["CLEARED"],
      failureStates: ["REJECTED"],
      pendingStates: ["PENDING"],
      pollIntervalMs: 1,
      maxAttempts: 3,
      operationName: "test",
    });
    expect(result.state).toBe("TIMEOUT");
    expect(result.attempts).toBe(3);
  });
});

// ─── P1.4: AI Provider Scoring + Circuit Breaker ──────────────────────────

describe("P1.4: AI provider scoring + circuit breaker", () => {
  beforeEach(() => {
    // Reset module state between tests
    mock.module("@/lib/valkey", () => ({
      getValkeyClient: mock(async () => null), // no Valkey in tests
      getValkeySubscriber: mock(() => Promise.resolve(null)),
      VALKEY_CONFIGURED: false,
    }));
  });

  afterEach(() => mock.restore());

  it("cold-start provider gets neutral score 0.5", async () => {
    const { getProviderScore } = await import("@/lib/ai-fabric/provider-scoring");
    const score = getProviderScore("unknown-provider");
    expect(score.score).toBe(0.5);
    expect(score.circuitState).toBe("closed");
    expect(score.metrics.sampleCount).toBe(0);
  });

  it("recording a success increases the score", async () => {
    const { recordProviderOutcome, getProviderScore } = await import("@/lib/ai-fabric/provider-scoring");
    const pid = "test-success-provider";
    await recordProviderOutcome(pid, {
      success: true,
      latencyMs: 200,
      costUsd: 0.001,
      confidence: 0.95,
    });
    const score = getProviderScore(pid);
    expect(score.metrics.sampleCount).toBe(1);
    expect(score.metrics.successRate).toBe(1);
    expect(score.metrics.latencyEmaMs).toBe(200);
    expect(score.score).toBeGreaterThan(0.5);
  });

  it("recording a failure decreases the score", async () => {
    const { recordProviderOutcome, getProviderScore } = await import("@/lib/ai-fabric/provider-scoring");
    const pid = "test-fail-provider";
    await recordProviderOutcome(pid, {
      success: false,
      latencyMs: 5000,
      costUsd: 0.05,
      confidence: 0.1,
    });
    const score = getProviderScore(pid);
    expect(score.metrics.successRate).toBe(0);
    expect(score.metrics.latencyEmaMs).toBe(5000);
    expect(score.score).toBeLessThan(0.5);
  });

  it("circuit opens after >50% failures in window of 5+", async () => {
    const { recordProviderOutcome, getProviderScore, resetCircuit } = await import("@/lib/ai-fabric/provider-scoring");
    const pid = "test-circuit-provider";
    // Record 5 failures out of 6 (>50%)
    for (let i = 0; i < 5; i++) {
      await recordProviderOutcome(pid, {
        success: false, latencyMs: 1000, costUsd: 0.01, confidence: 0.5,
      });
    }
    await recordProviderOutcome(pid, {
      success: true, latencyMs: 200, costUsd: 0.01, confidence: 0.9,
    });
    const score = getProviderScore(pid);
    expect(score.circuitState).toBe("open");
    resetCircuit(pid);
  });

  it("selectProvider skips providers with OPEN circuit", async () => {
    const { recordProviderOutcome, selectProvider } = await import("@/lib/ai-fabric/provider-scoring");
    const primary = "circuit-open-primary";
    const fallback = "healthy-fallback";
    // Open the primary's circuit
    for (let i = 0; i < 5; i++) {
      await recordProviderOutcome(primary, {
        success: false, latencyMs: 1000, costUsd: 0.01, confidence: 0.5,
      });
    }
    // Make fallback healthy
    await recordProviderOutcome(fallback, {
      success: true, latencyMs: 100, costUsd: 0.001, confidence: 0.95,
    });
    const selection = selectProvider([primary, fallback]);
    expect(selection.providerId).toBe(fallback);
    expect(selection.fallbackSkipped).toContain(primary);
  });

  it("selectProvider returns the higher-scoring provider when both circuits closed", async () => {
    const { recordProviderOutcome, selectProvider } = await import("@/lib/ai-fabric/provider-scoring");
    const fast = "fast-provider";
    const slow = "slow-provider";
    await recordProviderOutcome(fast, {
      success: true, latencyMs: 100, costUsd: 0.001, confidence: 0.95,
    });
    await recordProviderOutcome(slow, {
      success: true, latencyMs: 5000, costUsd: 0.05, confidence: 0.5,
    });
    const selection = selectProvider([fast, slow]);
    expect(selection.providerId).toBe(fast);
  });

  it("resetCircuit clears the circuit state", async () => {
    const { recordProviderOutcome, getProviderScore, resetCircuit } = await import("@/lib/ai-fabric/provider-scoring");
    const pid = "reset-test";
    for (let i = 0; i < 5; i++) {
      await recordProviderOutcome(pid, {
        success: false, latencyMs: 1000, costUsd: 0.01, confidence: 0.5,
      });
    }
    expect(getProviderScore(pid).circuitState).toBe("open");
    resetCircuit(pid);
    expect(getProviderScore(pid).circuitState).toBe("closed");
  });
});

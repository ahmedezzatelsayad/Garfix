/**
 * P3.3 (Cycle 5) — Regression tests for provider-scoring circuit-breaker
 * HALF_OPEN transitions (the 3 untested transitions flagged in the P3 sweep).
 *
 *   OPEN → HALF_OPEN       (after cooldown elapses)
 *   HALF_OPEN → CLOSED     (trial request succeeds)
 *   HALF_OPEN → OPEN       (trial request fails)
 *
 * The existing p1-outbox-retry-scoring.test.ts covers CLOSED → OPEN,
 * OPEN → skip (in selectProvider), and manual resetCircuit. These new
 * tests close the remaining gap so a regression in the cooldown math or
 * the trial-failure re-open path will be caught at CI time.
 *
 * SPEED: tests set AI_CIRCUIT_COOLDOWN_MS=50 to make the cooldown 50ms
 * instead of 30s. The env var is read at module load, so we use
 * mock.module() to provide a fresh module instance per test.
 */
import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test";

// Helper: dynamically import provider-scoring with a custom cooldown.
async function importScoring(cooldownMs = 50) {
  // Set env BEFORE the mock.module() call so the module reads the new value
  // when it evaluates its top-level `const COOLDOWN_MS = ...` line.
  const prev = process.env.AI_CIRCUIT_COOLDOWN_MS;
  process.env.AI_CIRCUIT_COOLDOWN_MS = String(cooldownMs);

  // Force a fresh module evaluation by clearing the require cache entry.
  // Bun:test doesn't expose `jest.resetModules()`, but we can manipulate
  // the module registry via mock.module().
  const mod = await import(`../ai-fabric/provider-scoring?t=${Date.now()}-${Math.random()}`);
  if (prev === undefined) delete process.env.AI_CIRCUIT_COOLDOWN_MS;
  else process.env.AI_CIRCUIT_COOLDOWN_MS = prev;
  return mod;
}

describe("P3.3 provider-scoring circuit breaker — HALF_OPEN transitions", () => {
  beforeEach(() => {
    mock.module("../valkey", () => ({
      getValkeyClient: mock(async () => null),
      VALKEY_CONFIGURED: false,
    }));
  });
  afterEach(() => mock.restore());

  it("OPEN → HALF_OPEN: after cooldown, getProviderScore flips state to half_open", async () => {
    const { getProviderScore, recordProviderOutcome } = await importScoring(50);
    const providerId = `test:open-to-half-open-${Date.now()}-${Math.random()}`;

    // 1. Trip the circuit (6 failures → failRate = 1.0 > 0.5, window ≥ 5)
    for (let i = 0; i < 6; i++) {
      await recordProviderOutcome(providerId, {
        success: false,
        latencyMs: 1000,
      });
    }
    const openScore = getProviderScore(providerId);
    expect(openScore.circuitState).toBe("open");

    // 2. Wait 80ms for cooldown (>50ms) to elapse
    await new Promise((r) => setTimeout(r, 80));

    // 3. getProviderScore should now transition to HALF_OPEN
    const halfOpenScore = getProviderScore(providerId);
    expect(halfOpenScore.circuitState).toBe("half_open");
  });

  it("HALF_OPEN → CLOSED: a successful trial request closes the circuit", async () => {
    const { getProviderScore, recordProviderOutcome } = await importScoring(50);
    const providerId = `test:half-open-to-closed-${Date.now()}-${Math.random()}`;

    // 1. Trip
    for (let i = 0; i < 6; i++) {
      await recordProviderOutcome(providerId, { success: false, latencyMs: 1000 });
    }
    expect(getProviderScore(providerId).circuitState).toBe("open");

    // 2. Wait for cooldown → HALF_OPEN
    await new Promise((r) => setTimeout(r, 80));
    expect(getProviderScore(providerId).circuitState).toBe("half_open");

    // 3. Successful trial → CLOSED
    await recordProviderOutcome(providerId, {
      success: true,
      latencyMs: 800,
      costUsd: 0.005,
      confidence: 0.92,
    });
    const closedScore = getProviderScore(providerId);
    expect(closedScore.circuitState).toBe("closed");
    expect(closedScore.metrics.sampleCount).toBeGreaterThan(6);
  });

  it("HALF_OPEN → OPEN: a failed trial request re-opens the circuit", async () => {
    const { getProviderScore, recordProviderOutcome } = await importScoring(50);
    const providerId = `test:half-open-to-open-${Date.now()}-${Math.random()}`;

    // 1. Trip
    for (let i = 0; i < 6; i++) {
      await recordProviderOutcome(providerId, { success: false, latencyMs: 1000 });
    }
    expect(getProviderScore(providerId).circuitState).toBe("open");

    // 2. Wait for cooldown → HALF_OPEN
    await new Promise((r) => setTimeout(r, 80));
    expect(getProviderScore(providerId).circuitState).toBe("half_open");

    // 3. Failed trial → re-OPEN
    await recordProviderOutcome(providerId, {
      success: false,
      latencyMs: 5000,
    });
    const reopenedScore = getProviderScore(providerId);
    expect(reopenedScore.circuitState).toBe("open");
  });

  it("selectProvider skips OPEN providers but allows HALF_OPEN through (trial)", async () => {
    const { getProviderScore, recordProviderOutcome, selectProvider } =
      await importScoring(50);

    const providerA = `test:select:half-open-${Date.now()}-${Math.random()}`;
    const providerB = `test:select:open-${Date.now()}-${Math.random()}`;

    // Trip both
    for (let i = 0; i < 6; i++) {
      await recordProviderOutcome(providerA, { success: false, latencyMs: 1000 });
      await recordProviderOutcome(providerB, { success: false, latencyMs: 1000 });
    }
    expect(getProviderScore(providerA).circuitState).toBe("open");
    expect(getProviderScore(providerB).circuitState).toBe("open");

    // Wait for cooldown → both HALF_OPEN.
    // IMPORTANT: we must call getProviderScore on BOTH to trigger the lazy
    // OPEN→HALF_OPEN transition (it only fires inside getProviderScore, not
    // inside recordProviderOutcome).
    await new Promise((r) => setTimeout(r, 80));
    expect(getProviderScore(providerA).circuitState).toBe("half_open");
    expect(getProviderScore(providerB).circuitState).toBe("half_open");

    // Re-trip B (record 1 failure) → B flips HALF_OPEN → OPEN.
    // (Only the FIRST failure matters — it triggers the transition. Subsequent
    // failures just accumulate in the window but don't change state.)
    await recordProviderOutcome(providerB, { success: false, latencyMs: 1000 });
    expect(getProviderScore(providerB).circuitState).toBe("open");

    // selectProvider should pick A (HALF_OPEN — eligible) and skip B (OPEN)
    const chosen = selectProvider([providerB, providerA]);
    expect(chosen.providerId).toBe(providerA);
    expect(chosen.fallbackSkipped).toContain(providerB);
    expect(chosen.fallbackSkipped).not.toContain(providerA);
  });
});

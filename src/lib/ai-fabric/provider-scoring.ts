/**
 * provider-scoring.ts — Dynamic provider scoring + circuit breaker (P1.4)
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * PROBLEM
 * ═══════════════════════════════════════════════════════════════════════════
 * The existing provider-optimizer.ts uses a STATIC task→capability mapping.
 * It does not track:
 *   - Per-provider latency (so a permanently-slow provider is never avoided)
 *   - Per-provider success rate (so a failing provider is never avoided)
 *   - Per-provider cost (so the cheapest provider is never preferred)
 *   - Per-provider confidence (so the most accurate provider is never preferred)
 *
 * It also has NO circuit breaker — if a provider starts failing, every
 * request pays the failure latency before falling back.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * SOLUTION
 * ═══════════════════════════════════════════════════════════════════════════
 * Two layers:
 *
 *   1. ProviderScoreKeeper — tracks per-provider metrics in memory
 *      (with optional Valkey persistence for multi-instance sharing).
 *      Metrics: latencyMs (EMA), successRate, avgCostUsd, avgConfidence,
 *      sample count. Score = weighted sum normalized to [0, 1].
 *
 *   2. CircuitBreaker — per-provider circuit breaker with three states:
 *      CLOSED (normal), OPEN (fail fast), HALF_OPEN (trial request).
 *      Opens when failure_rate > 50% in the last N=20 calls. Moves to
 *      HALF_OPEN after a 30s cooldown. If the trial succeeds, closes;
 *      if it fails, re-opens.
 *
 * The scoring + circuit breaker are wired into callWithProviderRouting
 * via the new `selectProvider` function: instead of always using the
 * configured primary, it picks the best-scoring provider from the
 * configured primary + fallback candidates, skipping any whose circuit
 * is OPEN.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * SCORING FORMULA
 * ═══════════════════════════════════════════════════════════════════════════
 *   score = 0.40 * (1 - latency_norm)         // prefer fast
 *         + 0.30 * success_rate                // prefer reliable
 *         + 0.15 * (1 - cost_norm)             // prefer cheap
 *         + 0.15 * avg_confidence              // prefer accurate
 *
 *   latency_norm = min(latencyMs / 10000, 1)   // 10s = worst
 *   cost_norm    = min(costUsd / 0.10, 1)      // $0.10/req = worst
 *
 * Weights are configurable via env vars so operators can tune the
 * tradeoff without code changes:
 *   AI_SCORE_W_LATENCY   (default 0.40)
 *   AI_SCORE_W_SUCCESS   (default 0.30)
 *   AI_SCORE_W_COST      (default 0.15)
 *   AI_SCORE_W_CONFIDENCE (default 0.15)
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * CIRCUIT BREAKER STATES
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  ┌─────────┐  failure_rate > 0.5 in last 20   ┌──────┐
 *  │ CLOSED  │ ───────────────────────────────► │ OPEN │
 *  └─────────┘                                  └──────┘
 *       ▲                                           │
 *       │                                           │ 30s cooldown
 *       │ trial success                            ▼
 *       │                                       ┌──────────┐
 *       └─────────────────────────────────────  │ HALF_OPEN│
 *                 trial failure                 └──────────┘
 *                     │                             │
 *                     └─────────────────────────────┘
 *                                  (re-opens circuit)
 */

import { logger } from "../logger";
import { getValkeyClient } from "../valkey";

// ─── Types ────────────────────────────────────────────────────────────────

export interface ProviderMetrics {
  providerId: string;
  // Exponential moving average of latency in ms (alpha = 0.3)
  latencyEmaMs: number;
  // Sliding-window success rate [0, 1]
  successRate: number;
  // EMA of cost in USD per request
  avgCostUsd: number;
  // EMA of confidence [0, 1] (provider-reported or heuristic)
  avgConfidence: number;
  // Total samples collected (for cold-start detection)
  sampleCount: number;
  // Last-updated timestamp (ms since epoch)
  updatedAt: number;
}

export interface ProviderScore {
  providerId: string;
  score: number;        // [0, 1], higher is better
  metrics: ProviderMetrics;
  circuitState: CircuitState;
}

type CircuitState = "closed" | "open" | "half_open";

interface CircuitState_ {
  state: CircuitState;
  // Rolling window of recent outcomes (true = success, false = failure)
  // Newest at the end. Capped at WINDOW_SIZE.
  recentOutcomes: boolean[];
  // When the circuit opened (ms since epoch). Used to compute cooldown.
  openedAt: number;
  // When we entered HALF_OPEN (used to limit concurrent trial requests).
  halfOpenedAt: number | null;
}

// ─── Constants ────────────────────────────────────────────────────────────

const WINDOW_SIZE = 20;
const FAILURE_RATE_THRESHOLD = 0.5;  // open at >50% failures in window
const COOLDOWN_MS = 30_000;          // 30s before HALF_OPEN
const LATENCY_ALPHA = 0.3;           // EMA smoothing for latency
const COST_ALPHA = 0.3;              // EMA smoothing for cost
const CONFIDENCE_ALPHA = 0.3;        // EMA smoothing for confidence
const VALKEY_KEY_PREFIX = "ai:provider:metrics:";
const VALKEY_CIRCUIT_PREFIX = "ai:provider:circuit:";
const VALKEY_TTL_SECONDS = 86400;    // 24h — metrics age out if a provider goes away

const SCORE_W_LATENCY = parseFloat(process.env.AI_SCORE_W_LATENCY || "0.40");
const SCORE_W_SUCCESS = parseFloat(process.env.AI_SCORE_W_SUCCESS || "0.30");
const SCORE_W_COST = parseFloat(process.env.AI_SCORE_W_COST || "0.15");
const SCORE_W_CONFIDENCE = parseFloat(process.env.AI_SCORE_W_CONFIDENCE || "0.15");

const LATENCY_WORST_MS = 10_000;
const COST_WORST_USD = 0.10;

// ─── In-memory state (per-instance) ────────────────────────────────────────
//
// In a multi-instance deployment, these are BEST-EFFORT synchronized via
// Valkey: reads pull the latest from Valkey (with in-memory fallback),
// writes push to Valkey asynchronously. This gives us approximate
// consistency without the latency cost of a synchronous round-trip on
// every AI call.

const metricsStore = new Map<string, ProviderMetrics>();
const circuitStore = new Map<string, CircuitState_>();

// ─── Public API ────────────────────────────────────────────────────────────

/**
 * Record the outcome of a single AI provider call. Updates both the
 * metrics EMA and the circuit breaker window.
 *
 *   await recordProviderOutcome("smart-router:chat", {
 *     success: true,
 *     latencyMs: 850,
 *     costUsd: 0.0023,
 *     confidence: 0.92,
 *   });
 */
export async function recordProviderOutcome(
  providerId: string,
  outcome: {
    success: boolean;
    latencyMs: number;
    costUsd?: number;
    confidence?: number;
  },
): Promise<void> {
  // ── Update metrics ─────────────────────────────────────────────────────
  const prev = metricsStore.get(providerId) || {
    providerId,
    latencyEmaMs: outcome.latencyMs,
    successRate: outcome.success ? 1 : 0,
    avgCostUsd: outcome.costUsd ?? 0,
    avgConfidence: outcome.confidence ?? 1,
    sampleCount: 0,
    updatedAt: Date.now(),
  };

  const newSampleCount = prev.sampleCount + 1;
  // EMA update: new = old + alpha * (sample - old)
  const newLatency = prev.sampleCount === 0
    ? outcome.latencyMs
    : prev.latencyEmaMs + LATENCY_ALPHA * (outcome.latencyMs - prev.latencyEmaMs);
  // Success rate: recompute from rolling window (kept in circuitStore)
  // For now, use a simple EMA on success/failure (0/1).
  const outcomeVal = outcome.success ? 1 : 0;
  const newSuccessRate = prev.sampleCount === 0
    ? outcomeVal
    : prev.successRate + LATENCY_ALPHA * (outcomeVal - prev.successRate);
  const newCost = outcome.costUsd !== undefined
    ? (prev.sampleCount === 0
        ? outcome.costUsd
        : prev.avgCostUsd + COST_ALPHA * (outcome.costUsd - prev.avgCostUsd))
    : prev.avgCostUsd;
  const newConfidence = outcome.confidence !== undefined
    ? (prev.sampleCount === 0
        ? outcome.confidence
        : prev.avgConfidence + CONFIDENCE_ALPHA * (outcome.confidence - prev.avgConfidence))
    : prev.avgConfidence;

  const newMetrics: ProviderMetrics = {
    providerId,
    latencyEmaMs: newLatency,
    successRate: newSuccessRate,
    avgCostUsd: newCost,
    avgConfidence: newConfidence,
    sampleCount: newSampleCount,
    updatedAt: Date.now(),
  };
  metricsStore.set(providerId, newMetrics);

  // ── Update circuit breaker ─────────────────────────────────────────────
  const circuit = circuitStore.get(providerId) || {
    state: "closed" as CircuitState,
    recentOutcomes: [],
    openedAt: 0,
    halfOpenedAt: null,
  };
  circuit.recentOutcomes.push(outcome.success);
  if (circuit.recentOutcomes.length > WINDOW_SIZE) {
    circuit.recentOutcomes.shift();
  }

  // Recompute circuit state
  if (circuit.state === "half_open") {
    if (outcome.success) {
      // Trial succeeded — close the circuit and reset the window
      circuit.state = "closed";
      circuit.recentOutcomes = [true];
      circuit.openedAt = 0;
      circuit.halfOpenedAt = null;
    } else {
      // Trial failed — re-open
      circuit.state = "open";
      circuit.openedAt = Date.now();
      circuit.halfOpenedAt = null;
    }
  } else if (circuit.state === "closed") {
    const failCount = circuit.recentOutcomes.filter((x) => !x).length;
    const failRate = circuit.recentOutcomes.length >= 5
      ? failCount / circuit.recentOutcomes.length
      : 0;
    if (failRate > FAILURE_RATE_THRESHOLD && circuit.recentOutcomes.length >= 5) {
      circuit.state = "open";
      circuit.openedAt = Date.now();
      logger.warn("[provider-scoring] circuit OPENED", {
        providerId,
        failRate: failRate.toFixed(2),
        windowSize: circuit.recentOutcomes.length,
      });
    }
  }
  circuitStore.set(providerId, circuit);

  // ── Persist to Valkey (best-effort async) ───────────────────────────────
  persistToValkey(providerId, newMetrics, circuit).catch((err) => {
    // Persistence failures are non-fatal — we just lose cross-instance sync.
    logger.debug("[provider-scoring] Valkey persist failed (non-fatal)", {
      providerId,
      error: err instanceof Error ? err.message : String(err),
    });
  });
}

/**
 * Get the current score for a provider. Returns a default cold-start
 * score (0.5) if no metrics have been collected yet.
 */
export function getProviderScore(providerId: string): ProviderScore {
  const metrics = metricsStore.get(providerId);
  const circuit = circuitStore.get(providerId);

  // Refresh circuit state if cooldown has elapsed
  let circuitState: CircuitState = circuit?.state ?? "closed";
  if (circuitState === "open" && circuit && Date.now() - circuit.openedAt > COOLDOWN_MS) {
    circuitState = "half_open";
    circuit.state = "half_open";
    circuit.halfOpenedAt = Date.now();
    circuitStore.set(providerId, circuit);
    logger.info("[provider-scoring] circuit → HALF_OPEN", { providerId });
  }

  if (!metrics || metrics.sampleCount === 0) {
    // Cold start — neutral score
    return {
      providerId,
      score: 0.5,
      metrics: metrics || {
        providerId,
        latencyEmaMs: 0,
        successRate: 1,
        avgCostUsd: 0,
        avgConfidence: 1,
        sampleCount: 0,
        updatedAt: Date.now(),
      },
      circuitState,
    };
  }

  const latencyNorm = Math.min(metrics.latencyEmaMs / LATENCY_WORST_MS, 1);
  const costNorm = Math.min(metrics.avgCostUsd / COST_WORST_USD, 1);
  const score =
    SCORE_W_LATENCY * (1 - latencyNorm)
    + SCORE_W_SUCCESS * metrics.successRate
    + SCORE_W_COST * (1 - costNorm)
    + SCORE_W_CONFIDENCE * metrics.avgConfidence;

  return {
    providerId,
    score: Math.max(0, Math.min(1, score)),
    metrics,
    circuitState,
  };
}

/**
 * Select the best provider from a list of candidates. Skips providers
 * whose circuit is OPEN (but allows HALF_OPEN through for a trial).
 *
 *   const chosen = selectProvider([
 *     "smart-router:chat",
 *     "legacy:z-ai-glm",
 *   ]);
 *   // → { providerId: "smart-router:chat", score: 0.82, circuitState: "closed" }
 */
export function selectProvider(
  candidates: string[],
): { providerId: string; score: ProviderScore; fallbackSkipped?: string[] } {
  const scored = candidates.map((id) => ({ id, score: getProviderScore(id) }));
  const skipped: string[] = [];
  const eligible = scored.filter((s) => {
    if (s.score.circuitState === "open") {
      skipped.push(s.id);
      return false;
    }
    return true;
  });
  if (eligible.length === 0) {
    // All circuits open — return the first candidate as a last resort
    // (the caller's request will likely fail, but at least we tried).
    logger.warn("[provider-scoring] all candidate circuits OPEN", { candidates });
    return {
      providerId: candidates[0],
      score: scored[0].score,
      fallbackSkipped: skipped,
    };
  }
  eligible.sort((a, b) => b.score.score - a.score.score);
  return {
    providerId: eligible[0].id,
    score: eligible[0].score,
    fallbackSkipped: skipped.length > 0 ? skipped : undefined,
  };
}

/**
 * Manually reset a provider's circuit breaker (e.g. after a deploy that
 * fixes a known issue). Useful for ops runbooks.
 */
export function resetCircuit(providerId: string): void {
  const circuit = circuitStore.get(providerId);
  if (circuit) {
    circuit.state = "closed";
    circuit.recentOutcomes = [];
    circuit.openedAt = 0;
    circuit.halfOpenedAt = null;
    circuitStore.set(providerId, circuit);
    logger.info("[provider-scoring] circuit manually reset", { providerId });
  }
}

/**
 * Get a snapshot of all known provider metrics — for the admin panel.
 */
export function getAllProviderScores(): ProviderScore[] {
  const ids = new Set<string>([
    ...metricsStore.keys(),
    ...circuitStore.keys(),
  ]);
  return Array.from(ids).map((id) => getProviderScore(id));
}

// ─── Valkey persistence (best-effort) ──────────────────────────────────────

async function persistToValkey(
  providerId: string,
  metrics: ProviderMetrics,
  circuit: CircuitState_,
): Promise<void> {
  const client = await getValkeyClient();
  if (!client) return;
  const safeId = providerId.replace(/[^A-Za-z0-9_-]/g, "_");
  await Promise.all([
    client.set(
      `${VALKEY_KEY_PREFIX}${safeId}`,
      JSON.stringify(metrics),
      "EX",
      VALKEY_TTL_SECONDS,
    ),
    client.set(
      `${VALKEY_CIRCUIT_PREFIX}${safeId}`,
      JSON.stringify(circuit),
      "EX",
      VALKEY_TTL_SECONDS,
    ),
  ]);
}

/**
 * Load metrics + circuit state from Valkey on startup. Called by
 * instrumentation.ts after Valkey connection is established.
 */
export async function loadProviderStateFromValkey(): Promise<void> {
  const client = await getValkeyClient();
  if (!client) return;
  try {
    // We don't know provider IDs ahead of time — scan the keyspace.
    // SCAN is non-blocking, safe for production.
    let cursor = "0";
    do {
      const [next, keys] = await client.scan(
        cursor,
        "MATCH",
        `${VALKEY_KEY_PREFIX}*`,
        "COUNT",
        100,
      );
      cursor = next;
      for (const key of keys) {
        const raw = await client.get(key);
        if (!raw) continue;
        try {
          const metrics = JSON.parse(raw) as ProviderMetrics;
          metricsStore.set(metrics.providerId, metrics);
        } catch {
          // Skip corrupt entries
        }
      }
    } while (cursor !== "0");

    // Same for circuit state
    cursor = "0";
    do {
      const [next, keys] = await client.scan(
        cursor,
        "MATCH",
        `${VALKEY_CIRCUIT_PREFIX}*`,
        "COUNT",
        100,
      );
      cursor = next;
      for (const key of keys) {
        const raw = await client.get(key);
        if (!raw) continue;
        try {
          const circuit = JSON.parse(raw) as CircuitState_;
          const providerId = key.slice(VALKEY_CIRCUIT_PREFIX.length);
          circuitStore.set(providerId, circuit);
        } catch {
          // Skip
        }
      }
    } while (cursor !== "0");

    logger.info("[provider-scoring] loaded state from Valkey", {
      metricsCount: metricsStore.size,
      circuitCount: circuitStore.size,
    });
  } catch (err) {
    logger.warn("[provider-scoring] Valkey load failed (non-fatal)", {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

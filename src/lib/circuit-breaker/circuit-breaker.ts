/**
 * circuit-breaker.ts — Circuit Breaker pattern for fault tolerance.
 *
 * Implements the Circuit Breaker state machine (Closed → Open → Half-Open)
 * to prevent cascading failures when external services are down.
 *
 * Key concepts:
 *   - CLOSED: Normal operation — requests pass through, failures are counted.
 *   - OPEN: Circuit is broken — all requests fail immediately (fast-fail).
 *   - HALF-OPEN: Testing recovery — allows a probe request to test if the
 *     downstream service has recovered.
 *
 * Configuration per breaker:
 *   - failureThreshold: Number of failures before opening (default: 5)
 *   - resetTimeout: Time in ms before transitioning to half-open (default: 30000)
 *   - probeInterval: How often to probe in half-open state (default: 10000)
 *   - successThreshold: Successful probes needed to close circuit (default: 3)
 *
 * All breaker states are tracked in-memory and exposed via the health
 * dashboard API for real-time monitoring.
 */

import { logger } from "@/lib/logger";
import { traceExternalCall } from "@/lib/telemetry/tracing";

// ─── Types ──────────────────────────────────────────────────────────────

export type CircuitState = "closed" | "open" | "half-open";

export interface CircuitBreakerConfig {
  name: string;
  failureThreshold: number;
  resetTimeout: number;
  probeInterval: number;
  successThreshold: number;
  monitorInterval: number;
}

export interface CircuitBreakerMetrics {
  name: string;
  state: CircuitState;
  failures: number;
  successes: number;
  totalRequests: number;
  lastFailureTime: number | null;
  lastSuccessTime: number | null;
  lastStateChangeTime: number;
  consecutiveFailures: number;
  consecutiveSuccesses: number;
  rejectedRequests: number;
  avgResponseTimeMs: number;
  responseTimes: number[];
}

// ─── Circuit Breaker Implementation ─────────────────────────────────────

export class CircuitBreaker {
  private state: CircuitState = "closed";
  private failures = 0;
  private successes = 0;
  private totalRequests = 0;
  private consecutiveFailures = 0;
  private consecutiveSuccesses = 0;
  private rejectedRequests = 0;
  private lastFailureTime: number | null = null;
  private lastSuccessTime: number | null = null;
  private lastStateChangeTime = Date.now();
  private openedAt: number | null = null;
  private responseTimes: number[] = [];
  private config: CircuitBreakerConfig;
  private halfOpenProbeActive = false;
  private monitorTimer: ReturnType<typeof setInterval> | null = null;

  constructor(config: Partial<CircuitBreakerConfig> & { name: string }) {
    this.config = {
      name: config.name,
      failureThreshold: config.failureThreshold || 5,
      resetTimeout: config.resetTimeout || 30000,
      probeInterval: config.probeInterval || 10000,
      successThreshold: config.successThreshold || 3,
      monitorInterval: config.monitorInterval || 60000,
    };
    this.startMonitoring();
  }

  // ─── State Machine ──────────────────────────────────────────────────

  private transitionTo(newState: CircuitState): void {
    const oldState = this.state;
    this.state = newState;
    this.lastStateChangeTime = Date.now();

    if (newState === "open") {
      this.openedAt = Date.now();
    }

    if (newState === "half-open") {
      this.consecutiveSuccesses = 0;
      this.halfOpenProbeActive = false;
    }

    logger.info(`[circuit-breaker] ${this.config.name}: ${oldState} → ${newState}`, {
      breaker: this.config.name,
      oldState,
      newState,
      failures: this.failures,
      successes: this.successes,
    });
  }

  private shouldAttemptReset(): boolean {
    if (this.state !== "open") return false;
    if (!this.openedAt) return false;
    return Date.now() - this.openedAt >= this.config.resetTimeout;
  }

  // ─── Public API ──────────────────────────────────────────────────────

  /**
   * Execute a function through the circuit breaker.
   * Returns the result or throws CircuitOpenError if the circuit is open.
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    this.totalRequests++;

    // OPEN state: fast-fail (or probe if reset timeout elapsed)
    if (this.state === "open") {
      if (this.shouldAttemptReset()) {
        this.transitionTo("half-open");
        // Continue execution as a probe request
      } else {
        this.rejectedRequests++;
        throw new CircuitOpenError(this.config.name);
      }
    }

    // HALF-OPEN state: only one probe at a time
    if (this.state === "half-open") {
      if (this.halfOpenProbeActive) {
        this.rejectedRequests++;
        throw new CircuitOpenError(this.config.name, "half-open probe already active");
      }
      this.halfOpenProbeActive = true;
    }

    const startTime = Date.now();
    const span = traceExternalCall("circuit-breaker", this.config.name, {
      "breaker.name": this.config.name,
      "breaker.state": this.state,
    });

    try {
      const result = await fn();
      const elapsed = Date.now() - startTime;
      this.recordSuccess(elapsed);
      span.setStatus(0);
      span.end();
      return result;
    } catch (err) {
      const elapsed = Date.now() - startTime;
      this.recordFailure(elapsed, err);
      span.setStatus(2, err instanceof Error ? err.message : String(err));
      span.end();
      throw err;
    } finally {
      if (this.state === "half-open") {
        this.halfOpenProbeActive = false;
      }
    }
  }

  private recordSuccess(elapsedMs: number): void {
    this.successes++;
    this.consecutiveFailures = 0;
    this.consecutiveSuccesses++;
    this.lastSuccessTime = Date.now();
    this.responseTimes.push(elapsedMs);
    if (this.responseTimes.length > 100) this.responseTimes.shift();

    if (this.state === "half-open" && this.consecutiveSuccesses >= this.config.successThreshold) {
      this.transitionTo("closed");
      this.failures = 0;
      this.consecutiveFailures = 0;
    }
  }

  private recordFailure(elapsedMs: number, err: unknown): void {
    this.failures++;
    this.consecutiveFailures++;
    this.consecutiveSuccesses = 0;
    this.lastFailureTime = Date.now();
    this.responseTimes.push(elapsedMs);
    if (this.responseTimes.length > 100) this.responseTimes.shift();

    logger.warn(`[circuit-breaker] ${this.config.name}: failure recorded`, {
      breaker: this.config.name,
      consecutiveFailures: this.consecutiveFailures,
      threshold: this.config.failureThreshold,
      error: err instanceof Error ? err.message : String(err),
    });

    if (this.state === "closed" && this.consecutiveFailures >= this.config.failureThreshold) {
      this.transitionTo("open");
    } else if (this.state === "half-open") {
      this.transitionTo("open");
    }
  }

  /** Get current state (Sprint 2 compatibility). */
  getState(): CircuitState { return this.state; }

  /** Get current metrics snapshot. */
  getMetrics(): CircuitBreakerMetrics {
    const avgResponseTime = this.responseTimes.length > 0
      ? this.responseTimes.reduce((a, b) => a + b, 0) / this.responseTimes.length
      : 0;

    return {
      name: this.config.name,
      state: this.state,
      failures: this.failures,
      successes: this.successes,
      totalRequests: this.totalRequests,
      lastFailureTime: this.lastFailureTime,
      lastSuccessTime: this.lastSuccessTime,
      lastStateChangeTime: this.lastStateChangeTime,
      consecutiveFailures: this.consecutiveFailures,
      consecutiveSuccesses: this.consecutiveSuccesses,
      rejectedRequests: this.rejectedRequests,
      avgResponseTimeMs: avgResponseTime,
      responseTimes: this.responseTimes.slice(-10),
    };
  }

  /** Force reset the circuit to closed state. */
  reset(): void {
    this.failures = 0;
    this.consecutiveFailures = 0;
    this.consecutiveSuccesses = 0;
    this.transitionTo("closed");
    logger.info(`[circuit-breaker] ${this.config.name}: manually reset to closed`);
  }

  /** Force open the circuit. */
  trip(): void {
    this.transitionTo("open");
    logger.info(`[circuit-breaker] ${this.config.name}: manually tripped to open`);
  }

  /** Get breaker config. */
  getConfig(): CircuitBreakerConfig {
    return this.config;
  }

  private startMonitoring(): void {
    this.monitorTimer = setInterval(() => {
      // Auto-transition from open to half-open when reset timeout elapsed
      if (this.state === "open" && this.shouldAttemptReset()) {
        this.transitionTo("half-open");
      }
    }, this.config.probeInterval);
  }

  shutdown(): void {
    if (this.monitorTimer) {
      clearInterval(this.monitorTimer);
    }
  }
}

// ─── Error Class ────────────────────────────────────────────────────────

export class CircuitOpenError extends Error {
  public breakerName: string;
  public breakerState: CircuitState;

  constructor(breakerName: string, reason?: string) {
    super(`Circuit breaker "${breakerName}" is open${reason ? `: ${reason}` : ""}`);
    this.name = "CircuitOpenError";
    this.breakerName = breakerName;
    this.breakerState = "open";
  }
}

// ─── Breaker Registry ────────────────────────────────────────────────────

const breakers = new Map<string, CircuitBreaker>();

/** Register or retrieve a circuit breaker by name. */
export function getCircuitBreaker(config: Partial<CircuitBreakerConfig> & { name: string }): CircuitBreaker {
  const existing = breakers.get(config.name);
  if (existing) return existing;

  const breaker = new CircuitBreaker(config);
  breakers.set(config.name, breaker);
  logger.info(`[circuit-breaker] Registered breaker "${config.name}"`);
  return breaker;
}

/** Get all registered breakers. */
export function getAllBreakers(): Map<string, CircuitBreaker> {
  return breakers;
}

/** Get aggregated health metrics for the dashboard. */
export function getHealthDashboard(): {
  breakers: CircuitBreakerMetrics[];
  summary: {
    total: number;
    closed: number;
    open: number;
    halfOpen: number;
    totalRequests: number;
    totalFailures: number;
    totalRejected: number;
    avgHealthScore: number;
  };
  timestamp: number;
} {
  const metrics: CircuitBreakerMetrics[] = [];
  let closed = 0, open = 0, halfOpen = 0;
  let totalRequests = 0, totalFailures = 0, totalRejected = 0;

  for (const breaker of breakers.values()) {
    const m = breaker.getMetrics();
    metrics.push(m);
    if (m.state === "closed") closed++;
    else if (m.state === "open") open++;
    else halfOpen++;
    totalRequests += m.totalRequests;
    totalFailures += m.failures;
    totalRejected += m.rejectedRequests;
  }

  const total = metrics.length;
  // Health score: 0-100, based on closed circuits ratio
  const avgHealthScore = total > 0 ? Math.round((closed / total) * 100) : 100;

  return {
    breakers: metrics,
    summary: {
      total,
      closed,
      open,
      halfOpen,
      totalRequests,
      totalFailures,
      totalRejected,
      avgHealthScore,
    },
    timestamp: Date.now(),
  };
}

/** Shutdown all breakers. */
export function shutdownAllBreakers(): void {
  for (const breaker of breakers.values()) {
    breaker.shutdown();
  }
  logger.info("[circuit-breaker] All breakers shut down");
}

// ─── Pre-configured Breakers for External Services ──────────────────────

export const externalBreakers = {
  /** Circuit breaker for OpenRouter AI API calls. */
  openrouter: getCircuitBreaker({
    name: "openrouter",
    failureThreshold: 5,
    resetTimeout: 30000,
    successThreshold: 2,
  }),

  /** Circuit breaker for MyFatoorah payment gateway. */
  myFatoorah: getCircuitBreaker({
    name: "myfatoorah",
    failureThreshold: 3,
    resetTimeout: 60000,
    successThreshold: 2,
  }),

  /** Circuit breaker for PayMob payment gateway. */
  payMob: getCircuitBreaker({
    name: "paymob",
    failureThreshold: 3,
    resetTimeout: 60000,
    successThreshold: 2,
  }),

  /** Circuit breaker for WhatsApp Business API. */
  whatsapp: getCircuitBreaker({
    name: "whatsapp",
    failureThreshold: 5,
    resetTimeout: 30000,
    successThreshold: 3,
  }),

  /** Circuit breaker for ZATCA e-invoicing API. */
  zatca: getCircuitBreaker({
    name: "zatca",
    failureThreshold: 3,
    resetTimeout: 120000, // 2 min — ZATCA recovery is slower
    successThreshold: 2,
  }),

  /** Circuit breaker for UAE FTA e-invoicing API. */
  uaeFta: getCircuitBreaker({
    name: "uae-fta",
    failureThreshold: 3,
    resetTimeout: 120000,
    successThreshold: 2,
  }),

  // P3 FIX (audit): Added DeepSeek + Gemini circuit breakers for server-side
  // AI fault tolerance. Previously only OpenRouter had a breaker — DeepSeek
  // (the primary provider) and Gemini (fallback) had none, so sustained 5xx
  // from either would be retried forever on every request.
  deepseek: getCircuitBreaker({
    name: "deepseek",
    failureThreshold: 5,
    resetTimeout: 30000,
    successThreshold: 2,
  }),

  gemini: getCircuitBreaker({
    name: "gemini",
    failureThreshold: 5,
    resetTimeout: 30000,
    successThreshold: 2,
  }),

  /** Circuit breaker for email sending (nodemailer SMTP). */
  email: getCircuitBreaker({
    name: "email-smtp",
    failureThreshold: 5,
    resetTimeout: 30000,
    successThreshold: 2,
  }),

  /** Circuit breaker for Valkey/Redis operations. */
  valkey: getCircuitBreaker({
    name: "valkey",
    failureThreshold: 10,
    resetTimeout: 15000,
    successThreshold: 3,
  }),
};

// ─── Sprint 2 Legacy Aliases ────────────────────────────────────────────

/**
 * Per-service circuit breakers — each external dependency gets its OWN breaker
 * so a failure in one doesn't trip another. Previously `externalApiCircuitBreaker`
 * was aliased to `externalBreakers.openrouter`, which meant a webhook delivery
 * failure could trip the AI breaker (and vice versa) — a single OpenRouter
 * rate-limit would silence all webhook calls until the breaker reset.
 */

/** Alias for AI service breaker. */
export const aiCircuitBreaker = externalBreakers.openrouter;

/** Alias for payment service breaker. */
export const paymentCircuitBreaker = externalBreakers.myFatoorah;

/** Webhook delivery — external client servers (separate from AI). */
export const webhookCircuitBreaker = getCircuitBreaker({
  name: "webhook-delivery",
  failureThreshold: 5,
  resetTimeout: 30000,
  successThreshold: 2,
});

/** Generic external API breaker — used by storage, integrations, product-matching.
 *  Separate from AI and webhook breakers. */
export const externalApiCircuitBreaker = getCircuitBreaker({
  name: "external-api",
  failureThreshold: 5,
  resetTimeout: 30000,
  successThreshold: 2,
});

/** E-invoicing breaker — government tax authorities (slower recovery). */
export const eInvoicingCircuitBreaker = getCircuitBreaker({
  name: "e-invoicing",
  failureThreshold: 3,
  resetTimeout: 120000,
  successThreshold: 2,
});

/** WhatsApp integration breaker. */
export const whatsappCircuitBreaker = externalBreakers.whatsapp;

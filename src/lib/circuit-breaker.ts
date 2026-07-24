/**
 * circuit-breaker.ts — Circuit Breaker pattern for resilient service calls.
 *
 * States: CLOSED (normal) → OPEN (failing, reject all) → HALF-OPEN (probe).
 * 
 * Configuration:
 * - failureThreshold: number of failures before opening (default 5)
 * - resetTimeout: ms before transitioning to half-open (default 30000)
 * - successThresholdInHalfOpen: successes needed to close (default 3)
 * - monitorInterval: ms for periodic state checks (default 10000)
 */

export type CircuitState = "closed" | "open" | "half-open";

export interface CircuitBreakerConfig {
  failureThreshold: number;
  resetTimeout: number;
  successThresholdInHalfOpen: number;
  monitorInterval: number;
  onStateChange?: (oldState: CircuitState, newState: CircuitState) => void;
}

interface CircuitBreakerMetrics {
  failures: number;
  successes: number;
  consecutiveFailures: number;
  consecutiveSuccesses: number;
  lastFailureTime: number | null;
  lastSuccessTime: number | null;
  totalCalls: number;
  rejectedCalls: number;
}

export class CircuitBreaker {
  private state: CircuitState = "closed";
  private metrics: CircuitBreakerMetrics;
  private config: CircuitBreakerConfig;
  private lastStateChangeTime: number = Date.now();

  constructor(config: Partial<CircuitBreakerConfig> = {}) {
    this.config = {
      failureThreshold: config.failureThreshold ?? 5,
      resetTimeout: config.resetTimeout ?? 30000,
      successThresholdInHalfOpen: config.successThresholdInHalfOpen ?? 3,
      monitorInterval: config.monitorInterval ?? 10000,
      onStateChange: config.onStateChange,
    };
    this.metrics = {
      failures: 0, successes: 0, consecutiveFailures: 0, consecutiveSuccesses: 0,
      lastFailureTime: null, lastSuccessTime: null, totalCalls: 0, rejectedCalls: 0,
    };
  }

  getState(): CircuitState { return this.state; }
  getMetrics(): CircuitBreakerMetrics { return { ...this.metrics }; }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    // Check if we should transition from OPEN to HALF-OPEN
    if (this.state === "open") {
      const elapsed = Date.now() - this.lastStateChangeTime;
      if (elapsed >= this.config.resetTimeout) {
        this.transitionTo("half-open");
      } else {
        this.metrics.rejectedCalls++;
        throw new CircuitBreakerOpenError(this.state, this.metrics.consecutiveFailures);
      }
    }

    this.metrics.totalCalls++;

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess(): void {
    this.metrics.successes++;
    this.metrics.consecutiveSuccesses++;
    this.metrics.consecutiveFailures = 0;
    this.metrics.lastSuccessTime = Date.now();

    if (this.state === "half-open") {
      if (this.metrics.consecutiveSuccesses >= this.config.successThresholdInHalfOpen) {
        this.transitionTo("closed");
      }
    }
  }

  private onFailure(): void {
    this.metrics.failures++;
    this.metrics.consecutiveFailures++;
    this.metrics.consecutiveSuccesses = 0;
    this.metrics.lastFailureTime = Date.now();

    if (this.state === "closed") {
      if (this.metrics.consecutiveFailures >= this.config.failureThreshold) {
        this.transitionTo("open");
      }
    } else if (this.state === "half-open") {
      // Any failure in half-open immediately opens again
      this.transitionTo("open");
    }
  }

  private transitionTo(newState: CircuitState): void {
    const oldState = this.state;
    this.state = newState;
    this.lastStateChangeTime = Date.now();

    if (newState === "closed") {
      this.metrics.consecutiveFailures = 0;
    }

    if (this.config.onStateChange) {
      this.config.onStateChange(oldState, newState);
    }
  }

  reset(): void {
    this.state = "closed";
    this.metrics = {
      failures: 0, successes: 0, consecutiveFailures: 0, consecutiveSuccesses: 0,
      lastFailureTime: null, lastSuccessTime: null, totalCalls: 0, rejectedCalls: 0,
    };
    this.lastStateChangeTime = Date.now();
  }
}

export class CircuitBreakerOpenError extends Error {
  constructor(state: CircuitState, failures: number) {
    super(`Circuit breaker is ${state} — rejected call after ${failures} consecutive failures`);
    this.name = "CircuitBreakerOpenError";
  }
}

// Registry for named circuit breakers
const circuitBreakers = new Map<string, CircuitBreaker>();

export function getCircuitBreaker(name: string, config?: Partial<CircuitBreakerConfig>): CircuitBreaker {
  if (!circuitBreakers.has(name)) {
    circuitBreakers.set(name, new CircuitBreaker({
      ...config,
      onStateChange: (old, new_) => {
        console.warn(`[circuit-breaker:${name}] ${old} → ${new_}`);
        if (config?.onStateChange) config.onStateChange(old, new_);
      },
    }));
  }
  return circuitBreakers.get(name)!;
}

// Pre-configured breakers for common services
export const aiCircuitBreaker = getCircuitBreaker("ai-service", {
  failureThreshold: 3,
  resetTimeout: 15000,
  successThresholdInHalfOpen: 2,
});

export const paymentCircuitBreaker = getCircuitBreaker("payment-service", {
  failureThreshold: 2,
  resetTimeout: 60000,
  successThresholdInHalfOpen: 3,
});

export const externalApiCircuitBreaker = getCircuitBreaker("external-api", {
  failureThreshold: 5,
  resetTimeout: 30000,
});

/**
 * circuit-breaker/index.ts — Barrel export for Circuit Breaker module.
 *
 * Merges Sprint 2 (simple breaker) + Sprint 3 (health dashboard + registry).
 */

export {
  getCircuitBreaker,
  getAllBreakers,
  getHealthDashboard,
  shutdownAllBreakers,
  externalBreakers,
  CircuitOpenError as CircuitBreakerOpenError, // Sprint 2 alias
  // Sprint 2 legacy aliases
  aiCircuitBreaker,
  paymentCircuitBreaker,
  externalApiCircuitBreaker,
  // Per-service breakers (Audit 4 fix — prevent cross-service breaker aliasing)
  webhookCircuitBreaker,
  eInvoicingCircuitBreaker,
  whatsappCircuitBreaker,
} from "./circuit-breaker";

// Re-export the CircuitBreaker class itself
export { CircuitBreaker } from "./circuit-breaker";

export type {
  CircuitState,
  CircuitBreakerConfig,
  CircuitBreakerMetrics,
} from "./circuit-breaker";

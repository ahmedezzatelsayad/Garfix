/**
 * circuit-breaker/index.ts — Barrel export for Circuit Breaker module.
 */

export {
  getCircuitBreaker,
  getAllBreakers,
  getHealthDashboard,
  shutdownAllBreakers,
  externalBreakers,
  CircuitOpenError,
} from "./circuit-breaker";

export type {
  CircuitState,
  CircuitBreakerConfig,
  CircuitBreakerMetrics,
} from "./circuit-breaker";

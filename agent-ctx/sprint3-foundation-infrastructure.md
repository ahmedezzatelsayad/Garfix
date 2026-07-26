# Sprint 3 Foundation Infrastructure — Work Record

**Task ID**: sprint3-foundation
**Agent**: infrastructure-builder
**Status**: ✅ Complete

## Files Created/Modified

### 1. `/src/lib/telemetry.ts` (NEW)
- OpenTelemetry instrumentation foundation
- Defines `Span`, `Metric`, `LogEvent` interfaces
- `ConsoleTelemetryProvider` for dev (console-based output)
- `TelemetryProvider` interface for pluggable OTLP providers in production
- Convenience API: `startSpan`, `endSpan`, `recordMetric`, `logEvent`
- `trace<T>()` — async function execution tracer
- `measure<T>()` — sync function execution measurer

### 2. `/src/lib/circuit-breaker.ts` (NEW)
- Circuit Breaker pattern: CLOSED → OPEN → HALF-OPEN states
- Configurable: `failureThreshold`, `resetTimeout`, `successThresholdInHalfOpen`
- `CircuitBreakerOpenError` custom error class
- Named circuit breaker registry via `getCircuitBreaker(name, config)`
- Pre-configured breakers:
  - `aiCircuitBreaker` — threshold 3, reset 15s (AI services are flaky)
  - `paymentCircuitBreaker` — threshold 2, reset 60s (payments need high reliability)
  - `externalApiCircuitBreaker` — threshold 5, reset 30s (general external APIs)

### 3. `/src/lib/event-bus.ts` (NEW)
- Typed Event Bus with 24 domain event types (`DomainEvents` interface)
- Priority-based handler execution (lower priority = earlier)
- Dead letter queue for failed handler invocations
- `emitEvent()` helper with telemetry integration (spans + logging)
- Key domain events: invoice, fiscal period, journal entry, payment, AI requests, circuit breaker state changes, webhooks, automation, backup, user/company lifecycle

### 4. `/src/hooks/api-client.ts` (MODIFIED)
- Integrated circuit breakers for external service calls
- `resolveCircuitBreaker(url)` — URL-pattern-based breaker selection
  - `/api/ai/*` → `aiCircuitBreaker`
  - `/api/saas/payments/*` → `paymentCircuitBreaker`
  - `/api/webhooks/*`, `/api/product-matching/*`, `/api/e-invoicing/*`, `/api/storage/*` → `externalApiCircuitBreaker`
  - Internal endpoints (accounting, HR, invoices, etc.) → NO circuit breaker
- `withCircuitBreaker(url, fn)` — wraps async ops in appropriate breaker
- Added utility exports:
  - `isCircuitBreakerOpenError(error)` — for React Query error handlers
  - `getCircuitBreakerState(name)` — for service health dashboards
  - `getCircuitBreakerMetrics(name)` — for metrics dashboards

## TypeScript Verification
- `bunx tsc --noEmit` — ✅ No errors (clean output)

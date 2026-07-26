/**
 * telemetry/index.ts — Barrel export for Observability module.
 *
 * Combines OpenTelemetry tracing + Event Bus audit trail.
 */

export {
  getTracer,
  initTelemetry,
  shutdownTelemetry,
  traceApiRoute,
  traceDbQuery,
  traceExternalCall,
  traceQueueJob,
  extractTraceContext,
  generateTraceParent,
  parseTraceParent,
} from "./tracing";

export type {
  Tracer,
  Span,
  SpanContext,
  SpanData,
  SpanEvent,
  W3CTraceContext,
} from "./tracing";

export {
  generateCorrelationId,
  recordAuditEvent,
  queryAuditEvents,
  getAuditEvent,
  verifyAuditEventIntegrity,
  verifyAuditChain,
  getAuditStats,
} from "./event-bus-audit";

export type {
  AuditEvent,
  AuditEventQuery,
  AuditEventResult,
} from "./event-bus-audit";

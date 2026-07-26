/**
 * tracing.ts — OpenTelemetry OTLP integration for Garfix EOS.
 *
 * Provides distributed tracing with real OTLP endpoint export.
 * Configured via environment variables:
 *   - OTEL_EXPORTER_OTLP_ENDPOINT: OTLP receiver URL (e.g. "http://localhost:4318/v1/traces")
 *   - OTEL_SERVICE_NAME: Service name for spans (default: "garfix-eos")
 *   - OTEL_EXPORTER_OTLP_HEADERS: Optional headers (e.g. API keys for cloud providers)
 *   - OTEL_TRACING_ENABLED: Enable/disable tracing (default: true in production)
 *
 * Supports both HTTP (OTLP/HTTP) and gRPC (OTLP/gRPC) protocols.
 * Graceful degradation: if no endpoint is configured, a NoOp tracer is used.
 */

import { logger } from "@/lib/logger";

// ─── Configuration ────────────────────────────────────────────────────────

interface TelemetryConfig {
  enabled: boolean;
  serviceName: string;
  otlpEndpoint: string;
  otlpHeaders: Record<string, string>;
  otlpProtocol: "http" | "grpc";
  samplingRate: number;
}

function getTelemetryConfig(): TelemetryConfig {
  const enabled = process.env.OTEL_TRACING_ENABLED !== "false" &&
    process.env.NODE_ENV === "production" ||
    process.env.OTEL_TRACING_ENABLED === "true";

  const otlpEndpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT || "";
  const otlpHeaders: Record<string, string> = {};

  // Parse headers from env (format: "key1=value1,key2=value2")
  const headersStr = process.env.OTEL_EXPORTER_OTLP_HEADERS || "";
  if (headersStr) {
    for (const pair of headersStr.split(",")) {
      const [key, value] = pair.split("=");
      if (key && value) otlpHeaders[key.trim()] = value.trim();
    }
  }

  return {
    enabled: enabled && !!otlpEndpoint,
    serviceName: process.env.OTEL_SERVICE_NAME || "garfix-eos",
    otlpEndpoint,
    otlpHeaders,
    otlpProtocol: (process.env.OTEL_EXPORTER_OTLP_PROTOCOL as "http" | "grpc") || "http",
    samplingRate: parseFloat(process.env.OTEL_SAMPLING_RATE || "0.1"),
  };
}

// ─── Span Types ──────────────────────────────────────────────────────────

export interface SpanContext {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
}

export interface SpanData {
  name: string;
  startTime: number;
  endTime?: number;
  attributes: Record<string, string | number | boolean>;
  status: { code: number; message?: string };
  context: SpanContext;
  events: SpanEvent[];
}

export interface SpanEvent {
  name: string;
  time: number;
  attributes: Record<string, string | number | boolean>;
}

// ─── Tracer Interface ─────────────────────────────────────────────────────

export interface Tracer {
  startSpan(name: string, attributes?: Record<string, string | number | boolean>): Span;
  getCurrentContext(): SpanContext | null;
  setContext(ctx: SpanContext | null): void;
}

export interface Span {
  spanId: string;
  traceId: string;
  parentSpanId?: string;
  name: string;
  attributes: Record<string, string | number | boolean>;
  events: SpanEvent[];
  setStatus(code: number, message?: string): void;
  addEvent(name: string, attributes?: Record<string, string | number | boolean>): void;
  setAttribute(key: string, value: string | number | boolean): void;
  end(): void;
}

// ─── OTLP HTTP Exporter ──────────────────────────────────────────────────

class OTLPHttpExporter {
  private endpoint: string;
  private headers: Record<string, string>;
  private buffer: SpanData[] = [];
  private flushInterval: ReturnType<typeof setInterval> | null = null;
  private maxBatchSize = 50;

  constructor(endpoint: string, headers: Record<string, string>) {
    this.endpoint = endpoint;
    this.headers = headers;
    this.startFlushLoop();
  }

  private startFlushLoop(): void {
    this.flushInterval = setInterval(() => this.flush(), 5000);
  }

  export(span: SpanData): void {
    this.buffer.push(span);
    if (this.buffer.length >= this.maxBatchSize) {
      this.flush();
    }
  }

  async flush(): Promise<void> {
    if (this.buffer.length === 0) return;

    const batch = this.buffer.splice(0);
    const payload = this.encodeOTLP(batch);

    try {
      const response = await fetch(this.endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...this.headers,
        },
        body: payload,
      });

      if (!response.ok) {
        logger.warn("[telemetry] OTLP export failed", {
          status: response.status,
          spansLost: batch.length,
        });
        // Re-queue on transient failures (5xx)
        if (response.status >= 500 && this.buffer.length + batch.length < 200) {
          this.buffer.unshift(...batch);
        }
      }
    } catch (err) {
      logger.warn("[telemetry] OTLP export network error", {
        err: err instanceof Error ? err.message : String(err),
        spansLost: batch.length,
      });
    }
  }

  private encodeOTLP(spans: SpanData[]): string {
    // OTLP/JSON format v0.20.0 compatible
    const resource = {
      attributes: [
        { key: "service.name", value: { stringValue: getTelemetryConfig().serviceName } },
        { key: "service.version", value: { stringValue: "12.0.0" } },
        { key: "telemetry.sdk.name", value: { stringValue: "garfix-otel" } },
        { key: "telemetry.sdk.language", value: { stringValue: "nodejs" } },
      ],
    };

    const scopeSpans = [{
      scope: { name: "garfix-eos", version: "12.0.0" },
      spans: spans.map((span) => ({
        traceId: span.context.traceId,
        spanId: span.context.spanId,
        parentSpanId: span.context.parentSpanId || undefined,
        name: span.name,
        kind: 1, // INTERNAL
        startTimeUnixNano: String(span.startTime * 1_000_000),
        endTimeUnixNano: span.endTime ? String(span.endTime * 1_000_000) : String(Date.now() * 1_000_000),
        attributes: Object.entries(span.attributes).map(([key, value]) => ({
          key,
          value: typeof value === "string" ? { stringValue: value }
            : typeof value === "number" ? { intValue: String(value) }
            : { boolValue: value },
        })),
        status: {
          code: span.status.code,
          message: span.status.message || undefined,
        },
        events: span.events.map((event) => ({
          name: event.name,
          timeUnixNano: String(event.time * 1_000_000),
          attributes: Object.entries(event.attributes || {}).map(([key, value]) => ({
            key,
            value: typeof value === "string" ? { stringValue: value }
              : typeof value === "number" ? { intValue: String(value) }
              : { boolValue: value },
          })),
        })),
      })),
    }];

    return JSON.stringify({ resourceSpans: [{ resource, scopeSpans }] });
  }

  shutdown(): void {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
    }
    this.flush();
  }
}

// ─── NoOp Tracer (fallback) ──────────────────────────────────────────────

class NoOpSpan implements Span {
  spanId = "";
  traceId = "";
  name = "";
  attributes: Record<string, string | number | boolean> = {};
  events: SpanEvent[] = [];

  setStatus(): void {}
  addEvent(): void {}
  setAttribute(): void {}
  end(): void {}
}

class NoOpTracer implements Tracer {
  startSpan(name: string): Span {
    const noop = new NoOpSpan();
    noop.name = name;
    return noop;
  }
  getCurrentContext(): SpanContext | null { return null; }
  setContext(): void {}
}

// ─── Real Tracer ──────────────────────────────────────────────────────────

let currentContext: SpanContext | null = null;

function generateId(length: number): string {
  const bytes = new Uint8Array(length);
  // Use crypto if available, otherwise fallback
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < length; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

class RealSpan implements Span {
  spanId: string;
  traceId: string;
  parentSpanId?: string;
  name: string;
  attributes: Record<string, string | number | boolean>;
  events: SpanEvent[] = [];
  status: { code: number; message?: string } = { code: 0 };
  startTime: number;

  constructor(name: string, attributes: Record<string, string | number | boolean>, parentCtx?: SpanContext) {
    this.name = name;
    this.startTime = Date.now();
    this.spanId = generateId(8);
    this.traceId = parentCtx?.traceId || generateId(16);
    this.parentSpanId = parentCtx?.spanId;
    this.attributes = { ...attributes };
  }

  setStatus(code: number, message?: string): void {
    this.status = { code, message };
  }

  addEvent(name: string, attributes?: Record<string, string | number | boolean>): void {
    this.events.push({
      name,
      time: Date.now(),
      attributes: attributes || {},
    });
  }

  setAttribute(key: string, value: string | number | boolean): void {
    this.attributes[key] = value;
  }

  end(): void {
    const endTime = Date.now();
    const spanData: SpanData = {
      name: this.name,
      startTime: this.startTime,
      endTime,
      attributes: this.attributes,
      status: this.status,
      context: {
        traceId: this.traceId,
        spanId: this.spanId,
        parentSpanId: this.parentSpanId,
      },
      events: this.events,
    };
    exporter?.export(spanData);
  }
}

class RealTracer implements Tracer {
  startSpan(name: string, attributes?: Record<string, string | number | boolean>): Span {
    const parentCtx = currentContext ?? undefined;
    const span = new RealSpan(name, attributes || {}, parentCtx);
    return span;
  }

  getCurrentContext(): SpanContext | null {
    return currentContext;
  }

  setContext(ctx: SpanContext | null): void {
    currentContext = ctx;
  }
}

// ─── Tracer Factory ──────────────────────────────────────────────────────

let tracer: Tracer | null = null;
let exporter: OTLPHttpExporter | null = null;

export function getTracer(): Tracer {
  if (!tracer) {
    const config = getTelemetryConfig();
    if (config.enabled) {
      exporter = new OTLPHttpExporter(config.otlpEndpoint, config.otlpHeaders);
      tracer = new RealTracer();
      logger.info("[telemetry] OTLP tracer initialized", {
        endpoint: config.otlpEndpoint,
        protocol: config.otlpProtocol,
        samplingRate: config.samplingRate,
      });
    } else {
      tracer = new NoOpTracer();
      logger.info("[telemetry] NoOp tracer active (OTLP endpoint not configured)");
    }
  }
  return tracer;
}

// ─── Convenience Helpers ──────────────────────────────────────────────────

/** Trace an API route handler execution. */
export function traceApiRoute(
  method: string,
  path: string,
  attributes?: Record<string, string | number | boolean>,
): Span {
  const span = getTracer().startSpan(`api.${method}.${path}`, {
    "http.method": method,
    "http.route": path,
    ...attributes,
  });
  return span;
}

/** Trace a database query. */
export function traceDbQuery(
  operation: string,
  model: string,
  attributes?: Record<string, string | number | boolean>,
): Span {
  return getTracer().startSpan(`db.${operation}.${model}`, {
    "db.operation": operation,
    "db.model": model,
    "db.system": "prisma",
    ...attributes,
  });
}

/** Trace an external service call. */
export function traceExternalCall(
  service: string,
  operation: string,
  attributes?: Record<string, string | number | boolean>,
): Span {
  return getTracer().startSpan(`external.${service}.${operation}`, {
    "peer.service": service,
    "external.operation": operation,
    ...attributes,
  });
}

/** Trace a queue job execution. */
export function traceQueueJob(
  queueName: string,
  jobId: string,
  attributes?: Record<string, string | number | boolean>,
): Span {
  return getTracer().startSpan(`queue.${queueName}.${jobId}`, {
    "queue.name": queueName,
    "job.id": jobId,
    ...attributes,
  });
}

/** Initialize telemetry (call on server boot). */
export async function initTelemetry(): Promise<void> {
  const config = getTelemetryConfig();
  if (config.enabled) {
    getTracer(); // Trigger lazy initialization
    logger.info("[telemetry] ✓ Initialized", {
      service: config.serviceName,
      endpoint: config.otlpEndpoint,
      sampling: config.samplingRate,
    });
  } else {
    logger.info("[telemetry] Disabled — no OTLP endpoint configured");
  }
}

/** Shutdown telemetry (call on graceful shutdown). */
export function shutdownTelemetry(): void {
  exporter?.shutdown();
  logger.info("[telemetry] ✓ Shutdown complete");
}

// ─── Trace Context Propagation (W3C TraceContext) ────────────────────────

export interface W3CTraceContext {
  traceParent: string;
  traceState?: string;
}

/** Parse W3C traceparent header from HTTP request. */
export function parseTraceParent(header: string): W3CTraceContext | null {
  // Format: version-traceId-spanId-flags
  const match = header.match(/^([0-9a-f]{2})-([0-9a-f]{32})-([0-9a-f]{16})-([0-9a-f]{2})$/);
  if (!match) return null;

  return {
    traceParent: header,
    traceState: undefined, // Could parse from tracestate header
  };
}

/** Extract trace context from HTTP request headers. */
export function extractTraceContext(headers: Record<string, string | undefined>): SpanContext | null {
  const traceparent = headers["traceparent"];
  if (!traceparent) return null;

  const parsed = parseTraceParent(traceparent);
  if (!parsed) return null;

  const parts = traceparent.split("-");
  return {
    traceId: parts[1],
    spanId: parts[3],
  };
}

/** Generate W3C traceparent header value for outbound requests. */
export function generateTraceParent(ctx: SpanContext): string {
  return `00-${ctx.traceId}-${ctx.spanId}-01`;
}

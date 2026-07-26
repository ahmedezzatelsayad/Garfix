/**
 * telemetry.ts — OpenTelemetry instrumentation foundation.
 *
 * Provides structured tracing, metrics, and logging hooks.
 * In production, connects to a real OTLP endpoint.
 * In development, uses console-based output.
 */

// Types for telemetry events
export interface Span {
  name: string;
  startTime: number;
  endTime?: number;
  attributes: Record<string, string | number | boolean>;
  status: "ok" | "error";
  parentSpanId?: string;
}

export interface Metric {
  name: string;
  value: number;
  type: "counter" | "gauge" | "histogram";
  attributes: Record<string, string | number>;
  timestamp: number;
}

export interface LogEvent {
  level: "debug" | "info" | "warn" | "error";
  message: string;
  attributes: Record<string, unknown>;
  timestamp: number;
  spanId?: string;
}

// Telemetry provider interface
export interface TelemetryProvider {
  startSpan(name: string, attributes?: Record<string, string | number | boolean>): Span;
  endSpan(span: Span, status?: "ok" | "error"): void;
  recordMetric(metric: Metric): void;
  log(event: LogEvent): void;
}

// Console-based provider for dev
class ConsoleTelemetryProvider implements TelemetryProvider {
  startSpan(name: string, attributes?: Record<string, string | number | boolean>): Span {
    const span: Span = {
      name,
      startTime: Date.now(),
      attributes: attributes || {},
      status: "ok",
    };
    return span;
  }

  endSpan(span: Span, status?: "ok" | "error"): void {
    span.endTime = Date.now();
    span.status = status || span.status;
    const duration = span.endTime - span.startTime;
    console.log(`[telemetry] span: ${span.name} | ${span.status} | ${duration}ms | attrs: ${JSON.stringify(span.attributes)}`);
  }

  recordMetric(metric: Metric): void {
    console.log(`[telemetry] metric: ${metric.name}=${metric.value} (${metric.type}) | attrs: ${JSON.stringify(metric.attributes)}`);
  }

  log(event: LogEvent): void {
    const prefix = event.spanId ? `[span:${event.spanId}]` : "";
    console.log(`[telemetry:${event.level}] ${prefix} ${event.message} | ${JSON.stringify(event.attributes)}`);
  }
}

// Singleton provider
let provider: TelemetryProvider = new ConsoleTelemetryProvider();

export function setTelemetryProvider(newProvider: TelemetryProvider): void {
  provider = newProvider;
}

export function getTelemetryProvider(): TelemetryProvider {
  return provider;
}

// Convenience API
export function startSpan(name: string, attributes?: Record<string, string | number | boolean>): Span {
  return provider.startSpan(name, attributes);
}

export function endSpan(span: Span, status?: "ok" | "error"): void {
  provider.endSpan(span, status);
}

export function recordMetric(name: string, value: number, type: Metric["type"], attributes?: Record<string, string | number>): void {
  provider.recordMetric({ name, value, type, attributes: attributes || {}, timestamp: Date.now() });
}

export function logEvent(level: LogEvent["level"], message: string, attributes?: Record<string, unknown>): void {
  provider.log({ level, message, attributes: attributes || {}, timestamp: Date.now() });
}

// Trace a function execution
export async function trace<T>(name: string, fn: () => Promise<T>, attributes?: Record<string, string | number | boolean>): Promise<T> {
  const span = startSpan(name, attributes);
  try {
    const result = await fn();
    endSpan(span, "ok");
    return result;
  } catch (error) {
    endSpan(span, "error");
    if (error instanceof Error) {
      logEvent("error", `trace ${name} failed: ${error.message}`, { error: error.message, stack: error.stack });
    }
    throw error;
  }
}

// Measure function execution time
export function measure<T>(name: string, fn: () => T, attributes?: Record<string, string | number | boolean>): T {
  const span = startSpan(name, attributes);
  try {
    const result = fn();
    endSpan(span, "ok");
    return result;
  } catch (error) {
    endSpan(span, "error");
    throw error;
  }
}

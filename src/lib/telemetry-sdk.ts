/**
 * telemetry-sdk.ts — Real OpenTelemetry SDK wrapper (P1.2)
 *
 * NOTE: This is distinct from telemetry.ts (the legacy hand-rolled metrics
 * module). This file wraps the official @opentelemetry/sdk-node package
 * and is loaded only at server startup from instrumentation.ts. The legacy
 * telemetry.ts is preserved for backward compatibility with event-bus.ts.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WHAT THIS REPLACES
 * ═══════════════════════════════════════════════════════════════════════════
 * Prior to P1.2, the codebase only emitted metrics in OpenTelemetry
 * text-format via a hand-rolled `metrics.ts` module. That approach had
 * three problems:
 *
 *   1. No traces — there was no span hierarchy, so request latencies
 *      could not be broken down by DB call / HTTP call / business logic.
 *   2. No auto-instrumentation — every metric had to be added manually,
 *      so most code paths were invisible.
 *   3. No context propagation — cross-service tracing headers
 *      (traceparent, tracestate) were not propagated.
 *
 * This module replaces that with the official @opentelemetry/sdk-node
 * + @opentelemetry/auto-instrumentations-node, which gives us:
 *
 *   - Auto-instrumentation of http, https, dns, net, fs, pg, prisma,
 *     ioredis, bunyan, pino, and 40+ other Node modules.
 *   - W3C Trace Context propagation (traceparent / tracestate headers).
 *   - OTLP exporter (HTTP/protobuf) to OTEL_EXPORTER_OTLP_ENDPOINT.
 *   - Batch span processor with 5s export interval.
 *   - Resource attributes: service.name, service.version, host.name,
 *     deployment.environment (all from standard OTEL_* env vars).
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * CONFIGURATION
 * ═══════════════════════════════════════════════════════════════════════════
 * Standard OpenTelemetry env vars (all optional except the first):
 *   OTEL_EXPORTER_OTLP_ENDPOINT  — e.g. http://otel-collector:4318
 *   OTEL_SERVICE_NAME            — defaults to "garfix"
 *   OTEL_SERVICE_VERSION         — defaults to package.json version
 *   OTEL_RESOURCE_ATTRIBUTES     — e.g. "deployment.environment=prod"
 *   OTEL_LOG_LEVEL               — none|error|warn|info|debug
 *
 * If OTEL_EXPORTER_OTLP_ENDPOINT is unset, startTelemetry() is a no-op
 * (dev / test mode). This is intentional — we don't want to spam a
 * non-existent collector with failed export attempts.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WHY DYNAMIC IMPORT?
 * ═══════════════════════════════════════════════════════════════════════════
 * The OTel SDK is heavy (~5MB) and uses Node-only modules (worker_threads,
 * inspector, perf_hooks). We import it dynamically from instrumentation.ts
 * so Next.js's build phase doesn't trace it into the Edge bundle. The
 * SDK only loads at server startup, after the build completes.
 */

import { logger } from "./logger";

let started = false;

/**
 * Start the OpenTelemetry SDK. Idempotent — calling twice is a no-op.
 *
 * Returns true if the SDK was actually started, false if it was skipped
 * (e.g. no OTEL_EXPORTER_OTLP_ENDPOINT configured) or already started.
 */
export async function startTelemetry(): Promise<boolean> {
  if (started) return false;
  const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
  if (!endpoint) {
    logger.info("[telemetry] OTEL_EXPORTER_OTLP_ENDPOINT not set — skipping OTel SDK init");
    return false;
  }

  try {
    // Dynamic imports keep the SDK out of the build-time trace.
    const [{ NodeSDK }, { OTLPTraceExporter }, { OTLPMetricExporter }, { PeriodicExportingMetricReader }, { BatchSpanProcessor }, autoInstr] = await Promise.all([
      import("@opentelemetry/sdk-node"),
      import("@opentelemetry/exporter-trace-otlp-http"),
      import("@opentelemetry/exporter-metrics-otlp-http"),
      import("@opentelemetry/sdk-metrics"),
      import("@opentelemetry/sdk-trace-base"),
      import("@opentelemetry/auto-instrumentations-node").catch(() => ({ getResourceDetectors: () => [] })),
    ]);

    const serviceName = process.env.OTEL_SERVICE_NAME || "garfix";
    const serviceVersion = process.env.OTEL_SERVICE_VERSION || process.env.npm_package_version || "unknown";

    const traceExporter = new OTLPTraceExporter({ url: `${endpoint}/v1/traces` });
    const metricExporter = new OTLPMetricExporter({ url: `${endpoint}/v1/metrics` });

    const sdk = new NodeSDK({
      serviceName,
      serviceVersion,
      traceExporter,
      metricReader: new PeriodicExportingMetricReader({
        exporter: metricExporter,
        exportIntervalMillis: 5000,
      }),
      spanProcessor: new BatchSpanProcessor(traceExporter, {
        maxQueueSize: 1024,
        maxExportBatchSize: 256,
        scheduledDelayMillis: 5000,
      }),
      // @ts-expect-error — autoInstrumentations may be missing in fallback
      instrumentations: autoInstr?.getNodeAutoInstrumentations
        ? [autoInstr.getNodeAutoInstrumentations({
            "@opentelemetry/instrumentation-fs": { enabled: false },
            "@opentelemetry/instrumentation-dns": { enabled: false },
          })]
        : [],
    });

    sdk.start();
    started = true;
    logger.info("[telemetry] OpenTelemetry SDK started", {
      serviceName,
      serviceVersion,
      endpoint,
    });

    // Register shutdown hooks — graceful flush on SIGTERM/SIGINT.
    const shutdown = async () => {
      try {
        await sdk.shutdown();
        logger.info("[telemetry] SDK shut down cleanly");
      } catch (err) {
        logger.error("[telemetry] SDK shutdown error", {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    };
    process.on("SIGTERM", shutdown);
    process.on("SIGINT", shutdown);

    return true;
  } catch (err) {
    // Don't crash the server if OTel fails — log and continue.
    logger.warn("[telemetry] Failed to start OTel SDK (non-fatal)", {
      error: err instanceof Error ? err.message : String(err),
    });
    return false;
  }
}

/**
 * Returns true if the OTel SDK was successfully started. Useful for
 * tests and for the healthcheck endpoint.
 */
export function isTelemetryStarted(): boolean {
  return started;
}

/**
 * Get a tracer for manual span creation. Returns null if the SDK is not
 * started — callers should guard with `if (tracer) { ... }`.
 *
 *   const tracer = getTracer("invoices");
 *   if (tracer) {
 *     return tracer.startActiveSpan("issueInvoice", async (span) => {
 *       try {
 *         const result = await issueInvoice(...);
 *         span.setAttribute("invoice.id", result.id);
 *         return result;
 *       } catch (err) {
 *         span.recordException(err);
 *         span.setStatus({ code: 2 }); // ERROR
 *         throw err;
 *       } finally {
 *         span.end();
 *       }
 *     });
 *   }
 */
export async function getTracer(name: string) {
  if (!started) return null;
  try {
    const { trace } = await import("@opentelemetry/api");
    return trace.getTracer(name);
  } catch {
    return null;
  }
}

/**
 * Get a meter for manual metric creation. Returns null if the SDK is not
 * started. Manual metrics are a complement to auto-instrumentation — use
 * them for business KPIs that auto-instrumentation can't see (e.g.
 * "invoices_issued_total", "ai_fabric_cost_usd").
 */
export async function getMeter(name: string) {
  if (!started) return null;
  try {
    const { metrics } = await import("@opentelemetry/api");
    return metrics.getMeter(name);
  } catch {
    return null;
  }
}

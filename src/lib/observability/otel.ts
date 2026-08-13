/**
 * src/lib/observability/otel.ts — P5-O1: OpenTelemetry SDK setup
 * P5-O1 FIX (Audit v2 · Phase 5)
 */
import { logger } from "@/lib/logger";

let initialized = false;

export function initOpenTelemetry(): void {
  if (initialized) return;
  const enabled = process.env.OTEL_ENABLED === "true" || process.env.NODE_ENV === "production";
  if (!enabled) {
    logger.info("[otel] disabled (set OTEL_ENABLED=true)");
    return;
  }
  // Dynamic import to avoid loading OTel deps in dev
  import("@opentelemetry/sdk-node").then(async ({ NodeSDK }) => {
    const { getNodeAutoInstrumentations } = await import("@opentelemetry/auto-instrumentations-node");
    const { OTLPTraceExporter } = await import("@opentelemetry/exporter-trace-otlp-http");
    const { OTLPMetricExporter } = await import("@opentelemetry/exporter-metrics-otlp-http");
    const { PeriodicExportingMetricReader } = await import("@opentelemetry/sdk-metrics");
    const { resourceFromAttributes } = await import("@opentelemetry/resources");
    const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT || "http://localhost:4318";
    const sdk = new NodeSDK({
      resource: resourceFromAttributes({ "service.name": "garfix" }),
      traceExporter: new OTLPTraceExporter({ url: `${endpoint}/v1/traces` }),
      metricReader: new PeriodicExportingMetricReader({
        exporter: new OTLPMetricExporter({ url: `${endpoint}/v1/metrics` }),
        exportIntervalMillis: 10000,
      }),
      instrumentations: [getNodeAutoInstrumentations({
        "@opentelemetry/instrumentation-fs": { enabled: false },
      })],
    });
    sdk.start();
    initialized = true;
    logger.info("[otel] started", { endpoint });
  }).catch((err) => {
    logger.warn("[otel] failed to start (deps not installed)", { err: String(err).slice(0, 100) });
  });
}

export async function shutdownOpenTelemetry(): Promise<void> {
  logger.info("[otel] shutdown");
}

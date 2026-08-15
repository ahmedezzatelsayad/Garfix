/**
 * src/lib/observability/otel.ts — Consolidated OpenTelemetry entry point.
 *
 * Previously this file had a separate, simpler OTel SDK setup that
 * overlapped with src/lib/telemetry-sdk.ts. The two have been consolidated:
 * telemetry-sdk.ts is the single source of truth (with BatchSpanProcessor,
 * shutdown hooks, getTracer/getMeter helpers, and better config).
 *
 * This file now re-exports from telemetry-sdk.ts so existing imports
 * (e.g. `import { initOpenTelemetry } from "@/lib/observability/otel"`)
 * continue to work without code changes at call sites.
 *
 * Migration: prefer importing from "@/lib/telemetry-sdk" directly.
 */
export { startTelemetry as initOpenTelemetry, shutdownTelemetry as shutdownOpenTelemetry, isTelemetryStarted } from "@/lib/telemetry-sdk";

/**
 * Graceful shutdown — delegates to telemetry-sdk.ts.
 * Note: the actual SDK shutdown is registered via process.on("SIGTERM")
 * inside startTelemetry(). This function is kept for any code that calls
 * it explicitly (e.g. graceful shutdown handlers in instrumentation.ts).
 */
export async function shutdownTelemetry(): Promise<void> {
  // The SDK shutdown is handled by the SIGTERM/SIGINT hooks registered
  // in startTelemetry(). This function is a no-op stub for backward compat.
}

/**
 * instrumentation.ts — Next.js Server Entry Point
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * NEXT.JS SPECIFIC: This file is automatically executed by Next.js when:
 *   - `next start` is called (production server starts)
 *   - The dev server initializes
 *
 * It does NOT run during `next build` — this is the critical distinction.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * KEY FIX (P0): All worker imports are now DYNAMIC inside register().
 * Static imports of bootstrap.ts caused Next.js to trace backup.ts,
 * backupWorker.ts, schedulerWorker.ts — all of which use node:fs/path.
 * This created Edge Runtime errors and NFT trace warnings during build.
 *
 * Dynamic imports inside register() only execute at server startup,
 * AFTER the build completes. This prevents Turbopack/Webpack from
 * tracing these Node-only modules during the build phase.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * RUNTIME FIX (deployment blocker): Next.js 16 compiles instrumentation.ts
 * for BOTH the Node.js runtime AND the Edge Runtime by default. The Edge
 * version pulls in Node-only modules (process.on, process.exit, node:fs,
 * node:crypto) through the import chain, creating an invalid Edge bundle
 * that Vercel rejects during deployment ("Deploying outputs..." hangs).
 *
 * Setting `runtime: "nodejs"` skips the Edge instrumentation bundle
 * entirely, eliminating all 25 Edge Runtime warnings and unblocking
 * deployment. This mirrors the same fix already applied to middleware.ts
 * (see SEC-M3 FIX in src/middleware.ts).
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { logger } from "@/lib/logger";

// Pin instrumentation to Node.js runtime only. Without this, Next.js 16
// also compiles an Edge Runtime variant of instrumentation.ts, which fails
// because register() uses process.on(), process.exit(), and dynamically
// imports Node-only modules (node:fs, node:crypto, node:child_process).
export const config = {
  runtime: "nodejs" as const,
};

/**
 * register — Called by Next.js on server startup.
 *
 * All runtime initialization is deferred to dynamic imports inside
 * this function to prevent build-time tracing of Node-only modules.
 */
export async function register(): Promise<void> {
  const startTime = Date.now();

  logger.info("[instrumentation] Server starting up...");

  // ── Edge Runtime short-circuit ─────────────────────────────────────────
  // When Turbopack compiles the Edge variant of instrumentation.ts (which
  // it does for static analysis even though `config.runtime = "nodejs"`),
  // process.env.NEXT_RUNTIME is replaced with the literal string "edge".
  // This branch becomes unreachable and Turbopack tree-shakes ALL the
  // dynamic imports below (bootstrap, outbox, telemetry, etc.) out of the
  // Edge bundle, eliminating all remaining Edge Runtime warnings.
  //
  // In the Node.js runtime, NEXT_RUNTIME === "nodejs" and we proceed
  // normally with full server initialization.
  if (process.env.NEXT_RUNTIME !== "nodejs") {
    logger.info("[instrumentation] Skipping server bootstrap (non-nodejs runtime)");
    return;
  }

  try {
    // ── Step 1: Database Initialization ──────────────────────────────────
    logger.info("[instrumentation] Initializing database connection...");
    const { initDb } = await import("@/lib/db");
    await initDb();

    // ── Step 2: Environment Validation ──────────────────────────────────
    logger.info("[instrumentation] Running environment checks...");
    const { runStartupChecks } = await import("@/lib/startupCheck");
    const startupResult = runStartupChecks();

    if (!startupResult.ok && startupResult.fatal.length > 0) {
      // Only throw in real production, not CI. Next.js `next start` forces
      // NODE_ENV=production, so CI environments (GITHUB_ACTIONS=true / CI=true)
      // that run `next start` would otherwise crash on placeholder secrets.
      const isRealProd = process.env.NODE_ENV === "production" && !process.env.CI && !process.env.GITHUB_ACTIONS;
      if (isRealProd) {
        logger.error("[instrumentation] FATAL: Environment check failed", {
          errors: startupResult.fatal,
        });
        throw new Error(`FATAL: ${startupResult.fatal.join("; ")}`);
      }
      logger.warn("[instrumentation] Continuing despite warnings in CI/test mode", {
        warnings: startupResult.fatal,
      });
    }

    if (startupResult.warnings.length > 0) {
      logger.warn("[instrumentation] Environment warnings", {
        warnings: startupResult.warnings,
      });
    }

    // ── Step 3: Bootstrap Queue Workers ───────────────────────────────────
    // Dynamic import prevents build-time tracing of Node-only worker modules
    logger.info("[instrumentation] Bootstrapping runtime services...");
    const { bootstrapRuntime } = await import("@/runtime/bootstrap");
    const bootstrapResult = await bootstrapRuntime();

    if (!bootstrapResult.success) {
      logger.error("[instrumentation] Runtime bootstrap completed with errors", {
        errors: bootstrapResult.errors,
      });
    } else {
      logger.info("[instrumentation] ✓ Runtime bootstrapped successfully", {
        workersRegistered: bootstrapResult.workersRegistered,
        jobsRecovered: bootstrapResult.jobsRecovered,
        durationMs: `${bootstrapResult.durationMs}ms`,
      });
    }

    // ── Step 3b: Start Outbox Relay (P1.1) ────────────────────────────────
    // Transactional outbox pattern — relays events appended inside Prisma
    // transactions into the events queue with at-least-once delivery.
    // See src/lib/outbox.ts for design rationale.
    try {
      const { startOutboxRelay } = await import("@/lib/outbox");
      startOutboxRelay();
      logger.info("[instrumentation] ✓ Outbox relay started");
    } catch (err) {
      logger.warn("[instrumentation] Outbox relay failed to start (non-fatal)", {
        error: err instanceof Error ? err.message : String(err),
      });
    }

    // ── Step 3c: Start OpenTelemetry SDK (P1.2) ───────────────────────────
    // Real OTel SDK with auto-instrumentations. Configured via standard
    // OTEL_* env vars (OTEL_EXPORTER_OTLP_ENDPOINT, OTEL_SERVICE_NAME, etc).
    // No-op if OTEL_EXPORTER_OTLP_ENDPOINT is unset (dev / test).
    // NOTE: imported from telemetry-sdk.ts (the real @opentelemetry/sdk-node
    // wrapper). The legacy telemetry.ts (hand-rolled metrics) is preserved
    // for backward compat with event-bus.ts.
    try {
      const { startTelemetry } = await import("@/lib/telemetry-sdk");
      await startTelemetry();
      logger.info("[instrumentation] ✓ OpenTelemetry SDK initialized");
    } catch (err) {
      logger.warn("[instrumentation] OpenTelemetry init failed (non-fatal)", {
        error: err instanceof Error ? err.message : String(err),
      });
    }

    // ── Step 3d: Load AI provider scoring state (P1.4) ────────────────────
    // Loads per-provider metrics + circuit breaker state from Valkey so
    // that circuit decisions are consistent across instances after a
    // restart. Non-fatal if Valkey is unavailable.
    try {
      const { loadProviderStateFromValkey } = await import("@/lib/ai-fabric/provider-scoring");
      await loadProviderStateFromValkey();
      logger.info("[instrumentation] ✓ AI provider scoring state loaded");
    } catch (err) {
      logger.warn("[instrumentation] AI provider scoring load failed (non-fatal)", {
        error: err instanceof Error ? err.message : String(err),
      });
    }

    // ── Step 3e: Start maintenance crons (P2.2 + P2.3) ───────────────────
    // Hourly session-registry sweep (deletes expired SessionRegistry rows
    // that isSessionValid() would never reach) + daily outbox purge
    // (deletes published outbox events older than 30 days). Both follow
    // the same setInterval+unref+run-guard pattern as the outbox relay.
    // See src/lib/maintenance-cron.ts for design rationale.
    try {
      const { startMaintenanceCrons } = await import("@/lib/maintenance-cron");
      startMaintenanceCrons();
      logger.info("[instrumentation] ✓ Maintenance crons started (session sweep hourly, outbox purge daily)");
    } catch (err) {
      logger.warn("[instrumentation] Maintenance crons failed to start (non-fatal)", {
        error: err instanceof Error ? err.message : String(err),
      });
    }

    // ── Step 4: Initialize Observability (Sprint 3) ────────────────────────
    logger.info("[instrumentation] Initializing observability services...");
    const { initTelemetry, shutdownTelemetry } = await import("@/lib/telemetry/tracing");
    const { initPubSub } = await import("@/lib/pubSub");
    await initTelemetry();
    await initPubSub();
    logger.info("[instrumentation] ✓ Observability services initialized");

    // ── Step 5: Process-Level Error Handlers + Graceful Shutdown ─────────
    // These use process.on() / process.exit() which are Node.js-only APIs.
    // Guard with NEXT_RUNTIME check so Turbopack doesn't trace them into
    // the Edge Runtime bundle (eliminates Edge Runtime warnings that were
    // blocking Vercel deployment).
    if (process.env.NEXT_RUNTIME === "nodejs") {
      const { setupProcessHandlers } = await import("@/lib/process-handlers");
      setupProcessHandlers(logger, async () => {
        // Graceful shutdown callback — mirrors the old inline shutdown logic
        try {
          shutdownTelemetry();
          const { shutdownAllBreakers } = await import("@/lib/circuit-breaker/circuit-breaker");
          shutdownAllBreakers();
          try {
            const { stopOutboxRelay } = await import("@/lib/outbox");
            stopOutboxRelay();
          } catch { /* best-effort */ }
          try {
            const { stopMaintenanceCrons } = await import("@/lib/maintenance-cron");
            stopMaintenanceCrons();
          } catch { /* best-effort */ }
          logger.info("[instrumentation] Graceful shutdown complete");
        } catch (err) {
          logger.error("[instrumentation] Error during shutdown", {
            error: err instanceof Error ? err.message : String(err),
          });
        }
      });
    } else {
      logger.info("[instrumentation] Skipping process handlers (non-nodejs runtime)");
    }

    // ── Step 6: Complete ────────────────────────────────────────────────
    const totalDuration = Date.now() - startTime;
    logger.info(`[instrumentation] ✓ Server ready (${totalDuration}ms)`);

  } catch (err) {
    const duration = Date.now() - startTime;
    logger.error("[instrumentation] ✗ Server startup failed", {
      error: err instanceof Error ? err.message : String(err),
      duration: `${duration}ms`,
    });
    throw err;
  }
}

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
 * ARCHITECTURE FIX (Vercel infinite-loading RCA):
 *
 * Previously `register()` awaited EVERY startup step sequentially:
 *   initDb → runStartupChecks → bootstrapRuntime → startOutboxRelay →
 *   startTelemetry → loadProviderStateFromValkey → startMaintenanceCrons →
 *   initTelemetry → initPubSub → setupProcessHandlers
 *
 * On Vercel serverless, `register()` runs on the FIRST request after a
 * cold start. If any of these steps was slow (Redis timeout, OTel exporter
 * hanging, AI provider state fetch), the FIRST user request waited for
 * ALL of them to complete — sometimes hitting Vercel's 10s function
 * timeout and showing the user an infinite loader.
 *
 * The fix splits startup into two tiers:
 *
 *   TIER 1 (blocking, awaited):
 *     - initDb() — required for any DB query
 *     - runStartupChecks() — fails fast on misconfig (missing secrets, etc.)
 *
 *   TIER 2 (background, fire-and-forget):
 *     - bootstrapRuntime() (queue workers — non-essential on first req)
 *     - startOutboxRelay() (best-effort, has retry)
 *     - startTelemetry() (no-op if OTEL_* env unset)
 *     - loadProviderStateFromValkey() (best-effort)
 *     - startMaintenanceCrons() (hourly sweep — not needed at req time)
 *     - initTelemetry() + initPubSub() (observability — not on req path)
 *     - setupProcessHandlers() (graceful shutdown wiring)
 *
 * Tier 2 tasks are launched via `deferBackgroundTasks()` which fires them
 * as detached promises. They start running immediately after `register()`
 * returns, on the same warm function instance. If the instance is frozen
 * before they complete, they'll either resume on the next request or be
 * lost — which is acceptable for all of them (they're all best-effort
 * with internal retry/resume logic).
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * RUNTIME FIX (deployment blocker): Next.js 16 compiles instrumentation.ts
 * for BOTH the Node.js runtime AND the Edge Runtime by default. Setting
 * `runtime: "nodejs"` skips the Edge instrumentation bundle entirely.
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
 * Returns as quickly as possible so the first user request is not blocked.
 * Only DB init + env validation are awaited; everything else is deferred
 * to background promises.
 */
export async function register(): Promise<void> {
  const startTime = Date.now();

  logger.info("[instrumentation] Server starting up...");

  // ── Edge Runtime short-circuit ─────────────────────────────────────────
  // When Turbopack compiles the Edge variant of instrumentation.ts, NEXT_RUNTIME
  // is "edge". Skip everything in that case.
  if (process.env.NEXT_RUNTIME !== "nodejs") {
    logger.info("[instrumentation] Skipping server bootstrap (non-nodejs runtime)");
    return;
  }

  try {
    // ── TIER 1: BLOCKING STARTUP ─────────────────────────────────────────
    // These MUST complete before any request can be served. Keep this list
    // as short as possible — every millisecond here delays the first user
    // request after a cold start.

    // 1a. Database Initialization — required for Prisma queries.
    logger.info("[instrumentation] Initializing database connection...");
    const { initDb } = await import("@/lib/db");
    await initDb();

    // 1b. Environment Validation — fails fast if secrets are missing.
    // Skip in CI/test (NODE_ENV=production is forced during `next start`
    // even in CI, so we guard explicitly).
    logger.info("[instrumentation] Running environment checks...");
    const { runStartupChecks } = await import("@/lib/startupCheck");
    const startupResult = runStartupChecks();

    if (!startupResult.ok && startupResult.fatal.length > 0) {
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

    const tier1Duration = Date.now() - startTime;
    logger.info(`[instrumentation] ✓ Tier-1 startup complete (${tier1Duration}ms) — serving requests`);

    // ── TIER 2: BACKGROUND TASKS (fire-and-forget) ──────────────────────
    // Launch these WITHOUT awaiting so register() returns immediately.
    // Each task catches its own errors so a failure in one doesn't kill
    // the others. They run on the same warm function instance; if the
    // instance is frozen before they complete, they're lost (acceptable
    // — all are best-effort with retry semantics).
    deferBackgroundTasks(startTime);
  } catch (err) {
    const duration = Date.now() - startTime;
    logger.error("[instrumentation] ✗ Server startup failed", {
      error: err instanceof Error ? err.message : String(err),
      duration: `${duration}ms`,
    });
    throw err;
  }
}

/**
 * Launch all background startup tasks as detached promises.
 *
 * Each task is wrapped in an async IIFE that catches its own errors so
 * a failure in one task doesn't prevent the others from running. None
 * of these are awaited — register() returns immediately after calling
 * this function.
 *
 * If the Vercel function instance is frozen before these complete, the
 * pending promises are simply lost. This is acceptable because:
 *   - All tasks have internal retry/resume logic
 *   - All tasks are non-critical for request serving
 *   - On the next request, the warm instance resumes and these will
 *     either complete (if they were mid-flight) or be re-launched
 *     (if register() runs again — though it typically only runs once
 *     per instance lifecycle)
 */
function deferBackgroundTasks(startTime: number): void {
  // We use Promise.resolve().then(...) rather than setImmediate(...) so
  // this works identically in Node.js and any future runtime that
  // might not expose setImmediate.
  Promise.resolve().then(async () => {
    // ── 2a. Bootstrap Queue Workers ─────────────────────────────────────
    try {
      const { bootstrapRuntime } = await import("@/runtime/bootstrap");
      const bootstrapResult = await bootstrapRuntime();
      if (!bootstrapResult.success) {
        logger.error("[instrumentation] Runtime bootstrap completed with errors", {
          errors: bootstrapResult.errors,
        });
      } else {
        logger.info("[instrumentation] ✓ Runtime bootstrapped", {
          workersRegistered: bootstrapResult.workersRegistered,
          jobsRecovered: bootstrapResult.jobsRecovered,
          durationMs: `${bootstrapResult.durationMs}ms`,
        });
      }
    } catch (err) {
      logger.warn("[instrumentation] Runtime bootstrap failed (non-fatal)", {
        error: err instanceof Error ? err.message : String(err),
      });
    }

    // ── 2b. Outbox Relay (P1.1) ─────────────────────────────────────────
    try {
      const { startOutboxRelay } = await import("@/lib/outbox");
      startOutboxRelay();
      logger.info("[instrumentation] ✓ Outbox relay started");
    } catch (err) {
      logger.warn("[instrumentation] Outbox relay failed to start (non-fatal)", {
        error: err instanceof Error ? err.message : String(err),
      });
    }

    // ── 2c. OpenTelemetry SDK (P1.2) ───────────────────────────────────
    try {
      const { startTelemetry } = await import("@/lib/telemetry-sdk");
      await startTelemetry();
      logger.info("[instrumentation] ✓ OpenTelemetry SDK initialized");
    } catch (err) {
      logger.warn("[instrumentation] OpenTelemetry init failed (non-fatal)", {
        error: err instanceof Error ? err.message : String(err),
      });
    }

    // ── 2d. AI Provider Scoring State (P1.4) ───────────────────────────
    try {
      const { loadProviderStateFromValkey } = await import("@/lib/ai-fabric/provider-scoring");
      await loadProviderStateFromValkey();
      logger.info("[instrumentation] ✓ AI provider scoring state loaded");
    } catch (err) {
      logger.warn("[instrumentation] AI provider scoring load failed (non-fatal)", {
        error: err instanceof Error ? err.message : String(err),
      });
    }

    // ── 2e. Maintenance Crons (P2.2 + P2.3) ────────────────────────────
    try {
      const { startMaintenanceCrons } = await import("@/lib/maintenance-cron");
      startMaintenanceCrons();
      logger.info("[instrumentation] ✓ Maintenance crons started (session sweep hourly, outbox purge daily)");
    } catch (err) {
      logger.warn("[instrumentation] Maintenance crons failed to start (non-fatal)", {
        error: err instanceof Error ? err.message : String(err),
      });
    }

    // ── 2f. Observability (Sprint 3) ───────────────────────────────────
    try {
      const { initTelemetry, shutdownTelemetry } = await import("@/lib/telemetry/tracing");
      const { initPubSub } = await import("@/lib/pubSub");
      await initTelemetry();
      await initPubSub();
      logger.info("[instrumentation] ✓ Observability services initialized");

      // ── 2g. Process-Level Error Handlers + Graceful Shutdown ─────────
      // Register handlers so SIGTERM/SIGINT trigger graceful shutdown.
      // These use process.on() — Node-only — but we already gated on
      // NEXT_RUNTIME === "nodejs" at the top of register().
      const { setupProcessHandlers } = await import("@/lib/process-handlers");
      setupProcessHandlers(logger, async () => {
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
    } catch (err) {
      logger.warn("[instrumentation] Observability init failed (non-fatal)", {
        error: err instanceof Error ? err.message : String(err),
      });
    }

    const totalDuration = Date.now() - startTime;
    logger.info(`[instrumentation] ✓ All background tasks launched (${totalDuration}ms total)`);
  }).catch((err) => {
    // Should never reach here — each block above has its own try/catch.
    // This is the outer safety net.
    logger.error("[instrumentation] Background startup promise rejected unexpectedly", {
      error: err instanceof Error ? err.message : String(err),
    });
  });
}

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
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { logger } from "@/lib/logger";

/**
 * register — Called by Next.js on server startup.
 *
 * All runtime initialization is deferred to dynamic imports inside
 * this function to prevent build-time tracing of Node-only modules.
 */
export async function register(): Promise<void> {
  const startTime = Date.now();

  logger.info("[instrumentation] Server starting up...");

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
      if (process.env.NODE_ENV === "production") {
        logger.error("[instrumentation] FATAL: Environment check failed", {
          errors: startupResult.fatal,
        });
        throw new Error(`FATAL: ${startupResult.fatal.join("; ")}`);
      }
      logger.warn("[instrumentation] Continuing despite warnings in development mode");
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

    // ── Step 4: Process-Level Error Handlers ─────────────────────────────
    process.on("uncaughtException", (error: Error) => {
      logger.error("[instrumentation] UNCAUGHT EXCEPTION", {
        error: error.message,
        stack: error.stack,
      });
      if (process.env.NODE_ENV === "production") {
        setTimeout(() => process.exit(1), 1000);
      }
    });

    process.on("unhandledRejection", (reason: unknown) => {
      logger.error("[instrumentation] UNHANDLED REJECTION", {
        reason: reason instanceof Error ? reason.message : String(reason),
      });
    });

    // ── Step 5: Graceful Shutdown Hooks ──────────────────────────────────
    const shutdown = async (signal: string): Promise<void> => {
      logger.info(`[instrumentation] Received ${signal}, initiating graceful shutdown...`);
      const shutdownTimeout = setTimeout(() => {
        logger.warn("[instrumentation] Forced shutdown after timeout");
        process.exit(1);
      }, 10000);
      try {
        logger.info("[instrumentation] Graceful shutdown complete");
      } catch (err) {
        logger.error("[instrumentation] Error during shutdown", {
          error: err instanceof Error ? err.message : String(err),
        });
      } finally {
        clearTimeout(shutdownTimeout);
        process.exit(0);
      }
    };

    process.on("SIGTERM", () => shutdown("SIGTERM"));
    process.on("SIGINT", () => shutdown("SIGINT"));

    // ── Complete ──────────────────────────────────────────────────────────
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

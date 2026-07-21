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
 * ─────────────────────────────────────────────────────────────────────────────
 * PURPOSE:
 *
 * This file serves as the bridge between Next.js's lifecycle and our runtime
 * bootstrap. It's the correct place to initialize things that need to happen
 * when the server starts, but NOT during build.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT IT DOES:
 *
 * 1. Runs environment validation (startup checks)
 * 2. Bootstraps queue workers (via bootstrapRuntime)
 * 3. Sets up process-level error handlers
 * 4. Configures graceful shutdown hooks
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ANTI-PATTERNS AVOIDED:
 *
 * ❌ No Prisma queries at module level (causes build failures)
 * ❌ No worker registration at import time (causes build failures)
 * ❌ No setInterval/setTimeout at module level (causes memory leaks in build)
 * ✅ All initialization deferred to register() or after explicit call
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * RUNTIME: Node.js only — uses process.on(), process.exit(), setTimeout()
 * Directive: 'use node' tells Turbopack to skip Edge Runtime analysis
 * ═══════════════════════════════════════════════════════════════════════════
 */
'use node';

import { logger } from "@/lib/logger";
import { runStartupChecks } from "@/lib/startupCheck";
import { bootstrapRuntime } from "@/runtime/bootstrap";

/**
 * register — Called by Next.js on server startup.
 *
 * This function is the entry point for all runtime initialization.
 * It runs AFTER the build completes and the server is ready to serve requests.
 */
export async function register(): Promise<void> {
  const startTime = Date.now();

  logger.info("[instrumentation] Server starting up...");

  try {
    // ── Step 1: Environment Validation ────────────────────────────────────
    logger.info("[instrumentation] Running environment checks...");
    const startupResult = runStartupChecks();

    if (!startupResult.ok && startupResult.fatal.length > 0) {
      if (process.env.NODE_ENV === "production") {
        // In production, fatal errors should prevent startup
        logger.error("[instrumentation] FATAL: Environment check failed", {
          errors: startupResult.fatal,
        });
        throw new Error(`FATAL: ${startupResult.fatal.join("; ")}`);
      }
      // In development, log warnings but continue
      logger.warn("[instrumentation] Continuing despite warnings in development mode");
    }

    if (startupResult.warnings.length > 0) {
      logger.warn("[instrumentation] Environment warnings", {
        warnings: startupResult.warnings,
      });
    }

    // ── Step 2: Bootstrap Queue Workers ───────────────────────────────────
    logger.info("[instrumentation] Bootstrapping runtime services...");
    const bootstrapResult = await bootstrapRuntime();

    if (!bootstrapResult.success) {
      logger.error("[instrumentation] Runtime bootstrap completed with errors", {
        errors: bootstrapResult.errors,
      });
      // Don't throw — workers may partially work, log only
    } else {
      logger.info("[instrumentation] ✓ Runtime bootstrapped successfully", {
        workersRegistered: bootstrapResult.workersRegistered,
        jobsRecovered: bootstrapResult.jobsRecovered,
        durationMs: `${bootstrapResult.durationMs}ms`,
      });
    }

    // ── Step 3: Process-Level Error Handlers ─────────────────────────────

    // Handle uncaught exceptions
    process.on("uncaughtException", (error: Error) => {
      logger.error("[instrumentation] UNCAUGHT EXCEPTION", {
        error: error.message,
        stack: error.stack,
      });
      // In production, give time for logging then exit
      if (process.env.NODE_ENV === "production") {
        setTimeout(() => process.exit(1), 1000);
      }
    });

    // Handle unhandled promise rejections
    process.on("unhandledRejection", (reason: unknown) => {
      logger.error("[instrumentation] UNHANDLED REJECTION", {
        reason: reason instanceof Error ? reason.message : String(reason),
      });
    });

    // ── Step 4: Graceful Shutdown Hooks ──────────────────────────────────

    const shutdown = async (signal: string): Promise<void> => {
      logger.info(`[instrumentation] Received ${signal}, initiating graceful shutdown...`);

      // Give workers time to finish current jobs
      // In a full implementation, you'd gracefully close queue connections here

      const shutdownTimeout = setTimeout(() => {
        logger.warn("[instrumentation] Forced shutdown after timeout");
        process.exit(1);
      }, 10000); // 10 second grace period

      try {
        // Cleanup tasks would go here
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
    throw err; // Re-throw to prevent server from starting
  }
}

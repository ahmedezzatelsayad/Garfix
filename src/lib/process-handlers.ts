/**
 * process-handlers.ts — Isolated Node.js process signal handlers.
 *
 * This module is dynamically imported by instrumentation.ts ONLY when
 * `process.env.NEXT_RUNTIME === "nodejs"`. Isolating these calls in a
 * separate module prevents Turbopack from tracing `process.on()` and
 * `process.exit()` into the Edge Runtime bundle, which was generating
 * warnings and blocking Vercel deployment.
 *
 * The module is NOT imported at the top level of instrumentation.ts —
 * it's loaded via `await import("@/lib/process-handlers")` inside a
 * NEXT_RUNTIME guard, so the Edge bundle never sees it.
 */

import { logger } from "./logger";

type Logger = typeof logger;

/**
 * Set up process-level error handlers and graceful shutdown hooks.
 *
 * @param logger The application logger instance.
 * @param gracefulShutdownCb Callback invoked on SIGTERM/SIGINT before
 *   force-exiting. Should stop background timers, flush queues, close
 *   connections, etc. If it throws, the error is logged but the process
 *   still exits.
 */
export function setupProcessHandlers(
  logger: Logger,
  gracefulShutdownCb: () => Promise<void>,
): void {
  // ── Uncaught Exception ──────────────────────────────────────────────
  process.on("uncaughtException", (error: Error) => {
    logger.error("[instrumentation] UNCAUGHT EXCEPTION", {
      error: error.message,
      stack: error.stack,
    });
    if (process.env.NODE_ENV === "production") {
      setTimeout(() => process.exit(1), 1000);
    }
  });

  // ── Unhandled Rejection ─────────────────────────────────────────────
  process.on("unhandledRejection", (reason: unknown) => {
    logger.error("[instrumentation] UNHANDLED REJECTION", {
      reason: reason instanceof Error ? reason.message : String(reason),
    });
  });

  // ── Graceful Shutdown (SIGTERM / SIGINT) ────────────────────────────
  const shutdown = async (signal: string): Promise<void> => {
    logger.info(`[instrumentation] Received ${signal}, initiating graceful shutdown...`);
    const shutdownTimeout = setTimeout(() => {
      logger.warn("[instrumentation] Forced shutdown after timeout");
      process.exit(1);
    }, 10000);
    try {
      await gracefulShutdownCb();
    } finally {
      clearTimeout(shutdownTimeout);
      process.exit(0);
    }
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

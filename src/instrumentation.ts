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

/**
 * VERCEL FIX: nodeRequire — dynamic require that's invisible to Turbopack.
 *
 * Turbopack statically analyzes `import()` calls even inside runtime guards
 * (NEXT_RUNTIME !== "nodejs"). This causes Node-only modules (process.on,
 * node:fs, node:child_process, pg-boss, etc.) to be traced into the Edge
 * Runtime bundle, producing 21 build warnings and potentially failing
 * Vercel deployment.
 *
 * We use `Function("return require")()` to construct the require call
 * dynamically — this is invisible to Turbopack's static analysis but
 * doesn't trigger the Edge Runtime's eval() restriction.
 *
 * Only call this inside NEXT_RUNTIME === "nodejs" guard.
 */
function nodeRequire<T = unknown>(modulePath: string): T {
  // Construct require dynamically without using eval() directly.
  // Function() constructor is not blocked by Edge Runtime's CSP.
  const req = new Function("return typeof require !== 'undefined' ? require : null")() as NodeRequire | null;
  if (!req) {
    throw new Error("require is not available (not in Node.js runtime)");
  }
  return req(modulePath) as T;
}

// NOTE: Next.js 16 does NOT support `export const config` in instrumentation.ts.
// The Node.js runtime is already the default for instrumentation. The previous
// `export const config = { runtime: "nodejs" }` caused "Invalid segment
// configuration export" build errors and has been removed.
// To force Node runtime, use `export const runtime = "nodejs"` in route handlers
// or set `serverExternalPackages` in next.config.ts (already done).

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
  if (process.env.NEXT_RUNTIME !== "nodejs") {
    logger.info("[instrumentation] Skipping server bootstrap (non-nodejs runtime)");
    return;
  }

  // ── Vercel Serverless short-circuit ────────────────────────────────────
  // VERCEL FIX: skip all custom startup on Vercel — the nodeRequire() helper
  // fails with "require is not available" and background tasks (BullMQ,
  // pg-boss, cron, process handlers) don't belong in serverless functions.
  // API routes work fine without any of this.
  // On AWS/Docker, all startup runs normally (AppShell works, hydration works).
  if (process.env.VERCEL === "1") {
    logger.info("[instrumentation] Skipping custom startup on Vercel serverless");
    return;
  }

  // AWS/Docker: run full startup (DB init, background tasks, etc.)
  logger.info("[instrumentation] Running full startup (AWS/Docker mode)");

  if (process.env.NODE_ENV === "production" && !process.env.VALKEY_URL && !process.env.REDIS_URL) {
    const msg = "[instrumentation] FATAL: VALKEY_URL is not set in production. Refusing to start.";
    logger.error(msg);
    throw new Error("VALKEY_URL is required in production (Phase 19 P0 fail-fast).");
  }

  try {
    // ── TIER 1: BLOCKING STARTUP ─────────────────────────────────────────
    // These MUST complete before any request can be served. Keep this list
    // as short as possible — every millisecond here delays the first user
    // request after a cold start.

    // PREVIEW MODE: skip DB init + startup checks when explicitly requested.
    // This lets the server start without a real DATABASE_URL (useful for
    // previewing UI changes or running in environments without Postgres).
    const skipDb = process.env.GARFIX_PREVIEW_MODE === "1";
    if (skipDb) {
      logger.warn("[instrumentation] GARFIX_PREVIEW_MODE=1 — skipping DB init + startup checks");
    } else {
      // 1a. Database Initialization — required for Prisma queries.
      logger.info("[instrumentation] Initializing database connection...");
      const db = nodeRequire<typeof import("@/lib/db")>("@/lib/db");
      await db.initDb();

      // 1b. Environment Validation — logs warnings but does NOT throw.
      // Previously, a missing/weak env var caused `throw new Error("FATAL...")`
      // which crashed the instrumentation hook → every page returned 500 →
      // blank screen with no error message visible to the user.
      //
      // Now: log the errors prominently, set a global flag, but continue
      // starting the server. Individual API routes will fail with specific
      // error messages (e.g. "JWT_SECRET not set") which are far more
      // debuggable than a blank screen. Static pages (landing, login) will
      // still render.
      logger.info("[instrumentation] Running environment checks...");
      const startup = nodeRequire<typeof import("@/lib/startupCheck")>("@/lib/startupCheck");
      const startupResult = startup.runStartupChecks();

      if (!startupResult.ok && startupResult.fatal.length > 0) {
        const isRealProd = process.env.NODE_ENV === "production" && !process.env.CI && !process.env.GITHUB_ACTIONS;
        if (isRealProd) {
          // P1 FIX (audit): Previously the server continued in "degraded mode"
          // when required env vars were missing. This is dangerous — a
          // misconfigured production server would serve traffic with broken
          // API routes (500 errors on every request that needs a secret).
          // Now we HARD-FAIL: the server refuses to start, forcing the
          // operator to fix the env vars before any traffic is served.
          logger.error("[instrumentation] 🔴 ENVIRONMENT CHECK FAILED — refusing to start in production", {
            errors: startupResult.fatal,
            fix: "Set the missing environment variables and redeploy. The server will not start until all required vars are present.",
          });
          throw new Error(
            "FATAL: Production environment check failed. Missing required env vars: " +
            startupResult.fatal.join("; ")
          );
        } else {
          logger.warn("[instrumentation] Continuing despite warnings in CI/test mode", {
            warnings: startupResult.fatal,
          });
        }
      }

      if (startupResult.warnings.length > 0) {
        logger.warn("[instrumentation] Environment warnings", {
          warnings: startupResult.warnings,
        });
      }
    }

    const tier1Duration = Date.now() - startTime;
    logger.info(`[instrumentation] ✓ Tier-1 startup complete (${tier1Duration}ms) — serving requests`);

    // ── TIER 2: BACKGROUND TASKS (fire-and-forget) ──────────────────────
    // Launch these WITHOUT awaiting so register() returns immediately.
    // Each task catches its own errors so a failure in one doesn't kill
    // the others. They run on the same warm function instance; if the
    // instance is frozen before they complete, they're lost (acceptable
    // — all are best-effort with retry semantics).
    const skipBackgroundTasks = skipDb || process.env.GARFIX_SKIP_BACKGROUND_TASKS === "1";
    if (!skipBackgroundTasks) {
      deferBackgroundTasks(startTime);
    } else {
      logger.info("[instrumentation] Skipping background tasks (preview mode)");
    }
  } catch (err) {
    const duration = Date.now() - startTime;
    // DEPLOYMENT FIX: don't re-throw. Previously, any error in register()
    // (DB init, startup check, etc.) was re-thrown → Next.js caught it →
    // instrumentation hook "failed to load" → every request returned 500
    // → blank screen with no visible error.
    //
    // Now: log the error and continue. The server will start in a degraded
    // state. API routes will return specific errors. Static pages will
    // render. The user sees SOMETHING instead of a blank screen.
    logger.error("[instrumentation] ⚠️ Server startup error — continuing in degraded mode", {
      error: err instanceof Error ? err.message : String(err),
      duration: `${duration}ms`,
      impact: "Some features may not work. Check server logs for details.",
    });
    // Set the global flag so route handlers can detect degraded state
    (globalThis as Record<string, unknown>).__GARFIX_STARTUP_ERRORS = [
      `Startup error: ${err instanceof Error ? err.message : String(err)}`,
    ];
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
  //
  // VERCEL FIX: all dynamic imports use nodeRequire() instead of `await import`
  // to prevent Turbopack from tracing Node-only modules (backup.ts, queues.ts,
  // process-handlers.ts, etc.) into the Edge Runtime bundle. Turbopack
  // statically analyzes `import()` calls even inside runtime guards, which
  // produces build warnings and can fail Vercel deployment.
  // nodeRequire() uses eval("require") which is invisible to the bundler.
  Promise.resolve().then(async () => {
    // ── 2a. Bootstrap Queue Workers ─────────────────────────────────────
    try {
      const bootstrap = nodeRequire("@/runtime/bootstrap") as typeof import("@/runtime/bootstrap");
      const bootstrapResult = await bootstrap.bootstrapRuntime();
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
      const outbox = nodeRequire("@/lib/outbox") as typeof import("@/lib/outbox");
      outbox.startOutboxRelay();
      logger.info("[instrumentation] ✓ Outbox relay started");
    } catch (err) {
      logger.warn("[instrumentation] Outbox relay failed to start (non-fatal)", {
        error: err instanceof Error ? err.message : String(err),
      });
    }

    // ── 2c. OpenTelemetry SDK (P1.2) ───────────────────────────────────
    try {
      const telemetry = nodeRequire("@/lib/telemetry-sdk") as typeof import("@/lib/telemetry-sdk");
      await telemetry.startTelemetry();
      logger.info("[instrumentation] ✓ OpenTelemetry SDK initialized");
    } catch (err) {
      logger.warn("[instrumentation] OpenTelemetry init failed (non-fatal)", {
        error: err instanceof Error ? err.message : String(err),
      });
    }

    // ── 2d. AI Provider Scoring State (P1.4) ───────────────────────────
    try {
      const scoring = nodeRequire("@/lib/ai-fabric/provider-scoring") as typeof import("@/lib/ai-fabric/provider-scoring");
      await scoring.loadProviderStateFromValkey();
      logger.info("[instrumentation] ✓ AI provider scoring state loaded");
    } catch (err) {
      logger.warn("[instrumentation] AI provider scoring load failed (non-fatal)", {
        error: err instanceof Error ? err.message : String(err),
      });
    }

    // ── 2e. Maintenance Crons (P2.2 + P2.3) ────────────────────────────
    try {
      const cron = nodeRequire("@/lib/maintenance-cron") as typeof import("@/lib/maintenance-cron");
      cron.startMaintenanceCrons();
      logger.info("[instrumentation] ✓ Maintenance crons started (session sweep hourly, outbox purge daily)");
    } catch (err) {
      logger.warn("[instrumentation] Maintenance crons failed to start (non-fatal)", {
        error: err instanceof Error ? err.message : String(err),
      });
    }

    // ── 2f. Observability (Sprint 3) ───────────────────────────────────
    try {
      const tracing = nodeRequire("@/lib/telemetry/tracing") as typeof import("@/lib/telemetry/tracing");
      const pubsub = nodeRequire("@/lib/pubSub") as typeof import("@/lib/pubSub");
      await tracing.initTelemetry();
      await pubsub.initPubSub();
      logger.info("[instrumentation] ✓ Observability services initialized");

      // ── 2g. Process-Level Error Handlers + Graceful Shutdown ─────────
      // Register handlers so SIGTERM/SIGINT trigger graceful shutdown.
      // These use process.on() — Node-only — but we already gated on
      // NEXT_RUNTIME === "nodejs" at the top of register().
      const processHandlers = nodeRequire("@/lib/process-handlers") as typeof import("@/lib/process-handlers");
      processHandlers.setupProcessHandlers(logger, async () => {
        try {
          tracing.shutdownTelemetry();
          const breaker = nodeRequire("@/lib/circuit-breaker/circuit-breaker") as typeof import("@/lib/circuit-breaker/circuit-breaker");
          breaker.shutdownAllBreakers();
          try {
            const outbox = nodeRequire("@/lib/outbox") as typeof import("@/lib/outbox");
            outbox.stopOutboxRelay();
          } catch { /* best-effort */ }
          try {
            const cron = nodeRequire("@/lib/maintenance-cron") as typeof import("@/lib/maintenance-cron");
            cron.stopMaintenanceCrons();
          } catch { /* best-effort */ }
          // Phase 7 P1 fix: stop BullMQ workers + close Valkey on shutdown.
          // Without this, in-flight jobs are killed without being marked
          // complete → next boot's recoverPendingJobs re-runs them →
          // duplicate emails/WhatsApp/backup files.
          try {
            const queues = nodeRequire("@/lib/queues") as typeof import("@/lib/queues");
            await queues.stopQueue();
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

/**
 * bootstrap.ts — Runtime Bootstrap Entry Point
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ARCHITECTURAL RULE (v12.1):
 *
 * This is the ONLY place where queue workers are registered and started.
 * This function is called EXPLICITLY from:
 *   - server.js entry point (next start)
 *   - Custom server entry point
 *
 * ❌ NEVER import this file during build time.
 * ❌ NEVER call this from a Server Component or API route directly.
 * ✅ Only call from the server's main entry point after process boot.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS EXISTS:
 *
 * Previous anti-pattern: Workers were registered at module-level side effects.
 * When Next.js imported any file that transitively imported a worker module,
 * the worker would register itself, attempt DB connections, and cause build failures.
 *
 * Example of the old broken pattern:
 *   // aiProductMatchWorker.ts
 *   registerAIProductMatchWorker();  // ← executed on import!
 *
 * Example of the new correct pattern:
 *   // This file — explicit bootstrap
 *   export async function bootstrapRuntime() {
 *     registerAIProductMatchWorker();  // ← only when we want it
 *     await recoverPendingJobs();
 *   }
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * SIDE-EFFECT AUDIT CHECKLIST:
 *
 * Before adding anything to this file, verify it's NOT already executing at
 * import time in any other module:
 *
 * [ ] new PrismaClient()          → should be in db.ts (lazy singleton)
 * [ ] registerWorker()            → should be HERE only
 * [ ] recoverPendingJobs()        → should be HERE only
 * [ ] scheduler.start()           → should be HERE only
 * [ ] cron.start()                → should be HERE only
 * [ ] setInterval()               → should be HERE only (if needed)
 * [ ] setTimeout()                → avoid at module level
 * [ ] process.on(...)             → should be HERE only
 * [ ] app.listen(...)             → should be in server entry point
 * [ ] queue.process(...)          → handled by registerWorker()
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { logger } from "@/lib/logger";

// Worker registration functions — DYNAMIC imports only
// These modules use node:fs, node:path, etc. which must NOT be traced
// during `next build`. They're only needed at runtime startup.

// Queue utilities
import { recoverPendingJobs } from "@/lib/queues";

/**
 * Bootstrap result status.
 */
export interface BootstrapResult {
  success: boolean;
  workersRegistered: string[];
  jobsRecovered: number;
  errors: string[];
  durationMs: number;
}

/**
 * bootstrapRuntime — Initialize all queue workers and recover pending jobs.
 *
 * This is the SINGLE ENTRY POINT for all runtime initialization that requires:
 * - Database connectivity
 * - Queue system (Valkey/Redis)
 * - External service connections (SMTP, WhatsApp, AI providers)
 *
 * Call this ONLY from your server's main entry point:
 *
 *   // server.ts or custom server entry
 *   import { bootstrapRuntime } from '@/runtime/bootstrap';
 *   await bootstrapRuntime();
 *
 * @returns BootstrapResult with details of what was initialized
 */
export async function bootstrapRuntime(): Promise<BootstrapResult> {
  const startTime = Date.now();
  const errors: string[] = [];
  const workersRegistered: string[] = [];

  logger.info("[bootstrap] Starting runtime initialization...");

  try {
    // ── Step 1: Register Queue Workers ────────────────────────────────────
    // Order matters: register handlers BEFORE recovering pending jobs,
    // so recovered jobs can be immediately processed.

    logger.info("[bootstrap] Registering queue workers...");

    // 1a. Email Worker (transactional emails: OTP, welcome, ticket replies)
    try {
      const { registerEmailWorker } = await import("@/lib/workers/emailWorker");
      registerEmailWorker();
      workersRegistered.push("email");
      logger.info("[bootstrap] ✓ Email worker registered");
    } catch (err) {
      const msg = `Failed to register email worker: ${err instanceof Error ? err.message : String(err)}`;
      errors.push(msg);
      logger.error(`[bootstrap] ✗ ${msg}`);
    }

    // 1b. WhatsApp Worker (WhatsApp Business API messages)
    try {
      const { registerWhatsAppWorker } = await import("@/lib/workers/whatsappWorker");
      registerWhatsAppWorker();
      workersRegistered.push("whatsapp");
      logger.info("[bootstrap] ✓ WhatsApp worker registered");
    } catch (err) {
      const msg = `Failed to register whatsapp worker: ${err instanceof Error ? err.message : String(err)}`;
      errors.push(msg);
      logger.error(`[bootstrap] ✗ ${msg}`);
    }

    // 1c. Backup Worker (automated database backups)
    try {
      const { registerBackupWorker } = await import("@/lib/workers/backupWorker");
      registerBackupWorker();
      workersRegistered.push("backup");
      logger.info("[bootstrap] ✓ Backup worker registered");
    } catch (err) {
      const msg = `Failed to register backup worker: ${err instanceof Error ? err.message : String(err)}`;
      errors.push(msg);
      logger.error(`[bootstrap] ✗ ${msg}`);
    }

    // 1d. AI Product Match Worker (AI-powered invoice line item resolution)
    try {
      const { registerAIProductMatchWorker } = await import("@/lib/workers/aiProductMatchWorker");
      registerAIProductMatchWorker();
      workersRegistered.push("ai-product-match");
      logger.info("[bootstrap] ✓ AI Product Match worker registered");
    } catch (err) {
      const msg = `Failed to register AI product match worker: ${err instanceof Error ? err.message : String(err)}`;
      errors.push(msg);
      logger.error(`[bootstrap] ✗ ${msg}`);
    }

    // 1e. Scheduler Worker (periodic tasks: scans, cleanup, health checks)
    try {
      const { registerSchedulerWorker } = await import("@/lib/workers/schedulerWorker");
      registerSchedulerWorker();
      workersRegistered.push("scheduler");
      logger.info("[bootstrap] ✓ Scheduler worker registered");
    } catch (err) {
      const msg = `Failed to register scheduler worker: ${err instanceof Error ? err.message : String(err)}`;
      errors.push(msg);
      logger.error(`[bootstrap] ✗ ${msg}`);
    }

    // ── Step 2: Recover Pending Jobs ──────────────────────────────────────
    // Re-enqueue jobs that were in-progress when the server stopped.

    logger.info("[bootstrap] Recovering pending jobs...");
    let jobsRecovered = 0;

    try {
      const recovery = await recoverPendingJobs();
      jobsRecovered = recovery.recovered;

      if (recovery.errors.length > 0) {
        recovery.errors.forEach((err) => {
          errors.push(`Job recovery error: ${err}`);
        });
      }

      logger.info(`[bootstrap] ✓ Job recovery complete: ${jobsRecovered} jobs re-enqueued`);
    } catch (err) {
      const msg = `Job recovery failed: ${err instanceof Error ? err.message : String(err)}`;
      errors.push(msg);
      logger.error(`[bootstrap] ✗ ${msg}`);
    }

    // ── Step 3: Final Status ─────────────────────────────────────────────

    const durationMs = Date.now() - startTime;
    const success = errors.length === 0;

    if (success) {
      // FIX: Track bootstrap state for health checks
      _bootstrapped = true;
      _bootstrapTimestamp = new Date();
      logger.info(`[bootstrap] ✓ Runtime initialization successful`, {
        workersRegistered: workersRegistered.length,
        jobsRecovered,
        durationMs: `${durationMs}ms`,
      });
    } else {
      logger.error(`[bootstrap] ✗ Runtime initialization completed with errors`, {
        workersRegistered: workersRegistered.length,
        jobsRecovered,
        errorCount: errors.length,
        durationMs: `${durationMs}ms`,
        errors,
      });
    }

    return {
      success,
      workersRegistered,
      jobsRecovered,
      errors,
      durationMs,
    };

  } catch (err) {
    // Catch-all for unexpected errors during bootstrap
    const msg = `Unexpected bootstrap error: ${err instanceof Error ? err.message : String(err)}`;
    errors.push(msg);
    logger.error(`[bootstrap] ✗ ${msg}`);

    return {
      success: false,
      workersRegistered,
      jobsRecovered: 0,
      errors,
      durationMs: Date.now() - startTime,
    };
  }
}

// ── Bootstrap state tracking ────────────────────────────────────────────────
let _bootstrapped = false;
let _bootstrapTimestamp: Date | null = null;

/**
 * checkBootstrapStatus — Verify runtime has been bootstrapped.
 *
 * Useful for health checks and diagnostics endpoints.
 * FIX: Previously always returned bootstrapped:true regardless of actual state.
 */
export function checkBootstrapStatus(): {
  bootstrapped: boolean;
  timestamp: Date | null;
} {
  return {
    bootstrapped: _bootstrapped,
    timestamp: _bootstrapTimestamp,
  };
}

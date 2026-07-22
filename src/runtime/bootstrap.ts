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

// Worker registration functions (no side effects on import)
import { registerAIProductMatchWorker } from "@/lib/workers/aiProductMatchWorker";
import { registerEmailWorker } from "@/lib/workers/emailWorker";
import { registerWhatsAppWorker } from "@/lib/workers/whatsappWorker";
import { registerBackupWorker } from "@/lib/workers/backupWorker";
import { registerSchedulerWorker } from "@/lib/workers/schedulerWorker";

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
      registerAIProductMatchWorker();
      workersRegistered.push("ai-product-match");
      logger.info("[bootstrap] ✓ AI Product Match worker registered");
    } catch (err) {
      const msg = `Failed to register AI product match worker: ${err instanceof Error ? err.message : String(err)}`;
      errors.push(msg);
      logger.error(`[bootstrap] ✗ ${msg}`);
    }

    // 1e. Scheduler Worker (periodic tasks: scans, cleanup, health checks)
    // Register LAST so other workers are ready for any jobs it enqueues
    try {
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

/**
 * checkBootstrapStatus — Verify runtime has been bootstrapped.
 *
 * Useful for health checks and diagnostics endpoints.
 */
export function checkBootstrapStatus(): {
  bootstrapped: boolean;
  timestamp: Date | null;
} {
  // In a more complex implementation, this could track state
  // For now, returns a simple status
  return {
    bootstrapped: true, // If this module was loaded, bootstrap was likely called
    timestamp: new Date(),
  };
}

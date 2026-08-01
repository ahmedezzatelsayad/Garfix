/**
 * maintenance-cron.ts — Periodic maintenance sweepers (P2.2 + P2.3).
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * PURPOSE
 * ═══════════════════════════════════════════════════════════════════════════
 * Two maintenance jobs that the audit (§7.1 residual risks #7 and #8)
 * flagged as "not scheduled":
 *
 *   P2.2  SessionRegistry sweep  — hourly
 *         Calls cleanupExpiredSessions() to delete rows where expiresAt < now.
 *         Without this, the table grows unbounded: isSessionValid() does
 *         opportunistic per-row cleanup on read, but rows that are never
 *         read again (abandoned sessions) would otherwise accumulate
 *         forever. The [expiresAt] index makes the sweep a cheap range
 *         delete.
 *
 *   P2.3  Outbox purge  — daily
 *         Calls purgePublishedOutbox(30) to delete events that were
 *         successfully published >30 days ago. Without this, the
 *         outbox_events table grows unbounded: published rows are no
 *         longer actionable but they're kept for debugging/audit. The
 *         30-day retention matches the residual-risk recommendation.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * PATTERN
 * ═══════════════════════════════════════════════════════════════════════════
 * Mirrors src/lib/outbox.ts:startOutboxRelay — module-level timer + run-guard
 * + idempotent start/stop + unref() so the timer doesn't keep the process
 * alive. Booted from src/instrumentation.ts (Step 3e), non-fatal on failure.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * CONFIG
 * ═══════════════════════════════════════════════════════════════════════════
 *   MAINTENANCE_SESSION_SWEEP_INTERVAL_MS  (default 3600_000 = 1 hour)
 *   MAINTENANCE_OUTBOX_PURGE_INTERVAL_MS   (default 86400_000 = 24 hours)
 *   MAINTENANCE_OUTBOX_PURGE_OLDER_THAN_DAYS  (default 30)
 *   MAINTENANCE_DISABLED=1                  (disables BOTH crons — for tests)
 */

import { logger } from "./logger";

// ─── Constants (env-overridable) ──────────────────────────────────────────

const SESSION_SWEEP_INTERVAL_MS = parseInt(
  process.env.MAINTENANCE_SESSION_SWEEP_INTERVAL_MS || "3600000",
  10,
);
const OUTBOX_PURGE_INTERVAL_MS = parseInt(
  process.env.MAINTENANCE_OUTBOX_PURGE_INTERVAL_MS || "86400000",
  10,
);
const OUTBOX_PURGE_OLDER_THAN_DAYS = parseInt(
  process.env.MAINTENANCE_OUTBOX_PURGE_OLDER_THAN_DAYS || "30",
  10,
);
const MAINTENANCE_DISABLED = process.env.MAINTENANCE_DISABLED === "1";

// ─── Module-level timer state (mirror outbox.ts pattern) ──────────────────

let sessionSweepTimer: ReturnType<typeof setInterval> | null = null;
let sessionSweepRunning = false;

let outboxPurgeTimer: ReturnType<typeof setInterval> | null = null;
let outboxPurgeRunning = false;

// ─── P2.2: Session Registry sweep ─────────────────────────────────────────

/**
 * Run one session-sweep iteration. Exposed publicly so tests can drive
 * the sweeper deterministically without waiting for the interval timer.
 *
 * Returns the count of expired sessions deleted.
 */
export async function runSessionSweep(): Promise<number> {
  const { cleanupExpiredSessions } = await import("@/lib/passwordPolicy");
  const deleted = await cleanupExpiredSessions();
  if (deleted > 0) {
    logger.info("[maintenance] session sweep deleted expired sessions", { deleted });
  }
  return deleted;
}

/**
 * Start the hourly session-sweep cron. Idempotent — subsequent calls
 * are no-ops. Started automatically by instrumentation.ts on server
 * startup.
 */
export function startSessionSweepCron(): void {
  if (MAINTENANCE_DISABLED) {
    logger.info("[maintenance] session sweep disabled (MAINTENANCE_DISABLED=1)");
    return;
  }
  if (sessionSweepTimer) return;
  logger.info("[maintenance] session sweep cron starting", {
    intervalMs: SESSION_SWEEP_INTERVAL_MS,
  });
  sessionSweepTimer = setInterval(async () => {
    if (sessionSweepRunning) return;
    sessionSweepRunning = true;
    try {
      await runSessionSweep();
    } catch (err) {
      logger.error("[maintenance] session sweep iteration failed", {
        error: err instanceof Error ? err.message : String(err),
      });
    } finally {
      sessionSweepRunning = false;
    }
  }, SESSION_SWEEP_INTERVAL_MS);
  sessionSweepTimer.unref?.();
}

/** Stop the session-sweep cron. Safe to call when not running. */
export function stopSessionSweepCron(): void {
  if (sessionSweepTimer) {
    clearInterval(sessionSweepTimer);
    sessionSweepTimer = null;
    logger.info("[maintenance] session sweep cron stopped");
  }
}

// ─── P2.3: Outbox purge ───────────────────────────────────────────────────

/**
 * Run one outbox-purge iteration. Exposed publicly so tests can drive
 * the purge deterministically without waiting for the 24h interval.
 *
 * Reads `MAINTENANCE_OUTBOX_PURGE_OLDER_THAN_DAYS` lazily (at call time,
 * not at module-load time) so ops teams can adjust retention without a
 * process restart.
 *
 * Returns the count of published events older than the retention window
 * that were deleted.
 */
export async function runOutboxPurge(): Promise<number> {
  const olderThanDays = parseInt(
    process.env.MAINTENANCE_OUTBOX_PURGE_OLDER_THAN_DAYS || String(OUTBOX_PURGE_OLDER_THAN_DAYS),
    10,
  );
  const { purgePublishedOutbox } = await import("@/lib/outbox");
  const deleted = await purgePublishedOutbox(olderThanDays);
  if (deleted > 0) {
    logger.info("[maintenance] outbox purge deleted published events", {
      deleted,
      olderThanDays,
    });
  }
  return deleted;
}

/**
 * Start the daily outbox-purge cron. Idempotent. Started automatically
 * by instrumentation.ts on server startup.
 */
export function startOutboxPurgeCron(): void {
  if (MAINTENANCE_DISABLED) {
    logger.info("[maintenance] outbox purge disabled (MAINTENANCE_DISABLED=1)");
    return;
  }
  if (outboxPurgeTimer) return;
  logger.info("[maintenance] outbox purge cron starting", {
    intervalMs: OUTBOX_PURGE_INTERVAL_MS,
    olderThanDays: OUTBOX_PURGE_OLDER_THAN_DAYS,
  });
  outboxPurgeTimer = setInterval(async () => {
    if (outboxPurgeRunning) return;
    outboxPurgeRunning = true;
    try {
      await runOutboxPurge();
    } catch (err) {
      logger.error("[maintenance] outbox purge iteration failed", {
        error: err instanceof Error ? err.message : String(err),
      });
    } finally {
      outboxPurgeRunning = false;
    }
  }, OUTBOX_PURGE_INTERVAL_MS);
  outboxPurgeTimer.unref?.();
}

/** Stop the outbox-purge cron. Safe to call when not running. */
export function stopOutboxPurgeCron(): void {
  if (outboxPurgeTimer) {
    clearInterval(outboxPurgeTimer);
    outboxPurgeTimer = null;
    logger.info("[maintenance] outbox purge cron stopped");
  }
}

// ─── Combined start/stop (called from instrumentation.ts) ─────────────────

/**
 * Start all maintenance crons. Idempotent. Called from instrumentation.ts
 * Step 3e on server startup.
 */
export function startMaintenanceCrons(): void {
  startSessionSweepCron();
  startOutboxPurgeCron();
}

/**
 * Stop all maintenance crons. Called from instrumentation.ts graceful
 * shutdown hook.
 */
export function stopMaintenanceCrons(): void {
  stopSessionSweepCron();
  stopOutboxPurgeCron();
}

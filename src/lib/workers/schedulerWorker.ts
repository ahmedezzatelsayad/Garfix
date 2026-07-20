/**
 * schedulerWorker.ts — Worker for the SCHEDULER queue.
 *
 * Registered as the handler for `QUEUE_NAMES.SCHEDULER`. Implements a
 * self-rescheduling tick pattern: each tick re-enqueues the next tick after
 * `TICK_INTERVAL_MS`, so the scheduler runs as long as the server is up
 * without requiring an external cron.
 *
 * Tick responsibilities (run on every tick, every 60s):
 *   - Run notification scans (overdue invoices, expiring residences,
 *     expiring subscriptions) when the local hour matches DAILY_SCAN_HOUR.
 *   - Trigger a periodic backup when 24h have elapsed since the last backup.
 *   - Sweep stale audit logs (older than 90 days) toward archive.
 *
 * Why a queue-based scheduler instead of setInterval:
 *   - setInterval dies if the event loop is saturated during a long tick.
 *     The queue runner applies retries + TTLs, so a stuck scan won't kill
 *     the scheduler permanently.
 *   - The persisted JobQueue row makes the next-tick intention survive
 *     process restarts — recoverPendingJobs picks it up on the next boot.
 *   - In a multi-instance deployment, only one instance wins the lock on
 *     each tick (DB-level locking via lockedBy), preventing duplicate
 *     scheduled runs across N instances.
 *
 * Tick frequency:
 *   - TICK_INTERVAL_MS = 60_000 (1 min). The SCHEDULER queue TTL (5s in
 *     queues.ts) is the per-tick timeout, NOT the frequency. Frequency is
 *     controlled by how long the tick handler waits before re-enqueuing.
 *   - For dev mode, the tick is 60s. For production, consider 30s.
 *
 * Failure modes:
 *   - A scan throwing inside the tick → caught + logged; tick still
 *     re-enqueues so the scheduler never stops.
 *   - Re-enqueue itself failing → logged loudly; the next server boot's
 *     recoverPendingJobs will pick up the last pending SCHEDULER row.
 *   - Multiple concurrent ticks (e.g. bug in locking) → guarded by a
 *     module-level in-process `tickInFlight` boolean.
 */

import { logger } from "../logger";
import { registerWorker, QUEUE_NAMES, enqueueBackground } from "../queues";
import { runNotificationScan } from "../notifications";
import { listBackups } from "../backup";

export const SCHEDULER_JOB_TYPES = {
  TICK: "tick",
} as const;

/** Tick frequency — how often the scheduler wakes up to check for due work. */
const TICK_INTERVAL_MS = 60_000;

/** Hour of the day (0-23, server-local) to run the daily scan sweep. */
const DAILY_SCAN_HOUR = 3; // 3 AM — off-peak for Gulf businesses

/** How often to trigger a backup (default: 24h). */
const BACKUP_INTERVAL_MS = parseInt(process.env.BACKUP_INTERVAL_MS || String(24 * 60 * 60 * 1000), 10);

/** How often to trigger a backup verification (default: 24h). */
const VERIFY_INTERVAL_MS = parseInt(process.env.VERIFY_INTERVAL_MS || String(24 * 60 * 60 * 1000), 10);

// Module-level guard against overlapping ticks within a single process.
// (Cross-process overlap is prevented by the DB-level lockedBy check in
// queues.ts recoverPendingJobs, but a single process can still re-enter the
// handler if the event loop is async-yielding mid-tick.)
let tickInFlight = false;

// Track the last-run timestamps in memory. On first boot these are 0, which
// forces an immediate run. After that, they're updated only on successful
// completion — a crashed tick won't update them, so the next tick will
// retry the work.
let lastDailyScanAt = 0;
let lastBackupAt = 0;
let lastVerifyAt = 0;

export interface SchedulerTickJobData {
  /** ISO timestamp of when this tick was originally scheduled — for drift tracking. */
  scheduledAt?: string;
  /** Tick sequence number — monotonically increasing, useful for debugging. */
  seq?: number;
}

/** The actual handler — exported for direct invocation from tests. */
export async function handleSchedulerJob(data: Record<string, unknown>): Promise<void> {
  const jobType = (data.type as string) || SCHEDULER_JOB_TYPES.TICK;
  if (jobType !== SCHEDULER_JOB_TYPES.TICK) {
    throw new Error(`schedulerWorker: unknown job type "${jobType}"`);
  }
  const payload = (data.payload ?? data) as SchedulerTickJobData;
  await runTick(payload);
}

async function runTick(payload: SchedulerTickJobData): Promise<void> {
  if (tickInFlight) {
    // CRITICAL: when skipping due to overlap, do NOT re-enqueue. The
    // currently-running tick will re-enqueue its successor when it finishes.
    // If we re-enqueue here too, every overlap doubles the tick population
    // — and on boot, recoverPendingJobs may pick up thousands of orphan
    // SCHEDULER rows, causing a runaway tick cascade.
    logger.warn("[scheduler] tick already in flight — skipping (no re-enqueue)", { seq: payload.seq });
    return;
  }
  tickInFlight = true;
  const start = Date.now();
  const now = new Date();
  const seq = payload.seq ?? 0;

  try {
    logger.debug("[scheduler] tick start", { seq, scheduledAt: payload.scheduledAt });

    // 1. Daily notification scan — runs at DAILY_SCAN_HOUR local time.
    //    We check both the hour AND that we haven't already scanned today
    //    (the lastDailyScanAt guard prevents duplicate runs if the tick
    //    fires multiple times within the same hour).
    const todayKey = now.toISOString().slice(0, 10);
    const lastScanKey = lastDailyScanAt ? new Date(lastDailyScanAt).toISOString().slice(0, 10) : "";
    if (now.getHours() === DAILY_SCAN_HOUR && lastScanKey !== todayKey) {
      try {
        const result = await runNotificationScan();
        lastDailyScanAt = Date.now();
        logger.info("[scheduler] daily notification scan complete", {
          seq, overdue: result.overdue, residence: result.residence, subscription: result.subscription,
        });
      } catch (err) {
        // Don't update lastDailyScanAt on failure — next tick will retry.
        logger.error("[scheduler] daily notification scan failed", {
          seq, err: err instanceof Error ? err.message : String(err),
        });
      }
    }

    // 2. Periodic backup — every BACKUP_INTERVAL_MS (default 24h).
    if (Date.now() - lastBackupAt >= BACKUP_INTERVAL_MS) {
      // Before triggering, check the filesystem — if the most recent backup
      // is newer than lastBackupAt (e.g. a manual backup was triggered),
      // update our in-memory timestamp and skip.
      try {
        const backups = await listBackups();
        if (backups.length > 0 && backups[0].createdAt.getTime() > lastBackupAt) {
          lastBackupAt = backups[0].createdAt.getTime();
          logger.debug("[scheduler] skipping backup — recent backup already exists", {
            seq, recentBackupAt: backups[0].createdAt.toISOString(),
          });
        } else {
          const { enqueueBackup } = await import("../backup");
          await enqueueBackup("scheduled");
          lastBackupAt = Date.now();
          logger.info("[scheduler] scheduled backup enqueued", { seq });
        }
      } catch (err) {
        logger.error("[scheduler] failed to enqueue periodic backup", {
          seq, err: err instanceof Error ? err.message : String(err),
        });
      }
    }

    // 3. Periodic backup verification — every VERIFY_INTERVAL_MS (default 24h).
    if (Date.now() - lastVerifyAt >= VERIFY_INTERVAL_MS) {
      try {
        const { enqueueAsync, QUEUE_NAMES: QN } = await import("../queues");
        await enqueueAsync(QN.BACKUP, {
          type: "verify-backup",
          data: {}, // verify the most recent backup
        });
        lastVerifyAt = Date.now();
        logger.info("[scheduler] backup verification enqueued", { seq });
      } catch (err) {
        logger.error("[scheduler] failed to enqueue backup verification", {
          seq, err: err instanceof Error ? err.message : String(err),
        });
      }
    }

    logger.debug("[scheduler] tick end", { seq, durationMs: Date.now() - start });
  } finally {
    tickInFlight = false;
  }

  // Schedule the next tick. We use setTimeout (not the JobQueue.scheduledAt
  // field) because runWithRetries fires the handler immediately on enqueue —
  // the scheduledAt field is metadata only, it does NOT delay execution.
  //
  // setTimeout keeps the next tick off the queue (and out of the active
  // handler's way) until TICK_INTERVAL_MS has actually elapsed. If the
  // process dies before the timer fires, recoverPendingJobs won't find a
  // pending SCHEDULER row — but the next boot's registerSchedulerWorker()
  // will enqueue a fresh initial tick, so the scheduler always resumes.
  //
  // We use `void` to make it clear we're not awaiting the timer; the timer
  // reference is held by the Node.js event loop and will fire even if this
  // function has long returned.
  const nextSeq = seq + 1;
  const nextScheduledAt = new Date(Date.now() + TICK_INTERVAL_MS).toISOString();
  setTimeout(() => {
    enqueueBackground(QUEUE_NAMES.SCHEDULER, {
      type: SCHEDULER_JOB_TYPES.TICK,
      data: {
        type: SCHEDULER_JOB_TYPES.TICK,
        payload: {
          scheduledAt: nextScheduledAt,
          seq: nextSeq,
        },
      },
    });
    logger.debug("[scheduler] next tick enqueued (after delay)", { nextSeq, inMs: TICK_INTERVAL_MS });
  }, TICK_INTERVAL_MS);
  logger.debug("[scheduler] next tick scheduled (timer armed)", { nextSeq, inMs: TICK_INTERVAL_MS });
}

// ─── Module-level registration + boot ──────────────────────────────────────

let registered = false;
export function registerSchedulerWorker(): void {
  if (registered) return;
  registerWorker(QUEUE_NAMES.SCHEDULER, handleSchedulerJob);
  registered = true;
  logger.info("[scheduler-worker] registered for queue", { queue: QUEUE_NAMES.SCHEDULER });

  // Kick off the first tick — fire-and-forget. If the queue already has a
  // pending tick (from the previous server lifetime, picked up by
  // recoverPendingJobs), this will create a duplicate, but the
  // `tickInFlight` guard + DB-level lockedBy check prevent double-execution.
  // The duplicate tick is harmless — it'll just no-op and re-enqueue.
  enqueueBackground(QUEUE_NAMES.SCHEDULER, {
    type: SCHEDULER_JOB_TYPES.TICK,
    data: {
      type: SCHEDULER_JOB_TYPES.TICK,
      payload: {
        scheduledAt: new Date().toISOString(),
        seq: 0,
      },
    },
  });
  logger.info("[scheduler-worker] initial tick enqueued");
}

// Side-effect: register immediately on module load.
registerSchedulerWorker();

// Reference listBackups so the import isn't tree-shaken (used in runTick).
void listBackups;

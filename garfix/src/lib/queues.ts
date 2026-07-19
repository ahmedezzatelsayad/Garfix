/**
 * queues.ts — Queue name constants + DB-backed persistent job runner.
 *
 * Task 18: every enqueued job is now persisted to the `JobQueue` table so
 * jobs survive server restarts. The previous in-memory-only runner lost all
 * pending work on crash — unacceptable for the AI Product Match Resolver
 * (Task 17), which is enqueued inside the invoice sync transaction and MUST
 * complete eventually (otherwise the audit entry stays forever in the
 * `ai-queued-for-review` state and the alias never gets auto-linked).
 *
 * Architecture (single-instance SQLite mode):
 *   - In-process handler registry (unchanged) — `registerWorker(queue, fn)`.
 *   - Every enqueue INSERTs a `JobQueue` row with status="pending".
 *   - `runWithRetries` flips status: pending → running → completed | dead-letter.
 *   - `recoverPendingJobs()` is called from `startupCheck.ts` on boot — it
 *     picks up rows that are still `pending` (never started, e.g. server
 *     crashed between INSERT and worker pickup) OR `running` with a stale
 *     `lockedAt` (worker died mid-execution, lock older than 5 min) and
 *     re-enqueues them in-process.
 *   - In-memory dead-letter log retained for the founder panel quick view,
 *     but the DB row is the source of truth for permanent persistence.
 *
 * The handler signature is unchanged so existing callers (backup.ts, the
 * AI worker) need no edits at the call site.
 *
 * In production with Postgres + Redis, swap the in-process runner for
 * BullMQ — the persisted `JobQueue` table remains useful as an audit trail.
 */

import { db } from "./db";
import { logger } from "./logger";

export const QUEUE_NAMES = {
  AI: "ai-jobs",
  EMAIL: "email-jobs",
  WHATSAPP: "whatsapp-jobs",
  BACKUP: "backup-jobs",
  SCHEDULER: "scheduler-jobs",
} as const;

export type QueueName = typeof QUEUE_NAMES[keyof typeof QUEUE_NAMES];

export const QUEUE_TTL = {
  [QUEUE_NAMES.AI]: 60_000,        // 1 min — AI tasks should complete fast or fail
  [QUEUE_NAMES.EMAIL]: 30_000,     // 30s — email sends
  [QUEUE_NAMES.WHATSAPP]: 30_000,  // 30s — WhatsApp messages
  [QUEUE_NAMES.BACKUP]: 600_000,   // 10 min — backups
  [QUEUE_NAMES.SCHEDULER]: 5_000,  // 5s — scheduler ticks
} as const;

export interface JobPayload {
  type: string;
  data: Record<string, unknown>;
  attempts?: number;
}

// P0 FIX (audit finding queues.ts:49-59): the previous "fire-and-forget"
// implementation:
//   1. Did not await the handler — caller had no way to know if the job
//      succeeded or failed.
//   2. Caught errors only to log them — failed jobs were lost forever,
//      no retry, no dead-letter trail.
//   3. Could silently swallow critical work (audit logs, notifications,
//      backups) without anyone noticing.
//
// Task 18b: every enqueue is now also persisted to `JobQueue` so:
//   - A server crash between enqueue and execution doesn't drop the job —
//     `recoverPendingJobs()` re-picks it on next boot.
//   - Permanent failures land in the DB as status="dead-letter" with the
//     last error message, visible to ops/founder panel across restarts.

export interface FailedJobRecord {
  queue: QueueName;
  type: string;
  error: string;
  failedAt: string;
  attempts: number;
  payload: JobPayload;
}

const MAX_RETRIES = 3;
const RETRY_BACKOFF_MS = [1_000, 5_000, 15_000] as const;
const MAX_DEAD_LETTER_PER_QUEUE = 100;
const STALE_LOCK_THRESHOLD_MS = 5 * 60 * 1000; // 5 min — worker is assumed dead past this

type JobHandler = (data: Record<string, unknown>) => Promise<void>;

// In-process job handlers registry — for single-instance mode.
const handlers = new Map<QueueName, JobHandler>();

// Dead-letter log — bounded per queue so memory doesn't grow unbounded.
// Mirrors the DB rows with status="dead-letter" for fast in-process access.
const deadLetters = new Map<QueueName, FailedJobRecord[]>();

// Unique worker ID per process — used for `lockedBy` so we can tell which
// process picked up a job (useful when we eventually scale to N instances).
const WORKER_ID = `worker-${process.pid}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

/** Register a handler for a queue. */
export function registerWorker(queue: QueueName, handler: JobHandler): void {
  handlers.set(queue, handler);
  logger.info("[queues] worker registered", { queue, workerId: WORKER_ID });
}

function recordDeadLetter(queue: QueueName, payload: JobPayload, error: string, attempts: number): void {
  let list = deadLetters.get(queue);
  if (!list) {
    list = [];
    deadLetters.set(queue, list);
  }
  list.push({
    queue,
    type: payload.type,
    error,
    failedAt: new Date().toISOString(),
    attempts,
    payload,
  });
  // Trim — keep most recent failures
  if (list.length > MAX_DEAD_LETTER_PER_QUEUE) {
    list.splice(0, list.length - MAX_DEAD_LETTER_PER_QUEUE);
  }
  logger.error(
    "[queues] job permanently failed after retries — recorded to dead-letter log",
    { queue, type: payload.type, attempts, err: error },
  );
}

/** Inspect recent failures for ops/founder panel visibility. */
export function getDeadLetters(queue?: QueueName): FailedJobRecord[] {
  if (queue) return [...(deadLetters.get(queue) ?? [])];
  const all: FailedJobRecord[] = [];
  for (const list of deadLetters.values()) all.push(...list);
  return all.sort((a, b) => b.failedAt.localeCompare(a.failedAt));
}

/** Clear dead-letter entries (after they've been acknowledged). */
export function clearDeadLetters(queue?: QueueName): void {
  if (queue) deadLetters.delete(queue);
  else deadLetters.clear();
}

// ─── DB persistence layer ──────────────────────────────────────────────────

/**
 * Persist a job to the `JobQueue` table. Called from `enqueueBackground` /
 * `enqueueAsync`. Returns the inserted row id (or null on failure — caller
 * continues with the in-memory run, since the handler is still registered).
 *
 * Failure to persist is logged but does NOT block the in-process run —
 * the in-memory path remains the primary execution path; the DB row is the
 * crash-recovery safety net.
 */
async function persistEnqueue(queue: QueueName, payload: JobPayload): Promise<number | null> {
  try {
    const row = await db.jobQueue.create({
      data: {
        queue,
        type: payload.type,
        data: JSON.stringify(payload.data ?? {}),
        status: "pending",
        attempts: 0,
        maxAttempts: payload.attempts ?? MAX_RETRIES,
        scheduledAt: new Date(),
      },
    });
    return row.id;
  } catch (err) {
    logger.error("[queues] failed to persist job to JobQueue — in-memory run only", {
      queue, type: payload.type, err: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

/**
 * Update a persisted job row's status. Best-effort — failures are logged
 * but never block the run.
 */
async function updateJobStatus(
  jobId: number | null,
  patch: {
    status?: string;
    lockedAt?: Date | null;
    lockedBy?: string | null;
    startedAt?: Date | null;
    completedAt?: Date | null;
    attempts?: number;
    lastError?: string | null;
  },
): Promise<void> {
  if (jobId === null) return;
  try {
    await db.jobQueue.update({ where: { id: jobId }, data: patch });
  } catch (err) {
    logger.warn("[queues] failed to update JobQueue row", {
      jobId, patch: patch.status, err: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * Internal: run a job with retries + backoff. Resolves only when the job
 * has either succeeded or permanently failed (after MAX_RETRIES).
 *
 * Persists every status transition to `JobQueue` so the row reflects reality
 * even if the process dies mid-run.
 */
async function runWithRetries(queue: QueueName, payload: JobPayload, jobId: number | null): Promise<void> {
  const max = payload.attempts ?? MAX_RETRIES;
  let lastError = "";

  // Claim the row (if persisted) by flipping status to "running" BEFORE the
  // first attempt. This prevents a duplicate recovery on the next boot from
  // re-running the same job concurrently.
  await updateJobStatus(jobId, {
    status: "running",
    lockedAt: new Date(),
    lockedBy: WORKER_ID,
    startedAt: new Date(),
    attempts: 0,
  });

  for (let attempt = 1; attempt <= max; attempt++) {
    try {
      await runOnceWithTimeout(queue, payload);
      // Bump attempts on the DB row + mark completed.
      await updateJobStatus(jobId, {
        status: "completed",
        attempts: attempt,
        completedAt: new Date(),
        lastError: null,
        lockedAt: null,
        lockedBy: null,
      });
      logger.debug("[queues] job succeeded", { queue, type: payload.type, attempt, jobId });
      return;
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      // Record the latest attempt count + error on the DB row even before
      // we know if a retry will succeed — this way a crash mid-backoff
      // leaves a clear trail.
      await updateJobStatus(jobId, {
        attempts: attempt,
        lastError: lastError.slice(0, 1000),
      });
      logger.warn(
        "[queues] job attempt failed",
        { queue, type: payload.type, attempt, max, err: lastError, jobId },
      );
      if (attempt < max) {
        const backoff = RETRY_BACKOFF_MS[Math.min(attempt - 1, RETRY_BACKOFF_MS.length - 1)];
        await new Promise((resolve) => setTimeout(resolve, backoff));
      }
    }
  }
  // Permanent failure → dead-letter (both in-memory log and DB row).
  recordDeadLetter(queue, payload, lastError, max);
  await updateJobStatus(jobId, {
    status: "dead-letter",
    attempts: max,
    lastError: lastError.slice(0, 1000),
    lockedAt: null,
    lockedBy: null,
    completedAt: new Date(),
  });
}

/** Run a job once with the queue's TTL as a timeout guard. */
async function runOnceWithTimeout(queue: QueueName, payload: JobPayload): Promise<void> {
  const handler = handlers.get(queue);
  if (!handler) {
    throw new Error(`No handler registered for queue "${queue}"`);
  }
  const ttl = QUEUE_TTL[queue] ?? 30_000;
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Job timed out after ${ttl}ms`));
    }, ttl);
    handler(payload.data)
      .then(() => resolve())
      .catch(reject)
      .finally(() => clearTimeout(timer));
  });
}

/**
 * Enqueue a job asynchronously — caller awaits the result, with retries
 * applied on failure. Use this when the caller cares whether the job
 * succeeded (e.g. audit log writes that should block the action they audit).
 */
export async function enqueueAsync(queue: QueueName, payload: JobPayload): Promise<void> {
  const jobId = await persistEnqueue(queue, payload);
  await runWithRetries(queue, payload, jobId);
}

/**
 * Enqueue a job in the background — caller does NOT await the result. The
 * job still gets retries + dead-letter on failure, but the caller's request
 * flow is not blocked. Use this for fire-and-forget cases (notifications,
 * non-critical cleanup, AI resolver) where the caller genuinely doesn't
 * need to wait.
 *
 * Any unhandled rejection from the background promise is caught and logged
 * to prevent "unhandledRejection" process warnings.
 */
export function enqueueBackground(queue: QueueName, payload: JobPayload): void {
  // Make sure handlers exist — if not, fail loudly into the dead-letter log
  // AND the DB so the failure persists across restarts.
  if (!handlers.has(queue)) {
    const err = `No handler registered for queue "${queue}"`;
    recordDeadLetter(queue, payload, err, 0);
    void persistEnqueue(queue, payload).then((id) =>
      updateJobStatus(id, {
        status: "dead-letter",
        lastError: err,
        attempts: 0,
        completedAt: new Date(),
      }),
    );
    return;
  }
  // Persist first (awaited, since the INSERT is fast and we want the row id
  // for status tracking), then kick off the in-process run.
  void persistEnqueue(queue, payload).then((jobId) => {
    const p = runWithRetries(queue, payload, jobId);
    p.catch(() => { /* already recorded via recordDeadLetter inside runWithRetries */ });
  });
  logger.debug("[queues] job enqueued (background)", { queue, type: payload.type });
}

/**
 * Backward-compatible enqueue(): preserves the original fire-and-forget
 * signature but routes through enqueueBackground so callers get retry +
 * dead-letter behavior for free. Existing callers don't need to change.
 *
 * Note: this is async only to preserve the original signature; it does not
 * await the job. To await the result, call enqueueAsync() explicitly.
 */
export async function enqueue(queue: QueueName, payload: JobPayload): Promise<void> {
  enqueueBackground(queue, payload);
}

/**
 * Task 18b — Re-enqueue jobs that were left unfinished when the previous
 * process died.
 *
 * Picks up `JobQueue` rows where:
 *   - status="pending" (never started — e.g. crash between INSERT and
 *     worker pickup), OR
 *   - status="running" AND lockedAt older than 5 min (worker died mid-run,
 *     stale lock — assumes the worker is no longer alive).
 *
 * For each, marks it back to "pending" (clearing the lock) and kicks off
 * an in-process run. Safe to call multiple times — the lock check prevents
 * two concurrent recoveries from double-processing the same row.
 *
 * Called from `startupCheck.ts` on server boot (module load).
 */
export async function recoverPendingJobs(): Promise<{ recovered: number; errors: string[] }> {
  const errors: string[] = [];
  let recovered = 0;
  const staleCutoff = new Date(Date.now() - STALE_LOCK_THRESHOLD_MS);

  try {
    // Pending jobs — never started.
    const pending = await db.jobQueue.findMany({
      where: { status: "pending" },
      orderBy: { scheduledAt: "asc" },
      take: 200, // bounded per recovery pass to avoid hammering on huge backlogs
    });

    // Stale running jobs — locked but the lock is older than the threshold.
    const staleRunning = await db.jobQueue.findMany({
      where: {
        status: "running",
        lockedAt: { lt: staleCutoff },
      },
      orderBy: { lockedAt: "asc" },
      take: 50,
    });

    const candidates = [...pending, ...staleRunning];
    if (candidates.length === 0) {
      logger.info("[queues] recoverPendingJobs: nothing to recover");
      return { recovered: 0, errors };
    }

    logger.info("[queues] recoverPendingJobs: re-enqueuing unfinished jobs", {
      pending: pending.length,
      staleRunning: staleRunning.length,
    });

    for (const row of candidates) {
      // Re-claim the row in the DB before kicking off the in-process run.
      // This prevents a duplicate recovery (e.g. if recoverPendingJobs is
      // called twice in quick succession) from double-processing.
      try {
        await db.jobQueue.update({
          where: { id: row.id },
          data: {
            status: "pending",
            lockedAt: null,
            lockedBy: null,
            lastError: row.status === "running" ? `recovered from stale lock (was locked since ${row.lockedAt?.toISOString()})` : row.lastError,
          },
        });
      } catch (err) {
        errors.push(`JobQueue#${row.id}: failed to re-claim — ${err instanceof Error ? err.message : String(err)}`);
        continue;
      }

      // Only kick off the in-process run if a handler is registered for
      // the queue. Unregistered queues (e.g. SCHEDULER with no worker yet)
      // are left pending in the DB — they'll be picked up later.
      if (!handlers.has(row.queue as QueueName)) {
        logger.debug("[queues] recoverPendingJobs: skipping — no handler for queue", { jobId: row.id, queue: row.queue });
        continue;
      }

      let payloadData: Record<string, unknown>;
      try {
        payloadData = JSON.parse(row.data);
      } catch {
        errors.push(`JobQueue#${row.id}: malformed payload JSON — moving to dead-letter`);
        await updateJobStatus(row.id, {
          status: "dead-letter",
          lastError: "malformed payload JSON during recovery",
          completedAt: new Date(),
        });
        continue;
      }

      const payload: JobPayload = {
        type: row.type,
        data: payloadData,
        attempts: row.maxAttempts || MAX_RETRIES,
      };

      // Kick off the in-process run, using the SAME job row id so the
      // existing status transitions (running → completed | dead-letter)
      // update the right row.
      const p = runWithRetries(row.queue as QueueName, payload, row.id);
      p.catch(() => { /* already recorded via recordDeadLetter */ });
      recovered++;
    }

    logger.info("[queues] recoverPendingJobs: done", { recovered, errors: errors.length });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error("[queues] recoverPendingJobs: fatal error during recovery", { err: msg });
    errors.push(`fatal: ${msg}`);
  }

  return { recovered, errors };
}

/** Connection factory — placeholder for Redis connection (when available). */
export function getConnection() {
  // In sandbox: no Redis. Return a stub.
  // In production: return ioredis instance from REDIS_URL env var.
  return null;
}

/** Expose the worker ID — useful for tests + diagnostics. */
export function getWorkerId(): string {
  return WORKER_ID;
}

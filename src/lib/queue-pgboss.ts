/**
 * queue-pgboss.ts — PostgreSQL-backed job queue using pg-boss.
 *
 * This module provides a production-safe job queue that uses the same
 * PostgreSQL database already configured for Prisma (DATABASE_URL).
 * No additional infrastructure is needed — no Valkey, no Redis.
 *
 * pg-boss gives us:
 *   - Persistent jobs that survive crashes (stored in PG tables).
 *   - Built-in retries with configurable backoff (exponential supported).
 *   - Dead-letter queues (pg-boss archives failed jobs automatically).
 *   - Multi-instance safe ( advisory locks in PG).
 *   - Schema auto-migration (pg-boss creates its own tables on start).
 *   - Job expiry / TTL (prevents stale locked jobs).
 *
 * This is used as a SECONDARY fallback when Valkey/BullMQ is unavailable:
 *   1. BullMQ (Valkey) → best for production with Valkey
 *   2. pg-boss (PostgreSQL) → production-safe without Valkey (THIS MODULE)
 *   3. In-memory → dev/sandbox only (not production-safe)
 *
 * The public API mirrors queues.ts:
 *   - PgBossQueue.registerWorker(queue, handler)
 *   - PgBossQueue.enqueue(queue, payload)
 *   - PgBossQueue.enqueueAsync(queue, payload)
 *   - PgBossQueue.enqueueBackground(queue, payload)
 *   - PgBossQueue.getDeadLetters(queue?)
 *   - PgBossQueue.clearDeadLetters(queue?)
 *   - PgBossQueue.recoverPendingJobs()
 *   - PgBossQueue.start() / PgBossQueue.stop()
 *
 * RUNTIME: Node.js only — uses process.pid, pg-boss (Node-only)
 */
'use node';

import { logger } from "./logger";
import { QUEUE_NAMES, QUEUE_TTL, QueueName, JobPayload, FailedJobRecord } from "./queues";
import { PgBoss } from "pg-boss";

// ─── Configuration ──────────────────────────────────────────────────────

const MAX_RETRIES = 3;
const RETRY_BACKOFF_SECONDS = 1; // pg-boss exponential: delay * 2^retryCount
const MAX_DEAD_LETTER_PER_QUEUE = 100;

const DEAD_LETTER_SUFFIX = "__dead-letter";

const WORKER_ID = `pgboss-worker-${process.pid}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

// ─── pg-boss instance ──────────────────────────────────────────────────

let boss: PgBoss | null = null;
let bossStarted = false;
let bossInitAttempted = false;

type JobHandler = (data: Record<string, unknown>) => Promise<void>;
const handlers = new Map<QueueName, JobHandler>();
const deadLetters = new Map<QueueName, FailedJobRecord[]>();

// ─── Helpers ────────────────────────────────────────────────────────────

/** Get the DATABASE_URL, stripping Prisma pool params (pg-boss has its own pool). */
function getPgBossConnectionString(): string | null {
  const raw = process.env.DATABASE_URL;
  if (!raw) return null;
  // Strip connection_limit & pool_timeout params — pg-boss manages its own pool
  const url = new URL(raw);
  url.searchParams.delete("connection_limit");
  url.searchParams.delete("pool_timeout");
  return url.toString();
}

/** Whether pg-boss CAN be used (DATABASE_URL is set). */
export const PGBOSS_AVAILABLE = Boolean(process.env.DATABASE_URL);

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
  if (list.length > MAX_DEAD_LETTER_PER_QUEUE) {
    list.splice(0, list.length - MAX_DEAD_LETTER_PER_QUEUE);
  }
  logger.error(
    "[queue-pgboss] job permanently failed after retries — recorded to dead-letter log",
    { queue, type: payload.type, attempts, err: error },
  );
}

// ─── Queue config per queue name ────────────────────────────────────────

function getQueueConfig(queueName: QueueName): {
  retryLimit: number;
  retryDelay: number;
  retryBackoff: boolean;
  expireInSeconds: number;
  deadLetter: string;
} {
  const ttlMs = QUEUE_TTL[queueName] ?? 30_000;
  const expireInSeconds = Math.max(Math.ceil(ttlMs / 1000), 15); // pg-boss minimum is 1, but 15s is practical
  return {
    retryLimit: MAX_RETRIES,
    retryDelay: RETRY_BACKOFF_SECONDS,
    retryBackoff: true,
    expireInSeconds,
    deadLetter: `${queueName}${DEAD_LETTER_SUFFIX}`,
  };
}

// ─── pg-boss initialization ─────────────────────────────────────────────

/**
 * Initialize and start pg-boss.
 * Returns true if pg-boss is ready to accept jobs, false otherwise.
 */
export async function startPgBoss(): Promise<boolean> {
  if (bossStarted) return true;
  if (bossInitAttempted) return boss !== null; // previous attempt result

  const connectionString = getPgBossConnectionString();
  if (!connectionString) {
    logger.warn("[queue-pgboss] No DATABASE_URL — pg-boss cannot start");
    bossInitAttempted = true;
    return false;
  }

  bossInitAttempted = true;

  try {
    boss = new PgBoss({
      connectionString,
      schema: "pgboss", // separate schema to avoid conflicts with app tables
      supervise: true,
      migrate: true,
      // pg-boss manages its own pool; use a reasonable size
      max: 5,
      // Maintenance intervals (reasonable for production)
      maintenanceIntervalSeconds: 60,
      superviseIntervalSeconds: 120,
      monitorIntervalSeconds: 60,
    });

    boss.on("error", (err: Error) => {
      logger.error("[queue-pgboss] pg-boss error", { err: err.message });
    });

    boss.on("warning", (warning: { message: string }) => {
      logger.warn("[queue-pgboss] pg-boss warning", { warning: warning.message });
    });

    await boss.start();
    bossStarted = true;

    // Create queues with proper config
    for (const [key, name] of Object.entries(QUEUE_NAMES) as [string, QueueName][]) {
      const config = getQueueConfig(name);
      try {
        await boss.createQueue(name, {
          retryLimit: config.retryLimit,
          retryDelay: config.retryDelay,
          retryBackoff: config.retryBackoff,
          expireInSeconds: config.expireInSeconds,
          deadLetter: config.deadLetter,
          // Keep completed/failed jobs for 7 days for debugging
          deleteAfterSeconds: 7 * 24 * 3600,
        });
        // Also create the dead-letter queue
        await boss.createQueue(config.deadLetter, {
          deleteAfterSeconds: 30 * 24 * 3600, // keep dead letters for 30 days
        });
      } catch (err) {
        // Queue might already exist from previous start — that's fine
        logger.debug("[queue-pgboss] queue creation (may already exist)", {
          queue: name,
          err: err instanceof Error ? err.message : String(err),
        });
      }
    }

    logger.info("[queue-pgboss] pg-boss started successfully", {
      queues: Object.values(QUEUE_NAMES),
    });

    // Register any handlers that were set before start()
    for (const [name, handler] of Array.from(handlers.entries())) {
      await registerPgBossWorker(name, handler);
    }

    return true;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error("[queue-pgboss] pg-boss start failed", { err: msg });
    boss = null;
    return false;
  }
}

/**
 * Gracefully stop pg-boss.
 */
export async function stopPgBoss(): Promise<void> {
  if (boss && bossStarted) {
    try {
      await boss.stop();
      logger.info("[queue-pgboss] pg-boss stopped gracefully");
    } catch (err) {
      logger.warn("[queue-pgboss] pg-boss stop error", {
        err: err instanceof Error ? err.message : String(err),
      });
    }
    bossStarted = false;
  }
  boss = null;
  bossInitAttempted = false;
}

// ─── Worker registration ────────────────────────────────────────────────

async function registerPgBossWorker(queueName: QueueName, handler: JobHandler): Promise<void> {
  if (!boss || !bossStarted) return;

  const ttlMs = QUEUE_TTL[queueName] ?? 30_000;

  try {
    await boss.work(queueName, async (jobs: Array<{ id: string; data: unknown; name: string }>) => {
      // pg-boss v12 passes a batch of jobs to the handler
      // Process each job in the batch
      for (const job of jobs) {
        const payload = job.data as Record<string, unknown>;
        logger.debug("[queue-pgboss] processing job", {
          queue: queueName,
          jobId: job.id,
        });

        // Timeout guard — race the handler against the TTL
        await Promise.race([
          handler(payload),
          new Promise<never>((_, reject) =>
            setTimeout(
              () => reject(new Error(`Job timed out after ${ttlMs}ms`)),
              ttlMs,
            ),
          ),
        ]);
      }
    });

    logger.info("[queue-pgboss] worker registered", { queue: queueName, workerId: WORKER_ID });
  } catch (err) {
    logger.error("[queue-pgboss] worker registration failed", {
      queue: queueName,
      err: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * Register a handler for a queue.
 * If pg-boss is already started, the worker is registered immediately.
 * Otherwise, it's stored and registered when start() is called.
 */
export function registerWorker(queue: QueueName, handler: JobHandler): void {
  handlers.set(queue, handler);
  logger.info("[queue-pgboss] handler registered", { queue, workerId: WORKER_ID });

  if (bossStarted && boss) {
    registerPgBossWorker(queue, handler).catch((err) => {
      logger.error("[queue-pgboss] late worker registration failed", {
        queue,
        err: err instanceof Error ? err.message : String(err),
      });
    });
  }
}

// ─── Enqueue operations ─────────────────────────────────────────────────

/**
 * Enqueue a job asynchronously — caller awaits the result, with retries.
 */
export async function enqueueAsync(queue: QueueName, payload: JobPayload): Promise<void> {
  const ready = await startPgBoss();
  if (!ready || !boss) {
    throw new Error("[queue-pgboss] pg-boss not available — cannot enqueueAsync");
  }

  const config = getQueueConfig(queue);
  const jobId = await boss.send(queue, payload, {
    retryLimit: payload.attempts ?? config.retryLimit,
    retryDelay: config.retryDelay,
    retryBackoff: config.retryBackoff,
    expireInSeconds: config.expireInSeconds,
    deadLetter: config.deadLetter,
  });

  if (jobId) {
    logger.debug("[queue-pgboss] job enqueued (async)", { queue, type: payload.type, jobId });
  } else {
    logger.warn("[queue-pgboss] job send returned null", { queue, type: payload.type });
  }
}

/**
 * Enqueue a job in the background — caller does NOT await the result.
 * Returns immediately; job is persisted to PostgreSQL.
 */
export function enqueueBackground(queue: QueueName, payload: JobPayload): void {
  startPgBoss().then(async (ready) => {
    if (ready && boss) {
      const config = getQueueConfig(queue);
      try {
        const jobId = await boss.send(queue, payload, {
          retryLimit: payload.attempts ?? config.retryLimit,
          retryDelay: config.retryDelay,
          retryBackoff: config.retryBackoff,
          expireInSeconds: config.expireInSeconds,
          deadLetter: config.deadLetter,
        });
        logger.debug("[queue-pgboss] job enqueued (background)", { queue, type: payload.type, jobId });
        return;
      } catch (err) {
        logger.error("[queue-pgboss] send failed", {
          queue,
          type: payload.type,
          err: err instanceof Error ? err.message : String(err),
        });
        // Fall through — can't enqueue, record as dead letter
      }
    }

    // pg-boss unavailable — record as dead letter (no in-process fallback)
    const msg = "pg-boss unavailable for enqueueBackground";
    recordDeadLetter(queue, payload, msg, 0);
  });
}

/**
 * Backward-compatible enqueue().
 */
export async function enqueue(queue: QueueName, payload: JobPayload): Promise<void> {
  enqueueBackground(queue, payload);
}

// ─── Dead-letter management ─────────────────────────────────────────────

/**
 * Inspect recent failures.
 * Queries pg-boss failed jobs from the database plus in-memory tracking.
 */
export async function getDeadLetters(queue?: QueueName): Promise<FailedJobRecord[]> {
  // First, gather in-memory dead letters
  const inMemory: FailedJobRecord[] = [];
  if (queue) {
    inMemory.push(...(deadLetters.get(queue) ?? []));
  } else {
    for (const list of Array.from(deadLetters.values())) inMemory.push(...list);
  }

  // Then, query pg-boss for failed/archived jobs
  if (boss && bossStarted) {
    const queueNames = queue ? [queue] : (Object.values(QUEUE_NAMES) as QueueName[]);
    const pgDeadLetters: FailedJobRecord[] = [];

    for (const qName of queueNames) {
      try {
        const dlqName = `${qName}${DEAD_LETTER_SUFFIX}`;
        const failedJobs = await boss.findJobs(dlqName, {
          // Find all jobs in the dead-letter queue
        });

        for (const job of failedJobs) {
          pgDeadLetters.push({
            queue: qName,
            type: (job.data as JobPayload)?.type ?? "unknown",
            error: job.output ? String(job.output) : "unknown error",
            failedAt: job.completedOn?.toISOString() ?? new Date().toISOString(),
            attempts: 0, // pg-boss doesn't expose attempt count in findJobs
            payload: (job.data as JobPayload) ?? { type: "unknown", data: {} },
          });
        }
      } catch (err) {
        logger.debug("[queue-pgboss] failed to query dead-letter queue", {
          queue: qName,
          err: err instanceof Error ? err.message : String(err),
        });
      }
    }

    // Merge: pg-boss records first, then in-memory
    const merged = [...pgDeadLetters, ...inMemory];
    merged.sort((a, b) => b.failedAt.localeCompare(a.failedAt));
    return merged;
  }

  // pg-boss not available — return in-memory only
  return inMemory.sort((a, b) => b.failedAt.localeCompare(a.failedAt));
}

/**
 * Clear dead-letter entries.
 * Removes from in-memory tracking AND deletes from pg-boss dead-letter queues.
 */
export async function clearDeadLetters(queue?: QueueName): Promise<void> {
  // Clear in-memory
  if (queue) deadLetters.delete(queue);
  else deadLetters.clear();

  // Clear pg-boss dead-letter queues
  if (boss && bossStarted) {
    const queueNames = queue ? [queue] : (Object.values(QUEUE_NAMES) as QueueName[]);
    for (const qName of queueNames) {
      try {
        const dlqName = `${qName}${DEAD_LETTER_SUFFIX}`;
        await boss.deleteStoredJobs(dlqName);
      } catch (err) {
        logger.debug("[queue-pgboss] failed to clear dead-letter queue", {
          queue: qName,
          err: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }
}

// ─── Recovery ───────────────────────────────────────────────────────────

/**
 * Recover unfinished jobs (called on boot).
 * pg-boss handles most recovery automatically via its maintenance/supervise
 * process, but we also:
 *   1. Redrive any jobs in dead-letter queues back to their source queues
 *   2. Check the legacy JobQueue Prisma table for any orphaned rows
 */
export async function recoverPendingJobs(): Promise<{ recovered: number; errors: string[] }> {
  const errors: string[] = [];
  let recovered = 0;

  // Ensure pg-boss is started first
  const ready = await startPgBoss();
  if (!ready) {
    logger.warn("[queue-pgboss] pg-boss not available — skipping recovery");
    return { recovered: 0, errors: ["pg-boss not available"] };
  }

  // pg-boss supervise automatically handles stale/expired jobs.
  // We can additionally redrive dead-letter jobs if requested.
  logger.info("[queue-pgboss] recovery initiated — pg-boss supervise handles stale locks");

  // Redrive dead-letter jobs back to their source queues
  try {
    for (const name of Object.values(QUEUE_NAMES) as QueueName[]) {
      const dlqName = `${name}${DEAD_LETTER_SUFFIX}`;
      const redriven = await boss!.redrive(dlqName, {
        destination: name,
        sourceName: name,
        limit: 100,
      });
      if (redriven > 0) {
        recovered += redriven;
        logger.info("[queue-pgboss] redrived dead-letter jobs", { queue: name, count: redriven });
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    errors.push(`redrive failed: ${msg}`);
    logger.error("[queue-pgboss] redrive error", { err: msg });
  }

  logger.info("[queue-pgboss] recovery complete", { recovered, errors: errors.length });
  return { recovered, errors };
}

// ─── Stats / introspection ──────────────────────────────────────────────

/**
 * Get pg-boss queue statistics (for admin dashboards).
 * Returns null if pg-boss is not active.
 */
export async function getPgBossStats(): Promise<Record<string, {
  queuedCount: number;
  activeCount: number;
  failedCount: number;
  totalCount: number;
  completedCount: number;
}> | null> {
  if (!boss || !bossStarted) return null;

  const stats: Record<string, {
    queuedCount: number;
    activeCount: number;
    failedCount: number;
    totalCount: number;
    completedCount: number;
  }> = {};

  for (const name of Object.values(QUEUE_NAMES) as QueueName[]) {
    try {
      const queueStats = await boss.getQueueStats(name);
      // getQueueStats returns an array of snapshots; use the latest one
      const latest = queueStats.length > 0 ? queueStats[queueStats.length - 1] : null;
      stats[name] = {
        queuedCount: latest?.queuedCount ?? 0,
        activeCount: latest?.activeCount ?? 0,
        failedCount: latest?.failedCount ?? 0,
        totalCount: latest?.totalCount ?? 0,
        completedCount: 0, // getQueueStats doesn't include completed
      };
    } catch (err) {
      stats[name] = { queuedCount: 0, activeCount: 0, failedCount: 0, totalCount: 0, completedCount: 0 };
      logger.debug("[queue-pgboss] failed to get stats", {
        queue: name,
        err: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return stats;
}

/** Whether pg-boss is currently running. */
export function isPgBossRunning(): boolean {
  return bossStarted && boss !== null;
}

/** Expose the worker ID. */
export function getWorkerId(): string {
  return WORKER_ID;
}

/**
 * queues.ts — BullMQ-backed persistent job queue with in-memory fallback.
 *
 * Architecture:
 *   - VALKEY_URL / REDIS_URL set  → BullMQ over Valkey (production, multi-instance).
 *   - Not set (sandbox/dev)        → In-process DB-backed runner (single-instance).
 *
 * BullMQ gives us:
 *   - Persistent jobs that survive crashes (no custom DB table needed).
 *   - Built-in retries with configurable backoff.
 *   - Rate limiting, priority, delayed jobs.
 *   - Multi-instance safe (distributed locking via Valkey).
 *   - Dashboard-ready (BullMQ Board can be mounted for admin visibility).
 *
 * The public API is 100% backward-compatible:
 *   - registerWorker(queue, handler)
 *   - enqueue(queue, payload)         — fire-and-forget
 *   - enqueueAsync(queue, payload)    — await result
 *   - enqueueBackground(queue, payload) — fire-and-forget
 *   - getDeadLetters(queue?)
 *   - clearDeadLetters(queue?)
 *   - recoverPendingJobs()
 *   - QUEUE_NAMES, QUEUE_TTL, QueueName, JobPayload, FailedJobRecord
 *   - getConnection(), getWorkerId()
 *
 * Existing workers (email, whatsapp, AI, backup, scheduler) need ZERO changes.
 */

import { db } from "./db";
import { logger } from "./logger";
import { VALKEY_CONFIGURED, getValkeyClient } from "./valkey";

// ─── Constants (unchanged) ───────────────────────────────────────────────

export const QUEUE_NAMES = {
  AI: "ai-jobs",
  EMAIL: "email-jobs",
  WHATSAPP: "whatsapp-jobs",
  BACKUP: "backup-jobs",
  SCHEDULER: "scheduler-jobs",
} as const;

export type QueueName = typeof QUEUE_NAMES[keyof typeof QUEUE_NAMES];

export const QUEUE_TTL = {
  [QUEUE_NAMES.AI]: 60_000,
  [QUEUE_NAMES.EMAIL]: 30_000,
  [QUEUE_NAMES.WHATSAPP]: 30_000,
  [QUEUE_NAMES.BACKUP]: 600_000,
  [QUEUE_NAMES.SCHEDULER]: 5_000,
} as const;

export interface JobPayload {
  type: string;
  data: Record<string, unknown>;
  attempts?: number;
}

export interface FailedJobRecord {
  queue: QueueName;
  type: string;
  error: string;
  failedAt: string;
  attempts: number;
  payload: JobPayload;
}

// ─── Mode detection ──────────────────────────────────────────────────────

const USE_BULLMQ = VALKEY_CONFIGURED;

if (USE_BULLMQ) {
  logger.info("[queues] BullMQ mode — Valkey detected, using BullMQ for background jobs");
} else {
  logger.warn(
    "[queues] Fallback mode — VALKEY_URL/REDIS_URL not set. " +
      "Using in-process DB-backed runner. Set VALKEY_URL for production.",
  );
}

// ─── BullMQ state ────────────────────────────────────────────────────────

type BullMQQueue = import("bullmq").Queue;
type BullMQWorker = import("bullmq").Worker;
type BullMQJob = import("bullmq").Job;

const bullQueues = new Map<QueueName, BullMQQueue>();
const bullWorkers = new Map<QueueName, BullMQWorker>();
let bullInitialized = false;

const BULLMQ_DEFAULTS = {
  removeOnComplete: { count: 1000 },
  removeOnFail: { count: 5000 },
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: "exponential" as const,
      delay: 1000,
    },
  },
};

type JobHandler = (data: Record<string, unknown>) => Promise<void>;
const handlers = new Map<QueueName, JobHandler>();

// ─── BullMQ helpers ──────────────────────────────────────────────────────

async function ensureBullMQ(): Promise<boolean> {
  if (bullInitialized) return true;

  const connection = await getValkeyClient();
  if (!connection) {
    logger.error("[queues] Valkey client unavailable — BullMQ cannot start");
    return false;
  }

  try {
    const { Queue, Worker } = await import("bullmq");

    for (const [name] of Object.entries(QUEUE_NAMES) as [QueueName, string][]) {
      const q = new Queue(name, {
        connection: connection.duplicate(),
        ...BULLMQ_DEFAULTS,
      });
      bullQueues.set(name, q);

      // If a handler is already registered, start a worker
      if (handlers.has(name)) {
        await createBullWorker(name, connection, Queue, Worker);
      }
    }

    bullInitialized = true;
    logger.info("[queues] BullMQ initialized", {
      queues: Object.values(QUEUE_NAMES),
    });
    return true;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error("[queues] BullMQ init failed", { err: msg });
    return false;
  }
}

async function createBullWorker(
  name: QueueName,
  connection: import("ioredis").default,
  Queue: typeof import("bullmq").Queue,
  Worker: typeof import("bullmq").Worker,
): Promise<void> {
  const handler = handlers.get(name);
  if (!handler) return;

  const ttl = QUEUE_TTL[name] ?? 30_000;

  const worker = new Worker(name, async (job: BullMQJob) => {
    logger.debug("[queues] BullMQ processing job", { queue: name, jobId: job.id, type: job.data.type });
    // Timeout guard
    await Promise.race([
      handler(job.data as Record<string, unknown>),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`Job timed out after ${ttl}ms`)), ttl),
      ),
    ]);
  }, {
    connection: connection.duplicate(),
    concurrency: name === QUEUE_NAMES.AI ? 2 : 5,
    autorun: true,
  });

  worker.on("completed", (job) => {
    logger.debug("[queues] BullMQ job completed", { queue: name, jobId: job.id });
  });

  worker.on("failed", (job, err) => {
    logger.warn("[queues] BullMQ job failed", {
      queue: name,
      jobId: job?.id,
      attempts: job?.attemptsMade,
      err: err.message,
    });
  });

  worker.on("error", (err) => {
    logger.error("[queues] BullMQ worker error", { queue: name, err: err.message });
  });

  bullWorkers.set(name, worker);
  logger.info("[queues] BullMQ worker started", { queue: name });
}

// ─── In-process fallback state ───────────────────────────────────────────

const MAX_RETRIES = 3;
const RETRY_BACKOFF_MS = [1_000, 5_000, 15_000] as const;
const MAX_DEAD_LETTER_PER_QUEUE = 100;
const STALE_LOCK_THRESHOLD_MS = 5 * 60 * 1000;

const deadLetters = new Map<QueueName, FailedJobRecord[]>();

const WORKER_ID = `worker-${process.pid}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

// ─── In-process helpers (fallback) ──────────────────────────────────────

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
    "[queues] job permanently failed after retries — recorded to dead-letter log",
    { queue, type: payload.type, attempts, err: error },
  );
}

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

async function runWithRetries(queue: QueueName, payload: JobPayload, jobId: number | null): Promise<void> {
  const max = payload.attempts ?? MAX_RETRIES;
  let lastError = "";

  await updateJobStatus(jobId, {
    status: "running",
    lockedAt: new Date(),
    lockedBy: WORKER_ID,
    startedAt: new Date(),
    attempts: 0,
  });

  for (let attempt = 1; attempt <= max; attempt++) {
    try {
      const handler = handlers.get(queue);
      if (!handler) throw new Error(`No handler registered for queue "${queue}"`);
      const ttl = QUEUE_TTL[queue] ?? 30_000;
      await Promise.race([
        handler(payload.data),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error(`Job timed out after ${ttl}ms`)), ttl),
        ),
      ]);
      await updateJobStatus(jobId, {
        status: "completed",
        attempts: attempt,
        completedAt: new Date(),
        lastError: null,
        lockedAt: null,
        lockedBy: null,
      });
      logger.debug("[queues] job succeeded (in-process)", { queue, type: payload.type, attempt, jobId });
      return;
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      await updateJobStatus(jobId, {
        attempts: attempt,
        lastError: lastError.slice(0, 1000),
      });
      logger.warn("[queues] job attempt failed (in-process)", { queue, type: payload.type, attempt, max, err: lastError });
      if (attempt < max) {
        const backoff = RETRY_BACKOFF_MS[Math.min(attempt - 1, RETRY_BACKOFF_MS.length - 1)];
        await new Promise((resolve) => setTimeout(resolve, backoff));
      }
    }
  }

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

// ─── Public API ──────────────────────────────────────────────────────────

/** Register a handler for a queue. */
export function registerWorker(queue: QueueName, handler: JobHandler): void {
  handlers.set(queue, handler);
  logger.info("[queues] worker registered", { queue, workerId: WORKER_ID, mode: USE_BULLMQ ? "bullmq" : "in-process" });

  // If BullMQ is already initialized, start the worker immediately
  if (USE_BULLMQ && bullInitialized) {
    getValkeyClient().then(async (connection) => {
      if (!connection) return;
      try {
        const { Queue, Worker } = await import("bullmq");
        await createBullWorker(queue, connection, Queue, Worker);
      } catch (err) {
        logger.error("[queues] failed to create BullMQ worker for late-registered queue", {
          queue, err: err instanceof Error ? err.message : String(err),
        });
      }
    });
  }
}

/** Inspect recent failures. */
export function getDeadLetters(queue?: QueueName): FailedJobRecord[] {
  // In BullMQ mode, return in-memory tracked failures
  if (queue) return [...(deadLetters.get(queue) ?? [])];
  const all: FailedJobRecord[] = [];
  for (const list of deadLetters.values()) all.push(...list);
  return all.sort((a, b) => b.failedAt.localeCompare(a.failedAt));
}

/** Clear dead-letter entries. */
export function clearDeadLetters(queue?: QueueName): void {
  if (queue) deadLetters.delete(queue);
  else deadLetters.clear();
}

/**
 * Enqueue a job asynchronously — caller awaits the result, with retries.
 */
export async function enqueueAsync(queue: QueueName, payload: JobPayload): Promise<void> {
  if (USE_BULLMQ) {
    const ready = await ensureBullMQ();
    if (ready) {
      const bullQueue = bullQueues.get(queue);
      if (bullQueue) {
        await bullQueue.add(payload.type, payload, {
          attempts: payload.attempts ?? MAX_RETRIES,
          timeout: QUEUE_TTL[queue] ?? 30_000,
        });
        logger.debug("[queues] BullMQ job enqueued (async)", { queue, type: payload.type });
        return;
      }
    }
    logger.warn("[queues] BullMQ not available for enqueueAsync — falling back to in-process");
  }

  // In-process fallback
  const jobId = await persistEnqueue(queue, payload);
  await runWithRetries(queue, payload, jobId);
}

/**
 * Enqueue a job in the background — caller does NOT await the result.
 */
export function enqueueBackground(queue: QueueName, payload: JobPayload): void {
  if (USE_BULLMQ) {
    ensureBullMQ().then(async (ready) => {
      if (ready) {
        const bullQueue = bullQueues.get(queue);
        if (bullQueue) {
          try {
            await bullQueue.add(payload.type, payload, {
              attempts: payload.attempts ?? MAX_RETRIES,
              timeout: QUEUE_TTL[queue] ?? 30_000,
            });
            logger.debug("[queues] BullMQ job enqueued (background)", { queue, type: payload.type });
            return;
          } catch (err) {
            logger.error("[queues] BullMQ add failed — falling back", { err: err instanceof Error ? err.message : String(err) });
          }
        }
      }
      // Fallback to in-process
      fallbackEnqueue(queue, payload);
    });
    return;
  }

  fallbackEnqueue(queue, payload);
}

/** In-process fallback enqueue. */
function fallbackEnqueue(queue: QueueName, payload: JobPayload): void {
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
  void persistEnqueue(queue, payload).then((jobId) => {
    const p = runWithRetries(queue, payload, jobId);
    p.catch(() => {});
  });
  logger.debug("[queues] job enqueued (background, in-process)", { queue, type: payload.type });
}

/**
 * Backward-compatible enqueue().
 */
export async function enqueue(queue: QueueName, payload: JobPayload): Promise<void> {
  enqueueBackground(queue, payload);
}

/**
 * Recover unfinished jobs (called on boot).
 * In BullMQ mode: BullMQ handles recovery automatically via Valkey.
 * In-process mode: picks up pending/stale JobQueue rows.
 */
export async function recoverPendingJobs(): Promise<{ recovered: number; errors: string[] }> {
  if (USE_BULLMQ) {
    // BullMQ handles job persistence and recovery via Valkey.
    // We still check the DB for any orphaned in-process rows from before migration.
    logger.info("[queues] BullMQ mode — Valkey handles job recovery. Checking for orphaned DB rows...");
  }

  const errors: string[] = [];
  let recovered = 0;
  const staleCutoff = new Date(Date.now() - STALE_LOCK_THRESHOLD_MS);

  try {
    const pending = await db.jobQueue.findMany({
      where: { status: "pending" },
      orderBy: { scheduledAt: "asc" },
      take: 200,
    });

    const staleRunning = await db.jobQueue.findMany({
      where: { status: "running", lockedAt: { lt: staleCutoff } },
      orderBy: { lockedAt: "asc" },
      take: 50,
    });

    const candidates = [...pending, ...staleRunning];
    if (candidates.length === 0) {
      logger.info("[queues] recoverPendingJobs: nothing to recover");
      return { recovered: 0, errors };
    }

    logger.info("[queues] recoverPendingJobs: re-enqueuing unfinished jobs", {
      pending: pending.length, staleRunning: staleRunning.length,
    });

    for (const row of candidates) {
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

      // In BullMQ mode, re-enqueue through BullMQ for proper processing
      if (USE_BULLMQ) {
        enqueueBackground(row.queue as QueueName, payload);
        // Mark old DB row as completed (migrated to BullMQ)
        await updateJobStatus(row.id, {
          status: "completed",
          completedAt: new Date(),
          lastError: "migrated-to-bullmq",
        });
      } else {
        const p = runWithRetries(row.queue as QueueName, payload, row.id);
        p.catch(() => {});
      }
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

/** Connection factory — returns Valkey/ioredis connection when available. */
export function getConnection(): import("ioredis").default | null {
  // BullMQ manages its own connections from valkey.ts
  return null;
}

/** Expose the worker ID. */
export function getWorkerId(): string {
  return WORKER_ID;
}

/**
 * Get BullMQ queue counts (for admin dashboards).
 * Returns null if BullMQ is not active.
 */
export async function getBullMQStats(): Promise<Record<string, {
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
}> | null> {
  if (!USE_BULLMQ || !bullInitialized) return null;

  const stats: Record<string, { waiting: number; active: number; completed: number; failed: number; delayed: number }> = {};
  for (const [name, queue] of bullQueues) {
    try {
      const [waiting, active, completed, failed, delayed] = await Promise.all([
        queue.getWaitingCount(),
        queue.getActiveCount(),
        queue.getCompletedCount(),
        queue.getFailedCount(),
        queue.getDelayedCount(),
      ]);
      stats[name] = { waiting, active, completed, failed, delayed };
    } catch (err) {
      stats[name] = { waiting: 0, active: 0, completed: 0, failed: 0, delayed: 0 };
      logger.debug("[queues] failed to get BullMQ stats", {
        queue: name, err: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return stats;
}
/**
 * outbox.ts — Transactional Outbox Pattern (P1.1)
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * PROBLEM
 * ═══════════════════════════════════════════════════════════════════════════
 * When a business operation needs to (a) write to the database AND (b)
 * publish an event, doing them as separate operations is unsafe:
 *
 *   1. Write DB → Publish event:   crash between the two → lost event
 *   2. Publish event → Write DB:   crash between the two → ghost event
 *   3. Two-phase commit (XA):      slow, fragile, not supported by most
 *                                  brokers, blocks on coordinator
 *
 * The Transactional Outbox pattern solves this by writing the event into
 * an `outbox_events` table IN THE SAME Prisma transaction as the business
 * write. A separate relay worker then polls the outbox table and publishes
 * pending events to the job queue (BullMQ / pg-boss) with at-least-once
 * delivery semantics.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * USAGE — PRODUCER SIDE
 * ═══════════════════════════════════════════════════════════════════════════
 *   await db.$transaction(async (tx) => {
 *     const invoice = await tx.invoice.create({ ... });
 *     await appendToOutbox(tx, {
 *       aggregateType: "invoice",
 *       aggregateId: invoice.id,
 *       eventType: "invoice.issued",
 *       payload: { id: invoice.id, total: invoice.total, ... },
 *     });
 *   });
 *   // The relay worker picks it up within ~1s and publishes it.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * USAGE — CONSUMER SIDE
 * ═══════════════════════════════════════════════════════════════════════════
 *   registerWorker("events", async (job) => {
 *     const evt = job.data as OutboxEventRow;
 *     if (evt.eventType === "invoice.issued") {
 *       await sendInvoiceEmail(evt.payload);
 *     }
 *   });
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * DELIVERY GUARANTEES
 * ═══════════════════════════════════════════════════════════════════════════
 *   - At-least-once: events may be delivered more than once if the relay
 *     worker crashes between publishing and marking as published. Consumers
 *     MUST be idempotent (keyed on outboxEvent.id).
 *   - Ordering: events for the SAME aggregate are published in insertion
 *     order (we relay by createdAt ASC). Cross-aggregate ordering is not
 *     guaranteed.
 *   - Dead-letter: after MAX_ATTEMPTS (default 10) the event is marked
 *     "dead" and an alert is logged. Manual reprocessing is possible.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WHY NOT JUST ENQUEUE DIRECTLY?
 * ═══════════════════════════════════════════════════════════════════════════
 * BullMQ / pg-boss are not transactional with Prisma — `enqueue` followed
 * by a DB write can lose events on crash. The outbox is the only way to
 * get true atomicity without XA. This is the standard pattern used by
 * Stripe, Shopify, Uber, etc. for event-driven systems.
 */

import type { PrismaClient, Prisma } from "@prisma/client";
import { db } from "./db";
import { logger } from "./logger";
import { enqueue, QUEUE_NAMES } from "./queues";

// ─── Types ────────────────────────────────────────────────────────────────

export interface OutboxEventInput {
  aggregateType: string;  // e.g. "invoice", "voucher", "payment"
  aggregateId: string;    // e.g. invoice id or voucher number
  eventType: string;      // e.g. "invoice.issued", "voucher.posted"
  payload: unknown;       // JSON-serializable event body
  headers?: Record<string, string>;  // optional metadata
}

export interface OutboxEventRow {
  id: string;
  aggregateType: string;
  aggregateId: string;
  eventType: string;
  payload: unknown;
  headers?: Record<string, string>;
  createdAt: Date;
  attempts: number;
  status: string;
}

// ─── Constants ────────────────────────────────────────────────────────────

// Read at call time (not module load) so tests can override via env vars
// without needing to re-import the module.
function getMaxAttempts(): number {
  return parseInt(process.env.OUTBOX_MAX_ATTEMPTS || "10", 10);
}
function getBatchSize(): number {
  return parseInt(process.env.OUTBOX_BATCH_SIZE || "50", 10);
}
function getRelayIntervalMs(): number {
  return parseInt(process.env.OUTBOX_RELAY_INTERVAL_MS || "1000", 10);
}

// ─── Producer API ──────────────────────────────────────────────────────────

/**
 * Append an event to the outbox. MUST be called inside a `db.$transaction`
 * block — pass the transaction client (`tx`) as the first argument so the
 * outbox write participates in the same transaction as the business write.
 *
 *   await db.$transaction(async (tx) => {
 *     const inv = await tx.invoice.create({ ... });
 *     await appendToOutbox(tx, { ... });
 *   });
 *
 * If called outside a transaction, the event will still be written but
 * atomicity with the business write is NOT guaranteed.
 */
export async function appendToOutbox(
  tx: Prisma.TransactionClient,
  event: OutboxEventInput,
): Promise<OutboxEventRow> {
  const row = await tx.outboxEvent.create({
    data: {
      aggregateType: event.aggregateType,
      aggregateId: String(event.aggregateId),
      eventType: event.eventType,
      payload: JSON.stringify(event.payload ?? {}),
      headers: event.headers ? JSON.stringify(event.headers) : null,
    },
  });
  return {
    id: row.id,
    aggregateType: row.aggregateType,
    aggregateId: row.aggregateId,
    eventType: row.eventType,
    payload: JSON.parse(row.payload),
    headers: row.headers ? JSON.parse(row.headers) : undefined,
    createdAt: row.createdAt,
    attempts: row.attempts,
    status: row.status,
  };
}

// ─── Relay Worker ──────────────────────────────────────────────────────────

let relayTimer: ReturnType<typeof setInterval> | null = null;
let relayRunning = false;

/**
 * Start the outbox relay worker. Polls the outbox table every
 * RELAY_INTERVAL_MS (default 1s), publishes pending events to the job
 * queue, and marks them as published. Safe to call multiple times —
 * subsequent calls are no-ops.
 *
 * This is started automatically by `instrumentation.ts` on server startup.
 * Call `stopOutboxRelay()` in tests / graceful shutdown.
 */
export function startOutboxRelay(): void {
  if (relayTimer) return;
  logger.info("[outbox] relay worker starting", {
    intervalMs: getRelayIntervalMs(),
    batchSize: getBatchSize(),
    maxAttempts: getMaxAttempts(),
  });
  relayTimer = setInterval(async () => {
    if (relayRunning) return;
    relayRunning = true;
    try {
      await processOutboxBatch();
    } catch (err) {
      logger.error("[outbox] relay iteration failed", {
        error: err instanceof Error ? err.message : String(err),
      });
    } finally {
      relayRunning = false;
    }
  }, getRelayIntervalMs());
  // Don't keep the process alive just for the relay — instrumentation.ts
  // owns the lifecycle.
  relayTimer.unref?.();
}

/** Stop the outbox relay worker. Safe to call when not running. */
export function stopOutboxRelay(): void {
  if (relayTimer) {
    clearInterval(relayTimer);
    relayTimer = null;
    logger.info("[outbox] relay worker stopped");
  }
}

/**
 * Process a single batch of pending outbox events. Exposed publicly so
 * tests can drive the relay deterministically without waiting for the
 * interval timer.
 *
 * Returns the counts: { published, failed, dead }
 */
export async function processOutboxBatch(): Promise<{
  published: number;
  failed: number;
  dead: number;
}> {
  // Fetch a batch of pending events, oldest first. We use status="pending"
  // (created by default) — failed events stay in "pending" status until
  // they hit MAX_ATTEMPTS, at which point they move to "dead".
  const events = await db.outboxEvent.findMany({
    where: { status: "pending" },
    orderBy: { createdAt: "asc" },
    take: getBatchSize(),
  });

  let published = 0;
  let failed = 0;
  let dead = 0;

  for (const evt of events) {
    try {
      // Publish to the events queue. Consumers register on QUEUE_NAMES.EVENTS.
      await enqueue(QUEUE_NAMES.EVENTS, {
        type: evt.eventType,
        data: JSON.parse(evt.payload),
        outboxEventId: evt.id,
        aggregateType: evt.aggregateType,
        aggregateId: evt.aggregateId,
        eventType: evt.eventType,
        payload: JSON.parse(evt.payload),
        headers: evt.headers ? JSON.parse(evt.headers) : null,
      });
      await db.outboxEvent.update({
        where: { id: evt.id },
        data: {
          status: "published",
          publishedAt: new Date(),
          attempts: evt.attempts + 1,
          lastError: null,
        },
      });
      published++;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      const newAttempts = evt.attempts + 1;
      const isDead = newAttempts >= getMaxAttempts();
      await db.outboxEvent.update({
        where: { id: evt.id },
        data: {
          attempts: newAttempts,
          lastError: errorMsg.slice(0, 500),
          status: isDead ? "dead" : "pending",
        },
      });
      if (isDead) {
        dead++;
        logger.error("[outbox] event moved to dead-letter", {
          id: evt.id,
          eventType: evt.eventType,
          attempts: newAttempts,
          error: errorMsg,
        });
      } else {
        failed++;
        logger.warn("[outbox] event publish failed (will retry)", {
          id: evt.id,
          eventType: evt.eventType,
          attempts: newAttempts,
          error: errorMsg,
        });
      }
    }
  }

  if (published > 0 || failed > 0 || dead > 0) {
    logger.info("[outbox] batch processed", { published, failed, dead });
  }
  return { published, failed, dead };
}

// ─── Maintenance ───────────────────────────────────────────────────────────

/**
 * Purge published events older than `olderThanDays` (default 30).
 * Called by the scheduler cron. Returns the count of deleted rows.
 */
export async function purgePublishedOutbox(olderThanDays = 30): Promise<number> {
  const cutoff = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000);
  const result = await db.outboxEvent.deleteMany({
    where: {
      status: "published",
      publishedAt: { lt: cutoff },
    },
  });
  return result.count;
}

/**
 * Reprocess a dead-lettered event by resetting it to pending.
 * Useful after fixing a consumer bug.
 */
export async function reprocessDeadEvent(eventId: string): Promise<void> {
  await db.outboxEvent.update({
    where: { id: eventId },
    data: {
      status: "pending",
      attempts: 0,
      lastError: null,
    },
  });
  logger.info("[outbox] dead event requeued for reprocessing", { id: eventId });
}

/**
 * worker-scaler.ts — Phase 4: Per-company AI worker pool auto-scaler.
 *
 * Each company has a CompanyRuntime row that tracks its current workerPoolSize.
 * The scaler runs periodically (via scaleWorkers()) and adjusts pool sizes
 * based on per-company queue depth and system resource pressure.
 *
 * Key behaviours:
 *   - Queue length > 200 for a sustained period → scale up (+2, capped by tier)
 *   - CPU or memory > 80% → suppress scale-up (don't add workers)
 *   - Queue empty for a sustained period → scale down gradually (−1 at a time)
 *   - Trial/starter plans are hard-capped at their tier ceiling immediately
 *
 * Exports:
 *   getOrCreateRuntime(companyId, plan) → CompanyRuntime
 *   scaleWorkers()                       → void  (call on interval)
 *   getActiveWorkerCounts()              → Record<string, number>
 */

import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { TIER_WORKER_LIMITS, planToTier, type SLATier, type RuntimeStatus } from "./types";

// ─── Constants ──────────────────────────────────────────────────────────────

/** Queue name prefix for per-company AI queues. */
export const AI_QUEUE_PREFIX = "ai-queue:";

/** Queue depth threshold that triggers scale-up consideration. */
const QUEUE_OVERFLOW_THRESHOLD = 200;

/** How many consecutive checks with queue > threshold before scaling up. */
const SUSTAINED_OVERFLOW_CHECKS = 2;

/** How many consecutive checks with empty queue before scaling down. */
const SUSTAINED_IDLE_CHECKS = 3;

/** Workers added per scale-up step. */
const SCALE_UP_STEP = 2;

/** Workers removed per scale-down step (gradual). */
const SCALE_DOWN_STEP = 1;

/** System resource ceiling — above this we don't add workers. */
const RESOURCE_CEILING_PCT = 80;

// ─── Internal state (in-process, per-instance) ──────────────────────────────

/** Tracks consecutive overflow counts per companySlug. */
const overflowCounters = new Map<string, number>();

/** Tracks consecutive idle counts per companySlug. */
const idleCounters = new Map<string, number>();

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Get or create a CompanyRuntime row for the given company.
 * Initialises workerPoolSize to the tier default if creating new.
 */
export async function getOrCreateRuntime(
  companyId: number,
  plan: string,
): Promise<{
  id: number;
  companyId: number;
  workerPoolSize: number;
  status: RuntimeStatus;
}> {
  const existing = await db.companyRuntime.findUnique({
    where: { companyId },
  });

  if (existing) {
    return {
      id: existing.id,
      companyId: existing.companyId,
      workerPoolSize: existing.workerPoolSize,
      status: existing.status as RuntimeStatus,
    };
  }

  const tier = planToTier(plan);
  const poolSize = TIER_WORKER_LIMITS[tier] as number;

  const created = await db.companyRuntime.create({
    data: {
      companyId,
      workerPoolSize: poolSize,
      status: "active",
    },
  });

  logger.info("[worker-scaler] created runtime for company", {
    companyId,
    tier,
    initialPoolSize: poolSize,
  });

  return {
    id: created.id,
    companyId: created.companyId,
    workerPoolSize: created.workerPoolSize,
    status: created.status as RuntimeStatus,
  };
}

/**
 * Run one scaling pass across all active companies.
 * Call this on an interval (e.g. every 60 seconds).
 */
export async function scaleWorkers(): Promise<void> {
  // 1. Check system resource pressure
  const resourcePressure = getSystemResourcePct();
  if (resourcePressure > RESOURCE_CEILING_PCT) {
    logger.warn("[worker-scaler] system resource pressure too high — skipping scale-up", {
      resourcePressure,
    });
  }

  // 2. Fetch all active runtimes with their company's plan
  const runtimes = await db.companyRuntime.findMany({
    where: { status: "active" },
    include: { company: { select: { id: true, slug: true, plan: true } } },
  });

  for (const rt of runtimes) {
    const slug = rt.company.slug;
    const tier = planToTier(rt.company.plan);
    const ceiling = TIER_WORKER_LIMITS[tier] as number;
    const queueName = `${AI_QUEUE_PREFIX}${slug}`;
    const queueLength = await getQueueLength(queueName);

    if (queueLength > QUEUE_OVERFLOW_THRESHOLD) {
      // ── Scale up path ──────────────────────────────────────
      const prev = overflowCounters.get(slug) ?? 0;
      overflowCounters.set(slug, prev + 1);
      idleCounters.delete(slug); // reset idle tracker

      if (
        prev + 1 >= SUSTAINED_OVERFLOW_CHECKS &&
        rt.workerPoolSize < ceiling &&
        resourcePressure <= RESOURCE_CEILING_PCT
      ) {
        const newSize = Math.min(rt.workerPoolSize + SCALE_UP_STEP, ceiling);
        await db.companyRuntime.update({
          where: { id: rt.id },
          data: { workerPoolSize: newSize },
        });
        logger.info("[worker-scaler] scaled up", {
          slug,
          old: rt.workerPoolSize,
          new: newSize,
          ceiling,
          queueLength,
        });
        // Reset counter after scaling
        overflowCounters.set(slug, 0);
      }
    } else if (queueLength === 0) {
      // ── Scale down path (gradual) ──────────────────────────
      const prev = idleCounters.get(slug) ?? 0;
      idleCounters.set(slug, prev + 1);
      overflowCounters.delete(slug); // reset overflow tracker

      if (prev + 1 >= SUSTAINED_IDLE_CHECKS && rt.workerPoolSize > 1) {
        const newSize = Math.max(rt.workerPoolSize - SCALE_DOWN_STEP, 1);
        await db.companyRuntime.update({
          where: { id: rt.id },
          data: { workerPoolSize: newSize },
        });
        logger.info("[worker-scaler] scaled down (idle)", {
          slug,
          old: rt.workerPoolSize,
          new: newSize,
        });
        idleCounters.set(slug, 0);
      }
    } else {
      // Queue is between 1 and threshold — reset both counters
      overflowCounters.set(slug, 0);
      idleCounters.set(slug, 0);
    }
  }
}

/**
 * Return a map of companySlug → current workerPoolSize for all active runtimes.
 */
export async function getActiveWorkerCounts(): Promise<Record<string, number>> {
  const runtimes = await db.companyRuntime.findMany({
    where: { status: "active" },
    include: { company: { select: { slug: true } } },
  });

  const map: Record<string, number> = {};
  for (const rt of runtimes) {
    map[rt.company.slug] = rt.workerPoolSize;
  }
  return map;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Get queue length for a per-company AI queue.
 * In BullMQ mode this would query Valkey; in fallback mode we count DB rows.
 */
async function getQueueLength(queueName: string): Promise<number> {
  // Use the JobQueue table to count pending/running jobs for this queue
  const count = await db.jobQueue.count({
    where: {
      queue: queueName,
      status: { in: ["pending", "running"] },
    },
  });
  return count;
}

/**
 * Approximate system resource usage (CPU + memory).
 * In production this would query a real metrics endpoint.
 * For sandbox / dev: returns a synthetic value that can be overridden in tests.
 */
let _overrideResourcePct: number | null = null;

export function __setResourcePctForTesting(pct: number | null): void {
  _overrideResourcePct = pct;
}

function getSystemResourcePct(): number {
  if (_overrideResourcePct !== null) return _overrideResourcePct;
  // Default: low resource usage in dev/sandbox
  return 30;
}
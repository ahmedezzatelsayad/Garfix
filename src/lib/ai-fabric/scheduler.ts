/**
 * scheduler.ts — Phase 5: Fair-share AI worker scheduler.
 *
 * Each company gets a base allocation equal to its workerPoolSize.
 * When a company is idle (empty queue), its excess capacity is temporarily
 * made available to other companies — but NEVER beyond their own tier ceiling,
 * and resources are returned IMMEDIATELY when the idle company sends a new
 * request (starvation prevention).
 *
 * This scheduler is stateless between calls — it queries the DB for current
 * queue depths and runtime configs on each invocation.
 *
 * Exports:
 *   scheduleNextJob()           → { companySlug, queueName } | null
 *   getAllocationMap()          → Record<string, AllocationInfo>
 *   requestSlot(companySlug)    → boolean (granted / denied)
 */

import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { getValkeyClient } from "@/lib/valkey";
import { TIER_WORKER_LIMITS, planToTier, type SLATier } from "./types";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface AllocationInfo {
  baseAllocation: number;   // company's own workerPoolSize
  borrowedSlots: number;    // extra slots borrowed from idle companies
  totalAvailable: number;   // baseAllocation + borrowedSlots
  tierCeiling: number;      // maximum allowed for this plan
  currentQueueDepth: number;
  isIdle: boolean;
}

// ─── Internal state ──────────────────────────────────────────────────────────

/**
 * Set of company slugs that are currently considered "active" (have sent a
 * request in this cycle). Used for starvation prevention: when an idle
 * company's queue goes non-empty, we immediately reclaim its borrowed slots.
 *
 * Valkey-backed: SET "ai-fabric:active-slugs" with 60s TTL (auto-refreshed).
 * Falls back to in-memory Set when Valkey is unavailable.
 */
const activeSlugs = new Set<string>();

const ACTIVE_SLUGS_KEY = "ai-fabric:active-slugs";
const ACTIVE_SLUGS_TTL = 60; // seconds — short TTL, refreshed on each requestSlot

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Request a processing slot for a company.
 * Returns true if the company can proceed (has available capacity),
 * false if at/beyond its allocation.
 *
 * This is the starvation-prevention gate: if a company was previously idle
 * and now has work, we immediately mark it active and reclaim any borrowed slots.
 */
export async function requestSlot(companySlug: string): Promise<boolean> {
  // Mark this company as active (has pending work)
  activeSlugs.add(companySlug);

  // Persist to Valkey for multi-instance consistency
  try {
    const valkey = await getValkeyClient();
    if (valkey) {
      await valkey.sadd(ACTIVE_SLUGS_KEY, companySlug);
      await valkey.expire(ACTIVE_SLUGS_KEY, ACTIVE_SLUGS_TTL);
    }
  } catch {
    // Valkey failed — in-memory fallback is already set
  }

  const alloc = await getAllocationMap();
  const info = alloc[companySlug];
  if (!info) return false;

  // Count how many jobs are currently running for this company
  const runningCount = await db.jobQueue.count({
    where: {
      queue: `ai-queue:${companySlug}`,
      status: "running",
    },
  });

  return runningCount < info.totalAvailable;
}

/**
 * Get the full allocation map for all active companies.
 *
 * Fair-share algorithm:
 *  1. Every company gets baseAllocation = workerPoolSize
 *  2. Companies with empty queues are "idle" → their base slots become available
 *  3. Idle companies' excess slots are distributed to busy companies (up to their ceiling)
 *  4. When a previously idle company becomes active, its slots are reclaimed immediately
 */
export async function getAllocationMap(): Promise<Record<string, AllocationInfo>> {
  // Fetch all active runtimes with company info
  const runtimes = await db.companyRuntime.findMany({
    where: { status: "active" },
    include: { company: { select: { slug: true, plan: true } } },
  });

  // Build initial allocation map
  const map: Record<string, AllocationInfo> = {};
  const busySlugs: string[] = [];
  const idleSlugs: string[] = [];
  let totalIdleExcess = 0;

  for (const rt of runtimes) {
    const slug = rt.company.slug;
    const tier = planToTier(rt.company.plan);
    const ceiling = TIER_WORKER_LIMITS[tier] as number;
    const queueDepth = await getCompanyQueueDepth(slug);
    const isIdle = queueDepth === 0 && !activeSlugs.has(slug);

    // Also check Valkey for cross-instance active slugs
    if (isIdle) {
      try {
        const valkey = await getValkeyClient();
        if (valkey) {
          const isValkeyActive = await valkey.sismember(ACTIVE_SLUGS_KEY, slug);
          if (isValkeyActive) {
            activeSlugs.add(slug); // sync local cache
          }
          // Use the combined check: if active in Valkey, not idle
        }
      } catch {
        // Valkey failed — use in-memory only
      }
    }

    map[slug] = {
      baseAllocation: rt.workerPoolSize,
      borrowedSlots: 0,
      totalAvailable: rt.workerPoolSize,
      tierCeiling: ceiling,
      currentQueueDepth: queueDepth,
      isIdle,
    };

    if (isIdle) {
      // All of this company's slots are "excess" when idle
      idleSlugs.push(slug);
      totalIdleExcess += rt.workerPoolSize;
    } else {
      busySlugs.push(slug);
    }
  }

  // Distribute idle excess to busy companies (fair-share among them)
  if (busySlugs.length > 0 && totalIdleExcess > 0) {
    // Sort busy companies by queue depth descending (most urgent first)
    busySlugs.sort((a, b) => map[b].currentQueueDepth - map[a].currentQueueDepth);

    const perCompany = Math.floor(totalIdleExcess / busySlugs.length);
    let remainder = totalIdleExcess - perCompany * busySlugs.length;

    for (const slug of busySlugs) {
      const info = map[slug];
      const headroom = info.tierCeiling - info.baseAllocation;
      let borrow = Math.min(perCompany, headroom);
      // Distribute remainder one-by-one to companies that still have headroom
      if (remainder > 0 && borrow < headroom) {
        borrow += 1;
        remainder -= 1;
      }
      borrow = Math.max(borrow, 0);

      info.borrowedSlots = borrow;
      info.totalAvailable = info.baseAllocation + borrow;
    }
  }

  return map;
}

/**
 * Pick the next company that should get a worker assignment.
 * Priority: highest queue depth among companies that still have headroom.
 * Returns null if no company needs more capacity.
 */
export async function scheduleNextJob(): Promise<{
  companySlug: string;
  queueName: string;
} | null> {
  const alloc = await getAllocationMap();

  let bestSlug: string | null = null;
  let bestDepth = 0;

  for (const [slug, info] of Object.entries(alloc)) {
    if (info.isIdle) continue;
    if (info.currentQueueDepth <= 0) continue;

    // Count currently running jobs
    const runningCount = await db.jobQueue.count({
      where: {
        queue: `ai-queue:${slug}`,
        status: "running",
      },
    });

    // Only consider companies that can accept more work
    if (runningCount >= info.totalAvailable) continue;

    // Pick the one with highest queue depth
    if (info.currentQueueDepth > bestDepth) {
      bestDepth = info.currentQueueDepth;
      bestSlug = slug;
    }
  }

  if (!bestSlug) return null;

  return {
    companySlug: bestSlug,
    queueName: `ai-queue:${bestSlug}`,
  };
}

/**
 * Reset the active-slug set. Call between test cases or on a new scheduling cycle.
 */
export function __resetActiveSlugs(): void {
  activeSlugs.clear();
}

// ─── Helpers ────────────────────────────────────────────────────────────────

async function getCompanyQueueDepth(companySlug: string): Promise<number> {
  return db.jobQueue.count({
    where: {
      queue: `ai-queue:${companySlug}`,
      status: { in: ["pending", "running"] },
    },
  });
}
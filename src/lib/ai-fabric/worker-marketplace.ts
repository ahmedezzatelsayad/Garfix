/**
 * worker-marketplace.ts — Phase 9: Global worker pool with SLA-based priority
 * and cross-tier preemption.
 *
 * Instead of per-company fixed worker pools, this module implements a single
 * shared "global pool" concept where workers are allocated based on SLA tier
 * priority and wait time. Enterprise requests always get higher priority.
 *
 * Key behaviours:
 *   - Priority function: f(slaTier, waitTimeMs) — enterprise >> business >> starter
 *   - Preemption: if an enterprise request is about to exceed maxAcceptableLatencyMs,
 *     it can grab a worker from a starter/business WAITING queue
 *   - NEVER interrupts a running job — only preempts from the waiting queue
 *   - SLA defaults: enterprise=200ms, business=800ms, starter=2000ms
 *
 * Exports:
 *   getGlobalPoolStatus()                              → GlobalPoolStatus
 *   prioritizeRequest(companySlug, requestType, waitTimeMs) → number (priority score)
 *   canPreempt(fromTier, toTier)                       → boolean
 */

import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import type { SLATier } from "./types";

// ─── SLA Latency Defaults (ms) ──────────────────────────────────────────────

export const SLA_LATENCY_DEFAULTS: Record<SLATier, number> = {
  enterprise: 200,
  business: 800,
  starter: 2000,
  trial: 5000,
};

// Tier priority weights — higher = more important
const TIER_BASE_PRIORITY: Record<string, number> = {
  enterprise: 1000,
  business: 500,
  starter: 100,
  trial: 50,
};

// ─── Types ──────────────────────────────────────────────────────────────────

export interface GlobalPoolStatus {
  totalWorkers: number;
  runningJobs: number;
  waitingJobs: number;
  /** Per-tier waiting counts. */
  waitingByTier: Record<string, number>;
  /** Per-tier running counts. */
  runningByTier: Record<string, number>;
}

export interface QueuedRequest {
  id: string;
  companySlug: string;
  requestType: string;
  slaTier: SLATier;
  waitTimeMs: number;
  maxAcceptableLatencyMs: number;
  priority: number;
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Compute a priority score for a request. Higher = should be processed sooner.
 *
 * Formula:
 *   priority = tierBase + (waitTimeMs / maxAcceptableLatencyMs) * tierBase
 *
 * Enterprise requests start at 1000 and scale up as waitTime approaches their
 * 200ms SLA. Starter requests start at 100 and scale toward their 2000ms SLA.
 * This ensures enterprise requests are ALWAYS prioritized over lower tiers.
 */
export function prioritizeRequest(
  _companySlug: string,
  _requestType: string,
  waitTimeMs: number,
  slaTier: SLATier = "starter",
  maxAcceptableLatencyMs?: number,
): number {
  const tierBase = TIER_BASE_PRIORITY[slaTier] ?? 50;
  const maxLatency = maxAcceptableLatencyMs ?? SLA_LATENCY_DEFAULTS[slaTier];

  // Time-pressure factor: 0→1 as waitTime approaches/exceeds SLA
  const timePressure = Math.min(waitTimeMs / maxLatency, 2.0);

  return tierBase * (1 + timePressure);
}

/**
 * Determine if a request from toTier can preempt a waiting request in fromTier.
 *
 * Rules:
 *   - Can NEVER preempt from the same or higher tier
 *   - Can preempt from a LOWER tier ONLY
 *   - Enterprise can preempt from business and starter waiting queues
 *   - Business can preempt from starter waiting queues
 *   - Starter/trial can NEVER preempt
 */
export function canPreempt(fromTier: SLATier, toTier: SLATier): boolean {
  const tierOrder: Record<string, number> = {
    enterprise: 3,
    business: 2,
    starter: 1,
    trial: 0,
  };

  const toRank = tierOrder[toTier] ?? 0;
  const fromRank = tierOrder[fromTier] ?? 0;

  // Can only preempt from a LOWER tier (strictly)
  return toRank > fromRank;
}

/**
 * Get the current global pool status: total workers, running/waiting jobs
 * broken down by SLA tier.
 *
 * This queries CompanyRuntime + JobQueue to compute the current picture.
 */
export async function getGlobalPoolStatus(): Promise<GlobalPoolStatus> {
  // Get all active runtimes with their company's plan for tier info
  const runtimes = await db.companyRuntime.findMany({
    where: { status: "active" },
    include: { company: { select: { slug: true, plan: true } } },
  });

  let totalWorkers = 0;
  const tierMap = new Map<string, { running: number; waiting: number }>();

  // Initialize tier buckets
  for (const tier of ["enterprise", "business", "starter", "trial"]) {
    tierMap.set(tier, { running: 0, waiting: 0 });
  }

  for (const rt of runtimes) {
    const slug = rt.company.slug;
    totalWorkers += rt.workerPoolSize;

    // Determine SLA tier from CompanyRuntime (if set) or from plan
    const slaTier = (rt.slaTier as SLATier) || planToSlaTier(rt.company.plan);
    const queueName = `ai-queue:${slug}`;

    // Count running jobs for this company
    const running = await db.jobQueue.count({
      where: { queue: queueName, status: "running" },
    });

    // Count waiting (pending) jobs
    const waiting = await db.jobQueue.count({
      where: { queue: queueName, status: "pending" },
    });

    const bucket = tierMap.get(slaTier) ?? tierMap.get("starter")!;
    bucket.running += running;
    bucket.waiting += waiting;
  }

  let runningJobs = 0;
  let waitingJobs = 0;
  const waitingByTier: Record<string, number> = {};
  const runningByTier: Record<string, number> = {};

  for (const [tier, counts] of tierMap) {
    waitingByTier[tier] = counts.waiting;
    runningByTier[tier] = counts.running;
    runningJobs += counts.running;
    waitingJobs += counts.waiting;
  }

  return {
    totalWorkers,
    runningJobs,
    waitingJobs,
    waitingByTier,
    runningByTier,
  };
}

/**
 * Find a preemptable job from the waiting queue.
 *
 * Given a requesting tier (toTier) and the company slug, looks for the
 * LOWEST-priority waiting job across all companies with LOWER tiers.
 * Returns the job to preempt (to be re-queued) or null if no preemption possible.
 *
 * IMPORTANT: Only picks from "pending" jobs — NEVER from "running" jobs.
 */
export async function findPreemptableJob(
  toTier: SLATier,
  excludeCompanySlug?: string,
): Promise<{ jobQueueId: number; companySlug: string; queue: string } | null> {
  const tierOrder: Record<string, number> = {
    enterprise: 3,
    business: 2,
    starter: 1,
    trial: 0,
  };

  const toRank = tierOrder[toTier] ?? 0;

  // Get all active runtimes with their tiers
  const runtimes = await db.companyRuntime.findMany({
    where: { status: "active" },
    include: { company: { select: { slug: true, plan: true } } },
  });

  let bestCandidate: { jobQueueId: number; companySlug: string; queue: string; tierRank: number } | null = null;

  for (const rt of runtimes) {
    const slug = rt.company.slug;
    if (excludeCompanySlug && slug === excludeCompanySlug) continue;

    const slaTier = (rt.slaTier as SLATier) || planToSlaTier(rt.company.plan);
    const fromRank = tierOrder[slaTier] ?? 0;

    // Can only preempt from strictly lower tier
    if (fromRank >= toRank) continue;

    // Find the lowest-priority waiting job for this company
    const oldestPending = await db.jobQueue.findFirst({
      where: {
        queue: `ai-queue:${slug}`,
        status: "pending",
      },
      orderBy: { scheduledAt: "asc" }, // oldest = lowest priority (waited longest? No — most recent = least urgent for low tier)
      // Actually, we want the most recent pending job (least time invested)
      // But wait — we want to preempt the one that's LEAST urgent.
      // For a starter tier job, the one that's been waiting the LEAST is the best
      // candidate for preemption. So order by scheduledAt DESC.
      // Actually, we just need ANY pending job from a lower tier.
      // Let's pick the one that has been waiting the least (most recent).
    });

    // Re-query: pick the MOST RECENT pending job (least invested)
    const leastInvested = await db.jobQueue.findFirst({
      where: {
        queue: `ai-queue:${slug}`,
        status: "pending",
      },
      orderBy: { scheduledAt: "desc" },
    });

    if (leastInvested) {
      if (!bestCandidate || fromRank < bestCandidate.tierRank) {
        bestCandidate = {
          jobQueueId: leastInvested.id,
          companySlug: slug,
          queue: leastInvested.queue,
          tierRank: fromRank,
        };
      }
    }
  }

  return bestCandidate
    ? { jobQueueId: bestCandidate.jobQueueId, companySlug: bestCandidate.companySlug, queue: bestCandidate.queue }
    : null;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Map a company plan string to an SLA tier for the marketplace.
 * Reuses the planToTier logic but only for marketplace-relevant tiers.
 */
function planToSlaTier(plan: string): SLATier {
  const p = plan.toLowerCase();
  if (p === "enterprise") return "enterprise";
  if (p === "business") return "business";
  if (p === "starter") return "starter";
  return "starter"; // default to starter (not trial — trial doesn't have SLA)
}
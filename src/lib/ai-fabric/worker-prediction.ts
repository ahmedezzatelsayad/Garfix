/**
 * worker-prediction.ts — Phase 13: Predictive worker pre-scaling.
 *
 * Predicts known demand spikes (first/last day of month — accounting closings)
 * and pre-scales worker pools 10 minutes before the event window.
 *
 * Key behaviours:
 *   - Known events: first day of month, last day of month
 *   - 10 minutes before event → increase workerPoolSize for affected companies
 *   - After event window → gradually decrease (reuses worker-scaler's gradual pattern)
 *   - Only activates if AIRequestLog shows the event historically causes a spike
 *     (need 2+ months of data)
 *
 * Exports:
 *   KNOWN_EVENTS             — list of defined event types
 *   getUpcomingEvents()      — events within the next 24 hours
 *   shouldPreScale(event, companySlug) — whether to pre-scale for this event
 *   getPostEventScaleDown()  — companies currently in post-event wind-down
 */

import { db } from "@/lib/db";
import { logger } from "@/lib/logger";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface KnownEvent {
  type: "month_start" | "month_end";
  /** The actual date of the event (UTC). */
  eventDate: Date;
  /** Window start = 10 min before eventDate midnight UTC. */
  windowStart: Date;
  /** Window end = 2 hours after eventDate midnight UTC. */
  windowEnd: Date;
}

export interface UpcomingEvent extends KnownEvent {
  /** Milliseconds until windowStart. */
  msUntilWindow: number;
}

export interface ScaleDownTarget {
  companySlug: string;
  currentPoolSize: number;
  targetPoolSize: number;
  /** How many steps of −1 remain to reach target. */
  stepsRemaining: number;
}

// ─── Constants ──────────────────────────────────────────────────────────────

/** Minimum historical months of data required to validate spike. */
const MIN_HISTORY_MONTHS = 2;

/** Pre-scale lead time in ms (10 minutes). */
const PRE_SCALE_LEAD_MS = 10 * 60 * 1000;

/** Event window duration in ms (2 hours after event). */
const EVENT_WINDOW_MS = 2 * 60 * 60 * 1000;

/** Minimum spike multiplier to consider an event a real demand spike. */
const SPIKE_MULTIPLIER_THRESHOLD = 1.5;

/** Workers to add during pre-scale (capped by tier ceiling). */
const PRE_SCALE_WORKER_BOOST = 4;

/** Scale-down step size (−1 per step, matching worker-scaler pattern). */
const SCALE_DOWN_STEP = 1;

/** Number of minutes between scale-down steps. */
const SCALE_DOWN_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

// ─── Exported: KNOWN_EVENTS ─────────────────────────────────────────────────

export const KNOWN_EVENTS = ["month_start", "month_end"] as const;
export type KnownEventType = (typeof KNOWN_EVENTS)[number];

// ─── Internal state (in-process) ────────────────────────────────────────────

/** Tracks which companies have been pre-scaled for which event date. */
const preScaledMap = new Map<string, string>(); // "companySlug:eventDateStr" → true

/** Tracks post-event scale-down targets. */
const scaleDownTargets = new Map<string, { targetPoolSize: number; lastStepAt: number }>();

// ─── Exported: getUpcomingEvents ────────────────────────────────────────────

/**
 * Returns all known events within the next 24 hours.
 * For month_start/month_end, we look at the current month and next month boundaries.
 */
export function getUpcomingEvents(now: Date = new Date()): UpcomingEvent[] {
  const events: UpcomingEvent[] = [];
  const horizon = 24 * 60 * 60 * 1000; // 24 hours

  // Generate candidate events for this month and next month
  const candidates = generateMonthBoundaryEvents(now.getFullYear(), now.getMonth());
  const nextMonthCandidates = generateMonthBoundaryEvents(
    now.getFullYear(),
    now.getMonth() + 1,
  );
  candidates.push(...nextMonthCandidates);

  for (const event of candidates) {
    const msUntilWindow = event.windowStart.getTime() - now.getTime();
    // Include events whose window hasn't ended yet (including currently active)
    if (msUntilWindow <= horizon && now.getTime() < event.windowEnd.getTime()) {
      events.push({ ...event, msUntilWindow });
    }
  }

  return events;
}

/**
 * Generate month_start and month_end events for a given year/month.
 */
function generateMonthBoundaryEvents(year: number, month: number): KnownEvent[] {
  const events: KnownEvent[] = [];

  // First day of month
  const firstDay = new Date(Date.UTC(year, month, 1, 0, 0, 0));
  events.push({
    type: "month_start",
    eventDate: firstDay,
    windowStart: new Date(firstDay.getTime() - PRE_SCALE_LEAD_MS),
    windowEnd: new Date(firstDay.getTime() + EVENT_WINDOW_MS),
  });

  // Last day of month
  const lastDay = new Date(Date.UTC(year, month + 1, 0, 0, 0, 0));
  events.push({
    type: "month_end",
    eventDate: lastDay,
    windowStart: new Date(lastDay.getTime() - PRE_SCALE_LEAD_MS),
    windowEnd: new Date(lastDay.getTime() + EVENT_WINDOW_MS),
  });

  return events;
}

// ─── Exported: shouldPreScale ───────────────────────────────────────────────

/**
 * Determine whether a company should be pre-scaled for a given event.
 *
 * Only returns true if:
 *   1. We're within the pre-scale window (10 min before event)
 *   2. The company hasn't already been pre-scaled for this event
 *   3. Historical data shows the event causes a spike (2+ months, >= 1.5x normal)
 *
 * @param event    — the KnownEvent to evaluate
 * @param companySlug — the company to check
 * @param now     — current time (defaults to Date.now())
 */
export async function shouldPreScale(
  event: KnownEvent,
  companySlug: string,
  now: Date = new Date(),
): Promise<boolean> {
  // 1. Must be within the pre-scale window (between windowStart and eventDate)
  if (now.getTime() < event.windowStart.getTime() || now.getTime() > event.eventDate.getTime()) {
    return false;
  }

  // 2. Check if already pre-scaled for this event
  const eventKey = `${companySlug}:${event.eventDate.toISOString().slice(0, 10)}`;
  if (preScaledMap.has(eventKey)) {
    return false;
  }

  // 3. Check historical spike data (need 2+ months)
  const hasSpike = await checkHistoricalSpike(companySlug, event.type, now);
  if (!hasSpike) {
    logger.info("[worker-prediction] no historical spike — skipping pre-scale", {
      companySlug,
      eventType: event.type,
    });
    return false;
  }

  return true;
}

/**
 * Check if the given event type historically causes a request spike
 * for the company. Requires 2+ months of data with >= 1.5x normal rate.
 */
async function checkHistoricalSpike(
  companySlug: string,
  eventType: KnownEventType,
  now: Date = new Date(),
): Promise<boolean> {
  // Build date ranges for event days vs normal days over the past 3 months
  // All dates in UTC to match AIRequestLog storage
  const monthsToCheck = 3;
  const eventDayCounts: number[] = [];
  const normalDayCounts: number[] = [];

  const utcYear = now.getUTCFullYear();
  const utcMonth = now.getUTCMonth();

  for (let m = 1; m <= monthsToCheck; m++) {
    const lookbackYear = utcYear;
    const lookbackMonth = utcMonth - m;
    // Normalize month/year (handles negative months correctly)
    const eventDate = new Date(Date.UTC(lookbackYear, lookbackMonth, 1));
    const ey = eventDate.getUTCFullYear();
    const em = eventDate.getUTCMonth();

    let eventDay: Date;
    if (eventType === "month_start") {
      eventDay = new Date(Date.UTC(ey, em, 1));
    } else {
      eventDay = new Date(Date.UTC(ey, em + 1, 0));
    }

    // Count requests on the event day
    const nextDay = new Date(Date.UTC(ey, em, eventType === "month_start" ? 2 : 1));
    if (eventType === "month_end") {
      // For month_end, the event day is the last day, so next day is the 1st of next month
      nextDay.setTime(Date.UTC(ey, em + 1, 1));
    }

    const eventCount = await db.aIRequestLog.count({
      where: {
        companySlug,
        createdAt: { gte: eventDay, lt: nextDay },
      },
    });

    // Count requests on a "normal" day (15th of the same month)
    const normalDay = new Date(Date.UTC(ey, em, 15));
    const normalNextDay = new Date(Date.UTC(ey, em, 16));

    const normalCount = await db.aIRequestLog.count({
      where: {
        companySlug,
        createdAt: { gte: normalDay, lt: normalNextDay },
      },
    });

    eventDayCounts.push(eventCount);
    normalDayCounts.push(normalCount);
  }

  // Need at least MIN_HISTORY_MONTHS months with data
  const monthsWithData = eventDayCounts.filter((c) => c > 0 || normalDayCounts[eventDayCounts.indexOf(c)] > 0).length;
  if (monthsWithData < MIN_HISTORY_MONTHS) {
    return false;
  }

  // Calculate average event-day rate vs normal-day rate
  const totalEvent = eventDayCounts.reduce((a, b) => a + b, 0);
  const totalNormal = normalDayCounts.reduce((a, b) => a + b, 0);

  if (totalNormal === 0) return false; // Can't determine spike ratio without normal data

  const avgEventRate = totalEvent / monthsWithData;
  const avgNormalRate = totalNormal / monthsWithData;

  if (avgNormalRate === 0) return false;

  const spikeRatio = avgEventRate / avgNormalRate;

  logger.info("[worker-prediction] spike analysis", {
    companySlug,
    eventType,
    avgEventRate,
    avgNormalRate,
    spikeRatio,
    threshold: SPIKE_MULTIPLIER_THRESHOLD,
  });

  return spikeRatio >= SPIKE_MULTIPLIER_THRESHOLD;
}

/**
 * Execute the pre-scale: boost worker pool for a company.
 * Marks the company as pre-scaled so we don't double-boost.
 */
export async function executePreScale(
  event: KnownEvent,
  companySlug: string,
): Promise<void> {
  const company = await db.company.findUnique({
    where: { slug: companySlug },
    select: { id: true, plan: true },
  });

  if (!company) return;

  const tier = planToTier(company.plan);
  const ceiling = getTierCeiling(tier);

  const runtime = await db.companyRuntime.findUnique({
    where: { companyId: company.id },
  });

  if (!runtime || runtime.status !== "active") return;

  const newSize = Math.min(runtime.workerPoolSize + PRE_SCALE_WORKER_BOOST, ceiling);
  if (newSize === runtime.workerPoolSize) return; // already at ceiling

  // Record the pre-event pool size for scale-down target
  scaleDownTargets.set(companySlug, {
    targetPoolSize: runtime.workerPoolSize,
    lastStepAt: 0,
  });

  await db.companyRuntime.update({
    where: { id: runtime.id },
    data: { workerPoolSize: newSize },
  });

  // Mark as pre-scaled
  const eventKey = `${companySlug}:${event.eventDate.toISOString().slice(0, 10)}`;
  preScaledMap.set(eventKey, "true");

  logger.info("[worker-prediction] pre-scaled workers", {
    companySlug,
    eventType: event.type,
    oldSize: runtime.workerPoolSize,
    newSize,
    ceiling,
  });
}

// ─── Exported: getPostEventScaleDown ────────────────────────────────────────

/**
 * Returns companies that should be gradually scaled down after an event window.
 * Reuses the gradual scale-down pattern from worker-scaler (−1 per interval).
 *
 * Call this periodically (e.g. every 5 minutes) to step down worker pools.
 */
export async function getPostEventScaleDown(
  now: Date = new Date(),
): Promise<ScaleDownTarget[]> {
  const targets: ScaleDownTarget[] = [];

  for (const [companySlug, state] of scaleDownTargets.entries()) {
    const runtime = await db.companyRuntime.findFirst({
      where: {
        company: { slug: companySlug },
        status: "active",
      },
      include: { company: { select: { slug: true } } },
    });

    if (!runtime) {
      scaleDownTargets.delete(companySlug);
      continue;
    }

    // Check if enough time has passed for another step
    const interval = _overrideScaleDownInterval ?? SCALE_DOWN_INTERVAL_MS;
    if (now.getTime() - state.lastStepAt < interval) {
      targets.push({
        companySlug,
        currentPoolSize: runtime.workerPoolSize,
        targetPoolSize: state.targetPoolSize,
        stepsRemaining: runtime.workerPoolSize - state.targetPoolSize,
      });
      continue;
    }

    // Execute one scale-down step
    const newSize = Math.max(runtime.workerPoolSize - SCALE_DOWN_STEP, state.targetPoolSize);
    if (newSize !== runtime.workerPoolSize) {
      await db.companyRuntime.update({
        where: { id: runtime.id },
        data: { workerPoolSize: newSize },
      });

      logger.info("[worker-prediction] gradual scale-down step", {
        companySlug,
        oldSize: runtime.workerPoolSize,
        newSize,
        target: state.targetPoolSize,
      });
    }

    // Update last step time
    const stepsRemaining = newSize - state.targetPoolSize;
    if (stepsRemaining <= 0) {
      // Reached target — clean up
      scaleDownTargets.delete(companySlug);
    } else {
      state.lastStepAt = now.getTime();
      targets.push({
        companySlug,
        currentPoolSize: newSize,
        targetPoolSize: state.targetPoolSize,
        stepsRemaining,
      });
    }
  }

  return targets;
}

// ─── Testing helpers ────────────────────────────────────────────────────────

let _overrideScaleDownInterval: number | null = null;

/** Override scale-down interval for testing. */
export function __setScaleDownIntervalMs(ms: number | null): void {
  _overrideScaleDownInterval = ms;
}

/** Reset internal state for testing. */
export function __resetPredictionState(): void {
  preScaledMap.clear();
  scaleDownTargets.clear();
  _overrideScaleDownInterval = null;
}

/** Get the pre-scaled map for testing assertions. */
export function __getPreScaledMap(): Map<string, string> {
  return preScaledMap;
}

/** Get scale-down targets for testing. */
export function __getScaleDownTargets(): Map<string, { targetPoolSize: number; lastStepAt: number }> {
  return scaleDownTargets;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function planToTier(plan: string): string {
  const p = plan.toLowerCase();
  if (p === "enterprise") return "enterprise";
  if (p === "business") return "business";
  if (p === "starter") return "starter";
  return "trial";
}

function getTierCeiling(tier: string): number {
  const limits: Record<string, number> = {
    enterprise: 64,
    business: 4,
    starter: 1,
    trial: 1,
  };
  return limits[tier] ?? 1;
}
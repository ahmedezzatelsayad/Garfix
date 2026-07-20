/**
 * heat-map.ts — Phase 10: Hourly request heat map and predictive scaling.
 *
 * Builds a 24×7 matrix (hour × dayOfWeek) of average request counts from
 * AIRequestLog data. Uses this to suggest optimal workerPoolSize for the
 * current hour via getPredictiveScale().
 *
 * Minimum data requirement: 7 complete days of data.
 * Returns null from getHeatMap() if insufficient data.
 *
 * Exports:
 *   getHeatMap(companySlug, daysNeeded?)  → number[][] | null  (24 rows × 7 cols)
 *   getPredictiveScale(companySlug)       → number | null
 *   hasEnoughData(companySlug, daysNeeded?) → boolean
 */

import { db } from "@/lib/db";
import { logger } from "@/lib/logger";

// ─── Constants ──────────────────────────────────────────────────────────────

/** Minimum days of data required to build a meaningful heat map. */
const MIN_DAYS_REQUIRED = 7;

/** Default number of days to look back. */
const DEFAULT_DAYS_NEEDED = 7;

/** Workers per average request per hour (tunable scaling factor). */
const WORKERS_PER_REQUEST_PER_HOUR = 0.5;

/** Minimum suggested worker pool size. */
const MIN_SUGGESTED_WORKERS = 1;

/** Maximum suggested worker pool size. */
const MAX_SUGGESTED_WORKERS = 64;

// ─── Types ──────────────────────────────────────────────────────────────────

/**
 * 24×7 matrix: heatMap[hour][dayOfWeek] = average request count.
 * dayOfWeek: 0=Sunday, 1=Monday, ..., 6=Saturday
 */
export type HeatMapMatrix = number[][];

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Check if a company has enough historical data to build a heat map.
 *
 * @param companySlug - The company to check
 * @param daysNeeded - Number of days required (default: 7)
 * @returns true if the company has data spanning at least daysNeeded days
 */
export async function hasEnoughData(
  companySlug: string,
  daysNeeded: number = DEFAULT_DAYS_NEEDED,
): Promise<boolean> {
  const earliestLog = await db.aIRequestLog.findFirst({
    where: { companySlug },
    orderBy: { createdAt: "asc" },
    select: { createdAt: true },
  });

  if (!earliestLog) return false;

  const now = new Date();
  const daysSpan = (now.getTime() - earliestLog.createdAt.getTime()) / (1000 * 60 * 60 * 24);

  return daysSpan >= daysNeeded;
}

/**
 * Build a 24×7 heat map of average request counts for a company.
 *
 * Returns null if there is insufficient data (less than daysNeeded days
 * of history). The matrix is indexed as heatMap[hour][dayOfWeek].
 *
 * Each cell contains the AVERAGE number of requests in that hour+day slot
 * across all weeks in the lookback period.
 *
 * @param companySlug - The company to analyze
 * @param daysNeeded - Number of days to look back (default: 7)
 * @returns 24×7 matrix of average request counts, or null if insufficient data
 */
export async function getHeatMap(
  companySlug: string,
  daysNeeded: number = DEFAULT_DAYS_NEEDED,
): Promise<HeatMapMatrix | null> {
  // Check if we have enough data
  const enoughData = await hasEnoughData(companySlug, daysNeeded);
  if (!enoughData) return null;

  const since = new Date(Date.now() - daysNeeded * 24 * 60 * 60 * 1000);

  // Fetch all request logs in the period
  const logs = await db.aIRequestLog.findMany({
    where: {
      companySlug,
      createdAt: { gte: since },
    },
    select: { createdAt: true },
  });

  if (logs.length === 0) return null;

  // Build a 24×7 count matrix and a 24×7 day-count matrix
  // (track how many days contributed to each slot for averaging)
  const counts: number[][] = Array.from({ length: 24 }, () => Array(7).fill(0));
  const daySet: boolean[][] = Array.from({ length: 24 }, () => Array(7).fill(false));

  for (const log of logs) {
    const hour = log.createdAt.getHours(); // 0-23
    const dow = log.createdAt.getDay();    // 0=Sun, 6=Sat
    counts[hour][dow] += 1;
    daySet[hour][dow] = true;
  }

  // Compute averages: count / number_of_weeks_in_period
  const weeksInPeriod = daysNeeded / 7;
  const avgCounts: number[][] = Array.from({ length: 24 }, (_, h) =>
    Array.from({ length: 7 }, (_, d) => {
      if (!daySet[h][d]) return 0;
      return Math.round((counts[h][d] / weeksInPeriod) * 100) / 100;
    }),
  );

  return avgCounts;
}

/**
 * Suggest an optimal workerPoolSize based on current hour's historical load.
 *
 * Uses the heat map to look up the average request count for the current
 * hour and day-of-week, then applies a scaling factor.
 *
 * Returns null if there is insufficient historical data.
 *
 * @param companySlug - The company to analyze
 * @returns Suggested worker pool size, or null if insufficient data
 */
export async function getPredictiveScale(
  companySlug: string,
): Promise<number | null> {
  const heatMap = await getHeatMap(companySlug);
  if (!heatMap) return null;

  const now = new Date();
  const currentHour = now.getHours();
  const currentDow = now.getDay();

  const avgRequests = heatMap[currentHour][currentDow];

  // Apply scaling factor: workers = avgRequests * factor
  let suggested = Math.round(avgRequests * WORKERS_PER_REQUEST_PER_HOUR);

  // Clamp to bounds
  suggested = Math.max(MIN_SUGGESTED_WORKERS, Math.min(suggested, MAX_SUGGESTED_WORKERS));

  return suggested;
}
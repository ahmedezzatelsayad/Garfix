/**
 * ai-fabric/profit-engine.ts — Phase 8: Profit computation engine.
 *
 * Computes daily profit snapshots:
 *   revenue (from company subscription plan) - infra cost (estimated) -
 *   AI cost (from AIRequestLog.costUsd sum) - worker cost (estimated) = profit
 *
 * Revenue: estimated from company.plan (trial=0, starter=29, business=99, enterprise=299)
 * Infra cost: flat $5/day per active company (sandbox estimation, no metering)
 * Worker cost: $0.50/day per worker in CompanyRuntime.workerPoolSize
 * AI cost: REAL — sum of AIRequestLog.costUsd for the period
 *
 * Data sources:
 *   - Revenue:  db.company.plan (mapped to USD via PLAN_REVENUE_USD)
 *   - AI cost:  db.aIRequestLog.costUsd SUM for the period
 *   - Infra:    estimated (ESTIMATED_INFRA_COST_PER_COMPANY_PER_DAY)
 *   - Workers:  db.companyRuntime.workerPoolSize × ESTIMATED_WORKER_COST_PER_DAY
 */

import { db } from "@/lib/db";
import { logger } from "@/lib/logger";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ProfitSnapshotData {
  companySlug: string;
  periodStart: Date;
  periodEnd: Date;
  revenueUsd: number;
  infraCostUsd: number;
  aiCostUsd: number;
  workerCostUsd: number;
  profitUsd: number;
}

// ─── Revenue estimation ─────────────────────────────────────────────────────
// Source: db.company.plan — mapped to fixed USD amounts
// In production, this would come from a Stripe subscription or pricing table.
// For sandbox, plans are mapped to estimated monthly revenue.

/** Estimated monthly revenue per plan (USD) */
const PLAN_REVENUE_MONTHLY_USD: Record<string, number> = {
  trial: 0,
  starter: 29,
  business: 99,
  enterprise: 299,
};

/** Estimated daily infra cost per active company (USD) */
const ESTIMATED_INFRA_COST_PER_DAY = 5.0;

/** Estimated daily worker cost per worker (USD) */
const ESTIMATED_WORKER_COST_PER_DAY = 0.50;

// ─── Core Functions ─────────────────────────────────────────────────────────

/**
 * Save a profit snapshot for a company for a given period.
 *
 * Formula:
 *   revenue  = planRevenueMonthly / 30 * daysInPeriod
 *   aiCost   = SUM(AIRequestLog.costUsd) for the period   ← REAL data
 *   infra    = ESTIMATED_INFRA_COST_PER_DAY * daysInPeriod
 *   worker   = CompanyRuntime.workerPoolSize * ESTIMATED_WORKER_COST_PER_DAY * daysInPeriod
 *   profit   = revenue - aiCost - infra - worker
 *
 * @param companySlug - The company to compute profit for
 * @param periodStart - Start of the period
 * @param periodEnd   - End of the period
 * @returns The saved ProfitSnapshotData
 */
export async function saveProfitSnapshot(
  companySlug: string,
  periodStart: Date,
  periodEnd: Date,
): Promise<ProfitSnapshotData> {
  const daysInPeriod = Math.max(
    1,
    (periodEnd.getTime() - periodStart.getTime()) / (1000 * 60 * 60 * 24),
  );

  // ── 1. Revenue from company plan ───────────────────────────────────────
  // Source: db.company.findUnique({ where: { slug } }).plan → mapped via PLAN_REVENUE_MONTHLY_USD
  const company = await db.company.findUnique({
    where: { slug: companySlug },
    select: { plan: true },
  });
  const monthlyRevenue = company
    ? (PLAN_REVENUE_MONTHLY_USD[company.plan] ?? 0)
    : 0;
  const revenueUsd = Math.round((monthlyRevenue / 30) * daysInPeriod * 100) / 100;

  // ── 2. AI cost from real request logs ─────────────────────────────────
  // Source: db.aIRequestLog.aggregate SUM(costUsd) where companySlug and createdAt in period
  const aiCostAgg = await db.aIRequestLog.aggregate({
    where: {
      companySlug,
      createdAt: { gte: periodStart, lte: periodEnd },
    },
    _sum: { costUsd: true },
  });
  const aiCostUsd = aiCostAgg._sum.costUsd ?? 0;

  // ── 3. Infra cost (estimated) ─────────────────────────────────────────
  // Source: ESTIMATED_INFRA_COST_PER_DAY × daysInPeriod (no real metering in sandbox)
  const infraCostUsd =
    Math.round(ESTIMATED_INFRA_COST_PER_DAY * daysInPeriod * 100) / 100;

  // ── 4. Worker cost (estimated from CompanyRuntime) ─────────────────────
  // Source: db.companyRuntime.findUnique via company.id → workerPoolSize × ESTIMATED_WORKER_COST_PER_DAY
  let workerCostUsd = 0;
  if (company) {
    const companyWithId = await db.company.findUnique({
      where: { slug: companySlug },
      select: { id: true },
    });
    if (companyWithId) {
      const runtime = await db.companyRuntime.findUnique({
        where: { companyId: companyWithId.id },
        select: { workerPoolSize: true },
      });
      if (runtime) {
        workerCostUsd =
          Math.round(
            runtime.workerPoolSize * ESTIMATED_WORKER_COST_PER_DAY * daysInPeriod * 100,
          ) / 100;
      }
    }
  }

  // ── 5. Compute profit ──────────────────────────────────────────────────
  // Source: revenueUsd - infraCostUsd - aiCostUsd - workerCostUsd
  const profitUsd =
    Math.round((revenueUsd - infraCostUsd - aiCostUsd - workerCostUsd) * 100) / 100;

  // ── 6. Upsert to ProfitSnapshot table ──────────────────────────────────
  // Source: db.profitSnapshot.upsert on (companySlug, periodStart, periodEnd)
  await db.profitSnapshot.upsert({
    where: {
      // Use a composite key approach — find existing entry
      id: await findExistingSnapshotId(companySlug, periodStart, periodEnd),
    },
    create: {
      companySlug,
      periodStart,
      periodEnd,
      revenueUsd,
      infraCostUsd,
      aiCostUsd,
      workerCostUsd,
      profitUsd,
    },
    update: {
      revenueUsd,
      infraCostUsd,
      aiCostUsd,
      workerCostUsd,
      profitUsd,
    },
  });

  logger.info("[profit-engine] saved snapshot", {
    companySlug,
    periodStart: periodStart.toISOString(),
    periodEnd: periodEnd.toISOString(),
    revenueUsd,
    aiCostUsd,
    profitUsd,
  });

  return {
    companySlug,
    periodStart,
    periodEnd,
    revenueUsd,
    infraCostUsd,
    aiCostUsd,
    workerCostUsd,
    profitUsd,
  };
}

/**
 * Get profit history for a company (for charting).
 *
 * @param companySlug - The company
 * @param periods - How many recent snapshots to return (most recent first)
 * @returns Array of ProfitSnapshotData
 */
export async function getProfitHistory(
  companySlug: string,
  periods: number = 30,
): Promise<ProfitSnapshotData[]> {
  // Source: db.profitSnapshot.findMany ordered by periodStart desc
  const snapshots = await db.profitSnapshot.findMany({
    where: { companySlug },
    orderBy: { periodStart: "desc" },
    take: periods,
  });

  return snapshots.map((s) => ({
    companySlug: s.companySlug,
    periodStart: s.periodStart,
    periodEnd: s.periodEnd,
    revenueUsd: s.revenueUsd,
    infraCostUsd: s.infraCostUsd,
    aiCostUsd: s.aiCostUsd,
    workerCostUsd: s.workerCostUsd,
    profitUsd: s.profitUsd,
  }));
}

/**
 * Get platform-wide profit for a period (aggregate across all companies).
 *
 * @param periodStart - Start of the period
 * @param periodEnd - End of the period
 * @returns Aggregated ProfitSnapshotData with companySlug='platform'
 */
export async function getPlatformProfit(
  periodStart: Date,
  periodEnd: Date,
): Promise<ProfitSnapshotData & { companyCount: number }> {
  // Source: db.profitSnapshot.aggregate SUM over all companies for the period
  const agg = await db.profitSnapshot.aggregate({
    where: {
      periodStart: { gte: periodStart },
      periodEnd: { lte: periodEnd },
    },
    _sum: {
      revenueUsd: true,
      infraCostUsd: true,
      aiCostUsd: true,
      workerCostUsd: true,
      profitUsd: true,
    },
    _count: true,
  });

  // Source: db.company.count (total companies on platform)
  const companyCount = await db.company.count();

  return {
    companySlug: "platform",
    periodStart,
    periodEnd,
    revenueUsd: Math.round((agg._sum.revenueUsd ?? 0) * 100) / 100,
    infraCostUsd: Math.round((agg._sum.infraCostUsd ?? 0) * 100) / 100,
    aiCostUsd: Math.round((agg._sum.aiCostUsd ?? 0) * 100) / 100,
    workerCostUsd: Math.round((agg._sum.workerCostUsd ?? 0) * 100) / 100,
    profitUsd: Math.round((agg._sum.profitUsd ?? 0) * 100) / 100,
    companyCount,
  };
}

// ─── Internal Helpers ──────────────────────────────────────────────────────

/**
 * Find an existing ProfitSnapshot ID for upsert.
 * Returns 0 if no entry exists.
 */
async function findExistingSnapshotId(
  companySlug: string,
  periodStart: Date,
  periodEnd: Date,
): Promise<number> {
  const entry = await db.profitSnapshot.findFirst({
    where: {
      companySlug,
      periodStart,
      periodEnd,
    },
    select: { id: true },
  });
  return entry?.id ?? 0;
}
/**
 * ai-economy-engine.ts — Enhanced economy engine that connects profit margin
 * to cascade behavior. When margin drops, the system increases reliance on
 * cache/rules and decreases AI calls.
 *
 * This extends the basic BudgetEngine with revenue-aware margin calculation
 * and automatic cascade strategy adjustment.
 */

import { db } from "@/lib/db";
import { logger } from "@/lib/logger";

export interface EconomyStatus {
  companySlug: string;
  currentCostUsd: number;
  currentRevenueUsd: number;
  marginPct: number;
  forecastEndOfMonthMargin: number;
  strategy: "normal" | "conservative" | "critical";
  recommendedCascadeBoost: number; // 0-1, how much to boost cache/rule priority
}

const MARGIN_THRESHOLDS = {
  conservative: 0.30, // Below 30% margin → conservative mode
  critical: 0.10,     // Below 10% margin → critical mode (hard stop)
  normal: 0.50,       // Above 50% → normal operation
};

/** Get the full economy status for a company. */
export async function getEconomyStatus(companySlug: string): Promise<EconomyStatus> {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const daysElapsed = now.getDate();
  const daysRemaining = daysInMonth - daysElapsed;

  // Get actual AI cost from logs
  const costResult = await db.aIRequestLog.aggregate({
    where: {
      companySlug,
      createdAt: { gte: monthStart },
    },
    _sum: { costUsd: true },
  });

  const currentCostUsd = Number(costResult._sum.costUsd || 0);

  // Get revenue from plan (or billing system when available)
  const budget = await db.budgetConfig.findUnique({ where: { companySlug } });
  const monthlyBudgetUsd = budget?.monthlyBudgetUsd ? Number(budget.monthlyBudgetUsd) : 100;

  // Revenue estimate: use monthlyBudget as revenue proxy if no billing system
  // In production, this would come from the actual billing/subscription system
  const currentRevenueUsd = monthlyBudgetUsd; // TODO: replace with real revenue source

  const marginPct = currentRevenueUsd > 0
    ? (currentRevenueUsd - currentCostUsd) / currentRevenueUsd
    : 0;

  // Forecast end of month
  const dailyRate = daysElapsed > 0 ? currentCostUsd / daysElapsed : 0;
  const forecastEndOfMonthCost = currentCostUsd + dailyRate * daysRemaining;
  const forecastEndOfMonthMargin = currentRevenueUsd > 0
    ? (currentRevenueUsd - forecastEndOfMonthCost) / currentRevenueUsd
    : 0;

  // Determine strategy
  let strategy: "normal" | "conservative" | "critical" = "normal";
  let recommendedCascadeBoost = 0;

  if (marginPct < MARGIN_THRESHOLDS.critical || forecastEndOfMonthMargin < MARGIN_THRESHOLDS.critical) {
    strategy = "critical";
    recommendedCascadeBoost = 1.0;
  } else if (marginPct < MARGIN_THRESHOLDS.conservative || forecastEndOfMonthMargin < MARGIN_THRESHOLDS.conservative) {
    strategy = "conservative";
    recommendedCascadeBoost = 0.5;
  }

  return {
    companySlug,
    currentCostUsd,
    currentRevenueUsd,
    marginPct: Math.round(marginPct * 10000) / 100,
    forecastEndOfMonthMargin: Math.round(forecastEndOfMonthMargin * 10000) / 100,
    strategy,
    recommendedCascadeBoost,
  };
}

/** Check if a company should use economy mode (reduced AI calls). */
export async function shouldUseEconomyMode(companySlug: string): Promise<{
  economyMode: boolean;
  boost: number;
  reason?: string;
}> {
  try {
    const status = await getEconomyStatus(companySlug);
    if (status.strategy === "critical") {
      return { economyMode: true, boost: 1.0, reason: `Critical margin: ${status.marginPct}%` };
    }
    if (status.strategy === "conservative") {
      return { economyMode: true, boost: 0.5, reason: `Conservative margin: ${status.marginPct}%` };
    }
    return { economyMode: false, boost: 0 };
  } catch (err) {
    logger.warn("[economy-engine] failed to get economy status", {
      err: err instanceof Error ? err.message : String(err),
    });
    return { economyMode: false, boost: 0 };
  }
}
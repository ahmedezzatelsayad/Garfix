/**
 * ai-fabric/cost-optimizer.ts — Calculate actual AI cost savings.
 *
 * Phase 2 of AI Fabric. Reads AIRequestLog (populated by the gateway in
 * Phase 1) and computes:
 *
 *   1. calculateSavedCost(companyId, period):
 *      (if all requests went to AI × avg AI cost) - (actual total cost)
 *
 *   2. getCascadeBreakdown(companyId, period):
 *      Count + percentage of requests per resolvedBy stage
 *
 * All numbers come from real AIRequestLog records — no mocks, no estimates.
 * This is the data source for the "وفرت هذا الشهر: $X" widget and the
 * Founder Panel's cascade breakdown chart.
 *
 * Source: AIRequestLog table (from gateway.ts:logRequest)
 */

import { db } from "@/lib/db";
import type { CascadeBreakdownEntry, SavingsReport, CascadeStage } from "./types";

const CASCADE_STAGES: CascadeStage[] = ["cache", "pattern", "rule", "memory", "ai"];

/**
 * Get the cascade breakdown (count + percentage per stage) for a company
 * within a time period. Every number comes from a GROUP BY on AIRequestLog.
 *
 * Source: AIRequestLog.resolvedBy (from gateway.ts:logRequest)
 */
export async function getCascadeBreakdown(
  companySlug: string,
  periodStart: Date,
  periodEnd: Date,
): Promise<CascadeBreakdownEntry[]> {
  const logs = await db.aIRequestLog.groupBy({
    by: ["resolvedBy"],
    where: {
      companySlug,
      createdAt: { gte: periodStart, lte: periodEnd },
    },
    _count: true,
    _sum: { costUsd: true, latencyMs: true },
    orderBy: { _count: { resolvedBy: "desc" } },
  });

  const totalRequests = logs.reduce((sum, l) => sum + l._count, 0);
  if (totalRequests === 0) return [];

  return CASCADE_STAGES.map((stage) => {
    const log = logs.find((l) => l.resolvedBy === stage);
    const count = log?._count || 0;
    const totalCost = log?._sum.costUsd || 0;
    const totalLatency = log?._sum.latencyMs || 0;

    return {
      resolvedBy: stage,
      count,
      percentage: totalRequests > 0 ? Math.round((count / totalRequests) * 1000) / 10 : 0,
      totalCostUsd: Math.round(totalCost * 1e6) / 1e6,
      avgLatencyMs: count > 0 ? Math.round(totalLatency / count) : 0,
    };
  }).filter((e) => e.count > 0);
}

/**
 * Calculate the actual cost savings for a company in a period.
 *
 * Formula:
 *   hypotheticalCost = totalRequests × avgCostPerAiCall
 *   savedUsd = hypotheticalCost - actualCostUsd
 *
 * Where avgCostPerAiCall = sum(costUsd) / count(requests where resolvedBy='ai')
 * Only AI-resolved requests have a meaningful cost; cache/pattern/rule/memory
 * resolved requests have costUsd = 0 by design.
 *
 * Source: AIRequestLog.costUsd, AIRequestLog.resolvedBy
 */
export async function calculateSavedCost(
  companySlug: string,
  periodStart: Date,
  periodEnd: Date,
): Promise<SavingsReport> {
  // Get all logs for the period
  const allLogs = await db.aIRequestLog.findMany({
    where: {
      companySlug,
      createdAt: { gte: periodStart, lte: periodEnd },
    },
    select: { resolvedBy: true, costUsd: true, latencyMs: true, createdAt: true },
  });

  const totalRequests = allLogs.length;
  const actualCostUsd = allLogs.reduce((sum, l) => sum + l.costUsd, 0);

  // Calculate average AI call cost (only from resolvedBy='ai' records)
  const aiLogs = allLogs.filter((l) => l.resolvedBy === "ai");
  const avgAiCostPerCall = aiLogs.length > 0
    ? aiLogs.reduce((sum, l) => sum + l.costUsd, 0) / aiLogs.length
    : 0;

  // Hypothetical: if ALL requests went to AI
  const hypotheticalAiOnlyCostUsd = totalRequests * avgAiCostPerCall;
  const savedUsd = hypotheticalAiOnlyCostUsd - actualCostUsd;
  const savingsPct = hypotheticalAiOnlyCostUsd > 0
    ? Math.round((savedUsd / hypotheticalAiOnlyCostUsd) * 1000) / 10
    : 0;

  // Build breakdown
  const breakdown = CASCADE_STAGES.map((stage) => {
    const stageLogs = allLogs.filter((l) => l.resolvedBy === stage);
    const count = stageLogs.length;
    const totalCost = stageLogs.reduce((sum, l) => sum + l.costUsd, 0);
    const totalLatency = stageLogs.reduce((sum, l) => sum + l.latencyMs, 0);

    return {
      resolvedBy: stage,
      count,
      percentage: totalRequests > 0 ? Math.round((count / totalRequests) * 1000) / 10 : 0,
      totalCostUsd: Math.round(totalCost * 1e6) / 1e6,
      avgLatencyMs: count > 0 ? Math.round(totalLatency / count) : 0,
    };
  }).filter((e) => e.count > 0);

  return {
    companyId: companySlug,
    periodStart,
    periodEnd,
    totalRequests,
    actualCostUsd: Math.round(actualCostUsd * 1e6) / 1e6,
    hypotheticalAiOnlyCostUsd: Math.round(hypotheticalAiOnlyCostUsd * 1e6) / 1e6,
    savedUsd: Math.round(savedUsd * 1e6) / 1e6,
    savingsPct,
    breakdown,
  };
}

/**
 * Get aggregate savings across ALL companies (platform-wide).
 * Used by the Founder Panel to show total platform savings.
 *
 * Source: AIRequestLog (all companySlugs)
 */
export async function getPlatformSavings(
  periodStart: Date,
  periodEnd: Date,
): Promise<SavingsReport> {
  // Aggregate across all companies
  const allLogs = await db.aIRequestLog.findMany({
    where: {
      createdAt: { gte: periodStart, lte: periodEnd },
    },
    select: { resolvedBy: true, costUsd: true, latencyMs: true, companySlug: true, createdAt: true },
  });

  const totalRequests = allLogs.length;
  const actualCostUsd = allLogs.reduce((sum, l) => sum + l.costUsd, 0);

  const aiLogs = allLogs.filter((l) => l.resolvedBy === "ai");
  const avgAiCostPerCall = aiLogs.length > 0
    ? aiLogs.reduce((sum, l) => sum + l.costUsd, 0) / aiLogs.length
    : 0;

  const hypotheticalAiOnlyCostUsd = totalRequests * avgAiCostPerCall;
  const savedUsd = hypotheticalAiOnlyCostUsd - actualCostUsd;
  const savingsPct = hypotheticalAiOnlyCostUsd > 0
    ? Math.round((savedUsd / hypotheticalAiOnlyCostUsd) * 1000) / 10
    : 0;

  const breakdown = CASCADE_STAGES.map((stage) => {
    const stageLogs = allLogs.filter((l) => l.resolvedBy === stage);
    const count = stageLogs.length;
    const totalCost = stageLogs.reduce((sum, l) => sum + l.costUsd, 0);
    const totalLatency = stageLogs.reduce((sum, l) => sum + l.latencyMs, 0);

    return {
      resolvedBy: stage,
      count,
      percentage: totalRequests > 0 ? Math.round((count / totalRequests) * 1000) / 10 : 0,
      totalCostUsd: Math.round(totalCost * 1e6) / 1e6,
      avgLatencyMs: count > 0 ? Math.round(totalLatency / count) : 0,
    };
  }).filter((e) => e.count > 0);

  return {
    companyId: "platform",
    periodStart,
    periodEnd,
    totalRequests,
    actualCostUsd: Math.round(actualCostUsd * 1e6) / 1e6,
    hypotheticalAiOnlyCostUsd: Math.round(hypotheticalAiOnlyCostUsd * 1e6) / 1e6,
    savedUsd: Math.round(savedUsd * 1e6) / 1e6,
    savingsPct,
    breakdown,
  };
}
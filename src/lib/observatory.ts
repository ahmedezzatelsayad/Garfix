/**
 * observatory.ts — AI Request Observatory (Time Machine for AI decisions).
 *
 * For every AI request, the system records the full decision trace:
 *   Cache → Pattern → Rule → Memory → Provider → Worker → Queue → Budget → Cost → Result
 *
 * This enables replaying any past AI decision to understand WHY it was resolved
 * the way it was, including confidence scores, timing, and alternative paths.
 */

import { db } from "@/lib/db";
import { logger } from "./logger";

export interface DecisionTrace {
  companyId: string;
  requestId?: string;
  timestamp: string;
  requestType: string;
  normalizedInputHash: string;
  stages: StageResult[];
  finalResolvedBy: string;
  provider?: string;
  tokensUsed?: number;
  costUsd?: number;
  latencyMs: number;
  budgetStatus?: string;
  economyMode?: boolean;
  workerPoolSize?: number;
  queueDepth?: number;
  cacheHitCount?: number;
}

interface StageResult {
  stage: string;
  hit: boolean;
  latencyMs: number;
  detail?: string;
  confidence?: number;
}

/** Record a complete decision trace for an AI request. */
export async function recordDecisionTrace(trace: DecisionTrace): Promise<void> {
  try {
    // Store as an AIMemoryEntry with category 'decision_trace'
    await db.aIMemoryEntry.create({
      data: {
        companySlug: trace.companyId,
        category: "decision_trace",
        content: JSON.stringify(trace),
      },
    });
  } catch (err) {
    logger.error("[observatory] failed to record decision trace", {
      err: err instanceof Error ? err.message : String(err),
    });
  }
}

/** Retrieve the decision trace for a specific request. */
export async function getDecisionTrace(
  companyId: string,
  normalizedInputHash: string,
): Promise<DecisionTrace | null> {
  try {
    // Search recent decision traces
    const entries = await db.aIMemoryEntry.findMany({
      where: {
        companySlug: companyId,
        category: "decision_trace",
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });

    for (const entry of entries) {
      try {
        const trace = JSON.parse(entry.content) as DecisionTrace;
        if (trace.normalizedInputHash === normalizedInputHash) {
          return trace;
        }
      } catch {
        // skip corrupted entries
      }
    }
    return null;
  } catch (err) {
    logger.error("[observatory] failed to retrieve decision trace", {
      err: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

/** Get decision traces for a company with optional filtering. */
export async function getDecisionTraces(params: {
  companyId: string;
  requestType?: string;
  resolvedBy?: string;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
}): Promise<DecisionTrace[]> {
  const entries = await db.aIMemoryEntry.findMany({
    where: {
      companySlug: params.companyId,
      category: "decision_trace",
    },
    orderBy: { createdAt: "desc" },
    take: params.limit || 50,
  });

  return entries
    .map((e) => {
      try {
        return JSON.parse(e.content) as DecisionTrace;
      } catch {
        return null;
      }
    })
    .filter((t): t is DecisionTrace => {
      if (!t) return false;
      if (params.requestType && t.requestType !== params.requestType) return false;
      if (params.resolvedBy && t.finalResolvedBy !== params.resolvedBy) return false;
      return true;
    });
}

/** Get explainability summary for a company. */
export async function getExplainabilitySummary(companyId: string, periodDays: number = 30) {
  const since = new Date(Date.now() - periodDays * 86400000);

  const logs = await db.aIRequestLog.findMany({
    where: {
      companySlug: companyId,
      createdAt: { gte: since },
    },
  });

  const total = logs.length;
  const byStage: Record<string, number> = {};
  let totalLatency = 0;
  let totalCost = 0;

  for (const log of logs) {
    byStage[log.resolvedBy] = (byStage[log.resolvedBy] || 0) + 1;
    totalLatency += log.latencyMs;
    totalCost += Number(log.costUsd) || 0;
  }

  return {
    period: `${periodDays} days`,
    totalRequests: total,
    avgLatencyMs: total > 0 ? Math.round(totalLatency / total) : 0,
    totalCostUsd: totalCost.toFixed(4),
    avgCostUsd: total > 0 ? (totalCost / total).toFixed(6) : "0",
    breakdown: Object.entries(byStage).map(([stage, count]) => ({
      stage,
      count,
      percentage: total > 0 ? ((count / total) * 100).toFixed(1) + "%" : "0%",
    })),
  };
}
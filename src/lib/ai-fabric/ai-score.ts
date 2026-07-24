/**
 * ai-score.ts — Phase 14: Daily AI efficiency score per company.
 *
 * Computes a 0-100 score measuring how well the cascade avoids AI calls:
 *
 *   score = 100 * (1 - aiCallPct) - 20 * (avgCostPerRequest / 0.01)
 *   clamped to [0, 100]
 *
 * The score rewards non-AI resolution (cache/pattern/rule/memory) and
 * penalizes high per-request cost.
 *
 * If score < 60 → triggers alerts:
 *   - Notification for Learning Engine to prioritize this company
 *   - Notification for Cost Optimizer to review cache TTL
 *
 * Exports:
 *   computeAndSaveScore(companySlug) → AIScoreSnapshot (upserted)
 *   getLatestScore(companySlug)       → AIScoreSnapshot | null
 *   getAllScores()                    → AIScoreSnapshot[] (today, all companies)
 */

import { db } from "@/lib/db";
import { logger } from "@/lib/logger";

// ─── Constants ──────────────────────────────────────────────────────────────

/** Score threshold below which alerts are triggered. */
const SCORE_ALERT_THRESHOLD = 60;

/** Reference cost for penalty normalization ($0.01 per request). */
const COST_REFERENCE = 0.01;

/** Cost penalty weight in the formula. */
const COST_PENALTY_WEIGHT = 20;

/** Notification user UID for system alerts (founder panel). */
const SYSTEM_ALERT_USER = "system";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface AIScoreResult {
  companySlug: string;
  period: string;
  score: number;
  cacheHitPct: number;
  ruleHitPct: number;
  aiCallPct: number;
  avgCostPerRequest: number;
  alerted: boolean;
}

// ─── Exported: computeAndSaveScore ──────────────────────────────────────────

/**
 * Compute today's AI score for a company from AIRequestLog data,
 * then save/upsert to AIScoreSnapshot.
 *
 * The score formula:
 *   score = 100 * (1 - aiCallPct) - 20 * (avgCostPerRequest / 0.01)
 *   clamped to [0, 100]
 *
 * Where aiCallPct = (requests where resolvedBy='ai') / totalRequests
 * And avgCostPerRequest = totalCostUsd / totalRequests
 */
export async function computeAndSaveScore(companySlug: string): Promise<AIScoreResult> {
  const today = new Date();
  const dayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const dayEnd = new Date(dayStart);
  dayEnd.setDate(dayEnd.getDate() + 1);

  const period = dayStart.toISOString().slice(0, 10); // "YYYY-MM-DD"

  // Fetch all AI request logs for today
  const logs = await db.aIRequestLog.findMany({
    where: {
      companySlug,
      createdAt: { gte: dayStart, lt: dayEnd },
    },
    select: {
      resolvedBy: true,
      costUsd: true,
    },
  });

  const totalRequests = logs.length;
  let cacheHitPct = 0;
  let ruleHitPct = 0;
  let aiCallPct = 0;
  let avgCostPerRequest = 0;

  if (totalRequests > 0) {
    // Count per cascade stage
    const cacheCount = logs.filter((l) => l.resolvedBy === "cache").length;
    const ruleCount = logs.filter((l) => l.resolvedBy === "rule").length;
    const aiCount = logs.filter((l) => l.resolvedBy === "ai").length;

    cacheHitPct = Math.round((cacheCount / totalRequests) * 1000) / 10;
    ruleHitPct = Math.round((ruleCount / totalRequests) * 1000) / 10;
    aiCallPct = Math.round((aiCount / totalRequests) * 1000) / 10;

    const totalCost = logs.reduce((sum, l) => sum + l.costUsd, 0);
    avgCostPerRequest = Math.round((totalCost / totalRequests) * 1e6) / 1e6;
  }

  // Compute score
  const rawScore = 100 * (1 - aiCallPct / 100) - COST_PENALTY_WEIGHT * (avgCostPerRequest / COST_REFERENCE);
  const score = Math.round(Math.max(0, Math.min(100, rawScore)) * 10) / 10;

  // Upsert to AIScoreSnapshot
  await db.aiScoreSnapshot.upsert({
    where: {
      companySlug_period: { companySlug, period },
    },
    create: {
      companySlug,
      period,
      score,
      cacheHitPct,
      ruleHitPct,
      aiCallPct,
      avgCostPerRequest,
    },
    update: {
      score,
      cacheHitPct,
      ruleHitPct,
      aiCallPct,
      avgCostPerRequest,
    },
  });

  // Trigger alerts if score < 60
  let alerted = false;
  if (score < SCORE_ALERT_THRESHOLD && totalRequests > 0) {
    await triggerScoreAlerts(companySlug, score, period);
    alerted = true;
  }

  logger.info("[ai-score] computed score", {
    companySlug,
    period,
    score,
    aiCallPct,
    avgCostPerRequest,
    alerted,
  });

  return {
    companySlug,
    period,
    score,
    cacheHitPct,
    ruleHitPct,
    aiCallPct,
    avgCostPerRequest,
    alerted,
  };
}

// ─── Exported: getLatestScore ───────────────────────────────────────────────

/**
 * Get the most recent AIScoreSnapshot for a company.
 */
export async function getLatestScore(
  companySlug: string,
): Promise<{ period: string; score: number; cacheHitPct: number; ruleHitPct: number; aiCallPct: number; avgCostPerRequest: number } | null> {
  const snapshot = await db.aiScoreSnapshot.findFirst({
    where: { companySlug },
    orderBy: { createdAt: "desc" },
  });

  if (!snapshot) return null;

  return {
    period: snapshot.period,
    score: snapshot.score,
    cacheHitPct: snapshot.cacheHitPct,
    ruleHitPct: snapshot.ruleHitPct,
    aiCallPct: snapshot.aiCallPct,
    avgCostPerRequest: snapshot.avgCostPerRequest,
  };
}

// ─── Exported: getAllScores ──────────────────────────────────────────────────

/**
 * Get today's scores for all companies.
 */
export async function getAllScores(): Promise<AIScoreResult[]> {
  const today = new Date().toISOString().slice(0, 10);

  const snapshots = await db.aiScoreSnapshot.findMany({
    where: { period: today },
    orderBy: { score: "asc" },
  });

  return snapshots.map((s) => ({
    companySlug: s.companySlug,
    period: s.period,
    score: s.score,
    cacheHitPct: s.cacheHitPct,
    ruleHitPct: s.ruleHitPct,
    aiCallPct: s.aiCallPct,
    avgCostPerRequest: s.avgCostPerRequest,
    alerted: s.score < SCORE_ALERT_THRESHOLD,
  }));
}

// ─── Internal: triggerScoreAlerts ───────────────────────────────────────────

/**
 * When score < 60, log notifications for:
 *   1. Learning Engine to prioritize this company
 *   2. Cost Optimizer to review cache TTL
 */
async function triggerScoreAlerts(
  companySlug: string,
  score: number,
  period: string,
): Promise<void> {
  // Check for existing alert today to avoid duplicates
  const existingAlerts = await db.notification.count({
    where: {
      userUid: SYSTEM_ALERT_USER,
      companySlug,
      title: { contains: "AI Score Alert" },
      createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
    },
  });

  if (existingAlerts > 0) return;

  // Alert for Learning Engine
  await db.notification.create({
    data: {
      userUid: SYSTEM_ALERT_USER,
      companySlug,
      type: "general",
      title: `AI Score Alert: ${companySlug} (${period})`,
      body: `AI efficiency score dropped to ${score}/100. Learning Engine should prioritize this company for rule compilation.`,
    },
  });

  // Alert for Cost Optimizer
  await db.notification.create({
    data: {
      userUid: SYSTEM_ALERT_USER,
      companySlug,
      type: "general",
      title: `Cost Review Needed: ${companySlug} (${period})`,
      body: `AI efficiency score is ${score}/100. Cost Optimizer should review cache TTL and cascade configuration for this company.`,
    },
  });
}
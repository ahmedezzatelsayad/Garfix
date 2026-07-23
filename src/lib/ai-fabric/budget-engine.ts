/**
 * budget-engine.ts — Phase 6: Per-company AI spend budgeting.
 *
 * Core behaviours:
 *   - recordSpend(companySlug, costUsd) → increments BudgetConfig.currentSpendUsd
 *   - getBudgetStatus(companySlug) → full status including forecast
 *   - checkBudgetGate(companySlug) → allowed / denied (hard-stop logic)
 *   - forecastMonthlySpend(companySlug) → linear projection to month-end
 *   - Internal notifications via db.notification.create when threshold crossed
 *
 * When hardStop is active:
 *   - AI calls are blocked (gate returns false)
 *   - Cache/rule/memory stages get higher effective priority
 *   - The gateway should check checkBudgetGate() before calling AI providers
 */

import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { getValkeyClient } from "@/lib/valkey";
import type { BudgetStatus } from "./types";

// ─── Constants ──────────────────────────────────────────────────────────────

/** Milliseconds in one day (for monthly projection). */
const MS_PER_DAY = 86_400_000;

/** Average days in a month for linear projection. */
const DAYS_PER_MONTH = 30;

// ─── Internal state ─────────────────────────────────────────────────────────

/**
 * Track which companies have already had their alert threshold notification
 * sent this month. Prevents duplicate alerts on every spend record.
 *
 * Valkey-backed: key = "ai-fabric:budget-alert:{companySlug}", value = "YYYY-MM",
 * TTL = 32 days (auto-expires after month boundary).
 * Falls back to in-memory Map when Valkey is unavailable.
 */
const alertedThisMonth = new Map<string, string>();

const ALERT_KEY_PREFIX = "ai-fabric:budget-alert:";
const ALERT_TTL_SECONDS = 32 * 24 * 3600; // 32 days — auto-expires after month boundary

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Record AI spend for a company. Increments BudgetConfig.currentSpendUsd
 * and triggers alert/hard-stop checks.
 *
 * Creates a BudgetConfig row if it doesn't exist (with default $0 budget —
 * caller should seed real values via founder panel).
 */
export async function recordSpend(
  companySlug: string,
  costUsd: number,
): Promise<void> {
  if (costUsd <= 0) return;

  // Upsert: create if missing, increment if exists
  const config = await db.budgetConfig.upsert({
    where: { companySlug },
    create: {
      companySlug,
      monthlyBudgetUsd: 0,
      currentSpendUsd: costUsd,
      alertThresholdPct: 80,
      hardStopEnabled: false,
    },
    update: {
      currentSpendUsd: { increment: costUsd },
    },
  });

  // Check if alert threshold crossed
  if (config.monthlyBudgetUsd > 0) {
    const pct = (config.currentSpendUsd / config.monthlyBudgetUsd) * 100;
    const threshold = config.alertThresholdPct;
    const currentMonth = new Date().toISOString().slice(0, 7); // "YYYY-MM"
    const lastAlertMonth = alertedThisMonth.get(companySlug);

    // Check Valkey first for multi-instance consistency
    let alreadyAlerted = lastAlertMonth === currentMonth;
    if (!alreadyAlerted) {
      try {
        const valkey = await getValkeyClient();
        if (valkey) {
          const valkeyMonth = await valkey.get(`${ALERT_KEY_PREFIX}${companySlug}`);
          alreadyAlerted = valkeyMonth === currentMonth;
        }
      } catch {
 // Valkey check failed — proceed with in-memory check only
      }
    }

    if (pct >= threshold && !alreadyAlerted) {
      // Send internal notification for founder panel visibility
      await db.notification.create({
        data: {
          userUid: "system",
          companySlug,
          type: "general",
          title: `AI Budget Alert: ${Math.round(pct)}% used`,
          body: `${companySlug} has spent $${config.currentSpendUsd.toFixed(2)} of $${config.monthlyBudgetUsd.toFixed(2)} monthly AI budget (${Math.round(pct)}%). Threshold: ${threshold}%.`,
        },
      });
      alertedThisMonth.set(companySlug, currentMonth);
      // Persist to Valkey with TTL for cross-instance consistency
      try {
        const valkey = await getValkeyClient();
        if (valkey) {
          await valkey.set(`${ALERT_KEY_PREFIX}${companySlug}`, currentMonth, "EX", ALERT_TTL_SECONDS);
        }
      } catch {
 // Valkey write failed — in-memory fallback is already set
      }
      logger.warn("[budget-engine] alert triggered", {
        companySlug,
        pct: Math.round(pct),
        threshold,
      });
    }
  }
}

/**
 * Get the full budget status for a company, including forecast.
 */
export async function getBudgetStatus(companySlug: string): Promise<BudgetStatus | null> {
  const config = await db.budgetConfig.findUnique({
    where: { companySlug },
  });

  if (!config) return null;

  const spendPct = config.monthlyBudgetUsd > 0
    ? (config.currentSpendUsd / config.monthlyBudgetUsd) * 100
    : 0;

  const alertTriggered = spendPct >= config.alertThresholdPct;
  const hardStopActive = config.hardStopEnabled && config.currentSpendUsd >= config.monthlyBudgetUsd;
  const forecast = await forecastMonthlySpend(companySlug);

  return {
    companySlug,
    monthlyBudgetUsd: config.monthlyBudgetUsd,
    currentSpendUsd: config.currentSpendUsd,
    spendPct,
    alertTriggered,
    hardStopActive,
    forecastMonthlySpendUsd: forecast,
  };
}

/**
 * Check if a company is allowed to make an AI call.
 *
 * When hardStopEnabled=true and currentSpend >= budget → return false.
 * This causes the gateway to deprioritize/redirect AI calls toward
 * cache/rule/memory stages instead.
 *
 * If no BudgetConfig exists or hardStop is disabled → always returns true.
 */
export async function checkBudgetGate(companySlug: string): Promise<boolean> {
  const config = await db.budgetConfig.findUnique({
    where: { companySlug },
  });

  if (!config) return true;  // No budget config = no gate
  if (!config.hardStopEnabled) return true;  // Hard stop not enabled

  // Gate blocks if at or over budget
  return config.currentSpendUsd < config.monthlyBudgetUsd;
}

/**
 * Linear projection of monthly spend based on current rate.
 *
 * Formula: forecast = currentSpend × (daysInMonth / daysElapsed)
 * Returns null if there are no AI request logs (no data to project from).
 */
export async function forecastMonthlySpend(
  companySlug: string,
): Promise<number | null> {
  // Find the earliest AI request log this month for this company
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const earliestLog = await db.aIRequestLog.findFirst({
    where: {
      companySlug,
      createdAt: { gte: monthStart },
    },
    orderBy: { createdAt: "asc" },
    select: { createdAt: true },
  });

  if (!earliestLog) return null; // No data this month

  const daysElapsed = Math.max(
    (now.getTime() - earliestLog.createdAt.getTime()) / MS_PER_DAY,
    0.01, // avoid division by zero
  );

  const currentSpend = await db.aIRequestLog.aggregate({
    where: {
      companySlug,
      createdAt: { gte: monthStart },
    },
    _sum: { costUsd: true },
  });

  const totalSpend = currentSpend._sum.costUsd ?? 0;
  const forecasted = totalSpend * (DAYS_PER_MONTH / daysElapsed);

  return Math.round(forecasted * 100) / 100; // 2 decimal places
}

// ─── Test helpers ───────────────────────────────────────────────────────────

/**
 * Reset internal alert tracking. Used in tests to allow re-triggering alerts.
 */
export function __resetAlertTracking(): void {
  alertedThisMonth.clear();
}
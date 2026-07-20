/**
 * ai-fabric/types.ts — shared types for the AI Fabric cascade system.
 *
 * Phase 0: schema-only foundation
 * Phase 1: gateway (5-stage cascade)
 * Phase 2: cost optimizer
 * Phase 3: provider optimizer
 * Phase 4-16: economics layer
 */

// ─── Cascade resolution stages ──────────────────────────────────────────────
// These must match the resolvedBy values stored in AIRequestLog.

export const CASCADE_STAGES = ["cache", "pattern", "rule", "memory", "ai"] as const;
export type CascadeStage = (typeof CASCADE_STAGES)[number];

// ─── Request types ──────────────────────────────────────────────────────────

export type AIRequestType =
  | "ocr"
  | "whatsapp"
  | "financial_analysis"
  | "matching"
  | "other";

// ─── AI Memory categories ───────────────────────────────────────────────────

export type AIMemoryCategory =
  | "product"
  | "customer"
  | "invoice"
  | "rule"
  | "decision";

// ─── Gateway request / result ───────────────────────────────────────────────

export interface GatewayRequest {
  companySlug: string;
  requestType: AIRequestType;
  /** Normalized input string that determines cache key + pattern matching. */
  normalizedInput: string;
  /** Raw input (may contain PII — not used for hashing). */
  rawInput?: string;
  /** Optional metadata for stage-specific processing (e.g. invoice text for pattern engine). */
  context?: Record<string, unknown>;
  /** Optional capability hint for the Smart Router (Phase 3). */
  capability?: string;
}

export interface GatewayResult<T = unknown> {
  /** The resolved data. Null only on hard failure. */
  data: T | null;
  /** Which cascade stage resolved the request. */
  resolvedBy: CascadeStage;
  /** The provider/model string if resolvedBy === 'ai' (e.g. "openrouter/deepseek/deepseek-chat"). */
  provider?: string;
  /** Tokens consumed (only when resolvedBy === 'ai'). */
  tokensUsed?: number;
  /** Actual USD cost (only when resolvedBy === 'ai'). */
  costUsd?: number;
  /** Wall-clock latency of the entire cascade (ms). */
  latencyMs: number;
  /** If data came from cache, the cache entry's hitCount after increment. */
  cacheHitCount?: number;
}

// ─── Cache key generation ───────────────────────────────────────────────────

/**
 * Fast non-crypto hash for cache keys (djb2 + FNV-1a mix).
 * Collisions = cache miss (safe). 16-byte hex output.
 * Same algorithm used in costOptimizer.ts for consistency.
 */
export function fabricHash(input: string): string {
  let h1 = 5381;
  let h2 = 2166136261;
  for (let i = 0; i < input.length; i++) {
    const c = input.charCodeAt(i);
    h1 = ((h1 << 5) + h1 + c) | 0;
    h2 = Math.imul(h2 ^ c, 16777619) | 0;
  }
  return (
    (h1 >>> 0).toString(16).padStart(8, "0") +
    (h2 >>> 0).toString(16).padStart(8, "0")
  );
}

// ─── Cost optimizer types (Phase 2) ────────────────────────────────────────

export interface CascadeBreakdownEntry {
  resolvedBy: CascadeStage;
  count: number;
  percentage: number;
  totalCostUsd: number;
  avgLatencyMs: number;
}

export interface SavingsReport {
  companyId: string;
  periodStart: Date;
  periodEnd: Date;
  totalRequests: number;
  actualCostUsd: number;
  hypotheticalAiOnlyCostUsd: number;
  savedUsd: number;
  savingsPct: number;
  breakdown: CascadeBreakdownEntry[];
}

// ─── Provider optimizer types (Phase 3) ────────────────────────────────────

export interface ProviderRoutingDecision {
  taskType: AIRequestType;
  primaryProvider: string;
  fallbackProvider: string;
  usedFallback: boolean;
  fallbackReason?: string;
}

// ─── Worker scaler types (Phase 4) ─────────────────────────────────────────

export type SLATier = "enterprise" | "business" | "starter" | "trial";
export type RuntimeStatus = "active" | "throttled" | "paused";

export const TIER_WORKER_LIMITS: Record<SLATier, number> = {
  enterprise: 64,
  business: 4,
  starter: 1,
  trial: 1,
} as Record<string, number>;

/** Map Company.plan string → SLATier (lowercased). */
export function planToTier(plan: string): SLATier {
  const p = plan.toLowerCase();
  if (p === "enterprise") return "enterprise";
  if (p === "business") return "business";
  if (p === "starter") return "starter";
  return "trial";
}

// ─── Budget engine types (Phase 6) ─────────────────────────────────────────

export interface BudgetStatus {
  companySlug: string;
  monthlyBudgetUsd: number;
  currentSpendUsd: number;
  spendPct: number;
  alertTriggered: boolean;
  hardStopActive: boolean;
  forecastMonthlySpendUsd: number | null;
}

// ─── AI Score types (Phase 14) ─────────────────────────────────────────────

export interface AIScore {
  companyId: string;
  score: number;       // 0-100
  cacheHitPct: number;
  ruleHitPct: number;
  aiCallPct: number;
  avgCostPerRequest: number;
}
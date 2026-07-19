/**
 * costOptimizer.ts — AI Orchestration Layer: request-level cost decision tree.
 *
 * The final layer before an AI call is made. For every incoming request it
 * answers: "do we even need to call the AI, and if so, which tier?"
 *
 * Decision chain (cheap → expensive):
 *
 *   1. PATTERN?      — Invoice-Brain already learned this document shape.
 *                      Return the cached template extraction. Zero AI tokens.
 *   2. CACHE?        — Identical prompt seen recently. Return cached reply.
 *                      Zero AI tokens. (TTL 1h, keyed by sha256(prompt).)
 *   3. SIMPLE TASK?  — Greeting, FAQ, small-talk. Route to a FREE-tier model
 *                      via the Smart Router.
 *   4. COMPLEX TASK? — Invoice extraction on a novel format, multi-step
 *                      reasoning, report generation. Route to the best HEALTHY
 *                      model regardless of tier (may be paid).
 *
 * The optimizer is advisory: callers consult `decide()` and act on the result.
 * It never calls the AI itself — that stays in the route handler so the
 * optimizer remains a pure function of the request context (testable,
 * fast, no side effects).
 */
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { getModelsForCapability, type AICapability } from "./modelRegistry";

export type CostDecisionAction =
  | "use-pattern" // Invoice-Brain template hit — no AI call
  | "use-cache" // Recent identical prompt — no AI call
  | "route-free" // Simple task → free-tier model
  | "route-best"; // Complex task → best healthy model (any tier)

export interface CostDecision {
  action: CostDecisionAction;
  /** Preferred tier when action is route-free / route-best. */
  tier: "free" | "paid" | "any";
  /** Cache key (sha256) when action is use-cache. */
  cacheKey?: string;
  /** Reasoning trail for the dashboard. */
  reason: string;
  /** Estimated savings vs. always-calling-AI (0-1). */
  estimatedSavings: number;
}

// ─── Prompt cache ───────────────────────────────────────────────────────────
//
// A tiny in-memory LRU of recent AI replies, keyed by sha256(messages hash).
// Survives only within the current server process — that's intentional: we
// want to dedupe burst traffic (a user clicking the same button twice) without
// permanently serving stale data. TTL 1 hour.

interface CacheEntry {
  reply: string;
  expiresAt: number;
}
const REPLY_CACHE = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 60 * 60 * 1000; // 1h
const CACHE_MAX = 200;

// Periodic sweep (lazy — runs on every decide() call if 5min elapsed)
let lastSweep = Date.now();
function sweepIfNeeded(): void {
  const now = Date.now();
  if (now - lastSweep < 5 * 60 * 1000) return;
  lastSweep = now;
  for (const [k, v] of REPLY_CACHE) {
    if (v.expiresAt < now) REPLY_CACHE.delete(k);
  }
}

async function sha256(s: string): Promise<string> {
  // Cache keys don't need cryptographic strength — collisions just mean a
  // cache miss. Use a fast non-crypto hash (djb2 + FNV mix) to avoid pulling
  // in the webcrypto subsystem, which can crash Turbopack in some sandboxed
  // runtimes. 16-byte hex output is plenty for deduping prompts.
  let h1 = 5381;
  let h2 = 2166136261;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = ((h1 << 5) + h1 + c) | 0;
    h2 = Math.imul(h2 ^ c, 16777619) | 0;
  }
  return (
    (h1 >>> 0).toString(16).padStart(8, "0") +
    (h2 >>> 0).toString(16).padStart(8, "0")
  );
}

export function getCachedReply(cacheKey: string): string | null {
  const entry = REPLY_CACHE.get(cacheKey);
  if (!entry) return null;
  if (entry.expiresAt < Date.now()) {
    REPLY_CACHE.delete(cacheKey);
    return null;
  }
  return entry.reply;
}

export function setCachedReply(cacheKey: string, reply: string): void {
  if (REPLY_CACHE.size >= CACHE_MAX) {
    // Evict oldest (first inserted) — simple LRU approximation
    const firstKey = REPLY_CACHE.keys().next().value;
    if (firstKey) REPLY_CACHE.delete(firstKey);
  }
  REPLY_CACHE.set(cacheKey, { reply, expiresAt: Date.now() + CACHE_TTL_MS });
}

// ─── Complexity heuristics ──────────────────────────────────────────────────

const SIMPLE_INTENTS = [
  "مرحبا", "السلام", "اهلا", "أهلا", "هاي", "hi", "hello", "صباح", "مساء",
  "شكرا", "thanks", "تمام", "ok", "okay", "ايوة", "لا",
];

function isSimpleChatPrompt(userText: string): boolean {
  const trimmed = userText.trim().toLowerCase();
  if (trimmed.length < 30) {
    // Short message — likely greeting / acknowledgement
    if (SIMPLE_INTENTS.some((kw) => trimmed.includes(kw))) return true;
  }
  // Single short question without entity keywords
  if (trimmed.length < 80 && !/(فاتورة|عميل|تقرير|مبيعات|مخزون|تحليل|قائمة|إضافة|create|report|invoice|report)/i.test(trimmed)) {
    return true;
  }
  return false;
}

// ─── Decision API ───────────────────────────────────────────────────────────

export interface OptimizeInput {
  capability: AICapability;
  /** The user-visible prompt (last user message). */
  prompt: string;
  /** True when Invoice-Brain already matched a learned template. */
  patternMatched?: boolean;
  /** Set to false to bypass the cache (e.g. for non-deterministic tools). */
  cacheable?: boolean;
}

export async function decide(params: OptimizeInput): Promise<CostDecision> {
  sweepIfNeeded();

  // 1. Pattern — highest priority, zero cost
  if (params.patternMatched) {
    return {
      action: "use-pattern",
      tier: "any",
      reason: "Invoice-Brain template matched — returning learned extraction without an AI call.",
      estimatedSavings: 1.0,
    };
  }

  // 2. Cache — second priority, near-zero cost
  if (params.cacheable !== false && params.prompt.trim().length > 0) {
    const cacheKey = await sha256(`${params.capability}:${params.prompt.trim()}`);
    if (getCachedReply(cacheKey)) {
      return {
        action: "use-cache",
        tier: "any",
        cacheKey,
        reason: "Identical prompt seen in the last hour — returning cached reply.",
        estimatedSavings: 1.0,
      };
    }
    // Even on a miss, pre-compute the key so the caller can store the reply.
    return {
      action: params.capability === "chat" && isSimpleChatPrompt(params.prompt) ? "route-free" : "route-best",
      tier: params.capability === "chat" && isSimpleChatPrompt(params.prompt) ? "free" : "any",
      cacheKey,
      reason:
        params.capability === "chat" && isSimpleChatPrompt(params.prompt)
          ? "Simple chat prompt (greeting / short) → routing to a free-tier model."
          : `Complex task (${params.capability}) → routing to the best healthy model.`,
      estimatedSavings: 0.0,
    };
  }

  // 3. / 4. Non-cacheable — route by complexity
  if (params.capability === "chat" && isSimpleChatPrompt(params.prompt)) {
    return {
      action: "route-free",
      tier: "free",
      reason: "Simple chat prompt → free-tier model.",
      estimatedSavings: 0.0,
    };
  }

  return {
    action: "route-best",
    tier: "any",
    reason: `Complex task (${params.capability}) → best healthy model.`,
    estimatedSavings: 0.0,
  };
}

// ─── Tier availability check ────────────────────────────────────────────────

/**
 * Does a free-tier model exist for this capability? Used by the dashboard to
 * show whether "route-free" decisions can actually be served for free.
 */
export async function hasFreeModelFor(cap: AICapability): Promise<boolean> {
  const models = await getModelsForCapability(cap);
  return models.some((m) => m.tier === "free");
}

// ─── Stats for the dashboard ────────────────────────────────────────────────

/**
 * Aggregate counts of each decision action over the last N hours, computed
 * from a lightweight in-memory counter (reset on server restart). This gives
 * the founder a live "cost optimizer impact" widget without a DB round-trip.
 */
const decisionCounts: Record<CostDecisionAction, number> = {
  "use-pattern": 0,
  "use-cache": 0,
  "route-free": 0,
  "route-best": 0,
};

export function recordDecision(action: CostDecisionAction): void {
  decisionCounts[action] += 1;
}

export function getOptimizerStats(): Record<CostDecisionAction, number> {
  return { ...decisionCounts };
}

/** Estimated cost avoided = (pattern + cache hits) × avg cost per AI call. */
export function getEstimatedSavings(avgCostPerCall = 0.0002): {
  callsAvoided: number;
  estSavingsUsd: number;
} {
  const callsAvoided = decisionCounts["use-pattern"] + decisionCounts["use-cache"];
  return {
    callsAvoided,
    estSavingsUsd: Math.round(callsAvoided * avgCostPerCall * 1e6) / 1e6,
  };
}

// ─── Persistence (optional, best-effort) ────────────────────────────────────
//
// Persist the running decision counts to PlatformSetting every Nth call so a
// server restart doesn't zero the "cost optimizer impact" widget. Best-effort:
// failures are swallowed (the in-memory counter is the source of truth).

let persistCounter = 0;
const PERSIST_EVERY = 25;

export async function maybePersistStats(): Promise<void> {
  persistCounter += 1;
  if (persistCounter < PERSIST_EVERY) return;
  persistCounter = 0;
  try {
    const key = "ai.cost_optimizer.stats";
    const value = JSON.stringify({
      counts: decisionCounts,
      updatedAt: new Date().toISOString(),
    });
    const existing = await db.platformSetting.findUnique({ where: { key } });
    if (existing) {
      await db.platformSetting.update({ where: { key }, data: { value, updatedAt: new Date() } });
    } else {
      await db.platformSetting.create({
        data: { key, category: "ai", valueType: "string", value },
      });
    }
  } catch (err) {
    logger.warn("[costOptimizer] failed to persist stats", {
      err: err instanceof Error ? err.message : String(err),
    });
  }
}

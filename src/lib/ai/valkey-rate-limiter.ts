/**
 * ═════════════════════════════════════════════════════════════
 * GarfiX DS v4.1 — Valkey-backed Rate Limiter for AI Features
 *
 * بيحل المشكلة: الـ rate limiter القديم كان in-memory Map، مش بيتشارك
 * بين instances في الـ production. مع multi-instance deployment
 * (Vercel / Docker swarm / k8s) كل instance بيحسب الـ limits لوحده،
 * فبتعد الـ rate المسموح بيها.
 *
 * الحل: استخدم Valkey كـ sliding-window rate limiter مشترك.
 *
 * الاستراتيجية:
 *   - لكل (companyId + feature) بنعمل sorted set في Valkey
 *   - بنستخدم ZADD + ZREMRANGEBYSCORE + ZCARD في pipeline واحد
 *   - ده atomic ومش بيسبق race conditions
 *   - لو Valkey مش متوفر (dev environment)، بنرجع للـ in-memory fallback
 *
 * الـ key format (AI-17 FIX — Audit v2 · Phase 4):
 *   `rl:{scope}:{id}` — sorted set of timestamps
 *
 *   - `scope` identifies the rate-limit domain: `ai` for AI features,
 *     `api` for general API routes, `auth` for login attempts, etc.
 *   - `id` is the unique identifier within that scope: typically
 *     `{companyId}:{feature}` for AI rate limits.
 *
 *   Example: `rl:ai:comp_abc:chat` → AI chat rate limit for company comp_abc.
 *
 *   Previous format was `ai:rl:{companyId}:{feature}` — inconsistent with
 *   the rest of the keyspace (which uses `<category>:<rest>`). The new
 *   `rl:{scope}:{id}` format is consistent with the convention used by
 *   `cache:{key}` (cache.ts) and `session:{key}` (passwordPolicy.ts).
 *
 * TTL: 90 ثانية (أكبر من نافذة الـ دقيقة بـ 50% عشان الـ cleanup)
 *
 * ═════════════════════════════════════════════════════════════
 */

import { getValkeyClient, VALKEY_CONFIGURED } from "@/lib/valkey";
import { logger } from "@/lib/logger";

export interface RateLimitResult {
  allowed: boolean;
  retryAfterMs?: number;
  currentUsage: number;
  limit: number;
  /** True if this check used Valkey (shared across instances) */
  distributed: boolean;
}

const WINDOW_MS = 60_000; // 1 minute
const KEY_TTL_SECONDS = 90; // 1.5x window — conservative cleanup

// AI-17 FIX (Audit v2 · Phase 4): standardized rate-limit key format.
//
// All rate-limit keys now follow `rl:{scope}:{id}`:
//   - `rl`     — fixed prefix (rate-limit domain)
//   - `scope`  — the rate-limit category (e.g. "ai", "api", "auth")
//   - `id`     — the unique identifier within that scope
//
// For backward compatibility with existing in-flight keys, the legacy
// `ai:rl:*` prefix is still recognized on READ (peekRateLimit) — both
// formats are checked. New writes always use the new format.
//
// The TTL on existing keys is 90s, so within 90 seconds of deploy the
// old keyspace is fully drained and only the new format remains.
const KEY_PREFIX = "rl";
const DEFAULT_SCOPE = "ai";
const LEGACY_KEY_PREFIX = "ai:rl"; // pre-AI-17 format — kept for read-compat

/**
 * AI-17 FIX (Audit v2 · Phase 4): standardized rate-limit key builder.
 *
 * Constructs a key in the canonical `rl:{scope}:{id}` format. All new
 * writes go through this function so the format can't drift again.
 *
 * @param scope - rate-limit domain ("ai", "api", "auth", ...)
 * @param id    - unique identifier within the scope
 * @returns e.g. "rl:ai:comp_abc:chat"
 */
export function buildRateLimitKey(scope: string, id: string): string {
  // Defensive: trim + lowercase scope so "AI" and "ai" map to the same
  // keyspace. `id` is case-sensitive (companyIds are cuid-cased).
  const s = scope.trim().toLowerCase();
  if (!s) {
    throw new Error("buildRateLimitKey: scope must be a non-empty string");
  }
  if (!id) {
    throw new Error("buildRateLimitKey: id must be a non-empty string");
  }
  return `${KEY_PREFIX}:${s}:${id}`;
}

/**
 * AI-17 FIX (Audit v2 · Phase 4): legacy key builder (deprecated).
 *
 * Returns the OLD `ai:rl:{companyId}:{feature}` key — used ONLY by
 * peekRateLimit() to read in-flight keys that were written before the
 * AI-17 deploy. New code MUST NOT call this; it exists purely so the
 * 90s transition window doesn't drop rate-limit state.
 *
 * @deprecated use buildRateLimitKey() instead — removed in Phase 5.
 */
function buildLegacyRateLimitKey(companyId: string, feature: string): string {
  return `${LEGACY_KEY_PREFIX}:${companyId}:${feature}`;
}

// ── Atomic Sliding-Window Lua Script ──────────────────────────────────
//
// BUG FIX: ioredis pipelines are NOT atomic — other clients' commands can
// interleave between ZCARD and ZADD, allowing N concurrent requests to all
// pass the limit check and then all ZADD, overshooting the limit by N-1.
//
// Solution: a Lua script. Redis executes scripts atomically (single-threaded),
// so the check-and-record happens as one indivisible operation.
//
// Returns: { allowed (0/1), currentUsage, retryAfterMs }
//   - allowed=1: request recorded, currentUsage = new count
//   - allowed=0: request rejected, retryAfterMs = ms until oldest expires
//
const RATE_LIMIT_LUA = `
local key = KEYS[1]
local now = tonumber(ARGV[1])
local windowStart = tonumber(ARGV[2])
local limit = tonumber(ARGV[3])
local member = ARGV[4]
local ttlMs = tonumber(ARGV[5])

-- Guard: limit <= 0 means "feature disabled" — always reject
if limit <= 0 then
  return {0, 0, 1000}
end

-- Cleanup old entries outside the window
redis.call('ZREMRANGEBYSCORE', key, 0, windowStart)

-- Count current entries in the window
local count = redis.call('ZCARD', key)

if count >= limit then
  -- Over limit: compute when the oldest entry will expire (window end - oldest age)
  local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
  local oldestScore = 0
  if oldest[2] ~= nil then
    oldestScore = tonumber(oldest[2]) or 0
  end
  local retryAfterMs = oldestScore - windowStart
  if retryAfterMs < 1000 then retryAfterMs = 1000 end
  -- Refresh TTL on the key so it gets cleaned up
  redis.call('PEXPIRE', key, ttlMs)
  return {0, count, retryAfterMs}
end

-- Under limit: record this request
redis.call('ZADD', key, now, member)
redis.call('PEXPIRE', key, ttlMs)
return {1, count + 1, 0}
`;

// Cache the SHA1 of the loaded script — avoids re-sending the script body
// on every call (EVALSHA instead of EVAL).
let scriptSha: string | null = null;

// ── In-Memory Fallback (for dev / no-Valkey environments) ──────────────

interface FallbackEntry {
  timestamps: number[];
}

const fallbackStore = new Map<string, FallbackEntry>();

function fallbackCheck(
  key: string,
  limit: number,
  now: number
): RateLimitResult {
  const windowStart = now - WINDOW_MS;
  let entry = fallbackStore.get(key);
  if (!entry) {
    entry = { timestamps: [] };
    fallbackStore.set(key, entry);
  }

  // Filter out timestamps outside the window
  entry.timestamps = entry.timestamps.filter((t) => t > windowStart);
  const currentUsage = entry.timestamps.length;

  // Guard against limit === 0 (misconfigured feature) — always reject
  // with a sane default retry-after, never NaN.
  if (limit <= 0) {
    return {
      allowed: false,
      retryAfterMs: 1000,
      currentUsage: 0,
      limit: 0,
      distributed: false,
    };
  }

  if (currentUsage >= limit) {
    // Guard against empty timestamps array (shouldn't happen here, but defensive)
    if (entry.timestamps.length === 0) {
      return {
        allowed: false,
        retryAfterMs: 1000,
        currentUsage,
        limit,
        distributed: false,
      };
    }
    const oldestInWindow = entry.timestamps[0];
    const retryAfterMs = Math.max(oldestInWindow - windowStart, 1000);
    return {
      allowed: false,
      retryAfterMs,
      currentUsage,
      limit,
      distributed: false,
    };
  }

  entry.timestamps.push(now);
  return {
    allowed: true,
    currentUsage: currentUsage + 1,
    limit,
    distributed: false,
  };
}

// Periodic cleanup of expired fallback entries (every 2 minutes)
if (typeof setInterval !== "undefined") {
  setInterval(() => {
    const now = Date.now();
    const windowStart = now - WINDOW_MS;
    for (const [key, entry] of fallbackStore.entries()) {
      entry.timestamps = entry.timestamps.filter((t) => t > windowStart);
      if (entry.timestamps.length === 0) {
        fallbackStore.delete(key);
      }
    }
  }, 120_000).unref?.();
}

/**
 * Load the Lua script once and cache its SHA1. Subsequent calls use EVALSHA,
 * which is much cheaper (no need to re-send the script body).
 */
async function ensureScriptLoaded(valkey: import("ioredis").default): Promise<void> {
  if (scriptSha) return;
  try {
    const sha = await valkey.script("LOAD", RATE_LIMIT_LUA);
    scriptSha = typeof sha === "string" ? sha : String(sha);
  } catch (err) {
    logger.warn("[valkey-rl] failed to LOAD Lua script — will fall back to EVAL", {
      err: err instanceof Error ? err.message : String(err),
    });
    scriptSha = null;
  }
}

// ── Public API ────────────────────────────────────────────────────────

/**
 * Check and record a rate-limited request for a (companyId, feature) pair.
 *
 * Uses Valkey (Redis-compatible) when available, so the rate limit is
 * shared across all instances of the app. Falls back to in-memory when
 * Valkey is not configured (local dev).
 *
 * Implementation note: the Valkey path uses an atomic Lua script
 * (ZREMRANGEBYSCORE + ZCARD + ZADD in one atomic op) — ioredis pipelines
 * are NOT atomic and would allow concurrent requests to overshoot the limit.
 *
 * @param companyId - The company making the request
 * @param feature - The AI feature ('chat' | 'invoice' | 'parse' | 'memory')
 * @param limitRpm - Max requests per minute allowed
 * @returns RateLimitResult — `allowed: false` means reject the request
 */
export async function checkAndRecordRateLimit(
  companyId: string,
  feature: string,
  limitRpm: number
): Promise<RateLimitResult> {
  const now = Date.now();
  // AI-17 FIX (Audit v2 · Phase 4): use standardized rl:{scope}:{id} format.
  // The id is `${companyId}:${feature}` — colon-separated to keep the
  // keyspace hierarchy flat (no nested namespaces that complicate SCAN).
  const key = buildRateLimitKey(DEFAULT_SCOPE, `${companyId}:${feature}`);

  // Fast path: no Valkey configured → use in-memory fallback
  if (!VALKEY_CONFIGURED) {
    return fallbackCheck(key, limitRpm, now);
  }

  try {
    const valkey = await getValkeyClient();
    if (!valkey) {
      // Valkey was supposed to be configured but connection failed → fallback
      return fallbackCheck(key, limitRpm, now);
    }

    // Ensure the Lua script is loaded (cached SHA1)
    await ensureScriptLoaded(valkey);

    const windowStart = now - WINDOW_MS;
    // Unique member to handle same-ms requests
    const member = `${now}:${Math.random().toString(36).slice(2, 8)}`;
    const ttlMs = KEY_TTL_SECONDS * 1000;

    let rawResult: unknown;
    try {
      if (scriptSha) {
        // EVALSHA — cheap, just sends the SHA1 + args
        rawResult = await valkey.evalsha(
          scriptSha,
          1,
          key,
          String(now),
          String(windowStart),
          String(limitRpm),
          member,
          String(ttlMs)
        );
      } else {
        // Fallback: EVAL with full script body (if SHA load failed)
        rawResult = await valkey.eval(
          RATE_LIMIT_LUA,
          1,
          key,
          String(now),
          String(windowStart),
          String(limitRpm),
          member,
          String(ttlMs)
        );
      }
    } catch (err) {
      // NOSCRIPT error: the script was evicted from Valkey's cache — reload and retry
      if (err instanceof Error && err.message.includes("NOSCRIPT")) {
        scriptSha = null;
        await ensureScriptLoaded(valkey);
        if (scriptSha) {
          rawResult = await valkey.evalsha(
            scriptSha,
            1,
            key,
            String(now),
            String(windowStart),
            String(limitRpm),
            member,
            String(ttlMs)
          );
        } else {
          return fallbackCheck(key, limitRpm, now);
        }
      } else {
        throw err;
      }
    }

    // Lua returns an array: [allowed (0/1), currentUsage, retryAfterMs]
    if (!Array.isArray(rawResult) || rawResult.length < 3) {
      logger.warn("[valkey-rl] unexpected Lua return shape, using fallback", {
        rawResult,
      });
      return fallbackCheck(key, limitRpm, now);
    }

    const allowed = Number(rawResult[0]) === 1;
    const currentUsage = Number(rawResult[1]) || 0;
    const retryAfterMs = Number(rawResult[2]) || 0;

    if (allowed) {
      return {
        allowed: true,
        currentUsage,
        limit: limitRpm,
        distributed: true,
      };
    } else {
      return {
        allowed: false,
        retryAfterMs: Math.max(retryAfterMs, 1000),
        currentUsage,
        limit: limitRpm,
        distributed: true,
      };
    }
  } catch (err) {
    logger.warn("[valkey-rl] rate limit check failed, using fallback", {
      err: err instanceof Error ? err.message : String(err),
      companyId,
      feature,
    });
    return fallbackCheck(key, limitRpm, now);
  }
}

/**
 * Peek at the current rate limit usage WITHOUT recording a new request.
 *
 * Useful for dashboards / status displays.
 */
export async function peekRateLimit(
  companyId: string,
  feature: string
): Promise<{ currentUsage: number; windowMs: number }> {
  const now = Date.now();
  const windowStart = now - WINDOW_MS;
  // AI-17 FIX (Audit v2 · Phase 4): use the new standardized key format.
  // The legacy `ai:rl:*` key is also checked as a fallback during the
  // 90s transition window after deploy (existing in-flight keys).
  const key = buildRateLimitKey(DEFAULT_SCOPE, `${companyId}:${feature}`);
  const legacyKey = buildLegacyRateLimitKey(companyId, feature);

  // In-memory fallback store uses the NEW key only — the legacy compat
  // only applies to Valkey-backed reads.
  if (!VALKEY_CONFIGURED) {
    const entry = fallbackStore.get(key) ?? fallbackStore.get(legacyKey);
    if (!entry) return { currentUsage: 0, windowMs: WINDOW_MS };
    const recent = entry.timestamps.filter((t) => t > windowStart);
    return { currentUsage: recent.length, windowMs: WINDOW_MS };
  }

  try {
    const valkey = await getValkeyClient();
    if (!valkey) {
      const entry = fallbackStore.get(key) ?? fallbackStore.get(legacyKey);
      if (!entry) return { currentUsage: 0, windowMs: WINDOW_MS };
      const recent = entry.timestamps.filter((t) => t > windowStart);
      return { currentUsage: recent.length, windowMs: WINDOW_MS };
    }

    // Cleanup + count in one pipeline.
    // AI-17: clean up BOTH the new and legacy keys so old keyspace drains.
    const pipeline = valkey.pipeline();
    pipeline.zremrangebyscore(key, 0, windowStart);
    pipeline.zcard(key);
    const results = await pipeline.exec();
    if (!results) return { currentUsage: 0, windowMs: WINDOW_MS };

    const countTuple = results[1] as [Error | null, number];
    const newCount = countTuple[1] || 0;

    // If new-format key has no entries, check the legacy key for backward
    // compat during the 90s transition window after deploy.
    if (newCount === 0) {
      const legacyPipeline = valkey.pipeline();
      legacyPipeline.zremrangebyscore(legacyKey, 0, windowStart);
      legacyPipeline.zcard(legacyKey);
      const legacyResults = await legacyPipeline.exec();
      if (legacyResults) {
        const legacyCountTuple = legacyResults[1] as [Error | null, number];
        return { currentUsage: legacyCountTuple[1] || 0, windowMs: WINDOW_MS };
      }
    }

    return { currentUsage: newCount, windowMs: WINDOW_MS };
  } catch {
    const entry = fallbackStore.get(key) ?? fallbackStore.get(legacyKey);
    if (!entry) return { currentUsage: 0, windowMs: WINDOW_MS };
    const recent = entry.timestamps.filter((t) => t > windowStart);
    return { currentUsage: recent.length, windowMs: WINDOW_MS };
  }
}

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
 * الـ key format:
 *   `ai:rl:{companyId}:{feature}` — sorted set of timestamps
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
const KEY_PREFIX = "ai:rl";

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

  if (currentUsage >= limit) {
    const oldestInWindow = entry.timestamps[0];
    const retryAfterMs = oldestInWindow - windowStart;
    return {
      allowed: false,
      retryAfterMs: Math.max(retryAfterMs, 1000),
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

// ── Public API ────────────────────────────────────────────────────────

/**
 * Check and record a rate-limited request for a (companyId, feature) pair.
 *
 * Uses Valkey (Redis-compatible) when available, so the rate limit is
 * shared across all instances of the app. Falls back to in-memory when
 * Valkey is not configured (local dev).
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
  const key = `${KEY_PREFIX}:${companyId}:${feature}`;

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

    // Sliding window using a sorted set:
    //   1. ZREMRANGEBYSCORE — remove timestamps older than the window start
    //   2. ZCARD — count remaining members (= requests in current window)
    //   3. ZADD — add the current timestamp (only if allowed)
    //   4. EXPIRE — refresh TTL so the key gets cleaned up after inactivity
    //
    // We use a pipeline for atomicity and to save round-trips.
    const windowStart = now - WINDOW_MS;

    // Step 1 + 2: cleanup + count (read phase)
    const pipeline = valkey.pipeline();
    pipeline.zremrangebyscore(key, 0, windowStart);
    pipeline.zcard(key);
    pipeline.pexpire(key, KEY_TTL_SECONDS * 1000);
    const results = await pipeline.exec();

    if (!results) {
      return fallbackCheck(key, limitRpm, now);
    }

    // results[1] = [error, count] — ioredis pipeline returns [err, result] tuples
    const countTuple = results[1] as [Error | null, number];
    const currentUsage = countTuple[1] || 0;

    if (currentUsage >= limitRpm) {
      // Rate limited — don't add the new timestamp, just compute retry-after
      // We need to fetch the oldest member to compute when the window will free up
      const oldest = await valkey.zrange(key, 0, 0, "WITHSCORES");
      let retryAfterMs = 1000; // default 1s
      if (Array.isArray(oldest) && oldest.length >= 2) {
        const oldestScore = parseFloat(oldest[1]);
        if (!Number.isNaN(oldestScore)) {
          retryAfterMs = Math.max(oldestScore - windowStart, 1000);
        }
      }

      return {
        allowed: false,
        retryAfterMs,
        currentUsage,
        limit: limitRpm,
        distributed: true,
      };
    }

    // Allowed — record this request
    const writePipeline = valkey.pipeline();
    // Use a unique member (timestamp + random suffix) to handle same-ms requests
    const member = `${now}:${Math.random().toString(36).slice(2, 8)}`;
    writePipeline.zadd(key, now, member);
    writePipeline.pexpire(key, KEY_TTL_SECONDS * 1000);
    await writePipeline.exec();

    return {
      allowed: true,
      currentUsage: currentUsage + 1,
      limit: limitRpm,
      distributed: true,
    };
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
  const key = `${KEY_PREFIX}:${companyId}:${feature}`;

  if (!VALKEY_CONFIGURED) {
    const entry = fallbackStore.get(key);
    if (!entry) return { currentUsage: 0, windowMs: WINDOW_MS };
    const recent = entry.timestamps.filter((t) => t > windowStart);
    return { currentUsage: recent.length, windowMs: WINDOW_MS };
  }

  try {
    const valkey = await getValkeyClient();
    if (!valkey) {
      const entry = fallbackStore.get(key);
      if (!entry) return { currentUsage: 0, windowMs: WINDOW_MS };
      const recent = entry.timestamps.filter((t) => t > windowStart);
      return { currentUsage: recent.length, windowMs: WINDOW_MS };
    }

    // Cleanup + count in one pipeline
    const pipeline = valkey.pipeline();
    pipeline.zremrangebyscore(key, 0, windowStart);
    pipeline.zcard(key);
    const results = await pipeline.exec();
    if (!results) return { currentUsage: 0, windowMs: WINDOW_MS };

    const countTuple = results[1] as [Error | null, number];
    return { currentUsage: countTuple[1] || 0, windowMs: WINDOW_MS };
  } catch {
    const entry = fallbackStore.get(key);
    if (!entry) return { currentUsage: 0, windowMs: WINDOW_MS };
    const recent = entry.timestamps.filter((t) => t > windowStart);
    return { currentUsage: recent.length, windowMs: WINDOW_MS };
  }
}

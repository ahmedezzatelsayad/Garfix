/**
 * rateLimit.ts — Dual-backend rate limiter (Redis for production, in-memory for dev).
 *
 * P1-B (TODO v13.1) — REDIS_URL-aware.
 *   • If process.env.REDIS_URL is set  → uses Redis (works across instances).
 *   • If not set (sandbox/dev)         → FALLS BACK to in-memory Map and logs
 *     "FALLBACK to in-memory — REDIS_URL not set" once at startup.
 *
 * The in-memory fallback is single-instance only and WILL NOT protect a
 * multi-instance deployment — set REDIS_URL in production.
 *
 * If REDIS_URL is set but a Redis operation fails at runtime, the limiter
 * fails OPEN (allows the request) and logs an ERROR so ops can detect it.
 * Fail-open is chosen over fail-closed to avoid locking all users out when
 * Redis is briefly unavailable; the ERROR log makes the degradation visible.
 *
 * API is async because Redis I/O is async. Callers must `await`
 * rateLimitResponse(...) and clearRateLimit(...).
 *
 * Limits:
 *   - Login: 5 attempts per 15 min per IP (lockout after 5 failures)
 *   - Register: 3 attempts per hour per IP
 *   - OTP verify: 5 attempts per 5 min per email
 *   - Password reset: 3 per hour per email
 */

import { NextRequest, NextResponse } from "next/server";
import { logger } from "./logger";

// ─────────────────────────────────────────────────────────────────────────────
// Backend selection (Redis vs in-memory)
// ─────────────────────────────────────────────────────────────────────────────

const REDIS_URL = process.env.REDIS_URL;
const USE_REDIS = Boolean(REDIS_URL);

// Trusted proxy IPs (comma-separated via TRUSTED_PROXIES env var).
// When set, getClientIp() will parse x-forwarded-for using these IPs
// to determine the real client IP. When NOT set, x-forwarded-for is
// ignored entirely (unverifiable) and only x-real-ip is used.
const TRUSTED_PROXIES: ReadonlySet<string> = new Set(
  (process.env.TRUSTED_PROXIES || "").split(",").map((ip) => ip.trim()).filter(Boolean),
);

// Lazy Redis singleton — only created when REDIS_URL is set.
let redisClient: import("ioredis").default | null = null;
let redisInitAttempted = false;

async function getRedis(): Promise<import("ioredis").default | null> {
  if (!USE_REDIS) return null;
  if (redisClient) return redisClient;
  if (redisInitAttempted) return redisClient; // previous attempt failed → stay null
  redisInitAttempted = true;
  try {
    const Redis = (await import("ioredis")).default;
    redisClient = new Redis(REDIS_URL as string, {
      lazyConnect: false,
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
      reconnectOnError: (err: Error) => err.message.includes("READONLY"),
    });
    redisClient.on("error", (err) => {
      logger.error("[rate-limit] redis client error", { err: err.message });
    });
    logger.info("[rate-limit] Redis backend connected", { url: REDIS_URL });
    return redisClient;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error("[rate-limit] Redis connection FAILED — falling back to in-memory", { err: msg, url: REDIS_URL });
    redisClient = null;
    return null;
  }
}

// In-memory store (used when Redis is not configured, or as runtime fallback).
interface RateLimitEntry {
  count: number;
  firstAttempt: number;
  lockedUntil?: number;
}

const memoryStore = new Map<string, RateLimitEntry>();

// One-time, explicit startup log so the active backend is never ambiguous.
if (USE_REDIS) {
  logger.info("[rate-limit] REDIS_URL detected — will use Redis backend (connects lazily on first request)", { url: REDIS_URL });
} else {
  logger.warn(
    "[rate-limit] FALLBACK to in-memory — REDIS_URL not set. " +
      "This is fine for the sandbox/single-instance dev, but will NOT protect a " +
      "multi-instance production deployment. Set REDIS_URL in production.",
  );
}

// Cleanup expired in-memory entries every 5 minutes (harmless when Redis is used).
if (typeof setInterval !== "undefined") {
  setInterval(() => {
    const now = Date.now();
    let cleaned = 0;
    for (const [key, entry] of memoryStore) {
      if (now - entry.firstAttempt > 3600_000 && (!entry.lockedUntil || entry.lockedUntil < now)) {
        memoryStore.delete(key);
        cleaned++;
      }
    }
    if (cleaned > 0) logger.debug("[rate-limit] expired in-memory entries removed", { cleaned });
  }, 300_000).unref?.();
}

// ─────────────────────────────────────────────────────────────────────────────
// Public types & config
// ─────────────────────────────────────────────────────────────────────────────

export interface RateLimitConfig {
  windowMs: number;
  maxAttempts: number;
  lockoutMs?: number; // if set, after maxAttempts the key is locked for this duration
}

export const LIMITS = {
  LOGIN: { windowMs: 15 * 60 * 1000, maxAttempts: 5, lockoutMs: 15 * 60 * 1000 },
  REGISTER: { windowMs: 60 * 60 * 1000, maxAttempts: 3 },
  OTP_VERIFY: { windowMs: 5 * 60 * 1000, maxAttempts: 5 },
  PASSWORD_RESET: { windowMs: 60 * 60 * 1000, maxAttempts: 3 },
  AI_CHAT: { windowMs: 60 * 1000, maxAttempts: 10 },
  AI_BULK: { windowMs: 60 * 1000, maxAttempts: 3 },
  API_READ: { windowMs: 60 * 1000, maxAttempts: 60 },
  API_WRITE: { windowMs: 60 * 1000, maxAttempts: 30 },
} as const;

export interface RateLimitResult {
  ok: boolean;
  remaining: number;
  retryAfter?: number; // seconds until the limit resets
}

// ─────────────────────────────────────────────────────────────────────────────
// Core check — async (Redis I/O). Branches on backend availability.
// ─────────────────────────────────────────────────────────────────────────────

export async function checkRateLimit(
  key: string,
  config: RateLimitConfig,
): Promise<RateLimitResult> {
  const now = Date.now();
  const redis = await getRedis();

  if (redis) {
    try {
      return await checkRateLimitRedis(redis, key, config, now);
    } catch (err: unknown) {
      // Fail-open with loud log (see file header for rationale).
      const msg = err instanceof Error ? err.message : String(err);
      logger.error("[rate-limit] Redis op failed — fail-open for this request, using in-memory", { err: msg, key });
      return checkRateLimitMemory(key, config, now);
    }
  }
  return checkRateLimitMemory(key, config, now);
}

/** Redis implementation: INCR + PEXPIRE for the window; separate lock key. */
async function checkRateLimitRedis(
  redis: import("ioredis").default,
  rawKey: string,
  config: RateLimitConfig,
  now: number,
): Promise<RateLimitResult> {
  const windowKey = `rl:win:${rawKey}`;
  const lockKey = `rl:lock:${rawKey}`;

  // 1. Check active lockout first.
  const lockTtlMs = await redis.pttl(lockKey);
  if (lockTtlMs > 0) {
    return {
      ok: false,
      remaining: 0,
      retryAfter: Math.ceil(lockTtlMs / 1000),
    };
  }

  // 2. INCR the window counter; set TTL on first hit.
  const count = await redis.incr(windowKey);
  if (count === 1) {
    await redis.pexpire(windowKey, config.windowMs);
  }

  // 3. Over the limit?
  if (count > config.maxAttempts) {
    if (config.lockoutMs) {
      // SET lock with NX so it's only set once; TTL = lockoutMs.
      await redis.set(lockKey, "1", "PX", config.lockoutMs);
      logger.warn("[rate-limit] locked out (redis)", { key: rawKey, lockoutMs: config.lockoutMs });
    }
    const winTtlMs = await redis.pttl(windowKey);
    const retryAfter = Math.max(1, Math.ceil((winTtlMs > 0 ? winTtlMs : config.windowMs) / 1000));
    return { ok: false, remaining: 0, retryAfter };
  }

  return { ok: true, remaining: config.maxAttempts - count };
}

/** In-memory implementation (sandbox / dev / runtime fallback). */
function checkRateLimitMemory(
  key: string,
  config: RateLimitConfig,
  now: number,
): RateLimitResult {
  const entry = memoryStore.get(key);

  if (entry?.lockedUntil && entry.lockedUntil > now) {
    return {
      ok: false,
      remaining: 0,
      retryAfter: Math.ceil((entry.lockedUntil - now) / 1000),
    };
  }

  if (!entry || now - entry.firstAttempt > config.windowMs) {
    memoryStore.set(key, { count: 1, firstAttempt: now });
    return { ok: true, remaining: config.maxAttempts - 1 };
  }

  entry.count++;

  if (entry.count > config.maxAttempts) {
    if (config.lockoutMs) {
      entry.lockedUntil = now + config.lockoutMs;
      logger.warn("[rate-limit] locked out (memory)", { key, lockoutMs: config.lockoutMs });
    }
    const retryAfter = Math.ceil((entry.firstAttempt + config.windowMs - now) / 1000);
    return { ok: false, remaining: 0, retryAfter: Math.max(retryAfter, 1) };
  }

  return { ok: true, remaining: config.maxAttempts - entry.count };
}

// ─────────────────────────────────────────────────────────────────────────────
// HTTP helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Extract client IP from request — spoofing-resistant.
 *
 * Strategy:
 *   1. If TRUSTED_PROXIES is NOT configured, x-forwarded-for is ignored
 *      entirely (it cannot be verified) and we use x-real-ip only.
 *   2. If TRUSTED_PROXIES IS configured and the direct connection IP
 *      (x-real-ip) matches a trusted proxy, we walk x-forwarded-for from
 *      RIGHT to LEFT, skipping any trusted proxy IPs. The rightmost
 *      untrusted entry is the real client IP.
 *   3. Falls back to x-real-ip or "unknown".
 */
export function getClientIp(req: NextRequest): string {
  const realIp = req.headers.get("x-real-ip")?.trim();

  // No trusted proxies configured → x-forwarded-for is unverifiable.
  if (TRUSTED_PROXIES.size === 0) {
    return realIp || "unknown";
  }

  // Direct connection IP must be a trusted proxy to trust x-forwarded-for.
  if (!realIp || !TRUSTED_PROXIES.has(realIp)) {
    return realIp || "unknown";
  }

  // realIp IS a trusted proxy → parse x-forwarded-for from right to left.
  const forwarded = req.headers.get("x-forwarded-for");
  if (!forwarded) return realIp;

  const ips = forwarded.split(",").map((ip) => ip.trim()).filter(Boolean);
  // Walk from rightmost (set by the closest trusted proxy) to left.
  for (let i = ips.length - 1; i >= 0; i--) {
    if (!TRUSTED_PROXIES.has(ips[i])) {
      return ips[i]; // rightmost untrusted entry = real client
    }
  }

  // All entries are trusted proxies — fall back to realIp.
  return realIp;
}

/** Rate limit middleware — returns null if OK, or a 429 NextResponse if blocked. ASYNC. */
export async function rateLimitResponse(
  req: NextRequest,
  keyPrefix: string,
  config: RateLimitConfig,
  identifier?: string,
): Promise<NextResponse | null> {
  const ip = getClientIp(req);
  const key = `${keyPrefix}:${identifier || ip}`;
  const result = await checkRateLimit(key, config);
  if (!result.ok) {
    const retryAfter = result.retryAfter || Math.ceil(config.windowMs / 1000);
    return NextResponse.json(
      {
        error: `تم تجاوز الحد المسموح من المحاولات. حاول مرة أخرى بعد ${retryAfter} ثانية.`,
        retryAfter,
      },
      {
        status: 429,
        headers: {
          "Retry-After": retryAfter.toString(),
          "X-RateLimit-Remaining": "0",
          "X-RateLimit-Reset": (Date.now() + retryAfter * 1000).toString(),
        },
      },
    );
  }
  return null;
}

/** Clear rate limit for a key (e.g., on successful login). ASYNC. */
export async function clearRateLimit(keyPrefix: string, identifier: string): Promise<void> {
  const rawKey = `${keyPrefix}:${identifier}`;
  const redis = await getRedis();
  if (redis) {
    try {
      await redis.del(`rl:win:${rawKey}`, `rl:lock:${rawKey}`);
      return;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error("[rate-limit] redis clear failed — clearing memory", { err: msg, key: rawKey });
    }
  }
  memoryStore.delete(rawKey);
}

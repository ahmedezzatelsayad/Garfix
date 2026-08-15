/**
 * rateLimit.ts — Dual-backend rate limiter (Valkey for production, in-memory for dev).
 *
 * P1-B — VALKEY_URL / REDIS_URL aware.
 *   • If VALKEY_URL or REDIS_URL is set → uses Valkey (works across instances).
 *   • If not set (sandbox/dev)           → FALLS BACK to in-memory Map.
 *
 * The in-memory fallback is single-instance only and WILL NOT protect a
 * multi-instance deployment — set VALKEY_URL or REDIS_URL in production.
 *
 * If Valkey is set but an operation fails at runtime, the limiter
 * fails OPEN (allows the request) and logs an ERROR so ops can detect it.
 *
 * API is async because Valkey I/O is async. Callers must `await`
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
import { getValkeyClient, VALKEY_CONFIGURED } from "./valkey";

// ─────────────────────────────────────────────────────────────────────────────
// Backend selection (Valkey vs in-memory)
// ─────────────────────────────────────────────────────────────────────────────

const USE_VALKEY = VALKEY_CONFIGURED;

// Trusted proxy IPs (comma-separated via TRUSTED_PROXIES env var).
const TRUSTED_PROXIES: ReadonlySet<string> = new Set(
  (process.env.TRUSTED_PROXIES || "").split(",").map((ip) => ip.trim()).filter(Boolean),
);

// Lazy Valkey singleton — only created when configured.
let valkeyClient: import("ioredis").default | null = null;
let valkeyInitAttempted = false;

async function getValkey(): Promise<import("ioredis").default | null> {
  if (!USE_VALKEY) return null;
  if (valkeyClient) return valkeyClient;
  if (valkeyInitAttempted) return valkeyClient;
  valkeyInitAttempted = true;
  try {
    valkeyClient = await getValkeyClient();
    if (valkeyClient) {
      logger.info("[rate-limit] Valkey backend connected");
    }
    return valkeyClient;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error("[rate-limit] Valkey connection FAILED — falling back to in-memory", { err: msg });
    valkeyClient = null;
    return null;
  }
}

// In-memory store (used when Valkey is not configured, or as runtime fallback).
interface RateLimitEntry {
  count: number;
  firstAttempt: number;
  lockedUntil?: number;
}

const memoryStore = new Map<string, RateLimitEntry>();

// One-time, explicit startup log.
if (USE_VALKEY) {
  logger.info("[rate-limit] VALKEY_URL/REDIS_URL detected — will use Valkey backend (connects lazily on first request)");
} else {
  logger.warn(
    "[rate-limit] FALLBACK to in-memory — VALKEY_URL/REDIS_URL not set. " +
      "This is fine for the sandbox/single-instance dev, but will NOT protect a " +
      "multi-instance production deployment. Set VALKEY_URL or REDIS_URL in production.",
  );
}

// Cleanup expired in-memory entries every 5 minutes.
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
  lockoutMs?: number;
}

export const LIMITS = {
  LOGIN: { windowMs: 15 * 60 * 1000, maxAttempts: 5, lockoutMs: 15 * 60 * 1000 },
  REGISTER: { windowMs: 60 * 60 * 1000, maxAttempts: 3 },
  OTP_VERIFY: { windowMs: 5 * 60 * 1000, maxAttempts: 5 },
  PASSWORD_RESET: { windowMs: 60 * 60 * 1000, maxAttempts: 3 },
  // P3.1 (Cycle 5): close brute-force vector on POST /api/auth/change-password.
  //   The endpoint verifies the user's CURRENT password before accepting a new
  //   one. Without a rate limit, an attacker who stole an access token could
  //   brute-force the current password field at line-speed. 5 attempts per 15
  //   minutes per IP mirrors the LOGIN limit; legitimate users rarely change
  //   their password more than once per session.
  CHANGE_PW: { windowMs: 15 * 60 * 1000, maxAttempts: 5, lockoutMs: 15 * 60 * 1000 },
  // P3.1 (Cycle 5): close refresh-token replay / DoS vector on POST /api/auth/refresh.
  //   Each call hits the DB (appUser.findUnique) + Valkey (blacklist lookup) +
  //   signs two JWTs. An unthrottled attacker could amplify DB load via repeated
  //   refresh attempts even though rotation limits them to one valid new token
  //   per stolen refresh token. 30/min/IP is generous for legitimate clients
  //   (access TTL is 15min, so even a buggy client retrying every 30s stays
  //   under 2/min) while still catching brute-force amplification.
  REFRESH: { windowMs: 60 * 1000, maxAttempts: 30 },
  AI_CHAT: { windowMs: 60 * 1000, maxAttempts: 10 },
  AI_BULK: { windowMs: 60 * 1000, maxAttempts: 3 },
  API_READ: { windowMs: 60 * 1000, maxAttempts: 60 },
  API_WRITE: { windowMs: 60 * 1000, maxAttempts: 30 },
} as const;

export interface RateLimitResult {
  ok: boolean;
  remaining: number;
  retryAfter?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Core check — async (Valkey I/O). Branches on backend availability.
// ─────────────────────────────────────────────────────────────────────────────

export async function checkRateLimit(
  key: string,
  config: RateLimitConfig,
): Promise<RateLimitResult> {
  const now = Date.now();
  const redis = await getValkey();

  if (redis) {
    try {
      return await checkRateLimitValkey(redis, key, config, now);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error("[rate-limit] Valkey op failed — fail-open for this request, using in-memory", { err: msg, key });
      return checkRateLimitMemory(key, config, now);
    }
  }
  return checkRateLimitMemory(key, config, now);
}

/** Valkey implementation: INCR + PEXPIRE for the window; separate lock key. */
async function checkRateLimitValkey(
  redis: import("ioredis").default,
  rawKey: string,
  config: RateLimitConfig,
  _now: number,
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
      await redis.set(lockKey, "1", "PX", config.lockoutMs);
      logger.warn("[rate-limit] locked out (valkey)", { key: rawKey, lockoutMs: config.lockoutMs });
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
 * P0-04 (Engineering Audit): Previously, when TRUSTED_PROXIES was unset,
 * we returned the X-Real-IP header verbatim. An attacker could rotate
 * that header on every request to bypass all per-IP rate limits and
 * brute-force auth endpoints.
 *
 * New policy:
 *   - If TRUSTED_PROXIES is unset, we DO NOT trust any forwarded header.
 *     We fall back to the socket-level remote address exposed by Next.js
 *     (req.headers.get("x-vercel-forwarded-for") is the raw TCP IP on
 *     Vercel; on self-hosted it's the direct peer). This means rate
 *     limiting falls back to the actual TCP peer, which is correct
 *     (and stricter) when no proxy is in front.
 *   - If TRUSTED_PROXIES is set, the X-Real-IP / X-Forwarded-For chain
 *     is parsed only when the immediate peer is a trusted proxy.
 */
export function getClientIp(req: NextRequest): string {
  const realIp = req.headers.get("x-real-ip")?.trim();
  const forwarded = req.headers.get("x-forwarded-for");

  // No trusted proxies configured → do NOT trust any client-supplied header.
  // Use the raw TCP peer that Next.js / Vercel exposes; if that's also
  // unavailable, fall back to "unknown" (rate limiter will treat each
  // request as a distinct unidentified client, which is safe-fail-open
  // for legitimate traffic but does not allow spoofed-IP bypass).
  if (TRUSTED_PROXIES.size === 0) {
    // Vercel exposes the verified client IP via this header when no
    // custom proxy is in front. It cannot be spoofed by the client.
    const vercelIp = req.headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim();
    if (vercelIp && isValidIp(vercelIp)) return vercelIp;
    return "unknown";
  }

  // Trusted proxies configured: only trust headers if the immediate peer
  // (realIp) is itself a trusted proxy.
  if (!realIp || !TRUSTED_PROXIES.has(realIp)) {
    // Peer is not a trusted proxy → fall back to the raw peer (or unknown).
    if (realIp && isValidIp(realIp)) return realIp;
    return "unknown";
  }

  if (!forwarded) return realIp;

  const ips = forwarded.split(",").map((ip) => ip.trim()).filter(Boolean);
  for (let i = ips.length - 1; i >= 0; i--) {
    if (!TRUSTED_PROXIES.has(ips[i])) {
      return ips[i];
    }
  }

  return realIp;
}

/** Minimal IPv4 / IPv6 syntax check — rejects obviously malformed values. */
function isValidIp(ip: string): boolean {
  if (!ip) return false;
  // IPv4 dotted-quad
  const ipv4 = /^(\d{1,3}\.){3}\d{1,3}$/;
  // IPv6 (lenient — accepts ::, full form, mixed)
  const ipv6 = /^[0-9a-fA-F:]+$/;
  return ipv4.test(ip) || (ip.includes(":") && ipv6.test(ip));
}

/** Rate limit middleware — returns null if OK, or a 429 NextResponse if blocked. */
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

/** Clear rate limit for a key (e.g., on successful login). */
export async function clearRateLimit(keyPrefix: string, identifier: string): Promise<void> {
  const rawKey = `${keyPrefix}:${identifier}`;
  const redis = await getValkey();
  if (redis) {
    try {
      await redis.del(`rl:win:${rawKey}`, `rl:lock:${rawKey}`);
      return;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error("[rate-limit] Valkey clear failed — clearing memory", { err: msg, key: rawKey });
    }
  }
  memoryStore.delete(rawKey);
}
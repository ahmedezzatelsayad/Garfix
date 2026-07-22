/**
 * valkey.ts — Centralized Valkey (Redis-compatible) connection manager.
 *
 * All modules that need a Valkey/Redis connection should import from here
 * instead of creating their own ioredis instances. This ensures:
 *   - Single shared connection (lower memory + socket overhead).
 *   - Consistent configuration (lazyConnect, retries, TLS, etc.).
 *   - Unified health-check and graceful shutdown.
 *
 * Valkey is a drop-in Redis replacement (RESP protocol compatible).
 * ioredis works with Valkey without any code changes — only the
 * VALKEY_URL / REDIS_URL environment variable needs to point at Valkey.
 *
 * ENV VARS (checked in order):
 *   1. VALKEY_URL  — explicit Valkey connection string (preferred).
 *   2. REDIS_URL   — backward-compatible fallback.
 *   If neither is set, the app degrades gracefully (see each consumer).
 */

import { logger } from "./logger";

type RedisClient = import("ioredis").default;

/**
 * Normalize a Valkey URL to a format ioredis understands.
 * ioredis only supports redis:// and rediss:// protocols.
 * Valkey URLs use valkey:// — we transparently rewrite to redis://.
 */
function normalizeUrl(raw: string): string {
  // valkey://host:port → redis://host:port
  // valkeys://host:port → rediss://host:port
  if (raw.startsWith("valkeys://")) return "rediss://" + raw.slice(10);
  if (raw.startsWith("valkey://")) return "redis://" + raw.slice(9);
  return raw;
}

/** Resolve the Valkey/Redis connection URL from environment. */
export function getValkeyUrl(): string | undefined {
  const raw = process.env.VALKEY_URL || process.env.REDIS_URL || undefined;
  return raw ? normalizeUrl(raw) : undefined;
}

/** Whether Valkey/Redis is configured at all. */
export const VALKEY_CONFIGURED = Boolean(getValkeyUrl());

// ─── Single shared client (lazy-init) ────────────────────────────────────

let sharedClient: RedisClient | null = null;
let initAttempted = false;

/**
 * Get the shared Valkey/Redis client. Creates it on first call (lazy).
 * Returns null if no URL is configured or if the connection failed.
 *
 * Callers should ALWAYS handle the null case (degrade gracefully).
 */
export async function getValkeyClient(): Promise<RedisClient | null> {
  const url = getValkeyUrl();
  if (!url) return null;
  if (sharedClient) return sharedClient;
  if (initAttempted) return sharedClient; // previous attempt failed → stay null
  initAttempted = true;

  try {
    const Redis = (await import("ioredis")).default;
    sharedClient = new Redis(url, {
      lazyConnect: true,
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
      reconnectOnError: (err: Error) => err.message.includes("READONLY"),
      // Friendly name for monitoring
      connectionName: "garfix-shared",
    });

    sharedClient.on("error", (err) => {
      logger.error("[valkey] client error", { err: err.message });
    });

    sharedClient.on("connect", () => {
      logger.info("[valkey] connected", { url: maskUrl(url) });
    });

    await sharedClient.connect();
    return sharedClient;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error("[valkey] connection FAILED", { err: msg, url: maskUrl(url) });
    sharedClient = null;
    return null;
  }
}

/**
 * Get a *dedicated* Valkey client (for pub/sub subscribers which need
 * their own connection because ioredis enters subscriber mode).
 */
export async function getValkeySubscriber(): Promise<RedisClient | null> {
  const url = getValkeyUrl();
  if (!url) return null;

  try {
    const Redis = (await import("ioredis")).default;
    const sub = new Redis(url, {
      lazyConnect: true,
      maxRetriesPerRequest: null, // subscribers should always retry
      connectionName: "garfix-subscriber",
    });

    sub.on("error", (err) => {
      logger.error("[valkey] subscriber error", { err: err.message });
    });

    await sub.connect();
    return sub;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error("[valkey] subscriber connection FAILED", { err: msg });
    return null;
  }
}

/** Graceful shutdown — close shared client. */
export async function closeValkey(): Promise<void> {
  if (sharedClient) {
    try {
      await sharedClient.quit();
      logger.info("[valkey] shared client closed");
    } catch {
      // Force close on error
      try { sharedClient!.disconnect(); } catch { /* noop */ }
    }
    sharedClient = null;
    initAttempted = false;
  }
}

/** Health check — ping Valkey. */
export async function valkeyHealthCheck(): Promise<{ ok: boolean; latencyMs?: number }> {
  const client = await getValkeyClient();
  if (!client) return { ok: false };
  const start = Date.now();
  try {
    await client.ping();
    return { ok: true, latencyMs: Date.now() - start };
  } catch {
    return { ok: false };
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────

/** Mask password in URL for logging. */
function maskUrl(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.password) parsed.password = "****";
    return parsed.toString();
  } catch {
    return "<invalid-url>";
  }
}
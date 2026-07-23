/**
 * cache.ts — Valkey-backed TTL cache with local L1 fallback + pub/sub
 *   multi-instance invalidation.
 *
 * Architecture:
 *   L1: In-memory Map with TTL expiry (fast, always available).
 *   L2: Valkey (Redis-compatible) for cross-instance reads + pub/sub
 *       invalidation. When VALKEY_URL / REDIS_URL is set:
 *         - Reads check L1 first, then L2 (read-through).
 *         - Writes go to both L1 and L2.
 *         - Invalidation publishes to a Valkey channel so other instances
 *           clear their L1.
 *
 * When no Valkey is configured, degrades to pure in-memory (single-instance).
 */

import { EventEmitter } from "node:events";
import { logger } from "./logger";
import { getValkeyClient, getValkeySubscriber, VALKEY_CONFIGURED } from "./valkey";

// ─── Types ────────────────────────────────────────────────────────────────

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

// ─── L1: In-memory store (always active) ──────────────────────────────────

const store = new Map<string, CacheEntry<unknown>>();
const emitter = new EventEmitter();
emitter.setMaxListeners(50);

// Periodic cleanup of expired L1 entries (every 60s)
if (typeof setInterval !== "undefined") {
  setInterval(() => {
    const now = Date.now();
    let cleaned = 0;
    for (const [key, entry] of store) {
      if (entry.expiresAt <= now) {
        store.delete(key);
        cleaned++;
      }
    }
    if (cleaned > 0) logger.debug("[cache] L1 expired entries removed", { cleaned });
  }, 60_000).unref?.();
}

// ─── L2: Valkey subscriber for cross-instance invalidation ────────────────

let pubSubReady = false;

async function initValkeyPubSub(): Promise<void> {
  if (pubSubReady || !VALKEY_CONFIGURED) return;

  const sub = await getValkeySubscriber();
  if (!sub) {
    logger.warn("[cache] VALKEY_URL set but subscriber connection failed — single-instance mode");
    return;
  }

  const CHANNEL = "garfix:cache:invalidate";

  sub.subscribe(CHANNEL).catch((err) => {
    logger.error("[cache] failed to subscribe to Valkey channel", { err: err.message });
  });

  sub.on("message", (channel: string, message: string) => {
    if (channel !== CHANNEL) return;
    try {
      const msg = JSON.parse(message) as { type: "key" | "pattern"; value: string };
      if (msg.type === "key") {
        store.delete(msg.value);
        emitter.emit("invalidate", msg.value);
      } else if (msg.type === "pattern") {
        for (const key of store.keys()) {
          if (key.startsWith(msg.value)) store.delete(key);
        }
        emitter.emit("invalidate-pattern", msg.value);
      }
    } catch {
      // ignore malformed messages
    }
  });

  pubSubReady = true;
  logger.info("[cache] Valkey pub/sub subscriber active", { channel: CHANNEL });
}

// ─── Valkey helpers ───────────────────────────────────────────────────────

async function valkeyGet<T>(key: string): Promise<T | null> {
  const client = await getValkeyClient();
  if (!client) return null;
  try {
    const raw = await client.get(`cache:${key}`);
    if (!raw) return null;
    const entry = JSON.parse(raw) as CacheEntry<T>;
    if (entry.expiresAt <= Date.now()) {
      // Expired in Valkey — clean up
      await client.del(`cache:${key}`).catch(() => {});
      return null;
    }
    return entry.value;
  } catch (err) {
    logger.debug("[cache] Valkey GET failed — returning null", {
      err: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

async function valkeySet<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
  const client = await getValkeyClient();
  if (!client) return;
  try {
    const entry: CacheEntry<T> = {
      value,
      expiresAt: Date.now() + ttlSeconds * 1000,
    };
    await client.set(`cache:${key}`, JSON.stringify(entry), "EX", Math.ceil(ttlSeconds));
  } catch (err) {
    logger.debug("[cache] Valkey SET failed (L1 still valid)", {
      err: err instanceof Error ? err.message : String(err),
    });
  }
}

async function valkeyPublishInvalidation(type: "key" | "pattern", value: string): Promise<void> {
  const client = await getValkeyClient();
  if (!client) return;
  try {
    await client.publish("garfix:cache:invalidate", JSON.stringify({ type, value }));
  } catch {
    // Best-effort — L1 is still valid locally
  }
}

// ─── Public API ───────────────────────────────────────────────────────────

export async function cacheGet<T>(key: string): Promise<T | null> {
  // L1 check
  const l1Entry = store.get(key) as CacheEntry<T> | undefined;
  if (l1Entry) {
    if (l1Entry.expiresAt <= Date.now()) {
      store.delete(key);
    } else {
      return l1Entry.value;
    }
  }

  // L2 check (Valkey)
  if (VALKEY_CONFIGURED) {
    const l2Value = await valkeyGet<T>(key);
    if (l2Value !== null) {
      // Promote to L1
      // We don't know the original TTL here, so set a reasonable default
      const l1Entry2: CacheEntry<T> = { value: l2Value, expiresAt: Date.now() + 300_000 };
      store.set(key, l1Entry2);
      return l2Value;
    }
  }

  return null;
}

export async function cacheSet<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
  const expiresAt = Date.now() + ttlSeconds * 1000;

  // L1
  store.set(key, { value, expiresAt });

  // L2 (Valkey)
  if (VALKEY_CONFIGURED) {
    await valkeySet(key, value, ttlSeconds);
  }
}

export async function cacheInvalidate(key: string): Promise<void> {
  // L1
  store.delete(key);
  emitter.emit("invalidate", key);

  // L2 + pub/sub
  if (VALKEY_CONFIGURED) {
    const client = await getValkeyClient();
    if (client) {
      await client.del(`cache:${key}`).catch(() => {});
    }
    await valkeyPublishInvalidation("key", key);
  }
}

export async function cacheInvalidatePattern(prefix: string): Promise<void> {
  // L1
  for (const key of store.keys()) {
    if (key.startsWith(prefix)) store.delete(key);
  }
  emitter.emit("invalidate-pattern", prefix);

  // L2: delete matching keys via SCAN (avoids KEYS command in production)
  if (VALKEY_CONFIGURED) {
    const client = await getValkeyClient();
    if (client) {
      try {
        let cursor = "0";
        const pattern = `cache:${prefix}*`;
        do {
          const [nextCursor, keys] = await client.scan(
            Number(cursor), "MATCH", pattern, "COUNT", 100,
          );
          cursor = nextCursor;
          if (keys.length > 0) {
            await client.del(...keys).catch(() => {});
          }
        } while (cursor !== "0");
      } catch (err) {
        logger.debug("[cache] Valkey SCAN+DEL failed", {
          err: err instanceof Error ? err.message : String(err),
        });
      }
    }
    await valkeyPublishInvalidation("pattern", prefix);
  }
}

/** Subscribe to L1 invalidation events (for in-process listeners). */
export function onCacheInvalidate(cb: (key: string) => void): () => void {
  const handler = (key: string) => cb(key);
  emitter.on("invalidate", handler);
  return () => emitter.off("invalidate", handler);
}

export function onCacheInvalidatePattern(cb: (prefix: string) => void): () => void {
  const handler = (prefix: string) => cb(prefix);
  emitter.on("invalidate-pattern", handler);
  return () => emitter.off("invalidate-pattern", handler);
}

/**
 * Cache wrapper — fetch from cache, on miss call fetcher, store, return.
 * Composes the key from prefix + suffix parts.
 */
export async function cached<T>(
  keyParts: string[],
  ttlSeconds: number,
  fetcher: () => Promise<T>,
): Promise<T> {
  const key = keyParts.join(":");
  const hit = await cacheGet<T>(key);
  if (hit !== null) return hit;
  const value = await fetcher();
  await cacheSet(key, value, ttlSeconds);
  return value;
}

/** Stats for monitoring. */
export function cacheStats() {
  return {
    l1Size: store.size,
    keys: Array.from(store.keys()),
    valkeyEnabled: VALKEY_CONFIGURED,
    pubSubReady,
  };
}

/** Initialize Valkey pub/sub subscriber (call on server boot). */
export async function initCachePubSub(): Promise<void> {
  await initValkeyPubSub();
}
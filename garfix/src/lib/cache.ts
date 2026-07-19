/**
 * cache.ts — In-memory TTL cache + pub/sub for multi-instance invalidation.
 *
 * Since the sandbox runs SQLite (no Redis available), we use an in-memory
 * Map with TTL expiry. For multi-instance deployments, a pub/sub event
 * emitter is exposed so any process can broadcast invalidation events
 * (in single-instance mode, this is a local EventEmitter; in production
 * with Redis available, swap the implementation to subscribe to a Redis channel).
 */

import { EventEmitter } from "node:events";
import { logger } from "./logger";

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

const store = new Map<string, CacheEntry<unknown>>();
const emitter = new EventEmitter();
emitter.setMaxListeners(50);

// Periodic cleanup of expired entries (every 60s)
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
    if (cleaned > 0) logger.debug("[cache] expired entries removed", { cleaned });
  }, 60_000).unref?.();
}

export async function cacheGet<T>(key: string): Promise<T | null> {
  const entry = store.get(key) as CacheEntry<T> | undefined;
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    store.delete(key);
    return null;
  }
  return entry.value;
}

export async function cacheSet<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
  const expiresAt = Date.now() + ttlSeconds * 1000;
  store.set(key, { value, expiresAt });
}

export async function cacheInvalidate(key: string): Promise<void> {
  store.delete(key);
  // Broadcast to other instances
  emitter.emit("invalidate", key);
}

export async function cacheInvalidatePattern(prefix: string): Promise<void> {
  for (const key of store.keys()) {
    if (key.startsWith(prefix)) store.delete(key);
  }
  emitter.emit("invalidate-pattern", prefix);
}

/** Subscribe to invalidation events (for multi-instance sync). */
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
    size: store.size,
    keys: Array.from(store.keys()),
  };
}

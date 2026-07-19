/**
 * pubSub.ts — Pub/sub event bus for multi-instance coordination (E-33).
 *
 * When the app runs as multiple Node instances (e.g. PM2 cluster, Kubernetes
 * pods), each instance has its own in-memory cache. Without pub/sub, a
 * settings update on instance A doesn't invalidate the cache on instance B.
 *
 * In sandbox (single instance): uses local EventEmitter — works but no
 * cross-process sync (which is fine because there's only one process).
 *
 * In production with Redis: swap LocalPubSub for RedisPubSub — subscribe
 * to a Redis channel, publish invalidation events, every instance receives
 * them and clears its local cache.
 */

import { EventEmitter } from "node:events";
import { logger } from "./logger";

export interface PubSubMessage {
  channel: string;
  payload: unknown;
}

type MessageHandler = (payload: unknown) => void;

interface PubSubDriver {
  publish(channel: string, payload: unknown): Promise<void>;
  subscribe(channel: string, handler: MessageHandler): () => void;
}

class LocalPubSub implements PubSubDriver {
  private emitter = new EventEmitter();

  constructor() {
    this.emitter.setMaxListeners(100);
  }

  async publish(channel: string, payload: unknown): Promise<void> {
    this.emitter.emit(channel, payload);
  }

  subscribe(channel: string, handler: MessageHandler): () => void {
    this.emitter.on(channel, handler);
    return () => this.emitter.off(channel, handler);
  }
}

// Factory — picks the right driver based on env
let driver: PubSubSub | null = null;

class PubSubSub {
  private impl: PubSubDriver;
  constructor() {
    // In production with REDIS_URL set, would use RedisPubSub
    this.impl = new LocalPubSub();
    logger.info("[pubsub] initialized local driver");
  }
  publish(channel: string, payload: unknown) { return this.impl.publish(channel, payload); }
  subscribe(channel: string, handler: MessageHandler) { return this.impl.subscribe(channel, handler); }
}

function getDriver(): PubSubSub {
  if (!driver) driver = new PubSubSub();
  return driver;
}

// ─── Public API ─────────────────────────────────────────────────────────────

export const CHANNELS = {
  CACHE_INVALIDATE: "cache:invalidate",
  CACHE_INVALIDATE_PATTERN: "cache:invalidate-pattern",
  SETTINGS_UPDATED: "settings:updated",
  USER_SESSIONS_REVOKED: "auth:sessions-revoked",
  COMPANY_UPDATED: "company:updated",
  ANNOUNCEMENT_PUBLISHED: "announcement:published",
} as const;

export async function publish(channel: string, payload: unknown): Promise<void> {
  await getDriver().publish(channel, payload);
}

export function subscribe(channel: string, handler: MessageHandler): () => void {
  return getDriver().subscribe(channel, handler);
}

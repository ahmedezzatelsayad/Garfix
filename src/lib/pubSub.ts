/**
 * pubSub.ts — Pub/sub event bus for multi-instance coordination (E-33).
 *
 * When the app runs as multiple Node instances (e.g. PM2 cluster, Kubernetes
 * pods), each instance has its own in-memory cache. Without pub/sub, a
 * settings update on instance A doesn't invalidate the cache on instance B.
 *
 * Driver selection:
 *   - VALKEY_URL / REDIS_URL set  → RedisPubSub (Valkey pub/sub, cross-process).
 *   - Not set (sandbox/dev)        → LocalPubSub (EventEmitter, single-instance).
 */

import { EventEmitter } from "node:events";
import { logger } from "./logger";
import { getValkeyClient, getValkeySubscriber, VALKEY_CONFIGURED } from "./valkey";

export interface PubSubMessage {
  channel: string;
  payload: unknown;
}

type MessageHandler = (payload: unknown) => void;

interface PubSubDriver {
  publish(channel: string, payload: unknown): Promise<void>;
  subscribe(channel: string, handler: MessageHandler): () => void;
}

// ─── Local driver (dev/sandbox) ───────────────────────────────────────────

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

// ─── Valkey driver (production) ───────────────────────────────────────────

class ValkeyPubSub implements PubSubDriver {
  private publisherPromise: Promise<import("ioredis").default | null>;
  private subscriberPromise: Promise<import("ioredis").default | null>;
  private localEmitter = new EventEmitter();
  private initialized = false;

  constructor() {
    this.localEmitter.setMaxListeners(200);
    this.publisherPromise = getValkeyClient();
    this.subscriberPromise = getValkeySubscriber();

    // Fire-and-forget init
    this.init().catch((err) => {
      logger.error("[pubsub] Valkey init failed — falling back to local", {
        err: err instanceof Error ? err.message : String(err),
      });
    });
  }

  private async init(): Promise<void> {
    if (this.initialized) return;

    const sub = await this.subscriberPromise;
    if (!sub) {
      logger.warn("[pubsub] subscriber connection failed — local-only mode");
      return;
    }

    // Subscribe to all known channels
    const allChannels = Object.values(CHANNELS);
    const pattern = "garfix:*";

    sub.subscribe(pattern).catch((err) => {
      logger.error("[pubsub] failed to subscribe to pattern", { err: err.message });
    });

    sub.on("message", (channel: string, message: string) => {
      try {
        const msg = JSON.parse(message) as PubSubMessage;
        if (msg.channel === channel) {
          this.localEmitter.emit(channel, msg.payload);
        }
      } catch {
        // ignore malformed
      }
    });

    this.initialized = true;
    logger.info("[pubsub] Valkey driver active", {
      channels: allChannels,
      pattern,
    });
  }

  async publish(channel: string, payload: unknown): Promise<void> {
    // Always emit locally so the publishing instance gets it too
    this.localEmitter.emit(channel, payload);

    const client = await this.publisherPromise;
    if (!client) {
      logger.debug("[pubsub] no Valkey publisher — local-only emit");
      return;
    }

    try {
      // Use psubscribe-compatible channel naming
      const valkeyChannel = `garfix:${channel}`;
      const msg: PubSubMessage = { channel, payload };
      await client.publish(valkeyChannel, JSON.stringify(msg));
    } catch (err) {
      logger.debug("[pubsub] Valkey publish failed (local emit succeeded)", {
        err: err instanceof Error ? err.message : String(err),
      });
    }
  }

  subscribe(channel: string, handler: MessageHandler): () => void {
    this.localEmitter.on(channel, handler);
    return () => this.localEmitter.off(channel, handler);
  }
}

// ─── Factory ──────────────────────────────────────────────────────────────

let driver: PubSubDriver | null = null;

function getDriver(): PubSubDriver {
  if (!driver) {
    if (VALKEY_CONFIGURED) {
      driver = new ValkeyPubSub();
      logger.info("[pubsub] initialized Valkey driver (cross-instance)");
    } else {
      driver = new LocalPubSub();
      logger.info("[pubsub] initialized local driver (single-instance)");
    }
  }
  return driver;
}

// ─── Channels ─────────────────────────────────────────────────────────────

export const CHANNELS = {
  CACHE_INVALIDATE: "cache:invalidate",
  CACHE_INVALIDATE_PATTERN: "cache:invalidate-pattern",
  SETTINGS_UPDATED: "settings:updated",
  USER_SESSIONS_REVOKED: "auth:sessions-revoked",
  COMPANY_UPDATED: "company:updated",
  ANNOUNCEMENT_PUBLISHED: "announcement:published",
} as const;

// ─── Public API ───────────────────────────────────────────────────────────

export async function publish(channel: string, payload: unknown): Promise<void> {
  await getDriver().publish(channel, payload);
}

export function subscribe(channel: string, handler: MessageHandler): () => void {
  return getDriver().subscribe(channel, handler);
}

/** Pre-initialize the driver (call on server boot to warm up connections). */
export async function initPubSub(): Promise<void> {
  getDriver(); // trigger lazy init
}
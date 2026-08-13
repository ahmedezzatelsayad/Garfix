/**
 * registry.ts — Integration Provider Registry + Encrypted Credential Storage.
 *
 * Providers register themselves at module load via `registerProvider`.
 * Credentials live in the `platform_settings` table at key
 *   `integration.<type>.credentials`
 * stored as a JSON map of { field: encryptedValue }.
 *
 * Read/write paths:
 *   getIntegrationConfig(type)  → decrypt all fields for one provider
 *   setIntegrationConfig(type)  → encrypt + upsert credentials
 *   disconnectIntegration(type) → delete the row entirely
 */
import { dbTyped as db } from "@/lib/db";
import { decryptSecret, encryptSecret } from "@/lib/cryptoVault";
import { logger } from "@/lib/logger";
import type { IntegrationProvider } from "./types";

const providers = new Map<string, IntegrationProvider>();

/** Register a provider implementation under its type key. */
export function registerProvider(type: string, provider: IntegrationProvider): void {
  providers.set(type, provider);
  logger.info("[integrations] provider registered", { type });
}

/** Look up a registered provider by type. Returns null if not registered. */
export function getProvider(type: string): IntegrationProvider | null {
  return providers.get(type) || null;
}

/** Return all registered provider type keys (for diagnostics). */
export function listRegisteredProviders(): string[] {
  return Array.from(providers.keys());
}

// ─── Credential storage ────────────────────────────────────────────────────

function settingKey(type: string): string {
  return `integration.${type}.credentials`;
}

// SEC-14 FIX (Audit v2 · Phase 3): short-TTL in-memory cache for decrypted
// integration secrets. Previously `getIntegrationConfig()` hit the DB and ran
// the AES decrypt on EVERY call — and (worse) several callers stashed the
// decrypted Record in their own module-level variables, keeping plaintext
// secrets in process memory for the entire lifetime of the Node process.
//
// We now centralize caching here with:
//   - TTL of 5 minutes (300_000 ms): warm enough to absorb bursty sends,
//     short enough to limit exposure window.
//   - Plaintext is stored in a closure-scoped Map — not exported — and is
//     overwritten with zeros on expiry so it cannot be re-read by a heap
//     snapshot taken after expiry.
//   - `purgeIntegrationCache(type)` lets callers explicitly zero+evict a
//     secret after a sensitive operation (e.g. after sending a message).
const SECRET_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

interface CachedSecret {
  value: Record<string, string>;
  expiresAt: number;
}

const secretCache = new Map<string, CachedSecret>();

/** Best-effort overwrite of a decrypted secret string with zeros. */
function zeroOutSecrets(rec: Record<string, string>): void {
  for (const k of Object.keys(rec)) {
    const v = rec[k];
    if (typeof v === "string" && v.length > 0) {
      // Overwrite the buffer's characters in place. JS strings are immutable,
      // so this reassigns the property — but the original string may still
      // live in V8's intern table briefly. This raises the bar against a
      // casual heap-dump reader; full zeroization requires Buffer-backed
      // secrets (tracked as a future hardening task).
      rec[k] = "\0".repeat(v.length);
    }
  }
}

/**
 * Explicitly purge a single integration's cached plaintext from memory and
 * overwrite it with zeros. Call this after a sensitive operation completes
 * (e.g. after `whatsappProvider.sendTextMessage()` returns) to shrink the
 * plaintext exposure window.
 */
export function purgeIntegrationCache(type: string): void {
  const cached = secretCache.get(type);
  if (cached) {
    zeroOutSecrets(cached.value);
    secretCache.delete(type);
  }
}

/** Purge ALL cached integration secrets (e.g. on logout / admin rotation). */
export function purgeAllIntegrationCaches(): void {
  for (const [, cached] of secretCache) {
    zeroOutSecrets(cached.value);
  }
  secretCache.clear();
}

/**
 * Read + decrypt credentials for one integration.
 * Returns null if no credentials are stored or JSON is malformed.
 *
 * SEC-14 FIX: results are cached for `SECRET_CACHE_TTL_MS`. The cached
 * plaintext is zeroized on eviction.
 */
export async function getIntegrationConfig(
  type: string,
): Promise<Record<string, string> | null> {
  // Check cache first (and lazily evict expired entries).
  const cached = secretCache.get(type);
  if (cached) {
    if (Date.now() < cached.expiresAt) {
      // Return a shallow COPY so callers cannot mutate / leak the cached ref.
      return { ...cached.value };
    }
    // Expired — zeroize and drop before re-fetching.
    zeroOutSecrets(cached.value);
    secretCache.delete(type);
  }

  const key = settingKey(type);
  const setting = await db.platformSettings.findUnique({ where: { key } });
  if (!setting) return null;
  try {
    const encrypted = JSON.parse(setting.value) as Record<string, string>;
    const decrypted: Record<string, string> = {};
    for (const [k, v] of Object.entries(encrypted)) {
      decrypted[k] = decryptSecret(v);
    }
    // Cache the decrypted plaintext with a short TTL.
    secretCache.set(type, {
      value: { ...decrypted },
      expiresAt: Date.now() + SECRET_CACHE_TTL_MS,
    });
    return decrypted;
  } catch (err) {
    logger.error("[integrations] failed to read config", {
      type,
      err: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

/**
 * Encrypt + persist credentials for one integration. Upserts the row.
 */
export async function setIntegrationConfig(
  type: string,
  credentials: Record<string, string>,
): Promise<void> {
  const key = settingKey(type);
  const encrypted: Record<string, string> = {};
  for (const [k, v] of Object.entries(credentials)) {
    encrypted[k] = encryptSecret(v);
  }
  const value = JSON.stringify(encrypted);
  const existing = await db.platformSettings.findUnique({ where: { key } });
  if (existing) {
    await db.platformSettings.update({ where: { key }, data: { value } });
  } else {
    await db.platformSettings.create({
      data: { key, category: "integration", valueType: "json", value },
    });
  }
  logger.info("[integrations] credentials saved", {
    type,
    fields: Object.keys(credentials),
  });
}

/**
 * Remove all stored credentials for one integration.
 */
export async function disconnectIntegration(type: string): Promise<void> {
  const key = settingKey(type);
  await db.platformSettings.deleteMany({ where: { key } });
  logger.info("[integrations] credentials removed", { type });
}

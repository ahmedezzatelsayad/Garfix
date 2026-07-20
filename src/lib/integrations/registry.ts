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
import { db } from "@/lib/db";
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

/**
 * Read + decrypt credentials for one integration.
 * Returns null if no credentials are stored or JSON is malformed.
 */
export async function getIntegrationConfig(
  type: string,
): Promise<Record<string, string> | null> {
  const key = settingKey(type);
  const setting = await db.platformSetting.findUnique({ where: { key } });
  if (!setting) return null;
  try {
    const encrypted = JSON.parse(setting.value) as Record<string, string>;
    const decrypted: Record<string, string> = {};
    for (const [k, v] of Object.entries(encrypted)) {
      decrypted[k] = decryptSecret(v);
    }
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
  const existing = await db.platformSetting.findUnique({ where: { key } });
  if (existing) {
    await db.platformSetting.update({ where: { key }, data: { value } });
  } else {
    await db.platformSetting.create({
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
  await db.platformSetting.deleteMany({ where: { key } });
  logger.info("[integrations] credentials removed", { type });
}

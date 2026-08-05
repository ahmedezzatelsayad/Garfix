/**
 * ═════════════════════════════════════════════════════════════
 * GarfiX DS v4.1 — Valkey-backed AI Key Pool Manager
 *
 * بيحل مشكلة التوسع (scalability) في نموذج الـ Founder key distribution:
 *
 * الفكرة:
 *   - المؤسس عنده حساب DeepSeek واحد (أو كام حساب)
 *   - بيوزّع المفاتيح على الشركات عبر `ApiKeyPool`
 *   - Valkey بتدير round-robin + rate-limiting عبر كل الشركات اللي بتشارك
 *     نفس المفتاح
 *
 * الـ model الجديد:
 *   1. كل شركة ليها `CompanyAIConfig` بمفاتيحها الخاصة (per-feature)
 *   2. لو الشركة معندهاش مفتاح، الـ pool بيوفر واحد (round-robin)
 *   3. الـ pool مش 1:1 — مفتاح واحد ممكن يخدم شركات كتير
 *      (في حدود الـ RPM الخاص بيه)
 *   4. Valkey بتـ atomic increment للـ usage لكل مفتاح
 *
 * الـ Valkey keys المستخدمة:
 *   - `ai:pool:used:{keyId}:{minute}` — counter per minute per key
 *   - `ai:pool:rr:{provider}` — round-robin pointer per provider
 *   - `ai:pool:cooldown:{keyId}` — short TTL when a key hits 429
 *
 * ═════════════════════════════════════════════════════════════
 */

import { dbTyped as db } from "@/lib/db";
import { getValkeyClient, VALKEY_CONFIGURED } from "@/lib/valkey";
import { logger } from "@/lib/logger";
import { decryptApiKey } from "./keyVault";

export interface PoolKey {
  id: string;
  /** The decrypted, usable API key — NEVER log this */
  apiKey: string;
  provider: string;
  model: string;
  rpmLimit: number;
  dailyLimit: number;
}

export interface PoolSelectionResult {
  key: PoolKey | null;
  /** Why no key was available (when key is null) */
  reason?: "no_keys" | "all_rate_limited" | "valkey_unavailable" | "db_error";
  /** Which key ID was selected (for usage tracking) */
  selectedKeyId?: string;
  /** Whether this request was rate-limited against Valkey */
  distributed: boolean;
}

const RR_PREFIX = "ai:pool:rr";
const USAGE_PREFIX = "ai:pool:used";
const COOLDOWN_PREFIX = "ai:pool:cooldown";
const MINUTE_MS = 60_000;
const COOLDOWN_SECONDS = 60; // back off for 1 min when a key 429s

// ── Public API ────────────────────────────────────────────────────────

/**
 * Pick the next available key from the pool for a given provider.
 *
 * Strategy:
 *   1. Load all available keys for the provider from the DB (status='available')
 *   2. Filter out keys in cooldown (Valkey SETEX when 429 hit)
 *   3. Round-robin via Valkey INCR on `ai:pool:rr:{provider}`
 *   4. Atomic INCR on `ai:pool:used:{keyId}:{minute}` to enforce RPM
 *   5. If the chosen key is over its RPM, try the next one
 *
 * Falls back gracefully if Valkey is not configured:
 *   - Uses DB-stored `timesUsed` / `usedToday` (less accurate, single-instance only)
 *
 * @param provider - "deepseek" | "openrouter" | "gemini" | "openai"
 * @param companyId - The company requesting the key (for assignment tracking)
 */
export async function pickPoolKey(
  provider: string,
  companyId: string
): Promise<PoolSelectionResult> {
  try {
    // Load all available keys for this provider from the DB.
    // `assignedToCompanyId` can be null (shared pool) OR match the requesting
    // company (exclusively assigned). Either way, the key is usable by this
    // company.
    const keys = await db.apiKeyPool.findMany({
      where: {
        provider,
        status: "available",
        OR: [
          { assignedToCompanyId: null },
          { assignedToCompanyId: companyId },
        ],
      },
      orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
      take: 20, // reasonable upper bound — we round-robin within these
    });

    if (keys.length === 0) {
      return { key: null, reason: "no_keys", distributed: false };
    }

    // Fast path: only one key → use it directly (no round-robin needed)
    if (keys.length === 1) {
      const k = keys[0];
      const allowed = await consumeKeySlot(k.id, k.rpmLimit);
      if (!allowed) {
        return { key: null, reason: "all_rate_limited", distributed: VALKEY_CONFIGURED };
      }
      return {
        key: await hydratePoolKey(k),
        selectedKeyId: k.id,
        distributed: VALKEY_CONFIGURED,
      };
    }

    // Multi-key path: round-robin via Valkey (or fallback to in-process counter)
    const valkey = await getValkeyClient();
    const rrKey = `${RR_PREFIX}:${provider}`;

    let startIndex = 0;
    if (valkey) {
      try {
        const idx = await valkey.incr(rrKey);
        startIndex = (idx - 1) % keys.length;
      } catch (err) {
        logger.warn("[keyPool] Valkey INCR for round-robin failed, using random", {
          err: err instanceof Error ? err.message : String(err),
        });
        startIndex = Math.floor(Math.random() * keys.length);
      }
    } else {
      startIndex = Math.floor(Math.random() * keys.length);
    }

    // Try keys in round-robin order; first one that passes rate-limit wins
    for (let i = 0; i < keys.length; i++) {
      const idx = (startIndex + i) % keys.length;
      const k = keys[idx];

      // Skip keys in cooldown (recently hit 429)
      if (await isKeyInCooldown(k.id)) continue;

      const allowed = await consumeKeySlot(k.id, k.rpmLimit);
      if (allowed) {
        return {
          key: await hydratePoolKey(k),
          selectedKeyId: k.id,
          distributed: VALKEY_CONFIGURED,
        };
      }
    }

    return { key: null, reason: "all_rate_limited", distributed: VALKEY_CONFIGURED };
  } catch (err) {
    logger.error("[keyPool] pickPoolKey failed", {
      err: err instanceof Error ? err.message : String(err),
      provider,
      companyId,
    });
    return { key: null, reason: "db_error", distributed: false };
  }
}

/**
 * Mark a key as having hit a 429 (rate limit) from the upstream provider.
 * Sets a short cooldown in Valkey so we skip this key for the next minute.
 *
 * Also increments the DB-side `timesUsed` counter for observability.
 */
export async function markKeyRateLimited(keyId: string): Promise<void> {
  // DB side: increment usage counter
  try {
    await db.apiKeyPool.update({
      where: { id: keyId },
      data: {
        lastUsedAt: new Date(),
      },
    });
  } catch {
    // Non-critical — don't fail the request because of a DB update
  }

  // Valkey side: set cooldown
  if (!VALKEY_CONFIGURED) return;
  const valkey = await getValkeyClient();
  if (!valkey) return;

  try {
    const cooldownKey = `${COOLDOWN_PREFIX}:${keyId}`;
    await valkey.set(cooldownKey, "1", "EX", COOLDOWN_SECONDS);
  } catch (err) {
    logger.warn("[keyPool] failed to set cooldown", {
      err: err instanceof Error ? err.message : String(err),
      keyId,
    });
  }
}

/**
 * Record a successful use of a pool key (for observability / billing).
 *
 * This is best-effort — failures here do NOT block the AI call.
 */
export async function recordKeyUse(
  keyId: string,
  tokensUsed: number
): Promise<void> {
  try {
    await db.apiKeyPool.update({
      where: { id: keyId },
      data: {
        timesUsed: { increment: BigInt(1) },
        lastUsedAt: new Date(),
        usedToday: { increment: BigInt(1) },
      },
    });
  } catch (err) {
    logger.debug("[keyPool] recordKeyUse DB update failed (non-critical)", {
      err: err instanceof Error ? err.message : String(err),
      keyId,
      tokensUsed,
    });
  }
}

// ── Internal Helpers ──────────────────────────────────────────────────

/**
 * Consume one rate-limit slot for a key (per-minute window).
 *
 * Uses Valkey INCR with EXPIRE for distributed counting.
 * Falls back to "always allow" if Valkey is unavailable — the upstream
 * provider's own 429 is the backstop in that case.
 */
async function consumeKeySlot(
  keyId: string,
  rpmLimit: number
): Promise<boolean> {
  if (!VALKEY_CONFIGURED) return true; // no Valkey → let upstream enforce

  const valkey = await getValkeyClient();
  if (!valkey) return true;

  const now = Date.now();
  const minuteBucket = Math.floor(now / MINUTE_MS);
  const usageKey = `${USAGE_PREFIX}:${keyId}:${minuteBucket}`;

  try {
    const pipeline = valkey.pipeline();
    pipeline.incr(usageKey);
    pipeline.expire(usageKey, 90); // 1.5x window
    const results = await pipeline.exec();
    if (!results) return true;

    const countTuple = results[0] as [Error | null, number];
    const currentCount = countTuple[1] || 0;

    return currentCount <= rpmLimit;
  } catch (err) {
    logger.warn("[keyPool] consumeKeySlot Valkey check failed — allowing", {
      err: err instanceof Error ? err.message : String(err),
      keyId,
    });
    return true; // fail-open: let upstream enforce
  }
}

/**
 * Check if a key is currently in cooldown (recently hit a 429).
 */
async function isKeyInCooldown(keyId: string): Promise<boolean> {
  if (!VALKEY_CONFIGURED) return false;
  const valkey = await getValkeyClient();
  if (!valkey) return false;

  try {
    const cooldownKey = `${COOLDOWN_PREFIX}:${keyId}`;
    const exists = await valkey.exists(cooldownKey);
    return exists === 1;
  } catch {
    return false; // fail-open
  }
}

/**
 * Convert a DB row into a usable PoolKey (decrypt the keyValue).
 */
async function hydratePoolKey(row: {
  id: string;
  keyValue: string;
  provider: string;
  model: string;
  rpmLimit: number;
  dailyLimit: number;
}): Promise<PoolKey> {
  return {
    id: row.id,
    apiKey: decryptApiKey(row.keyValue),
    provider: row.provider,
    model: row.model,
    rpmLimit: row.rpmLimit,
    dailyLimit: row.dailyLimit,
  };
}

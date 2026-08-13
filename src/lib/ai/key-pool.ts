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
  reason?: "no_keys" | "all_rate_limited" | "all_daily_exhausted" | "valkey_unavailable" | "db_error";
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
    // BUG FIX: previously this branch skipped the cooldown check, so a key
    // that just 429'd would be picked again immediately, re-429, and burn
    // requests for the full cooldown minute.
    if (keys.length === 1) {
      const k = keys[0];
      // AI-06 FIX (Audit v2 · Phase 2): enforce ApiKeyPool.dailyLimit.
      // `usedToday` (BigInt) tracks requests issued against the key today;
      // `dailyLimit` (Int) is the per-key daily request cap. When the cap
      // is reached, the key is skipped and the caller sees a distinct
      // reason so the founder dashboard can surface "all keys exhausted for
      // the day" instead of a generic rate-limit.
      if (isKeyDailyLimitExceeded(k)) {
        logger.info("[keyPool] single key has hit dailyLimit — skipping", {
          keyId: k.id,
          usedToday: k.usedToday.toString(),
          dailyLimit: k.dailyLimit,
        });
        return { key: null, reason: "all_daily_exhausted", distributed: VALKEY_CONFIGURED };
      }
      if (await isKeyInCooldown(k.id)) {
        return { key: null, reason: "all_rate_limited", distributed: VALKEY_CONFIGURED };
      }
      const allowed = await consumeKeySlot(k.id, k.rpmLimit);
      if (!allowed) {
        return { key: null, reason: "all_rate_limited", distributed: VALKEY_CONFIGURED };
      }
      const hydrated = await hydratePoolKey(k);
      // BUG FIX: skip corrupted keys (decryptApiKey returned "")
      if (!hydrated.apiKey) {
        logger.error("[keyPool] pool key has corrupted/unusable keyValue", { keyId: k.id });
        return { key: null, reason: "db_error", distributed: VALKEY_CONFIGURED };
      }
      return {
        key: hydrated,
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
        // BUG FIX: bound the RR counter so it doesn't grow unboundedly.
        // Reset to 0 every ~24h. Without this, if the pool's key set changes
        // (new key added, old one revoked), (idx-1) % keys.length distributes
        // unevenly for a while and the counter can grow forever.
        // Only set EXPIRE on the first increment (count === 1) to avoid
        // resetting the TTL on every call (which would prevent cleanup).
        if (idx === 1) {
          await valkey.expire(rrKey, 86400).catch(() => {});
        }
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
    let dailyExhaustedCount = 0;
    for (let i = 0; i < keys.length; i++) {
      const idx = (startIndex + i) % keys.length;
      const k = keys[idx];

      // AI-06 FIX (Audit v2 · Phase 2): enforce ApiKeyPool.dailyLimit.
      // Skip keys whose `usedToday` has reached `dailyLimit`. We count
      // how many keys were skipped for this reason so the final return
      // value can use the precise `all_daily_exhausted` reason when ALL
      // keys were skipped due to daily caps (vs. minute-window 429s).
      if (isKeyDailyLimitExceeded(k)) {
        dailyExhaustedCount++;
        logger.debug("[keyPool] key has hit dailyLimit — skipping", {
          keyId: k.id,
          usedToday: k.usedToday.toString(),
          dailyLimit: k.dailyLimit,
        });
        continue;
      }

      // Skip keys in cooldown (recently hit 429)
      if (await isKeyInCooldown(k.id)) continue;

      const allowed = await consumeKeySlot(k.id, k.rpmLimit);
      if (allowed) {
        const hydrated = await hydratePoolKey(k);
        // BUG FIX: skip corrupted keys (decryptApiKey returned "") — try the next one
        if (!hydrated.apiKey) {
          logger.error("[keyPool] pool key has corrupted/unusable keyValue", { keyId: k.id });
          // Release the slot we just consumed so the next request can try the next key
          await releaseKeySlot(k.id).catch(() => {});
          continue;
        }
        return {
          key: hydrated,
          selectedKeyId: k.id,
          distributed: VALKEY_CONFIGURED,
        };
      }
    }

    // All keys were either in cooldown or over their daily cap. If every
    // key was over its daily cap (no cooldowns hit), surface the precise
    // reason so the founder dashboard can show "pool exhausted for the
    // day — reset at midnight" (AI-06 FIX). Otherwise the generic
    // all_rate_limited reason, which means minute-window 429s are still
    // active and the request should retry shortly.
    if (dailyExhaustedCount === keys.length) {
      return { key: null, reason: "all_daily_exhausted", distributed: VALKEY_CONFIGURED };
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
 * NOTE: this function does NOT increment `timesUsed` — that's done by
 * `recordKeyUse()` on successful calls. The 429 path only refreshes
 * `lastUsedAt` so the founder's dashboard shows when the key was last
 * attempted, even if the upstream rejected it.
 */
export async function markKeyRateLimited(keyId: string): Promise<void> {
  // DB side: refresh lastUsedAt (not timesUsed — see note above)
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
 * Increments `timesUsed` + `usedToday` and refreshes `lastUsedAt`.
 * The `tokensUsed` parameter is currently NOT persisted (the ApiKeyPool
 * schema has no `tokensUsed` column) — it's accepted for forward-
 * compatibility and logged on error for debugging.
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
      // tokensUsed is logged here for debugging — it's not persisted yet
      // (ApiKeyPool schema has no tokensUsed column). Forward-compat: when
      // we add the column, this log line will help audit the gap.
      tokensUsed,
    });
  }
}

// ── Internal Helpers ──────────────────────────────────────────────────

/**
 * AI-06 FIX (Audit v2 · Phase 2): check whether a pool key has hit its
 * `dailyLimit` for the current day.
 *
 * The schema field is `usedToday` (BigInt, request count) — there is no
 * `tokensUsedToday` column. The task description references "tokensUsedToday"
 * but the actual schema tracks request-level usage via `usedToday` (incremented
 * by `recordKeyUse`). We enforce at the request level (most aligned with what
 * the schema offers and what `dailyLimit` is documented as: "Requests per day").
 *
 * When the daily cap is hit, `pickPoolKey` skips the key and either tries the
 * next one (multi-key path) or returns `all_daily_exhausted` (single-key path
 * or every key exhausted). The daily reset cron
 * (`scripts/cron-reset-daily-usage.ts`) zeroes `usedToday` at midnight.
 *
 * Returns true when the key MUST be skipped today.
 */
function isKeyDailyLimitExceeded(k: {
  usedToday: bigint;
  dailyLimit: number;
}): boolean {
  // dailyLimit <= 0 means "no daily cap" (some providers have effectively
  // unlimited daily quota). A non-positive cap is treated as unbounded so
  // the router doesn't accidentally block every key.
  if (k.dailyLimit <= 0) return false;
  // BigInt → Number conversion is safe here: dailyLimit is Int (<= 2^31)
  // and usedToday only overflows Number.MAX_SAFE_INTEGER at ~9 quadrillion
  // requests/day, which is astronomically beyond any realistic key cap.
  const usedToday = Number(k.usedToday);
  return usedToday >= k.dailyLimit;
}

/**
 * Consume one rate-limit slot for a key (per-minute window).
 *
 * Uses Valkey INCR with EXPIRE for distributed counting.
 * Falls back to "always allow" if Valkey is unavailable — the upstream
 * provider's own 429 is the backstop in that case.
 *
 * BUG FIX: previously, INCR ran unconditionally BEFORE the limit check.
 * If 1000 concurrent requests hit a key with rpmLimit=60, all 1000 would
 * increment (to 1000), only the first 60 would be allowed, but the counter
 * would stay at 1000 — blocking the key for the rest of the minute even
 * after allowed requests completed. Now we DECR on reject so rejected
 * requests don't consume budget.
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

    if (currentCount > rpmLimit) {
      // BUG FIX: this request was rejected, so don't consume the slot.
      // DECR back so the next allowed request isn't blocked by rejected ones.
      // Best-effort — if DECR fails, the slot will free when the minute
      // bucket expires (90s TTL).
      await valkey.decr(usageKey).catch(() => {});
      return false;
    }
    return true;
  } catch (err) {
    logger.warn("[keyPool] consumeKeySlot Valkey check failed — allowing", {
      err: err instanceof Error ? err.message : String(err),
      keyId,
    });
    return true; // fail-open: let upstream enforce
  }
}

/**
 * Release a rate-limit slot for a key (e.g. when the picked key turns out
 * to be corrupted and we want to try the next one without consuming budget).
 *
 * Best-effort — if DECR fails, the slot will free when the minute bucket
 * expires (90s TTL).
 */
async function releaseKeySlot(keyId: string): Promise<void> {
  if (!VALKEY_CONFIGURED) return;
  const valkey = await getValkeyClient();
  if (!valkey) return;

  const now = Date.now();
  const minuteBucket = Math.floor(now / MINUTE_MS);
  const usageKey = `${USAGE_PREFIX}:${keyId}:${minuteBucket}`;

  try {
    await valkey.decr(usageKey);
  } catch {
    // Non-critical — see comment above
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

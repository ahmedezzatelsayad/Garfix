/**
 * aiConfig.ts — Centralized AI configuration (E-29).
 *
 * Replaces the previous pattern of every AI endpoint reading
 * `company.openrouterApiKey` + `company.openrouterModel` inline, with
 * per-endpoint fallback logic that drifted between routes.
 *
 * Single source of truth: getAiConfig(company, userPrefs?) returns the
 * effective config (model, temperature, max tokens) after applying:
 *   1. Company-level overrides (if set)
 *   2. Platform defaults (from platform_settings)
 *   3. Hardcoded sensible fallbacks
 */

import { db } from "./db";
import { decryptSecret } from "./cryptoVault";
import { logger } from "./logger";

export interface AiConfig {
  /** Provider key — decrypted, ready for use. Null if not configured. */
  apiKey: string | null;
  /** Model identifier (e.g. "anthropic/claude-3.5-haiku"). */
  model: string;
  /** Sampling temperature (0-2). */
  temperature: number;
  /** Max output tokens. */
  maxTokens: number;
  /** Whether AI features are enabled for this company. */
  enabled: boolean;
}

const PLATFORM_DEFAULTS = {
  model: "z-ai-glm",
  temperature: 0.4,
  maxTokens: 800,
};

const PLATFORM_FALLBACK = {
  model: "z-ai-glm",
  temperature: 0.4,
  maxTokens: 800,
};

let cachedPlatformConfig: Record<string, unknown> | null = null;
let cacheExpiry = 0;

async function getPlatformSettings(): Promise<Record<string, unknown>> {
  if (cachedPlatformConfig && Date.now() < cacheExpiry) return cachedPlatformConfig;
  try {
    const settings = await db.platformSettings.findMany({
      where: {
        key: { startsWith: "ai." },
      },
    });
    const map: Record<string, unknown> = {};
    for (const s of settings) {
      try {
        map[s.key] = JSON.parse(s.value);
      } catch {
        map[s.key] = s.value;
      }
    }
    cachedPlatformConfig = map;
    cacheExpiry = Date.now() + 60_000; // 1 min cache
    return map;
  } catch (err) {
    logger.error("[aiConfig] failed to load platform settings", { err: err instanceof Error ? err.message : String(err) });
    return {};
  }
}

/**
 * Resolve the effective AI config for a given company.
 *
 * @param company — The company record (with openrouterApiKey/openrouterModel fields)
 * @returns AiConfig — ready for use
 */
export async function getAiConfig(company: {
  openrouterApiKey?: string | null;
  openrouterModel?: string | null;
  plan?: string;
}): Promise<AiConfig> {
  const platform = await getPlatformSettings();

  // Decrypt the API key (decryptSecret handles legacy plaintext gracefully)
  let apiKey: string | null = null;
  if (company.openrouterApiKey) {
    try {
      apiKey = decryptSecret(company.openrouterApiKey);
    } catch (err) {
      logger.error("[aiConfig] failed to decrypt API key — treating as not configured", { err: err instanceof Error ? err.message : String(err) });
      apiKey = null;
    }
  }

  const model = (platform["ai.model"] as string) || company.openrouterModel || PLATFORM_DEFAULTS.model;
  // SEC-M6C4 (Cycle 4): clamp temperature + maxTokens to safe ranges. The
  // previous implementation read ai.max_tokens straight from PlatformSetting
  // with no upper bound — a founder (or anyone with DB write access) could
  // set ai.max_tokens = 100000 and every chat call would request 100k output
  // tokens, draining the OpenAI/Anthropic quota in a few requests. The chat
  // route even has a comment noting this used to cause 402 errors.
  // Allow founders to tune within a safe range; reject runaway values.
  const rawTemp = (platform["ai.temperature"] as number) ?? PLATFORM_DEFAULTS.temperature;
  const rawMaxTokens = (platform["ai.max_tokens"] as number) ?? PLATFORM_DEFAULTS.maxTokens;
  const temperature = Math.min(Math.max(Number(rawTemp) || 0, 0), 2);
  const maxTokens = Math.min(Math.max(Math.floor(Number(rawMaxTokens) || 800), 100), 4096);

  // Disable AI for trial-plan companies without an explicit API key
  const enabled = !!apiKey || company.plan !== "trial";

  return {
    apiKey,
    model,
    temperature,
    maxTokens,
    enabled,
  };
}

/** Get a global (non-company) AI config — used by founder/admin tools. */
export async function getGlobalAiConfig(): Promise<AiConfig> {
  const platform = await getPlatformSettings();
  // SEC-M6C4 (Cycle 4): same clamping as getAiConfig to prevent runaway quota spend.
  const rawTemp = (platform["ai.temperature"] as number) ?? PLATFORM_FALLBACK.temperature;
  const rawMaxTokens = (platform["ai.max_tokens"] as number) ?? PLATFORM_FALLBACK.maxTokens;
  return {
    apiKey: (platform["ai.global_api_key"] as string) || null,
    model: (platform["ai.model"] as string) || PLATFORM_FALLBACK.model,
    temperature: Math.min(Math.max(Number(rawTemp) || 0, 0), 2),
    maxTokens: Math.min(Math.max(Math.floor(Number(rawMaxTokens) || 800), 100), 4096),
    enabled: true,
  };
}

/** Invalidate the cached platform settings — call after founder edits settings. */
export function invalidateAiConfigCache(): void {
  cachedPlatformConfig = null;
  cacheExpiry = 0;
}

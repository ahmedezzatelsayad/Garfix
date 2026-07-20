/**
 * configure-openrouter-deepseek.ts
 *
 * Configures the AI provider stack to use OpenRouter + DeepSeek as the
 * PRIMARY provider, with z-ai/GLM (free sandbox) as the fallback.
 *
 * Reads the OpenRouter API key from the OPENROUTER_API_KEY env var (.env)
 * and the model from OPENROUTER_PRIMARY_MODEL (default: deepseek/deepseek-chat).
 *
 * Writes to PlatformSetting table:
 *   ai.provider.openrouter.apiKey     = encrypted(key)
 *   ai.provider.openrouter.model      = "deepseek/deepseek-chat"
 *   ai.provider.openrouter.isEnabled  = true
 *   ai.provider.openrouter.priority   = 1
 *   ai.provider.z-ai.isEnabled        = true   (fallback)
 *   ai.provider.z-ai.priority         = 2
 *   ai.provider.z-ai.model            = "z-ai-glm"
 *
 * Usage:  bunx tsx scripts/configure-openrouter-deepseek.ts
 */
import { db } from "../src/lib/db";
import {
  setProviderApiKey,
  setProviderModel,
  setProviderEnabled,
  setProviderPriority,
  invalidateAiProviderCache,
  getAiProviders,
} from "../src/lib/aiProvider";

async function main() {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    console.error("FATAL: OPENROUTER_API_KEY env var is not set. Check .env file.");
    process.exit(1);
  }
  const primaryModel = process.env.OPENROUTER_PRIMARY_MODEL || "deepseek/deepseek-chat";

  console.log("=== Configuring OpenRouter + DeepSeek as primary AI provider ===\n");

  // ── OpenRouter (primary, priority 1) ──
  console.log(`[1/4] Setting OpenRouter API key (encrypted)...`);
  await setProviderApiKey("openrouter", apiKey);

  console.log(`[2/4] Setting OpenRouter model = "${primaryModel}"...`);
  await setProviderModel("openrouter", primaryModel);

  console.log(`[3/4] Enabling OpenRouter (priority 1 = primary)...`);
  await setProviderEnabled("openrouter", true);
  await setProviderPriority("openrouter", 1);

  // ── z-ai (fallback, priority 2) ──
  console.log(`[4/4] Configuring z-ai/GLM as fallback (priority 2)...`);
  await setProviderModel("z-ai", "z-ai-glm");
  await setProviderEnabled("z-ai", true);
  await setProviderPriority("z-ai", 2);

  // Invalidate cache so next request picks up new config
  invalidateAiProviderCache();

  // ── Verify ──
  console.log("\n=== Verification: getAiProviders() resolved chain ===\n");
  const providers = await getAiProviders();
  for (const p of providers) {
    const keyPreview = p.apiKey ? `${p.apiKey.slice(0, 10)}...${p.apiKey.slice(-4)}` : "(none)";
    console.log(
      `  [${p.priority}] ${p.provider.padEnd(12)} model=${(p.model || "?").padEnd(28)} ` +
      `enabled=${String(p.isEnabled).padEnd(5)} key=${keyPreview}`,
    );
  }

  const primary = providers.find(p => p.isEnabled && p.priority === Math.min(...providers.filter(x => x.isEnabled).map(x => x.priority)));
  console.log(`\n  → Primary provider: ${primary?.provider} / ${primary?.model}`);
  console.log(`  → Fallback chain: ${providers.filter(p => p.isEnabled).map(p => `${p.provider}(${p.priority})`).join(" → ")}`);

  await db.$disconnect();
  console.log("\n✅ Configuration complete. The AI stack now uses OpenRouter+DeepSeek.");
}

main().catch((e) => {
  console.error("Configuration failed:", e);
  process.exit(1);
});

// Make this file a module to avoid global scope collisions
export {};

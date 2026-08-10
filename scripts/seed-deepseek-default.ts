/**
 * seed-deepseek-default.ts
 *
 * P1 DECISION (2026-08-10): DeepSeek is the DEFAULT AI provider for GarfiX.
 *
 * This script seeds the PlatformSettings table with DeepSeek as the highest-priority
 * provider, so aiProvider.ts → getAiProviders() returns DeepSeek first.
 *
 * Run once after `prisma migrate deploy`:
 *   bun run scripts/seed-deepseek-default.ts
 *
 * Prerequisites:
 *   - DEEPSEEK_API_KEY env var must be set (sk-...)
 *   - PAYMENTS_ENC_KEY env var must be set (for encrypting the key at rest)
 *
 * Idempotent — safe to run multiple times (upserts by key).
 */

import { db } from "../src/lib/db";
import { encryptSecret } from "../src/lib/cryptoVault";

async function main() {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    console.error("❌ DEEPSEEK_API_KEY env var is not set.");
    console.error("   Get your key from: https://platform.deepseek.com/api_keys");
    console.error("   Then set: export DEEPSEEK_API_KEY=sk-...");
    process.exit(1);
  }

  if (!apiKey.startsWith("sk-")) {
    console.warn("⚠️  DEEPSEEK_API_KEY doesn't start with 'sk-' — are you sure it's correct?");
  }

  const model = process.env.DEEPSEEK_MODEL || "deepseek-chat";
  const baseUrl = process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com/v1";

  console.log("\n🌱 Seeding DeepSeek as DEFAULT AI provider in PlatformSettings…\n");

  // Encrypt the API key before storing
  const encryptedKey = encryptSecret(apiKey);

  // DeepSeek config — priority 1 (highest)
  const deepseekSettings = [
    { key: "ai.provider.deepseek.apiKey", value: JSON.stringify(encryptedKey) },
    { key: "ai.provider.deepseek.model", value: JSON.stringify(model) },
    { key: "ai.provider.deepseek.baseUrl", value: JSON.stringify(baseUrl) },
    { key: "ai.provider.deepseek.isEnabled", value: JSON.stringify(true) },
    { key: "ai.provider.deepseek.priority", value: JSON.stringify(1) },
  ];

  for (const s of deepseekSettings) {
    await db.platformSettings.upsert({
      where: { key: s.key },
      update: { value: s.value },
      create: { key: s.key, value: s.value },
    });
    console.log(`   ✓ ${s.key} = ${s.key.includes("apiKey") ? "[ENCRYPTED]" : s.value}`);
  }

  // Disable z-ai default (set priority 999 so it's only a last-resort fallback)
  await db.platformSettings.upsert({
    where: { key: "ai.provider.z-ai.priority" },
    update: { value: JSON.stringify(999) },
    create: { key: "ai.provider.z-ai.priority", value: JSON.stringify(999) },
  });
  console.log(`   ✓ ai.provider.z-ai.priority = 999 (demoted to last-resort fallback)`);

  // Optional: also configure Gemini as fallback (priority 2) if GEMINI_API_KEY is set
  const geminiKey = process.env.GEMINI_API_KEY;
  if (geminiKey) {
    const encGemini = encryptSecret(geminiKey);
    const geminiSettings = [
      { key: "ai.provider.gemini.apiKey", value: JSON.stringify(encGemini) },
      { key: "ai.provider.gemini.model", value: JSON.stringify("gemini-2.0-flash") },
      { key: "ai.provider.gemini.isEnabled", value: JSON.stringify(true) },
      { key: "ai.provider.gemini.priority", value: JSON.stringify(2) },
    ];
    for (const s of geminiSettings) {
      await db.platformSettings.upsert({
        where: { key: s.key },
        update: { value: s.value },
        create: { key: s.key, value: s.value },
      });
    }
    console.log(`   ✓ Gemini configured as priority-2 fallback`);
  }

  // Summary
  console.log("\n✅ DeepSeek is now the DEFAULT AI provider.");
  console.log("\nProvider chain (by priority):");
  console.log("   1. DeepSeek (deepseek-chat) — PRIMARY");
  if (geminiKey) console.log("   2. Gemini (gemini-2.0-flash) — fallback");
  console.log("   999. z-ai (sandbox) — last-resort dev fallback");
  console.log("\nTo verify: bun run scripts/test-deepseek-connection.ts");
  console.log("");
}

main()
  .catch((err) => {
    console.error("Seed failed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });

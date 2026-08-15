/**
 * test-deepseek-connection.ts
 *
 * Verifies that DeepSeek API is correctly configured and reachable.
 * Sends a minimal chat completion request and reports the result.
 *
 * Usage:
 *   DEEPSEEK_API_KEY=sk-... bun run scripts/test-deepseek-connection.ts
 *
 * Or after running seed-deepseek-default.ts (reads from DB):
 *   bun run scripts/test-deepseek-connection.ts
 */

import { db } from "../src/lib/db";
import { decryptSecret } from "../src/lib/cryptoVault";

async function getDeepSeekKey(): Promise<{ key: string; model: string; baseUrl: string }> {
  // Try env var first
  const envKey = process.env.DEEPSEEK_API_KEY;
  if (envKey) {
    return {
      key: envKey,
      model: process.env.DEEPSEEK_MODEL || "deepseek-chat",
      baseUrl: process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com/v1",
    };
  }

  // Try DB (PlatformSettings)
  const settings = await db.platformSettings.findMany({
    where: { key: { startsWith: "ai.provider.deepseek." } },
  });

  const map = new Map<string, string>();
  for (const s of settings) {
    try {
      map.set(s.key.split(".").pop()!, JSON.parse(s.value));
    } catch {
      // skip
    }
  }

  const encKey = map.get("apiKey");
  if (!encKey) {
    throw new Error("No DeepSeek API key found in env or DB. Run seed-deepseek-default.ts first.");
  }

  return {
    key: decryptSecret(encKey),
    model: map.get("model") || "deepseek-chat",
    baseUrl: map.get("baseUrl") || "https://api.deepseek.com/v1",
  };
}

async function main() {
  console.log("\n🔌 Testing DeepSeek API connection…\n");

  const { key, model, baseUrl } = await getDeepSeekKey();
  console.log(`   Endpoint: ${baseUrl}/chat/completions`);
  console.log(`   Model:   ${model}`);
  console.log(`   Key:     ${key.slice(0, 7)}...${key.slice(-4)}`);
  console.log("");

  const start = Date.now();
  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: "You are a helpful assistant. Reply in one short sentence." },
          { role: "user", content: "مرحبا، هل تدعم اللغة العربية؟" },
        ],
        max_tokens: 50,
        temperature: 0.3,
      }),
    });

    const latencyMs = Date.now() - start;

    if (!response.ok) {
      const errText = await response.text();
      console.error(`❌ HTTP ${response.status}: ${errText}`);
      process.exit(1);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "(empty response)";
    const tokensIn = data.usage?.prompt_tokens ?? 0;
    const tokensOut = data.usage?.completion_tokens ?? 0;
    const cost = (tokensIn / 1000) * 0.00014 + (tokensOut / 1000) * 0.00028;

    console.log("✅ DeepSeek API connection successful!\n");
    console.log(`   Response:   ${content}`);
    console.log(`   Latency:    ${latencyMs}ms`);
    console.log(`   Tokens:     ${tokensIn} in + ${tokensOut} out = ${tokensIn + tokensOut} total`);
    console.log(`   Cost:       $${cost.toFixed(6)} (~$${(cost * 1000).toFixed(4)}/1000 calls)`);
    console.log("");
    console.log("   DeepSeek is ready to serve as GarfiX's primary AI provider. 🚀");
  } catch (err) {
    const latencyMs = Date.now() - start;
    console.error(`❌ Request failed after ${latencyMs}ms:`, err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

main()
  .catch((err) => {
    console.error("Test failed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });

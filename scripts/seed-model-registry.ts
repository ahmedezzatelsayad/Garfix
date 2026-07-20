/**
 * seed-model-registry.ts
 *
 * Seeds the AI Model Registry with the models GarfiX currently knows about.
 * Each model declares which capabilities it supports + cost + tier.
 *
 * Run once after schema push (or any time a new model is added to the fleet).
 * Idempotent — upserts by (provider, model).
 *
 *   bun run scripts/seed-model-registry.ts
 */
import { db } from "../src/lib/db";
import { upsertModel, ALL_CAPABILITIES, type AICapability } from "../src/lib/ai/modelRegistry";

interface SeedModel {
  provider: string;
  model: string;
  displayName: string;
  capabilities: AICapability[];
  tier: "free" | "paid";
  costPer1kIn: number;
  costPer1kOut: number;
  maxTokens: number;
  contextWindow: number;
}

// The fleet. Ordered by priority — the auto-benchmark will rank them by health
// score, but the seed order is the "safe default" if benchmarks haven't run.
const FLEET: SeedModel[] = [
  {
    provider: "openrouter",
    model: "tencent/hy3:free",
    displayName: "Tencent HY3 (Free)",
    capabilities: ["chat", "invoice-extraction"],
    tier: "free",
    costPer1kIn: 0,
    costPer1kOut: 0,
    maxTokens: 4096,
    contextWindow: 32768,
  },
  {
    provider: "openrouter",
    model: "openai/gpt-oss-20b:free",
    displayName: "OpenAI GPT-OSS 20B (Free)",
    capabilities: ["chat", "invoice-extraction", "reasoning"],
    tier: "free",
    costPer1kIn: 0,
    costPer1kOut: 0,
    maxTokens: 4096,
    contextWindow: 32768,
  },
  {
    provider: "openrouter",
    model: "deepseek/deepseek-chat",
    displayName: "DeepSeek V3 (Paid)",
    capabilities: ["chat", "invoice-extraction", "reasoning"],
    tier: "paid",
    costPer1kIn: 0.00014,
    costPer1kOut: 0.00028,
    maxTokens: 8192,
    contextWindow: 64000,
  },
  {
    provider: "z-ai",
    model: "z-ai-glm",
    displayName: "z-ai / GLM (Sandbox Free)",
    capabilities: ["chat", "invoice-extraction", "reasoning"],
    tier: "free",
    costPer1kIn: 0,
    costPer1kOut: 0,
    maxTokens: 4096,
    contextWindow: 8192,
  },
];

async function main() {
  console.log(`\n🌱 Seeding AI Model Registry with ${FLEET.length} models…\n`);
  console.log(`   Capabilities tracked: ${ALL_CAPABILITIES.join(", ")}\n`);

  for (const m of FLEET) {
    const entry = await upsertModel(m);
    console.log(
      `   ✓ ${entry.provider}/${entry.model}`.padEnd(45) +
        ` [${entry.capabilities.join(", ")}]` +
        ` tier=${entry.tier}` +
        ` $${entry.costPer1kIn}/${entry.costPer1kOut} per 1k`,
    );
  }

  // Summary
  const total = await db.aIModelRegistry.count();
  const enabled = await db.aIModelRegistry.count({ where: { isEnabled: true } });
  console.log(`\n✅ Registry seeded: ${total} models total, ${enabled} enabled.`);
  console.log(`\nNext step: run \`bun run scripts/auto-benchmark.ts\` to compute health scores.\n`);
}

main()
  .catch((err) => {
    console.error("Seed failed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });

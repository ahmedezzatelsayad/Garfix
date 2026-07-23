/**
 * auto-benchmark.ts — AI Orchestration Layer: Auto Benchmark runner.
 *
 * Tests every enabled model in the registry across each capability it claims
 * to support, using a fixed suite of standardized prompts. Records success,
 * latency, tokens, and a heuristic quality score per (model × capability),
 * then recomputes each model's composite health score.
 *
 * Designed to run:
 *   - On-demand via the founder dashboard "Run Benchmark Now" button
 *   - Periodically via cron (daily recommended — see cron tool config)
 *
 * Quality scoring is heuristic (no LLM-as-judge — that would cost tokens and
 * introduce circularity). Per capability:
 *   chat:               reply non-empty + contains Arabic chars for Arabic prompt
 *   invoice-extraction: returned parseable JSON with required fields
 *   reasoning:          final answer matches expected numeric answer
 *   vision:             (skipped in this runner — requires image input; the
 *                       parse-image route logs real production quality via
 *                       logAiUsage, which feeds the health score over time)
 *
 *   bun run scripts/auto-benchmark.ts
 */
import { db } from "../src/lib/db";
import {
  getRegistry,
  recordBenchmarkResult,
  ALL_CAPABILITIES,
  type AICapability,
} from "../src/lib/ai/modelRegistry";
import { callSingleProvider, type AiProviderConfig } from "../src/lib/aiProvider";
import { getAiProviders } from "../src/lib/aiProvider";
import { logger } from "../src/lib/logger";

// ─── Test suite ─────────────────────────────────────────────────────────────

interface BenchmarkCase {
  capability: AICapability;
  messages: Array<{ role: "system" | "user"; content: string }>;
  maxTokens: number;
  /** Validates the reply and returns a 0-10 quality score. */
  score: (reply: string) => { quality: number; ok: boolean };
  expectedLatencyMs: number; // soft target for scoring
}

const hasArabic = (s: string) => /[\u0600-\u06FF]/.test(s);

const CASES: BenchmarkCase[] = [
  // ── Chat (Arabic) ─────────────────────────────────────────────────────────
  {
    capability: "chat",
    messages: [
      { role: "user", content: "مرحباً! من أنت وماذا يمكنك أن تفعل؟" },
    ],
    maxTokens: 200,
    expectedLatencyMs: 3000,
    score: (reply) => {
      const trimmed = reply.trim();
      if (!trimmed) return { quality: 0, ok: false };
      let q = 5;
      if (hasArabic(trimmed)) q += 3;
      if (trimmed.length > 20 && trimmed.length < 500) q += 2;
      if (/garfix|جارفكس|مساعد|copilot|كوبيلوت/i.test(trimmed)) q += 1;
      return { quality: Math.min(10, q), ok: q >= 5 };
    },
  },
  // ── Invoice extraction (strict JSON) ──────────────────────────────────────
  {
    capability: "invoice-extraction",
    messages: [
      {
        role: "system",
        content:
          "You are an invoice parser. Extract fields and return ONLY a JSON object with keys: clientName, total, currency, date. No markdown, no prose.",
      },
      {
        role: "user",
        content:
          "Invoice from Acme Corp. Date: 2026-03-15. Total amount: $1,250.00 USD. Bill to: John Smith.",
      },
    ],
    maxTokens: 150,
    expectedLatencyMs: 4000,
    score: (reply) => {
      const trimmed = reply.trim().replace(/^```json\s*/i, "").replace(/```$/i, "").trim();
      try {
        const obj = JSON.parse(trimmed);
        let q = 4;
        if (typeof obj.clientName === "string") q += 2;
        if (obj.total !== undefined && obj.total !== null) q += 2;
        if (typeof obj.currency === "string") q += 1;
        if (typeof obj.date === "string") q += 1;
        return { quality: Math.min(10, q), ok: q >= 6 };
      } catch {
        return { quality: 1, ok: false };
      }
    },
  },
  // ── Reasoning (math) ──────────────────────────────────────────────────────
  {
    capability: "reasoning",
    messages: [
      { role: "user", content: "A store sells pens for $3 each. If a customer buys 17 pens with a 10% discount, what is the total? Reply with just the final number." },
    ],
    maxTokens: 100,
    expectedLatencyMs: 5000,
    score: (reply) => {
      const trimmed = reply.trim();
      // Expected: 17 × 3 = 51; 10% off → 45.9
      const hasCorrect = /45[.,]?9|45\.90?/.test(trimmed);
      const hasNumber = /\d/.test(trimmed);
      let q = 2;
      if (hasNumber) q += 3;
      if (hasCorrect) q += 5;
      return { quality: Math.min(10, q), ok: hasCorrect };
    },
  },
];

// ─── Provider resolution ────────────────────────────────────────────────────

async function resolveProviderConfig(
  providerType: string,
): Promise<AiProviderConfig | null> {
  const providers = await getAiProviders();
  const match = providers.find((p) => p.provider === providerType);
  if (!match) return null;
  return match;
}

// ─── Runner ─────────────────────────────────────────────────────────────────

interface BenchmarkOutcome {
  model: string;
  capability: AICapability;
  success: boolean;
  latencyMs: number;
  tokensIn: number;
  tokensOut: number;
  quality: number;
  sample: string;
  error?: string;
}

async function runOneCase(
  providerConfig: AiProviderConfig,
  model: string,
  testCase: BenchmarkCase,
): Promise<BenchmarkOutcome> {
  const t0 = Date.now();
  try {
    const result = await callSingleProvider(
      { ...providerConfig, model, isEnabled: true },
      {
        messages: testCase.messages,
        temperature: 0.2,
        maxTokens: testCase.maxTokens,
      },
    );
    const latencyMs = Date.now() - t0;
    const { quality, ok } = testCase.score(result.content);
    return {
      model,
      capability: testCase.capability,
      success: ok,
      latencyMs,
      tokensIn: result.usage.prompt_tokens || 0,
      tokensOut: result.usage.completion_tokens || 0,
      quality,
      sample: result.content.slice(0, 200),
    };
  } catch (err) {
    const latencyMs = Date.now() - t0;
    return {
      model,
      capability: testCase.capability,
      success: false,
      latencyMs,
      tokensIn: 0,
      tokensOut: 0,
      quality: 0,
      sample: "",
      error: err instanceof Error ? err.message.slice(0, 300) : String(err),
    };
  }
}

async function main() {
  console.log("\n🧪 AI Orchestration — Auto Benchmark\n".padEnd(60, "="));
  const startedAt = Date.now();

  const registry = await getRegistry();
  const enabled = registry.filter((m) => m.isEnabled);

  if (enabled.length === 0) {
    console.log("⚠️  No enabled models in the registry. Run seed-model-registry.ts first.");
    return;
  }

  console.log(`Testing ${enabled.length} models × up to ${CASES.length} capabilities…\n`);

  const results: BenchmarkOutcome[] = [];

  for (const model of enabled) {
    const providerConfig = await resolveProviderConfig(model.provider);
    if (!providerConfig) {
      console.log(`✗ ${model.provider}/${model.model}: no provider config (skipping)`);
      continue;
    }
    // z-ai has null apiKey (sandbox) — allowed
    if (model.provider !== "z-ai" && !providerConfig.apiKey) {
      console.log(`✗ ${model.provider}/${model.model}: no API key (skipping)`);
      continue;
    }

    console.log(`\n── ${model.provider}/${model.model} (${model.displayName}) ──`);

    for (const testCase of CASES) {
      // Skip capabilities the model doesn't claim
      if (!model.capabilities.includes(testCase.capability)) {
        console.log(`   ⊘ ${testCase.capability}: not in model capabilities — skipping`);
        continue;
      }

      const outcome = await runOneCase(providerConfig, model.model, testCase);
      results.push(outcome);

      // Record to DB + recompute health
      await recordBenchmarkResult({
        modelRegistryId: model.id,
        capability: testCase.capability,
        success: outcome.success,
        latencyMs: outcome.latencyMs,
        tokensIn: outcome.tokensIn,
        tokensOut: outcome.tokensOut,
        responseQuality: outcome.quality,
        responseSample: outcome.sample,
        errorMessage: outcome.error,
      });

      const status = outcome.success ? "✓" : "✗";
      const ms = `${outcome.latencyMs}ms`.padStart(7);
      const q = `q=${outcome.quality.toFixed(1)}`.padStart(7);
      const tok = `${outcome.tokensIn}/${outcome.tokensOut}`.padStart(12);
      console.log(
        `   ${status} ${testCase.capability.padEnd(20)} ${ms}  ${q}  tok=${tok}` +
          (outcome.error ? `  err=${outcome.error.slice(0, 80)}` : ""),
      );
    }
  }

  // ── Summary ──────────────────────────────────────────────────────────────
  const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
  const successCount = results.filter((r) => r.success).length;
  const totalTests = results.length;

  console.log(`\n${"=".repeat(60)}`);
  console.log(`✅ Benchmark complete in ${elapsed}s — ${successCount}/${totalTests} tests passed.\n`);

  // Reload registry to show updated health scores
  const updated = await getRegistry();
  console.log("Updated health scores:");
  console.log(
    "  Model".padEnd(40) +
      "Health".padStart(8) +
      "Success%".padStart(10) +
      "p50".padStart(8) +
      "Tier".padStart(8),
  );
  for (const m of updated) {
    console.log(
      `  ${(m.provider + "/" + m.model).slice(0, 38)}`.padEnd(40) +
        `${m.healthScore.toFixed(1)}`.padStart(8) +
        `${m.successRate.toFixed(0)}%`.padStart(10) +
        `${(m.avgLatencyMs / 1000).toFixed(1)}s`.padStart(8) +
        `${m.tier}`.padStart(8),
    );
  }
  console.log("");
}

main()
  .catch((err) => {
    console.error("Benchmark failed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });

/**
 * /api/platform-admin/ai-orchestration/run-benchmark
 *
 * POST — Runs the auto-benchmark inline (synchronously) and returns the
 * updated health scores. The founder clicks "Run Benchmark Now" in the
 * dashboard; we execute the same suite scripts/auto-benchmark.ts uses,
 * but in-process so the response carries the fresh results.
 *
 * Benchmarking is bounded: 4 models × 3 capabilities = ~12 calls, each with
 * a 60s timeout. Worst case ~12 × 60s = 12 min, but in practice free-tier
 * models respond in 1-5s, so the whole run finishes in <60s.
 *
 * Founder-only.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireFounder } from "@/lib/middleware";
import { withErrorHandler } from "@/lib/api";
import { logger } from "@/lib/logger";
import { getRegistry, recordBenchmarkResult, type AICapability } from "@/lib/ai/modelRegistry";
import { getAiProviders, callSingleProvider, type AiProviderConfig } from "@/lib/aiProvider";

// Benchmark hits the DB (modelRegistry / recordBenchmarkResult → Prisma) and the
// Node-only AI provider client. Pin to Node.js runtime so Turbopack does not
// attempt Edge bundling.
export const runtime = "nodejs";
// Long-running benchmark (up to 12 model calls × 60s timeout).
export const maxDuration = 300;

interface BenchmarkCase {
  capability: AICapability;
  messages: Array<{ role: "system" | "user"; content: string }>;
  maxTokens: number;
  score: (reply: string) => { quality: number; ok: boolean };
}

const hasArabic = (s: string) => /[\u0600-\u06FF]/.test(s);

const CASES: BenchmarkCase[] = [
  {
    capability: "chat",
    messages: [{ role: "user", content: "مرحباً! من أنت وماذا يمكنك أن تفعل؟" }],
    maxTokens: 200,
    score: (reply) => {
      const t = reply.trim();
      if (!t) return { quality: 0, ok: false };
      let q = 5;
      if (hasArabic(t)) q += 3;
      if (t.length > 20 && t.length < 500) q += 2;
      if (/garfix|جارفكس|مساعد|copilot|كوبيلوت/i.test(t)) q += 1;
      return { quality: Math.min(10, q), ok: q >= 5 };
    },
  },
  {
    capability: "invoice-extraction",
    messages: [
      { role: "system", content: "You are an invoice parser. Extract fields and return ONLY a JSON object with keys: clientName, total, currency, date. No markdown, no prose." },
      { role: "user", content: "Invoice from Acme Corp. Date: 2026-03-15. Total amount: $1,250.00 USD. Bill to: John Smith." },
    ],
    maxTokens: 150,
    score: (reply) => {
      const t = reply.trim().replace(/^```json\s*/i, "").replace(/```$/i, "").trim();
      try {
        const obj = JSON.parse(t);
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
  {
    capability: "reasoning",
    messages: [{ role: "user", content: "A store sells pens for $3 each. If a customer buys 17 pens with a 10% discount, what is the total? Reply with just the final number." }],
    maxTokens: 100,
    score: (reply) => {
      const t = reply.trim();
      const hasCorrect = /45[.,]?9|45\.90?/.test(t);
      const hasNumber = /\d/.test(t);
      let q = 2;
      if (hasNumber) q += 3;
      if (hasCorrect) q += 5;
      return { quality: Math.min(10, q), ok: hasCorrect };
    },
  },
];

export const POST = withErrorHandler(async (req: NextRequest) => {
  const authResult = await requireFounder(req);
  if (authResult instanceof NextResponse) return authResult;

  const registry = await getRegistry();
  const enabled = registry.filter((m) => m.isEnabled);
  const providers = await getAiProviders();

  const results: Array<{
    model: string;
    provider: string;
    capability: AICapability;
    success: boolean;
    latencyMs: number;
    tokensIn: number;
    tokensOut: number;
    quality: number;
    error?: string;
  }> = [];

  for (const model of enabled) {
    const providerConfig = providers.find((p) => p.provider === model.provider);
    if (!providerConfig) {
      results.push({
        model: model.model,
        provider: model.provider,
        capability: "chat",
        success: false,
        latencyMs: 0,
        tokensIn: 0,
        tokensOut: 0,
        quality: 0,
        error: "No provider config",
      });
      continue;
    }
    if (model.provider !== "z-ai" && !providerConfig.apiKey) {
      results.push({
        model: model.model,
        provider: model.provider,
        capability: "chat",
        success: false,
        latencyMs: 0,
        tokensIn: 0,
        tokensOut: 0,
        quality: 0,
        error: "No API key",
      });
      continue;
    }

    for (const testCase of CASES) {
      if (!model.capabilities.includes(testCase.capability)) continue;

      const t0 = Date.now();
      try {
        const cfg: AiProviderConfig = {
          ...providerConfig,
          model: model.model,
          isEnabled: true,
        };
        const result = await callSingleProvider(cfg, {
          messages: testCase.messages,
          temperature: 0.2,
          maxTokens: testCase.maxTokens,
        });
        const latencyMs = Date.now() - t0;
        const { quality, ok } = testCase.score(result.content);

        await recordBenchmarkResult({
          modelRegistryId: model.id,
          capability: testCase.capability,
          success: ok,
          latencyMs,
          tokensIn: result.usage.prompt_tokens || 0,
          tokensOut: result.usage.completion_tokens || 0,
          responseQuality: quality,
          responseSample: result.content.slice(0, 500),
        });

        results.push({
          model: model.model,
          provider: model.provider,
          capability: testCase.capability,
          success: ok,
          latencyMs,
          tokensIn: result.usage.prompt_tokens || 0,
          tokensOut: result.usage.completion_tokens || 0,
          quality,
        });
      } catch (err) {
        const latencyMs = Date.now() - t0;
        logger.error("[run-benchmark] provider call failed", { err: err instanceof Error ? err.message : String(err), model: model.model });
        await recordBenchmarkResult({
          modelRegistryId: model.id,
          capability: testCase.capability,
          success: false,
          latencyMs,
          tokensIn: 0,
          tokensOut: 0,
          responseQuality: 0,
          errorMessage: "provider error",
        });
        results.push({
          model: model.model,
          provider: model.provider,
          capability: testCase.capability,
          success: false,
          latencyMs,
          tokensIn: 0,
          tokensOut: 0,
          quality: 0,
          error: "Provider call failed",
        });
      }
    }
  }

  // Reload to get updated health scores
  const updated = await getRegistry();

  return NextResponse.json({
    ok: true,
    ranAt: new Date().toISOString(),
    totalTests: results.length,
    passed: results.filter((r) => r.success).length,
    results,
    updatedRegistry: updated.map((m) => ({
      provider: m.provider,
      model: m.model,
      displayName: m.displayName,
      healthScore: m.healthScore,
      successRate: m.successRate,
      avgLatencyMs: m.avgLatencyMs,
      isHealthy: m.isHealthy,
      tier: m.tier,
    })),
  });
});

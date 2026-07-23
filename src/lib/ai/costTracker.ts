/**
 * costTracker.ts — AI Usage logging + estimated cost calculation.
 *
 * Every AI call should invoke logAiUsage() once it completes (success or failure).
 * Cost rates are in USD per 1K tokens. z-ai-glm is free in the sandbox.
 *
 * Records are stored in the `ai_usage_logs` table and surfaced in the founder's
 * /api/platform-admin/ai-usage dashboard.
 */
import { db } from "@/lib/db";

const COST_PER_1K_TOKENS: Record<string, { input: number; output: number }> = {
  "z-ai-glm": { input: 0, output: 0 }, // free in sandbox
  // ── FREE OpenRouter models (cost = $0) ──
  "tencent/hy3:free": { input: 0, output: 0 },                         // best free model for GarfiX (Arabic + JSON)
  "openai/gpt-oss-20b:free": { input: 0, output: 0 },                  // strong alternative free model
  "meta-llama/llama-3.3-70b-instruct:free": { input: 0, output: 0 },
  "qwen/qwen3-next-80b-a3b-instruct:free": { input: 0, output: 0 },
  "google/gemma-4-31b-it:free": { input: 0, output: 0 },
  // ── DeepSeek via OpenRouter (official DeepSeek API pricing, passthrough) ──
  "deepseek/deepseek-chat": { input: 0.00014, output: 0.00028 },        // DeepSeek V3 — $0.14/$0.28 per 1M
  "deepseek/deepseek-chat:free": { input: 0, output: 0 },               // free tier
  "deepseek/deepseek-r1": { input: 0.00055, output: 0.00219 },          // DeepSeek R1 — $0.55/$2.19 per 1M
  "deepseek/deepseek-r1:free": { input: 0, output: 0 },                 // free tier
  // ── OpenAI ──
  "gpt-4o-mini": { input: 0.00015, output: 0.0006 },
  "gpt-4o": { input: 0.005, output: 0.015 },
  // ── Anthropic ──
  "claude-3-5-haiku-20241022": { input: 0.0008, output: 0.004 },
  "claude-3-5-sonnet-20241022": { input: 0.003, output: 0.015 },
  default: { input: 0.001, output: 0.002 },
};

export interface LogAiUsageParams {
  companySlug?: string | null;
  userUid?: string | null;
  provider: string;
  model: string;
  endpoint: string;
  tokensIn: number;
  tokensOut: number;
  success: boolean;
  processingMs?: number | null;
  errorMessage?: string | null;
}

/**
 * Persist an AI usage record with estimated cost.
 *
 * Safe to call from inside try/catch blocks — failures here are logged but
 * never propagated (the calling request must still succeed).
 *
 * `processingMs` should be the wall-clock latency of the actual AI provider
 * call (measured with Date.now() around callAI), NOT the whole request
 * handler. Pass `null` or omit if not measured.
 */
export async function logAiUsage(params: LogAiUsageParams): Promise<void> {
  const rates = COST_PER_1K_TOKENS[params.model] || COST_PER_1K_TOKENS.default;
  const estimatedCost =
    (params.tokensIn / 1000) * rates.input +
    (params.tokensOut / 1000) * rates.output;

  try {
    await db.aIUsageLog.create({
      data: {
        companySlug: params.companySlug || null,
        userUid: params.userUid || null,
        provider: params.provider,
        model: params.model,
        endpoint: params.endpoint,
        tokensIn: params.tokensIn,
        tokensOut: params.tokensOut,
        totalTokens: params.tokensIn + params.tokensOut,
        estimatedCost,
        processingMs: params.processingMs ?? null,
        success: params.success,
        errorMessage: params.errorMessage || null,
      },
    });
  } catch (err) {
    // Non-critical — log but never throw
    console.error("[costTracker] failed to log:", err);
  }
}

/**
 * Look up cost rates for a model — useful for displaying projected costs
 * before a call is made.
 */
export function getCostRates(model: string): { input: number; output: number } {
  return COST_PER_1K_TOKENS[model] || COST_PER_1K_TOKENS.default;
}

/**
 * costTracker.ts — AI Usage logging + estimated cost calculation.
 *
 * Every AI call should invoke logAiUsage() once it completes (success or failure).
 * Cost rates are in USD per 1K tokens. z-ai-glm is free in the sandbox.
 *
 * Records are stored in the `ai_usage_logs` table and surfaced in the founder's
 * /api/platform-admin/ai-usage dashboard.
 *
 * NOTE: The pure cost-computation functions (COST_PER_1K_TOKENS, getCostRates,
 * computeCallCostUsd) live in ./cost-rates.ts so they can be imported by code
 * paths that don't want to pull in the Prisma dependency (e.g. tests, edge
 * runtime, provider-optimizer.ts which is imported from many call sites).
 */
import { db } from "@/lib/db";
import {
  COST_PER_1K_TOKENS,
  getCostRates,
  computeCallCostUsd,
} from "./cost-rates";

// Re-export for backward compatibility — existing callers import these
// from "@/lib/ai/costTracker" and shouldn't have to change.
export { COST_PER_1K_TOKENS, getCostRates, computeCallCostUsd };

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
        companySlug: params.companySlug ?? '',
        userUid: params.userUid || null,
        provider: params.provider,
        endpoint: params.endpoint,
        tokensIn: params.tokensIn,
        tokensOut: params.tokensOut,
        totalTokens: params.tokensIn + params.tokensOut,
        estimatedCost,
        processingMs: params.processingMs ?? undefined,
        success: params.success,
        errorMessage: params.errorMessage || null,
      },
    });
  } catch (err) {
    // Non-critical — log but never throw
    console.error("[costTracker] failed to log:", err);
  }
}

// getCostRates + computeCallCostUsd + COST_PER_1K_TOKENS live in ./cost-rates.ts
// and are re-exported above for backward compatibility.

/**
 * cost-rates.ts — Pure AI cost-computation functions.
 *
 * Split out of costTracker.ts so that code paths which only need to
 * compute a cost estimate (e.g. provider-optimizer.ts which is imported
 * from many call sites, tests, edge runtime) don't have to pull in the
 * Prisma dependency that costTracker.ts's `logAiUsage` requires.
 *
 * Keep this module pure: no `db`, no `logger`, no side effects. Just
 * the rate table + two pure functions.
 */

/**
 * Per-model cost rates in USD per 1K tokens.
 *
 * - `z-ai-glm` and `*:free` OpenRouter variants are $0 (free tier).
 * - Paid OpenRouter/DeepSeek/OpenAI/Anthropic models use official pricing.
 * - Unknown models fall back to a conservative default.
 *
 * Sources: provider pricing pages as of 2026-Q3. Update when providers
 * change their pricing.
 */
export const COST_PER_1K_TOKENS: Record<string, { input: number; output: number }> = {
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

/**
 * Look up cost rates for a model — useful for displaying projected costs
 * before a call is made.
 */
export function getCostRates(model: string): { input: number; output: number } {
  return COST_PER_1K_TOKENS[model] || COST_PER_1K_TOKENS.default;
}

/**
 * Compute the estimated USD cost of a completed AI call.
 *
 * Used by `provider-optimizer.callWithProviderRouting` (P2.1) to feed
 * real cost data into the provider-scoring EMA, so the scoring formula's
 * cost term (`SCORE_W_COST * (1 - costNorm)`) reflects actual spend
 * instead of staying at the cold-start default of 0.
 *
 *   const cost = computeCallCostUsd("gpt-4o-mini", 1200, 350);
 *   // → (1200/1000)*0.00015 + (350/1000)*0.0006 = 0.00039
 *
 * Returns 0 for free-tier models (z-ai-glm, *:free variants). Returns
 * the default-rate estimate for unknown models. Returns 0 when both
 * token counts are 0 (e.g. failed call that never reached the provider).
 */
export function computeCallCostUsd(
  model: string | undefined | null,
  tokensIn: number | undefined | null,
  tokensOut: number | undefined | null,
): number {
  const in_ = tokensIn ?? 0;
  const out = tokensOut ?? 0;
  if (in_ === 0 && out === 0) return 0;
  const rates = getCostRates(model || "");
  return (in_ / 1000) * rates.input + (out / 1000) * rates.output;
}

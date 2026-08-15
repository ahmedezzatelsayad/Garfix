/**
 * contextWindow.ts — AI-002 FIX: Context window management
 * Estimates token count and trims conversation history to fit.
 *
 * AI-13 FIX (Audit v2 · Phase 3): off-by-one boundary fix in trimHistory.
 * AI-16 FIX (Audit v2 · Phase 3): calibrated Arabic token estimation.
 */

// AI-16 FIX (Audit v2 · Phase 3): Arabic token calibration constant.
//
// Empirical reality: Arabic characters map to MORE tokens than Latin
// characters in modern BPE tokenizers (tiktoken, Gemini, Claude) because
// Arabic subwords are less represented in the merge tree. Industry rule of
// thumb: Arabic requires ~1.5x as many tokens as English for the same
// character count.
//
// The previous code used an ad-hoc `arabicChars / 2` (i.e., 2x the Latin
// rate of `chars / 4`). That was an over-estimate — it caused overly
// aggressive context trimming for Arabic-heavy conversations (Arabic users
// saw their history truncated sooner than English users with the same
// character budget). We now calibrate to 1.5x via an explicit constant so
// the rate is greppable and adjustable.
//
// To recalibrate after running a token-count audit against the production
// tokenizer, change ONLY this constant — both estimateTokens() and any
// downstream budget calculations pick up the new rate automatically.
export const ARABIC_TOKEN_CALIBRATION = 1.5;

// AI-16 FIX (Audit v2 · Phase 3): Latin (English/European) baseline.
// 4 chars per token is the standard tiktoken approximation for English.
const LATIN_CHARS_PER_TOKEN = 4;

/**
 * Estimate the token count of a piece of text.
 *
 * - Latin chars: ~4 chars/token (tiktoken baseline for English).
 * - Arabic chars: ~1.5x the Latin rate (see ARABIC_TOKEN_CALIBRATION).
 *
 * Returns Math.ceil so the estimate is always rounded UP — safer for
 * context-window budgeting (better to over-estimate by 1 token than to
 * overflow the model's context and get a 400 from the provider).
 */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  // AI-16 FIX (Audit v2 · Phase 3): calibrated Arabic estimation.
  // Arabic range covers the basic Arabic block (U+0600–U+06FF). Arabic
  // Supplement (U+0750–U+077F) and Arabic Presentation Forms (U+FB50–
  // U+FDFF, U+FE70–U+FEFF) are NOT counted here — most user input lives
  // in the basic block. Extending the regex would over-count for text
  // that already mixes presentation-form ligatures with basic chars.
  const arabicChars = (text.match(/[\u0600-\u06FF]/g) || []).length;
  const otherChars = text.length - arabicChars;
  // Per-char token rates:
  //   arabic: (1 / LATIN_CHARS_PER_TOKEN) * ARABIC_TOKEN_CALIBRATION
  //   latin:  (1 / LATIN_CHARS_PER_TOKEN)
  const arabicTokens = (arabicChars / LATIN_CHARS_PER_TOKEN) * ARABIC_TOKEN_CALIBRATION;
  const otherTokens = otherChars / LATIN_CHARS_PER_TOKEN;
  return Math.ceil(arabicTokens + otherTokens);
}

export interface TokenBudget {
  systemPrompt: number;
  history: number;
  userMessage: number;
  response: number;
  total: number;
}

/**
 * Calculate token budget for an AI call.
 * Default context window: 8,000 tokens (safe for most models)
 * Reserve: 1,000 for response, 2,000 for system prompt
 */
export function calculateBudget(options?: {
  contextWindow?: number;
  responseReserve?: number;
  systemPromptTokens?: number;
}): TokenBudget {
  const contextWindow = options?.contextWindow || 8000;
  const responseReserve = options?.responseReserve || 1000;
  const systemPromptTokens = options?.systemPromptTokens || 2000;

  const remaining = contextWindow - responseReserve - systemPromptTokens;
  return {
    systemPrompt: systemPromptTokens,
    history: Math.floor(remaining * 0.6), // 60% of remaining for history
    userMessage: Math.floor(remaining * 0.3), // 30% for current message
    response: responseReserve,
    total: contextWindow,
  };
}

/**
 * Trim conversation history to fit within the token budget.
 * Keeps the most recent messages.
 *
 * AI-13 FIX (Audit v2 · Phase 3): off-by-one boundary fix.
 *
 * Previous condition: `if (totalTokens + tokens > maxTokens) break;`
 * This allowed the running total to reach EXACTLY `maxTokens`, which left
 * ZERO headroom for downstream framing (role tags, separators, the
 * `<|im_start|>` / `<|im_end|>` markers that some providers prepend).
 * The result was a context that fit numerically but overflowed once the
 * provider added its own framing — manifesting as sporadic 400 errors on
 * long Arabic conversations.
 *
 * New condition: `if (totalTokens + tokens >= maxTokens) break;`
 * This drops the message that would fill the LAST token of the budget,
 * leaving 1 token of headroom. Boundary cases:
 *   - history = exact limit (sum of msg tokens == maxTokens):
 *     the last-fitting message is dropped, total stays at maxTokens - lastMsg.
 *   - history = limit + 1 (sum == maxTokens + 1):
 *     the last-fitting message is dropped (same as before), oldest dropped.
 *
 * The fallback "always keep at least the last message" is preserved so a
 * single oversized message still gets sent to the model (the model will
 * truncate or error, but at least the request reaches it).
 */
export function trimHistory(
  messages: Array<{ role: string; content: string }>,
  maxTokens: number,
): Array<{ role: string; content: string }> {
  // AI-13 FIX (Audit v2 · Phase 3): guard against non-positive budgets.
  // Previously a maxTokens of 0 or negative would fall through to the
  // "keep last message" fallback, returning content that violates the
  // budget. We now return [] for non-positive budgets — callers should
  // never pass 0, but if they do, we fail closed (no history) rather
  // than silently sending an oversized context.
  if (maxTokens <= 0) return [];

  let totalTokens = 0;
  const trimmed: Array<{ role: string; content: string }> = [];

  // Iterate from most recent to oldest
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    const tokens = estimateTokens(msg.content);
    // AI-13 FIX (Audit v2 · Phase 3): `>=` instead of `>` to leave 1 token
    // of headroom for downstream message framing.
    if (totalTokens + tokens >= maxTokens) break;
    trimmed.unshift(msg);
    totalTokens += tokens;
  }

  // Ensure we always keep at least the last message — even if it alone
  // exceeds the budget. The model will truncate; we just make sure the
  // request reaches it.
  if (trimmed.length === 0 && messages.length > 0) {
    trimmed.push(messages[messages.length - 1]);
  }

  return trimmed;
}

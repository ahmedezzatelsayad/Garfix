/**
 * contextWindow.ts — AI-002 FIX: Context window management
 * Estimates token count and trims conversation history to fit.
 */

// Rough estimate: 1 token ≈ 4 chars for English, ≈ 2 chars for Arabic
export function estimateTokens(text: string): number {
  if (!text) return 0;
  // Arabic chars are roughly 2 chars/token, English 4 chars/token
  const arabicChars = (text.match(/[\u0600-\u06FF]/g) || []).length;
  const otherChars = text.length - arabicChars;
  return Math.ceil(arabicChars / 2 + otherChars / 4);
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
 */
export function trimHistory(
  messages: Array<{ role: string; content: string }>,
  maxTokens: number,
): Array<{ role: string; content: string }> {
  let totalTokens = 0;
  const trimmed: Array<{ role: string; content: string }> = [];

  // Iterate from most recent to oldest
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    const tokens = estimateTokens(msg.content);
    if (totalTokens + tokens > maxTokens) break;
    trimmed.unshift(msg);
    totalTokens += tokens;
  }

  // Ensure we always keep at least the last message
  if (trimmed.length === 0 && messages.length > 0) {
    trimmed.push(messages[messages.length - 1]);
  }

  return trimmed;
}

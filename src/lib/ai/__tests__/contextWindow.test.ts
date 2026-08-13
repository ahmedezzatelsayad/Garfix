/**
 * Tests for src/lib/ai/contextWindow.ts
 *
 * Covers:
 *   - estimateTokens: empty, pure-Latin, pure-Arabic, mixed
 *   - AI-16 FIX: Arabic calibration constant (1.5x Latin rate)
 *   - trimHistory boundary cases (AI-13 FIX):
 *       - history = exact limit
 *       - history = limit + 1
 *       - history well under limit
 *       - single message larger than limit (fallback keeps it)
 *       - maxTokens <= 0 (fail closed, return [])
 */

import { describe, it, expect } from "bun:test";
import {
  estimateTokens,
  trimHistory,
  calculateBudget,
  ARABIC_TOKEN_CALIBRATION,
} from "../contextWindow";

describe("estimateTokens", () => {
  it("returns 0 for empty / falsy input", () => {
    expect(estimateTokens("")).toBe(0);
    expect(estimateTokens("" as string)).toBe(0);
  });

  it("returns Math.ceil of chars/4 for pure Latin text", () => {
    // 8 chars / 4 = 2 tokens exactly.
    expect(estimateTokens("abcdefgh")).toBe(2);
    // 9 chars / 4 = 2.25 → ceil = 3.
    expect(estimateTokens("abcdefghi")).toBe(3);
  });

  it("AI-16 FIX: applies the 1.5x calibration constant to Arabic chars", () => {
    // 8 Arabic chars: (8/4) * 1.5 = 3 tokens exactly.
    const arabic8 = "مرحبايها"; // 8 chars in the basic Arabic block
    expect(arabic8.length).toBe(8);
    expect(estimateTokens(arabic8)).toBe(3);

    // 4 Arabic chars: (4/4) * 1.5 = 1.5 → ceil = 2.
    const arabic4 = "مرحبا"; // 5 chars (م ر ح ب ا)
    expect(arabic4.length).toBe(5);
    // (5/4) * 1.5 = 1.875 → ceil = 2
    expect(estimateTokens(arabic4)).toBe(2);
  });

  it("AI-16 FIX: Arabic estimate is 1.5x the Latin estimate for the same char count", () => {
    const latin = "abcd"; // 4 chars
    const arabic = "ابجد"; // 4 chars (Arabic equivalents)
    expect(latin.length).toBe(4);
    expect(arabic.length).toBe(4);
    const latinTokens = estimateTokens(latin);
    const arabicTokens = estimateTokens(arabic);
    // Arabic should be 1.5x Latin (rounded up independently).
    // Latin: 4/4 = 1. Arabic: (4/4)*1.5 = 1.5 → ceil = 2.
    expect(arabicTokens).toBeGreaterThan(latinTokens);
    expect(arabicTokens).toBe(Math.ceil(latinTokens * ARABIC_TOKEN_CALIBRATION));
  });

  it("AI-16 FIX: mixed Arabic + Latin sums both contributions", () => {
    // 4 Latin chars + 4 Arabic chars:
    //   latin: 4/4 = 1.0
    //   arabic: (4/4) * 1.5 = 1.5
    //   total: 2.5 → ceil = 3
    const mixed = "abcd" + "ابجد";
    expect(mixed.length).toBe(8);
    expect(estimateTokens(mixed)).toBe(3);
  });

  it("AI-16 FIX: ARABIC_TOKEN_CALIBRATION is exported and equals 1.5", () => {
    expect(ARABIC_TOKEN_CALIBRATION).toBe(1.5);
  });
});

describe("calculateBudget", () => {
  it("returns the default 8000/1000/2000 split when no options given", () => {
    const b = calculateBudget();
    expect(b.total).toBe(8000);
    expect(b.response).toBe(1000);
    expect(b.systemPrompt).toBe(2000);
    // remaining = 8000 - 1000 - 2000 = 5000
    // history = floor(5000 * 0.6) = 3000
    // userMessage = floor(5000 * 0.3) = 1500
    expect(b.history).toBe(3000);
    expect(b.userMessage).toBe(1500);
  });

  it("respects custom contextWindow / responseReserve / systemPromptTokens", () => {
    const b = calculateBudget({
      contextWindow: 16000,
      responseReserve: 2000,
      systemPromptTokens: 4000,
    });
    // remaining = 16000 - 2000 - 4000 = 10000
    expect(b.history).toBe(6000);
    expect(b.userMessage).toBe(3000);
  });
});

describe("trimHistory — AI-13 FIX boundary cases", () => {
  /**
   * Helper: build N messages where each message has exactly `tokensPerMsg`
   * estimated tokens. We use 4-char Latin words so each message = 1 token
   * (4 chars / 4 = 1 token, no Math.ceil needed).
   */
  function makeMessages(n: number, tokensPerMsg = 1): Array<{ role: string; content: string }> {
    const out: Array<{ role: string; content: string }> = [];
    for (let i = 0; i < n; i++) {
      // 4 chars per token, so content = "aaaa" * tokensPerMsg.
      out.push({ role: "user", content: "a".repeat(4 * tokensPerMsg) });
    }
    return out;
  }

  it("AI-13: history = exact limit → drops the last-fitting message (1 token of headroom)", () => {
    // 5 messages × 1 token each = 5 tokens total. maxTokens = 5.
    // With `>` (old behavior): all 5 would fit (5 == 5).
    // With `>=` (AI-13 fix): the 5th message triggers `0+4+1 = 5 >= 5` → break.
    //   Wait — loop runs from most-recent backwards:
    //     i=4: 0+1=1, 1 >= 5? no. add. total=1.
    //     i=3: 1+1=2, 2 >= 5? no. add. total=2.
    //     i=2: 2+1=3, 3 >= 5? no. add. total=3.
    //     i=1: 3+1=4, 4 >= 5? no. add. total=4.
    //     i=0: 4+1=5, 5 >= 5? YES. break.
    //   Result: 4 messages kept (the most recent 4), oldest 1 dropped.
    const msgs = makeMessages(5, 1);
    const trimmed = trimHistory(msgs, 5);
    expect(trimmed.length).toBe(4);
    // The DROPPED message is the OLDEST (index 0).
    expect(trimmed[0]).toBe(msgs[1]);
    expect(trimmed[trimmed.length - 1]).toBe(msgs[4]);
  });

  it("AI-13: history = limit + 1 → drops oldest (same as before, but now also drops the boundary)", () => {
    // 6 messages × 1 token each = 6 tokens. maxTokens = 5.
    // With `>=`:
    //   i=5: 0+1=1, 1>=5? no. add. total=1.
    //   i=4: 1+1=2, no. add. total=2.
    //   i=3: 2+1=3, no. add. total=3.
    //   i=2: 3+1=4, no. add. total=4.
    //   i=1: 4+1=5, 5>=5? YES. break.
    //   Result: 4 messages kept (indices 2,3,4,5), 2 oldest dropped.
    const msgs = makeMessages(6, 1);
    const trimmed = trimHistory(msgs, 5);
    expect(trimmed.length).toBe(4);
    expect(trimmed[0]).toBe(msgs[2]);
    expect(trimmed[trimmed.length - 1]).toBe(msgs[5]);
  });

  it("AI-13: history well under limit → all messages kept", () => {
    const msgs = makeMessages(3, 1); // 3 tokens total
    const trimmed = trimHistory(msgs, 100);
    expect(trimmed.length).toBe(3);
    // Order preserved (oldest first, most recent last).
    expect(trimmed[0]).toBe(msgs[0]);
    expect(trimmed[2]).toBe(msgs[2]);
  });

  it("AI-13: single message larger than limit → fallback keeps it", () => {
    // One message with 100 tokens (400 chars). maxTokens = 5.
    // Loop: i=0, 0+100=100, 100>=5? YES. break. trimmed is empty.
    // Fallback: trimmed.length === 0 && messages.length > 0 → push last message.
    const msgs = makeMessages(1, 100);
    const trimmed = trimHistory(msgs, 5);
    expect(trimmed.length).toBe(1);
    expect(trimmed[0]).toBe(msgs[0]);
  });

  it("AI-13: maxTokens = 0 → fail closed, return [] (no fallback)", () => {
    const msgs = makeMessages(3, 1);
    const trimmed = trimHistory(msgs, 0);
    expect(trimmed.length).toBe(0);
  });

  it("AI-13: maxTokens < 0 → fail closed, return [] (no fallback)", () => {
    const msgs = makeMessages(3, 1);
    const trimmed = trimHistory(msgs, -1);
    expect(trimmed.length).toBe(0);
  });

  it("AI-13: empty messages array → returns empty array", () => {
    const trimmed = trimHistory([], 100);
    expect(trimmed.length).toBe(0);
  });

  it("AI-13: preserves order — most recent message is last in trimmed output", () => {
    const msgs = [
      { role: "user", content: "aaaa" },      // 1 token (oldest)
      { role: "assistant", content: "bbbb" }, // 1 token
      { role: "user", content: "cccc" },      // 1 token (newest)
    ];
    const trimmed = trimHistory(msgs, 100);
    expect(trimmed.length).toBe(3);
    expect(trimmed[0].content).toBe("aaaa");
    expect(trimmed[2].content).toBe("cccc");
  });

  it("AI-13: Arabic content uses calibrated token count for trimming decisions", () => {
    // 4 Arabic chars = 2 tokens (after AI-16 calibration).
    // 3 messages × 4 Arabic chars = 6 tokens total. maxTokens = 5.
    // With `>=`:
    //   i=2: 0+2=2, 2>=5? no. add. total=2.
    //   i=1: 2+2=4, 4>=5? no. add. total=4.
    //   i=0: 4+2=6, 6>=5? YES. break.
    //   Result: 2 messages kept.
    const msgs = [
      { role: "user", content: "ابجد" },      // 4 Arabic chars
      { role: "user", content: "هوزح" },      // 4 Arabic chars
      { role: "user", content: "طيكلمن" },    // 6 Arabic chars... wait, let me recalc
    ];
    // Actually let's keep it simple — all 3 messages with 4 Arabic chars:
    const msgs2 = Array.from({ length: 3 }, () => ({ role: "user", content: "ابجد" }));
    const trimmed = trimHistory(msgs2, 5);
    expect(trimmed.length).toBe(2);
  });
});

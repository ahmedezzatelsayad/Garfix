/**
 * test-deepseek-connection.ts
 *
 * Quick smoke test: calls callAI() with a trivial prompt to verify
 * OpenRouter + DeepSeek is reachable and returns real token counts.
 */
import { callAI } from "../src/lib/aiProvider";
import { logAiUsage } from "../src/lib/ai/costTracker";

async function main() {
  console.log("=== Testing OpenRouter + DeepSeek connection ===\n");

  const t0 = Date.now();
  try {
    const result = await callAI({
      messages: [
        { role: "system", content: "You are a helpful assistant. Reply in one short sentence." },
        { role: "user", content: "What is 2+2? Reply with just the number." },
      ],
      temperature: 0,
      maxTokens: 50,
    });
    const ms = Date.now() - t0;

    console.log(`  ✅ SUCCESS in ${ms}ms`);
    console.log(`  provider: ${result.provider}`);
    console.log(`  model:    ${result.model}`);
    console.log(`  content:  "${result.content.slice(0, 100)}"`);
    console.log(`  tokens:   in=${result.usage.prompt_tokens} out=${result.usage.completion_tokens} total=${result.usage.total_tokens}`);

    // Log this test call to ai_usage_logs
    await logAiUsage({
      provider: result.provider,
      model: result.model,
      endpoint: "connection-test",
      tokensIn: result.usage.prompt_tokens,
      tokensOut: result.usage.completion_tokens,
      success: true,
      processingMs: ms,
    });
    console.log(`  → Logged to ai_usage_logs (endpoint=connection-test)`);
  } catch (err) {
    const ms = Date.now() - t0;
    console.log(`  ❌ FAILED in ${ms}ms`);
    console.log(`  error: ${err instanceof Error ? err.message : String(err)}`);

    await logAiUsage({
      provider: "openrouter",
      model: "deepseek/deepseek-chat",
      endpoint: "connection-test",
      tokensIn: 0,
      tokensOut: 0,
      success: false,
      processingMs: ms,
      errorMessage: err instanceof Error ? err.message.slice(0, 200) : String(err).slice(0, 200),
    });
    process.exit(1);
  }

  process.exit(0);
}

main();

// Make this file a module to avoid global scope collisions
export {};

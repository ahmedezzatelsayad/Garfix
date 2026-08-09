/**
 * /api/platform-admin/ai-providers/test
 * POST — test connection to a specific AI provider
 */
export const runtime = 'nodejs';

import { NextRequest, NextResponse } from "next/server";
import { parseJsonBody } from "@/lib/api";
import { requireFounder } from "@/lib/middleware";
import { apiError, withErrorHandler } from "@/lib/api";
import { getAiProviders, PROVIDER_INFO, type ProviderType } from "@/lib/aiProvider";
import { decryptSecret } from "@/lib/cryptoVault";
import { logAdminAction } from "@/lib/audit";
import { z } from "zod";
import { rateLimitResponse, LIMITS } from "@/lib/rateLimit";

const TestSchema = z.object({
  type: z.enum(["z-ai", "openrouter", "anthropic", "openai", "gemini", "deepseek"]),
});

interface TestResult {
  success: boolean;
  latencyMs?: number;
  details?: string;
  error?: string;
}

async function testGemini(apiKey: string, model: string): Promise<TestResult> {
  const start = Date.now();
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: 'Reply with "OK" only.' }] }],
        generationConfig: { maxOutputTokens: 5, temperature: 0 },
      }),
      signal: AbortSignal.timeout(15000),
    });
    const latencyMs = Date.now() - start;
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      return { success: false, latencyMs, error: err?.error?.message || `HTTP ${response.status}` };
    }
    return { success: true, latencyMs, details: `Gemini ${model} responded successfully` };
  } catch (err) {
    return { success: false, latencyMs: Date.now() - start, error: err instanceof Error ? err.message : "Connection failed" };
  }
}

async function testOpenAICompatible(baseUrl: string, apiKey: string, model: string, providerName: string): Promise<TestResult> {
  const start = Date.now();
  try {
    const url = `${baseUrl}/chat/completions`;
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
        ...(baseUrl.includes("openrouter") ? { "HTTP-Referer": process.env.APP_URL || "https://garfix.app", "X-Title": "GarfiX ERP" } : {}),
      },
      body: JSON.stringify({ model, messages: [{ role: "user", content: 'Reply with "OK" only.' }], max_tokens: 5, temperature: 0 }),
      signal: AbortSignal.timeout(15000),
    });
    const latencyMs = Date.now() - start;
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      return { success: false, latencyMs, error: err?.error?.message || `HTTP ${response.status}` };
    }
    return { success: true, latencyMs, details: `${providerName} ${model} responded successfully` };
  } catch (err) {
    return { success: false, latencyMs: Date.now() - start, error: err instanceof Error ? err.message : "Connection failed" };
  }
}

async function testAnthropic(apiKey: string, model: string): Promise<TestResult> {
  const start = Date.now();
  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model, max_tokens: 5, messages: [{ role: "user", content: 'Reply with "OK" only.' }] }),
      signal: AbortSignal.timeout(15000),
    });
    const latencyMs = Date.now() - start;
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      return { success: false, latencyMs, error: err?.error?.message || `HTTP ${response.status}` };
    }
    return { success: true, latencyMs, details: `Anthropic ${model} responded successfully` };
  } catch (err) {
    return { success: false, latencyMs: Date.now() - start, error: err instanceof Error ? err.message : "Connection failed" };
  }
}

export const POST = withErrorHandler(async (req: NextRequest) => {
  const rl = await rateLimitResponse(req, "post:platform-admin-ai-providers-test", LIMITS.API_WRITE);
  if (rl) return rl;
  const authResult = await requireFounder(req);
  if (authResult instanceof NextResponse) return authResult;
  const user = authResult.user;

  const body = await parseJsonBody(req) ?? {};
  const validated = TestSchema.safeParse(body);
  if (!validated.success) {
    return apiError(`Invalid request: ${validated.error.issues.map(i => i.message).join(", ")}`, 400);
  }

  const { type } = validated.data;
  const providers = await getAiProviders();
  const config = providers.find((p: { provider: string }) => p.provider === type);

  if (!config) return NextResponse.json({ success: false, error: `Provider "${type}" not configured` });

  let apiKey = "";
  if (config.apiKey) {
    try { apiKey = decryptSecret(config.apiKey); } catch { apiKey = config.apiKey; }
  }
  if (!apiKey && type !== "z-ai") return NextResponse.json({ success: false, error: "No API key configured for this provider" });

  const model = config.model || PROVIDER_INFO.find((p: { type: string }) => p.type === type)?.defaultModel || "";
  const baseUrl = config.baseUrl || "";

  let result: TestResult;
  switch (type as ProviderType) {
    case "gemini": result = await testGemini(apiKey, model || "gemini-2.0-flash"); break;
    case "openai": result = await testOpenAICompatible(baseUrl || "https://api.openai.com/v1", apiKey, model || "gpt-4o-mini", "OpenAI"); break;
    case "openrouter": result = await testOpenAICompatible("https://openrouter.ai/api/v1", apiKey, model || "deepseek/deepseek-chat-v3-0324", "OpenRouter"); break;
    case "deepseek": result = await testOpenAICompatible(baseUrl || "https://api.deepseek.com/v1", apiKey, model || "deepseek-chat", "DeepSeek"); break;
    case "anthropic": result = await testAnthropic(apiKey, model || "claude-3-5-sonnet-20241022"); break;
    case "z-ai": result = { success: true, latencyMs: 0, details: "z-ai built-in provider is always available" }; break;
    default: result = { success: false, error: `Unknown provider type: ${type}` };
  }

  await logAdminAction({ adminEmail: user.email, action: "test_ai_provider", changes: { provider: type, model, success: result.success, latencyMs: result.latencyMs } });
  return NextResponse.json(result);
});

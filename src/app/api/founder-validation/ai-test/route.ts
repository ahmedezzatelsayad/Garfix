/**
 * POST /api/founder-validation/ai-test
 *
 * Makes a real OpenRouter LLM call using the OPENROUTER_API_KEY env var.
 * Body: { prompt: string, model?: string }
 *
 * P3.1 (Cycle 5): wrapped in `withErrorHandler` to suppress raw `error.message`
 *   leaks (OpenRouter / fetch errors can include URL fragments, header values).
 */
import { NextRequest, NextResponse } from "next/server";
import { callOpenRouter } from "@/lib/founder-validation";
import { requireFounder } from "@/lib/middleware";
import { withErrorHandler } from "@/lib/api";
import { logger } from "@/lib/logger";
import { rateLimitResponse, LIMITS } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";

export const POST = withErrorHandler(async (request: NextRequest) => {
  // P5-H2: Rate limit POST /api/founder-validation-ai-test — 30/min/IP (API_WRITE).
  const rl = await rateLimitResponse(request, "post:founder-validation-ai-test", LIMITS.API_WRITE);
  if (rl) return rl;

  // SEC-C15 (Cycle 4): close missing-auth — unauthenticated callers could drain
  // the platform's OPENROUTER_API_KEY quota on demand.
  const authResult = await requireFounder(request);
  if (authResult instanceof NextResponse) return authResult;

  const body = await request.json();
  const { prompt, model } = body as { prompt?: string; model?: string };

  if (!prompt) {
    return NextResponse.json(
      { ok: false, error: "Missing required field: prompt" },
      { status: 400 },
    );
  }

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    logger.warn("[founder-validation/ai-test] OPENROUTER_API_KEY not set");
    return NextResponse.json(
      { ok: false, error: "OPENROUTER_API_KEY environment variable is not set" },
      { status: 500 },
    );
  }

  const startMs = Date.now();
  const result = await callOpenRouter(apiKey, prompt, model, false);
  const latencyMs = Date.now() - startMs;

  return NextResponse.json({
    ok: true,
    action: "ai-test",
    latencyMs,
    model: result.model,
    id: result.id,
    content: result.choices?.[0]?.message?.content ?? null,
    usage: result.usage ?? null,
  });
});

/**
 * POST /api/founder-validation/ai-test
 *
 * Makes a real OpenRouter LLM call using the OPENROUTER_API_KEY env var.
 * Body: { prompt: string, model?: string }
 */
import { NextRequest, NextResponse } from "next/server";
import { callOpenRouter } from "@/lib/founder-validation";
import { requireFounder } from "@/lib/middleware";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  // SEC-C15 (Cycle 4): close missing-auth — unauthenticated callers could drain
  // the platform's OPENROUTER_API_KEY quota on demand.
  const authResult = await requireFounder(request);
  if (authResult instanceof NextResponse) return authResult;

  try {
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
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[Founder Validation /ai-test] POST error:", message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

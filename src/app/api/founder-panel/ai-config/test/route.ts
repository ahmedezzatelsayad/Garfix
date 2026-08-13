/**
 * POST /api/founder-panel/ai-config/test
 * Test an API connection for a specific feature before saving.
 * Only founders can test API connections.
 */
import { NextRequest, NextResponse } from 'next/server';
import { dbTyped as db } from "@/lib/db";
import { resolveAuth } from '@/lib/auth';
import { z } from 'zod';
import { apiError, withErrorHandler } from '@/lib/api';
import { logger } from '@/lib/logger';
import { logAudit } from '@/lib/audit';
import { rateLimitResponse, LIMITS } from "@/lib/rateLimit";

const TestConnectionSchema = z.object({
  feature: z.enum(['chat', 'invoice', 'parse', 'memory']),
  apiKey: z.string().min(1),
  model: z.string().optional(),
});

async function testGeminiConnection(
  apiKey: string,
  model: string = 'gemini-2.0-flash',
  feature: string = 'chat'
): Promise<{ success: boolean; latencyMs: number; model: string; error?: string }> {
  const startTime = Date.now();
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    const testPrompts: Record<string, string> = {
      chat: 'Hello! Reply with "Chat OK" only.',
      invoice: 'Extract total amount from: Invoice #001 - Total: $1,250. Reply with "Invoice OK".',
      parse: 'Categorize this: "Laptop computer". Reply with "Parse OK".',
      memory: 'Remember this: user prefers dark mode. Reply with "Memory OK".',
    };
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: testPrompts[feature] || testPrompts.chat }] }],
        generationConfig: { maxOutputTokens: 50, temperature: 0.1 },
      }),
      signal: AbortSignal.timeout(15000),
    });
    const latencyMs = Date.now() - startTime;
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return { success: false, latencyMs, model, error: errorData?.error?.message || `HTTP ${response.status}` };
    }
    const data = await response.json();
    return { success: true, latencyMs, model: data?.modelVersion || model };
  } catch (error: unknown) {
    return { success: false, latencyMs: Date.now() - startTime, model, error: error instanceof Error ? error.message : 'Connection failed' };
  }
}

export async function POST(request: NextRequest) {
  const rl = await rateLimitResponse(request, "post:founder-panel-ai-config-test", LIMITS.API_WRITE);
  if (rl) return rl;
  return withErrorHandler(async () => {
    const auth = await resolveAuth(request);
    if (!auth.user) return apiError('Unauthorized', 401);
    const body = await request.json().catch(() => ({}));
    const validated = TestConnectionSchema.safeParse(body);
    if (!validated.success) return apiError('Validation failed', 400, validated.error.issues);
    const { feature, apiKey, model } = validated.data;
    const membership = await db.companyMembership.findFirst({ where: { userUid: auth.user.uid, role: 'founder' } });
    if (!membership) return apiError('Only founders can test API connections', 403);
    const result = await testGeminiConnection(apiKey, model || 'gemini-2.0-flash', feature);
    await logAudit({
      userEmail: auth.user.email, userUid: auth.user.uid,
      action: `test_ai_connection_${feature}`, entity: 'ai_config_test',
      details: { feature, model: model || 'gemini-2.0-flash', success: result.success, latencyMs: result.latencyMs },
    });
    return NextResponse.json({ success: true, data: { ...result, feature, timestamp: new Date().toISOString() } });
  })();
}

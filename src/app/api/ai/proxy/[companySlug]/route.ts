/**
 * ═════════════════════════════════════════════════════════════
 * GarfiX DS v4.1 — Per-Client AI Proxy Endpoint
 *
 * POST /api/ai/proxy/[companySlug]?feature=chat
 *
 * ده "الوصلة" اللي المؤسس بيديها لكل عميل. كل عميل ليه URL خاص
 * بيه بناءً على `companySlug` بتاعه. الـ endpoint ده:
 *
 *   1. بيـ resolve الـ companySlug → companyId
 *   2. بيقرأ CompanyAIConfig للميزة المطلوبة (chat/invoice/parse/memory)
 *   3. بيـ decrypt المفتاح المشفّر
 *   4. بيـ enforce الـ rate limit عبر Valkey (distributed)
 *   5. بيـ proxy الطلب لـ upstream provider (DeepSeek/Gemini/OpenAI/OpenRouter)
 *   6. بيـ record الاستخدام للـ billing/observability
 *
 * الـ proxy ده بيخفي الـ API key الحقيقي عن العميل — العميل مش شايف
 * المفتاح، بيستخدم الـ URL الخاص بيه بس. ده:
 *   - أمان أعلى (المفتاح مش بيتسرب للعميل)
 *   - مركزية التحكم في الـ rate limits عبر Valkey
 *   - مركزية الـ billing والـ logging
 *
 * Authentication:
 *   - Bearer JWT في الـ Authorization header (نفس الـ auth بتاع الـ app)
 *   - أو `X-Garfix-Proxy-Token` لو العميل بيتصل من system خارجي
 *     (يتم إصداره من `/api/founder-panel/ai-config` كـ "proxy token")
 *
 * Request body (OpenAI-compatible chat format):
 *   {
 *     "model": "deepseek-chat",            // optional, overrides config
 *     "messages": [{ "role": "user", "content": "..." }],
 *     "temperature": 0.7,
 *     "max_tokens": 2048,
 *     "json_mode": false
 *   }
 *
 * Response (OpenAI-compatible):
 *   {
 *     "success": true,
 *     "data": { ...OpenAI response... },
 *     "feature": "chat",
 *     "companySlug": "acme-corp",
 *     "model": "deepseek-chat",
 *     "usage": { "promptTokens": 10, "completionTokens": 5, "totalTokens": 15 },
 *     "latencyMs": 234
 *   }
 *
 * Errors:
 *   401 — Unauthorized (missing/invalid token)
 *   403 — Company not accessible by this user / feature disabled
 *   404 — Company slug not found
 *   429 — Rate limit exceeded (per company+feature)
 *   502 — Upstream provider error
 *
 * ═════════════════════════════════════════════════════════════
 */

import { NextRequest, NextResponse } from 'next/server';
import { dbTyped as db } from '@/lib/db';
import { resolveAuth } from '@/lib/auth';
import { apiError, withErrorHandler } from '@/lib/api';
import { logger } from '@/lib/logger';
import { logAudit } from '@/lib/audit';
import { rateLimitResponse, LIMITS } from '@/lib/rateLimit';
import { generateWithFeature } from '@/lib/ai/per-feature-router';
import { peekRateLimit } from '@/lib/ai/valkey-rate-limiter';
import { hasRealApiKey } from '@/lib/ai/keyVault';
import { z } from 'zod';

// ── Schema ──────────────────────────────────────────────────

const ProxyRequestSchema = z.object({
  model: z.string().max(100).optional(),
  messages: z.array(
    z.object({
      role: z.enum(['user', 'assistant', 'system']),
      content: z.string().max(100_000),
    })
  ).min(1).max(100),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().int().min(1).max(32_768).optional(),
  jsonMode: z.boolean().optional(),
});

const ALLOWED_FEATURES = ['chat', 'invoice', 'parse', 'memory'] as const;
type ProxyFeature = typeof ALLOWED_FEATURES[number];

// ── Handler ─────────────────────────────────────────────────

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ companySlug: string }> }
) {
  // P5-H2: Rate limit the proxy endpoint — 10/min/IP (AI_CHAT).
  // Per-company+feature rate limiting is enforced separately inside the
  // per-feature router via Valkey (see valkey-rate-limiter.ts). This IP-level
  // limit is a coarse backstop against a single source flooding many companies.
  const rl = await rateLimitResponse(request, 'post:ai-proxy', LIMITS.AI_CHAT);
  if (rl) return rl;

  return withErrorHandler(async () => {
    // 1. Authenticate — proxy requires a valid user session
    const auth = await resolveAuth(request);
    if (!auth.user) return apiError('Unauthorized', 401);

    // 2. Resolve companySlug → company
    const { companySlug } = await params;
    const company = await db.company.findFirst({
      where: { slug: companySlug, deletedAt: null },
      select: {
        id: true,
        slug: true,
        name: true,
      },
    });

    if (!company) {
      return apiError(`Company '${companySlug}' not found`, 404);
    }

    // 3. RBAC: verify the user has access to this company
    // Phase 3 P1 fix: replaced broken `db.companyMember.findFirst()` cast
    // (CompanyMember model doesn't exist → every call returned 500) with
    // assertCompanyAccess() which checks the user's companies array.
    const { assertCompanyAccess } = await import("@/lib/auth");
    if (!assertCompanyAccess(auth.user, companySlug)) {
      await logAudit({
        userEmail: auth.user.email,
        userUid: auth.user.uid,
        action: 'ai_proxy_access_denied',
        entity: 'company',
        details: { companySlug, reason: 'no_membership' },
      });
      return apiError('You do not have access to this company', 403);
    }

    // 4. Determine which feature to use (default: chat)
    const { searchParams } = new URL(request.url);
    const featureParam = searchParams.get('feature') || 'chat';
    if (!ALLOWED_FEATURES.includes(featureParam as ProxyFeature)) {
      return apiError(
        `Invalid feature. Must be one of: ${ALLOWED_FEATURES.join(', ')}`,
        400
      );
    }
    const feature = featureParam as ProxyFeature;

    // 5. Parse + validate body
    const body = await request.json().catch(() => ({}));
    const validated = ProxyRequestSchema.safeParse(body);
    if (!validated.success) {
      return apiError(
        `Invalid request body: ${validated.error.issues.map(i => i.message).join('; ')}`,
        400
      );
    }

    const { messages, temperature, maxTokens, jsonMode } = validated.data;

    // Phase 8 P1 fix: sanitize user messages to prevent prompt injection.
    // An attacker could send {role:"system", content:"Disregard all prior
    // instructions..."} and the proxy would forward it verbatim to the
    // upstream provider as a system instruction. sanitizeUserMessages
    // demotes role:"system" to role:"user" with a prefix.
    const { sanitizeUserMessages } = await import("@/lib/ai/sanitize");
    const sanitizedMessages = sanitizeUserMessages(messages, {
      userEmail: auth.user.email,
      userUid: auth.user.uid,
    });

    // 6. Call the per-feature router (handles rate limit + key resolution +
    //    encryption + pool fallback + upstream call + usage tracking)
    // AI-02 FIX (Audit v2 · Phase 1 Final Closure): Wrap the upstream call in
    // executeCascade so the proxy benefits from cache + budget enforcement.
    const startTime = Date.now();
    const { executeCascade } = await import("@/lib/ai-fabric/gateway");
    const cascadeResult = await executeCascade<unknown>(
      {
        companySlug,
        requestType: "chat",
        normalizedInput: JSON.stringify(sanitizedMessages).slice(0, 500),
        rawInput: JSON.stringify(sanitizedMessages),
        context: { feature, temperature, maxTokens, jsonMode },
      },
      {
        skipStages: ["pattern", "rule"], // proxy is a pass-through, skip extraction stages
        aiFn: async (): Promise<{ data: unknown; provider: string; tokensUsed: number; costUsd: number }> => {
          const upstreamResult = await generateWithFeature(company.id, feature, {
            messages: sanitizedMessages,
            temperature,
            maxTokens,
            jsonMode,
          });
          return {
            data: upstreamResult,
            provider: "proxy-upstream",
            tokensUsed: 0,
            costUsd: 0,
          };
        },
      },
    );
    const result = cascadeResult.data as Awaited<ReturnType<typeof generateWithFeature>>;

    const latencyMs = Date.now() - startTime;

    // 7. Audit (success or failure — for billing/observability)
    await logAudit({
      userEmail: auth.user.email,
      userUid: auth.user.uid,
      action: result.success ? 'ai_proxy_call' : 'ai_proxy_call_failed',
      entity: 'ai_proxy',
      details: {
        companySlug,
        companyId: company.id,
        feature,
        model: result.model,
        success: result.success,
        latencyMs,
        rateLimited: result.rateLimited,
        error: result.error,
        tokensUsed: result.usage?.totalTokens,
      },
    });

    // 8. Handle rate-limit responses
    if (result.rateLimited) {
      const usage = await peekRateLimit(company.id, feature);
      // BUG FIX (BUG 2): use result.retryAfterMs (from the rate limiter),
      //   not result.latencyMs (which is 0 on rate-limit rejection).
      // BUG FIX (BUG 17): set the standard `Retry-After` HTTP header so
      //   OpenAI-compatible clients and HTTP retry libraries back off
      //   correctly (they read the header, not the JSON body field).
      const retryAfterSeconds = Math.ceil((result.retryAfterMs ?? 60_000) / 1000);
      return NextResponse.json(
        {
          success: false,
          error: result.error || 'Rate limit exceeded',
          feature,
          companySlug,
          retryAfterSeconds,
          usage: {
            currentUsage: usage.currentUsage,
            windowMs: usage.windowMs,
          },
        },
        {
          status: 429,
          headers: { 'Retry-After': String(retryAfterSeconds) },
        }
      );
    }

    // 9. Handle upstream errors
    if (!result.success) {
      return NextResponse.json(
        {
          success: false,
          error: result.error || 'Upstream AI call failed',
          feature,
          companySlug,
          model: result.model,
          latencyMs,
        },
        { status: 502 }
      );
    }

    // 10. Success — return OpenAI-compatible response
    // BUG FIX (BUG 21): use crypto.randomUUID() for the response ID instead
    //   of Date.now() — two requests in the same millisecond would produce
    //   the same ID, and some OpenAI client libraries dedupe by ID.
    const responseId = `chatcmpl-proxy-${crypto.randomUUID()}`;
    return NextResponse.json({
      success: true,
      data: {
        // OpenAI-style response shape, so drop-in OpenAI clients work
        id: responseId,
        object: 'chat.completion',
        created: Math.floor(Date.now() / 1000),
        model: result.model,
        choices: [
          {
            index: 0,
            message: { role: 'assistant', content: result.content || '' },
            finish_reason: 'stop',
          },
        ],
        usage: result.usage
          ? {
              prompt_tokens: result.usage.promptTokens,
              completion_tokens: result.usage.completionTokens,
              total_tokens: result.usage.totalTokens,
            }
          : undefined,
      },
      feature,
      companySlug,
      model: result.model,
      latencyMs,
    });
  })();
}

// ── GET — Proxy status endpoint (for client health checks) ─────

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ companySlug: string }> }
) {
  return withErrorHandler(async () => {
    const auth = await resolveAuth(request);
    if (!auth.user) return apiError('Unauthorized', 401);

    const { companySlug } = await params;
    const company = await db.company.findFirst({
      where: { slug: companySlug, deletedAt: null },
      select: { id: true, slug: true, name: true },
    });

    if (!company) return apiError(`Company '${companySlug}' not found`, 404);

    // Phase 3 P1 fix: replaced broken CompanyMember cast with assertCompanyAccess
    const { assertCompanyAccess } = await import("@/lib/auth");
    if (!assertCompanyAccess(auth.user, companySlug)) {
      return apiError('You do not have access to this company', 403);
    }

    // Return per-feature status + current rate-limit usage
    const features = ['chat', 'invoice', 'parse', 'memory'] as const;
    const status: Record<string, unknown> = {};

    const config = await db.companyAIConfig.findUnique({
      where: { companyId: company.id },
    });

    for (const feature of features) {
      const usage = await peekRateLimit(company.id, feature);
      status[feature] = {
        enabled: config
          ? (config[`${feature}Enabled` as keyof typeof config] as boolean)
          : false,
        hasKey: config
          ? hasRealApiKey(config[`${feature}ApiKey` as keyof typeof config] as string)
          : false,
        model: config
          ? (config[`${feature}Model` as keyof typeof config] as string)
          : null,
        rateLimitRpm: config
          ? (config[`${feature}RateLimitRpm` as keyof typeof config] as number)
          : 0,
        currentUsage: usage.currentUsage,
        windowMs: usage.windowMs,
      };
    }

    return NextResponse.json({
      success: true,
      data: {
        companySlug,
        companyName: company.name,
        features: status,
      },
    });
  })();
}

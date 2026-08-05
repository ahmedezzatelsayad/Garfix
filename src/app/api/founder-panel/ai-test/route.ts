/**
 * ═════════════════════════════════════════════════════════════
 * GarfiX DS v4.0 - Multi-Provider AI Connection Test
 * 
 * Supports: Gemini, OpenAI, OpenRouter
 * Auto-detects provider from API key format
 * 
 * POST /api/founder-panel/ai-test
 * 
 * Body:
 * {
 *   feature: 'chat' | 'invoice' | 'parse' | 'memory',
 *   apiKey: string,
 *   model?: string  (optional, auto-detected)
 * }
 *
 * ═════════════════════════════════════════════════════════════
 */

import { NextRequest, NextResponse } from 'next/server';
import { resolveAuth } from '@/lib/auth';
import { z } from 'zod';
import { apiError, withErrorHandler } from '@/lib/api';
import { logger } from '@/lib/logger';
import { rateLimitResponse, LIMITS } from "@/lib/rateLimit";

// ── Types ───────────────────────────────────────────────────

type AIProvider = 'gemini' | 'openai' | 'openrouter';

// ── Schema ──────────────────────────────────────────────────

const TestConnectionSchema = z.object({
  feature: z.enum(['chat', 'invoice', 'parse', 'memory']),
  apiKey: z.string().min(1),
  model: z.string().optional(),
});

// ── Provider Detection ──────────────────────────────────────

function detectProvider(apiKey: string): AIProvider {
  if (apiKey.startsWith('sk-or-')) return 'openrouter';
  if (apiKey.startsWith('sk-')) return 'openai';
  if (apiKey.startsWith('AI') || apiKey.includes('google')) return 'gemini';
  return 'openai'; // default
}

// ── Test Functions per Provider ─────────────────────────────

/**
 * Test Gemini connection
 */
async function testGemini(
  apiKey: string, 
  model: string = 'gemini-2.0-flash'
): Promise<TestResult> {
  const startTime = Date.now();
  
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [{ text: 'Reply with exactly: "Gemini OK"' }]
        }],
        generationConfig: { maxOutputTokens: 10, temperature: 0.1 },
      }),
      signal: AbortSignal.timeout(15000),
    });
    
    const latencyMs = Date.now() - startTime;
    const data = await response.json();
    
    if (!response.ok) {
      return {
        success: false,
        latencyMs,
        model,
        provider: 'gemini',
        error: data?.error?.message || `HTTP ${response.status}`,
      };
    }
    
    return {
      success: true,
      latencyMs,
      model: data?.modelVersion || model,
      provider: 'gemini',
      reply: data?.candidates?.[0]?.content?.parts?.[0]?.text,
    };
  } catch (error: any) {
    return {
      success: false,
      latencyMs: Date.now() - startTime,
      model,
      provider: 'gemini',
      error: error.message,
    };
  }
}

/**
 * Test OpenAI connection
 */
async function testOpenAI(
  apiKey: string,
  model: string = 'gpt-4o-mini'
): Promise<TestResult> {
  const startTime = Date.now();
  
  try {
    const url = 'https://api.openai.com/v1/chat/completions';
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: 'Reply with exactly: "OpenAI OK"' }],
        max_tokens: 10,
        temperature: 0.1,
      }),
      signal: AbortSignal.timeout(15000),
    });
    
    const latencyMs = Date.now() - startTime;
    const data = await response.json();
    
    if (!response.ok) {
      return {
        success: false,
        latencyMs,
        model,
        provider: 'openai',
        error: data?.error?.message || `HTTP ${response.status}`,
      };
    }
    
    return {
      success: true,
      latencyMs,
      model: data?.model || model,
      provider: 'openai',
      reply: data?.choices?.[0]?.message?.content,
      usage: data?.usage ? {
        promptTokens: data.usage.prompt_tokens,
        completionTokens: data.usage.completion_tokens,
        totalTokens: data.usage.total_tokens,
      } : undefined,
    };
  } catch (error: any) {
    return {
      success: false,
      latencyMs: Date.now() - startTime,
      model,
      provider: 'openai',
      error: error.message,
    };
  }
}

/**
 * Test OpenRouter connection
 */
async function testOpenRouter(
  apiKey: string,
  model: string = 'deepseek/deepseek-chat-v3-0324'
): Promise<TestResult> {
  const startTime = Date.now();
  
  try {
    const url = 'https://openrouter.ai/api/v1/chat/completions';
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'HTTP-Referer': process.env.APP_URL || 'https://garfix.app',
        'X-Title': 'GarfiX ERP AI Test',
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: 'Reply with exactly: "OpenRouter OK"' }],
        max_tokens: 10,
        temperature: 0.1,
      }),
      signal: AbortSignal.timeout(20000), // OpenRouter can be slower
    });
    
    const latencyMs = Date.now() - startTime;
    const data = await response.json();
    
    if (!response.ok) {
      return {
        success: false,
        latencyMs,
        model,
        provider: 'openrouter',
        error: data?.error?.message || `HTTP ${response.status}`,
      };
    }
    
    return {
      success: true,
      latencyMs,
      model: data?.model || model,
      provider: 'openrouter',
      reply: data?.choices?.[0]?.message?.content,
      usage: data?.usage ? {
        promptTokens: data.usage.prompt_tokens,
        completionTokens: data.usage.completion_tokens,
        totalTokens: data.usage.total_tokens,
        cost: data.usage.cost || data.usage.total_cost,
      } : undefined,
    };
  } catch (error: any) {
    return {
      success: false,
      latencyMs: Date.now() - startTime,
      model,
      provider: 'openrouter',
      error: error.message,
    };
  }
}

interface TestResult {
  success: boolean;
  latencyMs: number;
  model: string;
  provider: AIProvider;
  reply?: string;
  error?: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    cost?: number;
  };
}

// ── Default Models per Provider ──────────────────────────────

const DEFAULT_MODELS: Record<AIProvider, string> = {
  gemini: 'gemini-2.0-flash',
  openai: 'gpt-4o-mini',
  openrouter: 'deepseek/deepseek-chat-v3-0324',
};

// ── API Route Handler ───────────────────────────────────────

export async function POST(request: NextRequest) {
  // P5-H2: Rate limit POST /api/founder-panel-ai-test — 30/min/IP (API_WRITE).
  const rl = await rateLimitResponse(request, "post:founder-panel-ai-test", LIMITS.API_WRITE);
  if (rl) return rl;

  return withErrorHandler(async () => {
    // Authenticate
    const auth = await resolveAuth(request);
    if (!auth.user) return apiError('Unauthorized', 401);
    
    // Parse body
    const body = await request.json().catch(() => ({}));
    const validated = TestConnectionSchema.safeParse(body);
    
    if (!validated.success) {
      return apiError('Validation failed', 400, validated.error.issues);
    }
    
    const { feature, apiKey, model } = validated.data;
    
    // Auto-detect provider
    const provider = detectProvider(apiKey);
    const resolvedModel = model || DEFAULT_MODELS[provider];
    
    logger.info(`[AITest] Testing ${provider} connection for feature: ${feature}`, {
      provider,
      model: resolvedModel,
      keyPrefix: apiKey.substring(0, 8) + '...',
    });
    
    // Route to appropriate test function
    let result: TestResult;
    
    switch (provider) {
      case 'gemini':
        result = await testGemini(apiKey, resolvedModel);
        break;
      case 'openrouter':
        result = await testOpenRouter(apiKey, resolvedModel);
        break;
      case 'openai':
      default:
        result = await testOpenAI(apiKey, resolvedModel);
        break;
    }
    
    // Log result
    logger.info(`[AITest] Result for ${feature}/${provider}:`, {
      success: result.success,
      latencyMs: result.latencyMs,
      hasError: !!result.error,
    });
    
    return NextResponse.json({
      success: true, // Request succeeded, not necessarily the AI call
      data: {
        ...result,
        feature,
        timestamp: new Date().toISOString(),
        detectedProvider: provider,
      },
    });
  })();
}

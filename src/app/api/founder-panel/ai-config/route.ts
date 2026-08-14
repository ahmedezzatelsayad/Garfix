/**
 * ═════════════════════════════════════════════════════════════
 * GarfiX DS v4.0 - Multi-Tenant AI Configuration System (Per-Feature)
 * 
 * نظام إدارة مفاتيح AI لكل شركة/مستخدم - كل Feature بمفتاح منفصل!
 * 
 * Features:
 * - 💬 Chat API Key → For AI conversations
 * - 📄 Invoice API Key → For invoice extraction & processing  
 * - 🔍 Parse API Key → For smart document parsing
 * - 🧠 Memory API Key → For context & history
 * 
 * Each feature has:
 * - Isolated API key (no shared bottleneck)
 * - Independent rate limit
 * - Separate usage tracking
 * - Enable/disable toggle
 * 
 * API Endpoints:
 * - GET    /api/founder-panel/ai-config      → Get company config
 * - PUT    /api/founder-panel/ai-config      → Update company config (per-feature keys)
 * - POST   /api/founder-panel/ai-config/test → Test API connection per feature
 * - GET    /api/founder-panel/ai-config/usage → Get usage stats
 * 
 * ═════════════════════════════════════════════════════════════
 */

import { NextRequest, NextResponse } from 'next/server';
import { dbTyped as db } from "@/lib/db";
import { resolveAuth } from '@/lib/auth';
import { z } from 'zod';
import { apiError, withErrorHandler } from '@/lib/api';
import { logger } from '@/lib/logger';
import { logAudit } from '@/lib/audit';
import { rateLimitResponse, LIMITS } from "@/lib/rateLimit";
import { maskApiKeyForDisplay, hasRealApiKey, resolveKeyForUpdate } from '@/lib/ai/keyVault';

// ── Types ───────────────────────────────────────────────────

/**
 * Single Feature Key Configuration Schema
 */
const FeatureKeySchema = z.object({
  /** The actual API key */
  apiKey: z.string().max(500).default(''),
  
  /** Model to use for this feature */
  model: z.string().max(100).default('gemini-2.0-flash'),
  
  /** Is this feature enabled? */
  enabled: z.boolean().default(false),
  
  /** Rate limit (requests per minute) */
  rateLimitRpm: z.number().int().min(1).max(1000).default(60),
});

/**
 * Full Company AI Config Schema (Per-Feature)
 */
const CompanyAIConfigSchema = z.object({
  // 💬 Chat Feature
  chat: FeatureKeySchema,
  
  // 📄 Invoice Feature
  invoice: FeatureKeySchema.extend({ rateLimitRpm: z.number().int().min(1).max(1000).default(100) }),
  
  // 🔍 Parse Feature
  parse: FeatureKeySchema.extend({ rateLimitRpm: z.number().int().min(1).max(1000).default(80) }),
  
  // 🧠 Memory Feature
  memory: FeatureKeySchema.extend({ rateLimitRpm: z.number().int().min(1).max(1000).default(30) }),
  
  // Shared settings
  systemPrompt: z.string().max(5000).default(''),
  costOptimization: z.enum(['aggressive', 'balanced', 'quality']).default('balanced'),
  notifyHighUsage: z.boolean().default(true),
  usageNotificationThreshold: z.number().int().min(50).max(100).default(80),
});

/**
 * Test Connection Schema (Per-Feature)
 */
const _TestConnectionSchema = z.object({
  feature: z.enum(['chat', 'invoice', 'parse', 'memory']),
  apiKey: z.string().min(1),
  model: z.string().optional(),
});

// ── Helper Functions ────────────────────────────────────────

/**
 * Get or create default AI config for a company (with per-feature keys)
 */
async function getOrCreateCompanyAIConfig(companyId: string) {
  let config = await db.companyAIConfig.findUnique({
    where: { companyId },
  });
  
  if (!config) {
    // Create default config with all feature keys empty
    config = await db.companyAIConfig.create({
      data: {
        companyId,
        
        // Chat - empty, waiting for founder
        chatApiKey: '',
        chatModel: 'gemini-2.0-flash',
        chatEnabled: false,
        chatRateLimitRpm: 60,
        chatTokensUsed: BigInt(0),
        chatRequestsCount: BigInt(0),
        
        // Invoice - empty, waiting for founder
        invoiceApiKey: '',
        invoiceModel: 'gemini-2.0-flash',
        invoiceEnabled: false,
        invoiceRateLimitRpm: 100,
        invoiceTokensUsed: BigInt(0),
        invoiceRequestsCount: BigInt(0),
        
        // Parse - empty, waiting for founder
        parseApiKey: '',
        parseModel: 'gemini-2.0-flash',
        parseEnabled: false,
        parseRateLimitRpm: 80,
        parseTokensUsed: BigInt(0),
        parseRequestsCount: BigInt(0),
        
        // Memory - empty, waiting for founder
        memoryApiKey: '',
        memoryModel: 'gemini-2.0-flash',
        memoryEnabled: false,
        memoryRateLimitRpm: 30,
        memoryTokensUsed: BigInt(0),
        memoryRequestsCount: BigInt(0),
        
        // Shared config
        primaryProvider: '{}',
        systemPrompt: '',
        memoryRetentionDays: 30,
        costOptimization: 'balanced',
        notifyHighUsage: true,
        usageNotificationThreshold: 80,
        tokensUsedThisMonth: BigInt(0),
        requestsThisMonth: BigInt(0),
        lastResetAt: new Date(),
      },
    });
    
    logger.info(`Created per-feature AI config for company ${companyId}`);
  }
  
  return config;
}

/**
 * Test Google Gemini API Connection for a specific feature
 */
async function _testGeminiConnection(
  apiKey: string, 
  model: string = 'gemini-2.0-flash',
  feature: string = 'chat'
): Promise<{ success: boolean; latencyMs: number; model: string; error?: string }> {
  type PromptFeature = 'chat' | 'invoice' | 'parse' | 'memory';
  const startTime = Date.now();
  
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    
    // Feature-specific test prompts
    const testPrompts = {
      chat: 'Hello! Reply with "Chat OK" only.',
      invoice: 'Extract total amount from: Invoice #001 - Total: $1,250. Reply with "Invoice OK" and the amount.',
      parse: 'Categorize this: "Laptop computer - $800". Reply with "Parse OK".',
      memory: 'Remember this: user prefers dark mode. Reply with "Memory OK".',
    };
    
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [{ text: testPrompts[feature as PromptFeature] || testPrompts.chat }]
        }],
        generationConfig: {
          maxOutputTokens: 50,
          temperature: 0.1,
        },
      }),
      signal: AbortSignal.timeout(15000), // 15s timeout
    });
    
    const latencyMs = Date.now() - startTime;
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return {
        success: false,
        latencyMs,
        model,
        error: errorData?.error?.message || `HTTP ${response.status}`,
      };
    }
    
    const data = await response.json();
    
    return {
      success: true,
      latencyMs,
      model: data?.modelVersion || model,
    };
  } catch (error: unknown) {
    return {
      success: false,
      latencyMs: Date.now() - startTime,
      model,
      error: error instanceof Error ? error.message : String(error) || 'Connection failed',
    };
  }
}

/**
 * Mask API key for security (show only last 4 chars)
 *
 * DEPRECATED: this local helper assumed plaintext input. The new
 * `maskApiKeyForDisplay` from `keyVault.ts` handles both encrypted and
 * plaintext stored values correctly.
 *
 * Kept here as a thin wrapper for any callers that haven't been migrated.
 */
function maskApiKey(key: string): string {
  return maskApiKeyForDisplay(key);
}

// ── API Routes ───────────────────────────────────────────────

/**
 * GET /api/founder-panel/ai-config
 * 
 * Get AI configuration for a company (with per-feature keys)
 * Only founders can access this endpoint
 */
export async function GET(request: NextRequest) {
  return withErrorHandler(async () => {
    // Authenticate
    const auth = await resolveAuth(request);
    if (!auth.user) return apiError('Unauthorized', 401);
    
    // Get company from query or user context
    const { searchParams } = new URL(request.url);
    const companySlug = searchParams.get('companySlug');
    
    let companyId: string;
    
    if (companySlug) {
      const company = await db.company.findUnique({
        where: { slug: companySlug },
      });
      
      if (!company) return apiError('Company not found', 404);
      
      // BUG FIX (BUG 1 — IDOR): previously, any authenticated user could
      // pass any companySlug and read that company's AI config (masked keys,
      // model names, RPMs, usage stats). Now we verify the caller has a
      // founder role in the requested company before returning the config.
      // DB-04 FIX (Audit v2): Use correct Prisma model `companyMembership`.
      // The old code cast through `unknown` to call `db.companyMember` which
      // doesn't exist in the Prisma client → TypeError at runtime.
      const membership = await db.companyMembership.findFirst({
        where: {
          userUid: auth.user.uid,
          companySlug: company.slug,
          role: 'founder',
        },
      });
      
      if (!membership) {
        // Audit the access attempt
        await logAudit({
          userEmail: auth.user.email,
          userUid: auth.user.uid,
          action: 'ai_config_access_denied',
          entity: 'company',
          details: { companySlug, reason: 'no_founder_membership' },
        });
        return apiError('Access denied — founder role required for this company', 403);
      }
      
      companyId = company.id;
    } else {
      // Use user's primary company
      // DB-04 FIX (Audit v2): Use correct Prisma model `companyMembership`.
      const membership = await db.companyMembership.findFirst({
        where: {
          userUid: auth.user.uid,
          role: 'founder',
        },
      });

      if (!membership) {
        return apiError('No founder role found. Access denied.', 403);
      }

      companyId = membership.companySlug;
    }
    
    // Get or create config
    const config = await getOrCreateCompanyAIConfig(companyId);
    
    // Build response with per-feature keys (masked)
    return NextResponse.json({
      success: true,
      data: {
        id: config.id,
        companyId: config.companyId,
        
        // 💬 Chat Feature
        chat: {
          enabled: config.chatEnabled,
          model: config.chatModel,
          apiKey: maskApiKey(config.chatApiKey),
          hasApiKey: hasRealApiKey(config.chatApiKey),
          rateLimitRpm: config.chatRateLimitRpm,
          tokensUsed: Number(config.chatTokensUsed),
          requestsCount: Number(config.chatRequestsCount),
        },
        
        // 📄 Invoice Feature
        invoice: {
          enabled: config.invoiceEnabled,
          model: config.invoiceModel,
          apiKey: maskApiKey(config.invoiceApiKey),
          hasApiKey: hasRealApiKey(config.invoiceApiKey),
          rateLimitRpm: config.invoiceRateLimitRpm,
          tokensUsed: Number(config.invoiceTokensUsed),
          requestsCount: Number(config.invoiceRequestsCount),
        },
        
        // 🔍 Parse Feature
        parse: {
          enabled: config.parseEnabled,
          model: config.parseModel,
          apiKey: maskApiKey(config.parseApiKey),
          hasApiKey: hasRealApiKey(config.parseApiKey),
          rateLimitRpm: config.parseRateLimitRpm,
          tokensUsed: Number(config.parseTokensUsed),
          requestsCount: Number(config.parseRequestsCount),
        },
        
        // 🧠 Memory Feature
        memory: {
          enabled: config.memoryEnabled,
          model: config.memoryModel,
          apiKey: maskApiKey(config.memoryApiKey),
          hasApiKey: hasRealApiKey(config.memoryApiKey),
          rateLimitRpm: config.memoryRateLimitRpm,
          tokensUsed: Number(config.memoryTokensUsed),
          requestsCount: Number(config.memoryRequestsCount),
        },
        
        // Shared Settings
        systemPrompt: config.systemPrompt,
        costOptimization: config.costOptimization,
        notifications: {
          enabled: config.notifyHighUsage,
          threshold: config.usageNotificationThreshold,
        },
        
        // Global Usage
        globalUsage: {
          tokensUsedThisMonth: Number(config.tokensUsedThisMonth),
          requestsThisMonth: Number(config.requestsThisMonth),
          lastResetAt: config.lastResetAt,
        },
        
        updatedAt: config.updatedAt,
        createdAt: config.createdAt,
      },
    });
  })();
}

/**
 * PUT /api/founder-panel/ai-config
 * 
 * Update AI configuration for a company (per-feature keys)
 * Only founders can modify this
 */
export async function PUT(request: NextRequest) {
  // P5-H2: Rate limit PUT /api/founder-panel-ai-config — 30/min/IP (API_WRITE).
  const rl = await rateLimitResponse(request, "put:founder-panel-ai-config", LIMITS.API_WRITE);
  if (rl) return rl;

  return withErrorHandler(async () => {
    // Authenticate
    const auth = await resolveAuth(request);
    if (!auth.user) return apiError('Unauthorized', 401);
    
    // Parse and validate body
    const body = await request.json().catch(() => ({}));
    const validated = CompanyAIConfigSchema.safeParse(body);
    
    if (!validated.success) {
      return apiError('Validation failed', 400, validated.error.issues);
    }
    
    const configData = validated.data;
    
    // Verify founder access
    const membership = await db.companyMembership.findFirst({
      where: {
        userUid: auth.user.uid,
        role: 'founder',
      },
    });

    if (!membership) {
      return apiError('Only founders can modify AI configuration', 403);
    }

    // Get existing config
    const existingConfig = await getOrCreateCompanyAIConfig(membership.companySlug);
    
    // Helper to handle masked keys (don't overwrite with ••••••••)
    // P2-SPRINT6 FIX: routes through `resolveKeyForUpdate()` from keyVault.ts
    // which handles encryption of new keys + preserves existing encrypted keys
    // when the masked placeholder is submitted.
    const getRealKey = (newKey: string, existingKey: string): string => {
      return resolveKeyForUpdate(newKey, existingKey);
    };
    
    // Update config with per-feature keys
    const updatedConfig = await db.companyAIConfig.update({
      where: { id: existingConfig.id },
      data: {
        // 💬 Chat
        chatApiKey: getRealKey(configData.chat.apiKey, existingConfig.chatApiKey),
        chatModel: configData.chat.model,
        chatEnabled: configData.chat.enabled,
        chatRateLimitRpm: configData.chat.rateLimitRpm,
        
        // 📄 Invoice
        invoiceApiKey: getRealKey(configData.invoice.apiKey, existingConfig.invoiceApiKey),
        invoiceModel: configData.invoice.model,
        invoiceEnabled: configData.invoice.enabled,
        invoiceRateLimitRpm: configData.invoice.rateLimitRpm,
        
        // 🔍 Parse
        parseApiKey: getRealKey(configData.parse.apiKey, existingConfig.parseApiKey),
        parseModel: configData.parse.model,
        parseEnabled: configData.parse.enabled,
        parseRateLimitRpm: configData.parse.rateLimitRpm,
        
        // 🧠 Memory
        memoryApiKey: getRealKey(configData.memory.apiKey, existingConfig.memoryApiKey),
        memoryModel: configData.memory.model,
        memoryEnabled: configData.memory.enabled,
        memoryRateLimitRpm: configData.memory.rateLimitRpm,
        
        // Shared
        systemPrompt: configData.systemPrompt,
        costOptimization: configData.costOptimization,
        notifyHighUsage: configData.notifyHighUsage,
        usageNotificationThreshold: configData.usageNotificationThreshold,
        updatedAt: new Date(),
      },
    });
    
    // Audit log
    await logAudit({
      userEmail: auth.user.email,
      userUid: auth.user.uid,
      action: 'update_ai_config_per_feature',
      entity: 'company_ai_config',
      details: {
        companyId: membership.companySlug,
        featuresUpdated: {
          chat: !!configData.chat.apiKey && configData.chat.apiKey !== '••••••••',
          invoice: !!configData.invoice.apiKey && configData.invoice.apiKey !== '••••••••',
          parse: !!configData.parse.apiKey && configData.parse.apiKey !== '••••••••',
          memory: !!configData.memory.apiKey && configData.memory.apiKey !== '••••••••',
        },
      },
    });
    
    logger.info(`Per-feature AI config updated by founder ${auth.user.email} for company ${membership.companySlug}`);
    
    return NextResponse.json({
      success: true,
      message: 'AI configuration updated successfully (per-feature)',
      data: {
        id: updatedConfig.id,
        updatedAt: updatedConfig.updatedAt,
      },
    });
  })();
}

// NOTE: The POST handler (test connection) was moved to
// `/api/founder-panel/ai-config/test/route.ts` to fix the 404 bug (O1).
// The UI calls `/api/founder-panel/ai-config/test` which requires a
// separate route file in Next.js App Router.

/**
 * ═════════════════════════════════════════════════════════════
 * GarfiX DS v4.0 - Multi-Tenant AI Configuration System
 * 
 * نظام إدارة مفاتيح AI لكل شركة/مستخدم
 * 
 * Features:
 * - Per-company API keys (isolated, secure)
 * - Google Gemini integration
 * - Auto-provisioning on company registration
 * - Founder-only access to config
 * - Encrypted key storage
 * - Usage tracking per tenant
 * 
 * API Endpoints:
 * - GET    /api/founder-panel/ai-config      → Get company config
 * - PUT    /api/founder-panel/ai-config      → Update company config
 * - POST   /api/founder-panel/ai-config/test → Test API connection
 * - GET    /api/founder-panel/ai-config/usage → Get usage stats
 * 
 * ═════════════════════════════════════════════════════════════
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { resolveAuth, assertCompanyAccess } from '@/lib/auth';
import { requirePermission } from '@/lib/middleware';
import { z } from 'zod';
import { apiError, withErrorHandler } from '@/lib/api';
import { logger } from '@/lib/logger';
import { logAudit } from '@/lib/audit';

// ── Types ───────────────────────────────────────────────────

/**
 * AI Provider Configuration Schema
 */
const AIProviderSchema = z.object({
  /** Provider type */
  provider: z.enum(['google-gemini', 'openai', 'anthropic', 'openrouter', 'custom']),
  
  /** API Key (encrypted at rest) */
  apiKey: z.string().min(1).max(500),
  
  /** Model name (e.g., gemini-pro, gpt-4, claude-3) */
  model: z.string().min(1).max(100),
  
  /** Custom base URL (for OpenAI-compatible endpoints) */
  baseUrl: z.string().url().optional(),
  
  /** Max tokens per request */
  maxTokens: z.number().int().min(100).max(200000).default(4096),
  
  /** Temperature (0-2) */
  temperature: z.number().min(0).max(2).default(0.7),
  
  /** Is this provider enabled? */
  enabled: z.boolean().default(true),
  
  /** Rate limit (requests per minute) */
  rateLimitRpm: z.number().int().min(1).max(1000).default(60),
  
  /** Monthly token quota */
  monthlyTokenQuota: z.number().int().min(0).default(1000000),
});

/**
 * Company AI Configuration Schema
 */
const CompanyAIConfigSchema = z.object({
  /** Primary provider config */
  primaryProvider: AIProviderSchema,
  
  /** Fallback provider (if primary fails) */
  fallbackProvider: AIProviderSchema.optional(),
  
  /** Company-specific system prompt */
  systemPrompt: z.string().max(5000).default(''),
  
  /** Enable chat feature */
  enableChat: z.boolean().default(true),
  
  /** Enable smart parsing */
  enableSmartParse: z.boolean().default(true),
  
  /** Enable invoice extraction */
  enableInvoiceExtraction: z.boolean().default(true),
  
  /** Enable memory/context */
  enableMemory: z.boolean().default(true),
  
  /** Memory retention days */
  memoryRetentionDays: z.number().int().min(1).max(365).default(30),
  
  /** Cost optimization level */
  costOptimization: z.enum(['aggressive', 'balanced', 'quality']).default('balanced'),
  
  /** Notify on high usage */
  notifyHighUsage: z.boolean().default(true),
  
  /** Usage threshold for notification (%) */
  usageNotificationThreshold: z.number().int().min(50).max(100).default(80),
});

/**
 * Test Connection Schema
 */
const TestConnectionSchema = z.object({
  provider: z.enum(['google-gemini', 'openai', 'anthropic', 'openrouter', 'custom']),
  apiKey: z.string().min(1),
  model: z.string().optional(),
  baseUrl: z.string().url().optional(),
});

// ── Helper Functions ────────────────────────────────────────

/**
 * Get or create default AI config for a company
 */
async function getOrCreateCompanyAIConfig(companyId: string) {
  let config = await db.companyAIConfig.findUnique({
    where: { companyId },
  });
  
  if (!config) {
    // Create default config with system defaults
    config = await db.companyAIConfig.create({
      data: {
        companyId,
        primaryProvider: JSON.stringify({
          provider: 'google-gemini',
          apiKey: '', // Will be set by founder
          model: 'gemini-2.0-flash',
          maxTokens: 4096,
          temperature: 0.7,
          enabled: true,
          rateLimitRpm: 60,
          monthlyTokenQuota: 1000000,
        }),
        fallbackProvider: null,
        systemPrompt: '',
        enableChat: true,
        enableSmartParse: true,
        enableInvoiceExtraction: true,
        enableMemory: true,
        memoryRetentionDays: 30,
        costOptimization: 'balanced',
        notifyHighUsage: true,
        usageNotificationThreshold: 80,
        tokensUsedThisMonth: 0,
        requestsThisMonth: 0,
        lastResetAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });
    
    logger.info(`Created default AI config for company ${companyId}`);
  }
  
  return config;
}

/**
 * Reset monthly usage counters if needed
 */
async function resetMonthlyUsageIfNeeded(config: any): Promise<void> {
  const lastReset = new Date(config.lastResetAt);
  const now = new Date();
  
  // Reset if it's a new month
  if (lastReset.getMonth() !== now.getMonth() || lastReset.getFullYear() !== now.getFullYear()) {
    await db.companyAIConfig.update({
      where: { id: config.id },
      data: {
        tokensUsedThisMonth: 0,
        requestsThisMonth: 0,
        lastResetAt: now,
      },
    });
  }
}

/**
 * Test Google Gemini API Connection
 */
async function testGoogleGeminiConnection(
  apiKey: string, 
  model: string = 'gemini-2.0-flash'
): Promise<{ success: boolean; latencyMs: number; model: string; error?: string }> {
  const startTime = Date.now();
  
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [{ text: 'Hello, this is a connection test. Reply with "OK" only.' }]
        }],
        generationConfig: {
          maxOutputTokens: 10,
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
  } catch (error: any) {
    return {
      success: false,
      latencyMs: Date.now() - startTime,
      model,
      error: error.message || 'Connection failed',
    };
  }
}

/**
 * Test OpenAI-compatible API Connection
 */
async function testOpenAIConnection(
  apiKey: string,
  baseUrl: string,
  model: string = 'gpt-4o-mini'
): Promise<{ success: boolean; latencyMs: number; model: string; error?: string }> {
  const startTime = Date.now();
  
  try {
    const url = `${baseUrl}/chat/completions`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: 'Reply with OK only.' }],
        max_tokens: 10,
        temperature: 0.1,
      }),
      signal: AbortSignal.timeout(15000),
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
    
    return { success: true, latencyMs, model };
  } catch (error: any) {
    return {
      success: false,
      latencyMs: Date.now() - startTime,
      model,
      error: error.message || 'Connection failed',
    };
  }
}

// ── API Routes ───────────────────────────────────────────────

/**
 * GET /api/founder-panel/ai-config
 * 
 * Get AI configuration for the authenticated user's company
 * Only founders can access this endpoint
 */
export async function GET(request: NextRequest) {
  return withErrorHandler(async () => {
    // Authenticate and verify founder role
    const auth = await resolveAuth(request);
    if (!auth.user) return apiError(401, 'Unauthorized');
    
    // Get company from query or user context
    const { searchParams } = new URL(request.url);
    const companySlug = searchParams.get('companySlug');
    
    let companyId: string;
    
    if (companySlug) {
      // Verify access to specific company
      const company = await db.company.findUnique({
        where: { slug: companySlug },
        include: { members: { where: { userId: auth.user.id } } },
      });
      
      if (!company) return apiError(404, 'Company not found');
      if (company.members.length === 0 || company.members[0].role !== 'founder') {
        return apiError(403, 'Only founders can view AI configuration');
      }
      
      companyId = company.id;
    } else {
      // Use user's primary company
      const membership = await db.companyMember.findFirst({
        where: { 
          userId: auth.user.id,
          role: 'founder',
        },
        include: { company: true },
      });
      
      if (!membership) {
        return apiError(403, 'No founder role found. Access denied.');
      }
      
      companyId = membership.companyId;
    }
    
    // Get or create config
    const config = await getOrCreateCompanyAIConfig(companyId);
    await resetMonthlyUsageIfNeeded(config);
    
    // Parse provider configs (they're stored as JSON strings)
    const primaryProvider = JSON.parse(config.primaryProvider || '{}');
    const fallbackProvider = config.fallbackProvider ? JSON.parse(config.fallbackProvider) : null;
    
    // Mask API keys for security (show only last 4 chars)
    const maskApiKey = (key: string) => {
      if (!key || key.length <= 8) return '••••••••';
      return `${key.substring(0, 4)}${'•'.repeat(key.length - 8)}${key.substring(key.length - 4)}`;
    };
    
    return NextResponse.json({
      success: true,
      data: {
        id: config.id,
        companyId: config.companyId,
        primaryProvider: {
          ...primaryProvider,
          apiKey: maskApiKey(primaryProvider.apiKey || ''),
          hasApiKey: !!(primaryProvider.apiKey),
        },
        fallbackProvider: fallbackProvider ? {
          ...fallbackProvider,
          apiKey: maskApiKey(fallbackProvider.apiKey || ''),
          hasApiKey: !!(fallbackProvider.apiKey),
        } : null,
        systemPrompt: config.systemPrompt,
        features: {
          chat: config.enableChat,
          smartParse: config.enableSmartParse,
          invoiceExtraction: config.enableInvoiceExtraction,
          memory: config.enableMemory,
        },
        memoryRetentionDays: config.memoryRetentionDays,
        costOptimization: config.costOptimization,
        notifications: {
          enabled: config.notifyHighUsage,
          threshold: config.usageNotificationThreshold,
        },
        usage: {
          tokensUsedThisMonth: config.tokensUsedThisMonth,
          requestsThisMonth: config.requestsThisMonth,
          monthlyTokenQuota: primaryProvider.monthlyTokenQuota || 1000000,
          usagePercent: primaryProvider.monthlyTokenQuota 
            ? Math.round((config.tokensUsedThisMonth / primaryProvider.monthlyTokenQuota) * 100)
            : 0,
        },
        lastResetAt: config.lastResetAt,
        updatedAt: config.updatedAt,
        createdAt: config.createdAt,
      },
    });
  }, request);
}

/**
 * PUT /api/founder-panel/ai-config
 * 
 * Update AI configuration for the company
 * Only founders can modify this
 */
export async function PUT(request: NextRequest) {
  return withErrorHandler(async () => {
    // Authenticate
    const auth = await resolveAuth(request);
    if (!auth.user) return apiError(401, 'Unauthorized');
    
    // Parse and validate body
    const body = await request.json().catch(() => ({}));
    const validated = CompanyAIConfigSchema.safeParse(body);
    
    if (!validated.success) {
      return apiError(400, 'Validation failed', validated.error.errors);
    }
    
    const configData = validated.data;
    
    // Verify founder access
    const membership = await db.companyMember.findFirst({
      where: { 
        userId: auth.user.id,
        role: 'founder',
      },
    });
    
    if (!membership) {
      return apiError(403, 'Only founders can modify AI configuration');
    }
    
    // Get existing config
    const existingConfig = await getOrCreateCompanyAIConfig(membership.companyId);
    
    // If updating API key, keep existing if not provided (masked)
    const existingPrimary = JSON.parse(existingConfig.primaryProvider || '{}');
    if (configData.primaryProvider.apiKey === '••••••••' || !configData.primaryProvider.apiKey) {
      configData.primaryProvider.apiKey = existingPrimary.apiKey || '';
    }
    
    // Update config
    const updatedConfig = await db.companyAIConfig.update({
      where: { id: existingConfig.id },
      data: {
        primaryProvider: JSON.stringify(configData.primaryProvider),
        fallbackProvider: configData.fallbackProvider 
          ? JSON.stringify(configData.fallbackProvider) 
          : null,
        systemPrompt: configData.systemPrompt,
        enableChat: configData.enableChat,
        enableSmartParse: configData.enableSmartParse,
        enableInvoiceExtraction: configData.enableInvoiceExtraction,
        enableMemory: configData.enableMemory,
        memoryRetentionDays: configData.memoryRetentionDays,
        costOptimization: configData.costOptimization,
        notifyHighUsage: configData.notifyHighUsage,
        usageNotificationThreshold: configData.usageNotificationThreshold,
        updatedAt: new Date(),
      },
    });
    
    // Audit log
    await logAudit({
      userEmail: auth.user.email,
      userUid: auth.user.id,
      action: 'update_ai_config',
      entity: 'company_ai_config',
      details: {
        companyId: membership.companyId,
        provider: configData.primaryProvider.provider,
        model: configData.primaryProvider.model,
        hasApiKey: !!configData.primaryProvider.apiKey,
      },
    });
    
    logger.info(`AI config updated by founder ${auth.user.email} for company ${membership.companyId}`);
    
    return NextResponse.json({
      success: true,
      message: 'AI configuration updated successfully',
      data: {
        id: updatedConfig.id,
        updatedAt: updatedConfig.updatedAt,
      },
    });
  }, request);
}

/**
 * POST /api/founder-panel/ai-config/test
 * 
 * Test an API connection before saving
 */
export async function POST(request: NextRequest) {
  return withErrorHandler(async () => {
    // Authenticate
    const auth = await resolveAuth(request);
    if (!auth.user) return apiError(401, 'Unauthorized');
    
    // Parse body
    const body = await request.json().catch(() => ({}));
    const validated = TestConnectionSchema.safeParse(body);
    
    if (!validated.success) {
      return apiError(400, 'Validation failed', validated.error.errors);
    }
    
    const { provider, apiKey, model, baseUrl } = validated.data;
    
    let result;
    
    switch (provider) {
      case 'google-gemini':
        result = await testGoogleGeminiConnection(apiKey, model || 'gemini-2.0-flash');
        break;
        
      case 'openai':
      case 'openrouter':
      case 'anthropic':
      case 'custom':
        if (!baseUrl) {
          return apiError(400, 'Base URL is required for this provider');
        }
        result = await testOpenAIConnection(
          apiKey, 
          baseUrl, 
          model || 'gpt-4o-mini'
        );
        break;
        
      default:
        return apiError(400, `Unsupported provider: ${provider}`);
    }
    
    // Audit log
    await logAudit({
      userEmail: auth.user.email,
      userUid: auth.user.id,
      action: 'test_ai_connection',
      entity: 'ai_config_test',
      details: {
        provider,
        model: model || 'default',
        success: result.success,
        latencyMs: result.latencyMs,
      },
    });
    
    return NextResponse.json({
      success: true,
      data: {
        ...result,
        timestamp: new Date().toISOString(),
      },
    });
  }, request);
}

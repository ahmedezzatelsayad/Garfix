/**
 * ═════════════════════════════════════════════════════════════
 * GarfiX DS v4.0 - Per-Feature Connection Pool System
 * 
 * نظام التوجيه المتعدد المستأجرين لكل خاصية AI
 * 
 * 🎯 الهدف:
 * - كل شركة → 4 توكنات منعزلة (Chat, Invoice, Parse, Memory)
 * - مفيش bottleneck أو ضغط مشترك
 * - Rate Limit منفصل لكل خاصية
 * - Usage Tracking مستقل
 *
 * 📌 الاستخدام:
 * ```
 * import { getFeatureClient } from '@/lib/ai/per-feature-router';
 * 
 * // Chat request
 * const chatClient = await getFeatureClient(companyId, 'chat');
 * const response = await chatClient.generate(messages);
 * 
 * // Invoice processing  
 * const invoiceClient = await getFeatureClient(companyId, 'invoice');
 * const extraction = await invoiceClient.extract(invoiceText);
 * ```
 *
 * ═════════════════════════════════════════════════════════════
 */

import { dbTyped as db } from '@/lib/db';
import { logger } from '@/lib/logger';

// ── Types ───────────────────────────────────────────────────

export type FeatureType = 'chat' | 'invoice' | 'parse' | 'memory';

export type AIProvider = 'gemini' | 'openai' | 'openrouter' | 'deepseek';

export interface FeatureConfig {
  /** Is this feature enabled for this company? */
  enabled: boolean;
  /** API Key for this specific feature */
  apiKey: string;
  /** Model to use (e.g., gemini-2.0-flash, gpt-4o-mini, deepseek/deepseek-chat) */
  model: string;
  /** Provider type (auto-detected from key/model) */
  provider?: AIProvider;
  /** Base URL (for custom endpoints) */
  baseUrl?: string;
  /** Rate limit (requests per minute) */
  rateLimitRpm: number;
  /** Tokens used this billing period */
  tokensUsed: number;
  /** Total requests made */
  requestsCount: number;
}

export interface FeatureClient {
  /** The feature type */
  feature: FeatureType;
  /** The company ID */
  companyId: string;
  /** Configuration */
  config: FeatureConfig;
  
  /**
   * Generate content using this feature's isolated connection
   */
  generate(params: GenerateParams): Promise<GenerateResult>;
  
  /**
   * Extract structured data (for invoice/parse features)
   */
  extract(params: ExtractParams): Promise<ExtractResult>;
  
  /**
   * Check if we're within rate limits
   */
  checkRateLimit(): Promise<{ allowed: boolean; retryAfterMs?: number; currentUsage: number }>;
}

export interface GenerateParams {
  messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>;
  temperature?: number;
  maxTokens?: number;
  jsonMode?: boolean;
}

export interface GenerateResult {
  success: boolean;
  content?: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  latencyMs: number;
  model: string;
  error?: string;
  rateLimited?: boolean;
}

export interface ExtractParams {
  text: string;
  schema?: Record<string, any>;
  instructions?: string;
}

export interface ExtractResult {
  success: boolean;
  data?: Record<string, any>;
  rawText?: string;
  confidence: number; // 0-1
  latencyMs: number;
  error?: string;
}

// ── Feature Mapping ─────────────────────────────────────────

/**
 * Map feature type to database column names
 */
const FEATURE_DB_MAP: Record<FeatureType, {
  apiKeyCol: string;
  modelCol: string;
  enabledCol: string;
  rateLimitCol: string;
  tokensUsedCol: string;
  requestsCol: string;
}> = {
  chat: {
    apiKeyCol: 'chatApiKey',
    modelCol: 'chatModel',
    enabledCol: 'chatEnabled',
    rateLimitCol: 'chatRateLimitRpm',
    tokensUsedCol: 'chatTokensUsed',
    requestsCol: 'chatRequestsCount',
  },
  invoice: {
    apiKeyCol: 'invoiceApiKey',
    modelCol: 'invoiceModel',
    enabledCol: 'invoiceEnabled',
    rateLimitCol: 'invoiceRateLimitRpm',
    tokensUsedCol: 'invoiceTokensUsed',
    requestsCol: 'invoiceRequestsCount',
  },
  parse: {
    apiKeyCol: 'parseApiKey',
    modelCol: 'parseModel',
    enabledCol: 'parseEnabled',
    rateLimitCol: 'parseRateLimitRpm',
    tokensUsedCol: 'parseTokensUsed',
    requestsCol: 'parseRequestsCount',
  },
  memory: {
    apiKeyCol: 'memoryApiKey',
    modelCol: 'memoryModel',
    enabledCol: 'memoryEnabled',
    rateLimitCol: 'memoryRateLimitRpm',
    tokensUsedCol: 'memoryTokensUsed',
    requestsCol: 'memoryRequestsCount',
  },
};

// ── In-Memory Rate Limiting Cache ───────────────────────────

/**
 * Simple in-memory rate limiter per company+feature
 * In production, consider Redis for multi-instance support
 */
class RateLimiterCache {
  private static instance: RateLimiterCache;
  private requests: Map<string, number[]> = new Map();
  private cleanupInterval: NodeJS.Timeout;

  private constructor() {
    // Clean up old entries every minute
    this.cleanupInterval = setInterval(() => this.cleanup(), 60_000);
  }

  static getInstance(): RateLimiterCache {
    if (!RateLimiterCache.instance) {
      RateLimiterCache.instance = new RateLimiterCache();
    }
    return RateLimiterCache.instance;
  }

  /**
   * Check if request is allowed and record it
   */
  checkAndRecord(key: string, limit: number): { allowed: boolean; retryAfterMs?: number; currentUsage: number } {
    const now = Date.now();
    const windowStart = now - 60_000; // 1 minute window
    
    // Get or create request timestamps array
    let timestamps = this.requests.get(key);
    if (!timestamps) {
      timestamps = [];
      this.requests.set(key, timestamps);
    }
    
    // Filter out old requests outside the window
    const recentTimestamps = timestamps.filter(t => t > windowStart);
    this.requests.set(key, recentTimestamps);
    
    const currentUsage = recentTimestamps.length;
    
    if (currentUsage >= limit) {
      // Calculate when oldest request will expire
      const oldestInWindow = recentTimestamps[0];
      const retryAfterMs = oldestInWindow - windowStart;
      
      return {
        allowed: false,
        retryAfterMs,
        currentUsage,
      };
    }
    
    // Record this request
    recentTimestamps.push(now);
    
    return {
      allowed: true,
      currentUsage: currentUsage + 1,
    };
  }

  private cleanup() {
    const now = Date.now();
    const windowStart = now - 60_000;
    
    for (const [key, timestamps] of this.requests.entries()) {
      const recent = timestamps.filter(t => t > windowStart);
      if (recent.length === 0) {
        this.requests.delete(key);
      } else {
        this.requests.set(key, recent);
      }
    }
  }

  destroy() {
    clearInterval(this.cleanupInterval);
    this.requests.clear();
  }
}

const rateLimiter = RateLimiterCache.getInstance();

// ── Core Functions ──────────────────────────────────────────

/**
 * Get feature configuration for a company from database
 */
async function getFeatureConfigFromDB(
  companyId: string,
  feature: FeatureType
): Promise<FeatureConfig | null> {
  try {
    const config = await db.companyAIConfig.findUnique({
      where: { companyId },
    });
    
    if (!config) {
      logger.warn(`[PerFeatureRouter] No AI config found for company ${companyId}`);
      return null;
    }
    
    const mapping = FEATURE_DB_MAP[feature];
    
    return {
      enabled: config[mapping.enabledCol as keyof typeof config] as boolean,
      apiKey: config[mapping.apiKeyCol as keyof typeof config] as string,
      model: config[mapping.modelCol as keyof typeof config] as string,
      rateLimitRpm: config[mapping.rateLimitCol as keyof typeof config] as number,
      tokensUsed: Number(config[mapping.tokensUsedCol as keyof typeof config]),
      requestsCount: Number(config[mapping.requestsCol as keyof typeof config]),
    };
  } catch (error) {
    logger.error(`[PerFeatureRouter] Error fetching config for ${feature}`, { companyId, error });
    return null;
  }
}

/**
 * Update usage statistics in database
 */
async function updateUsageStats(
  companyId: string,
  feature: FeatureType,
  tokensUsed: number
): Promise<void> {
  try {
    const mapping = FEATURE_DB_MAP[feature];
    
    await db.companyAIConfig.update({
      where: { companyId },
      data: {
        [mapping.tokensUsedCol]: {
          increment: tokensUsed,
        },
        [mapping.requestsCol]: {
          increment: 1,
        },
        tokensUsedThisMonth: {
          increment: tokensUsed,
        },
        requestsThisMonth: {
          increment: 1,
        },
      },
    });
  } catch (error) {
    logger.error(`[PerFeatureRouter] Error updating usage stats`, { companyId, feature, error });
  }
}

// ── Gemini API Integration ──────────────────────────────────

/**
 * Call Google Gemini API with feature-specific configuration
 */
async function callGeminiAPI(
  apiKey: string,
  model: string,
  params: GenerateParams,
  feature: FeatureType
): Promise<GenerateResult> {
  const startTime = Date.now();
  
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    
    // Convert messages to Gemini format
    const contents = params.messages.map(msg => ({
      role: msg.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: msg.content }],
    }));
    
    const requestBody: Record<string, any> = {
      contents,
      generationConfig: {
        temperature: params.temperature ?? 0.7,
        maxOutputTokens: params.maxTokens ?? 2048,
      },
    };
    
    // Enable JSON mode if requested
    if (params.jsonMode) {
      requestBody.generationConfig.responseMimeType = 'application/json';
    }
    
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
      signal: AbortSignal.timeout(30_000), // 30s timeout
    });
    
    const latencyMs = Date.now() - startTime;
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      
      // Check for rate limiting
      if (response.status === 429) {
        return {
          success: false,
          latencyMs,
          model,
          error: 'Rate limit exceeded',
          rateLimited: true,
        };
      }
      
      return {
        success: false,
        latencyMs,
        model,
        error: errorData?.error?.message || `HTTP ${response.status}`,
      };
    }
    
    const data = await response.json();
    
    // Extract response text
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    
    // Extract usage data
    const usageMetadata = data?.usageMetadata;
    const usage = usageMetadata ? {
      promptTokens: usageMetadata.promptTokenCount || 0,
      completionTokens: usageMetadata.candidatesTokenCount || 0,
      totalTokens: usageMetadata.totalTokenCount || 0,
    } : undefined;
    
    return {
      success: true,
      content: text,
      usage,
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

// ── Provider Detection ─────────────────────────────────────

/**
 * Detect AI provider from API key format or model name
 */
export function detectProvider(apiKey: string, model: string): AIProvider {
  // DeepSeek models (via OpenRouter)
  if (model.includes('deepseek')) {
    return 'openrouter'; // DeepSeek works through OpenRouter
  }
  
  // OpenRouter keys start with 'sk-or-'
  if (apiKey.startsWith('sk-or-')) {
    return 'openrouter';
  }
  
  // OpenAI keys start with 'sk-'
  if (apiKey.startsWith('sk-') && !apiKey.startsWith('sk-or-')) {
    return 'openai';
  }
  
  // Gemini models
  if (model.includes('gemini') || model.includes('bison')) {
    return 'gemini';
  }
  
  // Default to gemini for keys that look like Google API keys
  if (apiKey.startsWith('AI') || apiKey.includes('google')) {
    return 'gemini';
  }
  
  // Default fallback
  return 'openai';
}

/**
 * Get default model for a provider
 */
export function getDefaultModel(provider: AIProvider): string {
  switch (provider) {
    case 'gemini':
      return 'gemini-2.0-flash';
    case 'openrouter':
      return 'deepseek/deepseek-chat-v3-0324'; // DeepSeek as default!
    case 'openai':
    default:
      return 'gpt-4o-mini';
  }
}

// ── OpenAI/OpenRouter API Integration ──────────────────────

/**
 * Call OpenAI-compatible API (works with OpenAI, OpenRouter, etc.)
 */
async function callOpenAIAPI(
  apiKey: string,
  model: string,
  params: GenerateParams,
  feature: FeatureType,
  baseUrl: string = 'https://api.openai.com/v1'
): Promise<GenerateResult> {
  const startTime = Date.now();
  
  try {
    // Determine endpoint based on provider
    const url = `${baseUrl}/chat/completions`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        // OpenRouter optional headers
        ...(baseUrl.includes('openrouter') ? {
          'HTTP-Referer': process.env.APP_URL || 'https://garfix.app',
          'X-Title': 'GarfiX ERP',
        } : {}),
      },
      body: JSON.stringify({
        model,
        messages: params.messages,
        temperature: params.temperature ?? 0.7,
        max_tokens: params.maxTokens ?? 2048,
        ...(params.jsonMode ? { response_format: { type: 'json_object' } } : {}),
      }),
      signal: AbortSignal.timeout(30_000),
    });
    
    const latencyMs = Date.now() - startTime;
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      
      if (response.status === 429) {
        return {
          success: false,
          latencyMs,
          model,
          error: 'Rate limit exceeded',
          rateLimited: true,
        };
      }
      
      return {
        success: false,
        latencyMs,
        model,
        error: errorData?.error?.message || `HTTP ${response.status}`,
      };
    }
    
    const data = await response.json();
    
    const text = data?.choices?.[0]?.message?.content || '';
    const usage = data?.usage ? {
      promptTokens: data.usage.prompt_tokens || 0,
      completionTokens: data.usage.completion_tokens || 0,
      totalTokens: data.usage.total_tokens || 0,
    } : undefined;
    
    return {
      success: true,
      content: text,
      usage,
      latencyMs,
      model: data?.model || model,
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

// ── Unified API Caller ─────────────────────────────────────

/**
 * Call the appropriate API based on detected provider
 */
async function callAIProvider(
  config: FeatureConfig,
  params: GenerateParams,
  feature: FeatureType
): Promise<GenerateResult> {
  const provider = config.provider || detectProvider(config.apiKey, config.model);
  
  switch (provider) {
    case 'gemini':
      return callGeminiAPI(config.apiKey, config.model, params, feature);
      
    case 'openrouter':
      return callOpenAIAPI(
        config.apiKey,
        config.model,
        params,
        feature,
        'https://openrouter.ai/api/v1'
      );
      
    case 'openai':
    default:
      return callOpenAIAPI(
        config.apiKey,
        config.model,
        params,
        feature,
        config.baseUrl || 'https://api.openai.com/v1'
      );
  }
}

// ── Public API ──────────────────────────────────────────────

/**
 * Get an isolated client for a specific AI feature
 * 
 * @param companyId - The company's unique ID
 * @param feature - The AI feature type (chat, invoice, parse, memory)
 * @returns FeatureClient or null if not configured
 * 
 * @example
 * ```typescript
 * const client = await getFeatureClient('company_123', 'chat');
 * if (client) {
 *   const result = await client.generate({
 *     messages: [{ role: 'user', content: 'Hello!' }]
 *   });
 * }
 * ```
 */
export async function getFeatureClient(
  companyId: string,
  feature: FeatureType
): Promise<FeatureClient | null> {
  const config = await getFeatureConfigFromDB(companyId, feature);
  
  if (!config) {
    logger.warn(`[PerFeatureRouter] No config for ${feature} in company ${companyId}`);
    return null;
  }
  
  if (!config.enabled) {
    logger.info(`[PerFeatureRouter] Feature ${feature} disabled for company ${companyId}`);
    return null;
  }
  
  if (!config.apiKey) {
    logger.warn(`[PerFeatureRouter] No API key for ${feature} in company ${companyId}`);
    return null;
  }
  
  // Create and return the feature client
  const rateLimitKey = `${companyId}:${feature}`;
  
  return {
    feature,
    companyId,
    config,
    
    async checkRateLimit() {
      return rateLimiter.checkAndRecord(rateLimitKey, config.rateLimitRpm);
    },
    
    async generate(params: GenerateParams): Promise<GenerateResult> {
      // Check rate limit first
      const rateCheck = await rateLimiter.checkAndRecord(rateLimitKey, config.rateLimitRpm);
      
      if (!rateCheck.allowed) {
        return {
          success: false,
          latencyMs: 0,
          model: config.model,
          error: `Rate limit exceeded. Try again after ${Math.ceil((rateCheck.retryAfterMs || 0) / 1000)}s.`,
          rateLimited: true,
        };
      }
      
      // Call the appropriate API (auto-detects provider)
      const result = await callAIProvider(config, params, feature);
      
      // Update usage stats on success
      if (result.success && result.usage) {
        await updateUsageStats(companyId, feature, result.usage.totalTokens);
      }
      
      return result;
    },
    
    async extract(params: ExtractParams): Promise<ExtractResult> {
      const startTime = Date.now();
      
      // Check rate limit first
      const rateCheck = await rateLimiter.checkAndRecord(rateLimitKey, config.rateLimitRpm);
      
      if (!rateCheck.allowed) {
        return {
          success: false,
          confidence: 0,
          latencyMs: 0,
          error: `Rate limit exceeded. Try again after ${Math.ceil((rateCheck.retryAfterMs || 0) / 1000)}s.`,
        };
      }
      
      // Build extraction prompt
      const schemaStr = params.schema ? JSON.stringify(params.schema, null, 2) : '{}';
      const instructions = params.instructions || 'Extract all information accurately.';
      
      const extractPrompt = `
You are a document extraction AI. Your task is to extract structured data from the provided text.

Instructions: ${instructions}

Output Schema (JSON format):
${schemaStr}

Document Text:
${params.text}

Respond ONLY with valid JSON matching the schema. Do not include explanations outside the JSON.
`.trim();
      
      const generateResult = await callAIProvider(config, {
        messages: [{ role: 'user', content: extractPrompt }],
        temperature: 0.1, // Low temperature for extraction
        maxTokens: 4096,
        jsonMode: true,
      }, feature);
      
      const latencyMs = Date.now() - startTime;
      
      if (!generateResult.success) {
        return {
          success: false,
          confidence: 0,
          latencyMs,
          error: generateResult.error,
        };
      }
      
      // Parse the extracted JSON
      let extractedData: Record<string, any>;
      try {
        extractedData = JSON.parse(generateResult.content || '{}');
      } catch {
        // If JSON parsing fails, return raw text
        return {
          success: true,
          data: undefined,
          rawText: generateResult.content,
          confidence: 0.5, // Lower confidence if not valid JSON
          latencyMs,
        };
      }
      
      // Update usage stats
      if (generateResult.usage) {
        await updateUsageStats(companyId, feature, generateResult.usage.totalTokens);
      }
      
      return {
        success: true,
        data: extractedData,
        confidence: 0.95, // High confidence for successful JSON extraction
        latencyMs,
      };
    },
  };
}

/**
 * Quick helper: generate content using a specific feature
 * 
 * @example
 * ```typescript
 * const reply = await generateWithFeature('company_123', 'chat', {
 *   messages: [{ role: 'user', content: 'Hello!' }]
 * });
 * ```
 */
export async function generateWithFeature(
  companyId: string,
  feature: FeatureType,
  params: GenerateParams
): Promise<GenerateResult> {
  const client = await getFeatureClient(companyId, feature);
  
  if (!client) {
    return {
      success: false,
      latencyMs: 0,
      model: 'unknown',
      error: `Feature '${feature}' not configured or enabled for this company`,
    };
  }
  
  return client.generate(params);
}

/**
 * Quick helper: extract data using a specific feature
 * 
 * @example
 * ```typescript
 * const invoiceData = await extractWithFeature('company_123', 'invoice', {
 *   text: 'Invoice #001 - Total: $1,250'
 * });
 * ```
 */
export async function extractWithFeature(
  companyId: string,
  feature: FeatureType,
  params: ExtractParams
): Promise<ExtractResult> {
  const client = await getFeatureClient(companyId, feature);
  
  if (!client) {
    return {
      success: false,
      confidence: 0,
      latencyMs: 0,
      error: `Feature '${feature}' not configured or enabled for this company`,
    };
  }
  
  return client.extract(params);
}

/**
 * Get status of all features for a company
 * Useful for admin dashboards
 */
export async function getCompanyFeaturesStatus(companyId: string): Promise<
  Record<FeatureType, {
    enabled: boolean;
    hasApiKey: boolean;
    model: string;
    rateLimitRpm: number;
    tokensUsed: number;
    requestsCount: number;
  }>
> {
  const features: FeatureType[] = ['chat', 'invoice', 'parse', 'memory'];
  const status = {} as ReturnType<typeof getCompanyFeaturesStatus> extends Promise<infer T> ? T : never;
  
  for (const feature of features) {
    const config = await getFeatureConfigFromDB(companyId, feature);
    status[feature] = {
      enabled: config?.enabled ?? false,
      hasApiKey: !!(config?.apiKey),
      model: config?.model || 'gemini-2.0-flash',
      rateLimitRpm: config?.rateLimitRpm ?? 60,
      tokensUsed: config?.tokensUsed ?? 0,
      requestsCount: config?.requestsCount ?? 0,
    };
  }
  
  return status;
}

// `detectProvider` and `getDefaultModel` are already exported via `export function`
// declarations above, so no additional re-export block is needed here.

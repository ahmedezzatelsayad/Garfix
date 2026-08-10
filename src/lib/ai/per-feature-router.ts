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
import { decryptApiKey } from './keyVault';
import { checkAndRecordRateLimit } from './valkey-rate-limiter';
import { pickPoolKey, markKeyRateLimited, recordKeyUse } from './key-pool';

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
  /** Milliseconds until the rate-limit window frees up (when rateLimited=true) */
  retryAfterMs?: number;
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
  /** True when the request was rejected by the rate limiter (not an upstream error) */
  rateLimited?: boolean;
  /** Milliseconds until the rate-limit window frees up (when rateLimited=true) */
  retryAfterMs?: number;
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

// ── Rate Limiting ───────────────────────────────────────────
//
// Rate limiting is delegated to `valkey-rate-limiter.ts`, which uses
// Valkey (Redis-compatible) for distributed counting across all app
// instances. Falls back to in-memory when Valkey is not configured
// (local dev).
//
// See: src/lib/ai/valkey-rate-limiter.ts

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
    
    const rawApiKey = config[mapping.apiKeyCol as keyof typeof config] as string;
    // Decrypt the stored API key. Returns "" if empty or decryption fails.
    // Legacy plaintext keys are returned as-is (graceful migration).
    const decryptedApiKey = decryptApiKey(rawApiKey);

    return {
      enabled: config[mapping.enabledCol as keyof typeof config] as boolean,
      apiKey: decryptedApiKey,
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
 * Detect AI provider from API key format or model name.
 *
 * Direct DeepSeek path:
 *   - DeepSeek API keys start with `sk-` but are issued by api.deepseek.com
 *   - We distinguish them from OpenAI by checking if the model name starts
 *     with `deepseek/` (without OpenRouter prefix) OR if the key was
 *     explicitly configured as a DeepSeek key in the pool.
 *   - DeepSeek's own models: `deepseek-chat`, `deepseek-reasoner`, `deepseek-coder`
 *   - OpenRouter-prefixed: `deepseek/deepseek-chat-v3-0324` (has slash)
 */
export function detectProvider(apiKey: string, model: string): AIProvider {
  // Direct DeepSeek — model starts with 'deepseek-' (no slash) OR
  // the key was issued by DeepSeek (we can't perfectly distinguish from
  // OpenAI keys, so the model name is the primary signal)
  if (model.startsWith('deepseek-') || model === 'deepseek-chat' || model === 'deepseek-reasoner') {
    return 'deepseek';
  }

  // DeepSeek models via OpenRouter (have slash prefix: 'deepseek/deepseek-...')
  if (model.includes('deepseek/') || model.startsWith('openrouter/deepseek')) {
    return 'openrouter';
  }
  
  // OpenRouter keys start with 'sk-or-'
  if (apiKey.startsWith('sk-or-')) {
    return 'openrouter';
  }
  
  // OpenAI keys start with 'sk-'
  if (apiKey.startsWith('sk-') && !apiKey.startsWith('sk-or-')) {
    // Could be OpenAI OR DeepSeek — defer to model name
    if (model.startsWith('gpt-') || model.startsWith('o1') || model.startsWith('o3')) {
      return 'openai';
    }
    // Default to deepseek for sk- keys with non-OpenAI models
    if (model.includes('deepseek')) {
      return 'deepseek';
    }
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
  
  // Default fallback — DeepSeek (cheapest + fastest for invoice parsing per founder decision 2026-08)
  return 'deepseek';
}

/**
 * Get default model for a provider
 *
 * P1 DECISION (2026-08-10): DeepSeek is the DEFAULT AI provider for GarfiX.
 *   - Invoice parsing (bulk input): deepseek-chat (cheap, fast, Arabic-fluent)
 *   - Learning / pattern recognition: deepseek-chat
 *   - Reasoning tasks (rare): deepseek-reasoner
 *   - Fallback only: Gemini Flash (when DeepSeek rate-limited)
 */
export function getDefaultModel(provider: AIProvider): string {
  switch (provider) {
    case 'gemini':
      return 'gemini-2.0-flash'; // fallback only
    case 'deepseek':
      return 'deepseek-chat'; // PRIMARY — Direct DeepSeek API (no OpenRouter intermediary)
    case 'openrouter':
      return 'deepseek/deepseek-chat-v3-0324'; // DeepSeek via OpenRouter (legacy path)
    case 'openai':
    default:
      return 'deepseek-chat'; // default to DeepSeek (was gpt-4o-mini)
  }
}

/**
 * Get the DEFAULT provider for a feature.
 *
 * P1 DECISION (2026-08-10): All features default to DeepSeek direct API.
 *   - chat:     deepseek-chat   (cheap, conversational)
 *   - invoice:  deepseek-chat   (bulk invoice parsing — primary use case)
 *   - parse:    deepseek-chat   (structured extraction)
 *   - memory:   deepseek-chat   (pattern learning)
 *
 * Fallback chain: DeepSeek → Gemini Flash → heuristic (no external call)
 */
export function getDefaultProviderForFeature(_feature: FeatureType): AIProvider {
  return 'deepseek';
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
 * Call the appropriate API based on detected provider.
 *
 * Direct DeepSeek path (new):
 *   - Routes to https://api.deepseek.com/v1/chat/completions
 *   - Same OpenAI-compatible protocol, just different base URL + key
 *   - Bypasses OpenRouter entirely → no intermediary fees, no intermediary RPM limits
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
      
    case 'deepseek':
      // Direct DeepSeek API — no OpenRouter intermediary
      return callOpenAIAPI(
        config.apiKey,
        config.model,
        params,
        feature,
        'https://api.deepseek.com/v1'
      );
      
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
  
  // If company has no key configured, try the shared pool (round-robin).
  // This implements the founder's distribution model: founder uploads N keys
  // to the pool, and companies without their own key get served from it.
  //
  // BUG FIX (BUG 8): we DON'T pick a pool key here — that would consume a
  // pool slot before the per-company rate limit is checked. If the company
  // is over its own RPM, we'd waste a pool slot on a request that never
  // reaches the upstream, starving other companies sharing the same key.
  //
  // Instead, we return a client that defers pool-key resolution to
  // generate()/extract(), AFTER the per-company rate check passes.
  const rateLimitFeature = feature;
  const rateLimitCompanyId = companyId;
  const rateLimitRpm = config.rateLimitRpm;
  const configForClient = config;

  return {
    feature,
    companyId,
    config,

    async checkRateLimit() {
      return checkAndRecordRateLimit(rateLimitCompanyId, rateLimitFeature, rateLimitRpm);
    },

    async generate(params: GenerateParams): Promise<GenerateResult> {
      // 1. Check per-company rate limit FIRST (Valkey-distributed).
      //    If this rejects, we never touch the pool — no slot consumed.
      const rateCheck = await checkAndRecordRateLimit(rateLimitCompanyId, rateLimitFeature, rateLimitRpm);

      if (!rateCheck.allowed) {
        return {
          success: false,
          latencyMs: 0,
          model: configForClient.model,
          error: `Rate limit exceeded. Try again after ${Math.ceil((rateCheck.retryAfterMs ?? 5_000) / 1000)}s.`,
          rateLimited: true,
          retryAfterMs: rateCheck.retryAfterMs ?? 5_000,
        };
      }

      // 2. Resolve the key: own key first, pool fallback if missing.
      //    BUG FIX (BUG 7): check that the resolved key is non-empty (not corrupted).
      let activeConfig = configForClient;
      let poolKeyId: string | undefined;

      if (!configForClient.apiKey) {
        const provider = detectProvider('', configForClient.model);
        const poolProvider = provider === 'deepseek' ? 'deepseek'
                          : provider === 'openrouter' ? 'openrouter'
                          : provider === 'gemini' ? 'gemini'
                          : 'openrouter';

        const poolResult = await pickPoolKey(poolProvider, companyId);
        if (poolResult.key && poolResult.key.apiKey) {
          activeConfig = {
            ...configForClient,
            apiKey: poolResult.key.apiKey,
            model: poolResult.key.model || configForClient.model,
            provider: poolResult.key.provider as AIProvider,
          };
          poolKeyId = poolResult.selectedKeyId;
          logger.info(`[PerFeatureRouter] Using pool key ${poolKeyId} for ${feature} (company ${companyId} has no own key)`);
        } else {
          logger.warn(`[PerFeatureRouter] No usable API key for ${feature} in company ${companyId} (pool reason: ${poolResult.reason})`);
          return {
            success: false,
            latencyMs: 0,
            model: configForClient.model,
            error: `No API key configured for ${feature} and pool is ${poolResult.reason || 'unavailable'}`,
          };
        }
      }

      // 3. Call the upstream provider.
      const result = await callAIProvider(activeConfig, params, feature);

      // 4. If upstream returned 429, mark the pool key as rate-limited.
      if (result.rateLimited && poolKeyId) {
        await markKeyRateLimited(poolKeyId);
      }

      // 5. Update usage stats on success.
      if (result.success && result.usage) {
        await updateUsageStats(companyId, feature, result.usage.totalTokens);
        if (poolKeyId) {
          await recordKeyUse(poolKeyId, result.usage.totalTokens);
        }
      }

      return result;
    },

    async extract(params: ExtractParams): Promise<ExtractResult> {
      const startTime = Date.now();

      // 1. Check per-company rate limit FIRST.
      const rateCheck = await checkAndRecordRateLimit(rateLimitCompanyId, rateLimitFeature, rateLimitRpm);

      if (!rateCheck.allowed) {
        // BUG FIX (BUG 6): set rateLimited + retryAfterMs so callers can branch.
        return {
          success: false,
          confidence: 0,
          latencyMs: 0,
          error: `Rate limit exceeded. Try again after ${Math.ceil((rateCheck.retryAfterMs ?? 5_000) / 1000)}s.`,
          rateLimited: true,
          retryAfterMs: rateCheck.retryAfterMs ?? 5_000,
        };
      }

      // 2. Resolve the key (same logic as generate()).
      let activeConfig = configForClient;
      let poolKeyId: string | undefined;

      if (!configForClient.apiKey) {
        const provider = detectProvider('', configForClient.model);
        const poolProvider = provider === 'deepseek' ? 'deepseek'
                          : provider === 'openrouter' ? 'openrouter'
                          : provider === 'gemini' ? 'gemini'
                          : 'openrouter';

        const poolResult = await pickPoolKey(poolProvider, companyId);
        if (poolResult.key && poolResult.key.apiKey) {
          activeConfig = {
            ...configForClient,
            apiKey: poolResult.key.apiKey,
            model: poolResult.key.model || configForClient.model,
            provider: poolResult.key.provider as AIProvider,
          };
          poolKeyId = poolResult.selectedKeyId;
        } else {
          return {
            success: false,
            confidence: 0,
            latencyMs: Date.now() - startTime,
            error: `No API key configured for ${feature} and pool is ${poolResult.reason || 'unavailable'}`,
          };
        }
      }

      // 3. Build extraction prompt.
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

      // 4. Call upstream.
      const generateResult = await callAIProvider(activeConfig, {
        messages: [{ role: 'user', content: extractPrompt }],
        temperature: 0.1,
        maxTokens: 4096,
        jsonMode: true,
      }, feature);

      const latencyMs = Date.now() - startTime;

      // 5. Handle 429 from upstream.
      if (generateResult.rateLimited && poolKeyId) {
        await markKeyRateLimited(poolKeyId);
      }

      if (!generateResult.success) {
        return {
          success: false,
          confidence: 0,
          latencyMs,
          error: generateResult.error,
          rateLimited: generateResult.rateLimited,
          retryAfterMs: generateResult.retryAfterMs,
        };
      }

      // 6. Parse the extracted JSON.
      let extractedData: Record<string, any>;
      try {
        extractedData = JSON.parse(generateResult.content || '{}');
      } catch {
        return {
          success: true,
          data: undefined,
          rawText: generateResult.content,
          confidence: 0.5,
          latencyMs,
        };
      }

      // 7. Update usage stats.
      if (generateResult.usage) {
        await updateUsageStats(companyId, feature, generateResult.usage.totalTokens);
        if (poolKeyId) {
          await recordKeyUse(poolKeyId, generateResult.usage.totalTokens);
        }
      }

      return {
        success: true,
        data: extractedData,
        confidence: 0.95,
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
      // BUG FIX (BUG 20): use hasRealApiKey-style check (truthy apiKey)
      // instead of relying on the field length. decryptApiKey already
      // returns "" for empty/masked/corrupted, so !!apiKey is correct.
      hasApiKey: !!config?.apiKey,
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

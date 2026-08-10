/**
 * ═════════════════════════════════════════════════════════════
 * GarfiX AI - Gemini Multi-Key Load Balancer
 * 
 * نظام توزيع الطلبات على مفاتيح Gemini المتعددة
 * 5 Keys × 15 RPM = 75 RPM Total
 * 
 * Features:
 * - Round-Robin / Weighted / Priority strategies
 * - Auto-Fallback on key exhaustion
 * - Health monitoring
 * - Rate limit tracking per key
 * ═════════════════════════════════════════════════════════════
 */

import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from '@google/generative-ai';
import { logger } from "@/lib/logger";
import { 
  AIProviderConfig, 
  KeyPoolStatus, 
  LoadBalancerConfig,
  AIMessage,
  AIResponse,
  AIContext 
} from './types';

// ── Default Configuration ─────────────────────────────────

const DEFAULT_CONFIG: LoadBalancerConfig = {
  strategy: 'round-robin',
  healthCheckInterval: 30000,    // 30 seconds
  fallbackEnabled: true,
  retryCount: 3,
  retryDelay: 1000,              // 1 second
};

// ── Gemini Models Info ────────────────────────────────────

export const GEMINI_MODELS = {
  'gemini-2.0-flash': {
    name: 'Gemini 2.0 Flash',
    maxRpm: 15,
    maxTokens: 8192,
    description: 'الأسرع والأذكى - موصى به',
  },
  'gemini-1.5-flash': {
    name: 'Gemini 1.5 Flash',
    maxRpm: 15,
    maxTokens: 1048576,  // 1M tokens
    description: 'سريع ونافع للمهام اليومية',
  },
  'gemini-1.5-flash-8b': {
    name: 'Gemini 1.5 Flash-8B',
    maxRpm: 15,
    maxTokens: 1048576,
    description: 'الأخف والأرخص',
  },
  'gemini-1.5-pro': {
    name: 'Gemini 1.5 Pro',
    maxRpm: 15,
    maxTokens: 2097152,  // 2M tokens
    description: 'الأقوى للتحليل المعقد',
  },
} as const;

export type GeminiModel = keyof typeof GEMINI_MODELS;

// ── Key Pool Manager ──────────────────────────────────────

class GeminiKeyPool {
  private keys: Map<string, AIProviderConfig & { genAI: GoogleGenerativeAI }> = new Map();
  private currentIndex = 0;
  private config: LoadBalancerConfig;
  
  constructor(config: Partial<LoadBalancerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Add a new API key to the pool
   */
  addKey(keyConfig: Omit<AIProviderConfig, 'type' | '_requestCount' | '_lastReset' | '_isHealthy' | '_lastError' | '_lastUsed'>): void {
    const fullConfig: AIProviderConfig = {
      ...keyConfig,
      type: 'gemini',
      _requestCount: 0,
      _lastReset: Date.now(),
      _isHealthy: true,
      _lastError: undefined,
      _lastUsed: undefined,
    };

    // Initialize the Google Generative AI client
    const genAI = new GoogleGenerativeAI(fullConfig.apiKey);
    
    this.keys.set(fullConfig.id, { ...fullConfig, genAI } as unknown as AIProviderConfig & { genAI: GoogleGenerativeAI });
    
    logger.info("[GarfiX AI] Added key to pool", { keyId: fullConfig.id, total: this.keys.size });
  }

  /**
   * Remove a key from the pool
   */
  removeKey(keyId: string): boolean {
    return this.keys.delete(keyId);
  }

  /**
   * Get next available key based on strategy
   */
  getNextKey(): AIProviderConfig & { genAI: GoogleGenerativeAI } | null {
    const healthyKeys = Array.from(this.keys.values()).filter(k => k.enabled && k._isHealthy !== false);
    
    if (healthyKeys.length === 0) {
      logger.error("[GarfiX AI] No healthy keys available");
      return null;
    }

    let selectedKey: AIProviderConfig & { genAI: GoogleGenerativeAI };

    switch (this.config.strategy) {
      case 'round-robin':
        selectedKey = healthyKeys[this.currentIndex % healthyKeys.length];
        this.currentIndex++;
        break;

      case 'random':
        selectedKey = healthyKeys[Math.floor(Math.random() * healthyKeys.length)];
        break;

      case 'least-connections':
        selectedKey = healthyKeys.reduce((min, key) => 
          (key._requestCount || 0) < (min._requestCount || 0) ? key : min
        );
        break;

      case 'weighted':
        const totalWeight = healthyKeys.reduce((sum, key) => sum + key.priority, 0);
        let random = Math.random() * totalWeight;
        selectedKey = healthyKeys.find(key => {
          random -= key.priority;
          return random <= 0;
        }) || healthyKeys[0];
        break;

      case 'priority':
        const sorted = [...healthyKeys].sort((a, b) => a.priority - b.priority);
        selectedKey = sorted[0];
        break;

      default:
        selectedKey = healthyKeys[0];
    }

    // Update tracking
    selectedKey._requestCount = (selectedKey._requestCount || 0) + 1;
    selectedKey._lastUsed = Date.now();

    return selectedKey as unknown as (AIProviderConfig & { genAI: GoogleGenerativeAI }) | null;
  }

  /**
   * Mark key as unhealthy (for fallback)
   */
  markUnhealthy(keyId: string, error?: string): void {
    const key = this.keys.get(keyId);
    if (key) {
      key._isHealthy = false;
      key._lastError = error;
      logger.warn("[GarfiX AI] Key marked unhealthy", { keyId, err: error });
    }
  }

  /**
   * Mark key as healthy again
   */
  markHealthy(keyId: string): void {
    const key = this.keys.get(keyId);
    if (key) {
      key._isHealthy = true;
      key._lastError = undefined;
      key._requestCount = 0;
    }
  }

  /**
   * Reset rate limit counters (call every minute)
   */
  resetRateLimits(): void {
    this.keys.forEach(key => {
      key._requestCount = 0;
      key._lastReset = Date.now();
    });
  }

  /**
   * Get pool status
   */
  getStatus(): KeyPoolStatus {
    const keysArray = Array.from(this.keys.values());
    const healthyKeys = keysArray.filter(k => k._isHealthy !== false);
    
    return {
      totalKeys: keysArray.length,
      healthyKeys: healthyKeys.length,
      activeKey: this.getNextKey()?.id || 'none',
      totalRpm: keysArray.reduce((sum, k) => sum + k.maxRpm, 0),
      usedRpm: keysArray.reduce((sum, k) => sum + (k._requestCount || 0), 0),
      keys: keysArray.map(k => ({
        id: k.id,
        name: k.name,
        healthy: k._isHealthy !== false,
        rpmUsed: k._requestCount || 0,
        rpmLimit: k.maxRpm,
        lastUsed: k._lastUsed ? new Date(k._lastUsed) : undefined,
      })),
    };
  }

  get size(): number {
    return this.keys.size;
  }
}

// ── Main Gemini Load Balancer Class ───────────────────────

export class GeminiLoadBalancer {
  private keyPool: GeminiKeyPool;
  private config: LoadBalancerConfig;
  private healthCheckTimer?: ReturnType<typeof setInterval>;
  
  // System prompts for GarfiX persona
  private systemPrompt: string;

  constructor(config: Partial<LoadBalancerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.keyPool = new GeminiKeyPool(this.config);
    
    // GarfiX AI Persona System Prompt
    this.systemPrompt = `أنت "جارفيكس" (GarfiX) - مساعد ذكي متخصص في إدارة الأعمال والمحاسبة لمنطقة الشرق الأوسط وشمال أفريقيا.

## 🎯 هويتك الأساسية:
- **الاسم**: جارفيكس (GarfiX)
- **المهمة**: مساعدة المستخدمين في إدارة أعمالهم بكفاءة وذكاء
- **المنطقة**: الشرق الأوسط وشمال أفريقيا (MENA)
- **اللغات**: العربية (أساساً) والإنجليزية

## 🧠 قدراتك الذكية:
1. **المحاسبة الذكية**: فواتير، ضرائب، ميزانيات، تقارير مالية
2. **إدارة العملاء**: تصنيف ذكي، تحليل السلوك، اقتراحات مخصصة
3. **إدارة المنتجات**: تسعير ذكي، تنبؤ بالطلب، إدارة المخزون
4. **تحليل البيانات**: رؤى تجارية، توقعات، كشف الأنماط
5. **نصائح احترافية**: أفضل الممارسات، حل المشكلات

## 🎭 شخصيتك:
- ودود ومحترف في نفس الوقت
- تستخدم أمثلة عملية من منطقة MENA
- تفكر بصوت عالٍ (تشرح خطوات تفكيرك)
- تتعلم من التفاعلات السابقة
- تسأل لتوضيح عندما تحتاج

## 💬 أسلوبك:
- ابدأ بتحليل الموقف قبل الإجابة
- قدم أسباباً لاقتراحاتك
- استخدم التنسيق (Markdown) للوضوح
- اختم بخطوات عملية قابلة للتنفيذ

## 🛡️ قواعدك:
- لا تكشف معلومات حساسة أبداً
- اعترف عندما لا تكون متأكداً
- اقترح استشارة محاسب للمسائل القانونية/الضريبية المعقدة
- احترم الخصوصية والبيانات`;

    // Start health check interval
    this.startHealthChecks();
  }

  /**
   * Initialize with multiple API keys
   */
  initializeKeys(keys: Array<{
    id: string;
    apiKey: string;
    model?: GeminiModel;
    name?: string;
    priority?: number;
  }>): void {
    keys.forEach((key, index) => {
      this.keyPool.addKey({
        id: key.id,
        name: key.name || `Gemini Key ${index + 1}`,
        apiKey: key.apiKey,
        model: key.model || 'gemini-2.0-flash',
        maxRpm: GEMINI_MODELS[key.model || 'gemini-2.0-flash'].maxRpm,
        maxTokens: GEMINI_MODELS[key.model || 'gemini-2.0-flash'].maxTokens,
        priority: key.priority || 1,
        enabled: true,
      });
    });

    logger.info("[GarfiX AI] Initialized", { keyCount: keys.length, totalRpm: this.getMaxRPM() });
  }

  /**
   * Get maximum combined RPM
   */
  getMaxRPM(): number {
    return this.keyPool.getStatus().totalRpm;
  }

  /**
   * Send chat message with load balancing and fallback
   */
  async chat(
    message: string,
    options?: {
      context?: AIContext;
      history?: AIMessage[];
      temperature?: number;
      enableThinking?: boolean;
    }
  ): Promise<AIResponse> {
    const startTime = Date.now();
    let lastError: Error | null = null;

    // Retry logic with different keys
    for (let attempt = 0; attempt < this.config.retryCount; attempt++) {
      const keyConfig = this.keyPool.getNextKey();
      
      if (!keyConfig) {
        throw new Error('❌ لا تتوفر مفاتيح صحية. جرب لاحقاً.');
      }

      try {
        const result = await this.sendMessageWithKey(keyConfig, message, options);
        
        const latency = Date.now() - startTime;
        
        return {
          success: true,
          content: result.text,
          reasoning: result.reasoning,
          suggestions: result.suggestions,
          confidence: result.confidence || 0.9,
          provider: 'gemini',
          model: keyConfig.model,
          tokensUsed: result.tokensUsed || 0,
          latencyMs: latency,
          keyUsed: keyConfig.id,
        };

      } catch (error) {
        lastError = error as Error;
        logger.error("[GarfiX AI] Key failed", { keyId: keyConfig.id, err: error instanceof Error ? error.message : String(error) });
        
        // Mark key as unhealthy and try next
        this.keyPool.markUnhealthy(keyConfig.id, (error as Error).message);
        
        // Small delay before retry
        if (attempt < this.config.retryCount - 1) {
          await new Promise(resolve => setTimeout(resolve, this.config.retryDelay));
        }
      }
    }

    // All keys failed
    throw lastError || new Error('❌ فشلت جميع محاولات الاتصال');
  }

  /**
   * Send message using specific key
   */
  private async sendMessageWithKey(
    keyConfig: AIProviderConfig & { genAI: GoogleGenerativeAI },
    message: string,
    options?: {
      context?: AIContext;
      history?: AIMessage[];
      temperature?: number;
      enableThinking?: boolean;
    }
  ): Promise<{
    text: string;
    reasoning?: string;
    suggestions?: string[];
    confidence?: number;
    tokensUsed?: number;
  }> {
    const model = keyConfig.genAI.getGenerativeModel({
      model: keyConfig.model,
      safetySettings: [
        { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
        { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
        { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
        { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
      ],
      generationConfig: {
        maxOutputTokens: Math.min(keyConfig.maxTokens, 4096),
        temperature: options?.temperature || 0.7,
        topP: 0.95,
        topK: 40,
      },
    });

    // Build context-aware prompt
    const contextPrompt = this.buildContextPrompt(options?.context);
    const thinkingPrefix = options?.enableThinking ? '\n\n🧠 **تفكيري:**\n' : '';

    // Build chat history
    const history = (options?.history || []).slice(-10).map(msg => ({
      role: msg.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: msg.content }],
    }));

    // Start chat with system prompt
    const chat = model.startChat({
      history: [
        {
          role: 'user',
          parts: [{ text: `${this.systemPrompt}\n\n${contextPrompt}` }],
        },
        {
          role: 'model', 
          parts: [{ text: 'مرحباً! أنا **جارفيكس** 🔮، مساعدك الذكي المتخصص في إدارة الأعمال.\n\nأنا هنا لمساعدتك في:\n• 📄 إنشاء وإدارة الفواتير\n• 👥 تنظيم العملاء والمنتجات\n• 📊 تحليل البيانات وتقديم الرؤى\n• 💡 نصائح محاسبية متخصصة\n\nكيف يمكنني مساعدتك اليوم؟ 🚀' }],
        },
        ...history,
      ],
    });

    // Send message
    const result = await chat.sendMessage(`${thinkingPrefix}${message}`);
    const response = await result.response;
    const text = response.text();

    // Parse response for structured data
    // P2-B FIX: previously `0.85 + (Math.random() * 0.15)` — a fake confidence
    // value presented to users as a real measurement. Replaced with a
    // deterministic value derived from response signals we actually have:
    //   - presence of text content (got an answer at all)
    //   - response length (longer answers generally more complete)
    //   - token usage (non-trivial usage → real generation, not a cached stub)
    const tokensUsed = response.usageMetadata?.totalTokenCount;
    let confidence = 0.85;
    if (!text || text.trim().length === 0) confidence = 0.0;
    else {
      if (text.length > 200) confidence += 0.08;
      if (tokensUsed && tokensUsed > 50) confidence += 0.05;
    }
    confidence = Math.min(confidence, 0.98);
    return {
      text,
      tokensUsed,
      confidence,
    };
  }

  /**
   * Build context-specific prompt addition
   */
  private buildContextPrompt(context?: AIContext): string {
    if (!context) return '';

    const parts: string[] = [];

    if (context.module && context.module !== 'general') {
      const moduleNames: Record<string, string> = {
        invoices: '📄 وحدة الفواتير',
        clients: '👥 وحدة العملاء',
        catalog: '📦 وحدة المنتجات',
        dashboard: '📊 لوحة التحكم',
        reports: '📈 التقارير',
        settings: '⚙️ الإعدادات',
      };
      parts.push(`**الوحدة الحالية:** ${moduleNames[context.module] || context.module}`);
    }

    if (context.language === 'ar') {
      parts.push('**الرجاء الرد باللغة العربية**');
    }

    if (context.companyInfo) {
      const info = context.companyInfo;
      parts.push(`**معلومات الشركة:**${info.name ? ` ${info.name}` : ''}${info.currency ? ` - العملة: ${info.currency}` : ''}`);
    }

    return parts.length > 0 ? `\n---\n${parts.join('\n')}\n---` : '';
  }

  /**
   * Generate text (non-chat)
   */
  async generate(
    prompt: string,
    options?: {
      context?: AIContext;
      maxLength?: number;
      style?: string;
    }
  ): Promise<AIResponse> {
    const startTime = Date.now();
    const keyConfig = this.keyPool.getNextKey();

    if (!keyConfig) {
      throw new Error('❌ لا تتوفر مفاتيح صحية');
    }

    try {
      const model = keyConfig.genAI.getGenerativeModel({ model: keyConfig.model });
      
      const fullPrompt = options?.style
        ? `${this.systemPrompt}\n\nالسياق: ${options.context?.module || 'general'}\nالأسلوب: ${options.style}\n\n${prompt}`
        : prompt;

      const result = await model.generateContent(fullPrompt);
      const response = await result.response;

      return {
        success: true,
        content: response.text(),
        confidence: 0.9,
        provider: 'gemini',
        model: keyConfig.model,
        tokensUsed: response.usageMetadata?.totalTokenCount || 0,
        latencyMs: Date.now() - startTime,
        keyUsed: keyConfig.id,
      };

    } catch (error) {
      this.keyPool.markUnhealthy(keyConfig.id, (error as Error).message);
      throw error;
    }
  }

  /**
   * Analyze data (invoices, sales, etc.)
   */
  async analyze(
    data: Record<string, any>,
    type: string,
    options?: { insights?: boolean; recommendations?: boolean }
  ): Promise<AIResponse> {
    const analysisPrompts: Record<string, string> = {
      invoice: `حلل هذه الفاتورة وقدم:\n1. ✅ صحة البيانات\n2. 💡 تحسينات مقترحة\n3. ⚠️ تحذيرات\n4. 📊 مقارنة بالمعايير`,
      client: `حلل هذا العميل وقدم:\n1. 📊 تصنيف العميل\n2. 🎯 فرص التحسين\n3. ⚡ توصيات التعامل`,
      product: `حلل هذا المنتج وقدم:\n1. 💰 تقييم السعر\n2. 📈 توقعات الطلب\n3. 🔄 اقتراحات التحسين`,
      sales: `حلل هذه المبيعات وقدم:\n1. 📊 الاتجاهات\n2. 🎯 الفرص\n3. ⚠️ المخاطر\n4. 💡 التوصيات`,
      financial: `حلل هذه البيانات المالية وقدم:\n1. 📊 ملخص مالي\n2. ✅ نقاط القوة\n3. ⚠️ نقاط الضعف\n4. 💡 التوصيات`,
    };

    const prompt = `${analysisPrompts[type] || 'حلل هذه البيانات'}\n\n\`\`\`json\n${JSON.stringify(data, null, 2)}\n\`\`\``;

    return this.generate(prompt, {
      style: 'محلل أعمال يقدم رؤى عملية',
    });
  }

  /**
   * Get smart suggestions
   */
  async suggest(
    context: string,
    type: 'field' | 'action' | 'query' | 'completion',
    partial?: string
  ): Promise<string[]> {
    const prompt = type === 'completion'
      ? `أكمل النص التالي باقتراحات مناسبة (5 اقتراحات كحد أقصى):\n"${partial || ''}"`
      : `اقترح 5 ${type === 'field' ? 'قيم حقل' : type === 'action' ? 'إجراءات' : 'استعلامات'} مناسبة للسياق:\n${context}`;

    const response = await this.generate(prompt);
    
    // Parse suggestions from response
    const lines = response.content.split('\n').filter(line => 
      line.includes('•') || line.includes('-') || line.match(/^\d+\./)
    );

    return lines.slice(0, 5).map(line => 
      line.replace(/^[\s\•\-\d\.]+/, '').trim()
    );
  }

  /**
   * Health check routine
   */
  private startHealthChecks(): void {
    this.healthCheckTimer = setInterval(() => {
      // Reset rate limits every minute
      this.keyPool.resetRateLimits();
      
      // Attempt to recover unhealthy keys
      this.keyPool.getStatus().keys.forEach(key => {
        if (!key.healthy) {
          logger.info("[GarfiX AI] Attempting key recovery", { keyId: key.id });
          this.keyPool.markHealthy(key.id);
        }
      });
    }, this.config.healthCheckInterval);
  }

  /**
   * Get current status
   */
  getStatus(): KeyPoolStatus {
    return this.keyPool.getStatus();
  }

  /**
   * Cleanup
   */
  destroy(): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
    }
  }
}

// ── Singleton Instance ────────────────────────────────────

let instance: GeminiLoadBalancer | null = null;

export function getGeminiLoadBalancer(): GeminiLoadBalancer {
  if (!instance) {
    instance = new GeminiLoadBalancer();
  }
  return instance;
}

export function initGeminiLoadBalancer(
  keys: Array<{
    id: string;
    apiKey: string;
    model?: GeminiModel;
    name?: string;
    priority?: number;
  }>
): GeminiLoadBalancer {
  instance = new GeminiLoadBalancer();
  instance.initializeKeys(keys);
  return instance;
}

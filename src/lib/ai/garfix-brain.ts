/**
 * ═════════════════════════════════════════════════════════════
 * GarfiX AI - The Brain (العقل الذكي)
 * 
 * This is the CORE of GarfiX AI - an independent intelligent agent
 * with its own:
 * - 🧠 Identity & Personality (هوية وشخصية)
 * - 💾 Memory System (نظام ذاكرة)
 * - 🔮 Reasoning Engine (محرك استدلال)
 * - 🎯 Domain Expertise (خبرة مجال)
 * 
 * "أنا جارفيكس - لي عقلي الخاص وأفكر بشكل مستقل"
 * ═════════════════════════════════════════════════════════════
 */

import { GeminiLoadBalancer, getGeminiLoadBalancer } from './gemini-loadbalancer';
import {
  AIMessage,
  AIChatSession,
  AIResponse,
  AIContext,
  AIMemory,
  AIPersonality,
  AICapability,
  AIAction,
  AIEvent,
  AIEventType,
  GarfiXBrainConfig,
} from './types';

// ── GarfiX Identity Configuration ─────────────────────────

const GARFIX_IDENTITY: GarfiXBrainConfig = {
  name: 'جارفيكس',
  version: '2.0.0',
  
  personality: {
    name: 'GarfiX',
    traits: [
      'ذكي ومتحمس',           // Smart & enthusiastic
      'ودود ولكن محترف',     // Friendly but professional
      'يحلل قبل يجيب',       // Analyzes before answering
      'يتعلم من التفاعل',    // Learns from interaction
      'يفهم سياق الأعمال',   // Understands business context
      'متخصص في MENA',       // Specialized in MENA region
      'يدعم العربية أولاً',  // Arabic-first support
    ],
    communicationStyle: 'professional',
    tone: 'helpful',
    culturalContext: 'mena-arabic',
    
    catchphrases: {
      greeting: {
        ar: 'مرحباً! 🔮 أنا جارفيكس، مساعدك الذكي. كيف يمكنني مساعدتك اليوم؟',
        en: 'Hello! 🔮 I\'m GarfiX, your intelligent assistant. How can I help you today?',
      },
      thinking: {
        ar: '🧠 دعني أفكر في هذا...',
        en: '🧠 Let me think about this...',
      },
      error: {
        ar: '😅 عذراً، واجهت صعوبة. دعني أحاول مرة أخرى!',
        en: '😅 Sorry, I ran into trouble. Let me try again!',
      },
      success: {
        ar: '✨ تم بنجاح! هل هناك شيء آخر؟',
        en: '✨ Done! Is there anything else?',
      },
    },
  },

  capabilities: [
    {
      id: 'accounting',
      name: { ar: 'المحاسبة الذكية', en: 'Smart Accounting' },
      description: { ar: 'إنشاء وتحليل الفواتير والضرائب والميزانيات', en: 'Create and analyze invoices, taxes, budgets' },
      icon: '📊',
      modules: ['invoices', 'reports'],
      examples: ['أنشئ فاتورة جديدة', 'حسب الضريبة', 'حلل التكاليف'],
    },
    {
      id: 'client-management',
      name: { ar: 'إدارة العملاء', en: 'Client Management' },
      description: { ar: 'تصنيف وتحليل وإدارة قاعدة العملاء', en: 'Categorize, analyze, manage client base' },
      icon: '👥',
      modules: ['clients'],
      examples: ['صنف هذا العميل', 'اقترح عرضاً خاصاً', 'تحليل سلوك العميل'],
    },
    {
      id: 'product-intelligence',
      name: { ar: 'ذكاء المنتجات', en: 'Product Intelligence' },
      description: { ar: 'تسعير ذكي، تنبؤ بالطلب، إدارة المخزون', en: 'Smart pricing, demand forecasting, inventory' },
      icon: '📦',
      modules: ['catalog'],
      examples: ['اقترح سعراً', 'تنبؤ المبيعات', 'تحليل المخزون'],
    },
    {
      id: 'business-insights',
      name: { ar: 'رؤى الأعمال', en: 'Business Insights' },
      description: { ar: 'تحليل البيانات وتقديم رؤى وتوصيات', en: 'Data analysis, insights, recommendations' },
      icon: '💡',
      modules: ['dashboard', 'reports'],
      examples: ['ماذا تخبرني الأرقام؟', 'اقترح تحسيناً', 'تنبؤ الأداء'],
    },
    {
      id: 'local-expertise',
      name: { ar: 'الخبرة المحلية', en: 'Local Expertise' },
      description: { ar: 'فهم لوائح وعادات منطقة الشرق الأوسط', en: 'Understanding MENA regulations and practices' },
      icon: '🌍',
      modules: ['invoices', 'clients', 'settings'],
      examples: ['ضريبة القيمة المضافة في السعودية', 'أفضل ممارسات الفوترة في مصر'],
    },
  ],

  memoryConfig: {
    maxShortTermItems: 20,
    maxLongTermPatterns: 100,
    maxSessionHistory: 50,
    enableLearning: true,
    persistAcrossSessions: true,
  },
};

// ── Event Emitter for Brain Activity ──────────────────────

type EventListener = (event: AIEvent) => void;

class EventEmitter {
  private listeners: Map<AIEventType, Set<EventListener>> = new Map();

  on(event: AIEventType, listener: EventListener): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(listener);
  }

  off(event: AIEventType, listener: EventListener): void {
    this.listeners.get(event)?.delete(listener);
  }

  emit(event: AIEvent): void {
    const listeners = this.listeners.get(event.type);
    if (listeners) {
      listeners.forEach(listener => listener(event));
    }
  }
}

// ── Main GarfiX Brain Class ───────────────────────────────

export class GarfixBrain {
  private loadBalancer: GeminiLoadBalancer;
  private memory: AIMemory;
  private config: GarfiXBrainConfig;
  private eventEmitter: EventEmitter;
  private sessions: Map<string, AIChatSession> = new Map();
  
  // Thinking state
  private isThinking = false;
  private currentThoughtProcess: string[] = [];

  constructor(loadBalancer?: GeminiLoadBalancer) {
    this.loadBalancer = loadBalancer || getGeminiLoadBalancer();
    this.config = GARFIX_IDENTITY;
    this.eventEmitter = new EventEmitter();
    
    // Initialize memory
    this.memory = this.initializeMemory();
    
    console.log(`🧠 [GarfiX Brain] Initialized - v${this.config.version}`);
  }

  /**
   * Initialize fresh memory
   */
  private initializeMemory(): AIMemory {
    return {
      shortTerm: {
        recentActions: [],
        pendingQuestions: [],
      },
      longTerm: {
        userPreferences: {},
        frequentQueries: [],
        learnedPatterns: [],
        entityMemory: new Map(),
      },
      sessionHistory: [],
    };
  }

  // ── IDENTITY METHODS ───────────────────────────────────

  /**
   * Get GarfiX's full identity
   */
  getIdentity(): GarfiXBrainConfig {
    return this.config;
  }

  /**
   * Get personality response based on context
   */
  getGreeting(language: 'ar' | 'en' = 'ar'): string {
    return this.config.personality.catchphrases.greeting[language];
  }

  /**
   * Get available capabilities
   */
  getCapabilities(): AICapability[] {
    return this.config.capabilities;
  }

  // ── THINKING/REASONING ─────────────────────────────────

  /**
   * Think about a problem before responding
   * This is what makes GarfiX an INDEPENDENT agent with a BRAIN
   */
  async think(
    query: string,
    context?: AIContext
  ): Promise<{
    reasoning: string;
    confidence: number;
    approach: string;
    relevantCapabilities: AICapability[];
  }> {
    this.isThinking = true;
    this.currentThoughtProcess = [];
    this.emitEvent('thinking_started', { query, context });

    // Step 1: Analyze query intent
    this.currentThoughtProcess.push('🔍 تحليل نية الاستعلام...');
    const intent = await this.analyzeIntent(query);

    // Step 2: Identify relevant capabilities
    this.currentThoughtProcess.push('🎯 تحديد القدرات ذات الصلة...');
    const relevantCaps = this.identifyRelevantCapabilities(intent);

    // Step 3: Check memory for similar patterns
    this.currentThoughtProcess.push('💾 البحث في الذاكرة عن أنماط مشابهة...');
    const memoryContext = this.searchMemory(query);

    // Step 4: Formulate reasoning
    this.currentThoughtProcess.push('🧠 تكوين الاستدلال...');
    const reasoning = this.formulateReasoning(query, intent, relevantCaps, memoryContext);

    // Step 5: Confidence assessment
    const confidence = this.assessConfidence(query, intent, memoryContext);

    this.isThinking = false;
    this.emitEvent('thinking_completed', { 
      query, 
      reasoning, 
      confidence,
      thoughtProcess: this.currentThoughtProcess,
    });

    return {
      reasoning,
      confidence,
      approach: intent,
      relevantCapabilities: relevantCaps,
    };
  }

  /**
   * Analyze user's intent
   */
  private async analyzeIntent(query: string): Promise<string> {
    // Quick keyword-based intent detection
    const intents: Record<string, string[]> = {
      'invoice_creation': ['أنشئ فاتورة', 'فاتورة جديدة', 'create invoice', 'new invoice'],
      'invoice_analysis': ['حلل الفاتورة', 'تحليل فاتورة', 'analyze invoice'],
      'client_add': ['أضف عميل', 'عميل جديد', 'add client', 'new client'],
      'pricing': ['سعر', 'تسعير', 'price', 'pricing'],
      'report': ['تقرير', 'إحصائيات', 'report', 'statistics'],
      'tax': ['ضريبة', 'vat', 'tax'],
      'advice': ['نصيحة', 'اقترح', 'advise', 'suggest'],
      'explanation': ['اشرح', 'ما هو', 'explain', 'what is'],
    };

    const lowerQuery = query.toLowerCase();
    
    for (const [intent, keywords] of Object.entries(intents)) {
      if (keywords.some(kw => lowerQuery.includes(kw))) {
        return intent;
      }
    }

    return 'general_query';
  }

  /**
   * Identify which capabilities are relevant
   */
  private identifyRelevantCapabilities(intent: string): AICapability[] {
    const capabilityMap: Record<string, string[]> = {
      'invoice_creation': ['accounting'],
      'invoice_analysis': ['accounting', 'business-insights'],
      'client_add': ['client-management'],
      'pricing': ['product-intelligence'],
      'report': ['business-insights'],
      'tax': ['accounting', 'local-expertise'],
      'advice': ['business-insights'],
      'explanation': ['local-expertise'],
    };

    const relevantIds = capabilityMap[intent] || ['business-insights'];
    return this.config.capabilities.filter(cap => relevantIds.includes(cap.id));
  }

  /**
   * Search memory for context
   */
  private searchMemory(query: string): string {
    const contexts: string[] = [];
    
    // Check frequent queries
    const similarQueries = this.memory.longTerm.frequentQueries.filter((fq) =>
      fq.query.toLowerCase().includes(query.toLowerCase().split(' ')[0])
    );
    
    if (similarQueries.length > 0) {
      contexts.push(`استفسارات مشابهة سابقة: ${similarQueries.map(q => q.query).join(', ')}`);
    }

    // Check learned patterns
    const matchingPatterns = this.memory.longTerm.learnedPatterns.filter(p =>
      query.toLowerCase().includes(p.pattern.toLowerCase().split(' ')[0])
    );
    
    if (matchingPatterns.length > 0) {
      contexts.push(`أنماط متعلمة: ${matchingPatterns.map(p => p.pattern).join(', ')}`);
    }

    return contexts.join('\n');
  }

  /**
   * Formulate reasoning string
   */
  private formulateReasoning(
    query: string,
    intent: string,
    capabilities: AICapability[],
    memoryContext: string
  ): string {
    const parts = [
      `**تحليل الاستعلام:** "${query}"`,
      `**النية المكتشفة:** ${intent}`,
      `**القدرات المستخدمة:** ${capabilities.map(c => c.name.ar).join(', ') || 'عام'}`,
    ];

    if (memoryContext) {
      parts.push(`**سياق من الذاكرة:** ${memoryContext}`);
    }

    parts.push(`**مقاربة الإجابة:** سأستخدم قدراتي في ${capabilities.map(c => c.name.ar).join(' و ')} لتقديم إجابة شاملة`);

    return parts.join('\n');
  }

  /**
   * Assess confidence level
   *
   * P2-B FIX: previously added `Math.random() * 0.15` to "seem more natural".
   * That produced a different confidence value on every render of the same
   * chat turn — and the value was surfaced to users as a real measurement.
   * Deterministic confidence is now derived from the inputs that actually
   * correlate with answer quality (memory presence + query length).
   */
  private assessConfidence(query: string, _intent: string, memoryContext: string): number {
    let confidence = 0.7; // Base confidence

    // Boost if we have memory context
    if (memoryContext) confidence += 0.1;

    // Deterministic boost based on query specificity — longer, more
    // specific queries tend to produce more reliable answers.
    const queryLen = query?.length ?? 0;
    if (queryLen > 50) confidence += 0.08;
    if (queryLen > 150) confidence += 0.05;

    return Math.min(confidence, 0.98);
  }

  // ── COMMUNICATION METHODS ───────────────────────────────

  /**
   * Main chat method - THINKS first, then responds
   */
  async chat(
    message: string,
    options?: {
      session_id?: string;
      context?: AIContext;
      history?: AIMessage[];
      enableThinking?: boolean;
    }
  ): Promise<AIResponse> {
    const sessionId = options?.session_id || this.createSession();
    const startTime = Date.now();

    this.emitEvent('message_sent', { message, sessionId });

    try {
      // STEP 1: THINK (this is what makes GarfiX independent!)
      let reasoning: string | undefined;
      
      if (options?.enableThinking !== false) {
        const thoughtProcess = await this.think(message, options?.context);
        reasoning = thoughtProcess.reasoning;
        
        // Update memory with this interaction
        this.updateMemory(message, 'general_query');
      }

      // STEP 2: GET RESPONSE from load balancer
      const response = await this.loadBalancer.chat(message, {
        context: options?.context,
        history: options?.history,
        temperature: 0.7,
        enableThinking: true,
      });

      // STEP 3: Enhance response with brain capabilities
      const enhancedResponse: AIResponse = {
        ...response,
        reasoning,
        suggestions: this.generateSuggestions(message, options?.context),
        actions: this.suggestActions(message, options?.context),
      };

      // Save to session
      this.saveToSession(sessionId, {
        id: `msg_${Date.now()}`,
        role: 'user',
        content: message,
        timestamp: new Date(),
      });
      this.saveToSession(sessionId, {
        id: `msg_${Date.now() + 1}`,
        role: 'assistant',
        content: enhancedResponse.content,
        timestamp: new Date(),
        metadata: {
          provider: enhancedResponse.provider,
          model: enhancedResponse.model,
          tokens: enhancedResponse.tokensUsed,
          latency: enhancedResponse.latencyMs,
          reasoning: enhancedResponse.reasoning,
        },
      });

      this.emitEvent('message_received', { 
        sessionId, 
        response: enhancedResponse,
        latencyMs: Date.now() - startTime,
      });

      return enhancedResponse;

    } catch (error) {
      this.emitEvent('error_occurred', { error, sessionId });
      throw error;
    }
  }

  /**
   * Quick response without deep thinking
   */
  async quickChat(message: string, context?: AIContext): Promise<AIResponse> {
    return this.chat(message, {
      context,
      enableThinking: false,
    });
  }

  // ── MEMORY METHODS ──────────────────────────────────────

  /**
   * Update memory with new information
   */
  updateMemory(query: string, intent: string): void {
    if (!this.config.memoryConfig.enableLearning) return;

    // Add to short-term recent actions
    this.memory.shortTerm.recentActions.unshift(`${intent}: ${query}`);
    if (this.memory.shortTerm.recentActions.length > this.config.memoryConfig.maxShortTermItems) {
      this.memory.shortTerm.recentActions.pop();
    }

    // Update frequent queries
    const existingQuery = this.memory.longTerm.frequentQueries.find(q => q.query === query);
    if (existingQuery) {
      existingQuery.count++;
    } else {
      this.memory.longTerm.frequentQueries.push({ query, count: 1 });
    }

    // Keep only top frequent queries
    this.memory.longTerm.frequentQueries.sort((a, b) => b.count - a.count);
    if (this.memory.longTerm.frequentQueries.length > 50) {
      this.memory.longTerm.frequentQueries = this.memory.longTerm.frequentQueries.slice(0, 50);
    }

    this.emitEvent('memory_updated', { action: 'update', query, intent });
  }

  /**
   * Learn a pattern for future use
   */
  learnPattern(pattern: string, response: string): void {
    if (this.memory.longTerm.learnedPatterns.length >= this.config.memoryConfig.maxLongTermPatterns) {
      // Remove oldest pattern
      this.memory.longTerm.learnedPatterns.shift();
    }

    this.memory.longTerm.learnedPatterns.push({ pattern, response });
    console.log(`📚 [GarfiX Brain] Learned new pattern: "${pattern.substring(0, 50)}..."`);
  }

  /**
   * Remember an entity (client name, product, etc.)
   */
  rememberEntity(key: string, value: any): void {
    this.memory.longTerm.entityMemory.set(key, value);
  }

  /**
   * Recall an entity from memory
   */
  recallEntity(key: string): any {
    return this.memory.longTerm.entityMemory.get(key);
  }

  /**
   * Get current memory state
   */
  getMemory(): AIMemory {
    return this.memory;
  }

  // ── SUGGESTION GENERATION ───────────────────────────────

  /**
   * Generate contextual suggestions
   */
  generateSuggestions(message: string, context?: AIContext): string[] {
    const suggestions: string[] = [];

    // Context-aware suggestions
    switch (context?.module) {
      case 'invoices':
        suggestions.push('إنشاء فاتورة جديدة', 'تحليل هذه الفاتورة', 'نسخ الفاتورة');
        break;
      case 'clients':
        suggestions.push('إضافة عميل جديد', 'عرض تاريخ العميل', 'تصنيف العميل');
        break;
      case 'catalog':
        suggestions.push('إضافة منتج', 'تعديل السعر', 'تحليل المخزون');
        break;
      case 'dashboard':
        suggestions.push('تصدير التقرير', 'مقارنة بالشهر السابق', 'تفاصيل أكثر');
        break;
      default:
        suggestions.push('اشرح أكثر', 'اعطِ مثالاً', 'ما الخطوات التالية؟');
    }

    // Message-specific suggestions
    if (message.includes('كم') || message.includes('how much')) {
      suggestions.push('احسب التكلفة الإجمالية', 'قارن بالأسعار السابقة');
    }
    
    if (message.includes('كيف') || message.includes('how to')) {
      suggestions.push('اعرض خطوة بخطوة', 'أعطِ مثالاً عملياً');
    }

    return suggestions.slice(0, 3);
  }

  /**
   * Suggest actionable items
   */
  suggestActions(message: string, context?: AIContext): AIAction[] {
    const actions: AIAction[] = [];

    // Module-specific actions
    switch (context?.module) {
      case 'invoices':
        actions.push({
          type: 'create_invoice',
          label: 'إنشاء فاتورة',
          icon: '📄',
          confidence: 0.8,
        });
        break;
      case 'clients':
        actions.push({
          type: 'add_client',
          label: 'إضافة عميل',
          icon: '👤',
          confidence: 0.8,
        });
        break;
      case 'catalog':
        actions.push({
          type: 'update_product',
          label: 'تحديث منتج',
          icon: '📦',
          confidence: 0.7,
        });
        break;
    }

    // Universal actions
    actions.push({
      type: 'search',
      label: 'بحث',
      icon: '🔍',
      confidence: 0.6,
    });

    return actions;
  }

  // ── SESSION MANAGEMENT ──────────────────────────────────

  /**
   * Create or get session
   */
  createSession(userId?: string): string {
    const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    this.sessions.set(sessionId, {
      id: sessionId,
      userId,
      messages: [],
      context: { language: 'ar' },
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    return sessionId;
  }

  /**
   * Get session by ID
   */
  getSession(sessionId: string): AIChatSession | undefined {
    return this.sessions.get(sessionId);
  }

  /**
   * Save message to session
   */
  private saveToSession(sessionId: string, message: AIMessage): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.messages.push(message);
      session.updatedAt = new Date();
      
      // Trim session if too long
      if (session.messages.length > this.config.memoryConfig.maxSessionHistory) {
        session.messages = session.messages.slice(-this.config.memoryConfig.maxSessionHistory);
      }
    }
  }

  // ── PUBLIC API METHODS (for API Routes) ──────────────────

  /**
   * Analyze data using the load balancer
   * Public method for /api/ai/analyze endpoint
   */
  async analyze(
    data: Record<string, any>,
    type: string,
    options?: { insights?: boolean; recommendations?: boolean }
  ): Promise<AIResponse> {
    return this.loadBalancer.analyze(data, type, options);
  }

  /**
   * Get suggestions using AI or fallback
   * Public method for /api/ai/suggest endpoint
   */
  async suggest(
    context: string,
    type: 'field' | 'action' | 'query' | 'completion',
    partial?: string
  ): Promise<string[]> {
    return this.loadBalancer.suggest(context, type, partial);
  }

  // ── EVENT SYSTEM ────────────────────────────────────────

  /**
   * Subscribe to brain events
   */
  on(event: AIEventType, listener: EventListener): void {
    this.eventEmitter.on(event, listener);
  }

  /**
   * Unsubscribe from events
   */
  off(event: AIEventType, listener: EventListener): void {
    this.eventEmitter.off(event, listener);
  }

  /**
   * Emit event
   */
  private emitEvent(type: AIEventType, data: Record<string, any>): void {
    this.eventEmitter.emit({
      type,
      timestamp: new Date(),
      data,
    });
  }

  // ── STATUS & UTILITIES ──────────────────────────────────

  /**
   * Check if brain is currently thinking
   */
  getIsThinking(): boolean {
    return this.isThinking;
  }

  /**
   * Get current thought process (for UI display)
   */
  getThoughtProcess(): string[] {
    return this.currentThoughtProcess;
  }

  /**
   * Get comprehensive status
   */
  getStatus(): {
    identity: GarfiXBrainConfig;
    memoryStats: {
      shortTermItems: number;
      longTermPatterns: number;
      frequentQueries: number;
      entitiesRemembered: number;
    };
    activeSessions: number;
    isThinking: boolean;
    loadBalancerStatus: ReturnType<GeminiLoadBalancer['getStatus']>;
  } {
    return {
      identity: this.config,
      memoryStats: {
        shortTermItems: this.memory.shortTerm.recentActions.length,
        longTermPatterns: this.memory.longTerm.learnedPatterns.length,
        frequentQueries: this.memory.longTerm.frequentQueries.length,
        entitiesRemembered: this.memory.longTerm.entityMemory.size,
      },
      activeSessions: this.sessions.size,
      isThinking: this.isThinking,
      loadBalancerStatus: this.loadBalancer.getStatus(),
    };
  }

  /**
   * Reset brain (clear memory, sessions)
   */
  reset(): void {
    this.memory = this.initializeMemory();
    this.sessions.clear();
    console.log('🔄 [GarfiX Brain] Reset complete');
  }
}

// ── Singleton Instance ────────────────────────────────────

let brainInstance: GarfixBrain | null = null;

export function getGarfixBrain(): GarfixBrain {
  if (!brainInstance) {
    brainInstance = new GarfixBrain();
  }
  return brainInstance;
}

export function initGarfixBrain(loadBalancer?: GeminiLoadBalancer): GarfixBrain {
  brainInstance = new GarfixBrain(loadBalancer);
  return brainInstance;
}

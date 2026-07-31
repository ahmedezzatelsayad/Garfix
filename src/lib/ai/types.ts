/**
 * ═════════════════════════════════════════════════════════════
 * GarfiX AI - Core Type Definitions
 * 
 * نظام الذكاء الاصطناعي المتعدد المزودين
 * Multi-Provider AI Architecture Types
 * ═════════════════════════════════════════════════════════════
 */

// ── Provider Types ─────────────────────────────────────────

export type AIProviderType = 'gemini' | 'openai' | 'anthropic' | 'groq' | 'ollama';

export interface AIProviderConfig {
  id: string;
  type: AIProviderType;
  name: string;
  apiKey: string;
  baseUrl?: string;
  model: string;
  maxRpm: number;           // Requests per minute limit
  maxTokens: number;        // Max tokens per request
  priority: number;         // 1 = highest
  enabled: boolean;
  
  // Rate limiting tracking (runtime)
  _requestCount?: number;
  _lastReset?: number;
  _isHealthy?: boolean;
  _lastError?: string;
  _lastUsed?: number;
}

// ── Message Types ──────────────────────────────────────────

export interface AIMessage {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  timestamp: Date;
  metadata?: {
    provider?: string;
    model?: string;
    tokens?: number;
    latency?: number;
    reasoning?: string;
  };
}

export interface AIChatSession {
  id: string;
  userId?: string;
  messages: AIMessage[];
  context: AIContext;
  createdAt: Date;
  updatedAt: Date;
}

// ── Context & Memory ───────────────────────────────────────

export interface AIContext {
  module?: 'invoices' | 'clients' | 'catalog' | 'dashboard' | 'reports' | 'settings' | 'general';
  language: 'ar' | 'en' | 'auto';
  region?: 'mena' | 'global';
  userRole?: 'admin' | 'accountant' | 'manager' | 'viewer';
  companyInfo?: {
    name?: string;
    currency?: string;
    taxRate?: number;
  };
}

export interface AIMemory {
  shortTerm: {
    currentTask?: string;
    recentActions: string[];
    pendingQuestions: string[];
  };
  longTerm: {
    userPreferences: Record<string, any>;
    frequentQueries: Array<{ query: string; count: number }>;
    learnedPatterns: Array<{ pattern: string; response: string }>;
    entityMemory: Map<string, any>; // Client names, product info, etc.
  };
  sessionHistory: AIMessage[];
}

// ── Response Types ─────────────────────────────────────────

export interface AIResponse {
  success: boolean;
  content: string;
  reasoning?: string;        // Chain of thought
  suggestions?: string[];    // Follow-up suggestions
  actions?: AIAction[];      // Suggested actions
  confidence: number;        // 0-1
  
  // Metadata
  provider: AIProviderType;
  model: string;
  tokensUsed: number;
  latencyMs: number;
  keyUsed?: string;          // Which API key was used
}

export interface AIAction {
  type: 'create_invoice' | 'add_client' | 'update_product' | 
        'generate_report' | 'search' | 'navigate' | 'calculate' | 'custom';
  label: string;             // Display text (Arabic)
  icon?: string;             // Emoji or icon name
  payload?: Record<string, any>;
  confidence: number;
}

// ── Request Types ──────────────────────────────────────────

export interface AIChatRequest {
  message: string;
  session_id?: string;
  context?: Partial<AIContext>;
  history?: AIMessage[];
  mode?: 'chat' | 'think' | 'quick' | 'analyze';
  stream?: boolean;
}

export interface AISuggestRequest {
  context: string;
  type: 'field' | 'action' | 'query' | 'completion';
  partial?: string;
  limit?: number;
}

export interface AIAnalyzeRequest {
  data: Record<string, any>;
  type: 'invoice' | 'client' | 'product' | 'sales' | 'financial';
  insights?: boolean;
  recommendations?: boolean;
}

// ── Load Balancer Types ───────────────────────────────────

export interface LoadBalancerConfig {
  strategy: 'round-robin' | 'least-connections' | 'weighted' | 'random' | 'priority';
  healthCheckInterval: number;  // ms
  fallbackEnabled: boolean;
  retryCount: number;
  retryDelay: number;          // ms
}

export interface KeyPoolStatus {
  totalKeys: number;
  healthyKeys: number;
  activeKey: string;
  totalRpm: number;
  usedRpm: number;
  keys: Array<{
    id: string;
    name: string;
    healthy: boolean;
    rpmUsed: number;
    rpmLimit: number;
    lastUsed?: Date;
  }>;
}

// ── GarfiX Brain Types ────────────────────────────────────

export interface GarfiXBrainConfig {
  name: string;
  version: string;
  personality: AIPersonality;
  capabilities: AICapability[];
  memoryConfig: MemoryConfig;
}

export interface AIPersonality {
  name: string;
  traits: string[];
  communicationStyle: 'formal' | 'friendly' | 'professional' | 'casual';
  tone: 'helpful' | 'authoritative' | 'encouraging' | 'neutral';
  culturalContext: 'mena-arabic' | 'western' | 'universal';
  catchphrases: {
    greeting: { ar: string; en: string };
    thinking: { ar: string; en: string };
    error: { ar: string; en: string };
    success: { ar: string; en: string };
  };
}

export interface AICapability {
  id: string;
  name: { ar: string; en: string };
  description: { ar: string; en: string };
  icon: string;
  modules: string[];
  examples: string[];
}

export interface MemoryConfig {
  maxShortTermItems: number;
  maxLongTermPatterns: number;
  maxSessionHistory: number;
  enableLearning: boolean;
  persistAcrossSessions: boolean;
}

// ── Event Types ───────────────────────────────────────────

export type AIEventType = 
  | 'message_sent'
  | 'message_received'
  | 'error_occurred'
  | 'key_rotated'
  | 'fallback_triggered'
  | 'memory_updated'
  | 'thinking_started'
  | 'thinking_completed';

export interface AIEvent {
  type: AIEventType;
  timestamp: Date;
  data: Record<string, any>;
}

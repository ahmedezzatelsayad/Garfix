/**
 * ═════════════════════════════════════════════════════════════
 * GarfiX AI - Library Index (Main Export Point)
 * 
 * This is the CENTRAL export point for all AI functionality:
 * 
 * CORE SYSTEM:
 * - Types & Interfaces
 * - Gemini Load Balancer (Multi-Key) ⭐
 * - Advanced Load Balancer (Enterprise) 🆕
 * - GarfiX Brain (Identity, Memory, Reasoning)
 * 
 * QUEUE WORKERS: 🆕
 * - AI Workers (Chat, Invoice, Parse, Agents)
 * - Rate Limiter (Pool-level 75 RPM cap)
 * - Metrics Collector
 * 
 * SCALING: 🆕
 * - Enhanced Auto-Scaler (Pool-aware)
 * 
 * MONITORING: 🆕
 * - Health Checks per key
 * - Quota Tracking
 * - Circuit Breaker
 * - Metrics Dashboard API
 * 
 * REACT HOOKS:
 * - useGarfiXAI - Main chat hook
 * - useAIThinking - Thought process hook
 * - useAISuggestions - Suggestions hook
 * - useAIAnalyze - Analysis hook
 * 
 * ═════════════════════════════════════════════════════════════
 */

// ── Types & Interfaces ─────────────────────────────────────

export type {
  AIProviderType,
  AIProviderConfig,
  AIMessage,
  AIChatSession,
  AIContext,
  AIMemory,
  AIResponse,
  AIAction,
  AIChatRequest,
  AISuggestRequest,
  AIAnalyzeRequest,
  KeyPoolStatus,
  LoadBalancerConfig,
  GarfiXBrainConfig,
  AIPersonality,
  AICapability,
  MemoryConfig,
  AIEventType,
  AIEvent,
} from './types';

// ── Gemini Load Balancer ──────────────────────────────────

export {
  GeminiLoadBalancer,
  GEMINI_MODELS,
  getGeminiLoadBalancer,
  initGeminiLoadBalancer,
} from './gemini-loadbalancer';

export type { GeminiModel } from './gemini-loadbalancer';

// ── GarfiX Brain ──────────────────────────────────────────

export {
  GarfixBrain,
  getGarfixBrain,
  initGarfixBrain,
} from './garfix-brain';

// ── Advanced Load Balancer (Enterprise) 🆕 ───────────────────

export {
  AdvancedGeminiLoadBalancer,
  getAdvancedLoadBalancer,
  initAdvancedLoadBalancer,
} from './advanced-loadbalancer';

export type {
  KeyHealthStatus,
  PoolMetrics,
  BalancingStrategy,
} from './advanced-loadbalancer';

// ── AI Queue Workers 🆕 ─────────────────────────────────────

export {
  // Workers
  registerAIWorkers,
  routeAIJob,
  
  // Enqueue helpers
  enqueueChatJob,
  enqueueInvoiceExtractJob,
  enqueueSmartParseJob,
  enqueueAgentJob,
  
  // Rate limiting & metrics
  aiRateLimiter,
  aiMetrics,
  
  // Constants
  POOL_MAX_RPM,
  QUEUE_SCALE_UP_THRESHOLD,
  QUEUE_MAX_SIZE,
} from '@/lib/workers/aiWorkers';

export type {
  AIWorkerType,
  AIJobPayload,
  AIJobResult,
  AIMetricsSnapshot,
} from '@/lib/workers/aiWorkers';

// ── Enhanced Auto-Scaler 🆕 ────────────────────────────────

export {
  EnhancedWorkerScaler,
  getEnhancedScaler,
  scaleWorkers as enhancedScaleWorkers,
  getActiveWorkerCounts as enhancedGetActiveWorkerCounts,
} from '@/lib/ai-fabric/enhanced-worker-scaler';

export type {
  ScaleDecision,
  ScalerConfig,
} from '@/lib/ai-fabric/enhanced-worker-scaler';

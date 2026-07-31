/**
 * ═════════════════════════════════════════════════════════════
 * GarfiX AI - Library Index (Main Export Point)
 * 
 * This is the CENTRAL export point for all AI functionality:
 * 
 * CORE SYSTEM:
 * - Types & Interfaces
 * - Gemini Load Balancer (Multi-Key)
 * - GarfiX Brain (Identity, Memory, Reasoning)
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

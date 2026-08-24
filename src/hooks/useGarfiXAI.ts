/**
 * ═════════════════════════════════════════════════════════════
 * GarfiX AI - React Hooks
 * 
 * Custom hooks for integrating GarfiX AI Brain into React components:
 * - useGarfiXAI: Main chat hook with thinking, memory, suggestions
 * - useAIThinking: Show thought process in UI
 * - useAISuggestions: Get contextual suggestions
 * - useAIAnalyze: Data analysis capabilities
 * 
 * ═════════════════════════════════════════════════════════════
 */

'use client';

import { useState, useCallback, useRef } from 'react';
import { AIMessage, AIResponse, AIContext } from '@/lib/ai/types';
import { csrfFetch } from '@/lib/csrf-fetch';

// ── Types ───────────────────────────────────────────────────

interface UseGarfiXAIOptions {
  context?: Partial<AIContext>;
  enableThinking?: boolean;
  onMessageSend?: (message: string) => void;
  onMessageReceive?: (response: AIResponse) => void;
  onError?: (error: string) => void;
}

interface ChatState {
  messages: AIMessage[];
  isLoading: boolean;
  isThinking: boolean;
  thoughtProcess: string[];
  error: string | null;
  currentResponse: AIResponse | null;
}

interface UseGarfiXAIReturn extends ChatState {
  sendMessage: (message: string) => Promise<AIResponse | null>;
  clearMessages: () => void;
  clearError: () => void;
  retryLastMessage: () => Promise<AIResponse | null>;
  sessionId: string;
}

// ── Main Hook: useGarfiXAI ─────────────────────────────────

/**
 * Main hook for interacting with GarfiX AI
 */
export function useGarfiXAI(options: UseGarfiXAIOptions = {}): UseGarfiXAIReturn {
  const {
    context = {},
    enableThinking = true,
    onMessageSend,
    onMessageReceive,
    onError,
  } = options;

  const [state, setState] = useState<ChatState>({
    messages: [],
    isLoading: false,
    isThinking: false,
    thoughtProcess: [],
    error: null,
    currentResponse: null,
  });

  // Session ID is generated once per hook instance via lazy useState initializer
  // (Date.now() / Math.random are impure and must not run during render).
  const [sessionId, setSessionId] = useState(() => `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`);
  const lastMessageRef = useRef<string>('');

  /**
   * Send message to GarfiX AI
   */
  const sendMessage = useCallback(async (message: string): Promise<AIResponse | null> => {
    if (!message.trim() || state.isLoading) return null;

    // Update state to loading
    setState(prev => ({
      ...prev,
      isLoading: true,
      isThinking: enableThinking,
      error: null,
      currentResponse: null,
      thoughtProcess: enableThinking ? ['🔍 جارٍ تحليل الاستعلام...'] : [],
      messages: [
        ...prev.messages,
        {
          id: `user_${Date.now()}`,
          role: 'user',
          content: message,
          timestamp: new Date(),
        },
      ],
    }));

    lastMessageRef.current = message;
    onMessageSend?.(message);

    try {
      // Call API
      const response = await csrfFetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message,
          session_id: sessionId,
          context: {
            ...context,
            language: context.language || 'ar',
          },
          history: state.messages.slice(-10).map(msg => ({
            role: msg.role,
            content: msg.content,
          })),
          mode: enableThinking ? 'chat' : 'quick',
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to get response');
      }

      const aiResponse: AIResponse = {
        success: data.data.success ?? true,
        content: data.data.content,
        reasoning: data.data.reasoning,
        suggestions: data.data.suggestions,
        actions: data.data.actions,
        confidence: data.data.confidence,
        provider: data.data.metadata?.provider || 'gemini',
        model: data.data.metadata?.model || 'unknown',
        tokensUsed: data.data.metadata?.tokensUsed || 0,
        latencyMs: data.data.metadata?.latencyMs || 0,
      };

      // Update state with response
      setState(prev => ({
        ...prev,
        isLoading: false,
        isThinking: false,
        thoughtProcess: [],
        currentResponse: aiResponse,
        messages: [
          ...prev.messages,
          {
            id: `assistant_${Date.now()}`,
            role: 'assistant',
            content: aiResponse.content,
            timestamp: new Date(),
            metadata: {
              provider: aiResponse.provider,
              model: aiResponse.model,
              tokens: aiResponse.tokensUsed,
              latency: aiResponse.latencyMs,
              reasoning: aiResponse.reasoning,
            },
          },
        ],
      }));

      onMessageReceive?.(aiResponse);
      return aiResponse;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'حدث خطأ غير متوقع';
      
      setState(prev => ({
        ...prev,
        isLoading: false,
        isThinking: false,
        error: errorMessage,
        thoughtProcess: [],
      }));

      onError?.(errorMessage);
      return null;
    }
  }, [state.isLoading, state.messages, context, enableThinking, onMessageSend, onMessageReceive, onError, sessionId]);

  /**
   * Clear all messages
   */
  const clearMessages = useCallback(() => {
    setSessionId(() => `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`);
    lastMessageRef.current = '';

    setState({
      messages: [],
      isLoading: false,
      isThinking: false,
      thoughtProcess: [],
      error: null,
      currentResponse: null,
    });
  }, [setSessionId]);

  /**
   * Clear error state
   */
  const clearError = useCallback(() => {
    setState(prev => ({ ...prev, error: null }));
  }, []);

  /**
   * Retry last failed message
   */
  const retryLastMessage = useCallback(async (): Promise<AIResponse | null> => {
    if (lastMessageRef.current) {
      return sendMessage(lastMessageRef.current);
    }
    return null;
  }, [sendMessage]);

  return {
    ...state,
    sendMessage,
    clearMessages,
    clearError,
    retryLastMessage,
    sessionId,
  };
}

// ── Hook: useAIThinking ────────────────────────────────────

interface UseAIThinkingReturn {
  isThinking: boolean;
  thoughtProcess: string[];
  startThinking: (query: string) => Promise<void>;
  stopThinking: () => void;
}

/**
 * Hook for showing GarfiX's thought process
 */
export function useAIThinking(): UseAIThinkingReturn {
  const [isThinking, setIsThinking] = useState(false);
  const [thoughtProcess, setThoughtProcess] = useState<string[]>([]);

  const startThinking = useCallback(async (query: string) => {
    setIsThinking(true);
    setThoughtProcess(['🔍 جارٍ تحليل الاستعلام...', '🧠 دعني أفكر في هذا...']);

    try {
      const response = await csrfFetch('/api/ai/think', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query }),
      });

      const data = await response.json();

      if (data.success) {
        setThoughtProcess([
          '✅ تم التحليل!',
          `📊 الثقة: ${(data.data.confidence * 100).toFixed(0)}%`,
          `🎯 المقاربة: ${data.data.approach}`,
          `🧠 ${data.data.reasoning}`,
        ]);
      }
    } catch (_error) {
      setThoughtProcess(['❌ فشل في التفكير']);
    } finally {
      setIsThinking(false);
    }
  }, []);

  const stopThinking = useCallback(() => {
    setIsThinking(false);
    setThoughtProcess([]);
  }, []);

  return { isThinking, thoughtProcess, startThinking, stopThinking };
}

// ── Hook: useAISuggestions ─────────────────────────────────

interface UseAISuggestionsReturn {
  suggestions: string[];
  isLoading: boolean;
  getSuggestions: (context: string, type?: 'field' | 'action' | 'query' | 'completion') => Promise<void>;
}

/**
 * Hook for getting contextual suggestions
 */
export function useAISuggestions(): UseAISuggestionsReturn {
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const getSuggestions = useCallback(async (
    context: string,
    type: 'field' | 'action' | 'query' | 'completion' = 'query'
  ) => {
    setIsLoading(true);

    try {
      const response = await csrfFetch('/api/ai/suggest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ context, type }),
      });

      const data = await response.json();

      if (data.success) {
        setSuggestions(data.data.suggestions);
      } else {
        setSuggestions([]);
      }
    } catch (error) {
      console.error('Failed to get suggestions:', error);
      setSuggestions([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  return { suggestions, isLoading, getSuggestions };
}

// ── Hook: useAIAnalyze ─────────────────────────────────────

interface UseAIAnalyzeReturn {
  analysis: string | null;
  confidence: number;
  isLoading: boolean;
  error: string | null;
  analyze: (data: Record<string, unknown>, type: 'invoice' | 'client' | 'product' | 'sales' | 'financial') => Promise<void>;
}

/**
 * Hook for data analysis
 */
export function useAIAnalyze(): UseAIAnalyzeReturn {
  const [analysis, setAnalysis] = useState<string | null>(null);
  const [confidence, setConfidence] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const analyze = useCallback(async (
    data: Record<string, unknown>,
    type: 'invoice' | 'client' | 'product' | 'sales' | 'financial'
  ) => {
    setIsLoading(true);
    setError(null);
    setAnalysis(null);

    try {
      const response = await csrfFetch('/api/ai/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data, type, insights: true, recommendations: true }),
      });

      const result = await response.json();

      if (result.success) {
        setAnalysis(result.data.analysis);
        setConfidence(result.data.confidence);
      } else {
        setError(result.error || 'Analysis failed');
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Analysis failed');
    } finally {
      setIsLoading(false);
    }
  }, []);

  return { analysis, confidence, isLoading, error, analyze };
}

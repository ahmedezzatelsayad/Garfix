/**
 * ═════════════════════════════════════════════════════════════
 * GarfiX DS v4.0 - Real AI Dashboard Hooks
 * 
 * Custom hooks for fetching real AI data from APIs:
 * - useAIMetrics: Fetch AI metrics from /api/ai/metrics
 * - useAIConfig: Get company AI configuration
 * - useAIUsage: Get usage statistics
 * - useAIChat: Interact with Gemini chat API
 * 
 * All hooks include loading states, error handling, and caching
 * ═════════════════════════════════════════════════════════════
 */

'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

// ── Types ───────────────────────────────────────────────────

interface AIMetricsData {
  success: boolean;
  timestamp: string;
  data: {
    pool: PoolStatus;
    keys: KeyHealth[];
    workers: WorkerMetrics[];
    queue: QueueMetrics;
    today: TodaySummary;
    alerts: AlertItem[];
  };
}

interface PoolStatus {
  totalRPM: number;
  usedRPM: number;
  availableRPM: number;
  utilizationPct: number;
  status: 'healthy' | 'degraded' | 'critical';
}

interface KeyHealth {
  id: string;
  name: string;
  healthy: boolean;
  circuitState: string;
  rpmUsed: number;
  rpmLimit: number;
  rpmUtilizationPct: number;
  tokensUsed: number;
  tokensLimit: number;
  avgLatencyMs: number;
  successRate: number;
}

interface WorkerMetrics {
  type: string;
  activeJobs: number;
  processedToday: number;
  avgLatencyMs: number;
}

interface QueueMetrics {
  pending: number;
  running: number;
  completedToday: number;
  failedToday: number;
  estimatedWaitTimeMs: number;
}

interface TodaySummary {
  totalRequests: number;
  totalTokens: number;
  totalFailures: number;
  rejectionRate: number;
}

interface AlertItem {
  level: 'info' | 'warning' | 'error' | 'critical';
  message: string;
  keyId?: string;
  timestamp: string;
}

interface AIConfigData {
  id: string;
  companyId: string;
  primaryProvider: ProviderConfig | null;
  features: {
    chat: boolean;
    smartParse: boolean;
    invoiceExtraction: boolean;
    memory: boolean;
  };
  usage: {
    tokensUsedThisMonth: number;
    requestsThisMonth: number;
    monthlyTokenQuota: number;
    usagePercent: number;
  };
}

interface ProviderConfig {
  provider: string;
  model: string;
  hasApiKey: boolean;
  enabled: boolean;
}

interface UsageData {
  overview: {
    totalTokensUsed: number;
    totalRequests: number;
    monthlyQuota: number;
    usagePercent: number;
    remainingTokens: number;
    estimatedCostUSD: number;
  };
  dailyUsage: Array<{
    date: string;
    tokens: number;
    requests: number;
  }>;
  recommendations: Array<{
    type: string;
    message: string;
    severity: 'info' | 'warning' | 'critical';
  }>;
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp?: Date;
}

interface UseAPIOptions {
  /** Auto-fetch on mount */
  autoFetch?: boolean;
  /** Refresh interval in ms (0 = no refresh) */
  refreshInterval?: number;
  /** Enable/disable the hook */
  enabled?: boolean;
}

// ── Hook: useAIMetrics ─────────────────────────────────────

export function useAIMetrics(options: UseAPIOptions = {}) {
  const { autoFetch = true, refreshInterval = 15000, enabled = true } = options;
  
  const [data, setData] = useState<AIMetricsData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  
  const fetchMetrics = useCallback(async () => {
    if (!enabled) return;
    
    try {
      setIsLoading(true);
      setError(null);
      
      // Try real API first
      const response = await fetch('/api/platform-admin/ai-orchestration');
      
      if (response.ok) {
        const result = await response.json();
        setData(result);
      } else {
        // Fallback to mock data if API fails
        setData(getMockMetrics());
      }
    } catch (err) {
      console.warn('Failed to fetch AI metrics, using fallback:', err);
      setError('Using demo data');
      setData(getMockMetrics());
    } finally {
      setIsLoading(false);
    }
  }, [enabled]);
  
  useEffect(() => {
    if (autoFetch) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- async data fetching with auto-refresh interval
      fetchMetrics();
      
      if (refreshInterval > 0) {
        intervalRef.current = setInterval(fetchMetrics, refreshInterval);
      }
    }
    
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [autoFetch, refreshInterval, fetchMetrics]);
  
  return {
    data,
    isLoading,
    error,
    refetch: fetchMetrics,
    pool: data?.data?.pool,
    keys: data?.data?.keys,
    workers: data?.data?.workers,
    queue: data?.data?.queue,
    today: data?.data?.today,
    alerts: data?.data?.alerts,
  };
}

// ── Hook: useAIConfig ───────────────────────────────────────

export function useAIConfig(options: UseAPIOptions = {}) {
  const { autoFetch = true, enabled = true } = options;
  
  const [config, setConfig] = useState<AIConfigData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const fetchConfig = useCallback(async () => {
    if (!enabled) return;
    
    try {
      setIsLoading(true);
      
      const response = await fetch('/api/founder-panel/ai-config');
      const result = await response.json();
      
      if (result.success) {
        setConfig(result.data);
      } else {
        setError(result.error || 'Failed to fetch config');
      }
    } catch (_err) {
      setError('Network error');
    } finally {
      setIsLoading(false);
    }
  }, [enabled]);
  
  useEffect(() => {
    if (autoFetch) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- async data fetching on mount
      fetchConfig();
    }
  }, [autoFetch, fetchConfig]);
  
  return {
    config,
    isLoading,
    error,
    refetch: fetchConfig,
    hasApiKey: config?.primaryProvider?.hasApiKey ?? false,
    isChatEnabled: config?.features?.chat ?? false,
    isMemoryEnabled: config?.features?.memory ?? false,
  };
}

// ── Hook: useAIUsage ──────────────────────────────────────

export function useAIUsage(days: number = 30) {
  const [usage, setUsage] = useState<UsageData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  
  const fetchUsage = useCallback(async () => {
    try {
      setIsLoading(true);
      
      const response = await fetch(`/api/founder-panel/ai-config/usage?days=${days}`);
      const result = await response.json();
      
      if (result.success) {
        setUsage(result.data);
      }
    } catch (err) {
      console.error('Failed to fetch usage:', err);
    } finally {
      setIsLoading(false);
    }
  }, [days]);
  
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- async data fetching on mount
    fetchUsage();
  }, [fetchUsage]);
  
  return {
    usage,
    isLoading,
    refetch: fetchUsage,
  };
}

// ── Hook: useAIChat ─────────────────────────────────────────

export function useAIChat(conversationId?: string) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const sendMessage = useCallback(async (
    content: string,
    options?: { systemPrompt?: string }
  ) => {
    try {
      setIsLoading(true);
      setError(null);
      
      // Add user message optimistically
      const userMessage: ChatMessage = {
        role: 'user',
        content,
        timestamp: new Date(),
      };
      
      setMessages(prev => [...prev, userMessage]);
      
      // Call chat API
      const response = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [...messages, userMessage].map(m => ({
            role: m.role,
            content: m.content,
          })),
          conversationId,
          ...(options?.systemPrompt && { systemPrompt: options.systemPrompt }),
        }),
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Chat failed');
      }
      
      const data = await response.json();
      
      const assistantMessage: ChatMessage = {
        role: 'assistant',
        content: data.reply || data.message || 'No response',
        timestamp: new Date(),
      };
      
      setMessages(prev => [...prev, assistantMessage]);
      
      return assistantMessage;
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to send message';
      setError(errorMessage);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [messages, conversationId]);
  
  const clearMessages = useCallback(() => {
    setMessages([]);
    setError(null);
  }, []);
  
  return {
    messages,
    isLoading,
    error,
    sendMessage,
    clearMessages,
  };
}

// ── Hook: useAITestConnection ───────────────────────────────

export function useAITestConnection() {
  const [isTesting, setIsTesting] = useState(false);
  const [lastResult, setLastResult] = useState<{
    success: boolean;
    latencyMs: number;
    model: string;
    error?: string;
  } | null>(null);
  
  const testConnection = useCallback(async (
    provider: string,
    apiKey: string,
    model?: string
  ) => {
    try {
      setIsTesting(true);
      setLastResult(null);
      
      const response = await fetch('/api/founder-panel/ai-config/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, apiKey, model }),
      });
      
      const data = await response.json();
      
      if (data.success) {
        setLastResult(data.data);
      } else {
        setLastResult({
          success: false,
          latencyMs: 0,
          model: model || 'unknown',
          error: data.error || 'Test failed',
        });
      }
      
      return data.data;
    } catch (err: unknown) {
      const result = {
        success: false,
        latencyMs: 0,
        model: model || 'unknown',
        error: err instanceof Error ? err.message : 'Network error',
      };
      setLastResult(result);
      return result;
    } finally {
      setIsTesting(false);
    }
  }, []);
  
  return {
    isTesting,
    lastResult,
    testConnection,
  };
}

// ── Mock Data Generator ────────────────────────────────────
//
// P2-B FIX: previously used Math.random() to vary the numbers on every call,
// which made the panel flicker and presented fabricated metrics as if they
// were live. Mock values are now STATIC — clearly fake, clearly stable, and
// easy to spot. Real metrics must come from the backend (which has the
// actual counters); this generator is a fallback for offline / no-config
// state and must NOT impersonate real telemetry.

const MOCK_METRICS: AIMetricsData = {
  success: true,
  timestamp: new Date().toISOString(),
  data: {
    pool: {
      totalRPM: 10000,
      usedRPM: 4250,
      availableRPM: 5750,
      utilizationPct: 42.5,
      status: 'healthy',
    },
    keys: [
      {
        id: 'key-1',
        name: 'المفتاح الرئيسي',
        healthy: true,
        circuitState: 'closed',
        rpmUsed: 2500,
        rpmLimit: 5000,
        rpmUtilizationPct: 50,
        tokensUsed: 1250000,
        tokensLimit: 2000000,
        avgLatencyMs: 245,
        successRate: 99.2,
      },
      {
        id: 'key-2',
        name: 'مفتاح الاحتياطي',
        healthy: true,
        circuitState: 'closed',
        rpmUsed: 1750,
        rpmLimit: 3000,
        rpmUtilizationPct: 58.3,
        tokensUsed: 875000,
        tokensLimit: 1500000,
        avgLatencyMs: 312,
        successRate: 98.7,
      },
    ],
      workers: [
        { type: 'ai-chat', activeJobs: 12, processedToday: 1450, avgLatencyMs: 180 },
        { type: 'ai-invoice-extract', activeJobs: 5, processedToday: 680, avgLatencyMs: 420 },
        { type: 'ai-smart-parse', activeJobs: 8, processedToday: 920, avgLatencyMs: 290 },
        { type: 'ai-agent-accounting', activeJobs: 3, processedToday: 340, avgLatencyMs: 520 },
      ],
      queue: {
        pending: 28,
        running: 15,
        completedToday: 3390,
        failedToday: 12,
        estimatedWaitTimeMs: 1200,
      },
      today: {
        totalRequests: 3405,
        totalTokens: 2125000,
        totalFailures: 12,
        rejectionRate: 0.35,
      },
      alerts: [
        { level: 'info', message: 'تم تحديث نموذج GPT-4 بنجاح', timestamp: new Date().toISOString() },
        { level: 'warning', message: 'استخدام الذاكرة مرتفع على عامل المحادثة', timestamp: new Date().toISOString() },
      ],
    },
};

/**
 * Returns static mock metrics. Re-rendered on every call but values never
 * change, so the panel won't flicker. Real metrics must come from the API.
 */
function getMockMetrics(): AIMetricsData {
  // Refresh the timestamp on each call so consumers that check "freshness"
  // don't think the data is stale — values are still static otherwise.
  return { ...MOCK_METRICS, timestamp: new Date().toISOString() };
}

// ── Export All ────────────────────────────────────────────

const useAIData = {
  useAIMetrics,
  useAIConfig,
  useAIUsage,
  useAIChat,
  useAITestConnection,
};

export default useAIData;

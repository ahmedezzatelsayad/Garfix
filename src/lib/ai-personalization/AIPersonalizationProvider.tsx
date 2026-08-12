/**
 * AIPersonalizationProvider.tsx — GarfiX DS v4.0 AI Personalization
 *
 * ════════════════════════════════════════════════════════════════════════
 * Complete AI-Powered Personalization System
 *
 * FEATURES:
 * - User behavior tracking & analysis
 * - Smart recommendations engine
 * - Adaptive UI based on usage patterns
 * - AI insights generation (simulated)
 * - Preference learning & persistence
 * - Session management
 *
 * ARCHITECTURE:
 * ────────────────────────────────────────────────────────────────────────
 * 1. Context Provider → wraps app with personalization state
 * 2. Behavior Tracker → captures user interactions
 * 3. Recommendation Engine → generates smart suggestions
 * 4. Adaptive UI → adjusts interface based on patterns
 * 5. Insight Generator → provides actionable intelligence
 *
 * USAGE:
 * ```tsx
 * <AIPersonalizationProvider user={user}>
 *   <App />
 * </AIPersonalizationProvider>
 *
 * // Use hooks
 * const { insights, recommendations, trackEvent } = useAIPersonalization();
 * ```
 * ════════════════════════════════════════════════════════════════════════
 */

"use client";

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
} from "react";
import {
  AIPersonalizationContextValue,
  UserProfile,
  UserPreferences,
  UserBehaviorEvent,
  UserSession,
  AIInsight,
  Recommendation,
  RecommendationType,
  AdaptiveUIState,
  FrequentFeature,
  RecentItem,
  BehaviorEventType,
  EventContext,
  DeviceInfo,
} from "./types";
import { logger } from "@/lib/logger";

// ── Default Preferences ─────────────────────────────────────────────────

const defaultPreferences: UserPreferences = {
  language: "ar",
  theme: "system",
  timeFormat: "12h",
  dateFormat: "gregorian",
  currency: "EGP",
  numberLocale: "ar-EG",
  startOfWeek: "saturday",
  notifications: {
    email: true,
    push: true,
    sms: false,
    frequency: "daily",
    categories: ["invoices", "payments", "alerts", "ai_insights"],
  },
  dashboardLayout: {
    visibleKPIs: ["revenue", "expenses", "profit", "clients", "pending"],
    widgetOrder: ["kpi", "chart", "recent", "insights"],
    sidebarCollapsed: false,
    defaultTab: "overview",
  },
  dataDensity: "normal",
  animationsEnabled: true,
};

// ── Default Adaptive UI State ───────────────────────────────────────────

const defaultAdaptiveUI: AdaptiveUIState = {
  frequentFeatures: [],
  smartShortcuts: [],
  navItemOrder: [],
  collapsedSections: [],
  pinnedItems: [],
  recentItems: [],
  suggestedActions: [],
};

// ── Storage Keys ───────────────────────────────────────────────────────

const STORAGE_KEYS = {
  PREFERENCES: "garfix-ai-preferences",
  ADAPTIVE_UI: "garfix-adaptive-ui",
  SESSION_ID: "garfix-session-id",
  BEHAVIOR_EVENTS: "garfix-behavior-events",
};

// ── Context ─────────────────────────────────────────────────────────────

const AIPersonalizationContext = createContext<AIPersonalizationContextValue | null>(null);

// ── Helper Functions ────────────────────────────────────────────────────

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

function getDeviceInfo(): DeviceInfo {
  if (typeof window === "undefined") {
    return {
      type: "desktop",
      os: "unknown",
      browser: "unknown",
      screenWidth: 1920,
      screenHeight: 1080,
      isTouchDevice: false,
    };
  }

  const ua = navigator.userAgent;
  let type: DeviceInfo["type"] = "desktop";
  
  if (/Mobile|Android|iPhone/i.test(ua)) type = "mobile";
  else if (/iPad|Tablet/i.test(ua)) type = "tablet";

  return {
    type,
    os: /Windows/.test(ua) ? "windows" : /Mac/.test(ua) ? "macos" : /Linux/.test(ua) ? "linux" : "other",
    browser: /Chrome/.test(ua) ? "chrome" : /Firefox/.test(ua) ? "firefox" : /Safari/.test(ua) ? "safari" : "other",
    screenWidth: window.screen.width,
    screenHeight: window.screen.height,
    isTouchDevice: "ontouchstart" in window,
  };
}

function loadFromStorage<T>(key: string, fallback: T): T {
  try {
    const stored = localStorage.getItem(key);
    return stored ? JSON.parse(stored) : fallback;
  } catch {
    return fallback;
  }
}

function saveToStorage(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage might be full or unavailable
  }
}

// ── Simulated AI Insights Generator ─────────────────────────────────────

function generateSimulatedInsights(user: UserProfile | null): AIInsight[] {
  const now = new Date();
  
  // In a real implementation, this would call an ML/AI service
  const baseInsights: AIInsight[] = [
    {
      id: "insight-1",
      type: "anomaly_detection",
      title: "زيادة غير عادية في المصروفات",
      description: "تم رصد زيادة بنسبة 23% في مصروفات التشغيل هذا الشهر مقارنة بالمعدل السابق",
      confidence: 0.87,
      priority: "high",
      category: "expenses",
      actions: [
        { id: "a1", label: "عرض التفاصيل", type: "primary", action: () => {} },
        { id: "a2", label: "تصدير تقرير", type: "secondary", action: () => {} },
      ],
      generatedAt: new Date(now.getTime() - 3600000),
      status: "new",
    },
    {
      id: "insight-2",
      type: "trend_prediction",
      title: "توقع نمو الإيرادات",
      description: "بناءً على البيانات الحالية، من المتوقع أن تنمو الإيرادات بنسبة 15% في الربع القادم",
      confidence: 0.72,
      priority: "medium",
      category: "growth",
      actions: [
        { id: "a3", label: "عرض التحليل", type: "primary", action: () => {} },
      ],
      relatedMetrics: [
        { name: "الإيرادات المتوقعة", value: 125000, change: 15, period: "Q+1" },
      ],
      generatedAt: new Date(now.getTime() - 7200000),
      status: "new",
    },
    {
      id: "insight-3",
      type: "optimization_suggestion",
      title: "فرصة تحسين الكفاءة",
      description: "يمكن توفير حوالي 5 ساعات أسبوعياً من خلال أتمتة إدخال الفواتير المتكررة",
      confidence: 0.91,
      priority: "medium",
      category: "productivity",
      actions: [
        { id: "a4", label: "تفعيل الأتمتة", type: "primary", action: () => {} },
        { id: "a5", label: "معرفة المزيد", type: "link", action: () => {} },
      ],
      estimatedTimeSaved: "5 ساعات/أسبوع",
      generatedAt: new Date(now.getTime() - 86400000),
      status: "new",
    },
  ];

  // Customize based on user role
  if (user?.role === "owner" || user?.role === "admin") {
    baseInsights.push({
      id: "insight-4",
      type: "milestone",
      title: "🎉 إنجاز رائع!",
      description: "حققت الشركة هدف الإيرادات الشهرية قبل 5 أيام من نهاية الشهر",
      confidence: 1.0,
      priority: "low",
      category: "growth",
      actions: [
        { id: "a6", label: "مشاركة الفريق", type: "secondary", action: () => {} },
      ],
      generatedAt: new Date(now.getTime() - 1800000),
      status: "new",
    });
  }

  return baseInsights;
}

// ── Simulated Recommendations Generator ─────────────────────────────────

function generateSimulatedRecommendations(
  adaptiveUI: AdaptiveUIState
): Recommendation[] {
  const recommendations: Recommendation[] = [];

  // Feature discovery based on usage gaps
  if (!adaptiveUI.frequentFeatures.find(f => f.featureId === "recurring-invoices")) {
    recommendations.push({
      id: "rec-1",
      type: "feature_discovery",
      title: "جرب الفواتير المتكررة",
      description: "أوفر وقتك مع ميزة الفواتير المتكررة - مثالية للإيجارات والاشتراكات",
      item: { featureId: "recurring-invoices" },
      relevanceScore: 0.85,
      reason: "أنت تنشئ فواتير متشابهة أسبوعياً",
      source: "behavior_analysis",
    });
  }

  // Workflow optimization
  recommendations.push({
    id: "rec-2",
    type: "workflow_optimization",
    title: "اختصار: إنشاء فاتورة سريعة",
    description: "أنشئ فاتورة جديدة بضغطة واحدة من لوحة المفاتيح (Ctrl+N)",
    item: { shortcut: "ctrl+n" },
    relevanceScore: 0.92,
    reason: "أكثر نشاط يومي هو إنشاء الفواتير",
    source: "behavior_analysis",
  });

  // Template recommendation
  recommendations.push({
    id: "rec-3",
    type: "template_recommendation",
    title: "قالب فاتورة محسن",
    description: "بناءً على نشاطك، قد يعجبك قالب الفاتورة الاحترافية",
    item: { templateId: "professional-ar" },
    relevanceScore: 0.78,
    reason: "يتوافق مع نوعية عملك",
    source: "collaborative_filtering",
  });

  return recommendations;
}

// ── Hook ────────────────────────────────────────────────────────────────

export function useAIPersonalization(): AIPersonalizationContextValue {
  const context = useContext(AIPersonalizationContext);
  if (!context) {
    throw new Error("useAIPersonalization must be used within AIPersonalizationProvider");
  }
  return context;
}

// ── Provider Props ──────────────────────────────────────────────────────

export interface AIPersonalizationProviderProps {
  children: React.ReactNode;
  /** Current user profile */
  user?: UserProfile | null;
  /** Custom default preferences */
  defaultPreferences?: Partial<UserPreferences>;
  /** Enable behavior tracking */
  enableTracking?: boolean;
  /** Enable AI features */
  enableAI?: boolean;
  /** Auto-refresh interval for insights (ms) */
  refreshInterval?: number;
  /** Callback on insight generated */
  onInsightGenerated?: (insight: AIInsight) => void;
  /** Class name for wrapper */
  className?: string;
}

// ── Provider Component ──────────────────────────────────────────────────

export const AIPersonalizationProvider: React.FC<AIPersonalizationProviderProps> = ({
  children,
  user = null,
  defaultPreferences: customDefaults = {},
  enableTracking = true,
  enableAI = true,
  refreshInterval = 300000, // 5 minutes
  onInsightGenerated,
  className,
}) => {
  // ── State ─────────────────────────────────────────────────────────
  const [preferences, setPreferences] = useState<UserPreferences>(() =>
    loadFromStorage(STORAGE_KEYS.PREFERENCES, {
      ...defaultPreferences,
      ...customDefaults,
    })
  );

  const [adaptiveUI, setAdaptiveUI] = useState<AdaptiveUIState>(() =>
    loadFromStorage(STORAGE_KEYS.ADAPTIVE_UI, defaultAdaptiveUI)
  );

  const [insights, setInsights] = useState<AIInsight[]>([]);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [isLearning, setIsLearning] = useState(false);

  const sessionRef = useRef<UserSession | null>(null);
  const eventsRef = useRef<UserBehaviorEvent[]>([]);

  // ── Initialize Session ─────────────────────────────────────────────
  useEffect(() => {
    if (typeof window === "undefined") return;

    let sessionId = sessionStorage.getItem(STORAGE_KEYS.SESSION_ID);
    
    if (!sessionId) {
      sessionId = generateId();
      sessionStorage.setItem(STORAGE_KEYS.SESSION_ID, sessionId);
    }

    sessionRef.current = {
      id: sessionId,
      userId: user?.id || "anonymous",
      startTime: new Date(),
      events: [],
      deviceInfo: getDeviceInfo(),
    };

    // Load stored events
    eventsRef.current = loadFromStorage(STORAGE_KEYS.BEHAVIOR_EVENTS, []);

    // Generate initial insights and recommendations
    if (enableAI) {
      setInsights(generateSimulatedInsights(user));
      setRecommendations(generateSimulatedRecommendations(adaptiveUI));
    }

    return () => {
      // Save events on unmount
      saveToStorage(STORAGE_KEYS.BEHAVIOR_EVENTS, eventsRef.current);
      
      if (sessionRef.current) {
        sessionRef.current.endTime = new Date();
      }
    };
  }, [user?.id]);

  // ── Auto-refresh Insights ──────────────────────────────────────────
  useEffect(() => {
    if (!enableAI || refreshInterval <= 0) return;

    const interval = setInterval(async () => {
      await refreshInsightsInternal();
    }, refreshInterval);

    return () => clearInterval(interval);
  }, [enableAI, refreshInterval, adaptiveUI]);

  // ── Track Event ────────────────────────────────────────────────────
  const trackEvent = useCallback((
    event: Omit<UserBehaviorEvent, "id" | "timestamp" | "sessionId">
  ) => {
    if (!enableTracking || !sessionRef.current) return;

    const fullEvent: UserBehaviorEvent = {
      ...event,
      id: generateId(),
      timestamp: new Date(),
      sessionId: sessionRef.current.id,
    };

    // Add to session
    sessionRef.current.events.push(fullEvent);
    eventsRef.current.push(fullEvent);

    // Keep only last 1000 events in storage
    if (eventsRef.current.length > 1000) {
      eventsRef.current = eventsRef.current.slice(-1000);
    }

    // Save to storage (debounced in production)
    saveToStorage(STORAGE_KEYS.BEHAVIOR_EVENTS, eventsRef.current);

    // Update frequent features based on clicks
    if (event.type === "click" && event.context.component) {
      updateFrequentFeature(event.context.component);
    }

    // Update recent items based on page views
    if (event.type === "page_view" && event.data.itemId) {
      addRecentItemInternal({
        id: event.data.itemId as string,
        type: (event.data.itemType as RecentItem["type"]) || "invoice",
        title: (event.data.title as string) || "عنصر",
        url: event.context.page,
        accessedAt: new Date(),
      });
    }
  }, [enableTracking]);

  // ── Update Frequent Features ───────────────────────────────────────
  const updateFrequentFeature = useCallback((componentId: string) => {
    setAdaptiveUI(prev => {
      const existing = prev.frequentFeatures.find(f => f.featureId === componentId);
      
      if (existing) {
        return {
          ...prev,
          frequentFeatures: prev.frequentFeatures.map(f =>
            f.featureId === componentId
              ? { ...f, useCount: f.useCount + 1, lastUsed: new Date() }
              : f
          ).sort((a, b) => b.useCount - a.useCount).slice(0, 10),
        };
      }

      const newFeature: FrequentFeature = {
        featureId: componentId,
        name: componentId,
        useCount: 1,
        lastUsed: new Date(),
        trend: "increasing",
      };

      return {
        ...prev,
        frequentFeatures: [...prev.frequentFeatures, newFeature]
          .sort((a, b) => b.useCount - a.useCount)
          .slice(0, 10),
      };
    });
  }, []);

  // ── Add Recent Item ────────────────────────────────────────────────
  const addRecentItemInternal = useCallback((item: RecentItem) => {
    setAdaptiveUI(prev => ({
      ...prev,
      recentItems: [item, ...prev.recentItems.filter(i => i.id !== item.id)].slice(0, 20),
    }));
  }, []);

  const addFrequentFeature = useCallback((feature: FrequentFeature) => {
    setAdaptiveUI(prev => ({
      ...prev,
      frequentFeatures: [feature, ...prev.frequentFeatures.filter(f => f.featureId !== feature.featureId)]
        .sort((a, b) => b.useCount - a.useCount)
        .slice(0, 10),
    }));
  }, []);

  const addRecentItem = useCallback((item: RecentItem) => {
    addRecentItemInternal(item);
  }, []);

  // ── Get Recommendations ─────────────────────────────────────────────
  const getRecommendations = useCallback((type?: RecommendationType) => {
    if (type) {
      return recommendations.filter(r => r.type === type);
    }
    return recommendations;
  }, [recommendations]);

  // ── Dismiss/Acknowledge Insights ───────────────────────────────────
  const dismissInsight = useCallback((id: string) => {
    setInsights(prev =>
      prev.map(i => i.id === id ? { ...i, status: "dismissed" as const } : i)
    );
  }, []);

  const acknowledgeInsight = useCallback((id: string) => {
    setInsights(prev =>
      prev.map(i => i.id === id ? { ...i, status: "acknowledged" as const } : i)
    );
  }, []);

  // ── Refresh Insights ───────────────────────────────────────────────
  const refreshInsightsInternal = useCallback(async () => {
    setIsLearning(true);
    
    // Simulate API call delay
    await new Promise(resolve => setTimeout(resolve, 500));
    
    const newInsights = generateSimulatedInsights(user);
    const newRecommendations = generateSimulatedRecommendations(adaptiveUI);
    
    setInsights(newInsights);
    setRecommendations(newRecommendations);
    setIsLearning(false);

    // Notify callback
    newInsights.forEach(insight => {
      if (insight.status === "new") {
        onInsightGenerated?.(insight);
      }
    });
  }, [user, adaptiveUI, onInsightGenerated]);

  const refreshInsights = useCallback(async () => {
    await refreshInsightsInternal();
  }, [refreshInsightsInternal]);

  // ── Update Preferences ─────────────────────────────────────────────
  const updatePreferences = useCallback(async (
    prefs: Partial<UserPreferences>
  ) => {
    const newPrefs = { ...preferences, ...prefs };
    setPreferences(newPrefs);
    saveToStorage(STORAGE_KEYS.PREFERENCES, newPrefs);
  }, [preferences]);

  // ── Provide Feedback ───────────────────────────────────────────────
  const provideFeedback = useCallback(async (
    itemId: string,
    feedback: "positive" | "negative"
  ) => {
    // In real implementation, send to ML service — using logger to avoid leaking data to console in production
    
    // Update recommendation relevance
    setRecommendations(prev =>
      prev.map(r =>
        r.id === itemId
          ? { ...r, relevanceScore: feedback === "positive" ? Math.min(1, r.relevanceScore + 0.1) : Math.max(0, r.relevanceScore - 0.1) }
          : r
      )
    );
  }, []);

  // ── Save Adaptive UI to Storage ─────────────────────────────────────
  useEffect(() => {
    saveToStorage(STORAGE_KEYS.ADAPTIVE_UI, adaptiveUI);
  }, [adaptiveUI]);

  // ── Context Value ─────────────────────────────────────────────────
  const contextValue: AIPersonalizationContextValue = {
    user,
    preferences,
    trackEvent,
    currentSession: sessionRef.current,
    insights,
    recommendations,
    getRecommendations,
    dismissInsight,
    acknowledgeInsight,
    adaptiveUI,
    addFrequentFeature,
    addRecentItem,
    isLearning,
    updatePreferences,
    refreshInsights,
    provideFeedback,
  };

  return (
    <AIPersonalizationContext.Provider value={contextValue}>
      <div
        className={className}
        data-ai-personalization="active"
        data-user-role={user?.role}
        data-language={preferences.language}
      >
        {children}
      </div>
    </AIPersonalizationContext.Provider>
  );
};

AIPersonalizationProvider.displayName = "AIPersonalizationProvider";

// Export types
export type {
  UserProfile,
  UserPreferences,
  AIInsight,
  Recommendation,
  AdaptiveUIState,
  BehaviorEventType,
};

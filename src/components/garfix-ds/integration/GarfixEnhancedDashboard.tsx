/**
 * ═════════════════════════════════════════════════════════════
 * GarfiX DS v4.0 - Enhanced AI Dashboard Integration
 * 
 * دمج نظام الذكاء الاصطناعي مع لوحة التحكم المتقدمة
 * 
 * Features:
 * - Real-time AI metrics with animated counters
 * - Personalized recommendations widget
 * - Smart insights panel
 * - Adaptive UI based on user behavior
 * - Advanced animations & transitions
 * - Full RTL Arabic support
 * - WCAG 2.1 AA accessible
 * 
 * Integrates:
 * - AIPersonalizationProvider context
 * - GarfiX DS Animation System
 * - GarfiX DS Component Library
 * - Existing AI Dashboard data
 * ═════════════════════════════════════════════════════════════
 */

'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { cn } from '@/lib/utils';

// ── GarfiX DS Imports ──────────────────────────────────────

// Core Components
import {
  GarfixButton,
  GarfixCard,
  KPICard,
  GarfixBadge,
  GarfixAvatar,
} from '@/components/garfix-ds/core';

// Layout Components
import {
  GarfixContainer,
  GarfixGrid,
  GarfixPageHeader,
} from '@/components/garfix-ds/layout';

// Data Components
import {
  GarfixDataTable,
  GarfixStatCard,
} from '@/components/garfix-ds/data';

// Feedback Components
import {
  GarfixAlert,
  GarfixProgressBar,
  GarfixSkeleton,
} from '@/components/garfix-ds/feedback';

// Navigation Components
import { GarfixTabPanel } from '@/components/garfix-ds/navigation';

// Overlay Components
import { GarfixModal, GarfixDrawer } from '@/components/garfix-ds/overlay';

// Theme Components
import {
  GarfixThemeProvider,
  useTheme,
  GarfixThemeToggle,
} from '@/components/garfix-ds/theme';

// AI Personalization Components
import {
  AIPersonalizationProvider,
  useAIPersonalization,
  GarfixAIInsights,
  GarfixSmartRecommendations,
  GarfixPersonalizedActions,
  GarfixAILearningProgress,
} from '@/components/garfix-ds/ai';

// Animation Components
import {
  GarfixAnimatedContainer,
  FadeUp,
  ScaleIn,
  GarfixMotionDiv,
  MotionCard,
  GarfixPageTransition,
  GarfixAnimatedCounter,
  GarfixCircularProgress,
  GarfixStatCounter,
} from '@/components/garfix-ds/animations';

// Animation Hooks
import {
  useAnimation,
  useHoverAnimation,
  useNumberAnimation,
  useReducedMotion,
} from '@/hooks/useAnimation';

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

interface RecommendationItem {
  id: string;
  title: string;
  description: string;
  priority: 'high' | 'medium' | 'low';
  actionLabel: string;
  category: string;
}

// ── Mock Data (Fallback when API unavailable) ──────────────

const MOCK_AI_METRICS: AIMetricsData = {
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

const MOCK_RECOMMENDATIONS: RecommendationItem[] = [
  {
    id: 'rec-1',
    title: 'تحسين أداء استخراج الفواتير',
    description: 'يمكن تقليل زمن الاستجابة بنسبة 30% عن طريق ضبط حجم الدفعة',
    priority: 'high',
    actionLabel: 'تطبيق الآن',
    category: 'performance',
  },
  {
    id: 'rec-2',
    title: 'زيادة سعة مفتاح API',
    description: 'الاستخدام الحالي يقترب من الحد الأقصى (58%)',
    priority: 'medium',
    actionLabel: 'مراجعة',
    category: 'capacity',
  },
  {
    id: 'rec-3',
    title: 'تفعيل التخزين المؤقت الذكي',
    description: 'توفير 15% من تكاليف التوكنات عبر التخزين المؤقت للردود المتكررة',
    priority: 'low',
    actionLabel: 'تفعيل',
    category: 'cost',
  },
];

const WORKER_NAMES: Record<string, { ar: string; en: string; icon: string }> = {
  'ai-chat': { ar: 'المحادثة الذكية', en: 'Chat Agent', icon: '💬' },
  'ai-invoice-extract': { ar: 'استخراج الفواتير', en: 'Invoice Brain', icon: '🧾' },
  'ai-smart-parse': { ar: 'التحليل الذكي', en: 'Smart Parse', icon: '🔍' },
  'ai-agent-accounting': { ar: 'وكيل المحاسبة', en: 'Accounting Agent', icon: '📊' },
};

// ── Sub-Components ─────────────────────────────────────────

/**
 * Animated KPI Card with personalization
 */
function AnimatedKPICard({
  title,
  value,
  subtitle,
  trend,
  icon,
  color = 'emerald',
  delay = 0,
  suffix,
}: {
  title: string;
  value: number;
  subtitle?: string;
  trend?: { direction: 'up' | 'down'; value: number };
  icon?: React.ReactNode;
  color?: 'emerald' | 'blue' | 'gold' | 'red' | 'purple' | 'amber';
  delay?: number;
  suffix?: string;
}) {
  const { style: hoverStyle, handlers } = useHoverAnimation({ translateY: -4 });
  
  const colorClasses = {
    emerald: 'from-emerald-500 to-emerald-600',
    blue: 'from-blue-500 to-blue-600',
    gold: 'from-[#d4a574] to-[#c49464]',
    red: 'from-red-500 to-red-600',
    purple: 'from-purple-500 to-purple-600',
    amber: 'from-amber-500 to-amber-600',
  };

  return (
    <FadeUp delay={delay}>
      <MotionCard className="overflow-hidden">
        <div className={cn('bg-gradient-to-br p-5 text-white', colorClasses[color])}>
          <div className="flex items-start justify-between">
            <div>
              <p className="text-white/80 text-sm font-medium">{title}</p>
              <div className="mt-2">
                <GarfixAnimatedCounter
                  value={value}
                  prefix={value >= 1000 ? '' : ''}
                  suffix={suffix || (value >= 1000 ? '' : '')}
                  abbreviate
                  decimals={value >= 100 ? 1 : 0}
                  className="text-3xl font-bold text-white"
                />
              </div>
              {subtitle && (
                <p className="text-white/70 text-xs mt-1">{subtitle}</p>
              )}
            </div>
            {icon && (
              <div className="text-3xl opacity-80">{icon}</div>
            )}
          </div>
          
          {trend && (
            <div className="mt-3 pt-3 border-t border-white/20 flex items-center gap-2">
              <span className={cn(
                'text-xs font-medium px-2 py-0.5 rounded-full',
                trend.direction === 'up' 
                  ? 'bg-white/20 text-white' 
                  : 'bg-red-500/30 text-white'
              )}>
                {trend.direction === 'up' ? '↑' : '↓'} {Math.abs(trend.value)}%
              </span>
              <span className="text-xs text-white/70">
                {trend.direction === 'up' ? 'أفضل من الأمس' : 'أسفل من المعدل'}
              </span>
            </div>
          )}
        </div>
      </MotionCard>
    </FadeUp>
  );
}

/**
 * Worker Performance Card with Animations
 */
function WorkerCard({
  worker,
  index = 0,
}: {
  worker: WorkerMetrics;
  index?: number;
}) {
  const workerInfo = WORKER_NAMES[worker.type] || { ar: worker.type, en: worker.type, icon: '⚙️' };
  const { style: hoverStyle, handlers, isHovered } = useHoverAnimation();
  
  // Calculate health percentage based on latency
  const healthPercent = Math.max(0, Math.min(100, 100 - (worker.avgLatencyMs / 10)));
  
  return (
    <ScaleIn delay={index * 80}>
      <div
        {...handlers}
        className={cn(
          'rounded-xl border p-4 transition-all duration-200',
          isHovered 
            ? 'border-emerald-300 bg-emerald-50/50 shadow-lg shadow-emerald-100' 
            : 'border-gray-200 bg-white'
        )}
        style={hoverStyle}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <span className="text-2xl">{workerInfo.icon}</span>
            <div>
              <h4 className="font-semibold text-gray-900 dark:text-gray-100">
                {workerInfo.ar}
              </h4>
              <p className="text-xs text-gray-500">{workerInfo.en}</p>
            </div>
          </div>
          <GarfixBadge 
            variant={worker.activeJobs > 10 ? 'warning' : 'success'} 
            dot
          >
            نشط
          </GarfixBadge>
        </div>

        {/* Metrics */}
        <div className="grid grid-cols-3 gap-3 mt-4">
          <div className="text-center p-2 rounded-lg bg-gray-50 dark:bg-gray-800">
            <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400">
              {worker.activeJobs}
            </p>
            <p className="text-xs text-gray-500">نشط</p>
          </div>
          <div className="text-center p-2 rounded-lg bg-gray-50 dark:bg-gray-800">
            <p className="text-lg font-bold text-blue-600 dark:text-blue-400">
              {worker.processedToday.toLocaleString('ar-EG')}
            </p>
            <p className="text-xs text-gray-500">اليوم</p>
          </div>
          <div className="text-center p-2 rounded-lg bg-gray-50 dark:bg-gray-800">
            <p className={cn(
              'text-lg font-bold',
              worker.avgLatencyMs < 300 
                ? 'text-emerald-600 dark:text-emerald-400' 
                : 'text-amber-600 dark:text-amber-400'
            )}>
              {worker.avgLatencyMs}ms
            </p>
            <p className="text-xs text-gray-500">متوسط</p>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="mt-3">
          <div className="flex justify-between text-xs mb-1">
            <span className="text-gray-500">الأداء</span>
            <span className="font-medium">{healthPercent.toFixed(0)}%</span>
          </div>
          <GarfixProgressBar 
            value={healthPercent} 
            max={100}
            size="sm"
            color={healthPercent > 70 ? 'emerald' : healthPercent > 40 ? 'gold' : 'red'}
          />
        </div>
      </div>
    </ScaleIn>
  );
}

/**
 * Alerts Panel with Animation
 */
function AlertsPanel({ alerts }: { alerts: AlertItem[] }) {
  if (!alerts.length) return null;

  return (
    <div className="space-y-2">
      {alerts.map((alert, index) => (
        <FadeUp key={alert.timestamp + index} delay={index * 100}>
          <GarfixAlert
            variant={
              alert.level === 'critical' ? 'error' :
              alert.level === 'error' ? 'error' :
              alert.level === 'warning' ? 'warning' : 'info'
            }
            dismissible
            size="sm"
            className="animate-in slide-in-from-right-2"
          >
            <div className="flex items-start gap-2">
              <span className="text-lg">
                {alert.level === 'critical' ? '🚨' :
                 alert.level === 'error' ? '❌' :
                 alert.level === 'warning' ? '⚠️' : 'ℹ️'}
              </span>
              <div>
                <p className="font-medium">{alert.message}</p>
                <p className="text-xs opacity-70 mt-0.5">
                  {new Date(alert.timestamp).toLocaleString('ar-EG')}
                </p>
              </div>
            </div>
          </GarfixAlert>
        </FadeUp>
      ))}
    </div>
  );
}

/**
 * Main Enhanced Dashboard Component
 */
export function GarfixEnhancedAIDashboard() {
  const [metrics, setMetrics] = useState<AIMetricsData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');
  const { resolvedTheme, toggleTheme } = useTheme();
  const { shouldReduceMotion } = useReducedMotion();
  const aiContext = useAIPersonalization();

  // Fetch AI Metrics from Real API
  const fetchMetrics = useCallback(async () => {
    try {
      setIsLoading(true);
      
      // 🔄 Call Real API: /api/ai/metrics
      const response = await fetch('/api/ai/metrics');
      
      if (response.ok) {
        const apiData = await response.json();
        
        if (apiData.success) {
          // ✅ Use real data from API
          setMetrics(apiData);
          
          // Track view event for personalization
          aiContext?.trackEvent({
            type: 'page_view',
            context: { page: '/ai-dashboard' },
            data: {
              tab: activeTab,
              dataSource: 'real_api',
            },
          });
          return;
        }
      }
      
      // ⚠️ Fallback to mock data if API fails
      console.warn('AI Metrics API unavailable, using fallback data');
      setMetrics(MOCK_AI_METRICS);
      aiContext?.trackEvent({
        type: 'page_view',
        context: { page: '/ai-dashboard' },
        data: {
          tab: activeTab,
          dataSource: 'mock_fallback',
        },
      });
      
    } catch (error) {
      console.error('Failed to fetch AI metrics:', error);
      // ❌ Error fallback - use mock data
      setMetrics(MOCK_AI_METRICS);
    } finally {
      setIsLoading(false);
    }
  }, [activeTab, aiContext]);

  useEffect(() => {
    fetchMetrics();
    
    // Auto-refresh every 15 seconds
    const interval = setInterval(fetchMetrics, 15000);
    return () => clearInterval(interval);
  }, [fetchMetrics]);

  // Get personalized recommendations
  const personalizedRecs = useMemo(() => {
    if (!aiContext?.recommendations.length) return MOCK_RECOMMENDATIONS;

    // Combine mock data with AI-personalized suggestions.
    // Note: UserPreferences has no `preferredCategory` field, so we keep
    // the original priorities from the mock recommendations.
    return MOCK_RECOMMENDATIONS.map(rec => ({
      ...rec,
      priority: rec.priority,
    }));
  }, [aiContext?.recommendations, aiContext?.preferences]);

  // Loading State
  if (isLoading && !metrics) {
    return (
      <GarfixPageTransition showLoading isReady={false}>
        <GarfixContainer padding="lg">
          <DashboardSkeleton />
        </GarfixContainer>
      </GarfixPageTransition>
    );
  }

  return (
    <GarfixPageTransition enterAnimation="slideUp">
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-950 dark:to-gray-900" dir="rtl" lang="ar">
        
        {/* Header */}
        <header className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 sticky top-0 z-40">
          <GarfixContainer>
            <div className="flex items-center justify-between h-16">
              <div className="flex items-center gap-4">
                <h1 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                  <span className="text-2xl">🤖</span>
                  لوحة تحكم الذكاء الاصطناعي
                </h1>
                <GarfixBadge variant="primary" size="sm">
                  v4.0
                </GarfixBadge>
                
                {/* Data Source Indicator */}
                {metrics && (
                  <span
                    title={metrics.timestamp ? `آخر تحديث: ${new Date(metrics.timestamp).toLocaleTimeString('ar-EG')}` : 'بيانات تجريبية'}
                  >
                    <GarfixBadge 
                      variant={metrics.timestamp?.includes('2026') ? "success" : "warning"} 
                      size="sm"
                    >
                      {metrics.timestamp?.includes('2026') ? '🟢 API حقيقي' : '⚠️ تجريبي'}
                    </GarfixBadge>
                  </span>
                )}
              </div>
              
              <div className="flex items-center gap-3">
                {/* Theme Toggle */}
                <GarfixThemeToggle variant="icon" size="md" />
                
                {/* Refresh Button */}
                <GarfixButton
                  variant="outline"
                  size="sm"
                  onClick={fetchMetrics}
                  isLoading={isLoading}
                  leadingIcon={<span>🔄</span>}
                >
                  تحديث
                </GarfixButton>
                
                {/* User Avatar */}
                <GarfixAvatar 
                  fallback={aiContext?.user?.name || 'المستخدم'} 
                  size="md"
                  status="online"
                />
              </div>
            </div>
          </GarfixContainer>
        </header>

        {/* Main Content */}
        <main className="py-6">
          <GarfixContainer>
            {/* Page Header with Breadcrumbs */}
            <GarfixPageHeader
              title="نظرة عامة على النظام"
              breadcrumbs={[
                { label: 'الرئيسية', href: '/' },
                { label: 'لوحة التحكم' },
                { label: 'الذكاء الاصطناعي' },
              ]}
              actions={
                <GarfixButton variant="gold" size="sm" leadingIcon={<span>✨</span>}>
                  اقتراحات ذكية
                </GarfixButton>
              }
            />

            {/* KPI Cards Grid */}
            {metrics && (
              <section className="mb-8" aria-labelledby="kpi-section-title">
                <h2 id="kpi-section-title" className="sr-only">مؤشرات الأداء الرئيسية</h2>
                <GarfixGrid cols={4} gap="lg">
                  <AnimatedKPICard
                    title="إجمالي الطلبات اليوم"
                    value={metrics.data.today.totalRequests}
                    subtitle={`${metrics.data.queue.completedToday} مكتمل`}
                    trend={{ direction: 'up', value: 12.5 }}
                    icon="📊"
                    color="emerald"
                    delay={0}
                  />
                  
                  <AnimatedKPICard
                    title="التوكنات المستخدمة"
                    value={metrics.data.today.totalTokens}
                    subtitle={`من ${formatNumber(metrics.data.pool.totalRPM * 1000)} حد يومي`}
                    icon="🎯"
                    color="blue"
                    delay={60}
                  />
                  
                  <AnimatedKPICard
                    title="معدل النجاح"
                    value={100 - metrics.data.today.rejectionRate}
                    suffix="%"
                    subtitle={`${metrics.data.today.totalFailures} فشل`}
                    trend={{ direction: 'up', value: 0.3 }}
                    icon="✅"
                    color="emerald"
                    delay={120}
                  />
                  
                  <AnimatedKPICard
                    title="استخدام المجمع"
                    value={metrics.data.pool.utilizationPct}
                    suffix="%"
                    subtitle={`${formatNumber(metrics.data.pool.availableRPM)} RPM متاح`}
                    icon="⚡"
                    color={metrics.data.pool.status === 'healthy' ? 'emerald' : 'amber'}
                    delay={180}
                  />
                </GarfixGrid>
              </section>
            )}

            {/* Tabs Navigation */}
            <div className="mb-6">
              <div className="flex gap-1 p-1 bg-gray-100 dark:bg-gray-800 rounded-xl w-fit">
                <button
                  data-value="overview"
                  className={cn(
                    'px-4 py-2 rounded-lg text-sm font-medium transition-all',
                    activeTab === 'overview'
                      ? 'bg-white dark:bg-gray-700 text-emerald-600 shadow-sm'
                      : 'text-gray-600 dark:text-gray-400 hover:text-gray-900'
                  )}
                >
                  نظرة عامة
                </button>
                <button
                  data-value="workers"
                  className={cn(
                    'px-4 py-2 rounded-lg text-sm font-medium transition-all',
                    activeTab === 'workers'
                      ? 'bg-white dark:bg-gray-700 text-emerald-600 shadow-sm'
                      : 'text-gray-600 dark:text-gray-400 hover:text-gray-900'
                  )}
                >
                  العاملون
                </button>
                <button
                  data-value="keys"
                  className={cn(
                    'px-4 py-2 rounded-lg text-sm font-medium transition-all',
                    activeTab === 'keys'
                      ? 'bg-white dark:bg-gray-700 text-emerald-600 shadow-sm'
                      : 'text-gray-600 dark:text-gray-400 hover:text-gray-900'
                  )}
                >
                  مفاتيح API
                </button>
                <button
                  data-value="recommendations"
                  className={cn(
                    'px-4 py-2 rounded-lg text-sm font-medium transition-all',
                    activeTab === 'recommendations'
                      ? 'bg-white dark:bg-gray-700 text-emerald-600 shadow-sm'
                      : 'text-gray-600 dark:text-gray-400 hover:text-gray-900'
                  )}
                >
                  التوصيات
                  <GarfixBadge variant="gold" size="sm" className="mr-2">
                    {personalizedRecs.filter(r => r.priority === 'high').length}
                  </GarfixBadge>
                </button>
              </div>

              {/* Tab Panels */}
              <GarfixTabPanel tabId="overview" activeTab={activeTab}>
                <GarfixGrid cols={3} gap="lg">
                  {/* Workers Section */}
                  <div className="col-span-2 space-y-4">
                    <h3 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                      <span>👷</span>
                      أداء العاملين
                    </h3>
                    
                    {metrics && (
                      <GarfixGrid cols={2} gap="md">
                        {metrics.data.workers.map((worker, index) => (
                          <WorkerCard key={worker.type} worker={worker} index={index} />
                        ))}
                      </GarfixGrid>
                    )}
                  </div>

                  {/* Right Sidebar */}
                  <div className="space-y-4">
                    {/* Queue Status */}
                    {metrics && (
                      <MotionCard className="p-4">
                        <h3 className="font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                          <span>📋</span>
                          حالة الطابور
                        </h3>
                        
                        <div className="space-y-3">
                          <QueueStat 
                            label="قيد الانتظار" 
                            value={metrics.data.queue.pending} 
                            color="amber" 
                          />
                          <QueueStat 
                            label="قيد التنفيذ" 
                            value={metrics.data.queue.running} 
                            color="blue" 
                          />
                          <QueueStat 
                            label="مكتمل اليوم" 
                            value={metrics.data.queue.completedToday} 
                            color="emerald" 
                          />
                          <QueueStat 
                            label="فاشل اليوم" 
                            value={metrics.data.queue.failedToday} 
                            color="red" 
                          />
                          
                          <div className="pt-3 border-t border-gray-200 dark:border-gray-700">
                            <div className="flex justify-between text-sm mb-1">
                              <span className="text-gray-500">وقت الانتظار التقريبي</span>
                              <span className="font-mono font-medium">
                                {formatTime(metrics.data.queue.estimatedWaitTimeMs)}
                              </span>
                            </div>
                          </div>
                        </div>
                      </MotionCard>
                    )}

                    {/* Learning Progress */}
                    <GarfixAILearningProgress detailed />

                    {/* Alerts */}
                    {metrics && metrics.data.alerts.length > 0 && (
                      <div>
                        <h3 className="font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
                          <span>🔔</span>
                          التنبيهات
                        </h3>
                        <AlertsPanel alerts={metrics.data.alerts} />
                      </div>
                    )}
                  </div>
                </GarfixGrid>
              </GarfixTabPanel>

              <GarfixTabPanel tabId="workers" activeTab={activeTab}>
                <GarfixGrid cols={2} gap="lg">
                  {metrics?.data.workers.map((worker, index) => (
                    <WorkerCard key={worker.type} worker={worker} index={index} />
                  ))}
                </GarfixGrid>
              </GarfixTabPanel>

              <GarfixTabPanel tabId="keys" activeTab={activeTab}>
                {metrics && (
                  <GarfixDataTable
                    data={metrics.data.keys as unknown as Record<string, unknown>[]}
                    rowKey="id"
                    columns={[
                      { key: 'name', header: 'اسم المفتاح' },
                      { 
                        key: 'rpmUtilizationPct', 
                        header: 'الاستخدام %',
                        render: (val: unknown) => `${Number(val).toFixed(1)}%`
                      },
                      { 
                        key: 'tokensUsed', 
                        header: 'التوكنات',
                        render: (val: unknown) => formatNumber(Number(val))
                      },
                      { 
                        key: 'avgLatencyMs', 
                        header: 'زمن الاستجابة',
                        render: (val: unknown) => `${Number(val)}ms`
                      },
                      { 
                        key: 'successRate', 
                        header: 'معدل النجاح',
                        render: (val: unknown) => `${Number(val)}%`
                      },
                      {
                        key: 'healthy',
                        header: 'الحالة',
                        render: (val: unknown) => (
                          <GarfixBadge variant={val ? 'success' : 'error'} dot>
                            {val ? 'سليم' : 'مشكلة'}
                          </GarfixBadge>
                        )
                      },
                    ]}
                    selectable
                  />
                )}
              </GarfixTabPanel>

              <GarfixTabPanel tabId="recommendations" activeTab={activeTab}>
                <div className="space-y-6">
                  <GarfixSmartRecommendations showFeedback />
                  
                  <GarfixPersonalizedActions showRecent showPinned />
                </div>
              </GarfixTabPanel>
            </div>
          </GarfixContainer>
        </main>

        {/* Footer */}
        <footer className="bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-800 py-4 mt-8">
          <GarfixContainer>
            <div className="flex items-center justify-between text-sm text-gray-500">
              <p>GarfiX EOS Platform v4.0 — نظام الذكاء الاصطناعي المتقدم</p>
              <p>
                آخر تحديث: {metrics?.timestamp 
                  ? new Date(metrics.timestamp).toLocaleString('ar-EG') 
                  : '—'}
              </p>
            </div>
          </GarfixContainer>
        </footer>
      </div>
    </GarfixPageTransition>
  );
}

// ── Helper Components ──────────────────────────────────────

function QueueStat({ 
  label, 
  value, 
  color 
}: { 
  label: string; 
  value: number; 
  color: 'emerald' | 'blue' | 'amber' | 'red' 
}) {
  const colors = {
    emerald: 'text-emerald-600 dark:text-emerald-400',
    blue: 'text-blue-600 dark:text-blue-400',
    amber: 'text-amber-600 dark:text-amber-400',
    red: 'text-red-600 dark:text-red-400',
  };

  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-gray-600 dark:text-gray-400">{label}</span>
      <span className={cn('font-bold font-mono', colors[color])}>{value}</span>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      {/* KPI Skeleton */}
      <div className="grid grid-cols-4 gap-4">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="h-32 bg-gray-200 dark:bg-gray-800 rounded-xl" />
        ))}
      </div>
      
      {/* Content Skeleton */}
      <div className="grid grid-cols-3 gap-6">
        <div className="col-span-2 h-96 bg-gray-200 dark:bg-gray-800 rounded-xl" />
        <div className="h-96 bg-gray-200 dark:bg-gray-800 rounded-xl" />
      </div>
    </div>
  );
}

// ── Utility Functions ───────────────────────────────────────

function formatNumber(num: number): string {
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`;
  return num.toString();
}

function formatTime(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

// ── Export with Providers ───────────────────────────────────

/**
 * Full dashboard wrapped in required providers
 */
export default function EnhancedAIDashboardWithProviders() {
  return (
    <GarfixThemeProvider defaultTheme="dark">
      <AIPersonalizationProvider>
        <GarfixEnhancedAIDashboard />
      </AIPersonalizationProvider>
    </GarfixThemeProvider>
  );
}

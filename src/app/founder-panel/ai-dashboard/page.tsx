"use client";

/**
 * ═════════════════════════════════════════════════════════════
 * GarfiX AI - Enterprise Dashboard (لوحة تحكم الذكاء الاصطناعي)
 * 
 * Real-time monitoring for:
 * - Pool status & utilization
 * - Per-key health & quota tracking  
 * - Worker performance metrics
 * - Queue depth & wait times
 * - Alerts & notifications
 * 
 * Auto-refreshes every 10 seconds
 * RTL support for Arabic interface
 * ═════════════════════════════════════════════════════════════
 */

import React, { useState, useEffect, useCallback } from 'react';

// ── Types ───────────────────────────────────────────────────

interface KeyMetrics {
  id: string;
  name: string;
  healthy: boolean;
  circuitState: string;
  rpmUsed: number;
  rpmLimit: number;
  rpmUtilizationPct: number;
  tokensUsed: number;
  tokensLimit: number;
  tokensUtilizationPct: number;
  avgLatencyMs: number;
  successRate: number;
  consecutiveFailures: number;
  lastError?: string;
  lastUsed?: string;
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

interface TodayMetrics {
  totalRequests: number;
  totalTokens: number;
  totalFailures: number;
  rejectionRate: number;
}

interface Alert {
  level: 'info' | 'warning' | 'error' | 'critical';
  message: string;
  keyId?: string;
  timestamp: string;
}

interface PoolStatus {
  totalRPM: number;
  usedRPM: number;
  availableRPM: number;
  utilizationPct: number;
  status: 'healthy' | 'degraded' | 'critical';
}

interface AIMetricsData {
  success: boolean;
  timestamp: string;
  data: {
    pool: PoolStatus;
    keys: KeyMetrics[];
    workers: WorkerMetrics[];
    queue: QueueMetrics;
    today: TodayMetrics;
    alerts: Alert[];
  };
}

// ── Helpers ─────────────────────────────────────────────────

function formatNumber(num: number): string {
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`;
  return num.toString();
}

function formatTime(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function getStatusColor(status: string): string {
  switch (status) {
    case 'healthy': return 'text-green-600 bg-green-50 border-green-200';
    case 'degraded': return 'text-yellow-600 bg-yellow-50 border-yellow-200';
    case 'critical': return 'text-red-600 bg-red-50 border-red-200';
    default: return 'text-gray-600 bg-gray-50 border-gray-200';
  }
}

function getAlertIcon(level: string): string {
  switch (level) {
    case 'info': return 'ℹ️';
    case 'warning': return '⚠️';
    case 'error': return '❌';
    case 'critical': return '🚨';
    default: return '📋';
  }
}

function getAlertBg(level: string): string {
  switch (level) {
    case 'info': return 'bg-blue-50 border-blue-200';
    case 'warning': return 'bg-yellow-50 border-yellow-200';
    case 'error': return 'bg-red-50 border-red-200';
    case 'critical': return 'bg-red-100 border-red-300';
    default: return 'bg-gray-50 border-gray-200';
  }
}

const WORKER_NAMES: Record<string, { ar: string; en: string; icon: string }> = {
  'ai-chat': { ar: 'المحادثة الذكية', en: 'Chat Agent', icon: '💬' },
  'ai-invoice-extract': { ar: 'استخراج الفواتير', en: 'Invoice Brain', icon: '🧾' },
  'ai-smart-parse': { ar: 'التحليل الذكي', en: 'Smart Parse', icon: '🔍' },
  'ai-agent-accounting': { ar: 'وكيل المحاسبة', en: 'Accounting Agent', icon: '📊' },
  'ai-agent-sales': { ar: 'وكيل المبيعات', en: 'Sales Agent', icon: '💰' },
  'ai-agent-inventory': { ar: 'وكيل المخزون', en: 'Inventory Agent', icon: '📦' },
};

// ── Sub-Components ─────────────────────────────────────────

function MetricCard({ 
  title, 
  value, 
  subtitle, 
  trend,
  color = "blue" 
}: { 
  title: string; 
  value: string | number; 
  subtitle?: string;
  trend?: 'up' | 'down' | 'stable';
  color?: 'blue' | 'green' | 'yellow' | 'red' | 'purple';
}) {
  const colors = {
    blue: 'from-blue-500 to-blue-600',
    green: 'from-green-500 to-green-600',
    yellow: 'from-yellow-500 to-yellow-600',
    red: 'from-red-500 to-red-600',
    purple: 'from-purple-500 to-purple-600',
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
      <div className={`bg-gradient-to-r ${colors[color]} p-4`}>
        <p className="text-white/80 text-sm font-medium">{title}</p>
        <p className="text-white text-3xl font-bold mt-1">{value}</p>
        {subtitle && (
          <p className="text-white/70 text-xs mt-1">{subtitle}</p>
        )}
      </div>
      {trend && (
        <div className="px-4 py-2 bg-gray-50 flex items-center justify-between">
          <span className="text-xs text-gray-500">الاتجاه</span>
          <span className={`text-xs font-medium ${
            trend === 'up' ? 'text-green-600' : 
            trend === 'down' ? 'text-red-600' : 'text-gray-600'
          }`}>
            {trend === 'up' ? '⬆️ مرتفع' : trend === 'down' ? '⬇️ منخفض' : '➡️ مستقر'}
          </span>
        </div>
      )}
    </div>
  );
}

function KeyHealthCard({ k }: { k: KeyMetrics }) {
  const isHealthy = k.healthy && k.circuitState === 'closed';
  
  return (
    <div className={`rounded-lg border p-4 transition-all ${
      isHealthy ? 'border-green-200 bg-green-50/30' : 'border-red-200 bg-red-50/30'
    }`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className={`w-3 h-3 rounded-full ${
            isHealthy ? 'bg-green-500 animate-pulse' : 'bg-red-500'
          }`} />
          <h4 className="font-semibold text-gray-900">{k.name}</h4>
        </div>
        <span className={`text-xs px-2 py-1 rounded-full font-medium ${
          getStatusColor(k.circuitState === 'closed' ? 'healthy' : 'critical')
        }`}>
          {k.circuitState === 'closed' ? 'نشط' : 'معطّل'}
        </span>
      </div>

      {/* RPM Usage */}
      <div className="mb-3">
        <div className="flex justify-between text-sm mb-1">
          <span className="text-gray-600">استخدام RPM</span>
          <span className="font-mono font-medium">{k.rpmUsed} / {k.rpmLimit}</span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2">
          <div 
            className={`h-2 rounded-full transition-all ${
              k.rpmUtilizationPct > 80 ? 'bg-red-500' :
              k.rpmUtilizationPct > 50 ? 'bg-yellow-500' : 'bg-green-500'
            }`}
            style={{ width: `${Math.min(k.rpmUtilizationPct, 100)}%` }}
          />
        </div>
      </div>

      {/* Token Quota */}
      <div className="mb-3">
        <div className="flex justify-between text-sm mb-1">
          <span className="text-gray-600">الحصة اليومية (Tokens)</span>
          <span className="font-mono text-xs">{formatNumber(k.tokensUsed)} / {formatNumber(k.tokensLimit)}</span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-1.5">
          <div 
            className={`h-1.5 rounded-full transition-all ${
              k.tokensUtilizationPct > 90 ? 'bg-red-500' :
              k.tokensUtilizationPct > 70 ? 'bg-yellow-500' : 'bg-green-500'
            }`}
            style={{ width: `${Math.min(k.tokensUtilizationPct, 100)}%` }}
          />
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-3 sm:grid-cols-3 gap-2 text-center text-xs">
        <div className="bg-white rounded p-2">
          <p className="text-gray-500">التأخير</p>
          <p className="font-mono font-semibold">{formatTime(k.avgLatencyMs)}</p>
        </div>
        <div className="bg-white rounded p-2">
          <p className="text-gray-500">نجاح</p>
          <p className="font-mono font-semibold">{k.successRate}%</p>
        </div>
        <div className="bg-white rounded p-2">
          <p className="text-gray-500">فشل متتالي</p>
          <p className={`font-mono font-semibold ${
            k.consecutiveFailures > 0 ? 'text-red-600' : 'text-green-600'
          }`}>
            {k.consecutiveFailures}
          </p>
        </div>
      </div>

      {/* Last Error */}
      {k.lastError && (
        <div className="mt-3 p-2 bg-red-100 rounded text-xs text-red-700 font-mono truncate">
          ⚠️ {k.lastError}
        </div>
      )}
    </div>
  );
}

function WorkerCard({ worker }: { worker: WorkerMetrics }) {
  const info = WORKER_NAMES[worker.type] || { 
    ar: worker.type, 
    en: worker.type, 
    icon: '🤖' 
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4 hover:shadow-md transition-shadow">
      <div className="flex items-center gap-3 mb-3">
        <span className="text-2xl">{info.icon}</span>
        <div>
          <h4 className="font-semibold text-gray-900">{info.ar}</h4>
          <p className="text-xs text-gray-500">{info.en}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-center">
        <div className="bg-blue-50 rounded p-2">
          <p className="text-xs text-blue-600">نشط</p>
          <p className="font-bold text-blue-900">{worker.activeJobs}</p>
        </div>
        <div className="bg-green-50 rounded p-2">
          <p className="text-xs text-green-600">اليوم</p>
          <p className="font-bold text-green-900">{formatNumber(worker.processedToday)}</p>
        </div>
        <div className="bg-purple-50 rounded p-2">
          <p className="text-xs text-purple-600">متوسط</p>
          <p className="font-bold text-purple-900">{formatTime(worker.avgLatencyMs)}</p>
        </div>
      </div>
    </div>
  );
}

function AlertCard({ alert }: { alert: Alert }) {
  return (
    <div className={`rounded-lg border p-3 ${getAlertBg(alert.level)}`}>
      <div className="flex items-start gap-2">
        <span className="text-lg">{getAlertIcon(alert.level)}</span>
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-medium ${
            alert.level === 'critical' ? 'text-red-800' :
            alert.level === 'error' ? 'text-red-700' :
            alert.level === 'warning' ? 'text-yellow-800' : 'text-blue-700'
          }`}>
            {alert.message}
          </p>
          <p className="text-xs opacity-70 mt-1">
            {new Date(alert.timestamp).toLocaleTimeString('ar-EG')}
          </p>
        </div>
      </div>
    </div>
  );
}

function UtilizationGauge({ value, max = 100 }: { value: number; max?: number }) {
  const percentage = Math.min((value / max) * 100, 100);
  const rotation = (percentage / 100) * 180 - 90; // -90 to 90 degrees
  
  let color = '#22c55e'; // green
  if (percentage > 75) color = '#ef4444'; // red
  else if (percentage > 50) color = '#eab308'; // yellow

  return (
    <div className="relative w-32 h-16 mx-auto overflow-hidden">
      <svg viewBox="0 0 100 50" className="w-full h-full">
        {/* Background arc */}
        <path
          d="M 10 45 A 40 40 0 0 1 90 45"
          fill="none"
          stroke="#e5e7eb"
          strokeWidth="8"
          strokeLinecap="round"
        />
        {/* Value arc */}
        <path
          d="M 10 45 A 40 40 0 0 1 90 45"
          fill="none"
          stroke={color}
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={`${percentage * 1.256} 126`}
          transform="rotate(-90 50 45)"
        />
      </svg>
      <div className="absolute inset-0 flex items-end justify-center pb-1">
        <span className="text-lg font-bold" style={{ color }}>
          {Math.round(percentage)}%
        </span>
      </div>
    </div>
  );
}

// ── Main Dashboard Component ────────────────────────────────

export default function AIDashboardPage() {
  const [data, setData] = useState<AIMetricsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'keys' | 'workers' | 'queue'>('overview');

  // Fetch metrics
  const fetchMetrics = useCallback(async () => {
    try {
      setError(null);
      const response = await fetch('/api/ai/metrics');
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const result: AIMetricsData = await response.json();
      
      if (result.success) {
        setData(result);
        setLastUpdate(new Date());
      } else {
        throw new Error((result as { error?: string }).error || '' || 'Failed to fetch metrics');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial fetch + auto-refresh
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- async data fetching with auto-refresh interval
    fetchMetrics();
    
    if (autoRefresh) {
      const interval = setInterval(fetchMetrics, 10_000); // 10 seconds
      return () => clearInterval(interval);
    }
  }, [fetchMetrics, autoRefresh]);

  // Manual refresh handler
  const handleRefresh = () => {
    setLoading(true);
    fetchMetrics();
  };

  // Reset quotas handler
  const handleResetQuotas = async () => {
    if (!confirm('هل أنت متأكد من إعادة تعيين الحصص اليومية؟')) return;
    
    try {
      const response = await fetch('/api/ai/metrics?action=reset-quotas', { method: 'POST' });
      const result = await response.json();
      
      if (result.success) {
        alert('✅ تم إعادة تعيين الحصص بنجاح');
        fetchMetrics();
      } else {
        alert(`❌ خطأ: ${result.error}`);
      }
    } catch (err) {
      alert(`❌ خطأ: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  // Loading state
  if (loading && !data) {
    return (
      <main className="min-h-screen bg-gray-50 p-4 md:p-8" dir="rtl">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-center min-h-[60vh]">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-violet-600 mx-auto mb-4"></div>
              <p className="text-gray-500 font-medium">جاري تحميل بيانات الذكاء الاصطناعي...</p>
              <p className="text-sm text-gray-400 mt-2">AI Metrics Loading...</p>
            </div>
          </div>
        </div>
      </main>
    );
  }

  // Error state
  if (error && !data) {
    return (
      <main className="min-h-screen bg-gray-50 p-4 md:p-8" dir="rtl">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-center min-h-[60vh]">
            <div className="text-center bg-red-50 rounded-xl p-8 max-w-md">
              <div className="text-5xl mb-4">😵</div>
              <h2 className="text-xl font-bold text-red-800 mb-2">خطأ في تحميل البيانات</h2>
              <p className="text-red-600 mb-4">{error}</p>
              <button
                onClick={handleRefresh}
                className="px-6 py-2 bg-violet-600 text-white rounded-lg hover:bg-violet-700 transition-colors"
              >
                🔄 إعادة المحاولة
              </button>
            </div>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-50 p-4 md:p-8" dir="rtl">
      <div className="max-w-7xl mx-auto space-y-6">
        
        {/* ── Header ──────────────────────────────────────── */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-gray-900 flex items-center gap-3">
              <span className="text-4xl">🤖</span>
              لوحة تحكم الذكاء الاصطناعي
            </h1>
            <p className="text-gray-500 mt-1">GarfiX AI Enterprise Dashboard</p>
          </div>
          
          <div className="flex items-center gap-3">
            {/* Auto-refresh toggle */}
            <label className="flex items-center gap-2 bg-white px-3 py-2 rounded-lg border cursor-pointer">
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
                className="rounded text-violet-600"
              />
              <span className="text-sm text-gray-600">تحديث تلقائي</span>
            </label>
            
            {/* Refresh button */}
            <button
              onClick={handleRefresh}
              disabled={loading}
              className="px-4 py-2 bg-violet-600 text-white rounded-lg hover:bg-violet-700 disabled:opacity-50 transition-colors flex items-center gap-2"
            >
              <span className={loading ? 'animate-spin' : ''}>🔄</span>
              تحديث
            </button>

            {/* Reset button (admin only) */}
            <button
              onClick={handleResetQuotas}
              className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors text-sm"
            >
              ↺ إعادة الحصص
            </button>
          </div>
        </div>

        {/* Last update time */}
        {lastUpdate && (
          <p className="text-xs text-gray-400">
            آخر تحديث: {lastUpdate.toLocaleTimeString('ar-EG')} • 
            {autoRefresh && ' تحديث كل 10 ثوانٍ'}
          </p>
        )}

        {/* ── Pool Status Banner ───────────────────────── */}
        {data?.data.pool && (
          <div className={`rounded-xl border-2 p-6 ${
            data.data.pool.status === 'healthy' ? 'border-green-200 bg-green-50' :
            data.data.pool.status === 'degraded' ? 'border-yellow-200 bg-yellow-50' :
            'border-red-200 bg-red-50'
          }`}>
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
              
              {/* Gauge */}
              <div className="flex-shrink-0">
                <UtilizationGauge value={data.data.pool.utilizationPct} />
                <p className="text-center text-sm font-medium mt-2 text-gray-700">
                  استهلاك المجمع
                </p>
              </div>

              {/* Stats */}
              <div className="flex-1 grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="text-center">
                  <p className="text-sm text-gray-600">إجمالي السعة</p>
                  <p className="text-2xl font-bold text-gray-900">{data.data.pool.totalRPM}</p>
                  <p className="text-xs text-gray-500">RPM</p>
                </div>
                <div className="text-center">
                  <p className="text-sm text-gray-600">المستخدم</p>
                  <p className="text-2xl font-bold text-violet-600">{data.data.pool.usedRPM}</p>
                  <p className="text-xs text-gray-500">RPM</p>
                </div>
                <div className="text-center">
                  <p className="text-sm text-gray-600">المتبقي</p>
                  <p className="text-2xl font-bold text-green-600">{data.data.pool.availableRPM}</p>
                  <p className="text-xs text-gray-500">RPM</p>
                </div>
                <div className="text-center">
                  <p className="text-sm text-gray-600">الحالة</p>
                  <p className={`text-lg font-bold ${
                    data.data.pool.status === 'healthy' ? 'text-green-600' :
                    data.data.pool.status === 'degraded' ? 'text-yellow-600' : 'text-red-600'
                  }`}>
                    {data.data.pool.status === 'healthy' ? '✅ سليم' :
                     data.data.pool.status === 'degraded' ? '⚠️ منخفض' : '🚨 حرج'}
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── Tabs Navigation ────────────────────────────── */}
        <div className="flex gap-2 overflow-x-auto pb-2">
          {[
            { id: 'overview', label: 'نظرة عامة', icon: '📊' },
            { id: 'keys', label: 'المفاتيح', icon: '🔑' },
            { id: 'workers', label: 'العاملين', icon: '🤖' },
            { id: 'queue', label: 'الطوابير', icon: '📋' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as typeof activeTab)}
              className={`px-4 py-2 rounded-lg font-medium whitespace-nowrap transition-all ${
                activeTab === tab.id
                  ? 'bg-violet-600 text-white shadow-lg'
                  : 'bg-white text-gray-600 hover:bg-gray-100'
              }`}
            >
              <span className="ml-1">{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </div>

        {/* ── Tab Content: Overview ──────────────────────── */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            
            {/* Today's Summary Cards */}
            {data?.data.today && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <MetricCard
                  title="إجمالي الطلبات اليوم"
                  value={formatNumber(data.data.today.totalRequests)}
                  subtitle={`${formatNumber(data.data.today.totalTokens)} tokens مستخدمة`}
                  color="blue"
                />
                <MetricCard
                  title="معدل النجاح"
                  value={`${Math.max(0, 100 - data.data.today.rejectionRate)}%`}
                  subtitle={`${data.data.today.totalFailures} فشل`}
                  color={data.data.today.rejectionRate < 1 ? 'green' : data.data.today.rejectionRate < 5 ? 'yellow' : 'red'}
                />
                <MetricCard
                  title="العاملين النشطين"
                  value={data.data.workers.filter(w => w.activeJobs > 0).length}
                  subtitle={`من ${data.data.workers.length} إجمالي`}
                  color="purple"
                />
                <MetricCard
                  title="وقت الانتظار"
                  value={formatTime(data.data.queue.estimatedWaitTimeMs)}
                  subtitle={`${data.data.queue.pending} في الطابور`}
                  color={data.data.queue.estimatedWaitTimeMs > 5000 ? 'red' : 'green'}
                />
              </div>
            )}

            {/* Alerts Section */}
            {data?.data.alerts && data.data.alerts.length > 0 && (
              <div className="space-y-3">
                <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                  🔔 التنبيهات ({data.data.alerts.length})
                </h3>
                <div className="grid gap-3 md:grid-cols-2">
                  {data.data.alerts.map((alert) => (
                    <AlertCard key={alert.timestamp} alert={alert} />
                  ))}
                </div>
              </div>
            )}

            {/* Quick Stats */}
            <div className="grid md:grid-cols-2 gap-6">
              {/* Workers Overview */}
              {data?.data.workers && (
                <div className="bg-white rounded-xl border border-gray-200 p-6">
                  <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
                    🤖 أداء العاملين
                  </h3>
                  <div className="space-y-3">
                    {data.data.workers.map((worker) => (
                      <WorkerCard key={worker.type} worker={worker} />
                    ))}
                  </div>
                </div>
              )}

              {/* Keys Quick View */}
              {data?.data.keys && (
                <div className="bg-white rounded-xl border border-gray-200 p-6">
                  <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
                    🔑 حالة المفاتيح
                  </h3>
                  <div className="space-y-3">
                    {data.data.keys.map((key) => (
                      <KeyHealthCard key={key.id} k={key} />
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Tab Content: Keys ──────────────────────────── */}
        {activeTab === 'keys' && data?.data.keys && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-gray-900 text-lg">
                🔑 تفاصيل مفاتيح Gemini ({data.data.keys.length} مفتاح)
              </h3>
              <span className="text-sm text-gray-500">
                الصحيحة: {data.data.keys.filter(k => k.healthy).length} / {data.data.keys.length}
              </span>
            </div>
            
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
              {data.data.keys.map((key) => (
                <KeyHealthCard key={key.id} k={key} />
              ))}
            </div>
          </div>
        )}

        {/* ── Tab Content: Workers ───────────────────────── */}
        {activeTab === 'workers' && data?.data.workers && (
          <div className="space-y-4">
            <h3 className="font-semibold text-gray-900 text-lg">
              🤖 تفاصيل العاملين الذكياء ({data.data.workers.length})
            </h3>
            
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
              {data.data.workers.map((worker) => (
                <WorkerCard key={worker.type} worker={worker} />
              ))}
            </div>

            {/* Workers Summary Table */}
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mt-6">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-right font-medium text-gray-700">العامل</th>
                    <th className="px-4 py-3 text-center font-medium text-gray-700">نشط</th>
                    <th className="px-4 py-3 text-center font-medium text-gray-700">معالج اليوم</th>
                    <th className="px-4 py-3 text-center font-medium text-gray-700">متوسط التأخير</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {data.data.workers.map((worker) => {
                    const info = WORKER_NAMES[worker.type] || { ar: worker.type, icon: '🤖' };
                    return (
                      <tr key={worker.type} className="hover:bg-gray-50">
                        <td className="px-4 py-3 font-medium">
                          <span className="ml-2">{info.icon}</span>
                          {info.ar}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                            worker.activeJobs > 0 
                              ? 'bg-blue-100 text-blue-800' 
                              : 'bg-gray-100 text-gray-800'
                          }`}>
                            {worker.activeJobs}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center font-mono">
                          {formatNumber(worker.processedToday)}
                        </td>
                        <td className="px-4 py-3 text-center font-mono">
                          {formatTime(worker.avgLatencyMs)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── Tab Content: Queue ─────────────────────────── */}
        {activeTab === 'queue' && data?.data.queue && (
          <div className="space-y-6">
            
            {/* Queue Status Cards */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <MetricCard
                title="في الانتظار"
                value={data.data.queue.pending}
                color="yellow"
              />
              <MetricCard
                title="قيد التشغيل"
                value={data.data.queue.running}
                color="blue"
              />
              <MetricCard
                title="مكتمل اليوم"
                value={formatNumber(data.data.queue.completedToday)}
                color="green"
              />
              <MetricCard
                title="فشل اليوم"
                value={data.data.queue.failedToday}
                color={data.data.queue.failedToday > 10 ? 'red' : 'yellow'}
              />
              <MetricCard
                title="وقت الانتظار"
                value={formatTime(data.data.queue.estimatedWaitTimeMs)}
                color={data.data.queue.estimatedWaitTimeMs > 5000 ? 'red' : 'green'}
              />
            </div>

            {/* Queue Visualization */}
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h3 className="font-semibold text-gray-900 mb-4">📊 تصور الطابور</h3>
              
              <div className="space-y-4">
                {/* Pending Jobs Bar */}
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-gray-600">وظائف في الانتظار</span>
                    <span className="font-mono font-medium">{data.data.queue.pending}</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-4">
                    <div 
                      className="bg-yellow-500 h-4 rounded-full transition-all flex items-center justify-center text-xs text-white font-medium"
                      style={{ width: `${Math.min((data.data.queue.pending / 100) * 100, 100)}%` }}
                    >
                      {data.data.queue.pending > 20 ? data.data.queue.pending : ''}
                    </div>
                  </div>
                </div>

                {/* Running Jobs Bar */}
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-gray-600">وظائف قيد التشغيل</span>
                    <span className="font-mono font-medium">{data.data.queue.running}</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-4">
                    <div 
                      className="bg-blue-500 h-4 rounded-full transition-all flex items-center justify-center text-xs text-white font-medium"
                      style={{ width: `${Math.min((data.data.queue.running / 20) * 100, 100)}%` }}
                    >
                      {data.data.queue.running > 10 ? data.data.queue.running : ''}
                    </div>
                  </div>
                </div>

                {/* Success Rate */}
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-gray-600">معدل النجاح</span>
                    <span className="font-mono font-medium">
                      {data.data.queue.completedToday > 0 
                        ? `${Math.round((data.data.queue.completedToday / (data.data.queue.completedToday + data.data.queue.failedToday)) * 100)}%`
                        : 'N/A'
                      }
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-4">
                    <div 
                      className="bg-green-500 h-4 rounded-full transition-all"
                      style={{ 
                        width: `${
                          data.data.queue.completedToday > 0 
                            ? Math.min((data.data.queue.completedToday / (data.data.queue.completedToday + data.data.queue.failedToday)) * 100, 100)
                            : 0
                        }%` 
                      }}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Today's Stats */}
            {data?.data.today && (
              <div className="bg-white rounded-xl border border-gray-200 p-6">
                <h3 className="font-semibold text-gray-900 mb-4">📈 إحصائيات اليوم</h3>
                
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="text-center p-4 bg-blue-50 rounded-lg">
                    <p className="text-3xl font-bold text-blue-600">{formatNumber(data.data.today.totalRequests)}</p>
                    <p className="text-sm text-blue-800 mt-1">إجمالي الطلبات</p>
                  </div>
                  <div className="text-center p-4 bg-green-50 rounded-lg">
                    <p className="text-3xl font-bold text-green-600">{formatNumber(data.data.today.totalTokens)}</p>
                    <p className="text-sm text-green-800 mt-1">Tokens مستخدمة</p>
                  </div>
                  <div className="text-center p-4 bg-red-50 rounded-lg">
                    <p className="text-3xl font-bold text-red-600">{data.data.today.totalFailures}</p>
                    <p className="text-sm text-red-800 mt-1">فشل</p>
                  </div>
                  <div className="text-center p-4 bg-purple-50 rounded-lg">
                    <p className="text-3xl font-bold text-purple-600">{data.data.today.rejectionRate}%</p>
                    <p className="text-sm text-purple-800 mt-1">معدل الرفض</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Footer ─────────────────────────────────────── */}
        <footer className="text-center text-xs text-gray-400 pt-6 border-t">
          <p>GarfiX AI Enterprise Dashboard v2.0 • Built with ❤️ for MENA Region</p>
          <p className="mt-1">5 Keys × 15 RPM = 75 RPM Total Capacity • Auto-scaling Enabled</p>
        </footer>

      </div>
    </main>
  );
}

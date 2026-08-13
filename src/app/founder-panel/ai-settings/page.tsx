/**
 * ═════════════════════════════════════════════════════════════
 * GarfiX DS v4.0 - AI Settings Page (صفحة إعدادات الذكاء الاصطناعي)
 * 
 * Founder Panel - AI Configuration Management
 * 
 * Features:
 * - View/Edit per-company AI configuration
 * - Add Google Gemini API key (and others)
 * - Test API connection in real-time
 * - View usage statistics & quotas
 * - Enable/disable AI features (Chat, Memory, etc.)
 * - Cost optimization settings
 * 
 * Access: Founders only (role-based access control)
 * RTL Arabic Interface with full accessibility
 * ═════════════════════════════════════════════════════════════
 */

'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { logger } from '@/lib/logger';

// ── GarfiX DS Imports ──────────────────────────────────────

import {
  GarfixButton,
  GarfixCard,
  GarfixInput,
  GarfixBadge,
} from '@/components/garfix-ds/core';

import {
  GarfixContainer,
  GarfixGrid,
  GarfixPageHeader,
} from '@/components/garfix-ds/layout';

import {
  GarfixAlert,
  GarfixProgressBar,
  GarfixSkeleton,
} from '@/components/garfix-ds/feedback';

import { GarfixTabPanel } from '@/components/garfix-ds/navigation';

import { GarfixModal } from '@/components/garfix-ds/overlay';

import {
  GarfixAnimatedContainer,
  FadeUp,
  ScaleIn,
  MotionCard,
  GarfixPageTransition,
  GarfixAnimatedCounter,
  GarfixCircularProgress,
} from '@/components/garfix-ds/animations';

import { useHoverAnimation } from '@/hooks/useAnimation';

// ── Types ───────────────────────────────────────────────────

interface AIConfig {
  id: string;
  companyId: string;
  primaryProvider: ProviderConfig | null;
  fallbackProvider: ProviderConfig | null;
  systemPrompt: string;
  features: {
    chat: boolean;
    smartParse: boolean;
    invoiceExtraction: boolean;
    memory: boolean;
  };
  memoryRetentionDays: number;
  costOptimization: 'aggressive' | 'balanced' | 'quality';
  notifications: {
    enabled: boolean;
    threshold: number;
  };
  usage: {
    tokensUsedThisMonth: number;
    requestsThisMonth: number;
    monthlyTokenQuota: number;
    usagePercent: number;
  };
  lastResetAt: string;
  updatedAt: string;
}

interface ProviderConfig {
  provider: string;
  model: string;
  apiKey: string;
  hasApiKey: boolean;
  maxTokens: number;
  temperature: number;
  enabled: boolean;
  rateLimitRpm: number;
  monthlyTokenQuota: number;
}

interface UsageData {
  overview: {
    totalTokensUsed: number;
    totalRequests: number;
    monthlyQuota: number;
    usagePercent: number;
    remainingTokens: number;
    estimatedCostUSD: number;
    lastResetAt: string;
  };
  provider: {
    name: string;
    model: string;
    enabled: boolean;
  };
  dailyUsage: Array<{
    date: string;
    day: string;
    tokens: number;
    requests: number;
  }>;
  alerts: {
    nearQuota: boolean;
    quotaExceeded: boolean;
    threshold: number;
  };
  recommendations: Array<{
    type: string;
    message: string;
    severity: 'info' | 'warning' | 'critical';
  }>;
}

interface TestResult {
  success: boolean;
  latencyMs: number;
  model: string;
  error?: string;
}

// ── Main Component ──────────────────────────────────────────

export default function AISettingsPage() {
  // State
  const [config, setConfig] = useState<AIConfig | null>(null);
  const [usageData, setUsageData] = useState<UsageData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  
  // Form state
  const [apiKey, setApiKey] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);
  const [selectedModel, setSelectedModel] = useState('gemini-2.0-flash');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [temperature, setTemperature] = useState(0.7);
  
  // UI state
  const [activeTab, setActiveTab] = useState('config');
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [showTestModal, setShowTestModal] = useState(false);
  const [alert, setAlert] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  
  // Features toggles
  const [features, setFeatures] = useState({
    chat: true,
    smartParse: true,
    invoiceExtraction: true,
    memory: true,
  });
  
  // Fetch config on mount
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- async data fetching on mount
    fetchConfig();
    fetchUsage();
  }, []);
  
  // ── API Calls ─────────────────────────────────────────────
  
  const fetchConfig = async () => {
    try {
      setIsLoading(true);
      const response = await fetch('/api/founder-panel/ai-config');
      const data = await response.json();
      
      if (data.success) {
        setConfig(data.data);
        
        // Update form state
        if (data.data.primaryProvider) {
          setSelectedModel(data.data.primaryProvider.model || 'gemini-2.0-flash');
          setTemperature(data.data.primaryProvider.temperature || 0.7);
        }
        if (data.data.systemPrompt) {
          setSystemPrompt(data.data.systemPrompt);
        }
        if (data.data.features) {
          setFeatures(data.data.features);
        }
      }
    } catch (error) {
      logger.error('Failed to fetch AI config:', { err: error });
      setAlert({ type: 'error', message: 'فشل في تحميل الإعدادات' });
    } finally {
      setIsLoading(false);
    }
  };
  
  const fetchUsage = async () => {
    try {
      const response = await fetch('/api/founder-panel/ai-config/usage?days=30');
      const data = await response.json();
      
      if (data.success) {
        setUsageData(data.data);
      }
    } catch (error) {
      logger.error('Failed to fetch usage:', { err: error });
    }
  };
  
  const saveConfig = async () => {
    try {
      setIsSaving(true);
      
      const payload = {
        primaryProvider: {
          provider: 'google-gemini',
          apiKey: apiKey || config?.primaryProvider?.apiKey?.replace(/•/g, '') || '',
          model: selectedModel,
          maxTokens: 4096,
          temperature,
          enabled: true,
          rateLimitRpm: 60,
          monthlyTokenQuota: 1000000,
        },
        systemPrompt,
        ...features,
        costOptimization: 'balanced',
        notifyHighUsage: true,
        usageNotificationThreshold: 80,
      };
      
      const response = await fetch('/api/founder-panel/ai-config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      
      const data = await response.json();
      
      if (data.success) {
        setAlert({ type: 'success', message: 'تم حفظ الإعدادات بنجاح ✅' });
        fetchConfig();
      } else {
        setAlert({ type: 'error', message: data.error || 'فشل في الحفظ' });
      }
    } catch (error) {
      logger.error('Failed to save config:', { err: error });
      setAlert({ type: 'error', message: 'خطأ في الاتصال بالخادم' });
    } finally {
      setIsSaving(false);
      
      // Clear alert after 3 seconds
      setTimeout(() => setAlert(null), 3000);
    }
  };
  
  const testConnection = async () => {
    try {
      setIsTesting(true);
      setTestResult(null);
      
      const keyToTest = apiKey || config?.primaryProvider?.apiKey?.replace(/•/g, '') || '';
      
      if (!keyToTest && !apiKey) {
        setTestResult({
          success: false,
          latencyMs: 0,
          model: selectedModel,
          error: 'يرجى إدخال مفتاح API أولاً',
        });
        setShowTestModal(true);
        return;
      }
      
      const response = await fetch('/api/founder-panel/ai-config/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: 'google-gemini',
          apiKey: keyToTest,
          model: selectedModel,
        }),
      });
      
      const data = await response.json();
      
      if (data.success) {
        setTestResult(data.data);
      } else {
        setTestResult({
          success: false,
          latencyMs: 0,
          model: selectedModel,
          error: data.error || 'فشل الاختبار',
        });
      }
      
      setShowTestModal(true);
    } catch (error) {
      setTestResult({
        success: false,
        latencyMs: 0,
        model: selectedModel,
        error: 'خطأ في الاتصال',
      });
      setShowTestModal(true);
    } finally {
      setIsTesting(false);
    }
  };
  
  // ── Render Helpers ───────────────────────────────────────
  
  const renderLoading = () => (
    <div className="space-y-6">
      <GarfixSkeleton shape="rounded" className="h-48" />
      <GarfixGrid cols={2}>
        <GarfixSkeleton shape="rounded" className="h-64" />
        <GarfixSkeleton shape="rounded" className="h-64" />
      </GarfixGrid>
    </div>
  );
  
  const renderAlert = () => {
    if (!alert) return null;
    
    return (
      <GarfixAlert
        variant={alert.type === 'success' ? 'success' : 'error'}
        dismissible
        onDismiss={() => setAlert(null)}
        className="mb-4"
      >
        {alert.message}
      </GarfixAlert>
    );
  };
  
  // ── Main Render ───────────────────────────────────────────
  
  if (isLoading) {
    return (
      <GarfixPageTransition>
        <GarfixContainer padding="lg">
          {renderLoading()}
        </GarfixContainer>
      </GarfixPageTransition>
    );
  }
  
  return (
    <GarfixPageTransition enterAnimation="slideUp">
      <div className="min-h-screen bg-gray-50 dark:bg-gray-950 py-8" dir="rtl" lang="ar">
        <GarfixContainer>
          {/* Header */}
          <GarfixPageHeader
            title="إعدادات الذكاء الاصطناعي"
            breadcrumbs={[
              { label: 'لوحة الفاوندر', href: '/founder-panel' },
              { label: 'الإعدادات' },
              { label: 'الذكاء الاصطناعي' },
            ]}
            actions={
              <GarfixButton
                onClick={saveConfig}
                isLoading={isSaving}
                leadingIcon={<span>💾</span>}
              >
                حفظ الإعدادات
              </GarfixButton>
            }
          />
          
          {/* Alert */}
          {renderAlert()}
          
          {/* Tabs */}
          <div className="mt-6">
            <div className="flex gap-1 p-1 bg-white dark:bg-gray-900 rounded-xl shadow-sm w-fit border border-gray-200 dark:border-gray-800">
              {[
                { value: 'config', label: '⚙️ الإعدادات الأساسية' },
                { value: 'features', label: '🔧 الميزات' },
                { value: 'usage', label: '📊 الاستخدام' },
                { value: 'test', label: '🧪 الاختبار' },
              ].map(tab => (
                <button
                  key={tab.value}
                  data-value={tab.value}
                  onClick={() => setActiveTab(tab.value)}
                  className={cn(
                    'px-4 py-2 rounded-lg text-sm font-medium transition-all',
                    activeTab === tab.value
                      ? 'bg-emerald-500 text-white shadow-sm'
                      : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                  )}
                >
                  {tab.label}
                </button>
              ))}
            </div>
            
            {/* ── Config Tab ──────────────────────────────── */}
            <GarfixTabPanel tabId="config" activeTab={activeTab} className="mt-6">
              <GarfixGrid cols={2} gap="lg">
                {/* API Key Configuration */}
                <FadeUp delay={0}>
                  <MotionCard className="p-6">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                      <span>🔑</span>
                      مفتاح Google Gemini API
                    </h3>
                    
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                          مفتاح API
                        </label>
                        <div className="relative">
                          <GarfixInput
                            type={showApiKey ? 'text' : 'password'}
                            value={apiKey}
                            onChange={(e) => setApiKey(e.target.value)}
                            placeholder={
                              config?.primaryProvider?.hasApiKey
                                ? '•••••••• (موجد بالفعل)'
                                : 'أدخل مفتاح Google AI الجديد'
                            }
                            className="font-mono text-sm"
                          />
                          <button
                            type="button"
                            onClick={() => setShowApiKey(!showApiKey)}
                            className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                          >
                            {showApiKey ? '🙈' : '👁️'}
                          </button>
                        </div>
                        <p className="text-xs text-gray-500 mt-1">
                          المفتاح الحالي: {config?.primaryProvider?.hasApiKey ? '✅ مفعل' : '❌ غير موجود'}
                        </p>
                      </div>
                      
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                          النموذج (Model)
                        </label>
                        <select
                          value={selectedModel}
                          onChange={(e) => setSelectedModel(e.target.value)}
                          className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                        >
                          <option value="gemini-2.0-flash">Gemini 2.0 Flash ⚡ (سريع)</option>
                          <option value="gemini-1.5-flash">Gemini 1.5 Flash</option>
                          <option value="gemini-1.5-pro">Gemini 1.5 Pro 🎯 (متقدم)</option>
                          <option value="gemini-1.5-pro-latest">Gemini 1.5 Pro Latest</option>
                        </select>
                      </div>
                      
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                          درجة الحرارة (Temperature): {temperature}
                        </label>
                        <input
                          type="range"
                          min="0"
                          max="2"
                          step="0.1"
                          value={temperature}
                          onChange={(e) => setTemperature(parseFloat(e.target.value))}
                          className="w-full accent-emerald-500"
                        />
                        <div className="flex justify-between text-xs text-gray-500 mt-1">
                          <span>دقيق (0)</span>
                          <span>إبداعي (2)</span>
                        </div>
                      </div>
                      
                      <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
                        <GarfixButton
                          variant="outline"
                          size="sm"
                          onClick={testConnection}
                          isLoading={isTesting}
                          leadingIcon={<span>🧪</span>}
                          className="w-full"
                        >
                          اختبار الاتصال
                        </GarfixButton>
                      </div>
                    </div>
                  </MotionCard>
                </FadeUp>
                
                {/* System Prompt */}
                <FadeUp delay={80}>
                  <MotionCard className="p-6">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                      <span>📝</span>
                      التعليمات الخاصة (System Prompt)
                    </h3>
                    
                    <div className="space-y-4">
                      <div>
                        <textarea
                          value={systemPrompt}
                          onChange={(e) => setSystemPrompt(e.target.value)}
                          placeholder="اكتب تعليمات خاصة للـ AI هنا...&#10;&#10;مثال:&#10;أنت مساعد ذكي لمنصة GarfiX EOS.&#10;رد دائماً باللغة العربية.&#10;كن ودوداً ومحترفاً."
                          rows={10}
                          className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm resize-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                          maxLength={5000}
                        />
                        <p className="text-xs text-gray-500 mt-1">
                          {systemPrompt.length} / 5000 حرف
                        </p>
                      </div>
                      
                      {/* Quick Templates */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                          قوالب سريعة:
                        </label>
                        <div className="flex flex-wrap gap-2">
                          {[
                            { label: 'مساعد عربي', prompt: 'أنت مساعد ذكي يتحدث العربية بطلاقة. كن ودوداً ومفيداً.' },
                            { label: 'محاسب', prompt: 'أنت محاسب ذكي متخصص في المحاسبة المصرية.' },
                            { label: 'مختصر', prompt: 'رد بإيجاز ووضوح. تجنب الإطالة.' },
                          ].map(template => (
                            <button
                              key={template.label}
                              onClick={() => setSystemPrompt(template.prompt)}
                              className="px-3 py-1.5 text-xs rounded-full bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-emerald-100 dark:hover:bg-emerald-900 transition-colors"
                            >
                              {template.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  </MotionCard>
                </FadeUp>
              </GarfixGrid>
            </GarfixTabPanel>
            
            {/* ── Features Tab ─────────────────────────────── */}
            <GarfixTabPanel tabId="features" activeTab={activeTab} className="mt-6">
              <FadeUp>
                <MotionCard className="p-6">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-6 flex items-center gap-2">
                    <span>🔧</span>
                    تفعيل / تعطيل ميزات AI
                  </h3>
                  
                  <div className="space-y-4">
                    {[
                      {
                        key: 'chat' as const,
                        title: 'المحادثة الذكية (AI Chat)',
                        description: 'تفعيل المساعد الذكي للمحادثات مع المستخدمين',
                        icon: '💬',
                      },
                      {
                        key: 'smartParse' as const,
                        title: 'التحليل الذكي (Smart Parse)',
                        description: 'تحليل المستندات والبيانات تلقائياً',
                        icon: '🔍',
                      },
                      {
                        key: 'invoiceExtraction' as const,
                        title: 'استخراج الفواتير (Invoice Brain)',
                        description: 'استخراج البيانات من الفواتير باستخدام AI',
                        icon: '🧾',
                      },
                      {
                        key: 'memory' as const,
                        title: 'الذاكرة السياقية (Memory)',
                        description: 'تذكر سياق المحادثات السابقة لتحسين الردود',
                        icon: '🧠',
                      },
                    ].map(feature => (
                      <div
                        key={feature.key}
                        className={cn(
                          'flex items-center justify-between p-4 rounded-xl border transition-all',
                          features[feature.key]
                            ? 'border-emerald-200 bg-emerald-50/50 dark:border-emerald-800 dark:bg-emerald-950/20'
                            : 'border-gray-200 dark:border-gray-700'
                        )}
                      >
                        <div className="flex items-center gap-3">
                          <span className="text-2xl">{feature.icon}</span>
                          <div>
                            <h4 className="font-medium text-gray-900 dark:text-white">
                              {feature.title}
                            </h4>
                            <p className="text-sm text-gray-500 dark:text-gray-400">
                              {feature.description}
                            </p>
                          </div>
                        </div>
                        
                        {/* Toggle Switch */}
                        <button
                          onClick={() =>
                            setFeatures(prev => ({
                              ...prev,
                              [feature.key]: !prev[feature.key],
                            }))
                          }
                          className={cn(
                            'relative w-12 h-6 rounded-full transition-colors',
                            features[feature.key]
                              ? 'bg-emerald-500'
                              : 'bg-gray-300 dark:bg-gray-600'
                          )}
                        >
                          <span
                            className={cn(
                              'absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-transform',
                              features[feature.key] ? 'right-1' : 'left-1'
                            )}
                          />
                        </button>
                      </div>
                    ))}
                  </div>
                </MotionCard>
              </FadeUp>
            </GarfixTabPanel>
            
            {/* ── Usage Tab ───────────────────────────────── */}
            <GarfixTabPanel tabId="usage" activeTab={activeTab} className="mt-6">
              {usageData ? (
                <GarfixGrid cols={3} gap="lg">
                  {/* Overview Cards */}
                  <>
                    <ScaleIn delay={0}>
                      <MotionCard className="p-5">
                        <p className="text-sm text-gray-500 dark:text-gray-400">التوكنات المستخدمة</p>
                        <p className="text-3xl font-bold text-gray-900 dark:text-white mt-1">
                          <GarfixAnimatedCounter
                            value={usageData.overview.totalTokensUsed}
                            abbreviate
                            autoStart
                          />
                        </p>
                        <p className="text-xs text-gray-500 mt-1">
                          من {usageData.overview.monthlyQuota.toLocaleString()} شهرياً
                        </p>
                      </MotionCard>
                    </ScaleIn>
                    
                    <ScaleIn delay={60}>
                      <MotionCard className="p-5">
                        <p className="text-sm text-gray-500 dark:text-gray-400">عدد الطلبات</p>
                        <p className="text-3xl font-bold text-blue-600 dark:text-blue-400 mt-1">
                          <GarfixAnimatedCounter
                            value={usageData.overview.totalRequests}
                            autoStart
                          />
                        </p>
                        <p className="text-xs text-gray-500 mt-1">هذا الشهر</p>
                      </MotionCard>
                    </ScaleIn>
                    
                    <ScaleIn delay={120}>
                      <MotionCard className="p-5">
                        <p className="text-sm text-gray-500 dark:text-gray-400">التكلفة التقديرية</p>
                        <p className="text-3xl font-bold text-[#d4a574] mt-1">
                          ${usageData.overview.estimatedCostUSD.toFixed(2)}
                        </p>
                        <p className="text-xs text-gray-500 mt-1">شهرياً (USD)</p>
                      </MotionCard>
                    </ScaleIn>
                  </>
                  
                  {/* Usage Progress */}
                  <div className="col-span-2">
                    <FadeUp>
                      <MotionCard className="p-6">
                        <div className="flex items-center justify-between mb-4">
                          <h3 className="font-semibold text-gray-900 dark:text-white">
                            استخدام الحصة الشهرية
                          </h3>
                          <GarfixBadge
                            variant={
                              usageData.alerts.quotaExceeded
                                ? 'error'
                                : usageData.alerts.nearQuota
                                ? 'warning'
                                : 'success'
                            }
                          >
                            {usageData.overview.usagePercent}%
                          </GarfixBadge>
                        </div>
                        
                        <GarfixProgressBar
                          value={usageData.overview.usagePercent}
                          max={100}
                          size="lg"
                          color={
                            usageData.overview.usagePercent > 90
                              ? 'red'
                              : usageData.overview.usagePercent > 70
                              ? 'gold'
                              : 'emerald'
                          }
                        />
                        
                        <div className="flex justify-between mt-2 text-sm text-gray-500">
                          <span>{usageData.overview.totalTokensUsed.toLocaleString()} مستخدم</span>
                          <span>{usageData.overview.remainingTokens.toLocaleString()} متبقي</span>
                        </div>
                      </MotionCard>
                    </FadeUp>
                  </div>
                  
                  {/* Recommendations */}
                  <div className="col-span-1">
                    <FadeUp delay={180}>
                      <MotionCard className="p-6">
                        <h3 className="font-semibold text-gray-900 dark:text-white mb-3">
                          💡 التوصيات
                        </h3>
                        <div className="space-y-2">
                          {usageData.recommendations.map((rec) => (
                            <GarfixAlert
                              key={rec.message}
                              variant={
                                rec.severity === 'critical'
                                  ? 'error'
                                  : rec.severity === 'warning'
                                  ? 'warning'
                                  : 'info'
                              }
                              size="sm"
                            >
                              {rec.message}
                            </GarfixAlert>
                          ))}
                        </div>
                      </MotionCard>
                    </FadeUp>
                  </div>
                </GarfixGrid>
              ) : (
                <GarfixSkeleton shape="rounded" className="h-64" />
              )}
            </GarfixTabPanel>
            
            {/* ── Test Tab ─────────────────────────────────── */}
            <GarfixTabPanel tabId="test" activeTab={activeTab} className="mt-6">
              <FadeUp>
                <MotionCard className="p-6">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                    <span>🧪</span>
                    اختبار اتصال Google Gemini
                  </h3>
                  
                  <div className="space-y-4">
                    <p className="text-gray-600 dark:text-gray-400">
                      اختبر اتصالك بـ Google Gemini API للتأكد من أن المفتاح يعمل بشكل صحيح.
                    </p>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-gray-50 dark:bg-gray-800 rounded-xl">
                      <div>
                        <p className="text-sm text-gray-500">الموفر</p>
                        <p className="font-medium">Google Gemini</p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-500">النموذج</p>
                        <p className="font-medium">{selectedModel}</p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-500">حالة المفتاح</p>
                        <p className="font-medium">
                          {config?.primaryProvider?.hasApiKey ? '✅ موجود' : '❌ غير موجود'}
                        </p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-500">آخر تحديث</p>
                        <p className="font-medium">
                          {config?.updatedAt 
                            ? new Date(config.updatedAt).toLocaleDateString('ar-EG')
                            : '—'
                          }
                        </p>
                      </div>
                    </div>
                    
                    <GarfixButton
                      onClick={testConnection}
                      isLoading={isTesting}
                      variant="primary"
                      leadingIcon={<span>🚀</span>}
                      className="w-full"
                    >
                      تشغيل الاختبار الآن
                    </GarfixButton>
                    
                    {/* Last Test Result */}
                    {testResult && (
                      <div
                        className={cn(
                          'p-4 rounded-xl border',
                          testResult.success
                            ? 'border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950/20'
                            : 'border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950/20'
                        )}
                      >
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-xl">
                            {testResult.success ? '✅' : '❌'}
                          </span>
                          <span className="font-medium">
                            {testResult.success ? 'نجح الاتصال!' : 'فشل الاتصال'}
                          </span>
                        </div>
                        <p className="text-sm text-gray-600 dark:text-gray-400">
                          زمن الاستجابة: {testResult.latencyMs}ms
                        </p>
                        {testResult.error && (
                          <p className="text-sm text-red-600 dark:text-red-400 mt-1">
                            الخطأ: {testResult.error}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                </MotionCard>
              </FadeUp>
            </GarfixTabPanel>
          </div>
        </GarfixContainer>
        
        {/* Test Result Modal */}
        {showTestModal && (
          <GarfixModal
            isOpen={showTestModal}
            onClose={() => setShowTestModal(false)}
            title="نتيجة الاختبار"
            size="md"
          >
            {testResult && (
              <div className="py-4">
                <div
                  className={cn(
                    'text-center p-8 rounded-xl',
                    testResult.success
                      ? 'bg-green-50 dark:bg-green-950/20'
                      : 'bg-red-50 dark:bg-red-950/20'
                  )}
                >
                  <span className="text-6xl block mb-4">
                    {testResult.success ? '🎉' : '😞'}
                  </span>
                  <h3
                    className={cn(
                      'text-xl font-bold mb-2',
                      testResult.success
                        ? 'text-green-700 dark:text-green-400'
                        : 'text-red-700 dark:text-red-400'
                    )}
                  >
                    {testResult.success ? 'الاتصال ناجح!' : 'فشل الاتصال'}
                  </h3>
                  <p className="text-gray-600 dark:text-gray-400">
                    زمن الاستجابة: {testResult.latencyMs}ms
                  </p>
                  {testResult.error && (
                    <p className="text-red-600 dark:text-red-400 mt-2 text-sm">
                      {testResult.error}
                    </p>
                  )}
                </div>
                
                <div className="flex justify-end mt-4">
                  <GarfixButton onClick={() => setShowTestModal(false)}>
                    حسناً
                  </GarfixButton>
                </div>
              </div>
            )}
          </GarfixModal>
        )}
        </div>
      </GarfixPageTransition>
    );
  }

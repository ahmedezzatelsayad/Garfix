/**
 * ═════════════════════════════════════════════════════════════
 * GarfiX DS v4.0 - Multi-Tenant Company AI Management
 * 
 * صفحة إدارة مفاتيح AI لكل شركة (لوحة المؤسس)
 * 
 * 🎯 الهدف الرئيسي:
 * - عرض كل الشركات المسجلة في النظام
 * - إضافة/تعديل مفتاح AI خاص بكل شركة
 * - كل شركة تستخدم مفتاحها المنعزل → مفيش تزاحم
 * - اختبار الاتصال قبل الحفظ
 * - تتبع الاستخدام لكل شركة على حدة
 *
 * 📌 سيناريو الاستخدام:
 * 1. شركة جديدة تسجل → تظهر هنا تلقائياً
 * 2. المؤسس يضغط "إضافة مفتاح"
 * 3. يدخل Google Gemini API Key (أي provider)
 * 4. يختبر الاتصال
 * 5. يحفظ → الشركة تستخدم المفتاح ده
 *
 * Access: Founders only (role-based access control)
 * RTL Arabic Interface with GarfiX DS v4.0
 * ═════════════════════════════════════════════════════════════
 */

'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { cn } from '@/lib/utils';

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

import { GarfixModal } from '@/components/garfix-ds/overlay';

import {
  GarfixAnimatedContainer,
  FadeUp,
  ScaleIn,
  MotionCard,
  GarfixPageTransition,
} from '@/components/garfix-ds/animations';

// ── Types ───────────────────────────────────────────────────

/**
 * Company data from database
 */
interface CompanyData {
  id: string;
  name: string;
  nameAr?: string;
  slug: string;
  code: string;
  plan: string;
  subscriptionStatus: string;
  createdAt: string;
  emoji?: string;
  color?: string;
  /** AI Config exists? */
  hasAIConfig: boolean;
  /** AI Config data (if loaded) */
  aiConfig?: CompanyAIConfigData;
}

/**
 * AI Configuration for a company
 */
interface CompanyAIConfigData {
  id: string;
  companyId: string;
  primaryProvider: ProviderConfig | null;
  fallbackProvider: ProviderConfig | null;
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
  updatedAt: string;
}

/**
 * Provider configuration
 */
interface ProviderConfig {
  provider: string;
  model: string;
  apiKey: string;
  hasApiKey: boolean;
  enabled: boolean;
  rateLimitRpm: number;
  monthlyTokenQuota: number;
}

/**
 * Test result from API
 */
interface TestResult {
  success: boolean;
  latencyMs: number;
  model: string;
  error?: string;
}

// ── Constants ─────────────────────────────────────────────────

const AI_PROVIDERS = [
  { value: 'google-gemini', label: 'Google Gemini', icon: '🔮' },
  { value: 'openai', label: 'OpenAI (GPT)', icon: '🤖' },
  { value: 'anthropic', label: 'Anthropic (Claude)', icon: '🧠' },
  { value: 'openrouter', label: 'OpenRouter', icon: '🔗' },
  { value: 'custom', label: 'Custom Endpoint', icon: '⚙️' },
] as const;

const GEMINI_MODELS = [
  { value: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash (سريع)' },
  { value: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro (متقدم)' },
  { value: 'gemini-1.5-flash', label: 'Gemini 1.5 Flash' },
  { value: 'gemini-1.5-pro', label: 'Gemini 1.5 Pro' },
] as const;

const PLAN_COLORS: Record<string, string> = {
  trial: 'bg-gray-100 text-gray-700',
  starter: 'bg-blue-50 text-blue-700',
  growth: 'bg-emerald-50 text-emerald-700',
  enterprise: 'bg-purple-50 text-purple-700',
  custom: 'bg-amber-50 text-amber-700',
};

const STATUS_COLORS: Record<string, string> = {
  active: 'bg-emerald-100 text-emerald-800',
  inactive: 'bg-gray-100 text-gray-600',
  cancelled: 'bg-red-50 text-red-700',
  past_due: 'bg-orange-50 text-orange-700',
};

// ── Main Component ──────────────────────────────────────────

export default function CompaniesAIManagementPage() {
  // ── State ───────────────────────────────────────────────
  
  const [companies, setCompanies] = useState<CompanyData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterPlan, setFilterPlan] = useState('all');
  const [filterAIStatus, setFilterAIStatus] = useState('all');
  
  // Modal state
  const [selectedCompany, setSelectedCompany] = useState<CompanyData | null>(null);
  const [showKeyModal, setShowKeyModal] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  
  // Form state
  const [apiKey, setApiKey] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState('google-gemini');
  const [selectedModel, setSelectedModel] = useState('gemini-2.0-flash');
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  
  // Alert state
  const [alert, setAlert] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // ── Effects ─────────────────────────────────────────────
  
  useEffect(() => {
    fetchCompanies();
  }, []);

  // ── API Calls ────────────────────────────────────────────

  /**
   * Fetch all companies with their AI status
   */
  const fetchCompanies = async () => {
    try {
      setIsLoading(true);
      const response = await fetch('/api/founder-panel/companies?includeAIStatus=true');
      const data = await response.json();
      
      if (data.success) {
        setCompanies(data.data.companies || []);
      } else {
        setAlert({ type: 'error', message: data.error || 'فشل تحميل الشركات' });
      }
    } catch (error) {
      console.error('Fetch companies error:', error);
      setAlert({ type: 'error', message: 'خطأ في الاتصال بالخادم' });
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Fetch AI config for a specific company
   */
  const fetchCompanyAIConfig = async (companyId: string) => {
    try {
      const response = await fetch(`/api/founder-panel/ai-config?companySlug=${companyId}`);
      const data = await response.json();
      
      if (data.success) {
        return data.data;
      }
      return null;
    } catch (error) {
      console.error('Fetch AI config error:', error);
      return null;
    }
  };

  /**
   * Save API key for a company
   */
  const saveApiKey = async () => {
    if (!selectedCompany || !apiKey.trim()) {
      setAlert({ type: 'error', message: 'يرجى إدخال مفتاح API صالح' });
      return;
    }

    try {
      setIsSaving(true);
      
      const response = await fetch('/api/founder-panel/ai-config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          primaryProvider: {
            provider: selectedProvider,
            apiKey: apiKey.trim(),
            model: selectedModel,
            maxTokens: 4096,
            temperature: 0.7,
            enabled: true,
            rateLimitRpm: 60,
            monthlyTokenQuota: 1000000,
          },
          enableChat: true,
          enableSmartParse: true,
          enableInvoiceExtraction: true,
          enableMemory: true,
          systemPrompt: '',
          costOptimization: 'balanced',
          notifyHighUsage: true,
          usageNotificationThreshold: 80,
        }),
      });

      const data = await response.json();
      
      if (data.success) {
        setAlert({ type: 'success', message: `تم حفظ مفتاح API لـ ${selectedCompany.name} بنجاح ✅` });
        setShowKeyModal(false);
        resetForm();
        fetchCompanies(); // Refresh list
      } else {
        setAlert({ type: 'error', message: data.error || 'فشل حفظ المفتاح' });
      }
    } catch (error) {
      console.error('Save API key error:', error);
      setAlert({ type: 'error', message: 'خطأ في الاتصال' });
    } finally {
      setIsSaving(false);
    }
  };

  /**
   * Test API connection
   */
  const testConnection = async () => {
    if (!apiKey.trim()) {
      setAlert({ type: 'error', message: 'يرجى إدخال المفتاح أولاً' });
      return;
    }

    try {
      setIsTesting(true);
      setTestResult(null);
      
      const response = await fetch('/api/founder-panel/ai-config/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: selectedProvider,
          apiKey: apiKey.trim(),
          model: selectedModel,
          baseUrl: selectedProvider === 'google-gemini' ? undefined : 'https://api.openai.com/v1',
        }),
      });

      const data = await response.json();
      
      if (data.success) {
        setTestResult(data.data);
        if (data.data.success) {
          setAlert({ type: 'success', message: `✅ الاتصال ناجح! زمن الاستجابة: ${data.data.latencyMs}ms` });
        } else {
          setAlert({ type: 'error', message: `❌ فشل الاتصال: ${data.data.error}` });
        }
      }
    } catch (error) {
      console.error('Test connection error:', error);
      setTestResult({ success: false, latencyMs: 0, model: selectedModel, error: 'خطأ في الاتصال' });
    } finally {
      setIsTesting(false);
    }
  };

  // ── Handlers ─────────────────────────────────────────────

  /**
   * Open modal to add/edit API key
   */
  const openKeyModal = async (company: CompanyData) => {
    setSelectedCompany(company);
    
    // Load existing config if any
    const config = await fetchCompanyAIConfig(company.id);
    if (config?.primaryProvider?.hasApiKey) {
      setSelectedProvider(config.primaryProvider.provider);
      setSelectedModel(config.primaryProvider.model);
      setApiKey('••••••••'); // Masked - user will replace
    } else {
      resetForm();
    }
    
    setTestResult(null);
    setShowKeyModal(true);
  };

  /**
   * Reset form state
   */
  const resetForm = () => {
    setApiKey('');
    setShowApiKey(false);
    setSelectedProvider('google-gemini');
    setSelectedModel('gemini-2.0-flash');
    setTestResult(null);
  };

  /**
   * Filter companies based on search and filters
   */
  const filteredCompanies = companies.filter(company => {
    // Search filter
    const matchesSearch = !searchQuery || 
      company.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      company.nameAr?.includes(searchQuery) ||
      company.slug.includes(searchQuery);
    
    // Plan filter
    const matchesPlan = filterPlan === 'all' || company.plan === filterPlan;
    
    // AI Status filter
    let matchesAIStatus = filterAIStatus === 'all';
    if (filterAIStatus === 'with_key') matchesAIStatus = company.hasAIConfig;
    if (filterAIStatus === 'without_key') matchesAIStatus = !company.hasAIConfig;
    
    return matchesSearch && matchesPlan && matchesAIStatus;
  });

  // Stats calculations
  const totalCompanies = companies.length;
  const companiesWithAI = companies.filter(c => c.hasAIConfig).length;
  const companiesWithoutAI = totalCompanies - companiesWithAI;

  // ── Render ───────────────────────────────────────────────

  return (
    <GarfixPageTransition>
      <GarfixContainer maxWidth="7xl">
        
        {/* ══ Page Header ══ */}
        <GarfixPageHeader
          title="إدارة مفاتيح AI للشركات"
          subtitle="نظام متعدد المستأجرين - كل شركة بمفتاح AI منعزل خاص بها"
          badge={{
            text: `${totalCompanies} شركة`,
            variant: totalCompanies > 0 ? 'default' : 'outline',
          }}
        />

        {/* ══ Alert ══ */}
        {alert && (
          <FadeUp delay={100}>
            <GarfixAlert
              type={alert.type}
              message={alert.message}
              onClose={() => setAlert(null)}
              className="mb-6"
            />
          </FadeUp>
        )}

        {/* ══ Stats Cards ══ */}
        <GarfixGrid cols={4} className="mb-8">
          <MotionCard>
            <div className="text-center p-4">
              <div className="text-3xl font-bold text-emerald-600">
                <GarfixAnimatedContainer animation="fadeIn">
                  {totalCompanies}
                </GarfixAnimatedContainer>
              </div>
              <div className="text-sm text-gray-500 mt-1">إجمالي الشركات</div>
            </div>
          </MotionCard>

          <MotionCard>
            <div className="text-center p-4">
              <div className="text-3xl font-bold text-blue-600">
                {companiesWithAI}
              </div>
              <div className="text-sm text-gray-500 mt-1">شركات بمفتاح AI ✅</div>
            </div>
          </MotionCard>

          <MotionCard>
            <div className="text-center p-4">
              <div className="text-3xl font-bold text-orange-600">
                {companiesWithoutAI}
              </div>
              <div className="text-sm text-gray-500 mt-1">بدون مفتاح ⚠️</div>
            </div>
          </MotionCard>

          <MotionCard>
            <div className="text-center p-4">
              <div className="text-3xl font-bold text-purple-600">
                {totalCompanies > 0 ? Math.round((companiesWithAI / totalCompanies) * 100) : 0}%
              </div>
              <div className="text-sm text-gray-500 mt-1">نسبة التغطية</div>
            </div>
          </MotionCard>
        </GarfixGrid>

        {/* ══ Filters Bar ══ */}
        <GarfixCard className="mb-6">
          <div className="flex flex-col md:flex-row gap-4 p-4">
            
            {/* Search */}
            <div className="flex-1">
              <GarfixInput
                placeholder="🔍 ابحث عن شركة..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full"
              />
            </div>

            {/* Plan Filter */}
            <div className="w-full md:w-48">
              <select
                value={filterPlan}
                onChange={(e) => setFilterPlan(e.target.value)}
                className="w-full px-4 py-2 rounded-lg border border-gray-200 bg-white text-sm focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
              >
                <option value="all">كل الخطط</option>
                <option value="trial">تجريبي</option>
                <option value="starter">أساسي</option>
                <option value="growth">نمو</option>
                <option value="enterprise">مؤسسي</option>
              </select>
            </div>

            {/* AI Status Filter */}
            <div className="w-full md:w-48">
              <select
                value={filterAIStatus}
                onChange={(e) => setFilterAIStatus(e.target.value)}
                className="w-full px-4 py-2 rounded-lg border border-gray-200 bg-white text-sm focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
              >
                <option value="all">كل الحالات</option>
                <option value="with_key">🔑 مع مفتاح AI</option>
                <option value="without_key">❌ بدون مفتاح</option>
              </select>
            </div>
          </div>
        </GarfixCard>

        {/* ══ Companies List ══ */}
        {isLoading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <GarfixCard key={i}>
                <GarfixSkeleton className="h-24 w-full" />
              </GarfixCard>
            ))}
          </div>
        ) : filteredCompanies.length === 0 ? (
          <GarfixCard className="p-12 text-center">
            <div className="text-6xl mb-4">🏢</div>
            <h3 className="text-xl font-semibold text-gray-700 mb-2">
              {searchQuery || filterPlan !== 'all' || filterAIStatus !== 'all' 
                ? 'لا توجد شركات مطابقة' 
                : 'لا توجد شركات مسجلة بعد'}
            </h3>
            <p className="text-gray-500">
              {searchQuery || filterPlan !== 'all' || filterAIStatus !== 'all' 
                ? 'حاول تغيير معايير البحث'
                : 'الشركات التي تسجل ستظهر هنا تلقائياً'}
            </p>
          </GarfixCard>
        ) : (
          <div className="space-y-4">
            {filteredCompanies.map((company, index) => (
              <FadeUp key={company.id} delay={index * 50}>
                <GarfixCard 
                  className={cn(
                    "hover:shadow-lg transition-all duration-300",
                    company.hasAIConfig && "border-l-4 border-l-emerald-500"
                  )}
                >
                  <div className="p-6">
                    <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                      
                      {/* Company Info */}
                      <div className="flex items-center gap-4 flex-1">
                        {/* Emoji/Icon */}
                        <div 
                          className="w-14 h-14 rounded-xl flex items-center justify-center text-2xl"
                          style={{ backgroundColor: company.color || '#f0fdf4' }}
                        >
                          {company.emoji || '🏢'}
                        </div>
                        
                        <div className="flex-1">
                          <h3 className="font-semibold text-lg text-gray-900">
                            {company.nameAr || company.name}
                          </h3>
                          <p className="text-sm text-gray-500">{company.name}</p>
                          
                          <div className="flex flex-wrap gap-2 mt-2">
                            {/* Plan Badge */}
                            <span className={cn(
                              "px-2 py-1 rounded-full text-xs font-medium",
                              PLAN_COLORS[company.plan] || PLAN_COLORS.trial
                            )}>
                              {company.plan.toUpperCase()}
                            </span>
                            
                            {/* Status Badge */}
                            <span className={cn(
                              "px-2 py-1 rounded-full text-xs font-medium",
                              STATUS_COLORS[company.subscriptionStatus] || STATUS_COLORS.inactive
                            )}>
                              {company.subscriptionStatus === 'active' ? '🟢 نشط' :
                               company.subscriptionStatus === 'inactive' ? '⚪ غير نشط':
                               company.subscriptionStatus === 'past_due' ? '🟡 متأخر':'❌ ملغي'}
                            </span>
                            
                            {/* AI Status Badge */}
                            {company.hasAIConfig ? (
                              <span className="px-2 py-1 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800">
                                🔑 AI مفعل
                              </span>
                            ) : (
                              <span className="px-2 py-1 rounded-full text-xs font-medium bg-red-50 text-red-700">
                                ❌ بدون AI
                              </span>
                            )}

                            {/* Date */}
                            <span className="px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
                              📅 {new Date(company.createdAt).toLocaleDateString('ar-EG')}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-3">
                        <GarfixButton
                          variant={company.hasAIConfig ? "outline" : "primary"}
                          size="sm"
                          onClick={() => openKeyModal(company)}
                        >
                          {company.hasAIConfig ? '✏️ تعديل المفتاح' : '🔑 إضافة مفتاح'}
                        </GarfixButton>
                      </div>
                    </div>
                  </div>
                </GarfixCard>
              </FadeUp>
            ))}
          </div>
        )}

        {/* ══ Add API Key Modal ══ */}
        <GarfixModal
          isOpen={showKeyModal}
          onClose={() => {
            setShowKeyModal(false);
            resetForm();
          }}
          title={`🔑 إعداد مفتاح AI - ${selectedCompany?.nameAr || selectedCompany?.name}`}
          size="lg"
        >
          <div className="space-y-6 p-6">
            
            {/* Alert inside modal */}
            {alert && (
              <GarfixAlert
                type={alert.type}
                message={alert.message}
                onClose={() => setAlert(null)}
              />
            )}

            {/* Provider Selection */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                مزود الخدمة (AI Provider)
              </label>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {AI_PROVIDERS.map((provider) => (
                  <button
                    key={provider.value}
                    onClick={() => {
                      setSelectedProvider(provider.value);
                      if (provider.value === 'google-gemini') {
                        setSelectedModel('gemini-2.0-flash');
                      }
                    }}
                    className={cn(
                      "p-3 rounded-lg border-2 text-center transition-all duration-200",
                      selectedProvider === provider.value
                        ? "border-emerald-500 bg-emerald-50 shadow-md"
                        : "border-gray-200 hover:border-gray-300 bg-white"
                    )}
                  >
                    <span className="text-2xl block mb-1">{provider.icon}</span>
                    <span className="text-sm font-medium">{provider.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Model Selection (for Gemini) */}
            {selectedProvider === 'google-gemini' && (
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  النموذج (Model)
                </label>
                <select
                  value={selectedModel}
                  onChange={(e) => setSelectedModel(e.target.value)}
                  className="w-full px-4 py-3 rounded-lg border border-gray-200 bg-white focus:ring-2 focus:ring-emerald-500"
                >
                  {GEMINI_MODELS.map((model) => (
                    <option key={model.value} value={model.value}>
                      {model.label}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* API Key Input */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                مفتاح API
              </label>
              <div className="relative">
                <input
                  type={showApiKey ? "text" : "password"}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder={
                    selectedProvider === 'google-gemini' 
                      ? 'أدخل مفتاح Google Gemini API هنا...'
                      : 'أدخل مفتاح API هنا...'
                  }
                  className="w-full px-4 py-3 pr-12 rounded-lg border border-gray-200 bg-white focus:ring-2 focus:ring-emerald-500 font-mono text-sm"
                  dir="ltr"
                />
                <button
                  type="button"
                  onClick={() => setShowApiKey(!showApiKey)}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showApiKey ? '🙈' : '👁️'}
                </button>
              </div>
              <p className="text-xs text-gray-500 mt-2">
                💡 المفتاح يتم تخزينه بشكل مشفر ولا يظهر إلا للمؤسسين فقط
              </p>
            </div>

            {/* Test Result */}
            {testResult && (
              <div className={cn(
                "p-4 rounded-lg",
                testResult.success 
                  ? "bg-emerald-50 border border-emerald-200" 
                  : "bg-red-50 border border-red-200"
              )}>
                <div className="flex items-center gap-2">
                  <span className="text-xl">{testResult.success ? '✅' : '❌'}</span>
                  <div>
                    <p className="font-semibold">
                      {testResult.success ? 'الاتصال ناجح!' : 'فشل الاتصال'}
                    </p>
                    <p className="text-sm text-gray-600">
                      {testResult.success 
                        ? `النموذج: ${testResult.model} | زمن الاستجابة: ${testResult.latencyMs}ms`
                        : testResult.error
                      }
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row gap-3 pt-4 border-t">
              <GarfixButton
                variant="outline"
                onClick={testConnection}
                disabled={isTesting || !apiKey || apiKey === '••••••••'}
                isLoading={isTesting}
                className="flex-1"
              >
                🧪 اختبار الاتصال
              </GarfixButton>
              
              <GarfixButton
                variant="primary"
                onClick={saveApiKey}
                disabled={isSaving || !apiKey || apiKey === '••••••••'}
                isLoading={isSaving}
                className="flex-1"
              >
                💾 حفظ المفتاح
              </GarfixButton>
            </div>
          </div>
        </GarfixModal>

      </GarfixContainer>
    </GarfixPageTransition>
  );
}

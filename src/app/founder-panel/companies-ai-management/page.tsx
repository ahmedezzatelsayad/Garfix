/**
 * ═════════════════════════════════════════════════════════════
 * GarfiX DS v4.0 - Multi-Tenant Per-Feature AI Management
 * 
 * صفحة إدارة مفاتيح AI لكل شركة - كل Feature بمفتاح منفصل!
 * 
 * 🎯 الهدف:
 * - 💬 Chat API Key → للمحادثات الذكية
 * - 📄 Invoice API Key → لاستخراج ومعالجة الفواتير
 * - 🔍 Parse API Key → للتحليل الذكي للمستندات
 * - 🧠 Memory API Key → للذاكرة والسياق
 *
 * ✨ المزايا:
 * - مفيش ضغط أو bottleneck
 * - لو 1000 شركة شغالة في نفس الوقت → كل واحدة على connection خاص
 * - كل feature مستقل عن التاني
 * - Rate Limit منفصل لكل feature
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
} from '@/components/garfix-ds/core';

import {
  GarfixContainer,
  GarfixGrid,
  GarfixPageHeader,
} from '@/components/garfix-ds/layout';

import {
  GarfixAlert,
  GarfixSkeleton,
} from '@/components/garfix-ds/feedback';

import { GarfixModal } from '@/components/garfix-ds/overlay';

import {
  GarfixAnimatedContainer,
  FadeUp,
  MotionCard,
  GarfixPageTransition,
} from '@/components/garfix-ds/animations';

// ── Types ───────────────────────────────────────────────────

interface CompanyData {
  id: string;
  name: string;
  nameAr?: string;
  slug: string;
  plan: string;
  subscriptionStatus: string;
  createdAt: string;
  emoji?: string;
  color?: string;
  hasAIConfig: boolean;
}

interface FeatureConfig {
  enabled: boolean;
  model: string;
  apiKey: string;
  hasApiKey: boolean;
  rateLimitRpm: number;
  tokensUsed: number;
  requestsCount: number;
}

interface CompanyAIConfigData {
  id: string;
  chat: FeatureConfig;
  invoice: FeatureConfig;
  parse: FeatureConfig;
  memory: FeatureConfig;
  updatedAt: string;
}

interface TestResult {
  success: boolean;
  latencyMs: number;
  model: string;
  error?: string;
  feature: string;
}

// ── Constants ─────────────────────────────────────────────────

const FEATURES = [
  { 
    key: 'chat' as const, 
    label: 'المحادثة الذكية', 
    icon: '💬', 
    color: 'blue',
    description: 'AI Chat & Copilot',
    rateLimitDefault: 60,
  },
  { 
    key: 'invoice' as const, 
    label: 'معالجة الفواتير', 
    icon: '📄', 
    color: 'emerald',
    description: 'Invoice Extraction & Processing',
    rateLimitDefault: 100,
  },
  { 
    key: 'parse' as const, 
    label: 'التحليل الذكي', 
    icon: '🔍', 
    color: 'purple',
    description: 'Smart Document Parsing',
    rateLimitDefault: 80,
  },
  { 
    key: 'memory' as const, 
    label: 'الذاكرة والسياق', 
    icon: '🧠', 
    color: 'amber',
    description: 'Context & History Memory',
    rateLimitDefault: 30,
  },
] as const;

const AI_MODELS = [
  // ── 🟢 DeepSeek Models (Recommended - Cheap & Fast!) ──
  { value: 'deepseek/deepseek-chat-v3-0324', label: 'DeepSeek V3 Chat (⭐ أنصح)', provider: 'openrouter', badge: '⭐ الأفضل', color: 'emerald' },
  { value: 'deepseek/deepseek-r1-0528', label: 'DeepSeek R1 (Reasoning)', provider: 'openrouter', badge: 'ذكاء', color: 'emerald' },
  { value: 'deepseek/deepseek-v3-0324:free', label: 'DeepSeek V3 Free (مجاني!)', provider: 'openrouter', badge: 'مجاني', color: 'green' },
  
  // ── 🔵 Gemini Models (Google) ──
  { value: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash (سريع + مجاني)', provider: 'gemini', badge: 'مجاني', color: 'blue' },
  { value: 'gemini-1.5-flash', label: 'Gemini 1.5 Flash', provider: 'gemini', color: 'blue' },
  { value: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro (متقدم)', provider: 'gemini', badge: 'Pro', color: 'indigo' },
  
  // ── 🟢 OpenAI Models ──
  { value: 'gpt-4o-mini', label: 'GPT-4o Mini (اقتصادي)', provider: 'openai', color: 'green' },
  { value: 'gpt-4o', label: 'GPT-4o (متقدم)', provider: 'openai', badge: 'قوي', color: 'green' },
  
  // ── 🟠 OpenRouter Models (Multi-provider) ──
  { value: 'google/gemini-pro-1.5', label: 'Gemini Pro 1.5 via Router', provider: 'openrouter', color: 'orange' },
  { value: 'meta-llama/llama-3.1-70b-instruct', label: 'Llama 3.1 70B', provider: 'openrouter', color: 'purple' },
  { value: 'anthropic/claude-3.5-haiku', label: 'Claude 3.5 Haiku', provider: 'openrouter', badge: 'سريع', color: 'orange' },
];

// Provider categories with icons and descriptions
const PROVIDER_CATEGORIES = {
  deepseek: {
    icon: '🟢',
    name: 'DeepSeek',
    description: 'أسرع وأرخص - أنصح به!',
    color: 'emerald',
    models: AI_MODELS.filter(m => m.value.includes('deepseek')),
  },
  gemini: {
    icon: '🔵',
    name: 'Google Gemini',
    description: 'مجاني من Google',
    color: 'blue',
    models: AI_MODELS.filter(m => m.provider === 'gemini'),
  },
  openai: {
    icon: '🟢',
    name: 'OpenAI',
    description: 'GPT-4o قوي وموثوق',
    color: 'green',
    models: AI_MODELS.filter(m => m.provider === 'openai'),
  },
  openrouter: {
    icon: '🟠',
    name: 'OpenRouter',
    description: 'وصول لكل الموديلات',
    color: 'orange',
    models: AI_MODELS.filter(m => m.provider === 'openrouter' && !m.value.includes('deepseek')),
  },
};

const PROVIDER_LABELS: Record<string, string> = {
  gemini: '🔵 Google Gemini',
  openai: '🟢 OpenAI',
  openrouter: '🟠 OpenRouter',
  deepseek: '🟢 DeepSeek',
};

const PROVIDER_KEY_HINTS: Record<string, string> = {
  gemini: 'يبدأ بـ AIza... أو AQ...',
  openai: 'يبدأ بـ sk-...',
  openrouter: 'يبدأ بـ sk-or-... (يدعم DeepSeek)',
  deepseek: 'استخدم مفتاح OpenRouter: sk-or-...',
};

const FEATURE_COLORS: Record<string, string> = {
  blue: 'border-blue-500 bg-blue-50',
  emerald: 'border-emerald-500 bg-emerald-50',
  purple: 'border-purple-500 bg-purple-50',
  amber: 'border-amber-500 bg-amber-50',
};

// ── Main Component ──────────────────────────────────────────

export default function CompaniesPerFeatureAIPage() {
  // ── State ───────────────────────────────────────────────
  
  const [companies, setCompanies] = useState<CompanyData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Modal state
  const [selectedCompany, setSelectedCompany] = useState<CompanyData | null>(null);
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [aiConfig, setAiConfig] = useState<CompanyAIConfigData | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testingFeature, setTestingFeature] = useState<string | null>(null);
  
  // Form state (per-feature)
  const [featureKeys, setFeatureKeys] = useState<Record<string, string>>({
    chat: '',
    invoice: '',
    parse: '',
    memory: '',
  });
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({
    chat: false,
    invoice: false,
    parse: false,
    memory: false,
  });
  const [testResults, setTestResults] = useState<Record<string, TestResult | null>>({});
  
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
        setAiConfig(data.data);
        
        // Initialize form keys (masked if exists)
        setFeatureKeys({
          chat: data.data.chat?.hasApiKey ? '••••••••' : '',
          invoice: data.data.invoice?.hasApiKey ? '••••••••' : '',
          parse: data.data.parse?.hasApiKey ? '••••••••' : '',
          memory: data.data.memory?.hasApiKey ? '••••••••' : '',
        });
        
        return data.data;
      }
      return null;
    } catch (error) {
      console.error('Fetch AI config error:', error);
      return null;
    }
  };

  /**
   * Save all feature keys for a company
   */
  const saveAllFeatures = async () => {
    if (!selectedCompany || !aiConfig) {
      setAlert({ type: 'error', message: 'يرجى اختيار شركة أولاً' });
      return;
    }

    try {
      setIsSaving(true);
      
      const response = await fetch('/api/founder-panel/ai-config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat: {
            apiKey: featureKeys.chat,
            model: aiConfig.chat.model,
            enabled: true,
            rateLimitRpm: aiConfig.chat.rateLimitRpm,
          },
          invoice: {
            apiKey: featureKeys.invoice,
            model: aiConfig.invoice.model,
            enabled: true,
            rateLimitRpm: aiConfig.invoice.rateLimitRpm,
          },
          parse: {
            apiKey: featureKeys.parse,
            model: aiConfig.parse.model,
            enabled: true,
            rateLimitRpm: aiConfig.parse.rateLimitRpm,
          },
          memory: {
            apiKey: featureKeys.memory,
            model: aiConfig.memory.model,
            enabled: true,
            rateLimitRpm: aiConfig.memory.rateLimitRpm,
          },
          systemPrompt: '',
          costOptimization: 'balanced',
          notifyHighUsage: true,
          usageNotificationThreshold: 80,
        }),
      });

      const data = await response.json();
      
      if (data.success) {
        setAlert({ type: 'success', message: `✅ تم حفظ إعدادات AI لـ ${selectedCompany.nameAr || selectedCompany.name} بنجاح!` });
        setShowConfigModal(false);
        resetForm();
        fetchCompanies();
      } else {
        setAlert({ type: 'error', message: data.error || 'فشل الحفظ' });
      }
    } catch (error) {
      console.error('Save error:', error);
      setAlert({ type: 'error', message: 'خطأ في الاتصال' });
    } finally {
      setIsSaving(false);
    }
  };

  /**
   * Test API connection for a specific feature
   */
  const testFeatureConnection = async (featureKey: string) => {
    const apiKey = featureKeys[featureKey];
    
    if (!apiKey || apiKey === '••••••••') {
      setAlert({ type: 'error', message: 'يرجى إدخال المفتاح أولاً' });
      return;
    }

    try {
      setIsTesting(true);
      setTestingFeature(featureKey);
      
      const feature = FEATURES.find(f => f.key === featureKey);
      const model = aiConfig?.[featureKey as keyof CompanyAIConfigData]?.model || 'gemini-2.0-flash';
      
      const response = await fetch('/api/founder-panel/ai-config/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          feature: featureKey,
          apiKey: apiKey.trim(),
          model,
        }),
      });

      const data = await response.json();
      
      if (data.success) {
        setTestResults(prev => ({
          ...prev,
          [featureKey]: data.data,
        }));
        
        if (data.data.success) {
          setAlert({ type: 'success', message: `✅ ${feature?.label}: الاتصال ناجح! (${data.data.latencyMs}ms)` });
        } else {
          setAlert({ type: 'error', message: `❌ ${feature?.label}: ${data.data.error}` });
        }
      }
    } catch (error) {
      console.error('Test error:', error);
      setTestResults(prev => ({
        ...prev,
        [featureKey]: { success: false, latencyMs: 0, model: '', error: 'خطأ في الاتصال', feature: featureKey },
      }));
    } finally {
      setIsTesting(false);
      setTestingFeature(null);
    }
  };

  // ── Handlers ─────────────────────────────────────────────

  /**
   * Open modal to configure AI for a company
   */
  const openConfigModal = async (company: CompanyData) => {
    setSelectedCompany(company);
    setTestResults({});
    setAlert(null);
    
    await fetchCompanyAIConfig(company.id);
    setShowConfigModal(true);
  };

  /**
   * Reset form state
   */
  const resetForm = () => {
    setFeatureKeys({ chat: '', invoice: '', parse: '', memory: '' });
    setShowKeys({ chat: false, invoice: false, parse: false, memory: false });
    setTestResults({});
    setAiConfig(null);
  };

  /**
   * Update feature key in form
   */
  const updateFeatureKey = (feature: string, value: string) => {
    setFeatureKeys(prev => ({ ...prev, [feature]: value }));
    // Clear test result when key changes
    setTestResults(prev => ({ ...prev, [feature]: null }));
  };

  /**
   * Filter companies
   */
  const filteredCompanies = companies.filter(company => {
    if (!searchQuery) return true;
    return (
      company.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      company.nameAr?.includes(searchQuery) ||
      company.slug.includes(searchQuery)
    );
  });

  // Stats
  const totalCompanies = companies.length;
  const companiesWithAnyKey = companies.filter(c => c.hasAIConfig).length;

  // ── Render ───────────────────────────────────────────────

  return (
    <GarfixPageTransition>
      <GarfixContainer maxWidth="7xl">
        
        {/* ══ Page Header ══ */}
        <GarfixPageHeader
          title="إدارة مفاتيح AI المتقدمة"
          subtitle="نظام متعدد المستأجرين - كل شركة بمفاتيح منعزلة لكل ميزة AI"
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

        {/* ══ Architecture Diagram ══ */}
        <GarfixCard className="mb-8 p-6 bg-gradient-to-r from-emerald-50 to-blue-50 dark:from-emerald-950 dark:to-blue-950">
          <div className="text-center">
            <h3 className="text-lg font-bold text-gray-800 dark:text-white mb-4">
              🏗️ بنية النظام: Per-Feature Isolation
            </h3>
            
            <div className="flex flex-wrap justify-center gap-4 text-sm">
              <div className="bg-blue-100 dark:bg-blue-900 px-4 py-2 rounded-lg">
                <span className="text-xl">💬</span> Chat Token
              </div>
              <span className="text-gray-400">+</span>
              <div className="bg-emerald-100 dark:bg-emerald-900 px-4 py-2 rounded-lg">
                <span className="text-xl">📄</span> Invoice Token
              </div>
              <span className="text-gray-400">+</span>
              <div className="bg-purple-100 dark:bg-purple-900 px-4 py-2 rounded-lg">
                <span className="text-xl">🔍</span> Parse Token
              </div>
              <span className="text-gray-400">+</span>
              <div className="bg-amber-100 dark:bg-amber-900 px-4 py-2 rounded-lg">
                <span className="text-xl">🧠</span> Memory Token
              </div>
              <span className="text-gray-400">=</span>
              <div className="bg-gray-800 text-white px-4 py-2 rounded-lg font-bold">
                ✅ No Bottleneck!
              </div>
            </div>
            
            <p className="text-xs text-gray-600 dark:text-gray-400 mt-3">
              كل شركة → 4 توكنات منعزلة → 1000 شركة × 4 = 4000 اتصال موزع بدون ضغط
            </p>
          </div>
        </GarfixCard>

        {/* ══ AI Providers Comparison ══ */}
        <GarfixCard className="mb-8 p-6">
          <h3 className="text-lg font-bold text-gray-800 dark:text-white mb-4 text-center">
            🤖 موديلات AI المدعومة
          </h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* ── DeepSeek (Recommended) ── */}
            <div className="relative border-2 border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20 rounded-xl p-4 overflow-hidden">
              <div className="absolute top-0 right-0 bg-emerald-500 text-white text-xs px-2 py-1 rounded-bl-lg font-bold">
                ⭐ أنصح
              </div>
              <div className="text-2xl mb-2">🟢</div>
              <h4 className="font-bold text-emerald-800 dark:text-emerald-300">DeepSeek</h4>
              <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-1">أسرع + أرخص</p>
              <ul className="text-xs mt-2 space-y-1 text-gray-600 dark:text-gray-400">
                <li>✅ V3 Chat (رخيص جداً)</li>
                <li>✅ R1 Reasoning (ذكاء)</li>
                <li>✅ Free Tier متاح</li>
              </ul>
              <p className="text-xs mt-2 text-emerald-700 dark:text-emerald-300 font-semibold">
                المفتاح: sk-or-...
              </p>
            </div>

            {/* ── Gemini ── */}
            <div className="border border-gray-200 bg-gray-50 dark:bg-gray-800/50 rounded-xl p-4">
              <div className="text-2xl mb-2">🔵</div>
              <h4 className="font-bold text-gray-800 dark:text-gray-300">Gemini Flash</h4>
              <p className="text-xs text-gray-500 mt-1">مجاني من Google</p>
              <ul className="text-xs mt-2 space-y-1 text-gray-600 dark:text-gray-400">
                <li>✅ 2.0 Flash (سريع)</li>
                <li>✅ 2.5 Pro (متقدم)</li>
                <li>❌ مشكلات Region</li>
              </ul>
              <p className="text-xs mt-2 text-gray-500 font-semibold">
                المفتاح: AIza...
              </p>
            </div>

            {/* ── OpenAI ── */}
            <div className="border border-gray-200 bg-gray-50 dark:bg-gray-800/50 rounded-xl p-4">
              <div className="text-2xl mb-2">🟢</div>
              <h4 className="font-bold text-gray-800 dark:text-gray-300">OpenAI GPT</h4>
              <p className="text-xs text-gray-500 mt-1">قوي وموثوق</p>
              <ul className="text-xs mt-2 space-y-1 text-gray-600 dark:text-gray-400">
                <li>✅ GPT-4o Mini (اقتصادي)</li>
                <li>✅ GPT-4o (قوي)</li>
                <li>⚠️ غالي شوية</li>
              </ul>
              <p className="text-xs mt-2 text-gray-500 font-semibold">
                المفتاح: sk-...
              </p>
            </div>

            {/* ── OpenRouter ── */}
            <div className="border border-gray-200 bg-gray-50 dark:bg-gray-800/50 rounded-xl p-4">
              <div className="text-2xl mb-2">🟠</div>
              <h4 className="font-bold text-gray-800 dark:text-gray-300">OpenRouter</h4>
              <p className="text-xs text-gray-500 mt-1">وصول لكل الموديلات</p>
              <ul className="text-xs mt-2 space-y-1 text-gray-600 dark:text-gray-400">
                <li>✅ Llama 3.1</li>
                <li>✅ Claude Haiku</li>
                <li>✅ Gemini via Router</li>
              </ul>
              <p className="text-xs mt-2 text-gray-500 font-semibold">
                المفتاح: sk-or-...
              </p>
            </div>
          </div>
          
          <p className="text-xs text-center text-gray-500 mt-4">
            💡 كل Feature في الشركة ممكن يستخدم موديل مختلف حسب الاحتياج
          </p>
        </GarfixCard>

        {/* ══ Stats Cards ══ */}
        <GarfixGrid cols={3} className="mb-8">
          <MotionCard>
            <div className="text-center p-4">
              <div className="text-3xl font-bold text-emerald-600">{totalCompanies}</div>
              <div className="text-sm text-gray-500 mt-1">إجمالي الشركات</div>
            </div>
          </MotionCard>

          <MotionCard>
            <div className="text-center p-4">
              <div className="text-3xl font-bold text-blue-600">{companiesWithAnyKey}</div>
              <div className="text-sm text-gray-500 mt-1">شركات بها AI ⚡</div>
            </div>
          </MotionCard>

          <MotionCard>
            <div className="text-center p-4">
              <div className="text-3xl font-bold text-purple-600">4</div>
              <div className="text-sm text-gray-500 mt-1">مفاتيح لكل شركة 🔑</div>
            </div>
          </MotionCard>
        </GarfixGrid>

        {/* ══ Search Bar ══ */}
        <GarfixCard className="mb-6">
          <GarfixInput
            placeholder="🔍 ابحث عن شركة..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full"
          />
        </GarfixCard>

        {/* ══ Companies List ══ */}
        {isLoading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <GarfixCard key={i}>
                <GarfixSkeleton className="h-32 w-full" />
              </GarfixCard>
            ))}
          </div>
        ) : filteredCompanies.length === 0 ? (
          <GarfixCard className="p-12 text-center">
            <div className="text-6xl mb-4">🏢</div>
            <h3 className="text-xl font-semibold text-gray-700 mb-2">لا توجد شركات</h3>
            <p className="text-gray-500">الشركات التي تسجل ستظهر هنا تلقائياً</p>
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
                          <p className="text-sm text-gray-500">{company.plan.toUpperCase()}</p>
                          
                          {/* Feature Keys Status */}
                          {company.hasAIConfig && (
                            <div className="flex flex-wrap gap-1 mt-2">
                              {FEATURES.map(f => (
                                <span 
                                  key={f.key}
                                  className={cn(
                                    "px-2 py-0.5 rounded-full text-xs font-medium",
                                    FEATURE_COLORS[f.color]
                                  )}
                                >
                                  {f.icon} {f.label}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Action Button */}
                      <GarfixButton
                        variant={company.hasAIConfig ? "outline" : "primary"}
                        size="sm"
                        onClick={() => openConfigModal(company)}
                      >
                        {company.hasAIConfig ? '✏️ تعديل الإعدادات' : '⚙️ إعداد AI'}
                      </GarfixButton>
                    </div>
                  </div>
                </GarfixCard>
              </FadeUp>
            ))}
          </div>
        )}

        {/* ══ Per-Feature Configuration Modal ══ */}
        <GarfixModal
          isOpen={showConfigModal}
          onClose={() => {
            setShowConfigModal(false);
            resetForm();
          }}
          title={`⚙️ إعدادات AI المتقدمة - ${selectedCompany?.nameAr || selectedCompany?.name}`}
          size="xl"
        >
          <div className="space-y-6 p-6 max-h-[80vh] overflow-y-auto">
            
            {/* Alert */}
            {alert && (
              <GarfixAlert
                type={alert.type}
                message={alert.message}
                onClose={() => setAlert(null)}
              />
            )}

            {/* Features Grid */}
            {FEATURES.map((feature) => (
              <FadeUp key={feature.key} delay={FEATURES.indexOf(feature) * 100}>
                <GarfixCard className={cn(
                  "border-2 transition-all",
                  FEATURE_COLORS[feature.color],
                  testResults[feature.key]?.success && "ring-2 ring-green-500",
                  testResults[feature.key]?.success === false && "ring-2 ring-red-500"
                )}>
                  <div className="p-4">
                    {/* Feature Header */}
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <span className="text-3xl">{feature.icon}</span>
                        <div>
                          <h4 className="font-bold text-gray-900">{feature.label}</h4>
                          <p className="text-xs text-gray-500">{feature.description}</p>
                        </div>
                      </div>
                      
                      {/* Status Badge */}
                      {testResults[feature.key] && (
                        <span className={cn(
                          "px-2 py-1 rounded-full text-xs font-medium",
                          testResults[feature.key].success 
                            ? "bg-green-100 text-green-800" 
                            : "bg-red-100 text-red-800"
                        )}>
                          {testResults[feature.key].success ? '✅ متصل' : '❌ فشل'}
                        </span>
                      )}
                    </div>

                    {/* Model Selection */}
                    <div className="mb-3">
                      <label className="block text-xs font-semibold text-gray-700 mb-1">
                        النموذج (Model)
                      </label>
                      <select
                        value={aiConfig?.[feature.key as keyof CompanyAIConfigData]?.model || 'gemini-2.0-flash'}
                        onChange={(e) => {
                          if (aiConfig) {
                            setAiConfig({
                              ...aiConfig,
                              [feature.key]: {
                                ...aiConfig[feature.key as keyof CompanyAIConfigData],
                                model: e.target.value,
                              } as FeatureConfig,
                            });
                          }
                        }}
                        className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm focus:ring-2 focus:ring-emerald-500 font-medium"
                      >
                        {/* ── 🟢 DeepSeek (Recommended) ── */}
                        <optgroup label="🟢 DeepSeek - ⭐ أنصح به (رخيص + سريع)">
                          {AI_MODELS.filter(m => m.value.includes('deepseek')).map(m => (
                            <option key={m.value} value={m.value}>
                              {m.label} {m.badge ? `(${m.badge})` : ''}
                            </option>
                          ))}
                        </optgroup>
                        
                        {/* ── 🔵 Gemini (Google) ── */}
                        <optgroup label="🔵 Google Gemini - مجاني">
                          {AI_MODELS.filter(m => m.provider === 'gemini').map(m => (
                            <option key={m.value} value={m.value}>
                              {m.label} {m.badge ? `(${m.badge})` : ''}
                            </option>
                          ))}
                        </optgroup>
                        
                        {/* ── 🟢 OpenAI ── */}
                        <optgroup label="🟢 OpenAI - GPT-4o">
                          {AI_MODELS.filter(m => m.provider === 'openai').map(m => (
                            <option key={m.value} value={m.value}>
                              {m.label} {m.badge ? `(${m.badge})` : ''}
                            </option>
                          ))}
                        </optgroup>
                        
                        {/* ── 🟠 OpenRouter (Others) ── */}
                        <optgroup label="🟠 OpenRouter - موديلات تانية">
                          {AI_MODELS.filter(m => m.provider === 'openrouter' && !m.value.includes('deepseek')).map(m => (
                            <option key={m.value} value={m.value}>
                              {m.label} {m.badge ? `(${m.badge})` : ''}
                            </option>
                          ))}
                        </optgroup>
                      </select>
                      
                      {/* Provider Hint */}
                      <p className="text-xs text-gray-500 mt-1">
                        💡 {(() => {
                          const selectedModel = aiConfig[feature.key as keyof CompanyAIConfigData]?.model || '';
                          if (selectedModel.includes('deepseek')) return 'DeepSeek: أسرع وأرخص - يستخدم مفتاح OpenRouter';
                          if (selectedModel.includes('gemini')) return 'Gemini: مجاني من Google';
                          if (selectedModel.startsWith('gpt')) return 'OpenAI: قوي وموثوق';
                          return 'اختر الموديل المناسب';
                        })()}
                      </p>
                    </div>

                    {/* API Key Input */}
                    <div className="mb-3">
                      <label className="block text-xs font-semibold text-gray-700 mb-1">
                        مفتاح API (API Key)
                      </label>
                      <div className="relative">
                        <input
                          type={showKeys[feature.key] ? "text" : "password"}
                          value={featureKeys[feature.key]}
                          onChange={(e) => updateFeatureKey(feature.key, e.target.value)}
                          placeholder="أدخل مفتاح API..."
                          className="w-full px-3 py-2 pr-10 rounded-lg border border-gray-200 bg-white font-mono text-sm"
                          dir="ltr"
                        />
                        <button
                          type="button"
                          onClick={() => setShowKeys(prev => ({ ...prev, [feature.key]: !prev[feature.key] }))}
                          className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                        >
                          {showKeys[feature.key] ? '🙈' : '👁️'}
                        </button>
                      </div>
                    </div>

                    {/* Test Result */}
                    {testResults[feature.key] && (
                      <div className={cn(
                        "p-3 rounded-lg text-sm mb-3",
                        testResults[feature.key].success 
                          ? "bg-green-50 text-green-800" 
                          : "bg-red-50 text-red-800"
                      )}>
                        <div className="flex items-center gap-2">
                          <span>{testResults[feature.key].success ? '✅' : '❌'}</span>
                          <span>
                            {testResults[feature.key].success 
                              ? `اتصال ناجح! (${testResults[feature.key].latencyMs}ms)`
                              : testResults[feature.key].error
                            }
                          </span>
                        </div>
                      </div>
                    )}

                    {/* Test Button */}
                    <GarfixButton
                      variant="outline"
                      size="sm"
                      onClick={() => testFeatureConnection(feature.key)}
                      disabled={isTesting || !featureKeys[feature.key] || featureKeys[feature.key] === '••••••••'}
                      isLoading={isTesting && testingFeature === feature.key}
                      className="w-full"
                    >
                      🧪 اختبار الاتصال - {feature.label}
                    </GarfixButton>
                  </div>
                </GarfixCard>
              </FadeUp>
            ))}

            {/* Save All Button */}
            <div className="pt-4 border-t">
              <GarfixButton
                variant="primary"
                onClick={saveAllFeatures}
                disabled={isSaving}
                isLoading={isSaving}
                className="w-full"
                size="lg"
              >
                💾 حفظ جميع الإعدادات (4 Features)
              </GarfixButton>
              
              <p className="text-xs text-gray-500 text-center mt-2">
                سيتم حفظ مفاتيح AI لكل Feature بشكل منعزل
              </p>
            </div>
          </div>
        </GarfixModal>

      </GarfixContainer>
    </GarfixPageTransition>
  );
}

/**
 * ═════════════════════════════════════════════════════════════
 * GarfiX DS v4.0 - Founder Panel: API Key Pool Management
 * 
 * صفحة إدارة مجمع مفاتيح API
 * 
 * 🎯 الوظيفة:
 * - رفع مفاتيح API (OpenRouter, Gemini, OpenAI)
 * - التوزيع التلقائي على المستخدمين الجدد
 * - متابعة الاستهلاك والتنبيهات
 * - عرض الإحصائيات (متاح / مستخدم / نفذ)
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
  GarfixTextarea,
} from '@/components/garfix-ds/core';

import {
  GarfixContainer,
  GarfixGrid,
  GarfixPageHeader,
} from '@/components/garfix-ds/layout';

import {
  GarfixAlert,
  GarfixSkeleton,
  GarfixBadge,
} from '@/components/garfix-ds/feedback';

import { GarfixModal } from '@/components/garfix-ds/overlay';

import {
  GarfixAnimatedContainer,
  FadeUp,
  MotionCard,
  GarfixPageTransition,
} from '@/components/garfix-ds/animations';

// ── Types ───────────────────────────────────────────────────

interface ApiKeyData {
  id: string;
  keyValue: string;      // Masked
  provider: string;
  model: string;
  status: 'available' | 'assigned' | 'exhausted' | 'revoked';
  assignedToUserId?: string;
  assignedToCompanyId?: string;
  assignedToUserName?: string;
  assignedToCompanyName?: string;
  assignedAt?: string;
  timesUsed: number;
  lastUsedAt?: string;
  rpmLimit: number;
  dailyLimit: number;
  usedToday: number;
  notes?: string;
  createdAt: string;
}

interface PoolStats {
  totalKeys: number;
  availableKeys: number;
  assignedKeys: number;
  exhaustedKeys: number;
  revokedKeys: number;
  totalUsageToday: number;
  keysRunningLow: boolean;
  lowThreshold: number;
}

// ── Constants ───────────────────────────────────────────────

const PROVIDER_ICONS: Record<string, string> = {
  openrouter: '🟠',
  gemini: '🔵',
  openai: '🟢',
};

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  available: { label: 'متاح', color: 'text-emerald-700', bg: 'bg-emerald-100' },
  assigned: { label: 'مستخدم', color: 'text-blue-700', bg: 'bg-blue-100' },
  exhausted: { label: 'منتهي', color: 'text-red-700', bg: 'bg-red-100' },
  revoked: { label: 'ملغي', color: 'text-gray-700', bg: 'bg-gray-100' },
};

const DEFAULT_MODEL = 'deepseek/deepseek-chat-v3-0324';

// ── Main Component ──────────────────────────────────────────

export default function FounderApiKeyPoolPage() {
  // ── State ───────────────────────────────────────────────
  
  const [keys, setKeys] = useState<ApiKeyData[]>([]);
  const [stats, setStats] = useState<PoolStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  
  // Modal state
  const [showAddModal, setShowAddModal] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  
  // Form state
  const [newKeysText, setNewKeysText] = useState('');
  const [selectedProvider, setSelectedProvider] = useState('openrouter');
  const [selectedModel, setSelectedModel] = useState(DEFAULT_MODEL);
  const [notes, setNotes] = useState('');
  
  // Alert state
  const [alert, setAlert] = useState<{ type: 'success' | 'error' | 'warning'; message: string } | null>(null);

  // ── Effects ─────────────────────────────────────────────
  
  useEffect(() => {
    fetchPoolData();
  }, []);

  // ── API Calls ────────────────────────────────────────────

  /**
   * Fetch pool data (keys + stats)
   */
  const fetchPoolData = async () => {
    try {
      setIsLoading(true);
      
      const response = await fetch('/api/founder-panel/api-key-pool');
      const data = await response.json();
      
      if (data.success) {
        setKeys(data.data.keys || []);
        setStats(data.data.stats || null);
        
        // Check for low key alert
        if (data.data.stats?.keysRunningLow) {
          setAlert({
            type: 'warning',
            message: `⚠️ تنبيه: باقي ${data.data.stats.availableKeys} مفتاح فقط! حتضيف مفاتيح جديدة.`,
          });
        }
      } else {
        setAlert({ type: 'error', message: data.error || 'فشل تحميل البيانات' });
      }
    } catch (error) {
      console.error('Fetch pool error:', error);
      setAlert({ type: 'error', message: 'خطأ في الاتصال بالخادم' });
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Add new keys to the pool
   */
  const addKeysToPool = async () => {
    if (!newKeysText.trim()) {
      setAlert({ type: 'error', message: 'يرجى إدخال مفاتيح API واحدة على الأقل' });
      return;
    }

    // Parse keys from text (one per line or comma-separated)
    const parsedKeys = newKeysText
      .split(/[\n,]+/)
      .map(k => k.trim())
      .filter(k => k.length > 10); // Basic validation
    
    if (parsedKeys.length === 0) {
      setAlert({ type: 'error', message: 'لم يتم العثور على مفاتيح صالحة' });
      return;
    }

    try {
      setIsAdding(true);
      
      const response = await fetch('/api/founder-panel/api-key-pool', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          keys: parsedKeys,
          provider: selectedProvider,
          model: selectedModel,
          notes: notes || undefined,
        }),
      });

      const data = await response.json();
      
      if (data.success) {
        setAlert({ 
          type: 'success', 
          message: `✅ تم إضافة ${data.data.addedCount} مفتاح بنجاح!` 
        });
        setShowAddModal(false);
        setNewKeysText('');
        setNotes('');
        fetchPoolData(); // Refresh data
      } else {
        setAlert({ type: 'error', message: data.error || 'فشل إضافة المفاتيح' });
      }
    } catch (error) {
      console.error('Add keys error:', error);
      setAlert({ type: 'error', message: 'خطأ في الاتصال' });
    } finally {
      setIsAdding(false);
    }
  };

  /**
   * Revoke a key
   */
  const revokeKey = async (keyId: string) => {
    if (!confirm('هل أنت متأكد من إلغاء هذا المفتاح؟')) return;

    try {
      const response = await fetch(`/api/founder-panel/api-key-pool/${keyId}`, {
        method: 'DELETE',
      });

      const data = await response.json();
      
      if (data.success) {
        setAlert({ type: 'success', message: '✅ تم إلغاء المفتاح' });
        fetchPoolData();
      } else {
        setAlert({ type: 'error', message: data.error || 'فشل الإلغاء' });
      }
    } catch (error) {
      setAlert({ type: 'error', message: 'خطأ في الاتصال' });
    }
  };

  // ── Render ───────────────────────────────────────────────

  return (
    <GarfixPageTransition>
      <GarfixContainer maxWidth="7xl">
        
        {/* ══ Page Header ══ */}
        <GarfixPageHeader
          title="مجمع مفاتيح API"
          subtitle="إدارة وتوزيع مفاتيح AI تلقائياً على المستخدمين الجدد"
          badge={stats ? {
            text: `${stats.availableKeys} متاح`,
            variant: stats.availableKeys > 5 ? 'default' : 'destructive',
          } : undefined}
          action={
            <GarfixButton
              onClick={() => setShowAddModal(true)}
              className="gap-2"
            >
              ➕ إضافة مفاتيح جديدة
            </GarfixButton>
          }
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
        {!isLoading && stats && (
          <GarfixGrid cols={4} className="mb-8">
            <MotionCard>
              <div className="text-center p-4">
                <div className="text-3xl font-bold text-gray-800">{stats.totalKeys}</div>
                <div className="text-sm text-gray-500 mt-1">إجمالي المفاتيح</div>
              </div>
            </MotionCard>

            <MotionCard delay={50}>
              <div className="text-center p-4">
                <div className="text-3xl font-bold text-emerald-600">{stats.availableKeys}</div>
                <div className="text-sm text-gray-500 mt-1">متاحة للتوزيع ✅</div>
              </div>
            </MotionCard>

            <MotionCard delay={100}>
              <div className="text-center p-4">
                <div className="text-3xl font-bold text-blue-600">{stats.assignedKeys}</div>
                <div className="text-sm text-gray-500 mt-1">مستخدمة حالياً 👥</div>
              </div>
            </MotionCard>

            <MotionCard delay={150}>
              <div className="text-center p-4">
                <div className="text-3xl font-bold text-red-600">{stats.exhaustedKeys}</div>
                <div className="text-sm text-gray-500 mt-1">منتهية ⚠️</div>
              </div>
            </MotionCard>
          </GarfixGrid>
        )}

        {/* ══ Usage Today Bar ══ */}
        {!isLoading && stats && (
          <GarfixCard className="mb-6 p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-semibold text-gray-700">استهلاك اليوم</span>
              <span className="text-xs text-gray-500">{stats.totalUsageToday} طلب</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-3">
              <div 
                className={cn(
                  "h-3 rounded-full transition-all",
                  stats.totalUsageToday > 800 ? "bg-red-500" :
                  stats.totalUsageToday > 500 ? "bg-yellow-500" : "bg-emerald-500"
                )}
                style={{ width: `${Math.min((stats.totalUsageToday / 1000) * 100, 100)}%` }}
              />
            </div>
            <p className="text-xs text-gray-500 mt-1">
              {stats.totalUsageToday}/1000 طلب يومي (معدل لكل مفتاح)
            </p>
          </GarfixCard>
        )}

        {/* ══ Keys List ══ */}
        <GarfixCard className="mb-6">
          <div className="p-4 border-b border-gray-200">
            <h3 className="font-bold text-gray-800">🔑 قائمة المفاتيح</h3>
          </div>
          
          {isLoading ? (
            <div className="p-6 space-y-4">
              {[1, 2, 3].map(i => (
                <GarfixSkeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : keys.length === 0 ? (
            <div className="p-12 text-center">
              <div className="text-5xl mb-4">🗝️</div>
              <h3 className="text-lg font-semibold text-gray-700 mb-2">لا توجد مفاتيح</h3>
              <p className="text-sm text-gray-500 mb-4">
                ابدأ بإضافة مفاتيح API لتوزيعها تلقائياً على المستخدمين الجدد
              </p>
              <GarfixButton onClick={() => setShowAddModal(true)}>
                ➕ إضافة أول مفتاح
              </GarfixButton>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {keys.map((key, index) => (
                <FadeUp key={key.id} delay={index * 30}>
                  <div className="p-4 hover:bg-gray-50 transition-colors">
                    <div className="flex items-start justify-between gap-4">
                      {/* Key Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-lg">
                            {PROVIDER_ICONS[key.provider] || '🔑'}
                          </span>
                          <code className="text-sm font-mono bg-gray-100 px-2 py-0.5 rounded">
                            {maskKey(key.keyValue)}
                          </code>
                          <GarfixBadge 
                            variant={key.status === 'available' ? 'success' : 
                                       key.status === 'assigned' ? 'info' : 'destructive'}
                            className="text-xs"
                          >
                            {STATUS_CONFIG[key.status]?.label || key.status}
                          </GarfixBadge>
                        </div>
                        
                        <div className="flex items-center gap-4 text-xs text-gray-500 mt-1">
                          <span>{key.model.split('/').pop()}</span>
                          {key.assignedToUserName && (
                            <span>👤 {key.assignedToUserName}</span>
                          )}
                          {key.assignedToCompanyName && (
                            <span>🏢 {key.assignedToCompanyName}</span>
                          )}
                          <span>استخدام: {key.timesUsed} مرة</span>
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-2">
                        {key.status === 'available' && (
                          <span className="text-xs text-emerald-600 font-medium">✓ جاهز للتوزيع</span>
                        )}
                        {(key.status === 'available' || key.status === 'assigned') && (
                          <button
                            onClick={() => revokeKey(key.id)}
                            className="text-xs text-red-600 hover:text-red-800 hover:underline"
                          >
                            إلغاء
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </FadeUp>
              ))}
            </div>
          )}
        </GarfixCard>

        {/* ══ How It Works ══ */}
        <GarfixCard className="p-6 bg-gradient-to-r from-blue-50 to-emerald-50 dark:from-blue-950 dark:to-emerald-950">
          <h3 className="font-bold text-gray-800 dark:text-white mb-4 text-center">
            🔄 كيف يعمل النظام؟
          </h3>
          
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-sm">
            <div className="text-center p-3">
              <div className="text-2xl mb-2">1️⃣</div>
              <div className="font-semibold">ترفع المفاتيح</div>
              <div className="text-xs text-gray-600 mt-1">أضف 10+ مفتاح OpenRouter أو Gemini</div>
            </div>
            
            <div className="text-center p-3">
              <div className="text-2xl mb-2">2️⃣</div>
              <div className="font-semibold">يسجل مستخدم جديد</div>
              <div className="text-xs text-gray-600 mt-1">النظام يخصصله مفتاح تلقائياً</div>
            </div>
            
            <div className="text-center p-3">
              <div className="text-2xl mb-2">3️⃣</div>
              <div className="font-semibold">يستخدم الـ AI</div>
              <div className="text-xs text-gray-600 mt-1">كل مستخدم عنده مفتاح منعزل</div>
            </div>
            
            <div className="text-center p-3">
              <div className="text-2xl mb-2">4️⃣</div>
              <div className="font-semibold">تنبيهات ذكية</div>
              <div class="text-xs text-gray-600 mt-1">نبهك لما المفاتيح تقل</div>
            </div>
          </div>
          
          <div className="mt-4 p-3 bg-white/50 dark:bg-black/20 rounded-lg text-xs text-center text-gray-600">
            💡 <strong>DeepSeek V3</strong> هو الأنسب للنظام: رخيص ($0.00003/طلب)، سريع، ويدعم العربية!
          </div>
        </GarfixCard>

        {/* ══ Add Keys Modal ══ */}
        <GarfixModal
          isOpen={showAddModal}
          onClose={() => setShowAddModal(false)}
          title="➕ إضافة مفاتيح API جديدة"
          size="lg"
        >
          <div className="space-y-4">
            {/* Provider Selection */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                نوع المفتاح (Provider)
              </label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { value: 'openrouter', label: '🟠 OpenRouter', desc: 'DeepSeek + الكل' },
                  { value: 'gemini', label: '🔵 Gemini', desc: 'Google Flash' },
                  { value: 'openai', label: '🟢 OpenAI', desc: 'GPT-4o' },
                ].map(provider => (
                  <button
                    key={provider.value}
                    type="button"
                    onClick={() => setSelectedProvider(provider.value)}
                    className={cn(
                      "p-3 rounded-lg border-2 transition-all text-center",
                      selectedProvider === provider.value
                        ? "border-emerald-500 bg-emerald-50"
                        : "border-gray-200 hover:border-gray-300"
                    )}
                  >
                    <div className="font-semibold text-sm">{provider.label}</div>
                    <div className="text-xs text-gray-500">{provider.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Model Selection */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                الموديل (Model)
              </label>
              <select
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-gray-200"
              >
                <optgroup label="🟢 DeepSeek (أنصح)">
                  <option value="deepseek/deepseek-chat-v3-0324">DeepSeek V3 Chat (⭐)</option>
                  <option value="deepseek/deepseek-r1-0528">DeepSeek R1 Reasoning</option>
                </optgroup>
                <optgroup label="🔵 Gemini">
                  <option value="gemini-2.0-flash">Gemini 2.0 Flash</option>
                </optgroup>
                <optgroup label="🟢 OpenAI">
                  <option value="gpt-4o-mini">GPT-4o Mini</option>
                </optgroup>
              </select>
            </div>

            {/* Keys Input */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                مفاتيح API (واحد في كل سطر)
              </label>
              <GarfixTextarea
                value={newKeysText}
                onChange={(e) => setNewKeysText(e.target.value)}
                placeholder={`sk-or-v1-xxxxxxxxxxx\nsk-or-v1-yyyyyyyyyyy\n...`}
                rows={5}
                className="font-mono text-sm"
              />
              <p className="text-xs text-gray-500 mt-1">
                أدخل كل مفتاح في سطر منفصل. يدعم OpenRouter (sk-or-), Gemini (AIza), OpenAI (sk-)
              </p>
            </div>

            {/* Notes */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                ملاحظات (اختياري)
              </label>
              <GarfixInput
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="مثال: مفاتيح شهر أغسطس..."
              />
            </div>

            {/* Actions */}
            <div className="flex gap-3 pt-4 border-t">
              <GarfixButton
                variant="outline"
                onClick={() => setShowAddModal(false)}
                className="flex-1"
              >
                إلغاء
              </GarfixButton>
              <GarfixButton
                onClick={addKeysToPool}
                disabled={isAdding || !newKeysText.trim()}
                isLoading={isAdding}
                className="flex-1"
              >
                ✅ إضافة المفاتيح
              </GarfixButton>
            </div>
          </div>
        </GarfixModal>

      </GarfixContainer>
    </GarfixPageTransition>
  );
}

// ── Helper Functions ───────────────────────────────────────

function maskKey(key: string): string {
  if (!key || key.length <= 12) return key || '';
  return `${key.substring(0, 8)}${'•'.repeat(12)}${key.substring(key.length - 4)}`;
}

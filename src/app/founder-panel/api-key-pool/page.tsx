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

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, CheckSquare, Square, Search, Filter } from 'lucide-react';

// ── GarfiX DS Imports ──────────────────────────────────────

import {
  GarfixButton,
  GarfixCard,
  GarfixInput,
  GarfixTextarea,
  GarfixBadge,
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

const DEFAULT_MODEL = 'deepseek-chat'; // P1: DeepSeek Direct API (no OpenRouter prefix)

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
  const [selectedProvider, setSelectedProvider] = useState('deepseek'); // P1: DeepSeek Direct API is default
  const [selectedModel, setSelectedModel] = useState(DEFAULT_MODEL);
  const [notes, setNotes] = useState('');
  
  // Alert state
  const [alert, setAlert] = useState<{ type: 'success' | 'error' | 'warning'; message: string } | null>(null);

  // Pagination & Filter state
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  
  // Select All state
  const [selectedKeyIds, setSelectedKeyIds] = useState<Set<string>>(new Set());

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

  // ── Filtering & Pagination Logic ──────────────────────────────
  
  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, statusFilter]);

  // Filter keys
  const filteredKeys = useMemo(() => {
    return keys.filter(key => {
      // Status filter
      if (statusFilter !== 'all' && key.status !== statusFilter) return false;
      
      // Search filter
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        return (
          key.keyValue.toLowerCase().includes(query) ||
          key.model.toLowerCase().includes(query) ||
          key.provider.toLowerCase().includes(query) ||
          key.assignedToUserName?.toLowerCase().includes(query) ||
          key.assignedToCompanyName?.toLowerCase().includes(query)
        );
      }
      
      return true;
    });
  }, [keys, searchQuery, statusFilter]);

  // Pagination calculations
  const totalPages = Math.ceil(filteredKeys.length / pageSize);
  const paginatedKeys = useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize;
    return filteredKeys.slice(startIndex, startIndex + pageSize);
  }, [filteredKeys, currentPage, pageSize]);

  // Select All handlers
  const isAllSelected = paginatedKeys.length > 0 && 
    paginatedKeys.every(k => selectedKeyIds.has(k.id));
  const isSomeSelected = paginatedKeys.some(k => selectedKeyIds.has(k.id));

  const toggleSelectAll = () => {
    if (isAllSelected) {
      const newSet = new Set(selectedKeyIds);
      paginatedKeys.forEach(k => newSet.delete(k.id));
      setSelectedKeyIds(newSet);
    } else {
      setSelectedKeyIds(new Set([...selectedKeyIds, ...paginatedKeys.map(k => k.id)]));
    }
  };

  const toggleSelectKey = (keyId: string) => {
    const newSet = new Set(selectedKeyIds);
    if (newSet.has(keyId)) {
      newSet.delete(keyId);
    } else {
      newSet.add(keyId);
    }
    setSelectedKeyIds(newSet);
  };

  const handleBulkRevoke = async () => {
    if (selectedKeyIds.size === 0) return;

    if (!confirm(`هل أنت متأكد من إلغاء ${selectedKeyIds.size} مفتاح؟`)) return;

    const keyIds = Array.from(selectedKeyIds);

    try {
      const results = await Promise.allSettled(
        keyIds.map(async (keyId) => {
          const response = await fetch(`/api/founder-panel/api-key-pool/${keyId}`, {
            method: 'DELETE',
          });
          const data = await response.json();
          if (!data.success) {
            throw new Error(data.error || 'فشل الإلغاء');
          }
          return keyId;
        })
      );

      const succeeded = results.filter(r => r.status === 'fulfilled').length;
      const failed = results.filter(r => r.status === 'rejected').length;

      if (failed === 0) {
        setAlert({ type: 'success', message: `✅ تم إلغاء ${succeeded} مفتاح بنجاح` });
      } else if (succeeded === 0) {
        setAlert({ type: 'error', message: `❌ فشل إلغاء جميع المفاتيح` });
      } else {
        setAlert({ type: 'success', message: `⚠️ تم إلغاء ${succeeded} مفتاح، فشل ${failed}` });
      }

      setSelectedKeyIds(new Set());
      fetchPoolData();
    } catch (error) {
      setAlert({ type: 'error', message: 'خطأ في الاتصال' });
    }
  };

  // ── Render ───────────────────────────────────────────────

  return (
    <GarfixPageTransition>
      <GarfixContainer variant="default">
        
        {/* ══ Page Header ══ */}
        <GarfixPageHeader
          title="مجمع مفاتيح API"
          subtitle="إدارة وتوزيع مفاتيح AI تلقائياً على المستخدمين الجدد"
          actions={
            <>
              {stats && (
                <GarfixBadge variant={stats.availableKeys > 5 ? 'default' : 'error'}>
                  {`${stats.availableKeys} متاح`}
                </GarfixBadge>
              )}
              <GarfixButton
                onClick={() => setShowAddModal(true)}
                className="gap-2"
              >
                ➕ إضافة مفاتيح جديدة
              </GarfixButton>
            </>
          }
        />

        {/* ══ Alert ══ */}
        {alert && (
          <FadeUp delay={100}>
            <GarfixAlert
              variant={alert.type}
              onDismiss={() => setAlert(null)}
              className="mb-6"
            >
              {alert.message}
            </GarfixAlert>
          </FadeUp>
        )}

        {/* ══ Stats Cards ══ */}
        {!isLoading && stats && (
          <GarfixGrid cols={1} colsSm={2} colsMd={3} colsLg={4} className="mb-8">
            <MotionCard initial="fadeUp" initialDelay={0}>
              <div className="text-center p-4">
                <div className="text-3xl font-bold text-gray-800">{stats.totalKeys}</div>
                <div className="text-sm text-gray-500 mt-1">إجمالي المفاتيح</div>
              </div>
            </MotionCard>

            <MotionCard initial="fadeUp" initialDelay={50}>
              <div className="text-center p-4">
                <div className="text-3xl font-bold text-emerald-600">{stats.availableKeys}</div>
                <div className="text-sm text-gray-500 mt-1">متاحة للتوزيع ✅</div>
              </div>
            </MotionCard>

            <MotionCard initial="fadeUp" initialDelay={100}>
              <div className="text-center p-4">
                <div className="text-3xl font-bold text-blue-600">{stats.assignedKeys}</div>
                <div className="text-sm text-gray-500 mt-1">مستخدمة حالياً 👥</div>
              </div>
            </MotionCard>

            <MotionCard initial="fadeUp" initialDelay={150}>
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
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <h3 className="font-bold text-gray-800">🔑 قائمة المفاتيح</h3>
              
              {/* Search & Filter Bar */}
              <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
                {/* Search Input */}
                <div className="relative flex-1 sm:w-64">
                  <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    placeholder="بحث في المفاتيح..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full ps-10 pe-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                  />
                </div>
                
                {/* Status Filter */}
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 focus:ring-2 focus:ring-emerald-500"
                >
                  <option value="all">كل الحالات</option>
                  <option value="available">✅ متاح</option>
                  <option value="assigned">📤 مستخدم</option>
                  <option value="exhausted">🔴 منتهي</option>
                  <option value="revoked">❌ ملغي</option>
                </select>
              </div>
            </div>
            
            {/* Results Count & Select All */}
            {!isLoading && filteredKeys.length > 0 && (
              <div className="mt-3 flex items-center justify-between text-sm">
                <span className="text-gray-600">
                  {filteredKeys.length} مفتاح (من {keys.length} إجمالي)
                </span>
                <button
                  onClick={toggleSelectAll}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                >
                  {isAllSelected ? (
                    <CheckSquare className="w-4 h-4 text-emerald-600" />
                  ) : isSomeSelected ? (
                    <CheckSquare className="w-4 h-4 text-emerald-400" />
                  ) : (
                    <Square className="w-4 h-4 text-muted-foreground" />
                  )}
                  <span>{isAllSelected ? 'إلغاء الكل' : 'تحديد الكل'}</span>
                </button>
              </div>
            )}
          </div>
          
          {/* Bulk Actions Bar */}
          {selectedKeyIds.size > 0 && (
            <div className="px-4 py-3 bg-emerald-50 dark:bg-emerald-900/20 border-b border-emerald-200 dark:border-emerald-800">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-emerald-700 dark:text-emerald-300">
                  ✓ محدد: {selectedKeyIds.size} مفاتيح
                </span>
                <GarfixButton
                  size="sm"
                  variant="destructive"
                  onClick={handleBulkRevoke}
                >
                  🗑️ إلغاء المحددة
                </GarfixButton>
              </div>
            </div>
          )}
          
          {isLoading ? (
            <div className="p-6 space-y-4">
              {[1, 2, 3].map(i => (
                <GarfixSkeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : filteredKeys.length === 0 ? (
            <div className="p-12 text-center">
              <div className="text-5xl mb-4">🗝️</div>
              <h3 className="text-lg font-semibold text-gray-700 mb-2">لا توجد مفاتيح</h3>
              <p className="text-sm text-gray-500 mb-4">
                {searchQuery || statusFilter !== 'all' 
                  ? 'لا توجد نتائج مطابقة للبحث' 
                  : 'ابدأ بإضافة مفاتيح API لتوزيعها تلقائياً على المستخدمين الجدد'
                }
              </p>
              {(!searchQuery && statusFilter === 'all') && (
                <GarfixButton onClick={() => setShowAddModal(true)}>
                  ➕ إضافة أول مفتاح
                </GarfixButton>
              )}
            </div>
          ) : (
            <>
              <div className="divide-y divide-gray-100">
                {paginatedKeys.map((key, index) => (
                  <FadeUp key={key.id} delay={index * 30}>
                    <div className={cn(
                      "p-4 hover:bg-gray-50 transition-colors",
                      selectedKeyIds.has(key.id) && "bg-emerald-50/50 dark:bg-emerald-900/20"
                    )}>
                      <div className="flex items-start justify-between gap-4">
                        {/* Checkbox + Key Info */}
                        <div className="flex items-start gap-3 flex-1 min-w-0">
                          {/* Checkbox */}
                          <button
                            onClick={() => toggleSelectKey(key.id)}
                            className="flex-shrink-0 mt-1 p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                          >
                            {selectedKeyIds.has(key.id) ? (
                              <CheckSquare className="w-4 h-4 text-emerald-600" />
                            ) : (
                              <Square className="w-4 h-4 text-muted-foreground" />
                            )}
                          </button>
                          
                          {/* Key Info */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1 flex-wrap">
                              <span className="text-lg">
                                {PROVIDER_ICONS[key.provider] || '🔑'}
                              </span>
                              <code className="text-sm font-mono bg-gray-100 px-2 py-0.5 rounded">
                                {maskKey(key.keyValue)}
                              </code>
                              <GarfixBadge 
                                variant={key.status === 'available' ? 'success' : 
                                           key.status === 'assigned' ? 'info' : 'error'}
                                className="text-xs"
                              >
                                {STATUS_CONFIG[key.status]?.label || key.status}
                              </GarfixBadge>
                            </div>
                            
                            <div className="flex items-center gap-4 text-xs text-gray-500 mt-1 flex-wrap">
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

              {/* Pagination Controls */}
              {totalPages > 1 && (
                <div className="px-4 py-3 border-t border-gray-200 bg-gray-50 dark:bg-gray-800/50">
                  <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                    {/* Page Info & Size Selector */}
                    <div className="flex items-center gap-4 text-sm text-gray-600 dark:text-gray-400">
                      <span>
                        {(currentPage - 1) * pageSize + 1} - {Math.min(currentPage * pageSize, filteredKeys.length)} من {filteredKeys.length}
                      </span>
                      <select
                        value={pageSize}
                        onChange={(e) => {
                          setPageSize(Number(e.target.value));
                          setCurrentPage(1);
                        }}
                        className="px-2 py-1 text-sm rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700"
                      >
                        {[5, 10, 20, 50].map(size => (
                          <option key={size} value={size}>{size}/صفحة</option>
                        ))}
                      </select>
                    </div>

                    {/* Page Navigation */}
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setCurrentPage(1)}
                        disabled={currentPage === 1}
                        className="p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-50"
                      >
                        <ChevronsRight className="w-4 h-4 rtl:rotate-0" />
                      </button>
                      <button
                        onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                        disabled={currentPage === 1}
                        className="p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-50"
                      >
                        <ChevronRight className="w-4 h-4 rtl:rotate-0" />
                      </button>
                      
                      <div className="flex items-center gap-1">
                        {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                          let pageNum;
                          if (totalPages <= 5) {
                            pageNum = i + 1;
                          } else if (currentPage <= 3) {
                            pageNum = i + 1;
                          } else if (currentPage >= totalPages - 2) {
                            pageNum = totalPages - 4 + i;
                          } else {
                            pageNum = currentPage - 2 + i;
                          }
                          
                          return (
                            <button
                              key={pageNum}
                              onClick={() => setCurrentPage(pageNum)}
                              className={`w-8 h-8 rounded text-sm font-medium ${
                                currentPage === pageNum
                                  ? 'bg-emerald-500 text-white'
                                  : 'hover:bg-gray-200 dark:hover:bg-gray-700'
                              }`}
                            >
                              {pageNum}
                            </button>
                          );
                        })}
                      </div>

                      <button
                        onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                        disabled={currentPage === totalPages}
                        className="p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-50"
                      >
                        <ChevronLeft className="w-4 h-4 rtl:rotate-0" />
                      </button>
                      <button
                        onClick={() => setCurrentPage(totalPages)}
                        disabled={currentPage === totalPages}
                        className="p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-50"
                      >
                        <ChevronsLeft className="w-4 h-4 rtl:rotate-0" />
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </>
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
              <div className="text-xs text-gray-600 mt-1">نبهك لما المفاتيح تقل</div>
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
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
                {[
                  { value: 'deepseek', label: '🟢 DeepSeek', desc: '⭐ مباشر (أنصح)' },
                  { value: 'openrouter', label: '🟠 OpenRouter', desc: 'وسيط (legacy)' },
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
                <optgroup label="🟢 DeepSeek Direct API (⭐ أنصح — بدون وسيط)">
                  <option value="deepseek-chat">DeepSeek Chat — مباشر (⭐ افتراضي)</option>
                  <option value="deepseek-reasoner">DeepSeek Reasoner (للتحليل المعقد)</option>
                </optgroup>
                <optgroup label="🟠 DeepSeek via OpenRouter (legacy)">
                  <option value="deepseek/deepseek-chat-v3-0324">DeepSeek V3 Chat (عبر OpenRouter)</option>
                  <option value="deepseek/deepseek-r1-0528">DeepSeek R1 Reasoning (عبر OpenRouter)</option>
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
                placeholder={selectedProvider === 'deepseek'
                  ? `sk-xxxxxxxxxxx\nsk-yyyyyyyyyyy\n...\n(DeepSeek Direct API keys from platform.deepseek.com)`
                  : selectedProvider === 'openrouter'
                  ? `sk-or-v1-xxxxxxxxxxx\nsk-or-v1-yyyyyyyyyyy\n...`
                  : selectedProvider === 'gemini'
                  ? `AIzaSyXXXXXXXXXXX\nAIzaSyYYYYYYYYYYY\n...`
                  : `sk-xxxxxxxxxxx\nsk-yyyyyyyyyyy\n...`}
                rows={5}
                className="font-mono text-sm"
              />
              <p className="text-xs text-gray-500 mt-1">
                أدخل كل مفتاح في سطر منفصل. يدعم DeepSeek (sk-), OpenRouter (sk-or-), Gemini (AIza), OpenAI (sk-)
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

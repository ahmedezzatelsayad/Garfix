/**
 * Page Loading Components — Lazy Loading Optimization
 *
 * ════════════════════════════════════════════════════════════════════════
 * مكونات تحميل متخصصة لكل نوع صفحة
 * 
 * يتضمن:
 * - DashboardLoading: هيكل لوحة التحكم (KPI Cards + Charts + Tables)
 * - TableLoading: هيكل الجداول (Header + Table Body)
 * - FormLoading: هيكل النماذج (Fields + Submit Button)
 * - MinimalLoading: تحميل بسيط (Spinner + Text)
 * - SettingsLoading: هيكل الإعدادات (Tabs + Forms)
 * - AdminLoading: هيكل لوحة الإدارة
 * 
 * يدعم: RTL | Dark Mode | TypeScript | Accessibility
 * ════════════════════════════════════════════════════════════════════════
 */

import { Loader2 } from "lucide-react"

// ════════════════════════════════════════════════════════════════════════
// 1. DASHBOARD LOADING — لوحة التحكم
// ════════════════════════════════════════════════════════════════════════

export function DashboardLoading() {
  return (
    <div className="p-6 space-y-4" role="status" aria-label="جارٍ تحميل لوحة التحكم">
      {/* KPI Cards Skeleton */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {[...Array(5)].map((_, i) => (
          <div
            key={i}
            className="kpi-card state-skeleton h-32 rounded-xl"
            style={{ animationDelay: `${i * 50}ms` }}
          />
        ))}
      </div>
      
      {/* Chart Skeleton */}
      <div className="chart-container state-skeleton h-64 rounded-xl" />
      
      {/* Recent Activity Table Skeleton */}
      <div className="space-y-3">
        <div className="state-skeleton h-8 w-48 rounded-lg" />
        <div className="state-skeleton h-48 rounded-xl" />
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════
// 2. TABLE LOADING — الجداول (الفواتير، العملاء، المنتجات، إلخ)
// ════════════════════════════════════════════════════════════════════════

export function TableLoading() {
  return (
    <div className="p-6" role="status" aria-label="جارٍ تحميل الجدول">
      {/* Header Bar */}
      <div className="flex items-center justify-between mb-4">
        <div className="state-skeleton h-12 w-64 rounded-lg" />
        <div className="flex gap-2">
          <div className="state-skeleton h-10 w-24 rounded-lg" />
          <div className="state-skeleton h-10 w-32 rounded-lg" />
        </div>
      </div>
      
      {/* Filters Row */}
      <div className="flex gap-3 mb-4">
        <div className="state-skeleton h-9 w-40 rounded-lg" />
        <div className="state-skeleton h-9 w-32 rounded-lg" />
        <div className="state-skeleton h-9 w-24 rounded-lg" />
      </div>
      
      {/* Table Body */}
      <div className="state-skeleton h-64 rounded-xl" />
      
      {/* Pagination */}
      <div className="flex justify-center mt-4">
        <div className="state-skeleton h-10 w-80 rounded-lg" />
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════
// 3. FORM LOADING — النماذج (الإعدادات، الحساب)
// ════════════════════════════════════════════════════════════════════════

export function FormLoading() {
  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6" role="status" aria-label="جارٍ تحميل النموذج">
      {/* Title */}
      <div className="state-skeleton h-8 w-48 rounded-lg" />
      
      {/* Form Fields */}
      {[...Array(4)].map((_, i) => (
        <div key={i} className="space-y-2">
          <div className="state-skeleton h-4 w-20 rounded" />
          <div className="state-skeleton h-10 rounded-lg" />
        </div>
      ))}
      
      {/* Toggle Field */}
      <div className="flex items-center justify-between py-3">
        <div className="state-skeleton h-4 w-36 rounded" />
        <div className="state-skeleton h-6 w-12 rounded-full" />
      </div>
      
      {/* Actions */}
      <div className="flex gap-3 pt-4">
        <div className="state-skeleton h-12 w-32 rounded-lg" />
        <div className="state-skeleton h-12 w-24 rounded-lg border" />
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════
// 4. MINIMAL LOADING — تحميل بسيط (AI Agents, Automation, Team)
// ════════════════════════════════════════════════════════════════════════

export function MinimalLoading() {
  return (
    <div 
      className="flex flex-col items-center justify-center min-h-[200px] gap-3"
      role="status" 
      aria-label="جارٍ التحميل"
    >
      <div className="state-loading-spinner">
        <Loader2 className="size-8 animate-spin text-primary" />
      </div>
      <span className="text-sm text-muted-foreground">جارٍ التحميل...</span>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════
// 5. SETTINGS LOADING — الإعدادات
// ════════════════════════════════════════════════════════════════════════

export function SettingsLoading() {
  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6" role="status" aria-label="جارٍ تحميل الإعدادات">
      {/* Header */}
      <div className="flex items-center gap-4">
        <div className="state-skeleton h-16 w-16 rounded-full" />
        <div className="space-y-2">
          <div className="state-skeleton h-6 w-40 rounded" />
          <div className="state-skeleton h-4 w-56 rounded" />
        </div>
      </div>
      
      {/* Tabs */}
      <div className="flex gap-2 border-b border-border pb-3">
        {['الملف الشخصي', 'الفواتير', 'الإشعارات', 'الأمان'].map((tab, i) => (
          <div key={i} className="state-skeleton h-9 w-24 rounded-lg" />
        ))}
      </div>
      
      {/* Content Sections */}
      <div className="space-y-6">
        {[...Array(2)].map((_, i) => (
          <div key={i} className="border border-border rounded-xl p-5 space-y-4">
            <div className="state-skeleton h-5 w-32 rounded" />
            {[...Array(3)].map((_, j) => (
              <div key={j} className="space-y-2">
                <div className="state-skeleton h-4 w-28 rounded" />
                <div className="state-skeleton h-10 rounded-lg" />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════
// 6. ADMIN LOADING — لوحات الإدارة (SaaS, Platform Admin, Audit)
// ════════════════════════════════════════════════════════════════════════

export function AdminLoading() {
  return (
    <div className="p-6 space-y-6" role="status" aria-label="جارٍ تحميل لوحة الإدارة">
      {/* Stats Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="state-skeleton h-28 rounded-xl" />
        ))}
      </div>
      
      {/* Main Content Area */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Table/List Section */}
        <div className="lg:col-span-2 space-y-3">
          <div className="state-skeleton h-8 w-40 rounded-lg" />
          <div className="state-skeleton h-72 rounded-xl" />
        </div>
        
        {/* Side Panel */}
        <div className="space-y-3">
          <div className="state-skeleton h-8 w-32 rounded-lg" />
          <div className="state-skeleton h-72 rounded-xl" />
        </div>
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════
// 7. REPORTS LOADING — التقارير
// ════════════════════════════════════════════════════════════════════════

export function ReportsLoading() {
  return (
    <div className="p-6 space-y-6" role="status" aria-label="جارٍ تحميل التقارير">
      {/* Report Type Selector */}
      <div className="flex gap-3">
        <div className="state-skeleton h-11 w-44 rounded-lg" />
        <div className="state-skeleton h-11 w-32 rounded-lg" />
        <div className="state-skeleton h-11 w-24 rounded-lg" />
      </div>
      
      {/* Date Range */}
      <div className="flex gap-3 items-center">
        <div className="state-skeleton h-9 w-36 rounded-lg" />
        <span className="text-muted-foreground">إلى</span>
        <div className="state-skeleton h-9 w-36 rounded-lg" />
      </div>
      
      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="state-skeleton h-72 rounded-xl" />
        <div className="state-skeleton h-72 rounded-xl" />
      </div>
      
      {/* Full Width Chart */}
      <div className="state-skeleton h-64 rounded-xl" />
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════
// 8. ACCOUNTING LOADING — المحاسبة
// ════════════════════════════════════════════════════════════════════════

export function AccountingLoading() {
  return (
    <div className="p-6 space-y-6" role="status" aria-label="جارٍ تحميل المحاسبة">
      {/* Tabs */}
      <div className="flex gap-2 border-b border-border pb-3 overflow-x-auto">
        {['القيود', 'الأرصدة', 'التقارير', 'الضرائب'].map((tab, i) => (
          <div key={i} className="state-skeleton h-9 w-24 rounded-lg shrink-0" />
        ))}
      </div>
      
      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="state-skeleton h-24 rounded-xl" />
        ))}
      </div>
      
      {/* Main Table */}
      <div className="space-y-3">
        <div className="flex justify-between items-center">
          <div className="state-skeleton h-8 w-40 rounded-lg" />
          <div className="state-skeleton h-9 w-28 rounded-lg" />
        </div>
        <div className="state-skeleton h-80 rounded-xl" />
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════
// EXPORTS
// ════════════════════════════════════════════════════════════════════════

export {
  // Re-export for convenience
  MinimalLoading as DefaultLoading,
}

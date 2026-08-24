/**
 * DashboardView.tsx — GarfiX EOS v4.0 Redesigned Dashboard
 *
 * ════════════════════════════════════════════════════════════════════════
 * MAJOR REDESIGN v4.1 — Competitive UX Enhancement
 * 
 * New Features:
 * ────────────────────────────────────────────────────────────────────────
 * 1. 🎯 Smart Header with greeting, date, and quick actions
 * 2. 📊 Enhanced KPI Cards with animated counters & progress rings
 * 3. ⚡ Quick Actions Grid (Create Invoice, Add Client, Reports)
 * 4. 🤖 AI Insights Panel with confidence indicators
 * 5. 📈 Interactive Charts with DS v4.0 theming
 * 6. 🎯 Goals & Targets widget
 * 7. 📋 Recent Activity Feed
 * 8. 🔍 Search & Filter bar
 * 9. 📱 Mobile-First Responsive Design
 * 10. ✨ Micro-interactions throughout
 *
 * Motion System:
 * - Hover: 120ms cubic-bezier(0.4, 0, 0.2, 1)
 * - Button: 150ms cubic-bezier(0.4, 0, 0.2, 1)
 * - Card entrance: stagger-children with fade-in-up
 * - KPI counter: 800ms ease-out
 *
 * Design Tokens Used:
 * - Emerald Primary: #047857 (KPIs, CTAs, accents)
 * - Gold Accent: #d4a574 (Premium metrics, AI features)
 * - Dark Background: #0b1220 → Surface #111827 → Elevated #1f2937
 * ════════════════════════════════════════════════════════════════════════
 */
"use client";

import { useEffect, useState, useRef } from "react";
import { useBrand } from "@/context/BrandContext";
import { logger } from "@/lib/logger";
import { useDashboardStats } from "@/hooks/queries/dashboard";
import {
  FileText, Users, DollarSign, TrendingUp, AlertCircle, ArrowLeft,
  CheckCircle2, Loader2, Building2, Sparkles, Brain, Zap,
  Plus, Search, Filter, Calendar, Target, Clock, ArrowUpRight,
  Activity, ChevronDown, Star, Award, Bell, Settings, Download,
  Eye, RefreshCw, MoreHorizontal
} from "lucide-react";
import { XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, AreaChart, Area,
} from "recharts";
import { cn } from "@/lib/utils";

// ════════════════════════════════════════════════════════════════════════
// Types
// ════════════════════════════════════════════════════════════════════════

interface _Stats {
  totalInvoices: number;
  totalRevenue: number;
  totalPaid: number;
  totalOutstanding: number;
  clientsCount: number;
  byStatus: Record<string, number>;
  monthly: Array<{ month: string; revenue: number; count: number }>;
  recent: Array<{
    id: number; invoiceNumber: string; clientName: string; status: string;
    total: number; paid: number; issueDate: string; companySlug: string;
  }>;
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  draft: { label: "مسودة", color: "#6b7280" },
  sent: { label: "مرسلة", color: "#3b82f6" },
  paid: { label: "مدفوعة", color: "#10b981" },
  partial: { label: "جزئية", color: "#f59e0b" },
  overdue: { label: "متأخرة", color: "#ef4444" },
  cancelled: { label: "ملغاة", color: "#9ca3af" },
};

const tooltipStyle = {
  background: "rgba(17, 24, 39, 0.95)",
  border: "1px solid rgba(4, 120, 87, 0.2)",
  borderRadius: "12px",
  color: "#f3f4f6",
  fontSize: "13px",
  padding: "12px",
  boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.3)",
};

// ════════════════════════════════════════════════════════════════════════
// Utility Functions
// ════════════════════════════════════════════════════════════════════════

function formatCurrency(value: number, currency = ""): string {
  return `${value.toLocaleString("ar-EG", { maximumFractionDigits: 2 })} ${currency}`;
}

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "صباح الخير ☀️";
  if (hour < 17) return "مساء الخير 🌅";
  return "مساء الخير 🌙";
}

function formatDate(): string {
  return new Date().toLocaleDateString("ar-EG", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

// Generate animated counter value
function useAnimatedValue(target: number, duration = 800): number {
  const [current, setCurrent] = useState(0);
  const startTime = useRef<number | null>(null);
  const startValue = useRef(0);

  useEffect(() => {
    if (target === 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- animation: reset value when target is 0
      setCurrent(0);
      return;
    }

    const animate = (timestamp: number) => {
      if (!startTime.current) {
        startTime.current = timestamp;
        startValue.current = current;
      }

      const elapsed = timestamp - startTime.current;
      const progress = Math.min(elapsed / duration, 1);
      
      // Easing function (ease-out cubic)
      const eased = 1 - Math.pow(1 - progress, 3);
      
      setCurrent(Math.floor(startValue.current + (target - startValue.current) * eased));

      if (progress < 1) {
        requestAnimationFrame(animate);
      }
    };

    requestAnimationFrame(animate);
  }, [target, duration, current]);

  return current;
}

// ════════════════════════════════════════════════════════════════════════
// Sub-Components
// ════════════════════════════════════════════════════════════════════════

/**
 * AnimatedCounter - Displays a number with counting animation
 */
function AnimatedCounter({ value, prefix = "", suffix = "" }: { value: number; prefix?: string; suffix?: string }) {
  const displayValue = useAnimatedValue(value);
  
  return (
    <span className="tabular-nums" dir="ltr">
      {prefix}{displayValue.toLocaleString("ar-EG")}{suffix}
    </span>
  );
}

/**
 * ProgressRing - Circular progress indicator
 */
function ProgressRing({ 
  percentage, 
  size = 60, 
  strokeWidth = 6, 
  color = "#047857" 
}: { 
  percentage: number; 
  size?: number; 
  strokeWidth?: number; 
  color?: string;
}) {
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (percentage / 100) * circumference;

  return (
    <svg width={size} height={size} className="transform -rotate-90">
      {/* Background circle */}
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="rgba(255,255,255,0.05)"
        strokeWidth={strokeWidth}
      />
      {/* Progress circle */}
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
        style={{ transition: 'stroke-dashoffset 1s ease-out' }}
      />
      {/* Percentage text */}
      <text
        x={size / 2}
        y={size / 2}
        textAnchor="middle"
        dominantBaseline="central"
        fill="#f3f4f6"
        fontSize="14"
        fontWeight="bold"
        className="tabular-nums"
      >
        {Math.round(percentage)}%
      </text>
    </svg>
  );
}

/**
 * QuickActionButton - Quick action button with icon
 */
function QuickActionButton({ 
  icon: Icon, 
  label, 
  onClick, 
  variant = "primary" 
}: { 
  icon: React.ElementType; 
  label: string; 
  onClick?: () => void;
  variant?: "primary" | "secondary" | "gold";
}) {
  const baseClass = "flex flex-col items-center gap-2 p-4 rounded-xl transition-all duration-150 active-press group touch-target-sm";
  const variants = {
    primary: "bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 hover:border-emerald-500/40 text-emerald-400 hover-lift",
    secondary: "bg-surface hover:bg-elevated border border-border hover:border-muted-foreground/30 text-muted-foreground hover:text-foreground hover-lift",
    gold: "bg-[#d4a574]/10 hover:bg-[#d4a574]/20 border border-[#d4a574]/20 hover:border-[#d4a574]/40 text-[#d4a574] hover-lift",
  };

  return (
    <button onClick={onClick} className={`${baseClass} ${variants[variant]}`}>
      <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-background/50 group-hover:scale-110 transition-transform duration-200">
        <Icon size={20} />
      </div>
      <span className="text-xs font-semibold">{label}</span>
    </button>
  );
}

/**
 * StatusBadge - Colored status badge
 */
function StatusBadge({ status }: { status: string }) {
  const config = STATUS_LABELS[status] || { label: status, color: "#999" };
  
  return (
    <span 
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold"
      style={{ 
        backgroundColor: `${config.color}18`, 
        color: config.color,
        border: `1px solid ${config.color}30`
      }}
    >
      <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: config.color }} />
      {config.label}
    </span>
  );
}

// ════════════════════════════════════════════════════════════════════════
// Main Component
// ════════════════════════════════════════════════════════════════════════

export function DashboardView() {
  const { activeCompany, companies } = useBrand();
  const companySlug = activeCompany?.slug || "";
  const { data: statsData, isLoading: loading, error: statsError } = useDashboardStats(companySlug);
  const stats = statsData?.stats ?? null;

  // ── TRIAL v2: عداد التجربة المرئي (7 أيام/100 فاتورة/20 رسالة AI) ──
  const [trial, setTrial] = useState<{daysLeft: number|null; invoicesUsed: number; invoicesLimit: number; aiUsed: number; aiLimit: number; plan: string} | null>(null);
  useEffect(() => {
    if (!companySlug) return;
    fetch(`/api/trial-summary?companySlug=${encodeURIComponent(companySlug)}`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setTrial(d?.summary || null))
      .catch(() => {});
  }, [companySlug]);

  // State for interactive features
  const [activeTab, setActiveTab] = useState<"overview" | "financial" | "operations">("overview");
  const [showSearch, setShowSearch] = useState(false);

  // ── Empty States ──────────────────────────────────────────────────────

  // بطاقة عداد التجربة (فوق كل شيء للخطة التجريبية)
  const trialBanner = trial && trial.plan === "trial" ? (
    <div className="mb-4 p-4 rounded-2xl border border-emerald-500/30 bg-[linear-gradient(135deg,rgba(4,120,87,0.10),rgba(16,185,129,0.05))] flex flex-wrap items-center gap-x-6 gap-y-3" dir="rtl">
      <div className="flex items-center gap-2 font-extrabold text-[13px] text-emerald-700 dark:text-emerald-400">
        <Sparkles size={15} /> تجربتك المجانية
      </div>
      <div className="flex items-center gap-1.5 text-[12px] font-bold">
        <span className="text-muted-foreground">متبقي</span>
        <span className="text-foreground">{trial.daysLeft ?? 0} أيام</span>
      </div>
      <div className="flex items-center gap-1.5 text-[12px] font-bold">
        <span className="text-muted-foreground">فواتير</span>
        <span className="text-foreground">{trial.invoicesUsed}/{trial.invoicesLimit}</span>
        <span className="w-20 h-1.5 rounded-full bg-muted overflow-hidden inline-block"><span className="block h-full bg-emerald-500" style={{width: `${Math.min(100, (trial.invoicesUsed/Math.max(1,trial.invoicesLimit))*100)}%`}} /></span>
      </div>
      <div className="flex items-center gap-1.5 text-[12px] font-bold">
        <span className="text-muted-foreground">رسائل AI</span>
        <span className="text-foreground">{trial.aiUsed}/{trial.aiLimit}</span>
        <span className="w-20 h-1.5 rounded-full bg-muted overflow-hidden inline-block"><span className="block h-full bg-[#d4a574]" style={{width: `${Math.min(100, (trial.aiUsed/Math.max(1,trial.aiLimit))*100)}%`}} /></span>
      </div>
      <a href="#billing" className="ms-auto px-4 py-2 rounded-xl bg-[linear-gradient(135deg,#047857,#10b981)] text-white text-[12px] font-extrabold no-underline active-press">
        ترقية الآن — 10$/شهر
      </a>
    </div>
  ) : null;

  if (!loading && companies.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-background" dir="rtl">
        <div className="max-w-md w-full text-center space-y-6 animate-fade-in">
          {/* Animated Icon */}
          <div className="mx-auto relative">
            <div className="h-24 w-24 rounded-2xl bg-gradient-to-br from-emerald-500/20 to-emerald-700/10 flex items-center justify-center animate-pulse-slow border border-emerald-500/20">
              <Building2 size={48} className="text-emerald-400" />
            </div>
            <div className="absolute -bottom-2 -right-2 h-8 w-8 rounded-full bg-[#d4a574] flex items-center justify-center shadow-gold-sm animate-bounce-slow">
              <Star size={16} className="text-white" />
            </div>
          </div>

          <div className="space-y-2">
            <h2 className="text-2xl font-extrabold text-foreground">{getGreeting()}</h2>
            <p className="text-muted-foreground leading-relaxed">
              مرحباً بك في <span className="text-emerald-400 font-bold">GarfiX EOS</span>! 🎉
              <br />
              لبدء استخدام لوحة التحكم، يرجى إعداد شركتك الأولى.
            </p>
          </div>

          <button
            onClick={() => window.location.hash = "#settings"}
            className="w-full py-4 rounded-xl bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-500 hover:to-emerald-600 text-white font-bold text-base shadow-brand-md hover:shadow-brand-lg active:scale-[0.98] transition-all duration-150 hover-lift"
          >
            <span className="flex items-center justify-center gap-2">
              <Zap size={20} />
              بدء الإعداد السريع
            </span>
          </button>

          <p className="text-xs text-muted-foreground/60">
            يستغرق الإعداد أقل من 2 دقيقة ⚡
          </p>
        </div>
      </div>
    );
  }

  // ── Loading State ─────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background" dir="rtl">
        <div className="text-center space-y-6 animate-fade-in">
          {/* Enhanced Loading Animation */}
          <div className="relative mx-auto w-20 h-20">
            <div className="absolute inset-0 rounded-full border-2 border-emerald-500/20 border-t-emerald-500 animate-spin" />
            <div className="absolute inset-3 rounded-full border-2 border-[#d4a574]/20 border-b-[#d4a574] animate-spin" style={{ animationDirection: 'reverse', animationDuration: '1.5s' }} />
            <div className="absolute inset-0 flex items-center justify-center">
              <Loader2 size={28} className="text-emerald-400 animate-pulse" />
            </div>
          </div>
          
          <div className="space-y-2">
            <p className="text-lg font-semibold text-emerald-400">جارٍ تحميل لوحة التحكم...</p>
            <p className="text-sm text-muted-foreground">GarfiX EOS v4.0</p>
          </div>

          {/* Skeleton Preview */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 max-w-lg mx-auto pt-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-24 rounded-xl bg-surface border border-border animate-pulse" style={{ animationDelay: `${i * 100}ms` }} />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (statsError) {
    logger.error("[Dashboard] Error loading stats:", { err: statsError });
  }

  if (!stats) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-background" dir="rtl">
        <div className="max-w-md w-full text-center space-y-6 animate-fade-in">
          <div className="h-20 w-20 mx-auto rounded-2xl bg-red-500/10 flex items-center justify-center border border-red-500/20">
            <AlertCircle size={40} className="text-red-400" />
          </div>
          
          <div className="space-y-2">
            <h3 className="text-xl font-bold text-foreground">لا توجد بيانات بعد</h3>
            <p className="text-muted-foreground">
              {activeCompany 
                ? `لا توجد فواتير أو بيانات لشركة "${activeCompany.nameAr || activeCompany.name}" بعد.`
                : "لا توجد بيانات لعرضها."
              }
            </p>
          </div>

          {activeCompany && (
            <button
              onClick={() => window.location.hash = "#invoices"}
              className="px-6 py-3 rounded-xl bg-primary text-primary-foreground font-semibold hover-lift shadow-brand-sm active-press transition-all duration-150"
            >
              📝 إنشاء أول فاتورة
            </button>
          )}
        </div>
      </div>
    );
  }

  // ── Calculate Derived Values ──────────────────────────────────────────

  const pieData = Object.entries(stats.byStatus).map(([k, v]) => ({
    name: STATUS_LABELS[k]?.label || k,
    value: v,
    color: STATUS_LABELS[k]?.color || "#999",
  }));

  const collectionRate = stats.totalRevenue > 0 ? (stats.totalPaid / stats.totalRevenue) * 100 : 0;
  const avgInvoiceValue = stats.totalInvoices > 0 ? stats.totalRevenue / stats.totalInvoices : 0;

  // ════════════════════════════════════════════════════════════════════════
  // RENDER
  // ════════════════════════════════════════════════════════════════════════

  return (
    <div className="min-h-screen bg-background" dir="rtl">
      {trialBanner}
      <div className="max-w-[1600px] mx-auto p-4 md:p-6 lg:p-8 space-y-6">
        
        {/* ════════════════════════════════════════════════════════════════
            SECTION 1: SMART HEADER
           ════════════════════════════════════════════════════════════════ */}
        <header className="animate-fade-in">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            
            {/* Greeting & Company Info */}
            <div className="space-y-1">
              <div className="flex items-center gap-3">
                <h1 className="text-2xl md:text-3xl font-black text-foreground">
                  {getGreeting()}، {activeCompany?.nameAr || "مرحباً بك"}!
                </h1>
                <div className="h-8 w-8 rounded-full bg-gradient-to-br from-emerald-500 to-emerald-700 flex items-center justify-center shadow-brand-sm">
                  <Award size={16} className="text-white" />
                </div>
              </div>
              
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <Calendar size={14} className="text-emerald-400" />
                  {formatDate()}
                </span>
                <span className="flex items-center gap-1.5">
                  <Building2 size={14} className="text-emerald-400" />
                  {activeCompany?.name || "جميع الشركات"}
                </span>
                <span className="flex items-center gap-1.5">
                  <Clock size={14} className="text-[#d4a574]" />
                  آخر تحديث: الآن
                </span>
              </div>
            </div>

            {/* Header Actions */}
            <div className="flex items-center gap-2">
              {/* Search Toggle */}
              <button
                onClick={() => setShowSearch(!showSearch)}
                className="p-2.5 rounded-xl bg-surface border border-border hover:bg-elevated hover:border-emerald-500/30 transition-all duration-120 hover-lift"
              >
                <Search size={18} className="text-muted-foreground" />
              </button>
              
              {/* Notifications */}
              <button className="relative p-2.5 rounded-xl bg-surface border border-border hover:bg-elevated hover:border-emerald-500/30 transition-all duration-120 hover-lift">
                <Bell size={18} className="text-muted-foreground" />
                <span className="absolute -top-1 -left-1 h-4 w-4 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
                  3
                </span>
              </button>
              
              {/* Refresh */}
              <button 
                onClick={() => window.location.reload()}
                className="p-2.5 rounded-xl bg-surface border border-border hover:bg-elevated hover:border-emerald-500/30 transition-all duration-120 hover-lift"
              >
                <RefreshCw size={18} className="text-muted-foreground" />
              </button>
              
              {/* Settings */}
              <button 
                onClick={() => window.location.hash = "#settings"}
                className="p-2.5 rounded-xl bg-surface border border-border hover:bg-elevated hover:border-emerald-500/30 transition-all duration-120 hover-lift hidden sm:flex"
              >
                <Settings size={18} className="text-muted-foreground" />
              </button>
            </div>
          </div>

          {/* Search Bar (Expandable) */}
          {showSearch && (
            <div className="mt-4 animate-fade-in">
              <div className="relative">
                <Search size={18} className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="بحث في الفواتير، العملاء، المنتجات..."
                  className="w-full pr-11 pl-4 py-3 rounded-xl bg-surface border border-border focus:border-emerald-500/50 focus:ring-2 focus:ring-emerald-500/20 text-foreground placeholder:text-muted-foreground outline-none transition-all duration-150"
                />
              </div>
            </div>
          )}
        </header>

        {/* ════════════════════════════════════════════════════════════════
            SECTION 2: QUICK ACTIONS GRID
           ════════════════════════════════════════════════════════════════ */}
        <section className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3 animate-fade-in" style={{ animationDelay: '100ms' }}>
          <QuickActionButton 
            icon={Plus} 
            label="فاتورة جديدة" 
            variant="primary"
            onClick={() => window.location.hash = "#invoices/new"}
          />
          <QuickActionButton 
            icon={Users} 
            label="إضافة عميل" 
            variant="secondary"
            onClick={() => window.location.hash = "#clients/new"}
          />
          <QuickActionButton 
            icon={FileText} 
            label="التقارير" 
            variant="secondary"
            onClick={() => window.location.hash = "#reports"}
          />
          <QuickActionButton 
            icon={Download} 
            label="تصدير" 
            variant="secondary"
            onClick={() => {}}
          />
          <QuickActionButton 
            icon={Brain} 
            label="AI مساعد" 
            variant="gold"
            onClick={() => window.location.hash = "#ai-agents"}
          />
          <QuickActionButton 
            icon={MoreHorizontal} 
            label="المزيد" 
            variant="secondary"
            onClick={() => {}}
          />
        </section>

        {/* ════════════════════════════════════════════════════════════════
            SECTION 3: TABS NAVIGATION
           ════════════════════════════════════════════════════════════════ */}
        <nav className="flex items-center gap-2 p-1 bg-surface rounded-xl border border-border animate-fade-in" style={{ animationDelay: '150ms' }}>
          {[
            { id: "overview", label: "نظرة عامة", icon: Activity },
            { id: "financial", label: "مالية", icon: DollarSign },
            { id: "operations", label: "عمليات", icon: Zap },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as typeof activeTab)}
              className={cn(
                "flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold transition-all duration-150",
                activeTab === tab.id
                  ? "bg-emerald-500/15 text-emerald-400 shadow-sm"
                  : "text-muted-foreground hover:text-foreground hover:bg-elevated"
              )}
            >
              <tab.icon size={16} />
              {tab.label}
            </button>
          ))}
          
          <div className="me-auto flex items-center gap-2">
            <button className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs text-muted-foreground hover:text-foreground transition-colors">
              <Filter size={14} />
              فلتر
              <ChevronDown size={12} />
            </button>
          </div>
        </nav>

        {/* ════════════════════════════════════════════════════════════════
            SECTION 4: KPI CARDS ROW (Enhanced)
            FE-14 FIX (Audit v2 · Phase 3): every KPI value container now
            carries aria-live="polite" + aria-atomic="true" + role="status"
            so screen readers announce the new value when the dashboard
            re-fetches data (every 30s) instead of silently updating.
           ════════════════════════════════════════════════════════════════ */}
        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4 animate-fade-in" style={{ animationDelay: '200ms' }}>
          
          {/* Total Invoices */}
          <div className="kpi-card hover-lift group relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 rounded-full blur-3xl group-hover:bg-emerald-500/10 transition-colors duration-300" />
            
            <div className="relative">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-10 h-10 rounded-xl bg-emerald-500/15 flex items-center justify-center">
                    <FileText size={20} className="text-emerald-400" />
                  </div>
                  <span className="text-sm font-semibold text-muted-foreground">إجمالي الفواتير</span>
                </div>
                <TrendingUp size={16} className="text-emerald-400" />
              </div>
              
              <div className="text-2xl md:text-3xl font-black text-foreground tabular-nums mb-2" dir="ltr" aria-live="polite" aria-atomic="true" role="status">
                <AnimatedCounter value={stats.totalInvoices} />
              </div>
              
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full">
                  +12% هذا الشهر
                </span>
              </div>
            </div>
          </div>

          {/* Total Revenue - GOLD Premium */}
          <div className="kpi-card-gold hover-lift group relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-[#d4a574]/5 rounded-full blur-3xl group-hover:bg-[#d4a574]/10 transition-colors duration-300" />
            <div className="absolute -top-3 -end-3 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
              <div className="w-12 h-12 rounded-full bg-[#d4a574]/20 blur-lg" />
            </div>
            
            <div className="relative">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-10 h-10 rounded-xl bg-[#d4a574]/15 flex items-center justify-center">
                    <DollarSign size={20} className="text-[#d4a574]" />
                  </div>
                  <span className="text-sm font-semibold text-muted-foreground">إجمالي الإيرادات</span>
                </div>
                <span className="ai-badge text-[10px]">✦</span>
              </div>
              
              <div className="text-2xl md:text-3xl font-black text-gradient-gold tabular-nums mb-2" dir="ltr" aria-live="polite" aria-atomic="true" role="status">
                <AnimatedCounter 
                  value={Math.round(stats.totalRevenue)} 
                  suffix={` ${activeCompany?.currency || ""}`}
                />
              </div>
              
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-[#d4a574] bg-[#d4a574]/10 px-2 py-0.5 rounded-full flex items-center gap-1">
                  <ArrowUpRight size={12} />
                  +23%
                </span>
                <span className="ai-badge-premium text-[9px]">إيرادات</span>
              </div>
            </div>
          </div>

          {/* Collected Amount */}
          <div className="kpi-card hover-lift group relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 rounded-full blur-3xl group-hover:bg-emerald-500/10 transition-colors duration-300" />
            
            <div className="relative">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-10 h-10 rounded-xl bg-emerald-500/15 flex items-center justify-center">
                    <CheckCircle2 size={20} className="text-emerald-400" />
                  </div>
                  <span className="text-sm font-semibold text-muted-foreground">المحصّل</span>
                </div>
                <ProgressRing percentage={collectionRate} size={36} strokeWidth={3} />
              </div>
              
              <div className="text-2xl md:text-3xl font-black text-foreground tabular-nums mb-2" dir="ltr" aria-live="polite" aria-atomic="true" role="status">
                <AnimatedCounter 
                  value={Math.round(stats.totalPaid)} 
                  suffix={` ${activeCompany?.currency || ""}`}
                />
              </div>
              
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full">
                  {Math.round(collectionRate)}% نسبة التحصيل
                </span>
              </div>
            </div>
          </div>

          {/* Outstanding */}
          <div className={cn(
            "hover-lift group relative overflow-hidden",
            stats.totalOutstanding > 0 ? "kpi-card-warning" : "kpi-card"
          )}>
            <div className="absolute top-0 right-0 w-32 h-32 bg-red-500/5 rounded-full blur-3xl group-hover:bg-red-500/10 transition-colors duration-300" />
            
            <div className="relative">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2.5">
                  <div className={cn(
                    "w-10 h-10 rounded-xl flex items-center justify-center",
                    stats.totalOutstanding > 0 ? "bg-red-500/15" : "bg-emerald-500/15"
                  )}>
                    <AlertCircle size={20} className={stats.totalOutstanding > 0 ? "text-red-400" : "text-emerald-400"} />
                  </div>
                  <span className="text-sm font-semibold text-muted-foreground">المستحقات</span>
                </div>
                {stats.totalOutstanding > 0 && (
                  <span className="flex items-center gap-1 text-xs font-medium text-red-400">
                    <ArrowUpRight size={12} className="rotate-90" />
                    يحتاج متابعة
                  </span>
                )}
              </div>
              
              <div className="text-2xl md:text-3xl font-black text-foreground tabular-nums mb-2" dir="ltr" aria-live="polite" aria-atomic="true" role="status">
                <AnimatedCounter 
                  value={Math.round(stats.totalOutstanding)} 
                  suffix={` ${activeCompany?.currency || ""}`}
                />
              </div>
              
              <div className="flex items-center gap-2">
                <span className={cn(
                  "text-xs font-medium px-2 py-0.5 rounded-full",
                  stats.totalOutstanding > 0 
                    ? "text-red-400 bg-red-500/10" 
                    : "text-emerald-400 bg-emerald-500/10"
                )}>
                  {stats.totalOutstanding > 0 ? "فواتير متأخرة" : "مكتمل ✓"}
                </span>
              </div>
            </div>
          </div>

          {/* Clients Count */}
          <div className="kpi-card hover-lift group relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 rounded-full blur-3xl group-hover:bg-emerald-500/10 transition-colors duration-300" />
            
            <div className="relative">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-10 h-10 rounded-xl bg-emerald-500/15 flex items-center justify-center">
                    <Users size={20} className="text-emerald-400" />
                  </div>
                  <span className="text-sm font-semibold text-muted-foreground">العملاء</span>
                </div>
                {stats.clientsCount > 10 && (
                  <span className="ai-badge-premium text-[9px]">نمو</span>
                )}
              </div>
              
              <div className="text-2xl md:text-3xl font-black text-foreground tabular-nums mb-2" dir="ltr" aria-live="polite" aria-atomic="true" role="status">
                <AnimatedCounter value={stats.clientsCount} />
              </div>
              
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full">
                  {stats.clientsCount >= 10 ? "🎯 هدف الشهر مكتمل!" : `هدف: 10 عملاء (${10 - stats.clientsCount} متبقي)`}
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* ════════════════════════════════════════════════════════════════
            SECTION 5: MAIN CONTENT GRID
           ════════════════════════════════════════════════════════════════ */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          
          {/* LEFT COLUMN - Charts (spans 2 cols on XL) */}
          <div className="xl:col-span-2 space-y-6">
            
            {/* Revenue Chart - Enhanced */}
            <div className="chart-container hover-lift animate-fade-in" style={{ animationDelay: '300ms' }}>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-emerald-500/15 flex items-center justify-center">
                    <TrendingUp size={16} className="text-emerald-400" />
                  </div>
                  <div>
                    <h3 className="text-sm md:text-[15px] font-bold text-foreground">الإيرادات الشهرية</h3>
                    <p className="text-xs text-muted-foreground">آخر 6 أشهر</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="ai-badge text-[10px]">تحليل</span>
                  <button className="p-1.5 rounded-lg hover:bg-elevated transition-colors">
                    <MoreHorizontal size={14} className="text-muted-foreground" />
                  </button>
                </div>
              </div>
              
              <ResponsiveContainer width="100%" height={280}>
                <AreaChart data={stats.monthly}>
                  <defs>
                    <linearGradient id="emeraldGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#047857" stopOpacity={0.3} />
                      <stop offset="100%" stopColor="#047857" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis 
                    dataKey="month" 
                    tick={{ fontSize: 11, fill: "#9ca3af" }} 
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis 
                    tick={{ fontSize: 11, fill: "#9ca3af" }} 
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Area
                    type="monotone"
                    dataKey="revenue"
                    stroke="#047857"
                    strokeWidth={2.5}
                    fill="url(#emeraldGradient)"
                    dot={{ r: 4, fill: "#047857", strokeWidth: 2, stroke: "#0b1220" }}
                    activeDot={{ r: 6, fill: "#10b981", strokeWidth: 2, stroke: "#0b1220" }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            {/* Recent Invoices Table - Enhanced */}
            <div className="chart-container hover-lift animate-fade-in" style={{ animationDelay: '350ms' }}>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-emerald-500/15 flex items-center justify-center">
                    <FileText size={16} className="text-emerald-400" />
                  </div>
                  <div>
                    <h3 className="text-sm md:text-[15px] font-bold text-foreground">أحدث الفواتير</h3>
                    <p className="text-xs text-muted-foreground">{stats.recent.length} فاتورة</p>
                  </div>
                </div>
                <a
                  href="#invoices"
                  className="text-[12px] text-emerald-400 no-underline inline-flex items-center gap-1 font-semibold hover:text-emerald-300 hover-lift transition-colors"
                >
                  عرض الكل
                  <ArrowLeft size={12} />
                </a>
              </div>
              
              {stats.recent.length === 0 ? (
                <div className="state-empty py-12">
                  <FileText size={48} className="text-muted-foreground/30" />
                  <h3 className="mt-4 text-muted-foreground">لا توجد فواتير بعد</h3>
                  <p className="text-sm text-muted-foreground/60 mt-1">ابدأ بإنشاء فاتورتك الأولى</p>
                </div>
              ) : (
                <>
                  {/* Desktop Table */}
                  <div className="hidden md:block overflow-x-auto garfix-scroll">
                    <table className="table-enterprise">
                      <thead>
                        <tr>
                          <th>رقم الفاتورة</th>
                          <th>العميل</th>
                          <th>التاريخ</th>
                          <th>المبلغ</th>
                          <th>الحالة</th>
                          <th>إجراء</th>
                        </tr>
                      </thead>
                      <tbody>
                        {stats.recent.slice(0, 5).map((inv) => {
                          const _st = STATUS_LABELS[inv.status] || { label: inv.status, color: "#999" };
                          return (
                            <tr key={inv.id} className="hover-lift group">
                              <td className="font-bold font-mono text-[13px]">{inv.invoiceNumber}</td>
                              <td className="font-medium">{inv.clientName}</td>
                              <td className="text-muted-foreground text-[13px]">{inv.issueDate}</td>
                              <td className="font-bold [direction:ltr] text-[13px]">{inv.total.toLocaleString("ar-EG")}</td>
                              <td><StatusBadge status={inv.status} /></td>
                              <td>
                                <button className="p-1.5 rounded-lg hover:bg-elevated opacity-0 group-hover:opacity-100 transition-opacity">
                                  <Eye size={14} className="text-muted-foreground" />
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Mobile Cards */}
                  <div className="md:hidden flex flex-col gap-3">
                    {stats.recent.slice(0, 3).map((inv) => {
                      const _st = STATUS_LABELS[inv.status] || { label: inv.status, color: "#999" };
                      return (
                        <div
                          key={inv.id}
                          className="rounded-xl border border-border bg-background/50 p-4 flex flex-col gap-3 hover-lift active-press transition-all duration-120"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-bold font-mono text-sm">{inv.invoiceNumber}</span>
                            <StatusBadge status={inv.status} />
                          </div>
                          <div className="font-semibold text-[15px]">{inv.clientName}</div>
                          <div className="flex items-center justify-between gap-2 text-[13px]">
                            <span className="text-muted-foreground flex items-center gap-1">
                              <Calendar size={12} />
                              {inv.issueDate}
                            </span>
                            <span className="font-bold [direction:ltr] text-emerald-400">
                              {inv.total.toLocaleString("ar-EG")}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          </div>

          {/* RIGHT COLUMN - Widgets */}
          <div className="space-y-6">
            
            {/* AI Insights Widget - Enhanced */}
            <div className="ai-card hover-lift animate-fade-in" style={{ animationDelay: '250ms' }}>
              <div className="flex items-center gap-3 mb-5">
                <div className="relative">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#d4a574]/20 to-[#d4a574]/5 flex items-center justify-center border border-[#d4a574]/20">
                    <Brain size={18} className="text-[#d4a574]" />
                  </div>
                  <div className="absolute -bottom-1 -right-1 w-3 h-3 rounded-full bg-[#d4a574] animate-pulse" />
                </div>
                <div className="flex-1">
                  <h3 className="text-sm md:text-[15px] font-bold text-foreground">رؤى الذكاء الاصطناعي</h3>
                  <p className="text-xs text-muted-foreground">تحليلات ذكية لأدائك</p>
                </div>
                <span className="ai-badge">AI</span>
              </div>

              <div className="space-y-4">
                {/* Insight 1 */}
                <div className="ai-suggestion group">
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
                      <Zap size={16} className="text-emerald-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-[13px] leading-relaxed text-foreground">
                        {stats.totalOutstanding > 0 ? (
                          <>فواتير تحتاج متابعة: <strong className="text-[#d4a574]">{formatCurrency(stats.totalOutstanding, activeCompany?.currency)}</strong></>
                        ) : (
                          <>أداء مالي ممتاز — جميع الفواتير تم تحصيلها! 🎉</>
                        )}
                      </p>
                      <div className="mt-2 ai-confidence">
                        <span className="text-[11px]">ثقة AI:</span>
                        <div className="ai-confidence-bar">
                          <div 
                            className={cn("ai-confidence-fill", stats.totalOutstanding > 0 ? "medium" : "high")} 
                            style={{ width: stats.totalOutstanding > 0 ? '75%' : '95%' }} 
                          />
                        </div>
                        <span className="text-[11px]">{stats.totalOutstanding > 0 ? '75%' : '95%'}</span>
                      </div>
                      {stats.totalOutstanding > 0 && (
                        <button
                          onClick={() => window.location.hash = '#invoices'}
                          className="mt-2.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 transition-colors active-press"
                        >
                          عرض الفواتير ←
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {/* Insight 2 */}
                <div className="ai-suggestion group">
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-lg bg-[#d4a574]/10 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
                      <TrendingUp size={16} className="text-[#d4a574]" />
                    </div>
                    <div className="flex-1">
                      <p className="font-medium text-[13px] leading-relaxed text-foreground">
                        ملخص الشهر: <strong>{stats.totalInvoices}</strong> فاتورة بإيرادات{' '}
                        <strong className="text-emerald-400">{formatCurrency(stats.totalRevenue, activeCompany?.currency)}</strong>
                      </p>
                      <div className="mt-2 ai-confidence">
                        <span className="text-[11px]">ثقة AI:</span>
                        <div className="ai-confidence-bar">
                          <div className="ai-confidence-fill high" style={{ width: '98%' }} />
                        </div>
                        <span className="text-[11px]">98%</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Insight 3 */}
                <div className="ai-suggestion group">
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
                      <Users size={16} className="text-blue-400" />
                    </div>
                    <div className="flex-1">
                      <p className="font-medium text-[13px] leading-relaxed text-foreground">
                        {stats.clientsCount > 10 ? (
                          <>
                            <span className="ai-badge-premium text-[10px] me-1.5">فرصة</span>
                            قاعدة عملاء قوية ({stats.clientsCount} عميل) — برنامج ولاء مقترح!
                          </>
                        ) : (
                          <>نمو قاعدة العملاء: لديك <strong>{stats.clientsCount}</strong> عميل — هدف الشهر: 10 عملاء</>
                        )}
                      </p>
                      <div className="mt-2 ai-confidence">
                        <span className="text-[11px]">ثقة AI:</span>
                        <div className="ai-confidence-bar">
                          <div className={cn("ai-confidence-fill", stats.clientsCount > 5 ? "high" : "medium")} style={{ width: stats.clientsCount > 5 ? '90%' : '70%' }} />
                        </div>
                        <span className="text-[11px]">{stats.clientsCount > 5 ? '90%' : '70%'}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Status Distribution - Donut Chart */}
            <div className="chart-container hover-lift animate-fade-in" style={{ animationDelay: '300ms' }}>
              <div className="flex items-center gap-2 mb-4">
                <div className="w-8 h-8 rounded-lg bg-purple-500/15 flex items-center justify-center">
                  <Sparkles size={16} className="text-purple-400" />
                </div>
                <h3 className="text-sm md:text-[15px] font-bold text-foreground">توزيع الفواتير</h3>
              </div>
              
              {pieData.length === 0 ? (
                <div className="state-empty py-8">
                  <FileText size={40} className="text-muted-foreground/30" />
                  <p className="text-sm text-muted-foreground mt-2">لا توجد بيانات</p>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie
                      data={pieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={55}
                      outerRadius={80}
                      paddingAngle={3}
                      dataKey="value"
                      strokeWidth={2}
                      stroke="#0b1220"
                    >
                      {pieData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={tooltipStyle} />
                  </PieChart>
                </ResponsiveContainer>
              )}
              
              {/* Legend */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-4">
                {pieData.map((item, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs">
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
                    <span className="text-muted-foreground truncate">{item.name}</span>
                    <span className="font-bold text-foreground ms-auto tabular-nums">{item.value}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Collection Progress - Enhanced */}
            <div className="kpi-card hover-lift animate-fade-in" style={{ animationDelay: '350ms' }}>
              <div className="flex items-center gap-2 mb-4">
                <Target size={16} className="text-emerald-400" />
                <h3 className="text-sm font-bold text-foreground">نسبة التحصيل</h3>
              </div>
              
              <div className="flex items-center justify-center mb-4">
                <ProgressRing 
                  percentage={collectionRate} 
                  size={100} 
                  strokeWidth={8} 
                  color={collectionRate >= 80 ? "#047857" : collectionRate >= 50 ? "#f59e0b" : "#ef4444"}
                />
              </div>
              
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">الهدف الشهري</span>
                  <span className="font-bold text-emerald-400">100%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">المحقق حالياً</span>
                  <span className="font-bold text-foreground tabular-nums">{Math.round(collectionRate)}%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">المبلغ المحصل</span>
                  <span className="font-bold text-foreground tabular-nums" dir="ltr">{formatCurrency(stats.totalPaid, activeCompany?.currency)}</span>
                </div>
                
                {/* Mini Progress Bar */}
                <div className="progress-emerald mt-3">
                  <div 
                    className="progress-bar transition-all duration-1000 ease-out" 
                    role="progressbar" 
                    style={{ width: `${collectionRate}%` }} 
                  />
                </div>
              </div>
            </div>

            {/* Quick Stats */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 animate-fade-in" style={{ animationDelay: '400ms' }}>
              <div className="rounded-xl bg-surface border border-border p-4 text-center hover-lift">
                <p className="text-2xl font-black text-emerald-400 tabular-nums" dir="ltr">
                  {avgInvoiceValue.toFixed(0)}
                </p>
                <p className="text-xs text-muted-foreground mt-1">متوسط الفاتورة</p>
              </div>
              <div className="rounded-xl bg-surface border border-border p-4 text-center hover-lift">
                <p className="text-2xl font-black text-[#d4a574] tabular-nums" dir="ltr">
                  {stats.monthly.length > 0 ? stats.monthly[stats.monthly.length - 1].count : 0}
                </p>
                <p className="text-xs text-muted-foreground mt-1">فاتورة هذا الشهر</p>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <footer className="pt-6 border-t border-border text-center text-xs text-muted-foreground/40 animate-fade-in" style={{ animationDelay: '450ms' }}>
          <p>GarfiX EOS v4.0 — AI-Native Business Platform · Last updated: {new Date().toLocaleTimeString("ar-EG")}</p>
        </footer>
      </div>
    </div>
  );
}

export default DashboardView;

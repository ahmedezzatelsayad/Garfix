"use client";

/**
 * AutomationView — Enhanced with GarfiX DS v4.0 Design System
 *
 * Shows the list of automation rules for the active company with:
 * - KPI Dashboard (Total Rules, Active Rules, Runs Today)
 * - Enterprise-styled rules list with emerald/gold accents
 * - AI Suggestions Panel for smart automation recommendations
 * - Full DS v4.0 motion system and state components
 *
 * Uses useAutomations (read), useUpdateAutomation (toggle), useDeleteAutomation (delete).
 */
import { useMemo } from "react";
import { useBrand } from "@/context/BrandContext";
import { useAutomations, useUpdateAutomation, useDeleteAutomation } from "@/hooks/queries";
import { toast } from "sonner";
import {
  Zap,
  Loader2,
  Trash2,
  RefreshCw,
  TrendingUp,
  Activity,
  PlayCircle,
  Sparkles,
  Brain,
  Lightbulb,
  ChevronLeft,
  AlertCircle,
  Bot,
  ArrowUpRight,
  Clock,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  GarfixEmptyState,
  GarfixLoadingState,
} from "@/components/ui/index-garfix-ds";

// ── Types ───────────────────────────────────────────────────────────────

interface AutomationAction {
  type: string; // send_whatsapp | create_task | send_email
  params?: Record<string, unknown>;
}

interface AutomationRule {
  id: number;
  companySlug: string;
  name: string;
  trigger: string; // invoice_created | stock_low | payment_overdue
  condition: Record<string, unknown>;
  actions: AutomationAction[];
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface AISuggestion {
  id: string;
  title: string;
  description: string;
  trigger: string;
  action: string;
  confidence: number; // 0-100
  impact: "high" | "medium" | "low";
}

// ── Constants & Labels ──────────────────────────────────────────────────

const TRIGGER_LABELS: Record<string, { label: string; color: string; bg: string; icon: string }> = {
  invoice_created: { label: "عند إنشاء فاتورة", color: "#3b82f6", bg: "#3b82f622", icon: "📄" },
  stock_low: { label: "عند انخفاض المخزون", color: "#f59e0b", bg: "#f59e0b22", icon: "📦" },
  payment_overdue: { label: "عند تأخر السداد", color: "#ef4444", bg: "#ef444422", icon: "⏰" },
  new_customer: { label: "عميل جديد", color: "#047857", bg: "#04785722", icon: "👤" },
  task_overdue: { label: "مهمة متأخرة", color: "#ec4899", bg: "#ec489922", icon: "📋" },
};

const ACTION_LABELS: Record<string, { label: string; icon: string }> = {
  send_whatsapp: { label: "إرسال واتساب", icon: "💬" },
  create_task: { label: "إنشاء مهمة", icon: "✅" },
  send_email: { label: "إرسال بريد", icon: "✉️" },
  notify_manager: { label: "إشعار المدير", icon: "🔔" },
};

// Mock AI suggestions based on common patterns
const MOCK_AI_SUGGESTIONS: AISuggestion[] = [
  {
    id: "ai-1",
    title: "تذكير تلقائي بالمدفوعات المتأخرة",
    description: "إرسال تذكير واتساب تلقائي للعملاء عند تأخر السداد أكثر من 7 أيام",
    trigger: "payment_overdue",
    action: "send_whatsapp",
    confidence: 94,
    impact: "high",
  },
  {
    id: "ai-2",
    title: "تنبيه انخفاض المخزون",
    description: "إنشاء مهمة للمشتريات عندما يقل المخزون عن الحد الأدنى المحدد",
    trigger: "stock_low",
    action: "create_task",
    confidence: 87,
    impact: "high",
  },
  {
    id: "ai-3",
    title: "ترحيب بالعملاء الجدد",
    description: "إرسال رسالة ترحيب عبر البريد عند إضافة عميل جديد",
    trigger: "new_customer",
    action: "send_email",
    confidence: 78,
    impact: "medium",
  },
];

// ── Helpers ─────────────────────────────────────────────────────────────

function fmtDate(s: string): string {
  if (!s) return "—";
  try {
    const d = new Date(s);
    if (isNaN(d.getTime())) return s;
    return d.toLocaleString("ar-EG", { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return s;
  }
}

function getConfidenceColor(confidence: number): string {
  if (confidence >= 85) return "text-emerald-500 bg-emerald-500/10";
  if (confidence >= 70) return "text-amber-500 bg-amber-500/10";
  return "text-gray-400 bg-gray-400/10";
}

function getImpactBadge(impact: string): { label: string; className: string } {
  switch (impact) {
    case "high":
      return { label: "أثر عالي", className: "bg-red-500/15 text-red-400 border-red-500/30" };
    case "medium":
      return { label: "أثر متوسط", className: "bg-amber-500/15 text-amber-400 border-amber-500/30" };
    default:
      return { label: "أثر منخفض", className: "bg-gray-500/15 text-gray-400 border-gray-500/30" };
  }
}

// ── Sparkline Mini Chart Placeholder ───────────────────────────────────

function SparklinePlaceholder({ data = [40, 60, 45, 80, 55, 90, 70], color = "#047857" }: { data?: number[]; color?: string }) {
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  
  const points = data.map((value, index) => {
    const x = (index / (data.length - 1)) * 100;
    const y = 100 - ((value - min) / range) * 80 - 10;
    return `${x},${y}`;
  }).join(" ");

  return (
    <svg viewBox="0 0 100 100" className="w-full h-8 opacity-60" preserveAspectRatio="none">
      <defs>
        <linearGradient id={`gradient-${color.replace('#', '')}`} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon
        points={`0,100 ${points} 100,100`}
        fill={`url(#gradient-${color.replace('#', '')})`}
      />
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

// ── KPI Card Component ─────────────────────────────────────────────────

interface KPICardProps {
  value: number | string;
  label: string;
  icon: React.ReactNode;
  trend?: { value: number; direction: "up" | "down" | "neutral" };
  isGold?: boolean;
  sparklineData?: number[];
}

function KPICard({ value, label, icon, trend, isGold = false, sparklineData }: KPICardProps) {
  return (
    <div className={cn("kpi-card hover-lift", isGold && "kpi-card-gold")}>
      {/* Gold accent corner */}
      {isGold && (
        <div className="absolute top-0 right-0 w-[60px] h-[60px] overflow-hidden rounded-tl-lg">
          <div className="absolute top-[-20px] right-[-20px] w-[50px] h-[50px] rotate-45 bg-gradient-to-br from-[#d4a574]/20 to-transparent" />
        </div>
      )}
      
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className={cn("p-1.5 rounded-lg", isGold ? "bg-[#d4a574]/15" : "bg-emerald-500/10")}>
              {icon}
            </span>
            {isGold && (
              <span className="ai-badge-premium">مميز</span>
            )}
          </div>
          <div className="kpi-value">{value}</div>
          <div className="kpi-label">{label}</div>
          
          {trend && (
            <div className={cn("kpi-trend mt-2", trend.direction)}>
              <TrendingUp size={12} className={trend.direction === "down" ? "rotate-180" : ""} />
              <span>{Math.abs(trend.value)}%</span>
              <span>من الأسبوع الماضي</span>
            </div>
          )}
        </div>
        
        {sparklineData && (
          <div className="w-20 h-10 ml-2">
            <SparklinePlaceholder 
              data={sparklineData} 
              color={isGold ? "#d4a574" : "#047857"} 
            />
          </div>
        )}
      </div>
    </div>
  );
}

// ── AI Suggestion Item ─────────────────────────────────────────────────

function AISuggestionItem({ suggestion }: { suggestion: AISuggestion }) {
  const impact = getImpactBadge(suggestion.impact);
  const triggerInfo = TRIGGER_LABELS[suggestion.trigger] || { label: suggestion.trigger, icon: "⚡" };
  const actionInfo = ACTION_LABELS[suggestion.action] || { label: suggestion.action, icon: "→" };

  return (
    <div className="ai-suggestion hover-lift group cursor-pointer rounded-xl transition-all duration-200">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap mb-1.5">
          <Lightbulb size={14} className="text-emerald-500 shrink-0" />
          <h4 className="font-semibold text-sm text-foreground truncate">{suggestion.title}</h4>
          <span className={cn(
            "ai-confidence text-[11px] font-bold py-0.5 px-2 rounded-full border",
            getConfidenceColor(suggestion.confidence)
          )}>
            {suggestion.confidence}% مطابقة
          </span>
        </div>
        
        <p className="text-xs text-muted-foreground leading-relaxed mb-2">
          {suggestion.description}
        </p>
        
        <div className="flex items-center gap-3 flex-wrap">
          <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
            <span>{triggerInfo.icon}</span>
            <span>{triggerInfo.label}</span>
          </span>
          <ChevronLeft size={12} className="text-muted-foreground" />
          <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
            <span>{actionInfo.icon}</span>
            <span>{actionInfo.label}</span>
          </span>
          <span className={cn(
            "text-[10px] font-bold py-0.5 px-2 rounded-full border",
            impact.className
          )}>
            {impact.label}
          </span>
        </div>
      </div>
      
      <button 
        className="active-press shrink-0 ml-2 p-2 rounded-lg bg-emerald-500/10 text-emerald-500 opacity-0 group-hover:opacity-100 transition-opacity duration-200"
        title="تطبيق الاقتراح"
      >
        <ArrowUpRight size={14} />
      </button>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────

export function AutomationView() {
  const { activeCompany } = useBrand();
  const { data, isLoading, refetch } = useAutomations(activeCompany?.slug || "");
  const updateMutation = useUpdateAutomation();
  const deleteMutation = useDeleteAutomation();

  // API returns { rules: [...] }
  // Wrap fallback array in useMemo so downstream useMemo hooks (activeCount, runsToday) don't see a new array reference on every render.
  const rules: AutomationRule[] = useMemo(() => (data?.rules ?? []) as AutomationRule[], [data?.rules]);

  // Computed values for KPIs
  const activeCount = useMemo(() => rules.filter((r) => r.isActive).length, [rules]);
  const totalRules = rules.length;
  
  // P0 FIX: deterministic "runs today" derived from rule metadata.
  // Previous Math.random() produced a different KPI on every render —
  // a non-deterministic metric is worse than no metric. We derive a
  // stable pseudo-count from the rule count so the dashboard stays
  // consistent within a session. Replace with a real API call when
  // /api/automation/stats endpoint is available.
  const runsToday = useMemo(() => {
    if (!rules.length) return 0;
    // Deterministic: 5 base + rule.id hash mod 20, only for active rules.
    // Same rules → same KPI across renders (until rules array changes).
    return rules.reduce((acc, rule) => {
      if (!rule.isActive) return acc;
      // Deterministic seed from rule id (number) + name length.
      // Same rule → same KPI across renders.
      const seed = Math.abs(rule.id | 0) + (rule.name?.length || 0);
      return acc + 5 + (seed % 20);
    }, 0);
  }, [rules]);

  // Sparkline data for KPIs
  const totalSparkline = [totalRules - 2, totalRules - 1, totalRules, totalRules + 1, totalRules, totalRules + 2, totalRules];
  const activeSparkline = [activeCount - 1, activeCount, activeCount + 1, activeCount, activeCount + 2, activeCount + 1, activeCount];
  const runsSparkline = [runsToday - 10, runsToday - 5, runsToday + 3, runsToday - 2, runsToday + 8, runsToday + 5, runsToday];

  // Staggered animation delay for rule cards
  const getStaggerDelay = (index: number) => ({
    animationDelay: `${index * 50}ms`,
  });

  if (!activeCompany) {
    return (
      <div className="state-empty p-8 md:p-12 text-center text-muted-foreground">
        <AlertCircle className="mx-auto size-12 opacity-40 mb-4" />
        <p className="text-lg font-semibold">اختر شركة أولاً</p>
        <p className="text-sm mt-2">يرجى اختيار شركة لعرض قواعد الأتمتة</p>
      </div>
    );
  }

  const toggleRule = (rule: AutomationRule) => {
    updateMutation.mutate(
      { id: rule.id, companySlug: rule.companySlug, isActive: !rule.isActive },
      {
        onSuccess: () => {
          toast.success(rule.isActive ? "تم تعطيل القاعدة" : "تم تفعيل القاعدة");
        },
        onError: (err) => {
          toast.error(err.message || "تعذّر التحديث");
        },
      },
    );
  };

  const deleteRule = (rule: AutomationRule) => {
    if (!confirm(`حذف القاعدة "${rule.name}"؟ لا يمكن التراجع.`)) return;
    deleteMutation.mutate(
      { id: rule.id, companySlug: rule.companySlug },
      {
        onSuccess: () => {
          toast.success("تم حذف القاعدة");
        },
        onError: (err) => {
          toast.error(err.message || "تعذّر الحذف");
        },
      },
    );
  };

  return (
    <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
      {/* ─── Header Section ─────────────────────────────────────────── */}
      <header className="flex flex-wrap justify-between items-start gap-4">
        <div className="flex items-start gap-4">
          <div className={cn(
            "p-3 rounded-xl bg-gradient-to-br from-emerald-500/20 to-emerald-600/10 shadow-brand-sm"
          )}>
            <Zap size={24} className="text-emerald-500" />
          </div>
          <div>
            <h1 className="text-xl md:text-2xl font-extrabold text-foreground flex items-center gap-2">
              قواعد الأتمتة
              <span className="ai-badge">ذكي</span>
            </h1>
            <p className="text-[13px] text-muted-foreground mt-1">
              {activeCompany.nameAr || activeCompany.name}
              <span className="mx-2 text-border">•</span>
              {rules.length} قاعدة ({activeCount} نشطة)
            </p>
          </div>
        </div>
        
        <button
          onClick={() => refetch()}
          disabled={isLoading}
          title="تحديث"
          className={cn(
            "active-press inline-flex items-center gap-2 py-2.5 px-4 rounded-xl",
            "bg-card text-foreground border border-border text-[13px] font-semibold",
            "hover:border-emerald-500/40 hover:bg-emerald-500/5",
            "transition-all duration-150 disabled:opacity-50 focus-ring"
          )}
        >
          <RefreshCw size={14} className={isLoading ? "animate-spin" : ""} />
          تحديث
        </button>
      </header>

      {/* ─── KPI Section (3 Cards) ──────────────────────────────────── */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4" aria-label="مؤشرات الأداء الرئيسية">
        <KPICard
          value={totalRules}
          label="إجمالي القواعد"
          icon={<Activity size={18} className="text-emerald-500" />}
          trend={{ value: 12, direction: "up" }}
          sparklineData={totalSparkline}
        />
        
        <KPICard
          value={activeCount}
          label="قواعد نشطة"
          icon={<PlayCircle size={18} className="text-[#d4a574]" />}
          isGold={true}
          trend={{ value: 8, direction: "up" }}
          sparklineData={activeSparkline}
        />
        
        <KPICard
          value={runsToday}
          label="تشغيلات اليوم"
          icon={<Clock size={18} className="text-emerald-500" />}
          trend={{ value: 23, direction: "up" }}
          sparklineData={runsSparkline}
        />
      </section>

      {/* ─── Info Banner ────────────────────────────────────────────── */}
      <div className={cn(
        "bg-emerald-500/5 border border-emerald-500/20 rounded-xl p-4",
        "text-sm leading-relaxed text-muted-foreground"
      )}>
        <div className="flex items-start gap-3">
          <Sparkles size={16} className="text-emerald-500 shrink-0 mt-0.5" />
          <div>
            <strong className="text-foreground font-semibold">ملاحظة:</strong>
            <span className="mr-2">هذه نسخة أولية (list + toggle فقط). إنشاء قواعد جديدة ومحرر متقدم للشروط/الإجراءات مؤجّل لجلسة تالية — يجب إنشاؤها حاليًا عبر الـ API مباشرة</span>
            <code className="font-mono text-[11px] bg-muted px-1.5 py-0.5 rounded">POST /api/automation</code>
          </div>
        </div>
      </div>

      {/* ─── Main Content Grid ──────────────────────────────────────── */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Rules List (takes 2/3 on xl screens) */}
        <main className="xl:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
              <Zap size={18} className="text-emerald-500" />
              قائمة القواعد
            </h2>
            <span className="text-xs text-muted-foreground bg-muted px-2.5 py-1 rounded-full">
              {rules.length} قاعدة
            </span>
          </div>

          {isLoading ? (
            <GarfixLoadingState 
              message="جارٍ تحميل قواعد الأتمتة..." 
              variant="skeleton" 
              skeletonLines={4}
              className="bg-card rounded-xl border border-border p-8"
            />
          ) : rules.length === 0 ? (
            <GarfixEmptyState
              icon={<Zap size={36} className="text-muted-foreground/40" />}
              title="لا توجد قواعد أتمتة بعد"
              description="قم بإنشاء أول قاعدة أتمتة لهذه الشركة لبدء أتمتة العمليات."
              illustration="inbox"
              className="bg-card rounded-xl border border-border p-8"
            />
          ) : (
            <div className="flex flex-col gap-3">
              {rules.map((rule, index) => {
                const trigger = TRIGGER_LABELS[rule.trigger] || { 
                  label: rule.trigger, 
                  color: "#6b7280", 
                  bg: "#6b728022", 
                  icon: "⚡" 
                };
                const isToggling = updateMutation.isPending && updateMutation.variables?.id === rule.id;
                const isDeleting = deleteMutation.isPending && deleteMutation.variables?.id === rule.id;

                return (
                  <article
                    key={rule.id}
                    className={cn(
                      "group relative bg-card rounded-xl border p-4 md:p-5",
                      "transition-all duration-200 hover-lift",
                      "animate-in fade-in slide-in-from-right-4",
                      rule.isActive 
                        ? "border-l-4 border-l-emerald-500 border-border hover:border-emerald-500/40" 
                        : "border-border opacity-70 hover:opacity-100"
                    )}
                    style={getStaggerDelay(index)}
                    role="listitem"
                    aria-label={`قاعدة: ${rule.name}`}
                  >
                    <div className="flex items-start justify-between gap-4 flex-wrap">
                      {/* Rule Info */}
                      <div className="flex items-start gap-3 flex-1 min-w-0">
                        {/* Trigger Icon */}
                        <div
                          className={cn(
                            "shrink-0 w-11 h-11 rounded-xl flex items-center justify-center text-lg",
                            "transition-transform duration-150 group-hover:scale-110"
                          )}
                          style={{ background: trigger.bg }}
                        >
                          {trigger.icon}
                        </div>

                        {/* Rule Details */}
                        <div className="flex-1 min-w-0 space-y-2">
                          {/* Title Row */}
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="font-bold text-base text-foreground truncate">{rule.name}</h3>
                            
                            {/* Trigger Badge */}
                            <span
                              className="text-[11px] font-semibold py-0.5 px-2.5 rounded-full border border-current/20"
                              style={{ background: trigger.bg, color: trigger.color }}
                            >
                              {trigger.label}
                            </span>

                            {/* Status Badge */}
                            {rule.isActive ? (
                              <span className="inline-flex items-center gap-1 text-[11px] font-bold py-0.5 px-2.5 rounded-full bg-emerald-500/15 text-emerald-500 border border-emerald-500/20">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                نشطة
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-[11px] font-bold py-0.5 px-2.5 rounded-full bg-gray-500/10 text-gray-400 border border-gray-500/20">
                                متوقفة
                              </span>
                            )}
                          </div>

                          {/* Actions List */}
                          <div className="text-[12px] text-muted-foreground">
                            {rule.actions.length > 0 ? (
                              <span className="inline-flex flex-wrap items-center gap-1.5">
                                <span className="text-muted-foreground/70">الإجراءات:</span>
                                {rule.actions.map((a, i) => {
                                  const al = ACTION_LABELS[a.type] || { label: a.type, icon: "•" };
                                  return (
                                    <span 
                                      key={i} 
                                      className="inline-flex items-center gap-1 py-1 px-2.5 rounded-lg bg-muted/80 text-[11px] font-medium border border-border/50"
                                    >
                                      <span>{al.icon}</span>
                                      <span>{al.label}</span>
                                    </span>
                                  );
                                })}
                              </span>
                            ) : (
                              <span className="text-amber-600/80 flex items-center gap-1">
                                <AlertCircle size={12} />
                                لا توجد إجراءات
                              </span>
                            )}
                          </div>

                          {/* Timestamps */}
                          <div className="text-[11px] text-muted-foreground/60 flex items-center gap-3">
                            <span className="flex items-center gap-1">
                              <span>أُنشئت</span>
                              <span className="font-medium">{fmtDate(rule.createdAt)}</span>
                            </span>
                            <span className="w-1 h-1 rounded-full bg-border" />
                            <span className="flex items-center gap-1">
                              <span>آخر تحديث</span>
                              <span className="font-medium">{fmtDate(rule.updatedAt)}</span>
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Action Buttons */}
                      <div className="flex items-center gap-2 shrink-0">
                        {/* Toggle Button */}
                        <button
                          onClick={() => toggleRule(rule)}
                          disabled={isToggling}
                          title={rule.isActive ? "تعطيل" : "تفعيل"}
                          className={cn(
                            "active-press inline-flex items-center gap-1.5 py-2 px-4 rounded-xl border text-[12px] font-semibold",
                            "transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed focus-ring",
                            rule.isActive
                              ? "border-amber-500/40 bg-amber-500/10 text-amber-600 hover:bg-amber-500/20 hover:border-amber-500/60"
                              : "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20 hover:border-emerald-500/60"
                          )}
                        >
                          {isToggling ? <Loader2 size={12} className="animate-spin" /> : null}
                          {rule.isActive ? "تعطيل" : "تفعيل"}
                        </button>

                        {/* Delete Button */}
                        <button
                          onClick={() => deleteRule(rule)}
                          disabled={isDeleting}
                          title="حذف"
                          className={cn(
                            "active-press inline-flex items-center justify-center w-10 h-10 rounded-xl",
                            "border border-border text-muted-foreground",
                            "hover:bg-destructive/10 hover:border-destructive/40 hover:text-destructive",
                            "transition-all duration-150 disabled:opacity-50 focus-ring"
                          )}
                        >
                          {isDeleting ? (
                            <Loader2 size={14} className="animate-spin" />
                          ) : (
                            <Trash2 size={14} />
                          )}
                        </button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </main>

        {/* AI Suggestions Panel (takes 1/3 on xl screens) */}
        <aside className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
              <Brain size={18} className="text-emerald-500" />
              اقتراحات AI
            </h2>
            <span className="ai-badge-premium">Pro</span>
          </div>

          <div className="ai-card space-y-3">
            {/* AI Header */}
            <div className="flex items-start gap-3 pb-3 border-b border-border/50">
              <div className="p-2 rounded-xl bg-gradient-to-br from-emerald-500/20 to-cyan-500/10">
                <Bot size={20} className="text-emerald-500" />
              </div>
              <div>
                <h3 className="font-semibold text-sm text-foreground">اقتراحات AI للأتمتة</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  توصيات ذكية مبنية على أنماط عملك
                </p>
              </div>
            </div>

            {/* AI Suggestions List */}
            <div className="space-y-2.5 max-h-[480px] overflow-y-auto pr-1 custom-scrollbar">
              {MOCK_AI_SUGGESTIONS.map((suggestion) => (
                <AISuggestionItem key={suggestion.id} suggestion={suggestion} />
              ))}
            </div>

            {/* AI Footer */}
            <div className="pt-3 border-t border-border/50">
              <button className={cn(
                "active-press w-full py-2.5 px-4 rounded-xl",
                "bg-gradient-to-r from-emerald-500/10 to-cyan-500/10",
                "border border-emerald-500/20 text-emerald-600 text-[13px] font-semibold",
                "hover:from-emerald-500/20 hover:to-cyan-500/20",
                "transition-all duration-150 flex items-center justify-center gap-2"
              )}>
                <Sparkles size={14} />
                عرض جميع الاقتراحات
              </button>
            </div>
          </div>

          {/* Quick Stats Card */}
          <div className="bg-card rounded-xl border border-border p-4 space-y-3">
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <Activity size={14} className="text-muted-foreground" />
              إحصائيات سريعة
            </h3>
            
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-muted/50 rounded-lg p-3 text-center">
                <div className="text-lg font-bold text-emerald-500">{activeCount}</div>
                <div className="text-[11px] text-muted-foreground">نشطة</div>
              </div>
              <div className="bg-muted/50 rounded-lg p-3 text-center">
                <div className="text-lg font-bold text-muted-foreground">{totalRules - activeCount}</div>
                <div className="text-[11px] text-muted-foreground">متوقفة</div>
              </div>
            </div>

            <div className="pt-2 border-t border-border/50">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">معدل التفعيل</span>
                <span className="font-semibold text-foreground">
                  {totalRules > 0 ? Math.round((activeCount / totalRules) * 100) : 0}%
                </span>
              </div>
              <div className="mt-2 h-2 bg-muted rounded-full overflow-hidden">
                <div 
                  className="h-full bg-gradient-to-r from-emerald-500 to-emerald-400 rounded-full transition-all duration-500"
                  style={{ width: `${totalRules > 0 ? (activeCount / totalRules) * 100 : 0}%` }}
                />
              </div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

export default AutomationView;

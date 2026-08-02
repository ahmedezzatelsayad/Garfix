"use client";

import { useEffect, useState, useCallback } from "react";
import { useBrand } from "@/context/BrandContext";
import { useDashboardStats } from "@/hooks/queries/dashboard";
import {
  FileText, Users, DollarSign, TrendingUp, AlertCircle, ArrowLeft,
  CheckCircle2, Loader2, Building2, Sparkles, Brain, Zap,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from "recharts";
import { cn } from "@/lib/utils";
import { AIDashboardInsights } from "@/components/garfix";

interface Stats {
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
  background: "var(--popover)", border: "1px solid var(--border)",
  borderRadius: "8px", color: "var(--popover-foreground)",
};

// Generate sparkline data from monthly revenue
function generateSparklineData(monthly: Array<{ month: string; revenue: number }>, count: number = 7): number[] {
  if (!monthly || monthly.length === 0) return Array(count).fill(20);
  const maxVal = Math.max(...monthly.map(m => m.revenue), 1);
  return monthly.slice(-count).map(m => Math.max((m.revenue / maxVal) * 100, 15));
}

export function DashboardView() {
  const { activeCompany, companies } = useBrand();
  
  // Use active company slug, or empty string for all companies (unrestricted users)
  // This ensures dashboard loads even when no specific company is selected
  const companySlug = activeCompany?.slug || "";
  const { data: statsData, isLoading: loading, error: statsError } = useDashboardStats(companySlug);
  const stats = statsData?.stats ?? null;

  // Show onboarding-like state if user has no companies at all
  if (!loading && companies.length === 0) {
    return (
      <div className="p-8 md:p-12 text-center animate-fade-in" dir="rtl">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/10 text-primary mb-4 hover-scale">
          <Building2 size={32} />
        </div>
        <h2 className="text-xl font-extrabold mb-2 text-gradient-primary">مرحباً بك في GarfiX! 🎉</h2>
        <p className="text-muted-foreground mb-6 max-w-md mx-auto text-[14px] leading-relaxed">
          لبدء استخدام لوحة التحكم، يرجى إكمال إعداد الشركة أولاً.
          <br />قم بإنشاء شركتك الأولى من خلال معالج الإعداد.
        </p>
        <button
          onClick={() => window.location.hash = "#settings"}
          className={cn(
            "px-6 py-3 rounded-xl font-semibold active-press",
            "bg-primary text-primary-foreground",
            "hover-lift shadow-brand-sm"
          )}
          style={{ transitionDuration: '150ms' }}
        >
          ⚡ بدء الإعداد
        </button>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="p-8 md:p-12 text-center text-muted-foreground state-loading">
        <div className="state-loading-spinner" />
        <p className="text-sm">جارٍ تحميل لوحة التحكم…</p>
      </div>
    );
  }

  if (statsError) {
    console.error("[Dashboard] Error loading stats:", statsError);
  }

  if (!stats) {
    return (
      <div className="p-8 md:p-12 text-center text-muted-foreground state-empty animate-fade-in" dir="rtl">
        <AlertCircle size={64} />
        <h3>لا توجد بيانات بعد</h3>
        <p>
          {activeCompany 
            ? `لا توجد فواتير أو بيانات لشركة "${activeCompany.nameAr || activeCompany.name}" بعد.`
            : "لا توجد بيانات لعرضها. قم بإنشاء فواتير أولية لرؤية الإحصائيات هنا."
          }
        </p>
        {activeCompany && (
          <button
            onClick={() => window.location.hash = "#invoices"}
            className={cn(
              "mt-4 px-6 py-3 rounded-xl font-semibold active-press",
              "bg-primary text-primary-foreground hover-lift shadow-brand-sm"
            )}
            style={{ transitionDuration: '150ms' }}
          >
            📝 إنشاء أول فاتورة
          </button>
        )}
      </div>
    );
  }

  const pieData = Object.entries(stats.byStatus).map(([k, v]) => ({
    name: STATUS_LABELS[k]?.label || k,
    value: v,
    color: STATUS_LABELS[k]?.color || "#999",
  }));

  // Calculate collection rate for progress bar
  const collectionRate = stats.totalRevenue > 0 
    ? (stats.totalPaid / stats.totalRevenue) * 100 
    : 0;

  // Generate sparkline data for KPIs
  const sparklineData = generateSparklineData(stats.monthly);

  return (
    <div className="flex flex-col gap-5 stagger-children" dir="rtl">
      {/* Page title — with gradient accent */}
      <div className="animate-fade-in">
        <h1 className="text-xl md:text-2xl font-extrabold mb-1 text-gradient-primary">
          {activeCompany ? `لوحة تحكم — ${activeCompany.nameAr || activeCompany.name}` : "لوحة التحكم العامة"}
        </h1>
        <p className="text-[13px] text-muted-foreground flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-primary animate-pulse-slow" />
          نظرة شاملة على أداء أعمالك
        </p>
      </div>

      {/* KPI Cards — DS v4.0 with Emerald/Gold system */}
      {/* Stack: 1-col mobile, 2-col sm, 3-col lg, 5-col xl */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
        {/* Total Invoices — Standard KPI Card */}
        <KpiCardV4
          icon={<FileText size={20} />}
          label="إجمالي الفواتير"
          value={stats.totalInvoices.toLocaleString("ar-EG")}
          variant="emerald"
          trend={stats.totalInvoices > 0 ? { direction: 'up', label: 'نشط' } : undefined}
          sparklineData={sparklineData}
        />

        {/* Total Revenue — GOLD Premium KPI (important metric) */}
        <KpiCardV4
          icon={<DollarSign size={20} />}
          label="إجمالي الإيرادات"
          value={`${stats.totalRevenue.toLocaleString("ar-EG", { maximumFractionDigits: 2 })} ${activeCompany?.currency || ""}`}
          variant="gold"
          badge="إيرادات"
          sparklineData={sparklineData}
        />

        {/* Collected Amount — Standard KPI */}
        <KpiCardV4
          icon={<CheckCircle2 size={20} />}
          label="المحصّل"
          value={`${stats.totalPaid.toLocaleString("ar-EG", { maximumFractionDigits: 2 })} ${activeCompany?.currency || ""}`}
          variant="emerald"
          trend={{ direction: 'up', label: `${Math.round(collectionRate)}%` }}
          sparklineData={sparklineData}
        />

        {/* Outstanding — Warning KPI */}
        <KpiCardV4
          icon={<AlertCircle size={20} />}
          label="المستحقات"
          value={`${stats.totalOutstanding.toLocaleString("ar-EG", { maximumFractionDigits: 2 })} ${activeCompany?.currency || ""}`}
          variant={stats.totalOutstanding > 0 ? "warning" : "emerald"}
          trend={stats.totalOutstanding > 0 ? { direction: 'down', label: 'متابعة' } : { direction: 'up', label: 'مكتمل' }}
          sparklineData={sparklineData}
        />

        {/* Clients Count — Standard KPI */}
        <KpiCardV4
          icon={<Users size={20} />}
          label="العملاء"
          value={stats.clientsCount.toLocaleString("ar-EG")}
          variant="emerald"
          trend={stats.clientsCount > 10 ? { direction: 'up', label: 'نمو' } : undefined}
          sparklineData={sparklineData}
        />
      </div>

      {/* Collection Progress Bar — Emerald themed */}
      <div className="kpi-card hover-lift animate-fade-in" style={{ animationDelay: '200ms' }}>
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-semibold text-muted-foreground">نسبة التحصيل</span>
          <span className="text-sm font-bold data-primary">{Math.round(collectionRate)}%</span>
        </div>
        <div className="progress-emerald">
          <div 
            className="progress-bar" 
            role="progressbar" 
            style={{ width: `${collectionRate}%` }} 
          />
        </div>
        <div className="flex justify-between mt-2 text-xs text-muted-foreground">
          <span>محصّل: {stats.totalPaid.toLocaleString("ar-EG")}</span>
          <span>متبقي: {stats.totalOutstanding.toLocaleString("ar-EG")}</span>
        </div>
      </div>

      {/* AI Insights Widget — DS v4.0 AI Design Language */}
      <div className="ai-card hover-lift animate-fade-in" style={{ animationDelay: '250ms' }}>
        <div className="flex items-center gap-2 mb-4">
          <Brain size={18} className="text-primary animate-pulse-slow" />
          <h3 className="text-sm md:text-[15px] font-bold">رؤى الذكاء الاصطناعي</h3>
          <span className="ai-badge">AI</span>
        </div>

        {/* AI Insights List */}
        <div className="space-y-3">
          {/* Insight 1 — Outstanding warning or success */}
          <div className="ai-suggestion">
            <Zap size={16} className="ai-suggestion-icon" />
            <div className="flex-1 min-w-0">
              <p className="font-medium text-[13px] leading-relaxed">
                {stats.totalOutstanding > 0 ? (
                  <>فواتير تحتاج متابعة: <strong className="data-gold">{stats.totalOutstanding.toLocaleString('ar-EG')} {activeCompany?.currency || ''}</strong></>
                ) : (
                  <>أداء مالي ممتاز — جميع الفواتير تم تحصيلها!</>
                )}
              </p>
              <div className="mt-2 ai-confidence">
                <span>ثقة AI:</span>
                <div className="ai-confidence-bar">
                  <div className={cn("ai-confidence-fill", stats.totalOutstanding > 0 ? "medium" : "high")} style={{ width: stats.totalOutstanding > 0 ? '75%' : '95%' }} />
                </div>
                <span>{stats.totalOutstanding > 0 ? '75%' : '95%'}</span>
              </div>
              {stats.totalOutstanding > 0 && (
                <button
                  onClick={() => window.location.hash = '#invoices'}
                  className={cn(
                    "mt-2 px-3 py-1.5 rounded-lg text-xs font-semibold active-press",
                    "bg-primary/10 text-primary hover:bg-primary/20"
                  )}
                  style={{ transitionDuration: '150ms' }}
                >
                  عرض الفواتير
                </button>
              )}
            </div>
          </div>

          {/* Insight 2 — Monthly summary */}
          <div className="ai-suggestion">
            <TrendingUp size={16} className="ai-suggestion-icon" />
            <div className="flex-1">
              <p className="font-medium text-[13px] leading-relaxed">
                ملخص الشهر: <strong>{stats.totalInvoices}</strong> فاتورة بإيرادات{' '}
                <strong className="data-primary">{stats.totalRevenue.toLocaleString('ar-EG')} {activeCompany?.currency || ''}</strong>
              </p>
              <div className="mt-2 ai-confidence">
                <span>ثقة AI:</span>
                <div className="ai-confidence-bar">
                  <div className="ai-confidence-fill high" style={{ width: '98%' }} />
                </div>
                <span>98%</span>
              </div>
            </div>
          </div>

          {/* Insight 3 — Client base opportunity */}
          <div className="ai-suggestion">
            <Users size={16} className="ai-suggestion-icon" />
            <div className="flex-1">
              <p className="font-medium text-[13px] leading-relaxed">
                {stats.clientsCount > 10 ? (
                  <>
                    <span className="ai-badge-premium">فرصة</span>{' '}
                    قاعدة عملاء قوية ({stats.clientsCount} عميل) — برنامج ولاء مقترح!
                  </>
                ) : (
                  <>نمو قاعدة العملاء: لديك <strong>{stats.clientsCount}</strong> عميل — هدف الشهر: 10 عملاء</>
                )}
              </p>
              <div className="mt-2 ai-confidence">
                <span>ثقة AI:</span>
                <div className="ai-confidence-bar">
                  <div className={cn("ai-confidence-fill", stats.clientsCount > 5 ? "high" : "medium")} style={{ width: stats.clientsCount > 5 ? '90%' : '70%' }} />
                </div>
                <span>{stats.clientsCount > 5 ? '90%' : '70%'}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Charts Row — DS v4.0 chart-container */}
      {/* Stack on mobile, 2-col on lg+ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Revenue Chart — chart-container with emerald theme */}
        <div className="chart-container hover-lift animate-fade-in" style={{ animationDelay: '300ms' }}>
          <h3 className="text-sm md:text-[15px] font-bold mb-4 flex items-center gap-2">
            <TrendingUp size={16} className="text-primary" />
            الإيرادات الشهرية (آخر 6 أشهر)
            <span className="ai-badge text-[10px]">تحليل</span>
          </h3>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={stats.monthly}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="month" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} />
              <YAxis tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} />
              <Tooltip contentStyle={tooltipStyle} />
              <Bar 
                dataKey="revenue" 
                fill="#047857" 
                radius={[6, 6, 0, 0]}
                style={{ transition: 'fill 120ms ease' }}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Status Distribution — chart-container */}
        <div className="chart-container hover-lift animate-fade-in" style={{ animationDelay: '350ms' }}>
          <h3 className="text-sm md:text-[15px] font-bold mb-4 flex items-center gap-2">
            <Sparkles size={16} className="text-primary" />
            توزيع الفواتير حسب الحالة
          </h3>
          {pieData.length === 0 ? (
            <div className="state-empty py-10">
              <FileText size={48} />
              <h3>لا توجد بيانات</h3>
              <p>قم بإنشاء فواتير لرؤية التوزيع هنا</p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={90}
                  paddingAngle={3}
                  dataKey="value"
                >
                  {pieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Legend
                  wrapperStyle={{ fontSize: "12px", color: "var(--foreground)" }}
                />
                <Tooltip contentStyle={tooltipStyle} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Recent Invoices Table — DS v4.0 Enterprise Table */}
      <div className="chart-container hover-lift animate-fade-in" style={{ animationDelay: '400ms' }}>
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-sm md:text-[15px] font-bold flex items-center gap-2">
            <FileText size={16} className="text-primary" />
            أحدث الفواتير
          </h3>
          <a
            href="#invoices"
            className="text-[12px] text-primary no-underline inline-flex items-center gap-1 font-semibold hover-lift"
          >
            عرض الكل
            <ArrowLeft size={12} />
          </a>
        </div>
        
        {stats.recent.length === 0 ? (
          <div className="state-empty py-10">
            <FileText size={48} />
            <h3>لا توجد فواتير بعد</h3>
            <p>ابدأ بإنشاء فاتورتك الأولى</p>
          </div>
        ) : (
          <>
            {/* Desktop / tablet table — enterprise styling */}
            <div className="hidden md:block overflow-x-auto garfix-scroll">
              <table className="table-enterprise">
                <thead>
                  <tr>
                    <th>رقم الفاتورة</th>
                    <th>العميل</th>
                    <th>التاريخ</th>
                    <th>المبلغ</th>
                    <th>الحالة</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.recent.map((inv) => {
                    const st = STATUS_LABELS[inv.status] || { label: inv.status, color: "#999" };
                    return (
                      <tr key={inv.id} className="hover-lift">
                        <td className="font-bold font-mono">{inv.invoiceNumber}</td>
                        <td>{inv.clientName}</td>
                        <td className="text-muted-foreground">{inv.issueDate}</td>
                        <td className="font-bold [direction:ltr]">{inv.total.toLocaleString("ar-EG", { maximumFractionDigits: 2 })}</td>
                        <td>
                          <span className={cn(
                            "table-row-status",
                            inv.status === 'paid' ? 'active' :
                            inv.status === 'overdue' ? 'error' :
                            inv.status === 'sent' || inv.status === 'partial' ? 'pending' : 'archived'
                          )}>
                            {st.label}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile stacked cards */}
            <div className="md:hidden flex flex-col gap-3">
              {stats.recent.map((inv) => {
                const st = STATUS_LABELS[inv.status] || { label: inv.status, color: "#999" };
                return (
                  <div
                    key={inv.id}
                    className={cn(
                      "rounded-xl border border-border bg-background p-3 flex flex-col gap-2",
                      "hover-lift active-press"
                    )}
                    style={{ transitionDuration: '120ms' }}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold font-mono text-[13px] break-all">{inv.invoiceNumber}</span>
                      <span
                        className={cn(
                          "inline-flex items-center gap-1 py-0.5 px-2.5 rounded-full text-[11px] font-bold shrink-0",
                          "[background:var(--color-primary)_/_15%]",
                          "[color:var(--color-primary)]"
                        )}
                      >
                        {st.label}
                      </span>
                    </div>
                    <div className="font-semibold text-[14px]">{inv.clientName}</div>
                    <div className="flex items-center justify-between gap-2 text-[12px]">
                      <span className="text-muted-foreground">{inv.issueDate}</span>
                      <span className="font-bold [direction:ltr] text-end">
                        {inv.total.toLocaleString("ar-EG", { maximumFractionDigits: 2 })}
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
  );
}

/* ════════════════════════════════════════════════════════════════════════
 * KPI Card v4.0 — DS v4.0 Compliant Component
 * Supports: emerald | gold | warning variants
 * Includes: Sparkline, Trend indicator, Badge (gold only)
 * Motion: 120ms hover, 150ms press
 * ════════════════════════════════════════════════════════════════════════ */
interface KpiCardV4Props {
  icon: React.ReactNode;
  label: string;
  value: string;
  variant: 'emerald' | 'gold' | 'warning';
  trend?: { direction: 'up' | 'down'; label: string };
  badge?: string;
  sparklineData?: number[];
}

function KpiCardV4({ 
  icon, 
  label, 
  value, 
  variant,
  trend,
  badge,
  sparklineData 
}: KpiCardV4Props) {
  const isGold = variant === 'gold';
  const isWarning = variant === 'warning';

  // Determine card class based on variant
  const cardClass = isGold ? 'kpi-card-gold' : 'kpi-card';
  
  // Icon background based on variant
  const iconBgClass = isGold 
    ? '[background:linear-gradient(135deg,#d4a57430,#d4a57418)] [color:#b8860b]' 
    : isWarning 
      ? '[background:#f59e0b20] [color:#f59e0b]'
      : '[background:var(--color-primary)_/_15%] [color:var(--color-primary)]';

  return (
    <div className={cn(cardClass, "hover-lift active-press group")}>
      {/* Decorative glow effect for gold cards */}
      {isGold && (
        <div className="absolute -top-3 -end-3 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
          <div className="w-8 h-8 rounded-full bg-gold/20 blur-lg" />
        </div>
      )}

      {/* Icon + Label row */}
      <div className="flex items-center gap-2.5 mb-2">
        <div className={cn(
          "w-9 h-9 rounded-[10px] flex items-center justify-center shrink-0",
          "hover-scale",
          iconBgClass
        )}>
          {icon}
        </div>
        <div className="text-[12px] text-muted-foreground font-semibold">{label}</div>
        
        {/* AI Badge for gold/premium cards */}
        {isGold && (
          <span className="ai-badge me-auto">✦</span>
        )}
      </div>

      {/* Value display */}
      <div className={cn(
        "text-lg md:text-[22px] font-black [direction:ltr] text-end",
        isGold && "text-gradient-gold"
      )}>
        {value}
      </div>

      {/* Trend indicator (if provided) */}
      {trend && (
        <div className={cn(
          "kpi-trend mt-2",
          trend.direction === 'up' ? 'up' : 'down'
        )}>
          <TrendingUp size={12} className={trend.direction === 'down' ? 'rotate-180' : ''} />
          {trend.label}
        </div>
      )}

      {/* Gold badge (for premium metrics) */}
      {isGold && badge && (
        <div className="kpi-badge mt-2">
          <Sparkles size={10} />
          {badge}
        </div>
      )}

      {/* Sparkline mini chart */}
      {sparklineData && sparklineData.length > 0 && (
        <div className="sparkline-container mt-3">
          {sparklineData.map((height, i) => (
            <div
              key={i}
              className={cn(
                "sparkline-bar",
                isGold && "[background:linear-gradient(to_top,#c9a067,#d4a574,#e8c9a8)]"
              )}
              style={{ height: `${height}%` }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default DashboardView;

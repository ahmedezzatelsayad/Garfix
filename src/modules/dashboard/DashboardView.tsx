"use client";

import { useEffect, useState, useCallback } from "react";
import { useBrand } from "@/context/BrandContext";
import { useDashboardStats } from "@/hooks/queries/dashboard";
import {
  FileText, Users, DollarSign, TrendingUp, AlertCircle, ArrowLeft,
  CheckCircle2,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from "recharts";
import { cn } from "@/lib/utils";

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

export function DashboardView() {
  const { activeCompany } = useBrand();
  const { data: statsData, isLoading: loading, error: statsError } = useDashboardStats(activeCompany?.slug || "");
  const stats = statsData?.stats ?? null;

  if (loading) {
    return (
      <div className="p-8 md:p-12 text-center text-muted-foreground">
        جارٍ تحميل لوحة التحكم…
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="p-8 md:p-12 text-center text-muted-foreground">
        تعذّر تحميل البيانات. حاول مرة أخرى.
      </div>
    );
  }

  const pieData = Object.entries(stats.byStatus).map(([k, v]) => ({
    name: STATUS_LABELS[k]?.label || k,
    value: v,
    color: STATUS_LABELS[k]?.color || "#999",
  }));

  return (
    <div className="flex flex-col gap-5">
      {/* Page title */}
      <div>
        <h1 className="text-xl md:text-2xl font-extrabold mb-1">
          {activeCompany ? `لوحة تحكم — ${activeCompany.nameAr || activeCompany.name}` : "لوحة التحكم العامة"}
        </h1>
        <p className="text-[13px] text-muted-foreground">
          نظرة شاملة على أداء أعمالك
        </p>
      </div>

      {/* KPI cards — stack 1-col mobile, 2-col sm, 3-col lg, 5-col xl */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
        <KpiCard
          icon={<FileText size={20} />}
          label="إجمالي الفواتير"
          value={stats.totalInvoices.toLocaleString("ar-EG")}
          color="#7c3aed"
        />
        <KpiCard
          icon={<DollarSign size={20} />}
          label="إجمالي الإيرادات"
          value={`${stats.totalRevenue.toLocaleString("ar-EG", { maximumFractionDigits: 2 })} ${activeCompany?.currency || ""}`}
          color="#10b981"
        />
        <KpiCard
          icon={<CheckCircle2 size={20} />}
          label="المحصّل"
          value={`${stats.totalPaid.toLocaleString("ar-EG", { maximumFractionDigits: 2 })} ${activeCompany?.currency || ""}`}
          color="#3b82f6"
        />
        <KpiCard
          icon={<AlertCircle size={20} />}
          label="المستحقات"
          value={`${stats.totalOutstanding.toLocaleString("ar-EG", { maximumFractionDigits: 2 })} ${activeCompany?.currency || ""}`}
          color="#ef4444"
        />
        <KpiCard
          icon={<Users size={20} />}
          label="العملاء"
          value={stats.clientsCount.toLocaleString("ar-EG")}
          color="#f59e0b"
        />
      </div>

      {/* Charts row — stack on mobile, 2-col on lg+ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Revenue chart */}
        <div className="p-3 md:p-5 rounded-[14px] bg-card border border-border">
          <h3 className="text-sm md:text-[15px] font-bold mb-4 flex items-center">
            <TrendingUp size={16} className="ms-1.5 text-primary align-middle" />
            الإيرادات الشهرية (آخر 6 أشهر)
          </h3>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={stats.monthly}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="month" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} />
              <YAxis tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} />
              <Tooltip contentStyle={tooltipStyle} />
              <Bar dataKey="revenue" fill="var(--primary)" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Status distribution */}
        <div className="p-3 md:p-5 rounded-[14px] bg-card border border-border">
          <h3 className="text-sm md:text-[15px] font-bold mb-4">
            توزيع الفواتير حسب الحالة
          </h3>
          {pieData.length === 0 ? (
            <div className="p-6 md:p-10 text-center text-muted-foreground">
              لا توجد بيانات
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

      {/* Recent invoices — table on md+, stacked cards on mobile */}
      <div className="p-3 md:p-5 rounded-[14px] bg-card border border-border">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-sm md:text-[15px] font-bold">أحدث الفواتير</h3>
          <a
            href="#invoices"
            className="text-[12px] text-primary no-underline inline-flex items-center gap-1 font-semibold"
          >
            عرض الكل
            <ArrowLeft size={12} />
          </a>
        </div>
        {stats.recent.length === 0 ? (
          <div className="p-6 md:p-10 text-center text-muted-foreground">
            <FileText size={32} className="opacity-30 mb-2 mx-auto" />
            <div>لا توجد فواتير بعد</div>
          </div>
        ) : (
          <>
            {/* Desktop / tablet table */}
            <div className="hidden md:block overflow-x-auto garfix-scroll">
              <table className="w-full border-collapse text-[13px]">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-start py-2.5 px-2 font-semibold text-muted-foreground text-[11px]">رقم الفاتورة</th>
                    <th className="text-start py-2.5 px-2 font-semibold text-muted-foreground text-[11px]">العميل</th>
                    <th className="text-start py-2.5 px-2 font-semibold text-muted-foreground text-[11px]">التاريخ</th>
                    <th className="text-start py-2.5 px-2 font-semibold text-muted-foreground text-[11px]">المبلغ</th>
                    <th className="text-start py-2.5 px-2 font-semibold text-muted-foreground text-[11px]">الحالة</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.recent.map((inv) => {
                    const st = STATUS_LABELS[inv.status] || { label: inv.status, color: "#999" };
                    return (
                      <tr key={inv.id} className="border-b border-border">
                        <td className="py-2.5 px-2 font-bold font-mono">{inv.invoiceNumber}</td>
                        <td className="py-2.5 px-2">{inv.clientName}</td>
                        <td className="py-2.5 px-2 text-muted-foreground">{inv.issueDate}</td>
                        <td className="py-2.5 px-2 font-bold">{inv.total.toLocaleString("ar-EG", { maximumFractionDigits: 2 })}</td>
                        <td className="py-2.5 px-2">
                          <span
                            className={`inline-flex items-center gap-1 py-0.5 px-2.5 rounded-[12px] text-[11px] font-bold [background:${st.color}20] [color:${st.color}]`}
                          >
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
                    className="rounded-[12px] border border-border bg-background p-3 flex flex-col gap-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold font-mono text-[13px] break-all">{inv.invoiceNumber}</span>
                      <span
                        className={`inline-flex items-center gap-1 py-0.5 px-2.5 rounded-[12px] text-[11px] font-bold shrink-0 [background:${st.color}20] [color:${st.color}]`}
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

function KpiCard({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: string; color: string }) {
  return (
    <div className="relative overflow-hidden p-3 md:p-[18px] rounded-[14px] bg-card border border-border flex flex-col gap-2">
      {/* Decorative color blob — dynamic color, kept inline */}
      <div
        className={`absolute -top-5 -start-5 w-20 h-20 rounded-full opacity-[0.08] [background:${color}]`}
      />
      <div className="flex items-center gap-2">
        <div
          className={`w-9 h-9 rounded-[10px] flex items-center justify-center shrink-0 [background:${color}20] [color:${color}]`}
        >
          {icon}
        </div>
        <div className="text-[12px] text-muted-foreground font-semibold">{label}</div>
      </div>
      <div className="text-lg md:text-[22px] font-black [direction:ltr] text-end">{value}</div>
    </div>
  );
}

export default DashboardView;

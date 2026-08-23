"use client";

import { useState, useCallback } from "react";
import dynamic from "next/dynamic";
import {
  usePlatformStats, usePlatformTenants, usePlatformAnnouncements,
  usePlatformTickets, usePlatformAudit, useQueueFailures,
  useClearQueueFailures, useDeletePlatformTenant, useCreateAnnouncement,
} from "@/hooks/queries";
import { useInventoryMovementsFiltered, type InventoryMovement } from "@/hooks/queries";
import { toast } from "sonner";
import {
  Shield, Megaphone, Ticket as TicketIcon, BarChart3, Building2, Plus, X, Sparkles,
  AlertTriangle, Trash2, Eye, Activity, ListChecks,
  FileText, Plug, Database, Network, Gauge, HardDriveDownload,
} from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from "recharts";
import { AiProviderSettings } from "./AiProviderSettings";
import { LazyReviewQueueModal } from "@/modules/common/LazyModals";
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogFooter,
  AlertDialogTitle, AlertDialogDescription, AlertDialogAction, AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import { IconBtn, KpiCard } from "./shared-helpers";
import { TenantDetailDrawer } from "./TenantDetailDrawer";
import { TicketDetailDrawer } from "./TicketDetailDrawer";
import { FeatureFlagsTab } from "./FeatureFlagsTab";
import { ReviewQueueTab } from "./ReviewQueueTab";
import { paginate } from "@/lib/utils";
import type { Stats, Tab } from "./types";

/* ── Lazy-loaded admin tabs (only fetched when the user clicks them) ── */
const AiOrchestrationTab = dynamic(() => import("./AiOrchestrationTab").then(m => ({ default: m.AiOrchestrationTab })));
const AiUsageTab = dynamic(() => import("./AiUsageTab").then(m => ({ default: m.AiUsageTab })));
const LandingContentTab = dynamic(() => import("./LandingContentTab").then(m => ({ default: m.LandingContentTab })));
const IntegrationsTab = dynamic(() => import("./IntegrationsTab").then(m => ({ default: m.IntegrationsTab })));
const RetentionCleanupTab = dynamic(() => import("./RetentionCleanupTab").then(m => ({ default: m.RetentionCleanupTab })));
const PlansTab = dynamic(() => import("./PlansTab").then(m => ({ default: m.PlansTab })));
const BackupsTab = dynamic(() => import("./BackupsTab").then(m => ({ default: m.BackupsTab })));
// Wire the existing-but-orphan WebhookManagementView (631 lines, full CRUD +
// delivery history + retry + test-fire UI). Was unreachable from any tab
// before this commit.
const WebhookManagementView = dynamic(() => import("./WebhookManagementView").then(m => ({ default: m.WebhookManagementView })));

/* ── Module-level pagination button ───────────────────────────────────────
 * Defined outside the parent component so React Compiler doesn't remount
 * it on every render (which would lose focus / state). */
function AdminPageBtn({ disabled, children, ...props }: { children: React.ReactNode } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button className={`px-3 py-1.5 rounded-md border border-[var(--border)] font-inherit text-xs font-bold ${disabled ? "bg-transparent text-[var(--muted-foreground)] cursor-not-allowed opacity-50" : "bg-[var(--card)] text-[var(--foreground)] cursor-pointer"}`} disabled={disabled} {...props}>{children}</button>;
}

export function PlatformAdminPanel() {
  const [tab, setTab] = useState<Tab>("stats");
  // TanStack Query hooks
  const statsQuery = usePlatformStats();
  const tenantsQuery = usePlatformTenants();
  const announcementsQuery = usePlatformAnnouncements();
  const ticketsQuery = usePlatformTickets();
  const auditQuery = usePlatformAudit();
  const queueFailuresQuery = useQueueFailures();
  const clearQueueFailuresMutation = useClearQueueFailures();
  const deleteTenantMutation = useDeletePlatformTenant();

  const stats = (statsQuery.data ?? null) as  Stats | null;
  // Each hook now returns its proper wrapper shape — unwrap to the array.
  // Previously all hooks were typed as bare arrays but the APIs return
  // { tenants: [...] } / { announcements: [...] } / etc, so the casts lied
  // and `tenants.map(...)` threw TypeError when data was present.
  const tenants = tenantsQuery.data?.tenants ?? [];
  const announcements = announcementsQuery.data?.announcements ?? [];
  const tickets = ticketsQuery.data?.tickets ?? [];
  const audit = auditQuery.data?.logs ?? [];
  const queueFailures = queueFailuresQuery.data?.failures ?? [];
  const loading = statsQuery.isLoading || tenantsQuery.isLoading;

  const [showAnnouncementForm, setShowAnnouncementForm] = useState(false);
  const [tenantsPage, setTenantsPage] = useState(1);
  const [auditPage, setAuditPage] = useState(1);
  const adminPageSize = 10;

  // Founder-panel feature state (GATE 4):
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [selectedTenantSlug, setSelectedTenantSlug] = useState<string | null>(null);
  const [stockLedgerSlug, setStockLedgerSlug] = useState<string>("");
  // Stock-ledger filter state (raw inputs) — applied on explicit button click only.
  const [stockLedgerProductName, setStockLedgerProductName] = useState<string>("");
  const [stockLedgerFrom, setStockLedgerFrom] = useState<string>("");
  const [stockLedgerTo, setStockLedgerTo] = useState<string>("");
  // Applied filters for TanStack Query — only updated on button click.
  const [stockLedgerApplied, setStockLedgerApplied] = useState<{ companySlug: string; productName?: string; from?: string; to?: string } | null>(null);
  const stockMovementsQuery = useInventoryMovementsFiltered(stockLedgerApplied ?? { companySlug: "" });
  const stockMovements = stockMovementsQuery.data?.movements ?? [];
  const [reviewQueueSlug, setReviewQueueSlug] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<typeof tenants[number] | null>(null);
  const [deleting, setDeleting] = useState(false);

  // TanStack Query replaces load(), loadQueueFailures(), loadStockMovements()
  // and the useEffect hooks that called them. Data is fetched automatically
  // on mount and managed by the query cache. The queue-failures query is
  // always enabled (but lazy-loaded by TanStack's staleTime). The stock-ledger
  // query uses applied filters that only update on explicit button clicks.

  const applyStockLedgerFilters = useCallback(() => {
    if (stockLedgerSlug) {
      setStockLedgerApplied({
        companySlug: stockLedgerSlug,
        productName: stockLedgerProductName || undefined,
        from: stockLedgerFrom || undefined,
        to: stockLedgerTo || undefined,
      });
    }
  }, [stockLedgerSlug, stockLedgerProductName, stockLedgerFrom, stockLedgerTo]);

  const tabs: Array<{ key: Tab; label: string; icon: React.ReactNode }> = [
    { key: "stats", label: "الإحصائيات", icon: <BarChart3 size={14} /> },
    { key: "tenants", label: "المستأجرون", icon: <Building2 size={14} /> },
    { key: "announcements", label: "الإعلانات", icon: <Megaphone size={14} /> },
    { key: "tickets", label: "التذاكر", icon: <TicketIcon size={14} /> },
    { key: "audit", label: "سجل التدقيق", icon: <Shield size={14} /> },
    { key: "queue-failures", label: "أعطال الطوابير", icon: <AlertTriangle size={14} /> },
    { key: "stock-ledger", label: "دفتر حركة المخزون", icon: <ListChecks size={14} /> },
    { key: "review-queue", label: "طابور المراجعة", icon: <ListChecks size={14} /> },
    { key: "feature-flags", label: "ميزات المنصة", icon: <Sparkles size={14} /> },
    { key: "ai-usage", label: "استهلاك AI", icon: <Activity size={14} /> },
    { key: "ai-orchestration", label: "تنسيق AI", icon: <Network size={14} /> },
    { key: "ai-settings", label: "إعدادات AI", icon: <Sparkles size={14} /> },
    { key: "landing-content", label: "محتوى الواجهة", icon: <FileText size={14} /> },
    { key: "integrations", label: "التكاملات", icon: <Plug size={14} /> },
    { key: "retention-cleanup", label: "التنظيف الدوري", icon: <Database size={14} /> },
    { key: "plans", label: "الباقات", icon: <Gauge size={14} /> },
    { key: "backups", label: "النسخ الاحتياطي", icon: <HardDriveDownload size={14} /> },
    { key: "webhooks", label: "Webhooks", icon: <Plug size={14} /> },
  ];

  const pieData = stats ? Object.entries(stats.byPlan).map(([k, v], i) => ({
    name: k, value: Number(v) || 0,
    color: ["#047857", "#10b981", "#f59e0b", "#3b82f6", "#ef4444", "#ec4899", "#14b8a6"][i % 7],
  })).filter((d) => d.value > 0) : [];
  const pieTotal = pieData.reduce((s, d) => s + d.value, 0);

  const tenantsTotalPages = Math.max(1, Math.ceil(tenants.length / adminPageSize));
  const tenantsSafePage = Math.min(tenantsPage, tenantsTotalPages);
  const currentPageTenants = paginate(tenants, tenantsSafePage, adminPageSize);

  const auditTotalPages = Math.max(1, Math.ceil(audit.length / adminPageSize));
  const auditSafePage = Math.min(auditPage, auditTotalPages);
  const currentPageAudit = paginate(audit, auditSafePage, adminPageSize);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl md:text-2xl font-extrabold flex items-center gap-2"><Shield size={20} /> لوحة المؤسس</h1>
        <p className="text-[13px] text-[var(--muted-foreground)]">إدارة شاملة للمنصة</p>
      </div>
      <div role="tablist" className="garfix-scroll flex gap-1.5 flex-wrap">
        {tabs.map((t) => (
          <button key={t.key} role="tab" aria-selected={tab === t.key} id={`tab-${t.key}`} onClick={() => setTab(t.key)} className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-[10px] border border-[var(--border)] font-inherit text-xs font-bold cursor-pointer whitespace-nowrap ${tab === t.key ? "bg-[var(--primary)] text-[var(--primary-foreground)]" : "bg-[var(--card)] text-[var(--muted-foreground)]"}`}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {loading ? <div className="p-6 md:p-12 text-center text-[var(--muted-foreground)]">جارٍ التحميل…</div> : (
        <div role="tabpanel" aria-labelledby={`tab-${tab}`}>
          {tab === "stats" && !stats && (
            <div className="p-6 md:p-12 text-center text-[var(--muted-foreground)]">تعذّر تحميل الإحصائيات. تحقّق من صلاحيات المؤسس.</div>
          )}
          {tab === "stats" && stats && (
            <>
              <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-3">
                <KpiCard label="إجمالي المستأجرين" value={stats.tenantsCount} color="#047857" />
                <KpiCard label="المستخدمون" value={stats.usersCount} color="#10b981" />
                <KpiCard label="الفواتير" value={stats.invoicesCount} color="#3b82f6" />
                <KpiCard label="تذاكر مفتوحة" value={stats.ticketsOpen} color="#f59e0b" />
                <KpiCard label="إجمالي الإيرادات" value={stats.totalRevenue.toLocaleString("ar-EG", { maximumFractionDigits: 0 })} color="#ef4444" />
              </div>
              <div className="grid grid-cols-[repeat(auto-fit,minmax(320px,1fr))] gap-4">
                <div className="bg-[var(--card)] rounded-2xl border border-[var(--border)] p-5">
                  <h3 className="text-sm font-bold mb-3">نمو المستأجرين (6 أشهر)</h3>
                  {stats.monthlyGrowth && stats.monthlyGrowth.length > 0 ? (
                    <ResponsiveContainer width="100%" height={220}>
                      <BarChart data={stats.monthlyGrowth}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                        <XAxis dataKey="month" tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} />
                        <YAxis tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} allowDecimals={false} />
                        <Tooltip contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: "8px" }} />
                        <Bar dataKey="tenants" fill="var(--primary)" radius={[6, 6, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-[220px] flex items-center justify-center text-[var(--muted-foreground)] text-xs">لا توجد بيانات</div>
                  )}
                </div>
                <div className="bg-[var(--card)] rounded-2xl border border-[var(--border)] p-5">
                  <h3 className="text-sm font-bold mb-3">توزيع الباقات</h3>
                  {pieData.length > 0 && pieTotal > 0 ? (
                    <ResponsiveContainer width="100%" height={220}>
                      <PieChart>
                        <Pie data={pieData} cx="50%" cy="50%" innerRadius={pieData.length === 1 ? 0 : 50} outerRadius={80} dataKey="value" label={({ name, percent }: { name?: string; percent?: number }) => `${name ?? ""} ${percent !== undefined ? Math.round(percent * 100) + "%" : ""}`}>
                          {pieData.map((d, i) => <Cell key={i} fill={d.color} />)}
                        </Pie>
                        <Legend wrapperStyle={{ fontSize: "11px" }} />
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-[220px] flex items-center justify-center text-[var(--muted-foreground)] text-xs">لا توجد بيانات</div>
                  )}
                </div>
              </div>
            </>
          )}
          {tab === "tenants" && (
            <div className="bg-[var(--card)] rounded-2xl border border-[var(--border)] overflow-hidden">
              {/* Part 3: Desktop table (hidden on mobile) */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full [border-collapse:collapse]">
                  <thead><tr className="bg-[var(--muted)]">
                    <th scope="col" className="text-right px-3 py-2.5 text-[11px] text-[var(--muted-foreground)] font-bold">الشركة</th><th scope="col" className="text-right px-3 py-2.5 text-[11px] text-[var(--muted-foreground)] font-bold">الباقة</th><th scope="col" className="text-right px-3 py-2.5 text-[11px] text-[var(--muted-foreground)] font-bold">الفواتير</th>
                    <th scope="col" className="text-right px-3 py-2.5 text-[11px] text-[var(--muted-foreground)] font-bold">المستخدمون</th><th scope="col" className="text-right px-3 py-2.5 text-[11px] text-[var(--muted-foreground)] font-bold">العملاء</th><th scope="col" className="text-right px-3 py-2.5 text-[11px] text-[var(--muted-foreground)] font-bold">الإيراد</th>
                    <th scope="col" className="text-right px-3 py-2.5 text-[11px] text-[var(--muted-foreground)] font-bold">استهلاك الباقة</th>
                    <th scope="col" className="text-right px-3 py-2.5 text-[11px] text-[var(--muted-foreground)] font-bold">إجراءات</th>
                  </tr></thead>
                  <tbody>
                    {tenants.length === 0 ? <tr><td colSpan={8} className="px-3 py-2.5 text-[13px] text-center py-8 text-[var(--muted-foreground)]">لا توجد مستأجرون</td></tr> :
                      currentPageTenants.map((t) => (
                        <tr className="border-b border-b-[var(--border)]" key={t.id}>
                          <td className="px-3 py-2.5 text-[13px] font-bold">{t.emoji} {t.nameAr || t.name}</td>
                          <td className="px-3 py-2.5 text-[13px]">{t.plan}</td>
                          <td className="px-3 py-2.5 text-[13px]">{t.stats.invoices}</td>
                          <td className="px-3 py-2.5 text-[13px]">{t.stats.users}</td>
                          <td className="px-3 py-2.5 text-[13px]">{t.stats.clients}</td>
                          <td className="px-3 py-2.5 text-[13px] [direction:ltr] text-right font-bold">{t.stats.revenue.toLocaleString("ar-EG", { maximumFractionDigits: 0 })}</td>
                          <td className="px-3 py-2.5 text-[13px]">
                            {/* P1.8 fix: usage-vs-plan visualization. */}
                            {t.planLimits ? (
                              <div className="flex flex-col gap-1 min-w-[120px]">
                                <UtilizationBar
                                  label="فواتير"
                                  current={t.stats.invoices}
                                  max={t.planLimits.maxInvoicesPerMonth}
                                  pct={t.planLimits.invoiceUtilization}
                                />
                                <UtilizationBar
                                  label="مستخدمون"
                                  current={t.stats.users}
                                  max={t.planLimits.maxUsers}
                                  pct={t.planLimits.userUtilization}
                                />
                              </div>
                            ) : (
                              <span className="text-[11px] text-[var(--muted-foreground)]">—</span>
                            )}
                          </td>
                          <td className="px-3 py-2.5 text-[13px]">
                            <div className="flex gap-1">
                              <IconBtn color="#3b82f6" onClick={() => setSelectedTenantSlug(t.slug)} title="عرض الدعم (Support View)" aria-label="عرض">
                                <Eye size={14} />
                              </IconBtn>
                              <IconBtn color="#f59e0b" onClick={() => setDeleteTarget(t)} title="حذف مبدئي (إيقاف مؤقت)" aria-label="حذف">
                                <Trash2 size={14} />
                              </IconBtn>
                            </div>
                          </td>
                        </tr>
                      ))
                    }
                  </tbody>
                </table>
              </div>
              {/* Part 3: Mobile card list (hidden on desktop) */}
              <div className="md:hidden flex flex-col gap-2 p-3">
                {tenants.length === 0 ? (
                  <div className="text-center p-4 md:p-8 text-muted-foreground text-sm">لا توجد مستأجرون</div>
                ) : (
                  currentPageTenants.map((t) => (
                    <div key={t.id} className="rounded-xl border border-border p-3 bg-background">
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-xl flex-shrink-0">{t.emoji}</span>
                          <div className="min-w-0">
                            <div className="font-bold text-sm truncate">{t.nameAr || t.name}</div>
                            <div className="text-xs text-muted-foreground">{t.plan}</div>
                          </div>
                        </div>
                        <div className="flex gap-1 flex-shrink-0">
                          <button
                            onClick={() => setSelectedTenantSlug(t.slug)}
                            title="عرض الدعم"
                            aria-label="عرض"
                            className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg border border-border text-blue-500 cursor-pointer"
                          >
                            <Eye size={16} />
                          </button>
                          <button
                            onClick={() => setDeleteTarget(t)}
                            title="حذف"
                            aria-label="حذف"
                            className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg border border-border text-amber-500 cursor-pointer"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-center text-xs border-t border-border pt-2">
                        <div>
                          <div className="text-muted-foreground">فواتير</div>
                          <div className="font-bold">{t.stats.invoices}</div>
                        </div>
                        <div>
                          <div className="text-muted-foreground">مستخدمون</div>
                          <div className="font-bold">{t.stats.users}</div>
                        </div>
                        <div>
                          <div className="text-muted-foreground">إيراد</div>
                          <div className="font-bold [direction:ltr]">{t.stats.revenue.toLocaleString("ar-EG", { maximumFractionDigits: 0 })}</div>
                        </div>
                      </div>
                      {t.planLimits && (
                        <div className="flex flex-col gap-1 mt-2">
                          <UtilizationBar label="فواتير" current={t.stats.invoices} max={t.planLimits.maxInvoicesPerMonth} pct={t.planLimits.invoiceUtilization} />
                          <UtilizationBar label="مستخدمون" current={t.stats.users} max={t.planLimits.maxUsers} pct={t.planLimits.userUtilization} />
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
              {tenants.length > adminPageSize && (
                <div className="flex justify-between items-center px-4 py-3 border-t border-t-[var(--border)] flex-wrap gap-2">
                  <span className="text-xs text-[var(--muted-foreground)]">صفحة {tenantsSafePage} من {tenantsTotalPages} ({tenants.length} مستأجر)</span>
                  <div className="flex items-center gap-1.5">
                    <AdminPageBtn onClick={() => setTenantsPage((p) => Math.max(1, p - 1))} disabled={tenantsSafePage === 1}>السابق</AdminPageBtn>
                    <AdminPageBtn onClick={() => setTenantsPage((p) => Math.min(tenantsTotalPages, p + 1))} disabled={tenantsSafePage === tenantsTotalPages}>التالي</AdminPageBtn>
                  </div>
                </div>
              )}
              {selectedTenantSlug && (
                <TenantDetailDrawer
                  slug={selectedTenantSlug}
                  onClose={() => setSelectedTenantSlug(null)}
                  onOpenReviewQueue={(slug) => {
                    setSelectedTenantSlug(null);
                    setReviewQueueSlug(slug);
                  }}
                />
              )}
            </div>
          )}
          {tab === "announcements" && (
            <div className="bg-[var(--card)] rounded-2xl border border-[var(--border)] overflow-hidden">
              <div className="px-4 py-3 border-b border-b-[var(--border)] flex justify-between items-center">
                <h3 className="text-sm font-bold">الإعلانات ({announcements.length})</h3>
                <button onClick={() => setShowAnnouncementForm(true)} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[var(--primary)] text-[var(--primary-foreground)] border-none font-inherit text-[11px] font-bold cursor-pointer"><Plus size={12} /> إعلان جديد</button>
              </div>
              {showAnnouncementForm && <AnnouncementForm onClose={() => setShowAnnouncementForm(false)} onSaved={() => setShowAnnouncementForm(false)} />}
              <div className="garfix-scroll overflow-x-auto">
                <table className="w-full [border-collapse:collapse]">
                  <thead><tr className="bg-[var(--muted)]">
                    <th scope="col" className="text-right px-3 py-2.5 text-[11px] text-[var(--muted-foreground)] font-bold">العنوان</th><th scope="col" className="text-right px-3 py-2.5 text-[11px] text-[var(--muted-foreground)] font-bold">النوع</th><th scope="col" className="text-right px-3 py-2.5 text-[11px] text-[var(--muted-foreground)] font-bold">الحالة</th><th scope="col" className="text-right px-3 py-2.5 text-[11px] text-[var(--muted-foreground)] font-bold">التاريخ</th>
                  </tr></thead>
                  <tbody>
                    {announcements.length === 0 ? <tr><td colSpan={4} className="px-3 py-2.5 text-[13px] text-center py-8 text-[var(--muted-foreground)]">لا توجد إعلانات</td></tr> :
                      announcements.map((a) => (
                        <tr className="border-b border-b-[var(--border)]" key={a.id}>
                          <td className="px-3 py-2.5 text-[13px] font-bold">{a.title}</td>
                          <td className="px-3 py-2.5 text-[13px]">{a.type}</td>
                          <td className="px-3 py-2.5 text-[13px]"><StatusBadge active={a.isActive} /></td>
                          <td className="px-3 py-2.5 text-[13px]">{new Date(a.createdAt).toLocaleDateString("ar-EG")}</td>
                        </tr>
                      ))
                    }
                  </tbody>
                </table>
              </div>
            </div>
          )}
          {tab === "tickets" && (
            <div className="bg-[var(--card)] rounded-2xl border border-[var(--border)] overflow-hidden">
              <div className="garfix-scroll overflow-x-auto">
                <table className="w-full [border-collapse:collapse]">
                  <thead><tr className="bg-[var(--muted)]">
                    <th scope="col" className="text-right px-3 py-2.5 text-[11px] text-[var(--muted-foreground)] font-bold">المستخدم</th><th scope="col" className="text-right px-3 py-2.5 text-[11px] text-[var(--muted-foreground)] font-bold">الموضوع</th><th scope="col" className="text-right px-3 py-2.5 text-[11px] text-[var(--muted-foreground)] font-bold">الأولوية</th>
                    <th scope="col" className="text-right px-3 py-2.5 text-[11px] text-[var(--muted-foreground)] font-bold">الحالة</th><th scope="col" className="text-right px-3 py-2.5 text-[11px] text-[var(--muted-foreground)] font-bold">التاريخ</th><th scope="col" className="text-right px-3 py-2.5 text-[11px] text-[var(--muted-foreground)] font-bold">إجراء</th>
                  </tr></thead>
                  <tbody>
                    {tickets.length === 0 ? <tr><td colSpan={6} className="px-3 py-2.5 text-[13px] text-center py-8 text-[var(--muted-foreground)]">لا توجد تذاكر</td></tr> :
                      tickets.map((t) => (
                        <tr className="border-b border-b-[var(--border)]" key={t.id}>
                          <td className="px-3 py-2.5 text-[13px]">{t.userEmail}</td>
                          <td className="px-3 py-2.5 text-[13px] font-bold">{t.subject}</td>
                          <td className="px-3 py-2.5 text-[13px]">{t.priority}</td>
                          <td className="px-3 py-2.5 text-[13px]"><TicketStatusBadge status={t.status} /></td>
                          <td className="px-3 py-2.5 text-[13px]">{new Date(t.createdAt).toLocaleDateString("ar-EG")}</td>
                          <td className="px-3 py-2.5 text-[13px]">
                            <IconBtn color="#3b82f6" onClick={() => setSelectedTicketId(String(t.id))} title="فتح التذكرة" aria-label="فتح التذكرة">
                              <Eye size={14} />
                            </IconBtn>
                          </td>
                        </tr>
                      ))
                    }
                  </tbody>
                </table>
              </div>
              {selectedTicketId && (
                <TicketDetailDrawer
                  ticketId={selectedTicketId}
                  tickets={tickets}
                  onClose={() => setSelectedTicketId(null)}
                  onUpdated={() => { /* TanStack auto-invalidates */ }}
                />
              )}
            </div>
          )}
          {tab === "audit" && (
            <div className="bg-[var(--card)] rounded-2xl border border-[var(--border)] overflow-hidden">
              <div className="garfix-scroll overflow-x-auto">
                <table className="w-full [border-collapse:collapse]">
                  <thead><tr className="bg-[var(--muted)]">
                    <th scope="col" className="text-right px-3 py-2.5 text-[11px] text-[var(--muted-foreground)] font-bold">الوقت</th><th scope="col" className="text-right px-3 py-2.5 text-[11px] text-[var(--muted-foreground)] font-bold">المدير</th><th scope="col" className="text-right px-3 py-2.5 text-[11px] text-[var(--muted-foreground)] font-bold">الإجراء</th>
                    <th scope="col" className="text-right px-3 py-2.5 text-[11px] text-[var(--muted-foreground)] font-bold">النوع</th><th scope="col" className="text-right px-3 py-2.5 text-[11px] text-[var(--muted-foreground)] font-bold">المعرّف</th>
                  </tr></thead>
                  <tbody>
                    {audit.length === 0 ? <tr><td colSpan={5} className="px-3 py-2.5 text-[13px] text-center py-8 text-[var(--muted-foreground)]">لا توجد سجلات</td></tr> :
                      currentPageAudit.map((a) => (
                        <tr className="border-b border-b-[var(--border)]" key={a.id}>
                          <td className="px-3 py-2.5 text-[13px]">{new Date(a.createdAt).toLocaleString("ar-EG")}</td>
                          <td className="px-3 py-2.5 text-[13px] [direction:ltr] text-right">{a.adminEmail}</td>
                          <td className="px-3 py-2.5 text-[13px] font-bold">{a.action}</td>
                          <td className="px-3 py-2.5 text-[13px]">{a.targetType || "—"}</td>
                          <td className="px-3 py-2.5 text-[13px] font-mono">{a.targetId || "—"}</td>
                        </tr>
                      ))
                    }
                  </tbody>
                </table>
              </div>
              {audit.length > adminPageSize && (
                <div className="flex justify-between items-center px-4 py-3 border-t border-t-[var(--border)] flex-wrap gap-2">
                  <span className="text-xs text-[var(--muted-foreground)]">صفحة {auditSafePage} من {auditTotalPages} ({audit.length} سجل)</span>
                  <div className="flex items-center gap-1.5">
                    <AdminPageBtn onClick={() => setAuditPage((p) => Math.max(1, p - 1))} disabled={auditSafePage === 1}>السابق</AdminPageBtn>
                    <AdminPageBtn onClick={() => setAuditPage((p) => Math.min(auditTotalPages, p + 1))} disabled={auditSafePage === auditTotalPages}>التالي</AdminPageBtn>
                  </div>
                </div>
              )}
            </div>
          )}
          {tab === "queue-failures" && (
            <div className="bg-[var(--card)] rounded-2xl border border-[var(--border)] overflow-hidden">
              <div className="px-4 py-3 border-b border-b-[var(--border)] flex justify-between items-center flex-wrap gap-2">
                <h3 className="text-sm font-bold flex items-center gap-2">
                  <AlertTriangle className="text-amber-500" size={16} />
                  أعطال الطوابير ({queueFailures.length})
                </h3>
                <div className="flex gap-2">
                  <IconBtn color="#3b82f6" onClick={() => queueFailuresQuery.refetch()} aria-label="تحديث الطوابير"><Activity size={14} /> تحديث</IconBtn>
                  {queueFailures.length > 0 && (
                    <IconBtn color="#ef4444" aria-label="مسح" onClick={() => {
                        if (!confirm("مسح سجل الأعطال؟")) return;
                        clearQueueFailuresMutation.mutate(undefined, {
                          onSuccess: () => { toast.success("تم مسح السجل"); },
                        });
                      }}
                    >
                      <Trash2 size={14} /> مسح
                    </IconBtn>
                  )}
                </div>
              </div>
              {queueFailures.length === 0 ? (
                <div className="p-6 md:p-12 text-center text-[var(--muted-foreground)]">
                  ✅ لا توجد أعطال في الطوابير — جميع المهام تتم بنجاح.
                </div>
              ) : (
                <div className="garfix-scroll overflow-x-auto">
                  <table className="w-full [border-collapse:collapse]">
                    <thead><tr className="bg-[var(--muted)]">
                      <th scope="col" className="text-right px-3 py-2.5 text-[11px] text-[var(--muted-foreground)] font-bold">الطابور</th><th scope="col" className="text-right px-3 py-2.5 text-[11px] text-[var(--muted-foreground)] font-bold">النوع</th>
                      <th scope="col" className="text-right px-3 py-2.5 text-[11px] text-[var(--muted-foreground)] font-bold">الخطأ</th><th scope="col" className="text-right px-3 py-2.5 text-[11px] text-[var(--muted-foreground)] font-bold">الوقت</th><th scope="col" className="text-right px-3 py-2.5 text-[11px] text-[var(--muted-foreground)] font-bold">المحاولات</th>
                    </tr></thead>
                    <tbody>
                      {queueFailures.map((f, i) => (
                        <tr className="border-b border-b-[var(--border)]" key={f.id || i}>
                          <td className="px-3 py-2.5 font-mono text-[11px]">{f.queue}</td>
                          <td className="px-3 py-2.5 font-mono text-[11px] [direction:ltr] text-right">{f.type || "—"}</td>
                          <td className="px-3 py-2.5 text-[11px] [direction:ltr] text-right text-red-300">{f.error}</td>
                          <td className="px-3 py-2.5 text-[13px]">{new Date(f.failedAt).toLocaleString("ar-EG")}</td>
                          <td className="px-3 py-2.5 text-[13px]">{f.attempts}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
          {tab === "stock-ledger" && (
            <div className="bg-[var(--card)] rounded-2xl border border-[var(--border)] overflow-hidden">
              {/*
                GATE 4 Task 6 — StockMovement ledger viewer with founder filters.
                Tenant dropdown supports "__all__" (founder cross-tenant mode),
                plus product-name + date-range filters wired to the extended
                /api/inventory/movements endpoint.
              */}
              <div className="px-4 py-3 border-b border-b-[var(--border)] flex flex-col gap-2.5">
                <div className="flex gap-2.5 items-center flex-wrap">
                  <label className="text-xs font-bold text-[var(--muted-foreground)]">الشركة:</label>
                  <select
                    value={stockLedgerSlug}
                    onChange={(e) => setStockLedgerSlug(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-[var(--background)] border border-[var(--border)] text-[var(--foreground)] font-inherit text-[13px] outline-none max-w-[260px]"
                  >
                    <option value="">— اختر شركة —</option>
                    <option value="__all__">🌐 كل الشركات (founder)</option>
                    {tenants.map((t) => (
                      <option key={t.id} value={t.slug}>{t.emoji} {t.nameAr || t.name} ({t.slug})</option>
                    ))}
                  </select>
                  {stockLedgerSlug && (
                    <IconBtn color="#047857" aria-label="تحديث" onClick={applyStockLedgerFilters}
                      title="تحديث"
                    >
                      <Activity size={14} /> تحديث
                    </IconBtn>
                  )}
                </div>
                <div className="flex gap-2.5 items-center flex-wrap">
                  <label className="text-[11px] font-bold text-[var(--muted-foreground)]">اسم المنتج:</label>
                  <input
                    type="text"
                    value={stockLedgerProductName}
                    onChange={(e) => setStockLedgerProductName(e.target.value)}
                    placeholder="بحث بالاسم..."
                    className="w-full px-3 py-2 rounded-lg bg-[var(--background)] border border-[var(--border)] text-[var(--foreground)] font-inherit text-[13px] outline-none max-w-[180px]"
                  />
                  <label className="text-[11px] font-bold text-[var(--muted-foreground)]">من:</label>
                  <input
                    type="date"
                    value={stockLedgerFrom}
                    onChange={(e) => setStockLedgerFrom(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-[var(--background)] border border-[var(--border)] text-[var(--foreground)] font-inherit text-[13px] outline-none max-w-[150px]"
                  />
                  <label className="text-[11px] font-bold text-[var(--muted-foreground)]">إلى:</label>
                  <input
                    type="date"
                    value={stockLedgerTo}
                    onChange={(e) => setStockLedgerTo(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-[var(--background)] border border-[var(--border)] text-[var(--foreground)] font-inherit text-[13px] outline-none max-w-[150px]"
                  />
                  {stockLedgerSlug && (
                    <button
                      onClick={applyStockLedgerFilters}
                      className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white border-none font-inherit text-[11px] font-bold cursor-pointer active-press"
                    >
                      تطبيق الفلاتر
                    </button>
                  )}
                  {(stockLedgerProductName || stockLedgerFrom || stockLedgerTo) && (
                    <IconBtn color="#9ca3af" aria-label="مسح الفلاتر" className="!w-auto !px-2 !py-1" onClick={() => {
                        setStockLedgerProductName("");
                        setStockLedgerFrom("");
                        setStockLedgerTo("");
                        if (stockLedgerSlug) {
                          setStockLedgerApplied({ companySlug: stockLedgerSlug });
                        }
                      }}
                    >
                      مسح الفلاتر
                    </IconBtn>
                  )}
                </div>
              </div>
              {!stockLedgerSlug ? (
                <div className="p-6 md:p-12 text-center text-[var(--muted-foreground)]">
                  اختر شركة (أو «كل الشركات» للمؤسس) لعرض دفتر حركة المخزون (StockMovement ledger).
                </div>
              ) : stockMovements.length === 0 ? (
                <div className="p-6 md:p-12 text-center text-[var(--muted-foreground)]">
                  لا توجد حركات مخزون مطابقة للفلاتر المحددة.
                </div>
              ) : (
                <div className="garfix-scroll overflow-x-auto">
                  <table className="w-full [border-collapse:collapse]">
                    <thead><tr className="bg-[var(--muted)]">
                      <th scope="col" className="text-right px-3 py-2.5 text-[11px] text-[var(--muted-foreground)] font-bold">الوقت</th>
                      <th scope="col" className="text-right px-3 py-2.5 text-[11px] text-[var(--muted-foreground)] font-bold">الشركة</th>
                      <th scope="col" className="text-right px-3 py-2.5 text-[11px] text-[var(--muted-foreground)] font-bold">المنتج</th>
                      <th scope="col" className="text-right px-3 py-2.5 text-[11px] text-[var(--muted-foreground)] font-bold">التغيّر</th>
                      <th scope="col" className="text-right px-3 py-2.5 text-[11px] text-[var(--muted-foreground)] font-bold">السبب</th>
                      <th scope="col" className="text-right px-3 py-2.5 text-[11px] text-[var(--muted-foreground)] font-bold">المرجع</th>
                      <th scope="col" className="text-right px-3 py-2.5 text-[11px] text-[var(--muted-foreground)] font-bold">المستودع</th>
                      <th scope="col" className="text-right px-3 py-2.5 text-[11px] text-[var(--muted-foreground)] font-bold">ملاحظة</th>
                    </tr></thead>
                    <tbody>
                      {stockMovements.slice(0, 300).map((m: InventoryMovement) => (
                        <tr className="border-b border-b-[var(--border)]" key={m.id}>
                          <td className="px-3 py-2.5 text-[13px]">{new Date(m.createdAt).toLocaleString("ar-EG")}</td>
                          <td className="px-3 py-2.5 font-mono text-[11px] [direction:ltr] text-right">{m.companySlug}</td>
                          <td className="px-3 py-2.5 text-[13px] font-bold">
                            {m.productName}
                            {m.productCode && (
                              <span className="text-[var(--muted-foreground)] font-mono text-[10px] mr-1"> ({m.productCode})</span>
                            )}
                          </td>
                          <td className={`px-3 py-2.5 text-[13px] [direction:ltr] text-right font-bold ${m.qty < 0 ? "text-red-300" : "text-green-300"}`}>{m.qty > 0 ? "+" : ""}{m.qty}</td>
                          <td className="px-3 py-2.5 text-[13px]"><span className="px-2 py-0.5 rounded-lg bg-[var(--muted)] text-[10px] font-bold">{m.sourceType}</span></td>
                          <td className="px-3 py-2.5 font-mono text-[11px] [direction:ltr] text-right">
                            {m.sourceId != null ? `#${m.sourceId}` : "—"}
                          </td>
                          <td className="px-3 py-2.5 text-[13px]">{m.warehouseName}</td>
                          <td className="px-3 py-2.5 text-[11px] text-[var(--muted-foreground)]">{m.note || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
          {tab === "review-queue" && <ReviewQueueTab onOpenReviewQueue={(slug) => setReviewQueueSlug(slug)} />}
          {tab === "feature-flags" && <FeatureFlagsTab />}
          {tab === "ai-usage" && <AiUsageTab />}
          {tab === "ai-orchestration" && <AiOrchestrationTab />}
          {tab === "ai-settings" && <AiProviderSettings />}
          {tab === "landing-content" && <LandingContentTab />}
          {tab === "integrations" && <IntegrationsTab />}
          {tab === "retention-cleanup" && <RetentionCleanupTab />}
          {tab === "plans" && <PlansTab />}
          {tab === "backups" && <BackupsTab />}
          {tab === "webhooks" && <WebhookManagementView />}
        </div>
      )}

      {reviewQueueSlug && (
        <LazyReviewQueueModal
          companySlug={reviewQueueSlug}
          onClose={() => setReviewQueueSlug(null)}
        />
      )}

      {/*
        GATE 4 Task 1 — company soft-delete confirmation dialog.
        Replaces the previous browser confirm() with a shadcn AlertDialog that
        surfaces the 5-year financial-data retention warning explicitly.
        Calls DELETE /api/platform-admin/tenants/[slug] with hardDelete=false
        (soft-delete cascade — sets deletedAt + subscriptionStatus="suspended").
      */}
      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => { if (!open && !deleting) setDeleteTarget(null); }}
      >
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-right flex items-center gap-2 justify-end">
              <Trash2 size={16} className="text-amber-500" />
              حذف مبدئي للشركة &quot;{deleteTarget?.nameAr || deleteTarget?.name || deleteTarget?.slug}&quot;
            </AlertDialogTitle>
            <AlertDialogDescription className="text-right">
              سيتم إيقاف الشركة فوراً (تعيين <code dir="ltr">deletedAt</code> +
              <code dir="ltr"> subscriptionStatus = suspended</code>). تُحتفظ السجلات
              المالية (الفواتير، القيود المحاسبية، المدفوعات، الفواتير الإلكترونية)
              لمدة <strong>٥ سنوات</strong> وفق سياسة الاحتفاظ الضريبي، ولا يمكن
              للمستأجر الدخول لحسابه أثناء الإيقاف. يمكن التراجع لاحقاً عبر إعادة
              تفعيل الاشتراك.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div
            className="px-3 py-2.5 bg-amber-500/12 border border-amber-500/30 rounded-lg text-[11px] text-amber-500 font-bold flex items-center gap-1.5"
          >
            <AlertTriangle size={14} />
            soft-delete — data preserved 5 years per retention policy
          </div>
          <AlertDialogFooter className="flex-row-reverse sm:flex-row-reverse">
            <AlertDialogCancel disabled={deleting} className="mr-2">
              إلغاء
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={deleting}
              onClick={(e) => {
                e.preventDefault();
                if (!deleteTarget) return;
                setDeleting(true);
                deleteTenantMutation.mutate(
                  { slug: deleteTarget.slug },
                  {
                    onSuccess: () => {
                      toast.success(`تم إيقاف "${deleteTarget.nameAr || deleteTarget.name}"`);
                      setDeleteTarget(null);
                      setDeleting(false);
                    },
                    onError: (err) => {
                      toast.error(err.message || "خطأ");
                      setDeleting(false);
                    },
                  },
                );
              }}
              className="bg-amber-500 hover:bg-amber-600 text-white"
            >
              {deleting ? "جارٍ الحذف…" : "نعم، احذف مبدئياً"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );

}

function StatusBadge({ active, activeText, inactiveText }: { active: boolean; activeText?: string; inactiveText?: string }) {
  const label = active ? (activeText || "نشط") : (inactiveText || "موقوف");
  return <span role="status" aria-label={label} className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold ${active ? "bg-emerald-500/15 text-emerald-500" : "bg-muted text-muted-foreground"}`}>{label}</span>;
}

function TicketStatusBadge({ status }: { status: string }) {
  const label = status === "open" ? "مفتوحة" : "مغلقة";
  return <span role="status" aria-label={`تذكرة ${label}`} className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold ${status === "open" ? "bg-amber-500/15 text-amber-500" : "bg-emerald-500/15 text-emerald-500"}`}>{label}</span>;
}

/**
 * P1.8 fix — small utilization bar for the tenants table.
 * Shows current/max + a colored progress bar (green < 70%, amber < 90%, red ≥ 90%).
 */
function UtilizationBar({ label, current, max, pct }: { label: string; current: number; max: number; pct: number }) {
  const color = pct >= 90 ? "#ef4444" : pct >= 70 ? "#f59e0b" : "#10b981";
  const displayMax = max >= 999999 ? "∞" : String(max);
  return (
    <div role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={label} className="flex flex-col gap-0.5">
      <div className="flex justify-between text-[10px] text-[var(--muted-foreground)]">
        <span>{label}</span>
        <span className="[direction:ltr]">{current} / {displayMax}</span>
      </div>
      <div className="h-1 bg-[var(--muted)] overflow-hidden rounded-sm">
        <div className="h-full [transition:width_.2s]" style={{ width: `${Math.min(100, pct)}%`, background: color }} />
      </div>
    </div>
  );
}

function AnnouncementForm({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [type, setType] = useState("info");
  const createAnnouncementMutation = useCreateAnnouncement();

  const submit = () => {
    if (!title || !body) { toast.error("العنوان والمحتوى مطلوبان"); return; }
    createAnnouncementMutation.mutate(
      { title, body, type, targetPlans: [], isActive: true },
      {
        onSuccess: () => { toast.success("تم إنشاء الإعلان"); onSaved(); },
        onError: (err) => { toast.error(err.message || "خطأ"); },
      },
    );
  };

  return (
    <div className="p-4 border-b border-b-[var(--border)] bg-[var(--muted)] flex flex-col gap-2.5">
      <div className="flex justify-between items-center">
        <h4 className="text-[13px] font-bold">إعلان جديد</h4>
        <button className="bg-transparent border-none text-[var(--muted-foreground)] cursor-pointer" onClick={onClose}><X size={14} /></button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-[1fr_160px] gap-2.5">
        <div><label className="block text-[11px] font-semibold text-[var(--muted-foreground)] mb-1">العنوان</label><input value={title} onChange={(e) => setTitle(e.target.value)} className="w-full px-3 py-2 rounded-lg bg-[var(--background)] border border-[var(--border)] text-[var(--foreground)] font-inherit text-[13px] outline-none" /></div>
        <div><label className="block text-[11px] font-semibold text-[var(--muted-foreground)] mb-1">النوع</label>
          <select value={type} onChange={(e) => setType(e.target.value)} className="w-full px-3 py-2 rounded-lg bg-[var(--background)] border border-[var(--border)] text-[var(--foreground)] font-inherit text-[13px] outline-none">
            <option value="info">معلومات</option><option value="warning">تحذير</option>
            <option value="success">نجاح</option><option value="critical">حرج</option>
          </select>
        </div>
      </div>
      <div><label className="block text-[11px] font-semibold text-[var(--muted-foreground)] mb-1">المحتوى</label><textarea value={body} onChange={(e) => setBody(e.target.value)} rows={3} className="w-full px-3 py-2 rounded-lg bg-[var(--background)] border border-[var(--border)] text-[var(--foreground)] font-inherit text-[13px] outline-none resize-y" /></div>
      <button onClick={submit} disabled={createAnnouncementMutation.isPending} className={`self-end px-5 py-2 rounded-lg bg-[var(--primary)] text-[var(--primary-foreground)] border-none font-inherit text-xs font-bold ${createAnnouncementMutation.isPending ? "cursor-not-allowed opacity-70" : "cursor-pointer"}`}>{createAnnouncementMutation.isPending ? "جارٍ…" : "نشر"}</button>
    </div>
  );
}

export default PlatformAdminPanel;

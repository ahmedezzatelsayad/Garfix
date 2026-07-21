"use client";

import { useEffect, useState, useCallback } from "react";
import { authedFetch } from "@/context/AuthContext";
import { toast } from "sonner";
import {
  Shield, Megaphone, Ticket, BarChart3, Building2, Plus, X, Sparkles,
  AlertTriangle, Trash2, Eye, Send, ChevronLeft, Activity, ListChecks, Check,
  FileText, Plug, Database, Save, Settings, Network, RefreshCw, Zap, Gauge, HardDriveDownload, Loader2,
} from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from "recharts";
import { AiProviderSettings } from "./AiProviderSettings";
import { ReviewQueueModal } from "@/modules/common/ReviewQueueModal";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogFooter,
  AlertDialogTitle, AlertDialogDescription, AlertDialogAction, AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import { DEFAULT_PLANS, type PlanDef, type PlanCatalog } from "@/lib/plans";

interface Stats {
  tenantsCount: number; usersCount: number; invoicesCount: number;
  ticketsOpen: number; totalRevenue: number;
  byPlan: Record<string, number>;
  monthlyGrowth: Array<{ month: string; tenants: number }>;
}
interface Tenant {
  id: number; name: string; slug: string; nameAr?: string; emoji?: string;
  plan: string; subscriptionStatus: string; createdAt: string;
  stats: { invoices: number; users: number; clients: number; revenue: number };
  // P1.8: optional plan-limits block — present when /api/platform-admin/tenants
  // returns the new planLimits field. Older responses (cached) may omit it.
  planLimits?: {
    maxInvoicesPerMonth: number;
    maxUsers: number;
    maxCompanies: number;
    invoiceUtilization: number;
    userUtilization: number;
  };
}
interface TenantDetail {
  tenant: {
    id: number; slug: string; name: string; nameAr?: string; emoji?: string;
    plan: string; subscriptionStatus: string; createdAt: string; deletedAt?: string | null;
  };
  overview: {
    invoicesCount: number;
    lastInvoice: { id: number; invoiceNumber: string; createdAt: string; total: string } | null;
    usersCount: number;
    clientsCount: number;
    movementsCount: number;
    reviewQueueCount: number;
    oversellCount: number;
    lastActivityAt: string;
  };
}
interface Announcement {
  id: string; title: string; body: string; type: string; isActive: boolean; createdAt: string;
}
interface TicketReply {
  id: string; senderEmail: string; senderRole: string; body: string; createdAt: string;
}
interface Ticket {
  id: string; userEmail: string; subject: string; status: string; priority: string; createdAt: string;
  body?: string;
  replies?: TicketReply[];
}
interface AdminAudit {
  id: string; adminEmail: string; action: string; targetType?: string; targetId?: string; createdAt: string;
}
interface QueueFailure {
  id: string; queue: string; type?: string; payload: unknown; error: string; failedAt: string; attempts: number;
}
interface StockMovement {
  id: number; companySlug: string; productId: number | null;
  productName: string; productCode: string | null;
  warehouseId: number; warehouseName: string; warehouseCode: string;
  qty: number; sourceType: string; sourceId: number | null;
  note: string | null; createdBy: string; createdAt: string;
}

type Tab = "stats" | "tenants" | "announcements" | "tickets" | "audit" | "ai-settings" | "queue-failures" | "stock-ledger" | "feature-flags" | "ai-usage" | "ai-orchestration" | "review-queue" | "landing-content" | "integrations" | "retention-cleanup" | "plans" | "backups";

export function PlatformAdminPanel() {
  const [tab, setTab] = useState<Tab>("stats");
  const [stats, setStats] = useState<Stats | null>(null);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [audit, setAudit] = useState<AdminAudit[]>([]);
  const [queueFailures, setQueueFailures] = useState<QueueFailure[]>([]);
  const [stockMovements, setStockMovements] = useState<StockMovement[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAnnouncementForm, setShowAnnouncementForm] = useState(false);
  const [tenantsPage, setTenantsPage] = useState(1);
  const [auditPage, setAuditPage] = useState(1);
  const adminPageSize = 10;

  // Founder-panel feature state (GATE 4):
  // - selectedTicketId opens a detail drawer with reply + status change
  // - selectedTenantSlug opens a Support-View drawer with operational overview
  // - stockLedgerSlug holds the tenant currently being viewed in the ledger tab
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [selectedTenantSlug, setSelectedTenantSlug] = useState<string | null>(null);
  const [stockLedgerSlug, setStockLedgerSlug] = useState<string>("");
  // GATE 4 Task 6: stock-ledger filter state — product name (contains),
  // date range (from/to ISO date inputs), populated on the ledger tab.
  const [stockLedgerProductName, setStockLedgerProductName] = useState<string>("");
  const [stockLedgerFrom, setStockLedgerFrom] = useState<string>("");
  const [stockLedgerTo, setStockLedgerTo] = useState<string>("");
  const [reviewQueueSlug, setReviewQueueSlug] = useState<string | null>(null);
  // GATE 4 Task 1: company soft-delete confirmation dialog target.
  const [deleteTarget, setDeleteTarget] = useState<Tenant | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [s, t, a, tk, au] = await Promise.all([
        authedFetch("/api/platform-admin/stats"),
        authedFetch("/api/platform-admin/tenants"),
        authedFetch("/api/platform-admin/announcements"),
        authedFetch("/api/platform-admin/tickets"),
        authedFetch("/api/platform-admin/audit?limit=50"),
      ]);
      const [sD, tD, aD, tkD, auD] = await Promise.all([s.json(), t.json(), a.json(), tk.json(), au.json()]);
      if (s.ok) setStats(sD);
      if (t.ok) setTenants(tD.tenants || []);
      if (a.ok) setAnnouncements(aD.announcements || []);
      if (tk.ok) setTickets(tkD.tickets || []);
      if (au.ok) setAudit(auD.logs || []);
    } finally { setLoading(false); }
  }, []);

  const loadQueueFailures = useCallback(async () => {
    try {
      const res = await authedFetch("/api/platform-admin/queue-failures");
      const data = await res.json();
      if (res.ok) setQueueFailures(data.failures || []);
    } catch {
      /* founder-only endpoint; ignore if 403 */
    }
  }, []);

  const loadStockMovements = useCallback(async (
    slug: string,
    opts?: { productName?: string; from?: string; to?: string },
  ) => {
    if (!slug) { setStockMovements([]); return; }
    try {
      const params = new URLSearchParams({ limit: "300" });
      params.set("companySlug", slug);
      if (opts?.productName && opts.productName.trim()) params.set("productName", opts.productName.trim());
      // Convert yyyy-mm-dd input value → ISO start-of-day / end-of-day bounds.
      if (opts?.from) {
        const from = new Date(`${opts.from}T00:00:00.000Z`);
        if (!isNaN(from.getTime())) params.set("from", from.toISOString());
      }
      if (opts?.to) {
        const to = new Date(`${opts.to}T23:59:59.999Z`);
        if (!isNaN(to.getTime())) params.set("to", to.toISOString());
      }
      const res = await authedFetch(`/api/inventory/movements?${params}`);
      const data = await res.json();
      if (res.ok) setStockMovements(data.movements || []);
      else toast.error(data.error || "تعذّر تحميل حركات المخزون");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "خطأ");
    }
  }, []);

  // setState runs inside async .then() callback in load (after await authedFetch) — not synchronous in effect body; no cascading render.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);

  // Lazy-load queue failures only when the tab is opened
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (tab === "queue-failures") loadQueueFailures(); }, [tab, loadQueueFailures]);

  // Lazy-load stock movements for the selected slug when the ledger tab is active.
  // Filters (productName / from / to) intentionally NOT in the dependency array —
  // they're applied on explicit "Apply filters" button click (not on every keystroke).
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (tab === "stock-ledger" && stockLedgerSlug) {
      loadStockMovements(stockLedgerSlug, {
        productName: stockLedgerProductName,
        from: stockLedgerFrom,
        to: stockLedgerTo,
      });
    }
  }, [tab, stockLedgerSlug, loadStockMovements]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const tabs: Array<{ key: Tab; label: string; icon: React.ReactNode }> = [
    { key: "stats", label: "الإحصائيات", icon: <BarChart3 size={14} /> },
    { key: "tenants", label: "المستأجرون", icon: <Building2 size={14} /> },
    { key: "announcements", label: "الإعلانات", icon: <Megaphone size={14} /> },
    { key: "tickets", label: "التذاكر", icon: <Ticket size={14} /> },
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
  ];

  const pieData = stats ? Object.entries(stats.byPlan).map(([k, v], i) => ({
    name: k, value: Number(v) || 0,
    color: ["#7c3aed", "#10b981", "#f59e0b", "#3b82f6", "#ef4444", "#ec4899", "#14b8a6"][i % 7],
  })).filter((d) => d.value > 0) : [];
  const pieTotal = pieData.reduce((s, d) => s + d.value, 0);

  const tenantsTotalPages = Math.max(1, Math.ceil(tenants.length / adminPageSize));
  const tenantsSafePage = Math.min(tenantsPage, tenantsTotalPages);
  const currentPageTenants = tenants.slice((tenantsSafePage - 1) * adminPageSize, tenantsSafePage * adminPageSize);

  const auditTotalPages = Math.max(1, Math.ceil(audit.length / adminPageSize));
  const auditSafePage = Math.min(auditPage, auditTotalPages);
  const currentPageAudit = audit.slice((auditSafePage - 1) * adminPageSize, auditSafePage * adminPageSize);

  const adminPageBtnStyle = (disabled: boolean): React.CSSProperties => ({
    padding: "6px 12px", borderRadius: "6px",
    background: disabled ? "transparent" : "var(--card)",
    color: disabled ? "var(--muted-foreground)" : "var(--foreground)",
    border: "1px solid var(--border)", fontFamily: "inherit", fontSize: "12px", fontWeight: 700,
    cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.5 : 1,
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
      <div>
        <h1 style={{ fontSize: "24px", fontWeight: 800, display: "flex", alignItems: "center", gap: "8px" }}><Shield size={20} /> لوحة المؤسس</h1>
        <p style={{ fontSize: "13px", color: "var(--muted-foreground)" }}>إدارة شاملة للمنصة</p>
      </div>
      <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }} className="garfix-scroll">
        {tabs.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{ display: "inline-flex", alignItems: "center", gap: "6px", padding: "8px 14px", borderRadius: "10px", background: tab === t.key ? "var(--primary)" : "var(--card)", color: tab === t.key ? "var(--primary-foreground)" : "var(--muted-foreground)", border: "1px solid var(--border)", fontFamily: "inherit", fontSize: "12px", fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {loading ? <div style={{ padding: "48px", textAlign: "center", color: "var(--muted-foreground)" }}>جارٍ التحميل…</div> : (
        <>
          {tab === "stats" && !stats && (
            <div style={{ padding: "48px", textAlign: "center", color: "var(--muted-foreground)" }}>تعذّر تحميل الإحصائيات. تحقّق من صلاحيات المؤسس.</div>
          )}
          {tab === "stats" && stats && (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "12px" }}>
                <KpiCard label="إجمالي المستأجرين" value={stats.tenantsCount} color="#7c3aed" />
                <KpiCard label="المستخدمون" value={stats.usersCount} color="#10b981" />
                <KpiCard label="الفواتير" value={stats.invoicesCount} color="#3b82f6" />
                <KpiCard label="تذاكر مفتوحة" value={stats.ticketsOpen} color="#f59e0b" />
                <KpiCard label="إجمالي الإيرادات" value={stats.totalRevenue.toLocaleString("ar-EG", { maximumFractionDigits: 0 })} color="#ef4444" />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "16px" }}>
                <div style={{ background: "var(--card)", borderRadius: "14px", border: "1px solid var(--border)", padding: "20px" }}>
                  <h3 style={{ fontSize: "14px", fontWeight: 700, marginBottom: "12px" }}>نمو المستأجرين (6 أشهر)</h3>
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
                    <div style={{ height: 220, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--muted-foreground)", fontSize: "12px" }}>لا توجد بيانات</div>
                  )}
                </div>
                <div style={{ background: "var(--card)", borderRadius: "14px", border: "1px solid var(--border)", padding: "20px" }}>
                  <h3 style={{ fontSize: "14px", fontWeight: 700, marginBottom: "12px" }}>توزيع الباقات</h3>
                  {pieData.length > 0 && pieTotal > 0 ? (
                    <ResponsiveContainer width="100%" height={220}>
                      <PieChart>
                        <Pie data={pieData} cx="50%" cy="50%" innerRadius={pieData.length === 1 ? 0 : 50} outerRadius={80} dataKey="value" label={({ name, percent }: { name: string; percent?: number }) => `${name} ${percent !== undefined ? Math.round(percent * 100) + "%" : ""}`}>
                          {pieData.map((d, i) => <Cell key={i} fill={d.color} />)}
                        </Pie>
                        <Legend wrapperStyle={{ fontSize: "11px" }} />
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                  ) : (
                    <div style={{ height: 220, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--muted-foreground)", fontSize: "12px" }}>لا توجد بيانات</div>
                  )}
                </div>
              </div>
            </>
          )}
          {tab === "tenants" && (
            <div style={{ background: "var(--card)", borderRadius: "14px", border: "1px solid var(--border)", overflow: "hidden" }}>
              {/* Part 3: Desktop table (hidden on mobile) */}
              <div className="hidden md:block" style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead><tr style={{ background: "var(--muted)" }}>
                    <th style={th}>الشركة</th><th style={th}>الباقة</th><th style={th}>الفواتير</th>
                    <th style={th}>المستخدمون</th><th style={th}>العملاء</th><th style={th}>الإيراد</th>
                    <th style={th}>استهلاك الباقة</th>
                    <th style={th}>إجراءات</th>
                  </tr></thead>
                  <tbody>
                    {tenants.length === 0 ? <tr><td colSpan={8} style={{ ...td, textAlign: "center", padding: "32px", color: "var(--muted-foreground)" }}>لا توجد مستأجرون</td></tr> :
                      currentPageTenants.map((t) => (
                        <tr key={t.id} style={{ borderBottom: "1px solid var(--border)" }}>
                          <td style={{ ...td, fontWeight: 700 }}>{t.emoji} {t.nameAr || t.name}</td>
                          <td style={td}>{t.plan}</td>
                          <td style={td}>{t.stats.invoices}</td>
                          <td style={td}>{t.stats.users}</td>
                          <td style={td}>{t.stats.clients}</td>
                          <td style={{ ...td, direction: "ltr", textAlign: "right", fontWeight: 700 }}>{t.stats.revenue.toLocaleString("ar-EG", { maximumFractionDigits: 0 })}</td>
                          <td style={td}>
                            {/* P1.8 fix: usage-vs-plan visualization. */}
                            {t.planLimits ? (
                              <div style={{ display: "flex", flexDirection: "column", gap: "4px", minWidth: "120px" }}>
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
                              <span style={{ fontSize: "11px", color: "var(--muted-foreground)" }}>—</span>
                            )}
                          </td>
                          <td style={td}>
                            <div style={{ display: "flex", gap: "4px" }}>
                              <button
                                onClick={() => setSelectedTenantSlug(t.slug)}
                                title="عرض الدعم (Support View)"
                                style={iconBtn("#3b82f6")}
                              >
                                <Eye size={14} />
                              </button>
                              <button
                                onClick={() => setDeleteTarget(t)}
                                title="حذف مبدئي (إيقاف مؤقت)"
                                style={iconBtn("#f59e0b")}
                              >
                                <Trash2 size={14} />
                              </button>
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
                  <div className="text-center p-8 text-muted-foreground text-sm">لا توجد مستأجرون</div>
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
                            className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg border border-border text-blue-500 cursor-pointer"
                          >
                            <Eye size={16} />
                          </button>
                          <button
                            onClick={() => setDeleteTarget(t)}
                            title="حذف"
                            className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg border border-border text-amber-500 cursor-pointer"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-center text-xs border-t border-border pt-2">
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
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px", borderTop: "1px solid var(--border)", flexWrap: "wrap", gap: "8px" }}>
                  <span style={{ fontSize: "12px", color: "var(--muted-foreground)" }}>صفحة {tenantsSafePage} من {tenantsTotalPages} ({tenants.length} مستأجر)</span>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    <button onClick={() => setTenantsPage((p) => Math.max(1, p - 1))} disabled={tenantsSafePage === 1} style={adminPageBtnStyle(tenantsSafePage === 1)}>السابق</button>
                    <button onClick={() => setTenantsPage((p) => Math.min(tenantsTotalPages, p + 1))} disabled={tenantsSafePage === tenantsTotalPages} style={adminPageBtnStyle(tenantsSafePage === tenantsTotalPages)}>التالي</button>
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
            <div style={{ background: "var(--card)", borderRadius: "14px", border: "1px solid var(--border)", overflow: "hidden" }}>
              <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <h3 style={{ fontSize: "14px", fontWeight: 700 }}>الإعلانات ({announcements.length})</h3>
                <button onClick={() => setShowAnnouncementForm(true)} style={{ display: "inline-flex", alignItems: "center", gap: "4px", padding: "6px 12px", borderRadius: "8px", background: "var(--primary)", color: "var(--primary-foreground)", border: "none", fontFamily: "inherit", fontSize: "11px", fontWeight: 700, cursor: "pointer" }}><Plus size={12} /> إعلان جديد</button>
              </div>
              {showAnnouncementForm && <AnnouncementForm onClose={() => setShowAnnouncementForm(false)} onSaved={() => { setShowAnnouncementForm(false); load(); }} />}
              <div style={{ overflowX: "auto" }} className="garfix-scroll">
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead><tr style={{ background: "var(--muted)" }}>
                    <th style={th}>العنوان</th><th style={th}>النوع</th><th style={th}>الحالة</th><th style={th}>التاريخ</th>
                  </tr></thead>
                  <tbody>
                    {announcements.length === 0 ? <tr><td colSpan={4} style={{ ...td, textAlign: "center", padding: "32px", color: "var(--muted-foreground)" }}>لا توجد إعلانات</td></tr> :
                      announcements.map((a) => (
                        <tr key={a.id} style={{ borderBottom: "1px solid var(--border)" }}>
                          <td style={{ ...td, fontWeight: 700 }}>{a.title}</td>
                          <td style={td}>{a.type}</td>
                          <td style={td}><span style={{ padding: "2px 10px", borderRadius: "12px", background: a.isActive ? "rgba(16,185,129,0.15)" : "rgba(156,163,175,0.15)", color: a.isActive ? "#10b981" : "#9ca3af", fontSize: "11px", fontWeight: 700 }}>{a.isActive ? "نشط" : "موقوف"}</span></td>
                          <td style={td}>{new Date(a.createdAt).toLocaleDateString("ar-EG")}</td>
                        </tr>
                      ))
                    }
                  </tbody>
                </table>
              </div>
            </div>
          )}
          {tab === "tickets" && (
            <div style={{ background: "var(--card)", borderRadius: "14px", border: "1px solid var(--border)", overflow: "hidden" }}>
              <div style={{ overflowX: "auto" }} className="garfix-scroll">
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead><tr style={{ background: "var(--muted)" }}>
                    <th style={th}>المستخدم</th><th style={th}>الموضوع</th><th style={th}>الأولوية</th>
                    <th style={th}>الحالة</th><th style={th}>التاريخ</th><th style={th}>إجراء</th>
                  </tr></thead>
                  <tbody>
                    {tickets.length === 0 ? <tr><td colSpan={6} style={{ ...td, textAlign: "center", padding: "32px", color: "var(--muted-foreground)" }}>لا توجد تذاكر</td></tr> :
                      tickets.map((t) => (
                        <tr key={t.id} style={{ borderBottom: "1px solid var(--border)" }}>
                          <td style={td}>{t.userEmail}</td>
                          <td style={{ ...td, fontWeight: 700 }}>{t.subject}</td>
                          <td style={td}>{t.priority}</td>
                          <td style={td}><span style={{ padding: "2px 10px", borderRadius: "12px", background: t.status === "open" ? "rgba(245,158,11,0.15)" : "rgba(16,185,129,0.15)", color: t.status === "open" ? "#f59e0b" : "#10b981", fontSize: "11px", fontWeight: 700 }}>{t.status}</span></td>
                          <td style={td}>{new Date(t.createdAt).toLocaleDateString("ar-EG")}</td>
                          <td style={td}>
                            <button
                              onClick={() => setSelectedTicketId(t.id)}
                              style={iconBtn("#3b82f6")}
                              title="فتح التذكرة"
                            >
                              <Eye size={14} />
                            </button>
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
                  onUpdated={() => { load(); }}
                />
              )}
            </div>
          )}
          {tab === "audit" && (
            <div style={{ background: "var(--card)", borderRadius: "14px", border: "1px solid var(--border)", overflow: "hidden" }}>
              <div style={{ overflowX: "auto" }} className="garfix-scroll">
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead><tr style={{ background: "var(--muted)" }}>
                    <th style={th}>الوقت</th><th style={th}>المدير</th><th style={th}>الإجراء</th>
                    <th style={th}>النوع</th><th style={th}>المعرّف</th>
                  </tr></thead>
                  <tbody>
                    {audit.length === 0 ? <tr><td colSpan={5} style={{ ...td, textAlign: "center", padding: "32px", color: "var(--muted-foreground)" }}>لا توجد سجلات</td></tr> :
                      currentPageAudit.map((a) => (
                        <tr key={a.id} style={{ borderBottom: "1px solid var(--border)" }}>
                          <td style={td}>{new Date(a.createdAt).toLocaleString("ar-EG")}</td>
                          <td style={{ ...td, direction: "ltr", textAlign: "right" }}>{a.adminEmail}</td>
                          <td style={{ ...td, fontWeight: 700 }}>{a.action}</td>
                          <td style={td}>{a.targetType || "—"}</td>
                          <td style={{ ...td, fontFamily: "monospace" }}>{a.targetId || "—"}</td>
                        </tr>
                      ))
                    }
                  </tbody>
                </table>
              </div>
              {audit.length > adminPageSize && (
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px", borderTop: "1px solid var(--border)", flexWrap: "wrap", gap: "8px" }}>
                  <span style={{ fontSize: "12px", color: "var(--muted-foreground)" }}>صفحة {auditSafePage} من {auditTotalPages} ({audit.length} سجل)</span>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    <button onClick={() => setAuditPage((p) => Math.max(1, p - 1))} disabled={auditSafePage === 1} style={adminPageBtnStyle(auditSafePage === 1)}>السابق</button>
                    <button onClick={() => setAuditPage((p) => Math.min(auditTotalPages, p + 1))} disabled={auditSafePage === auditTotalPages} style={adminPageBtnStyle(auditSafePage === auditTotalPages)}>التالي</button>
                  </div>
                </div>
              )}
            </div>
          )}
          {tab === "queue-failures" && (
            <div style={{ background: "var(--card)", borderRadius: "14px", border: "1px solid var(--border)", overflow: "hidden" }}>
              <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "8px" }}>
                <h3 style={{ fontSize: "14px", fontWeight: 700, display: "flex", alignItems: "center", gap: "8px" }}>
                  <AlertTriangle size={16} style={{ color: "#f59e0b" }} />
                  أعطال الطوابير ({queueFailures.length})
                </h3>
                <div style={{ display: "flex", gap: "8px" }}>
                  <button onClick={loadQueueFailures} style={iconBtn("#3b82f6")}>
                    <Activity size={14} /> تحديث
                  </button>
                  {queueFailures.length > 0 && (
                    <button
                      onClick={async () => {
                        if (!confirm("مسح سجل الأعطال؟")) return;
                        await authedFetch("/api/platform-admin/queue-failures?clear=1");
                        setQueueFailures([]);
                        toast.success("تم مسح السجل");
                      }}
                      style={iconBtn("#ef4444")}
                    >
                      <Trash2 size={14} /> مسح
                    </button>
                  )}
                </div>
              </div>
              {queueFailures.length === 0 ? (
                <div style={{ padding: "48px", textAlign: "center", color: "var(--muted-foreground)" }}>
                  ✅ لا توجد أعطال في الطوابير — جميع المهام تتم بنجاح.
                </div>
              ) : (
                <div style={{ overflowX: "auto" }} className="garfix-scroll">
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead><tr style={{ background: "var(--muted)" }}>
                      <th style={th}>الطابور</th><th style={th}>النوع</th>
                      <th style={th}>الخطأ</th><th style={th}>الوقت</th><th style={th}>المحاولات</th>
                    </tr></thead>
                    <tbody>
                      {queueFailures.map((f, i) => (
                        <tr key={f.id || i} style={{ borderBottom: "1px solid var(--border)" }}>
                          <td style={{ ...td, fontFamily: "monospace", fontSize: "11px" }}>{f.queue}</td>
                          <td style={{ ...td, fontFamily: "monospace", fontSize: "11px", direction: "ltr", textAlign: "right" }}>{f.type || "—"}</td>
                          <td style={{ ...td, fontSize: "11px", color: "#fca5a5", direction: "ltr", textAlign: "right" }}>{f.error}</td>
                          <td style={td}>{new Date(f.failedAt).toLocaleString("ar-EG")}</td>
                          <td style={td}>{f.attempts}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
          {tab === "stock-ledger" && (
            <div style={{ background: "var(--card)", borderRadius: "14px", border: "1px solid var(--border)", overflow: "hidden" }}>
              {/*
                GATE 4 Task 6 — StockMovement ledger viewer with founder filters.
                Tenant dropdown supports "__all__" (founder cross-tenant mode),
                plus product-name + date-range filters wired to the extended
                /api/inventory/movements endpoint.
              */}
              <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)", display: "flex", flexDirection: "column", gap: "10px" }}>
                <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
                  <label style={{ fontSize: "12px", fontWeight: 700, color: "var(--muted-foreground)" }}>الشركة:</label>
                  <select
                    value={stockLedgerSlug}
                    onChange={(e) => setStockLedgerSlug(e.target.value)}
                    style={{ ...inputStyle, maxWidth: "260px" }}
                  >
                    <option value="">— اختر شركة —</option>
                    <option value="__all__">🌐 كل الشركات (founder)</option>
                    {tenants.map((t) => (
                      <option key={t.id} value={t.slug}>{t.emoji} {t.nameAr || t.name} ({t.slug})</option>
                    ))}
                  </select>
                  {stockLedgerSlug && (
                    <button
                      onClick={() => loadStockMovements(stockLedgerSlug, {
                        productName: stockLedgerProductName,
                        from: stockLedgerFrom,
                        to: stockLedgerTo,
                      })}
                      style={iconBtn("#7c3aed")}
                      title="تحديث"
                    >
                      <Activity size={14} /> تحديث
                    </button>
                  )}
                </div>
                <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
                  <label style={{ fontSize: "11px", fontWeight: 700, color: "var(--muted-foreground)" }}>اسم المنتج:</label>
                  <input
                    type="text"
                    value={stockLedgerProductName}
                    onChange={(e) => setStockLedgerProductName(e.target.value)}
                    placeholder="بحث بالاسم..."
                    style={{ ...inputStyle, maxWidth: "180px" }}
                  />
                  <label style={{ fontSize: "11px", fontWeight: 700, color: "var(--muted-foreground)" }}>من:</label>
                  <input
                    type="date"
                    value={stockLedgerFrom}
                    onChange={(e) => setStockLedgerFrom(e.target.value)}
                    style={{ ...inputStyle, maxWidth: "150px" }}
                  />
                  <label style={{ fontSize: "11px", fontWeight: 700, color: "var(--muted-foreground)" }}>إلى:</label>
                  <input
                    type="date"
                    value={stockLedgerTo}
                    onChange={(e) => setStockLedgerTo(e.target.value)}
                    style={{ ...inputStyle, maxWidth: "150px" }}
                  />
                  {stockLedgerSlug && (
                    <button
                      onClick={() => loadStockMovements(stockLedgerSlug, {
                        productName: stockLedgerProductName,
                        from: stockLedgerFrom,
                        to: stockLedgerTo,
                      })}
                      style={{
                        padding: "6px 12px", borderRadius: "8px",
                        background: "#7c3aed", color: "#fff", border: "none",
                        fontFamily: "inherit", fontSize: "11px", fontWeight: 700, cursor: "pointer",
                      }}
                    >
                      تطبيق الفلاتر
                    </button>
                  )}
                  {(stockLedgerProductName || stockLedgerFrom || stockLedgerTo) && (
                    <button
                      onClick={() => {
                        setStockLedgerProductName("");
                        setStockLedgerFrom("");
                        setStockLedgerTo("");
                        if (stockLedgerSlug) {
                          loadStockMovements(stockLedgerSlug, {});
                        }
                      }}
                      style={{ ...iconBtn("#9ca3af"), padding: "4px 8px", width: "auto" }}
                    >
                      مسح الفلاتر
                    </button>
                  )}
                </div>
              </div>
              {!stockLedgerSlug ? (
                <div style={{ padding: "48px", textAlign: "center", color: "var(--muted-foreground)" }}>
                  اختر شركة (أو «كل الشركات» للمؤسس) لعرض دفتر حركة المخزون (StockMovement ledger).
                </div>
              ) : stockMovements.length === 0 ? (
                <div style={{ padding: "48px", textAlign: "center", color: "var(--muted-foreground)" }}>
                  لا توجد حركات مخزون مطابقة للفلاتر المحددة.
                </div>
              ) : (
                <div style={{ overflowX: "auto" }} className="garfix-scroll">
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead><tr style={{ background: "var(--muted)" }}>
                      <th style={th}>الوقت</th>
                      <th style={th}>الشركة</th>
                      <th style={th}>المنتج</th>
                      <th style={th}>التغيّر</th>
                      <th style={th}>السبب</th>
                      <th style={th}>المرجع</th>
                      <th style={th}>المستودع</th>
                      <th style={th}>ملاحظة</th>
                    </tr></thead>
                    <tbody>
                      {stockMovements.slice(0, 300).map((m) => (
                        <tr key={m.id} style={{ borderBottom: "1px solid var(--border)" }}>
                          <td style={td}>{new Date(m.createdAt).toLocaleString("ar-EG")}</td>
                          <td style={{ ...td, fontFamily: "monospace", fontSize: "11px", direction: "ltr", textAlign: "right" }}>{m.companySlug}</td>
                          <td style={{ ...td, fontWeight: 700 }}>
                            {m.productName}
                            {m.productCode && (
                              <span style={{ color: "var(--muted-foreground)", fontFamily: "monospace", fontSize: "10px", marginRight: "4px" }}> ({m.productCode})</span>
                            )}
                          </td>
                          <td style={{ ...td, direction: "ltr", textAlign: "right", fontWeight: 700, color: m.qty < 0 ? "#fca5a5" : "#86efac" }}>{m.qty > 0 ? "+" : ""}{m.qty}</td>
                          <td style={td}><span style={{ padding: "2px 8px", borderRadius: "8px", background: "var(--muted)", fontSize: "10px", fontWeight: 700 }}>{m.sourceType}</span></td>
                          <td style={{ ...td, fontFamily: "monospace", fontSize: "11px", direction: "ltr", textAlign: "right" }}>
                            {m.sourceId != null ? `#${m.sourceId}` : "—"}
                          </td>
                          <td style={td}>{m.warehouseName}</td>
                          <td style={{ ...td, fontSize: "11px", color: "var(--muted-foreground)" }}>{m.note || "—"}</td>
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
        </>
      )}

      {reviewQueueSlug && (
        <ReviewQueueModal
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
              حذف مبدئي للشركة “{deleteTarget?.nameAr || deleteTarget?.name || deleteTarget?.slug}”
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
            style={{
              padding: "10px 12px",
              background: "rgba(245,158,11,0.12)",
              border: "1px solid rgba(245,158,11,0.3)",
              borderRadius: "8px",
              fontSize: "11px",
              color: "#f59e0b",
              fontWeight: 700,
              display: "flex",
              alignItems: "center",
              gap: "6px",
            }}
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
              onClick={async (e) => {
                e.preventDefault();
                if (!deleteTarget) return;
                setDeleting(true);
                try {
                  const res = await authedFetch(
                    `/api/platform-admin/tenants/${encodeURIComponent(deleteTarget.slug)}`,
                    {
                      method: "DELETE",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ hardDelete: false }),
                    },
                  );
                  const data = await res.json().catch(() => ({}));
                  if (!res.ok) throw new Error(data.error || "فشل الحذف");
                  toast.success(data.message || `تم إيقاف “${deleteTarget.nameAr || deleteTarget.name}”`);
                  setDeleteTarget(null);
                  await load();
                } catch (err) {
                  toast.error(err instanceof Error ? err.message : "خطأ");
                } finally {
                  setDeleting(false);
                }
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

  // Retained for hard-delete path (type-to-confirm flow) — kept for future
  // destructive-confirmation UI; the soft-delete button now uses AlertDialog
  // above instead of browser confirm().
  async function handleDeleteTenant(slug: string, hard: boolean) {
    try {
      const body = hard
        ? { hardDelete: true, typeToConfirm: prompt(`اكتب اسم الشركة بالكامل للحذف النهائي:`) || "" }
        : { hardDelete: false };
      if (hard && !(body as { typeToConfirm: string }).typeToConfirm) return;
      const res = await authedFetch(`/api/platform-admin/tenants/${encodeURIComponent(slug)}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "فشل الحذف");
      toast.success(data.message || "تم");
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "خطأ");
    }
  }
}

function iconBtn(color: string): React.CSSProperties {
  return {
    display: "inline-flex", alignItems: "center", justifyContent: "center",
    width: "28px", height: "28px", borderRadius: "6px",
    background: "transparent", border: "1px solid var(--border)",
    color, cursor: "pointer", padding: 0,
  };
}

function KpiCard({ label, value, color }: { label: string; value: number | string; color: string }) {
  return (
    <div style={{ padding: "16px", borderRadius: "14px", background: "var(--card)", border: "1px solid var(--border)" }}>
      <div style={{ fontSize: "11px", color: "var(--muted-foreground)", fontWeight: 600, marginBottom: "6px" }}>{label}</div>
      <div style={{ fontSize: "22px", fontWeight: 900, color }}>{value}</div>
    </div>
  );
}

const th: React.CSSProperties = { textAlign: "right", padding: "10px 12px", fontSize: "11px", color: "var(--muted-foreground)", fontWeight: 700 };
const td: React.CSSProperties = { padding: "10px 12px", fontSize: "13px" };
const inputStyle: React.CSSProperties = { width: "100%", padding: "8px 12px", borderRadius: "8px", background: "var(--background)", border: "1px solid var(--border)", color: "var(--foreground)", fontFamily: "inherit", fontSize: "13px", outline: "none" };
const labelStyle: React.CSSProperties = { display: "block", fontSize: "11px", fontWeight: 600, color: "var(--muted-foreground)", marginBottom: "4px" };

/**
 * GATE 4 — Tenant Detail Drawer (Support View).
 * Calls GET /api/platform-admin/tenants/[slug] and shows operational overview:
 * invoice count, last invoice, user count, client count, stock movements,
 * review-queue errors, oversell warnings, last activity timestamp.
 * Founder can act without logging in as the tenant.
 *
 * P1-UI-Agent refactor: switched from custom overlay <div> to shadcn Sheet
 * for proper focus-trap, ESC handling, scroll lock, and aria attributes.
 */
function TenantDetailDrawer({ slug, onClose, onOpenReviewQueue }: { slug: string; onClose: () => void; onOpenReviewQueue?: (slug: string) => void; }) {
  const [detail, setDetail] = useState<TenantDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [planSaving, setPlanSaving] = useState(false);
  const [planDraft, setPlanDraft] = useState<string>("");
  const [subStatusDraft, setSubStatusDraft] = useState<string>("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await authedFetch(`/api/platform-admin/tenants/${encodeURIComponent(slug)}`);
        const data = await res.json();
        if (!cancelled) {
          if (res.ok) {
            setDetail(data);
            setPlanDraft(data.tenant.plan);
            setSubStatusDraft(data.tenant.subscriptionStatus);
          } else {
            toast.error(data.error || "تعذّر تحميل التفاصيل");
          }
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [slug]);

  const savePlan = async () => {
    if (!detail) return;
    setPlanSaving(true);
    try {
      const body: Record<string, string> = {};
      if (planDraft !== detail.tenant.plan) body.plan = planDraft;
      if (subStatusDraft !== detail.tenant.subscriptionStatus) body.subscriptionStatus = subStatusDraft;
      if (Object.keys(body).length === 0) {
        toast.info("لا توجد تغييرات لحفظها");
        return;
      }
      const res = await authedFetch(`/api/platform-admin/tenants/${encodeURIComponent(slug)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "تعذّر تحديث الباقة");
      toast.success("تم تحديث الباقة بنجاح");
      setDetail((d) => d ? { ...d, tenant: { ...d.tenant, plan: data.tenant.plan, subscriptionStatus: data.tenant.subscriptionStatus } } : d);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "خطأ");
    } finally {
      setPlanSaving(false);
    }
  };

  return (
    <Sheet open={true} onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetContent
        side="left"
        dir="rtl"
        className="w-[min(560px,100vw)] max-w-none !gap-4 overflow-y-auto p-5"
        aria-describedby={undefined}
      >
        <SheetHeader className="p-0 !gap-1">
          <SheetTitle className="text-right text-[16px] font-extrabold flex items-center gap-2">
            <ChevronLeft size={18} />
            {detail?.tenant.emoji} {detail?.tenant.nameAr || detail?.tenant.name || slug}
          </SheetTitle>
        </SheetHeader>
        {loading ? (
          <div style={{ padding: "48px", textAlign: "center", color: "var(--muted-foreground)" }}>جارٍ التحميل…</div>
        ) : detail ? (
          <>
            {/* Plan management card */}
            <div style={{ padding: "14px", background: "var(--card)", borderRadius: "12px", border: "1px solid var(--border)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "10px" }}>
                <Shield size={14} style={{ color: "#7c3aed" }} />
                <span style={{ fontSize: "13px", fontWeight: 800 }}>إدارة الباقة</span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginBottom: "10px" }}>
                <div>
                  <label style={{ fontSize: "10px", color: "var(--muted-foreground)", fontWeight: 600, display: "block", marginBottom: "4px" }}>الباقة</label>
                  <select
                    value={planDraft}
                    onChange={(e) => setPlanDraft(e.target.value)}
                    style={{ width: "100%", padding: "6px 8px", background: "var(--background)", border: "1px solid var(--border)", borderRadius: "6px", color: "var(--foreground)", fontSize: "12px", fontFamily: "inherit" }}
                  >
                    <option value="trial">تجريبي (مجاني)</option>
                    <option value="starter">Starter ($9.99)</option>
                    <option value="professional">Professional ($19.99)</option>
                    <option value="unlimited">Unlimited ($29.99)</option>
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: "10px", color: "var(--muted-foreground)", fontWeight: 600, display: "block", marginBottom: "4px" }}>حالة الاشتراك</label>
                  <select
                    value={subStatusDraft}
                    onChange={(e) => setSubStatusDraft(e.target.value)}
                    style={{ width: "100%", padding: "6px 8px", background: "var(--background)", border: "1px solid var(--border)", borderRadius: "6px", color: "var(--foreground)", fontSize: "12px", fontFamily: "inherit" }}
                  >
                    <option value="active">نشط</option>
                    <option value="trialing">فترة تجريبية</option>
                    <option value="past_due">متأخر الدفع</option>
                    <option value="canceled">ملغي</option>
                    <option value="suspended">موقوف</option>
                  </select>
                </div>
              </div>
              <button
                onClick={savePlan}
                disabled={planSaving}
                style={{ padding: "7px 16px", background: planSaving ? "var(--muted)" : "#7c3aed", color: "#fff", border: "none", borderRadius: "8px", fontSize: "12px", fontWeight: 700, cursor: planSaving ? "not-allowed" : "pointer", opacity: planSaving ? 0.7 : 1, fontFamily: "inherit" }}
              >
                {planSaving ? "جارٍ الحفظ…" : "حفظ الباقة"}
              </button>
              {(planDraft !== detail.tenant.plan || subStatusDraft !== detail.tenant.subscriptionStatus) && (
                <div style={{ marginTop: "8px", fontSize: "10px", color: "#f59e0b", fontWeight: 600 }}>
                  ⚠️ تغييرات غير محفوظة
                </div>
              )}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
              <DetailStat label="الباقة الحالية" value={detail.tenant.plan} />
              <DetailStat label="الحالة" value={detail.tenant.subscriptionStatus} />
              <DetailStat label="الفواتير" value={String(detail.overview.invoicesCount)} />
              <DetailStat label="المستخدمون" value={String(detail.overview.usersCount)} />
              <DetailStat label="العملاء" value={String(detail.overview.clientsCount)} />
              <DetailStat label="حركات المخزون" value={String(detail.overview.movementsCount)} />
              <DetailStat label="عناصر بانتظار المراجعة" value={String(detail.overview.reviewQueueCount)} color={detail.overview.reviewQueueCount > 0 ? "#f59e0b" : undefined} />
              <DetailStat label="تحذيرات Oversell" value={String(detail.overview.oversellCount)} color={detail.overview.oversellCount > 0 ? "#ef4444" : undefined} />
            </div>
            {/* GATE 4 Task 2: deep-link to per-tenant ReviewQueueModal when there are pending items. */}
            {detail.overview.reviewQueueCount > 0 && onOpenReviewQueue && (
              <button
                type="button"
                onClick={() => onOpenReviewQueue(slug)}
                style={{
                  display: "inline-flex", alignItems: "center", gap: "8px",
                  padding: "10px 14px", borderRadius: "10px",
                  background: "#f59e0b", color: "#fff", border: "none",
                  fontFamily: "inherit", fontSize: "12px", fontWeight: 700, cursor: "pointer",
                  boxShadow: "0 1px 2px rgba(245,158,11,0.3)",
                }}
              >
                <ListChecks size={14} />
                افتح طابور المراجعة لهذه الشركة ({detail.overview.reviewQueueCount} عنصر)
              </button>
            )}
            <div style={{ fontSize: "11px", color: "var(--muted-foreground)" }}>
              آخر نشاط: {new Date(detail.overview.lastActivityAt).toLocaleString("ar-EG")}
            </div>
            {detail.overview.lastInvoice && (
              <div style={{ padding: "12px", background: "var(--muted)", borderRadius: "10px", fontSize: "12px" }}>
                <div style={{ fontWeight: 700, marginBottom: "4px" }}>آخر فاتورة:</div>
                <div>رقم: {detail.overview.lastInvoice.invoiceNumber}</div>
                <div>التاريخ: {new Date(detail.overview.lastInvoice.createdAt).toLocaleString("ar-EG")}</div>
                <div>الإجمالي: {detail.overview.lastInvoice.total}</div>
              </div>
            )}
            {detail.tenant.deletedAt && (
              <div style={{ padding: "8px 12px", background: "rgba(239,68,68,0.1)", borderRadius: "8px", fontSize: "11px", color: "#ef4444" }}>
                ⚠️ هذه الشركة موقوفة (soft-deleted) بتاريخ {new Date(detail.tenant.deletedAt).toLocaleString("ar-EG")}
              </div>
            )}
          </>
        ) : (
          <div style={{ padding: "32px", textAlign: "center", color: "var(--muted-foreground)" }}>تعذّر التحميل</div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function DetailStat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ padding: "10px", background: "var(--card)", borderRadius: "8px", border: "1px solid var(--border)" }}>
      <div style={{ fontSize: "10px", color: "var(--muted-foreground)", fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: "16px", fontWeight: 800, color: color || "var(--foreground)" }}>{value}</div>
    </div>
  );
}

/**
 * GATE 4 / Admin P1.1 — Ticket Detail Drawer.
 * Shows ticket body + reply thread, a reply textarea wired to POST
 * /api/platform-admin/tickets/[id]/replies, and a status dropdown wired
 * to PATCH /api/platform-admin/tickets/[id]. Both endpoints already existed
 * but had no UI caller.
 *
 * P1-UI-Agent refactor: switched from custom overlay <div> to shadcn Sheet
 * (radix-ui dialog primitive) for proper focus-trap, ESC handling, scroll
 * lock, and aria attributes. Uses shadcn Textarea for the reply input.
 * Toast feedback uses sonner (the codebase convention — 23 files use it).
 */
function TicketDetailDrawer({
  ticketId, tickets, onClose, onUpdated,
}: {
  ticketId: string;
  tickets: Ticket[];
  onClose: () => void;
  onUpdated: () => void;
}) {
  const ticket = tickets.find((t) => t.id === ticketId);
  const [replyBody, setReplyBody] = useState("");
  const [status, setStatus] = useState(ticket?.status || "open");
  const [sending, setSending] = useState(false);
  const [localReplies, setLocalReplies] = useState<TicketReply[]>(ticket?.replies || []);

  if (!ticket) {
    return null;
  }

  const sendReply = async () => {
    if (!replyBody.trim()) return;
    setSending(true);
    try {
      const res = await authedFetch(`/api/platform-admin/tickets/${encodeURIComponent(ticketId)}/replies`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: replyBody.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "فشل الإرسال");
      setLocalReplies((prev) => [...prev, data.reply]);
      setReplyBody("");
      toast.success("تم إرسال الرد");
      onUpdated();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "خطأ");
    } finally {
      setSending(false);
    }
  };

  const changeStatus = async (newStatus: string) => {
    setStatus(newStatus);
    try {
      const res = await authedFetch(`/api/platform-admin/tickets/${encodeURIComponent(ticketId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "فشل التحديث");
      toast.success(`تم تحديث الحالة إلى: ${newStatus}`);
      onUpdated();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "خطأ");
    }
  };

  return (
    <Sheet open={true} onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetContent
        side="left"
        dir="rtl"
        className="w-[min(640px,100vw)] max-w-none !gap-3.5 overflow-y-auto p-5"
        aria-describedby={undefined}
      >
        <SheetHeader className="p-0 !gap-1">
          <SheetTitle className="text-right text-[15px] font-extrabold">
            {ticket.subject}
          </SheetTitle>
          <SheetDescription className="text-right text-[11px]" dir="ltr">
            <span style={{ direction: "ltr" }}>
              {ticket.userEmail} • {new Date(ticket.createdAt).toLocaleString("ar-EG")} • الأولوية: {ticket.priority}
            </span>
          </SheetDescription>
        </SheetHeader>

        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          <label style={{ fontSize: "11px", fontWeight: 700, color: "var(--muted-foreground)" }}>الحالة:</label>
          <select value={status} onChange={(e) => changeStatus(e.target.value)} style={{ ...inputStyle, maxWidth: "180px" }}>
            <option value="open">مفتوحة</option>
            <option value="pending">بانتظار المستخدم</option>
            <option value="resolved">تم الحل</option>
            <option value="closed">مغلقة</option>
          </select>
        </div>

        {ticket.body && (
          <div style={{ padding: "12px", background: "var(--muted)", borderRadius: "10px", fontSize: "13px", lineHeight: 1.6 }}>
            <div style={{ fontSize: "10px", color: "var(--muted-foreground)", marginBottom: "6px", fontWeight: 700 }}>الرسالة الأصلية:</div>
            {ticket.body}
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          <div style={{ fontSize: "11px", fontWeight: 700, color: "var(--muted-foreground)" }}>الردود ({localReplies.length}):</div>
          {localReplies.length === 0 ? (
            <div style={{ fontSize: "12px", color: "var(--muted-foreground)", padding: "8px" }}>لا توجد ردود بعد</div>
          ) : (
            localReplies.map((r) => (
              <div key={r.id} style={{ padding: "10px", background: "var(--card)", borderRadius: "8px", border: "1px solid var(--border)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px", fontSize: "10px", color: "var(--muted-foreground)" }}>
                  <span style={{ fontWeight: 700 }}>{r.senderEmail} ({r.senderRole})</span>
                  <span>{new Date(r.createdAt).toLocaleString("ar-EG")}</span>
                </div>
                <div style={{ fontSize: "12px", lineHeight: 1.5 }}>{r.body}</div>
              </div>
            ))
          )}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginTop: "8px" }}>
          <label style={labelStyle}>إضافة رد:</label>
          <Textarea
            value={replyBody}
            onChange={(e) => setReplyBody(e.target.value)}
            rows={3}
            className="resize-y min-h-[80px]"
            placeholder="اكتب ردك هنا…"
          />
          <button
            onClick={sendReply}
            disabled={sending || !replyBody.trim()}
            style={{
              alignSelf: "flex-end", display: "inline-flex", alignItems: "center", gap: "6px",
              padding: "8px 16px", borderRadius: "8px",
              background: "var(--primary)", color: "var(--primary-foreground)",
              border: "none", fontFamily: "inherit", fontSize: "12px", fontWeight: 700,
              cursor: sending ? "not-allowed" : "pointer", opacity: (sending || !replyBody.trim()) ? 0.6 : 1,
            }}
          >
            <Send size={14} /> {sending ? "جارٍ…" : "إرسال الرد"}
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

/**
 * AI Orchestration Layer — Model Registry + Smart Router + Health Score +
 * Cost Optimizer dashboard.
 *
 * Surfaces the self-tuning AI model fleet: each model's live health score
 * (success + latency + cost + quality), the capability→primary-model routing
 * matrix, the cost-optimizer decision counts (pattern/cache hits = savings),
 * and a "Run Benchmark Now" button that re-tests every enabled model.
 */
function AiOrchestrationTab() {
  const [data, setData] = useState<null | {
    registry: Array<{
      id: number; provider: string; model: string; displayName: string;
      capabilities: string[]; tier: string; costPer1kIn: number; costPer1kOut: number;
      maxTokens: number; contextWindow: number; isEnabled: boolean; isHealthy: boolean;
      healthScore: number; successRate: number; avgLatencyMs: number; p95LatencyMs: number;
      avgQualityScore: number; totalBenchmarks: number;
      lastBenchmarkAt: string | null; lastError: string | null;
    }>;
    routingMatrix: Array<{
      capability: string;
      primary: { provider: string; model: string; displayName: string; healthScore: number; tier: string } | null;
      candidateCount: number;
    }>;
    optimizerStats: {
      counts: { "use-pattern": number; "use-cache": number; "route-free": number; "route-best": number };
      callsAvoided: number;
      estSavingsUsd: number;
    };
    recentBenchmarks: Array<{
      id: number; modelRegistryId: number; capability: string; success: boolean;
      latencyMs: number; tokensIn: number; tokensOut: number; responseQuality: number;
      errorMessage: string | null; createdAt: string;
    }>;
  }>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authedFetch("/api/platform-admin/ai-orchestration");
      const d = await res.json();
      if (res.ok) setData(d);
      else toast.error(d.error || "تعذّر التحميل");
    } finally {
      setLoading(false);
    }
  }, []);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);

  const runBenchmark = useCallback(async () => {
    setRunning(true);
    try {
      const res = await authedFetch("/api/platform-admin/ai-orchestration/run-benchmark", { method: "POST" });
      const d = await res.json();
      if (res.ok) {
        toast.success(`اكتمل الاختبار: ${d.passed}/${d.totalTests} اختبار ناجح`);
        await load();
      } else {
        toast.error(d.error || "فشل تشغيل الاختبار");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "فشل الاتصال");
    } finally {
      setRunning(false);
    }
  }, [load]);

  const toggleModel = useCallback(async (provider: string, model: string, isEnabled: boolean) => {
    try {
      const res = await authedFetch("/api/platform-admin/ai-orchestration", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider, model, isEnabled }),
      });
      if (res.ok) {
        toast.success(isEnabled ? "تم تفعيل النموذج" : "تم تعطيل النموذج");
        await load();
      } else {
        toast.error("فشل التحديث");
      }
    } catch {
      toast.error("فشل الاتصال");
    }
  }, [load]);

  if (loading) return <div style={{ padding: "48px", textAlign: "center", color: "var(--muted-foreground)" }}>جارٍ التحميل…</div>;
  if (!data) return <div style={{ padding: "48px", textAlign: "center", color: "var(--muted-foreground)" }}>تعذّر تحميل البيانات</div>;

  const fmtMs = (ms: number | null): string => {
    if (!ms) return "—";
    if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`;
    return `${ms}ms`;
  };
  const healthColor = (s: number) => s >= 7 ? "#10b981" : s >= 4 ? "#f59e0b" : "#ef4444";
  const tierBadge = (tier: string) => tier === "free"
    ? { bg: "#dcfce7", fg: "#16a34a", label: "مجاني" }
    : { bg: "#fef3c7", fg: "#d97706", label: "مدفوع" };
  const capLabel: Record<string, string> = {
    chat: "محادثة", "invoice-extraction": "استخراج الفواتير", reasoning: "استدلال", vision: "رؤية",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
      {/* Header + Run Benchmark button */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
        <div>
          <h3 style={{ fontSize: "16px", fontWeight: 800, display: "flex", alignItems: "center", gap: "8px" }}>
            <Network size={18} style={{ color: "#7c3aed" }} /> طبقة تنسيق الذكاء الاصطناعي
          </h3>
          <p style={{ fontSize: "12px", color: "var(--muted-foreground)", margin: "4px 0 0 0" }}>
            سجل النماذج + درجة الصحة + التوجيه الذكي + مُحسّن التكلفة — اختيار النموذج آلي بناءً على بيانات الأداء الحية
          </p>
        </div>
        <button
          onClick={runBenchmark}
          disabled={running}
          style={{
            display: "inline-flex", alignItems: "center", gap: "8px",
            padding: "10px 18px", borderRadius: "10px",
            background: running ? "var(--muted)" : "#7c3aed",
            color: running ? "var(--muted-foreground)" : "#fff",
            border: "1px solid var(--border)", fontFamily: "inherit", fontSize: "13px", fontWeight: 700,
            cursor: running ? "not-allowed" : "pointer", opacity: running ? 0.7 : 1,
          }}
        >
          {running ? <RefreshCw size={15} className="animate-spin" /> : <Zap size={15} />}
          {running ? "جارٍ الاختبار…" : "تشغيل الاختبار الآن"}
        </button>
      </div>

      {/* KPI row: optimizer impact */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "12px" }}>
        <KpiCard label="نداءات وُفّرت (Pattern)" value={data.optimizerStats.counts["use-pattern"]} color="#10b981" />
        <KpiCard label="نداءات وُفّرت (Cache)" value={data.optimizerStats.counts["use-cache"]} color="#3b82f6" />
        <KpiCard label="تُوجّه لمجاني" value={data.optimizerStats.counts["route-free"]} color="#7c3aed" />
        <KpiCard label="تُوجّه للأفضل" value={data.optimizerStats.counts["route-best"]} color="#f59e0b" />
        <KpiCard label="إجمالي NDاءات متجنّبة" value={data.optimizerStats.callsAvoided} color="#10b981" />
        <KpiCard label="توفير تقديري ($)" value={data.optimizerStats.estSavingsUsd.toFixed(4)} color="#10b981" />
      </div>

      {/* Routing matrix — primary model per capability */}
      <div style={{ background: "var(--card)", borderRadius: "14px", border: "1px solid var(--border)", overflow: "hidden" }}>
        <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)" }}>
          <h3 style={{ fontSize: "14px", fontWeight: 700, display: "flex", alignItems: "center", gap: "8px" }}>
            <Gauge size={16} style={{ color: "#7c3aed" }} /> مصفوفة التوجيه (النموذج الأساسي لكل قدرة)
          </h3>
          <p style={{ fontSize: "11px", color: "var(--muted-foreground)", margin: "4px 0 0 0" }}>
            لكل قدرة، يختار النظام تلقائيًا النموذج الأعلى صحةً والمتاح — لا ربط دائم باسم نموذج
          </p>
        </div>
        <div style={{ overflowX: "auto" }} className="garfix-scroll">
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr style={{ background: "var(--muted)" }}>
              <th style={th}>القدرة</th><th style={th}>النموذج الأساسي</th>
              <th style={th}>المزوّد</th><th style={th}>درجة الصحة</th>
              <th style={th}>الطبقة</th><th style={th}>عدد المرشحين</th>
            </tr></thead>
            <tbody>
              {data.routingMatrix.map((r) => {
                const tb = r.primary ? tierBadge(r.primary.tier) : null;
                return (
                  <tr key={r.capability} style={{ borderBottom: "1px solid var(--border)" }}>
                    <td style={{ ...td, fontWeight: 700 }}>{capLabel[r.capability] || r.capability}</td>
                    <td style={{ ...td, fontFamily: "monospace", fontSize: "12px", direction: "ltr", textAlign: "right" }}>
                      {r.primary ? r.primary.displayName : <span style={{ color: "var(--muted-foreground)" }}>— لا يوجد مرشح سليم —</span>}
                    </td>
                    <td style={{ ...td, fontSize: "12px" }}>{r.primary?.provider || "—"}</td>
                    <td style={{ ...td, fontWeight: 700 }}>
                      {r.primary ? (
                        <span style={{ color: healthColor(r.primary.healthScore) }}>{r.primary.healthScore.toFixed(1)} / 10</span>
                      ) : "—"}
                    </td>
                    <td style={td}>
                      {tb ? (
                        <span style={{ background: tb.bg, color: tb.fg, padding: "2px 8px", borderRadius: "6px", fontSize: "11px", fontWeight: 700 }}>{tb.label}</span>
                      ) : "—"}
                    </td>
                    <td style={td}>{r.candidateCount}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Model Registry table */}
      <div style={{ background: "var(--card)", borderRadius: "14px", border: "1px solid var(--border)", overflow: "hidden" }}>
        <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)" }}>
          <h3 style={{ fontSize: "14px", fontWeight: 700, display: "flex", alignItems: "center", gap: "8px" }}>
            <Network size={16} style={{ color: "#7c3aed" }} /> سجل النماذج ({data.registry.length})
          </h3>
          <p style={{ fontSize: "11px", color: "var(--muted-foreground)", margin: "4px 0 0 0" }}>
            كل نموذج + قدراته + طبقته + تكلفته + مقاييس الصحة الحية (تُحدّث تلقائيًا بعد كل اختبار)
          </p>
        </div>
        {data.registry.length === 0 ? (
          <div style={{ padding: "24px", textAlign: "center", color: "var(--muted-foreground)", fontSize: "12px" }}>
            السجل فارغ — شغّل <code style={{ background: "var(--muted)", padding: "2px 6px", borderRadius: "4px" }}>bun run scripts/seed-model-registry.ts</code> لملئه
          </div>
        ) : (
          <div style={{ overflowX: "auto", maxHeight: "420px", overflowY: "auto" }} className="garfix-scroll">
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead><tr style={{ background: "var(--muted)", position: "sticky", top: 0, zIndex: 1 }}>
                <th style={th}>النموذج</th><th style={th}>القدرات</th>
                <th style={th}>الطبقة</th><th style={th}>درجة الصحة</th>
                <th style={th}>النجاح</th><th style={th}>p50</th>
                <th style={th}>p95</th><th style={th}>الجودة</th>
                <th style={th}>التكلفة/1k</th><th style={th}>الاختبارات</th>
                <th style={th}>آخر اختبار</th><th style={th}>الحالة</th>
              </tr></thead>
              <tbody>
                {data.registry.map((m) => {
                  const tb = tierBadge(m.tier);
                  const costStr = m.tier === "free" ? "$0" : `$${m.costPer1kIn.toFixed(4)}/${m.costPer1kOut.toFixed(4)}`;
                  const last = m.lastBenchmarkAt ? new Date(m.lastBenchmarkAt).toLocaleString("ar-EG", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" }) : "—";
                  return (
                    <tr key={m.id} style={{ borderBottom: "1px solid var(--border)" }}>
                      <td style={{ ...td, fontFamily: "monospace", fontSize: "11px", direction: "ltr", textAlign: "right", fontWeight: 700 }}>
                        {m.provider}/{m.model}
                      </td>
                      <td style={td}>
                        <div style={{ display: "flex", gap: "4px", flexWrap: "wrap" }}>
                          {m.capabilities.map((c) => (
                            <span key={c} style={{ background: "var(--muted)", padding: "1px 6px", borderRadius: "4px", fontSize: "10px", fontWeight: 600 }}>{capLabel[c] || c}</span>
                          ))}
                        </div>
                      </td>
                      <td style={td}><span style={{ background: tb.bg, color: tb.fg, padding: "2px 8px", borderRadius: "6px", fontSize: "11px", fontWeight: 700 }}>{tb.label}</span></td>
                      <td style={{ ...td, fontWeight: 800, color: healthColor(m.healthScore) }}>{m.healthScore.toFixed(1)}</td>
                      <td style={{ ...td, fontWeight: 700, color: m.successRate >= 95 ? "#10b981" : m.successRate >= 80 ? "#f59e0b" : "#ef4444" }}>
                        {m.totalBenchmarks > 0 ? `${m.successRate.toFixed(0)}%` : "—"}
                      </td>
                      <td style={{ ...td, direction: "ltr", textAlign: "right" }}>{fmtMs(m.avgLatencyMs)}</td>
                      <td style={{ ...td, direction: "ltr", textAlign: "right", fontWeight: 700, color: (m.p95LatencyMs ?? 0) > 5000 ? "#ef4444" : (m.p95LatencyMs ?? 0) > 2000 ? "#f59e0b" : "var(--foreground)" }}>{fmtMs(m.p95LatencyMs)}</td>
                      <td style={{ ...td, fontWeight: 700 }}>{m.totalBenchmarks > 0 ? m.avgQualityScore.toFixed(1) : "—"}</td>
                      <td style={{ ...td, direction: "ltr", textAlign: "right", fontSize: "11px" }}>{costStr}</td>
                      <td style={td}>{m.totalBenchmarks}</td>
                      <td style={{ ...td, fontSize: "11px", color: "var(--muted-foreground)" }}>{last}</td>
                      <td style={td}>
                        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                          {!m.isHealthy && m.isEnabled && (
                            <span style={{ background: "#fee2e2", color: "#dc2626", padding: "1px 6px", borderRadius: "4px", fontSize: "10px", fontWeight: 700 }}>غير صحي</span>
                          )}
                          <Switch checked={m.isEnabled} onCheckedChange={(v) => toggleModel(m.provider, m.model, v)} />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Recent benchmark results */}
      {data.recentBenchmarks.length > 0 && (
        <div style={{ background: "var(--card)", borderRadius: "14px", border: "1px solid var(--border)", overflow: "hidden" }}>
          <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)" }}>
            <h3 style={{ fontSize: "14px", fontWeight: 700, display: "flex", alignItems: "center", gap: "8px" }}>
              <Activity size={16} style={{ color: "#7c3aed" }} /> آخر نتائج الاختبارات ({data.recentBenchmarks.length})
            </h3>
          </div>
          <div style={{ overflowX: "auto", maxHeight: "260px", overflowY: "auto" }} className="garfix-scroll">
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead><tr style={{ background: "var(--muted)", position: "sticky", top: 0, zIndex: 1 }}>
                <th style={th}>القدرة</th><th style={th}>الحالة</th><th style={th}>الزمن</th>
                <th style={th}>الرموز</th><th style={th}>الجودة</th><th style={th}>الوقت</th>
              </tr></thead>
              <tbody>
                {data.recentBenchmarks.slice(0, 20).map((b) => (
                  <tr key={b.id} style={{ borderBottom: "1px solid var(--border)" }}>
                    <td style={{ ...td, fontWeight: 700 }}>{capLabel[b.capability] || b.capability}</td>
                    <td style={{ ...td, fontWeight: 700, color: b.success ? "#10b981" : "#ef4444" }}>{b.success ? "✓ نجاح" : "✗ فشل"}</td>
                    <td style={{ ...td, direction: "ltr", textAlign: "right" }}>{fmtMs(b.latencyMs)}</td>
                    <td style={{ ...td, direction: "ltr", textAlign: "right", fontSize: "11px" }}>{b.tokensIn}/{b.tokensOut}</td>
                    <td style={{ ...td, fontWeight: 700 }}>{b.responseQuality.toFixed(1)}</td>
                    <td style={{ ...td, fontSize: "11px", color: "var(--muted-foreground)" }}>{new Date(b.createdAt).toLocaleTimeString("ar-EG")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Admin P2 — Feature Flags tab.
 * Wires the previously-orphaned /api/platform-admin/feature-flags (GET/POST)
 * and /api/platform-admin/feature-flags/[id] (PATCH/DELETE) endpoints into
 * a founder-facing UI. Lets the founder toggle platform-wide features on/off,
 * scope them to specific plans, and create new flags.
 */
function FeatureFlagsTab() {
  const [flags, setFlags] = useState<Array<{
    id: number; key: string; label: string; description: string | null;
    plans: string[]; isActive: boolean; createdAt: string; updatedAt: string;
  }>>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [newFlag, setNewFlag] = useState({ key: "", label: "", description: "", plans: "", isActive: true });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authedFetch("/api/platform-admin/feature-flags");
      const data = await res.json();
      if (res.ok) setFlags(data.flags || []);
      else toast.error(data.error || "تعذّر التحميل");
    } finally {
      setLoading(false);
    }
  }, []);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);

  const toggle = async (id: number, currentActive: boolean) => {
    try {
      const res = await authedFetch(`/api/platform-admin/feature-flags/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !currentActive }),
      });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || "Failed"); }
      toast.success(!currentActive ? "تم تفعيل الميزة" : "تم إيقاف الميزة");
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "خطأ");
    }
  };

  const remove = async (id: number) => {
    if (!confirm("حذف هذه الميزة نهائياً؟")) return;
    try {
      const res = await authedFetch(`/api/platform-admin/feature-flags/${id}`, { method: "DELETE" });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || "Failed"); }
      toast.success("تم الحذف");
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "خطأ");
    }
  };

  const create = async () => {
    if (!newFlag.key || !newFlag.label) { toast.error("المفتاح والتسمية مطلوبان"); return; }
    try {
      const res = await authedFetch("/api/platform-admin/feature-flags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key: newFlag.key,
          label: newFlag.label,
          description: newFlag.description || undefined,
          plans: newFlag.plans.split(",").map((s) => s.trim()).filter(Boolean),
          isActive: newFlag.isActive,
        }),
      });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || "Failed"); }
      toast.success("تم إنشاء الميزة");
      setNewFlag({ key: "", label: "", description: "", plans: "", isActive: true });
      setShowForm(false);
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "خطأ");
    }
  };

  if (loading) return <div style={{ padding: "48px", textAlign: "center", color: "var(--muted-foreground)" }}>جارٍ التحميل…</div>;

  return (
    <div style={{ background: "var(--card)", borderRadius: "14px", border: "1px solid var(--border)", overflow: "hidden" }}>
      <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h3 style={{ fontSize: "14px", fontWeight: 700, display: "flex", alignItems: "center", gap: "8px" }}>
          <Sparkles size={16} style={{ color: "#7c3aed" }} />
          ميزات المنصة ({flags.length})
        </h3>
        <button onClick={() => setShowForm((v) => !v)} style={{ display: "inline-flex", alignItems: "center", gap: "4px", padding: "6px 12px", borderRadius: "8px", background: "var(--primary)", color: "var(--primary-foreground)", border: "none", fontFamily: "inherit", fontSize: "11px", fontWeight: 700, cursor: "pointer" }}>
          <Plus size={12} /> ميزة جديدة
        </button>
      </div>
      {showForm && (
        <div style={{ padding: "16px", borderBottom: "1px solid var(--border)", background: "var(--muted)", display: "flex", flexDirection: "column", gap: "10px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
            <div>
              <label style={labelStyle}>المفتاح (key)</label>
              <input value={newFlag.key} onChange={(e) => setNewFlag({ ...newFlag, key: e.target.value })} placeholder="ai.invoice-brain" style={inputStyle} dir="ltr" />
            </div>
            <div>
              <label style={labelStyle}>التسمية (label)</label>
              <input value={newFlag.label} onChange={(e) => setNewFlag({ ...newFlag, label: e.target.value })} placeholder="محرك تعلم الفواتير" style={inputStyle} />
            </div>
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={labelStyle}>الوصف</label>
              <input value={newFlag.description} onChange={(e) => setNewFlag({ ...newFlag, description: e.target.value })} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>الباقات (افصل بفواصل)</label>
              <input value={newFlag.plans} onChange={(e) => setNewFlag({ ...newFlag, plans: e.target.value })} placeholder="trial, starter, professional" style={inputStyle} dir="ltr" />
            </div>
            <div>
              <label style={labelStyle}>الحالة</label>
              <select value={newFlag.isActive ? "1" : "0"} onChange={(e) => setNewFlag({ ...newFlag, isActive: e.target.value === "1" })} style={inputStyle}>
                <option value="1">نشطة</option>
                <option value="0">موقوفة</option>
              </select>
            </div>
          </div>
          <button onClick={create} style={{ alignSelf: "flex-end", padding: "8px 20px", borderRadius: "8px", background: "var(--primary)", color: "var(--primary-foreground)", border: "none", fontFamily: "inherit", fontSize: "12px", fontWeight: 700, cursor: "pointer" }}>إنشاء</button>
        </div>
      )}
      {flags.length === 0 ? (
        <div style={{ padding: "32px", textAlign: "center", color: "var(--muted-foreground)" }}>لا توجد ميزات بعد</div>
      ) : (
        <div style={{ overflowX: "auto" }} className="garfix-scroll">
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr style={{ background: "var(--muted)" }}>
              <th style={th}>المفتاح</th><th style={th}>التسمية</th><th style={th}>الباقات</th>
              <th style={th}>الحالة</th><th style={th}>إجراءات</th>
            </tr></thead>
            <tbody>
              {flags.map((f) => (
                <tr key={f.id} style={{ borderBottom: "1px solid var(--border)" }}>
                  <td style={{ ...td, fontFamily: "monospace", direction: "ltr", textAlign: "right" }}>{f.key}</td>
                  <td style={{ ...td, fontWeight: 700 }}>{f.label}</td>
                  <td style={td}>{f.plans.length === 0 ? "الكل" : f.plans.join(", ")}</td>
                  <td style={td}>
                    <span style={{ padding: "2px 10px", borderRadius: "12px", background: f.isActive ? "rgba(16,185,129,0.15)" : "rgba(156,163,175,0.15)", color: f.isActive ? "#10b981" : "#9ca3af", fontSize: "11px", fontWeight: 700 }}>
                      {f.isActive ? "نشطة" : "موقوفة"}
                    </span>
                  </td>
                  <td style={td}>
                    <div style={{ display: "flex", gap: "4px" }}>
                      <button onClick={() => toggle(f.id, f.isActive)} style={iconBtn(f.isActive ? "#f59e0b" : "#10b981")} title={f.isActive ? "إيقاف" : "تفعيل"}>
                        {f.isActive ? <X size={14} /> : <Check size={14} />}
                      </button>
                      <button onClick={() => remove(f.id)} style={iconBtn("#ef4444")} title="حذف">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/**
 * Admin P2 — AI Usage tab.
 * Wires the previously-orphaned /api/platform-admin/ai-usage endpoint into
 * a founder-facing dashboard. Shows totals, 30-day trend, per-company /
 * per-endpoint / per-model breakdowns, and recent errors.
 */
function AiUsageTab() {
  const [data, setData] = useState<null | {
    totals: {
      totalCalls: number; totalCost: number; totalTokensIn: number;
      totalTokensOut: number; totalTokens: number; successCount: number; failureCount: number;
      callsToday: number; successRate: number | null;
    };
    last30Days: Array<{ date: string; calls: number; cost: number }>;
    perCompany: Array<{ companySlug: string; calls: number; cost: number; tokens: number }>;
    perEndpoint: Array<{
      endpoint: string; calls: number; cost: number; tokens: number;
      successCount: number; failureCount: number; successRate: number | null;
      p50Ms: number | null; p95Ms: number | null; minMs: number | null;
      maxMs: number | null; avgMs: number | null;
    }>;
    perModel: Array<{ model: string; calls: number; cost: number; tokens: number }>;
    perCompanyMonthly: Array<{ companySlug: string; month: string; calls: number; tokens: number; cost: number }>;
    recentErrors: Array<{
      id: number; companySlug: string | null; provider: string; model: string;
      endpoint: string; errorMessage: string | null; createdAt: string;
    }>;
  }>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authedFetch("/api/platform-admin/ai-usage");
      const d = await res.json();
      if (res.ok) setData(d);
      else toast.error(d.error || "تعذّر التحميل");
    } finally {
      setLoading(false);
    }
  }, []);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);

  if (loading) return <div style={{ padding: "48px", textAlign: "center", color: "var(--muted-foreground)" }}>جارٍ التحميل…</div>;
  if (!data) return <div style={{ padding: "48px", textAlign: "center", color: "var(--muted-foreground)" }}>تعذّر تحميل البيانات</div>;

  // P0.3: helper to format ms nicely (e.g. "1.2s" or "340ms")
  const fmtMs = (ms: number | null): string => {
    if (ms === null || ms === undefined) return "—";
    if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`;
    return `${ms}ms`;
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "12px" }}>
        <KpiCard label="نداءات اليوم" value={data.totals.callsToday} color="#7c3aed" />
        <KpiCard label="إجمالي النداءات" value={data.totals.totalCalls} color="#7c3aed" />
        <KpiCard label="معدل النجاح" value={data.totals.successRate !== null ? `${data.totals.successRate}%` : "—"} color="#10b981" />
        <KpiCard label="التكلفة ($)" value={data.totals.totalCost.toFixed(4)} color="#10b981" />
        <KpiCard label="إجمالي الرموز" value={data.totals.totalTokens} color="#3b82f6" />
        <KpiCard label="فشل" value={data.totals.failureCount} color="#ef4444" />
      </div>

      {/* P0.3 (AI Effectiveness prompt): per-endpoint latency + effectiveness table.
          This is the "فعالية العقل والوقت المستغرق" view — calls, success rate,
          p50/p95 latency, and cost broken down by endpoint, so the founder can
          see at a glance which AI paths are fast/reliable and which aren't. */}
      <div style={{ background: "var(--card)", borderRadius: "14px", border: "1px solid var(--border)", overflow: "hidden" }}>
        <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)" }}>
          <h3 style={{ fontSize: "14px", fontWeight: 700, display: "flex", alignItems: "center", gap: "8px" }}>
            <Activity size={16} style={{ color: "#7c3aed" }} />
            فعالية وزمن كل Endpoint ({data.perEndpoint.length})
          </h3>
          <p style={{ fontSize: "11px", color: "var(--muted-foreground)", margin: "4px 0 0 0" }}>
            معدل النجاح + توزيع الزمن (p50/p95) لكل مسار ذكاء اصطناعي — هذا هو&quot;فعالية العقل والوقت المستغرق&quot;
          </p>
        </div>
        {data.perEndpoint.length === 0 ? (
          <div style={{ padding: "24px", textAlign: "center", color: "var(--muted-foreground)", fontSize: "12px" }}>لا توجد بيانات استهلاك AI بعد — استخدم المساعد الذكي أو رفع فاتورة لبدء التسجيل</div>
        ) : (
          <div style={{ overflowX: "auto" }} className="garfix-scroll">
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead><tr style={{ background: "var(--muted)" }}>
                <th style={th}>Endpoint</th><th style={th}>النداءات</th>
                <th style={th}>معدل النجاح</th><th style={th}>p50</th>
                <th style={th}>p95</th><th style={th}>min</th>
                <th style={th}>max</th><th style={th}>avg</th>
                <th style={th}>التكلفة</th>
              </tr></thead>
              <tbody>
                {data.perEndpoint.map((e) => (
                  <tr key={e.endpoint} style={{ borderBottom: "1px solid var(--border)" }}>
                    <td style={{ ...td, fontFamily: "monospace", fontSize: "11px", direction: "ltr", textAlign: "right", fontWeight: 700 }}>{e.endpoint}</td>
                    <td style={td}>{e.calls}</td>
                    <td style={{ ...td, fontWeight: 700, color: e.successRate === null ? "var(--muted-foreground)" : (e.successRate >= 95 ? "#10b981" : e.successRate >= 80 ? "#f59e0b" : "#ef4444") }}>
                      {e.successRate !== null ? `${e.successRate}%` : "—"}
                    </td>
                    <td style={{ ...td, direction: "ltr", textAlign: "right" }}>{fmtMs(e.p50Ms)}</td>
                    <td style={{ ...td, direction: "ltr", textAlign: "right", fontWeight: 700, color: (e.p95Ms ?? 0) > 5000 ? "#ef4444" : (e.p95Ms ?? 0) > 2000 ? "#f59e0b" : "var(--foreground)" }}>{fmtMs(e.p95Ms)}</td>
                    <td style={{ ...td, direction: "ltr", textAlign: "right", fontSize: "11px", color: "var(--muted-foreground)" }}>{fmtMs(e.minMs)}</td>
                    <td style={{ ...td, direction: "ltr", textAlign: "right", fontSize: "11px", color: "var(--muted-foreground)" }}>{fmtMs(e.maxMs)}</td>
                    <td style={{ ...td, direction: "ltr", textAlign: "right" }}>{fmtMs(e.avgMs)}</td>
                    <td style={{ ...td, direction: "ltr", textAlign: "right" }}>${e.cost.toFixed(4)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div style={{ background: "var(--card)", borderRadius: "14px", border: "1px solid var(--border)", padding: "16px" }}>
        <h3 style={{ fontSize: "14px", fontWeight: 700, marginBottom: "12px", display: "flex", alignItems: "center", gap: "8px" }}>
          <Activity size={16} style={{ color: "#7c3aed" }} />
          استهلاك آخر ٣٠ يوماً ({data.last30Days.length} يوم)
        </h3>
        {data.last30Days.length === 0 ? (
          <div style={{ padding: "24px", textAlign: "center", color: "var(--muted-foreground)", fontSize: "12px" }}>لا توجد بيانات</div>
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={data.last30Days}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="date" tick={{ fontSize: 9, fill: "var(--muted-foreground)" }} />
              <YAxis tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} allowDecimals={false} />
              <Tooltip contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: "8px" }} />
              <Bar dataKey="calls" fill="var(--primary)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "16px" }}>
        <UsageTable title="حسب الشركة" rows={data.perCompany.map((c) => ({ col1: c.companySlug, col2: String(c.calls), col3: `$${c.cost.toFixed(4)}`, col4: String(c.tokens) }))} headers={["الشركة", "النداءات", "التكلفة", "الرموز"]} />
        <UsageTable title="حسب الموديل" rows={data.perModel.map((m) => ({ col1: m.model, col2: String(m.calls), col3: `$${m.cost.toFixed(4)}`, col4: String(m.tokens) }))} headers={["الموديل", "النداءات", "التكلفة", "الرموز"]} />
      </div>

      {/*
        GATE 4 Task 3 — per-tenant × per-month AI usage ledger.
        Shows: tenant | month | AI calls | tokens | cost — the exact shape
        requested in the spec. Renders above the recent-errors card.
      */}
      <div style={{ background: "var(--card)", borderRadius: "14px", border: "1px solid var(--border)", overflow: "hidden" }}>
        <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)" }}>
          <h3 style={{ fontSize: "14px", fontWeight: 700, display: "flex", alignItems: "center", gap: "8px" }}>
            <Activity size={16} style={{ color: "#7c3aed" }} />
            استهلاك AI لكل شركة × شهر ({data.perCompanyMonthly.length} صف)
          </h3>
        </div>
        {data.perCompanyMonthly.length === 0 ? (
          <div style={{ padding: "24px", textAlign: "center", color: "var(--muted-foreground)", fontSize: "12px" }}>لا توجد بيانات استهلاك AI بعد</div>
        ) : (
          <div style={{ overflowX: "auto" }} className="garfix-scroll">
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead><tr style={{ background: "var(--muted)" }}>
                <th style={th}>الشركة</th><th style={th}>الشهر</th>
                <th style={th}>نداءات AI</th><th style={th}>الرموز</th><th style={th}>التكلفة</th>
              </tr></thead>
              <tbody>
                {data.perCompanyMonthly.slice(0, 200).map((row, i) => (
                  <tr key={`${row.companySlug}-${row.month}-${i}`} style={{ borderBottom: "1px solid var(--border)" }}>
                    <td style={{ ...td, fontFamily: "monospace", fontSize: "11px", direction: "ltr", textAlign: "right" }}>{row.companySlug}</td>
                    <td style={{ ...td, direction: "ltr", textAlign: "right" }}>{row.month}</td>
                    <td style={td}>{row.calls}</td>
                    <td style={td}>{row.tokens.toLocaleString("en-US")}</td>
                    <td style={{ ...td, direction: "ltr", textAlign: "right", fontWeight: 700 }}>${row.cost.toFixed(4)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {data.recentErrors.length > 0 && (
        <div style={{ background: "var(--card)", borderRadius: "14px", border: "1px solid var(--border)", overflow: "hidden" }}>
          <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)" }}>
            <h3 style={{ fontSize: "14px", fontWeight: 700, color: "#ef4444", display: "flex", alignItems: "center", gap: "8px" }}>
              <AlertTriangle size={16} /> أخطاء حديثة ({data.recentErrors.length})
            </h3>
          </div>
          <div style={{ overflowX: "auto" }} className="garfix-scroll">
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead><tr style={{ background: "var(--muted)" }}>
                <th style={th}>الوقت</th><th style={th}>المزود</th><th style={th}>الموديل</th>
                <th style={th}>الشركة</th><th style={th}>الخطأ</th>
              </tr></thead>
              <tbody>
                {data.recentErrors.map((e) => (
                  <tr key={e.id} style={{ borderBottom: "1px solid var(--border)" }}>
                    <td style={td}>{new Date(e.createdAt).toLocaleString("ar-EG")}</td>
                    <td style={td}>{e.provider}</td>
                    <td style={{ ...td, fontFamily: "monospace", fontSize: "11px" }}>{e.model}</td>
                    <td style={{ ...td, fontFamily: "monospace", fontSize: "11px" }}>{e.companySlug || "—"}</td>
                    <td style={{ ...td, fontSize: "11px", color: "#fca5a5", direction: "ltr", textAlign: "right" }}>{(e.errorMessage || "").slice(0, 200)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function UsageTable({ title, headers, rows }: { title: string; headers: string[]; rows: Array<{ col1: string; col2: string; col3: string; col4: string }> }) {
  return (
    <div style={{ background: "var(--card)", borderRadius: "14px", border: "1px solid var(--border)", overflow: "hidden" }}>
      <div style={{ padding: "10px 12px", borderBottom: "1px solid var(--border)" }}>
        <h4 style={{ fontSize: "12px", fontWeight: 700 }}>{title}</h4>
      </div>
      {rows.length === 0 ? (
        <div style={{ padding: "16px", textAlign: "center", color: "var(--muted-foreground)", fontSize: "11px" }}>لا توجد بيانات</div>
      ) : (
        <div style={{ overflowX: "auto" }} className="garfix-scroll">
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr style={{ background: "var(--muted)" }}>
              {headers.map((h) => <th key={h} style={th}>{h}</th>)}
            </tr></thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} style={{ borderBottom: "1px solid var(--border)" }}>
                  <td style={{ ...td, fontWeight: 700, fontFamily: "monospace", fontSize: "11px", direction: "ltr", textAlign: "right" }}>{r.col1}</td>
                  <td style={td}>{r.col2}</td>
                  <td style={{ ...td, direction: "ltr", textAlign: "right" }}>{r.col3}</td>
                  <td style={td}>{r.col4}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/**
 * P1.8 fix (Remaining Work Handoff) — Review Queue management screen.
 * Lists pending ProductMatchAudit entries (tier="suggested" + tier="collision-
 * recovery-failed") across ALL tenants, with a per-tenant breakdown. Founder
 * can filter by tier or by tenant. Each row shows the input text, the matched
 * product (if any), confidence, tier, and a deep link to the per-tenant
 * /api/product-matching/review endpoint for accept/reject/override actions.
 *
 * The accept/reject/override mutations are intentionally NOT built here —
 * they belong on the per-tenant review endpoint (which already has the
 * proper permission gating). This founder view is read-only aggregation.
 */
function ReviewQueueTab({ onOpenReviewQueue }: { onOpenReviewQueue: (slug: string | null) => void }) {
  const [data, setData] = useState<{
    items: Array<{
      id: number; companySlug: string; inputText: string;
      matchedProductId: number | null; matchedAlias: string | null;
      confidence: number; tier: string; action: string;
      invoiceId: number | null; productName: string | null; productCode: string | null;
      createdAt: string;
    }>;
    count: number;
    byTenant: Array<{ companySlug: string; count: number }>;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [tierFilter, setTierFilter] = useState<string>(""); // "" = both
  const [tenantFilter, setTenantFilter] = useState<string>(""); // "" = all

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: "200" });
      if (tierFilter) params.set("tier", tierFilter);
      if (tenantFilter) params.set("companySlug", tenantFilter);
      const res = await authedFetch(`/api/platform-admin/review-queue?${params}`);
      const d = await res.json();
      if (res.ok) setData(d);
      else toast.error(d.error || "تعذّر التحميل");
    } finally {
      setLoading(false);
    }
  }, [tierFilter, tenantFilter]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);

  if (loading) return <div style={{ padding: "48px", textAlign: "center", color: "var(--muted-foreground)" }}>جارٍ التحميل…</div>;
  if (!data) return <div style={{ padding: "48px", textAlign: "center", color: "var(--muted-foreground)" }}>تعذّر التحميل</div>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
      {/* Per-tenant breakdown chips */}
      {data.byTenant.length > 0 && (
        <div style={{ background: "var(--card)", borderRadius: "14px", border: "1px solid var(--border)", padding: "12px 16px" }}>
          <h3 style={{ fontSize: "13px", fontWeight: 700, marginBottom: "8px", display: "flex", alignItems: "center", gap: "6px" }}>
            <ListChecks size={14} style={{ color: "#7c3aed" }} />
            التوزيع حسب الشركة ({data.byTenant.length} شركة)
          </h3>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
            {data.byTenant.map((t) => (
              <button
                key={t.companySlug}
                onClick={() => setTenantFilter(tenantFilter === t.companySlug ? "" : t.companySlug)}
                style={{
                  padding: "4px 10px", borderRadius: "12px",
                  background: tenantFilter === t.companySlug ? "var(--primary)" : "var(--muted)",
                  color: tenantFilter === t.companySlug ? "var(--primary-foreground)" : "var(--foreground)",
                  border: "1px solid var(--border)", fontFamily: "inherit",
                  fontSize: "11px", fontWeight: 700, cursor: "pointer",
                }}
              >
                {t.companySlug}: {t.count}
              </button>
            ))}
          </div>
        </div>
      )}

      <div style={{ background: "var(--card)", borderRadius: "14px", border: "1px solid var(--border)", overflow: "hidden" }}>
        <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "8px" }}>
          <h3 style={{ fontSize: "14px", fontWeight: 700, display: "flex", alignItems: "center", gap: "8px" }}>
            <AlertTriangle size={16} style={{ color: "#f59e0b" }} />
            عناصر بانتظار المراجعة ({data.count})
          </h3>
          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            <button
              type="button"
              onClick={() => onOpenReviewQueue(null)}
              style={{
                display: "inline-flex", alignItems: "center", gap: "6px",
                padding: "6px 12px", borderRadius: "8px",
                background: "#7c3aed", color: "#fff", border: "none",
                fontFamily: "inherit", fontSize: "11px", fontWeight: 700, cursor: "pointer",
              }}
              title="افتح نافذة المراجعة لكل الشركات (founder cross-tenant)"
            >
              <Eye size={12} /> افتح كل الشركات
            </button>
            <select
              value={tierFilter}
              onChange={(e) => setTierFilter(e.target.value)}
              style={{ ...inputStyle, maxWidth: "200px" }}
            >
              <option value="">كل الأنواع</option>
              <option value="suggested">مقترح (suggested)</option>
              <option value="collision-recovery-failed">فشل التطابق (collision)</option>
            </select>
            {(tierFilter || tenantFilter) && (
              <button
                onClick={() => { setTierFilter(""); setTenantFilter(""); }}
                style={{ ...iconBtn("#9ca3af"), padding: "4px 8px", width: "auto" }}
              >
                مسح الفلاتر
              </button>
            )}
          </div>
        </div>
        {data.items.length === 0 ? (
          <div style={{ padding: "48px", textAlign: "center", color: "var(--muted-foreground)" }}>
            ✅ لا توجد عناصر بانتظار المراجعة — جميع التطابقات تتم بنجاح.
          </div>
        ) : (
          <div style={{ overflowX: "auto" }} className="garfix-scroll">
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead><tr style={{ background: "var(--muted)" }}>
                <th style={th}>الشركة</th><th style={th}>النص المُدخل</th>
                <th style={th}>المنتج المُطابق</th><th style={th}>الثقة</th>
                <th style={th}>النوع</th><th style={th}>التاريخ</th><th style={th}>إجراء</th>
              </tr></thead>
              <tbody>
                {data.items.map((item) => (
                  <tr key={item.id} style={{ borderBottom: "1px solid var(--border)" }}>
                    <td style={{ ...td, fontFamily: "monospace", fontSize: "11px" }}>{item.companySlug}</td>
                    <td style={{ ...td, maxWidth: "240px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={item.inputText}>
                      {item.inputText}
                    </td>
                    <td style={td}>
                      {item.productName ? (
                        <span style={{ fontSize: "11px" }}>
                          {item.productName}
                          {item.productCode && <span style={{ color: "var(--muted-foreground)", fontFamily: "monospace" }}> ({item.productCode})</span>}
                        </span>
                      ) : (
                        <span style={{ fontSize: "11px", color: "#fca5a5" }}>— لا يطابق —</span>
                      )}
                    </td>
                    <td style={{ ...td, direction: "ltr", textAlign: "right" }}>
                      <span style={{
                        padding: "2px 8px", borderRadius: "8px", fontSize: "10px", fontWeight: 700,
                        background: item.confidence >= 0.85 ? "rgba(16,185,129,0.15)" : item.confidence >= 0.7 ? "rgba(245,158,11,0.15)" : "rgba(239,68,68,0.15)",
                        color: item.confidence >= 0.85 ? "#10b981" : item.confidence >= 0.7 ? "#f59e0b" : "#ef4444",
                      }}>
                        {(item.confidence * 100).toFixed(0)}%
                      </span>
                    </td>
                    <td style={td}>
                      <span style={{
                        padding: "2px 8px", borderRadius: "8px", fontSize: "10px", fontWeight: 700,
                        background: item.tier === "collision-recovery-failed" ? "rgba(239,68,68,0.15)" : "rgba(245,158,11,0.15)",
                        color: item.tier === "collision-recovery-failed" ? "#ef4444" : "#f59e0b",
                      }}>
                        {item.tier}
                      </span>
                    </td>
                    <td style={td}>{new Date(item.createdAt).toLocaleString("ar-EG")}</td>
                    <td style={td}>
                      <button
                        type="button"
                        onClick={() => onOpenReviewQueue(item.companySlug)}
                        style={iconBtn("#3b82f6")}
                        title="فتح صفحة المراجعة الخاصة بالشركة"
                      >
                        <Eye size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * P1.8 fix — small utilization bar for the tenants table.
 * Shows current/max + a colored progress bar (green < 70%, amber < 90%, red ≥ 90%).
 */
function UtilizationBar({ label, current, max, pct }: { label: string; current: number; max: number; pct: number }) {
  const color = pct >= 90 ? "#ef4444" : pct >= 70 ? "#f59e0b" : "#10b981";
  const displayMax = max >= 999999 ? "∞" : String(max);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "10px", color: "var(--muted-foreground)" }}>
        <span>{label}</span>
        <span style={{ direction: "ltr" }}>{current} / {displayMax}</span>
      </div>
      <div style={{ height: "4px", borderRadius: "2px", background: "var(--muted)", overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${Math.min(100, pct)}%`, background: color, transition: "width .2s" }} />
      </div>
    </div>
  );
}

/**
 * Admin P2 — Landing Content tab.
 * Wires the previously-orphaned /api/platform-admin/landing-content
 * (GET/PATCH) endpoints into a founder-facing CMS UI. Lists every
 * LandingContent row (key + JSON value + last-updated metadata) and
 * lets the founder inline-edit scalar values (hero title/subtitle/CTA)
 * and JSON-array values (features list). Save calls PATCH with
 * { key, value }.
 *
 * Note: the backend is generic (any key, any JSON value) so this UI
 * stays generic — it renders a key→value editor. The landing page
 * module reads whatever keys it needs; this panel just writes them.
 */
function LandingContentTab() {
  const [items, setItems] = useState<Array<{
    key: string;
    value: unknown;
    updatedAt: string;
    updatedBy: string | null;
  }>>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [newKey, setNewKey] = useState("");
  const [newValue, setNewValue] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authedFetch("/api/platform-admin/landing-content");
      const d = await res.json();
      if (res.ok) {
        setItems(d.items || []);
        // Seed drafts: stringify objects/arrays as pretty JSON; leave strings as-is.
        const seed: Record<string, string> = {};
        for (const it of (d.items || []) as Array<{ key: string; value: unknown }>) {
          seed[it.key] = typeof it.value === "string" ? it.value : JSON.stringify(it.value, null, 2);
        }
        setDrafts(seed);
      } else {
        toast.error(d.error || "تعذّر التحميل");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);

  const save = async (key: string) => {
    const raw = drafts[key];
    if (raw === undefined) return;
    // Try to parse JSON; if it fails, send as a plain string.
    let value: unknown = raw;
    const trimmed = raw.trim();
    if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
      try {
        value = JSON.parse(trimmed);
      } catch {
        toast.error("JSON غير صالح — راجع الصياغة");
        return;
      }
    }
    setSavingKey(key);
    try {
      const res = await authedFetch("/api/platform-admin/landing-content", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, value }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Failed");
      toast.success("تم حفظ المحتوى");
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "خطأ");
    } finally {
      setSavingKey(null);
    }
  };

  const create = async () => {
    if (!newKey.trim()) { toast.error("المفتاح مطلوب"); return; }
    setSavingKey("__new__");
    try {
      let value: unknown = newValue;
      const trimmed = newValue.trim();
      if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
        try { value = JSON.parse(trimmed); } catch {
          toast.error("JSON غير صالح"); setSavingKey(null); return;
        }
      }
      const res = await authedFetch("/api/platform-admin/landing-content", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: newKey.trim(), value }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Failed");
      toast.success("تم إنشاء المحتوى");
      setNewKey(""); setNewValue(""); setShowCreate(false);
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "خطأ");
    } finally {
      setSavingKey(null);
    }
  };

  if (loading) return <div style={{ padding: "48px", textAlign: "center", color: "var(--muted-foreground)" }}>جارٍ التحميل…</div>;

  return (
    <div style={{ background: "var(--card)", borderRadius: "14px", border: "1px solid var(--border)", overflow: "hidden" }}>
      <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "8px" }}>
        <h3 style={{ fontSize: "14px", fontWeight: 700, display: "flex", alignItems: "center", gap: "8px" }}>
          <FileText size={16} style={{ color: "#10b981" }} />
          محتوى الصفحة الرئيسية ({items.length})
        </h3>
        <button onClick={() => setShowCreate((v) => !v)} style={{ display: "inline-flex", alignItems: "center", gap: "4px", padding: "6px 12px", borderRadius: "8px", background: "var(--primary)", color: "var(--primary-foreground)", border: "none", fontFamily: "inherit", fontSize: "11px", fontWeight: 700, cursor: "pointer" }}>
          <Plus size={12} /> مفتاح جديد
        </button>
      </div>

      {showCreate && (
        <div style={{ padding: "16px", borderBottom: "1px solid var(--border)", background: "var(--muted)", display: "flex", flexDirection: "column", gap: "10px" }}>
          <div>
            <label style={labelStyle}>المفتاح (مثال: hero.title)</label>
            <Input value={newKey} onChange={(e) => setNewKey(e.target.value)} placeholder="hero.title" dir="ltr" />
          </div>
          <div>
            <label style={labelStyle}>القيمة (نص أو JSON)</label>
            <Textarea value={newValue} onChange={(e) => setNewValue(e.target.value)} rows={3} placeholder="مرحباً بكم في GarfiX" className="resize-y" />
          </div>
          <button onClick={create} disabled={savingKey === "__new__"} style={{ alignSelf: "flex-end", display: "inline-flex", alignItems: "center", gap: "6px", padding: "8px 20px", borderRadius: "8px", background: "var(--primary)", color: "var(--primary-foreground)", border: "none", fontFamily: "inherit", fontSize: "12px", fontWeight: 700, cursor: "pointer", opacity: savingKey === "__new__" ? 0.7 : 1 }}>
            <Save size={14} /> {savingKey === "__new__" ? "جارٍ…" : "إنشاء"}
          </button>
        </div>
      )}

      {items.length === 0 ? (
        <div style={{ padding: "32px", textAlign: "center", color: "var(--muted-foreground)" }}>
          لا يوجد محتوى بعد. أنشئ مفتاحاً جديداً (مثل <code style={{ fontFamily: "monospace" }}>hero.title</code>) ليقرأه صفحة الواجهة.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column" }}>
          {items.map((it) => {
            const isJson = typeof it.value === "object" && it.value !== null;
            return (
              <div key={it.key} style={{ padding: "14px 16px", borderBottom: "1px solid var(--border)", display: "flex", flexDirection: "column", gap: "8px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
                  <code style={{ fontFamily: "monospace", fontSize: "12px", fontWeight: 700, direction: "ltr", color: "var(--foreground)" }}>{it.key}</code>
                  <span style={{ fontSize: "10px", color: "var(--muted-foreground)" }}>
                    آخر تحديث: {new Date(it.updatedAt).toLocaleString("ar-EG")} {it.updatedBy ? `• ${it.updatedBy}` : ""}
                  </span>
                </div>
                <Textarea
                  value={drafts[it.key] ?? ""}
                  onChange={(e) => setDrafts({ ...drafts, [it.key]: e.target.value })}
                  rows={isJson ? 5 : 2}
                  className="resize-y"
                  dir="ltr"
                  style={{ fontFamily: isJson ? "monospace" : "inherit", fontSize: "12px" }}
                />
                <div style={{ display: "flex", justifyContent: "flex-end" }}>
                  <button
                    onClick={() => save(it.key)}
                    disabled={savingKey === it.key}
                    style={{ display: "inline-flex", alignItems: "center", gap: "6px", padding: "6px 14px", borderRadius: "8px", background: "var(--primary)", color: "var(--primary-foreground)", border: "none", fontFamily: "inherit", fontSize: "11px", fontWeight: 700, cursor: "pointer", opacity: savingKey === it.key ? 0.7 : 1 }}
                  >
                    <Save size={12} /> {savingKey === it.key ? "جارٍ…" : "حفظ"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/**
 * Admin P2 — Integrations tab.
 * Wires the previously-orphaned /api/platform-admin/integrations
 * (GET/PATCH) endpoints into a founder-facing UI. Lists each
 * integration (WhatsApp, MyFatoorah, Meta Ads) with its connection
 * status + a "Configure" button that opens a Dialog with the
 * integration's requiredFields form. Save calls PATCH with
 * { type, credentials }. Disconnect calls PATCH with { type, disconnect: true }.
 *
 * Note: the backend stores credentials encrypted via cryptoVault and
 * only exposes which fields are set (boolean) — never the raw values.
 * So the form fields start empty on every open; saving overwrites them.
 */
function IntegrationsTab() {
  const [integrations, setIntegrations] = useState<Array<{
    type: string;
    name: string;
    description: string;
    requiredFields: Array<{ key: string; label: string; type: "text" | "password" }>;
    hasCredentials: boolean;
    credentialsLastUpdatedAt: string | null;
    isRegistered: boolean;
  }>>([]);
  const [loading, setLoading] = useState(true);
  const [configuringType, setConfiguringType] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authedFetch("/api/platform-admin/integrations");
      const d = await res.json();
      if (res.ok) setIntegrations(d.integrations || []);
      else toast.error(d.error || "تعذّر التحميل");
    } finally {
      setLoading(false);
    }
  }, []);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);

  const disconnect = async (type: string) => {
    if (!confirm(`قطع اتصال التكامل "${type}"؟ ستحذف بيانات الاعتماد المشفّرة.`)) return;
    try {
      const res = await authedFetch("/api/platform-admin/integrations", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, disconnect: true }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Failed");
      toast.success("تم قطع الاتصال");
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "خطأ");
    }
  };

  if (loading) return <div style={{ padding: "48px", textAlign: "center", color: "var(--muted-foreground)" }}>جارٍ التحميل…</div>;

  const configuring = integrations.find((i) => i.type === configuringType) || null;

  return (
    <div style={{ background: "var(--card)", borderRadius: "14px", border: "1px solid var(--border)", overflow: "hidden" }}>
      <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "8px" }}>
        <h3 style={{ fontSize: "14px", fontWeight: 700, display: "flex", alignItems: "center", gap: "8px" }}>
          <Plug size={16} style={{ color: "#10b981" }} />
          التكاملات ({integrations.length})
        </h3>
        <button onClick={load} style={iconBtn("#10b981")}><Activity size={14} /> تحديث</button>
      </div>

      {integrations.length === 0 ? (
        <div style={{ padding: "32px", textAlign: "center", color: "var(--muted-foreground)" }}>لا توجد تكاملات مسجّلة</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column" }}>
          {integrations.map((it) => (
            <div key={it.type} style={{ padding: "14px 16px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: "3px", flex: "1 1 240px", minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <span style={{ fontSize: "13px", fontWeight: 800 }}>{it.name}</span>
                  <code style={{ fontFamily: "monospace", fontSize: "10px", padding: "1px 6px", borderRadius: "4px", background: "var(--muted)", color: "var(--muted-foreground)" }}>{it.type}</code>
                </div>
                <div style={{ fontSize: "11px", color: "var(--muted-foreground)", lineHeight: 1.5 }}>{it.description}</div>
                <div style={{ fontSize: "10px", color: "var(--muted-foreground)", marginTop: "2px" }}>
                  {it.hasCredentials ? (
                    <>
                      <span style={{ color: "#10b981", fontWeight: 700 }}>● مُهيّأ</span>
                      {it.credentialsLastUpdatedAt && <> • آخر تحديث: {new Date(it.credentialsLastUpdatedAt).toLocaleString("ar-EG")}</>}
                    </>
                  ) : (
                    <span style={{ color: "#9ca3af", fontWeight: 700 }}>○ غير مُهيّأ</span>
                  )}
                  {!it.isRegistered && <span style={{ color: "#ef4444", marginRight: "8px" }}> • غير مسجّل</span>}
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <Switch
                  checked={it.hasCredentials}
                  onCheckedChange={(checked) => {
                    if (checked) setConfiguringType(it.type);
                    else disconnect(it.type);
                  }}
                  aria-label={`تفعيل ${it.name}`}
                />
                <button
                  onClick={() => setConfiguringType(it.type)}
                  title="إعدادات"
                  style={{ ...iconBtn("#10b981"), width: "auto", padding: "4px 10px" }}
                >
                  <Settings size={12} /> إعدادات
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {configuring && (
        <IntegrationConfigDialog
          integration={configuring}
          onClose={() => setConfiguringType(null)}
          onSaved={() => { setConfiguringType(null); load(); }}
        />
      )}
    </div>
  );
}

function IntegrationConfigDialog({
  integration, onClose, onSaved,
}: {
  integration: {
    type: string; name: string;
    requiredFields: Array<{ key: string; label: string; type: "text" | "password" }>;
  };
  onClose: () => void;
  onSaved: () => void;
}) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    // Validate required fields
    const missing = integration.requiredFields
      .filter((f) => !values[f.key] || values[f.key].trim() === "")
      .map((f) => f.label);
    if (missing.length > 0) { toast.error(`حقول ناقصة: ${missing.join("، ")}`); return; }
    setSaving(true);
    try {
      const res = await authedFetch("/api/platform-admin/integrations", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: integration.type, credentials: values }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Failed");
      toast.success("تم حفظ بيانات الاعتماد (مشفّرة)");
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "خطأ");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={true} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent dir="rtl" className="max-w-[480px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plug size={16} /> {integration.name}
          </DialogTitle>
          <DialogDescription>
            أدخل بيانات الاعتماد. تُخزَّن مشفّرة — لا يمكن استرجاعها بعد الحفظ.
          </DialogDescription>
        </DialogHeader>
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          {integration.requiredFields.map((f) => (
            <div key={f.key}>
              <Label htmlFor={`int-${f.key}`} style={{ fontSize: "11px", fontWeight: 700, color: "var(--muted-foreground)", marginBottom: "4px", display: "block" }}>
                {f.label} <code style={{ fontFamily: "monospace", fontSize: "10px" }}>{f.key}</code>
              </Label>
              <Input
                id={`int-${f.key}`}
                type={f.type === "password" ? "password" : "text"}
                value={values[f.key] || ""}
                onChange={(e) => setValues({ ...values, [f.key]: e.target.value })}
                dir="ltr"
                placeholder={f.type === "password" ? "••••••••" : ""}
              />
            </div>
          ))}
        </div>
        <DialogFooter>
          <button
            onClick={submit}
            disabled={saving}
            style={{ display: "inline-flex", alignItems: "center", gap: "6px", padding: "8px 18px", borderRadius: "8px", background: "var(--primary)", color: "var(--primary-foreground)", border: "none", fontFamily: "inherit", fontSize: "12px", fontWeight: 700, cursor: saving ? "not-allowed" : "pointer", opacity: saving ? 0.7 : 1 }}
          >
            <Save size={14} /> {saving ? "جارٍ…" : "حفظ"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Admin P2 — Retention Cleanup tab.
 * Wires the previously-orphaned /api/platform-admin/retention-cleanup
 * (POST) endpoint into a founder-facing UI. The endpoint only exposes
 * POST (no GET), so we use POST with dryRun=true on tab-open to show
 * what WOULD be deleted (eligible counts). The "Run cleanup now" button
 * calls POST without dryRun after a confirm() dialog.
 *
 * Behavior:
 * - Cutoff date = now - retentionYears (default 5).
 * - Deletes soft-deleted (deletedAt < cutoff) invoices, journalEntries,
 *   paymentTransactions, eInvoices, purchaseInvoices (in a transaction).
 * - Founder-only; logs to audit trail.
 */
function RetentionCleanupTab() {
  const [preview, setPreview] = useState<null | {
    dryRun: boolean;
    retentionPeriodYears: number;
    cutoffDate: string;
    eligible: Record<string, number>;
    deleted?: Record<string, number>;
  }>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [retentionYears, setRetentionYears] = useState(5);

  const runPreview = useCallback(async (years: number) => {
    setLoading(true);
    try {
      const res = await authedFetch("/api/platform-admin/retention-cleanup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmYears: years, dryRun: true }),
      });
      const d = await res.json();
      if (res.ok) setPreview(d);
      else toast.error(d.error || "تعذّر تحميل المعاينة");
    } finally {
      setLoading(false);
    }
  }, []);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { runPreview(retentionYears); }, [runPreview, retentionYears]);

  const runCleanup = async () => {
    const total = preview ? Object.values(preview.eligible).reduce((a, b) => a + b, 0) : 0;
    if (total === 0) { toast.info("لا توجد سجلات مؤهّلة للحذف"); return; }
    if (!confirm(`حذف نهائي لـ ${total} سجل مالي معزول منذ أكثر من ${retentionYears} سنة؟ لا يمكن التراجع.`)) return;
    setRunning(true);
    try {
      const res = await authedFetch("/api/platform-admin/retention-cleanup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmYears: retentionYears, dryRun: false }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Failed");
      const deletedTotal = d.deleted ? Object.values(d.deleted as Record<string, number>).reduce((a, b) => a + b, 0) : 0;
      toast.success(`تم حذف ${deletedTotal} سجلاً نهائياً`);
      setPreview(d);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "خطأ");
    } finally {
      setRunning(false);
    }
  };

  if (loading) return <div style={{ padding: "48px", textAlign: "center", color: "var(--muted-foreground)" }}>جارٍ التحميل…</div>;
  if (!preview) return <div style={{ padding: "48px", textAlign: "center", color: "var(--muted-foreground)" }}>تعذّر التحميل</div>;

  const eligibleTotal = Object.values(preview.eligible).reduce((a, b) => a + b, 0);
  const deletedTotal = preview.deleted ? Object.values(preview.deleted).reduce((a, b) => a + b, 0) : 0;

  const labelMap: Record<string, string> = {
    invoices: "الفواتير",
    journalEntries: "قيود اليومية",
    paymentTransactions: "حركات الدفع",
    eInvoices: "الفواتير الإلكترونية",
    purchaseInvoices: "فواتير الشراء",
  };

  return (
    <div style={{ background: "var(--card)", borderRadius: "14px", border: "1px solid var(--border)", overflow: "hidden" }}>
      <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "8px" }}>
        <h3 style={{ fontSize: "14px", fontWeight: 700, display: "flex", alignItems: "center", gap: "8px" }}>
          <Database size={16} style={{ color: "#10b981" }} />
          التنظيف الدوري للسجلات المعزولة
        </h3>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <label style={{ fontSize: "11px", fontWeight: 700, color: "var(--muted-foreground)" }}>سنوات الاحتفاظ:</label>
          <select
            value={retentionYears}
            onChange={(e) => setRetentionYears(Number(e.target.value))}
            style={{ ...inputStyle, maxWidth: "100px" }}
            disabled={running}
          >
            {[3, 5, 7, 10].map((y) => <option key={y} value={y}>{y} سنوات</option>)}
          </select>
        </div>
      </div>

      <div style={{ padding: "16px", display: "flex", flexDirection: "column", gap: "14px" }}>
        <div style={{ padding: "12px 14px", background: "var(--muted)", borderRadius: "10px", fontSize: "12px", display: "flex", flexDirection: "column", gap: "6px" }}>
          <div><strong>تاريخ القطع:</strong> {new Date(preview.cutoffDate).toLocaleString("ar-EG")}</div>
          <div><strong>السجلات المعزولة قبل هذا التاريخ ستُحذف نهائياً.</strong></div>
          <div style={{ fontSize: "10px", color: "var(--muted-foreground)" }}>
            يشمل: فواتير، قيود يومية، حركات دفع، فواتير إلكترونية، فواتير شراء — جميعها بحالة soft-deleted.
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "10px" }}>
          {Object.entries(preview.eligible).map(([k, v]) => (
            <div key={k} style={{ padding: "12px", borderRadius: "10px", background: "var(--card)", border: "1px solid var(--border)" }}>
              <div style={{ fontSize: "10px", color: "var(--muted-foreground)", fontWeight: 700 }}>{labelMap[k] || k}</div>
              <div style={{ fontSize: "20px", fontWeight: 900, color: v > 0 ? "#f59e0b" : "var(--foreground)" }}>{v}</div>
              {preview.deleted && (
                <div style={{ fontSize: "10px", color: "#10b981", fontWeight: 700 }}>حُذف: {preview.deleted[k] || 0}</div>
              )}
            </div>
          ))}
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "10px" }}>
          <div style={{ fontSize: "12px", color: "var(--muted-foreground)" }}>
            الإجمالي المؤهّل: <strong style={{ color: eligibleTotal > 0 ? "#f59e0b" : "var(--foreground)" }}>{eligibleTotal}</strong>
            {preview.deleted && <> • تم حذف: <strong style={{ color: "#10b981" }}>{deletedTotal}</strong></>}
          </div>
          <button
            onClick={runCleanup}
            disabled={running || eligibleTotal === 0}
            style={{ display: "inline-flex", alignItems: "center", gap: "6px", padding: "10px 22px", borderRadius: "10px", background: eligibleTotal > 0 ? "#ef4444" : "var(--muted)", color: "#fff", border: "none", fontFamily: "inherit", fontSize: "13px", fontWeight: 800, cursor: running || eligibleTotal === 0 ? "not-allowed" : "pointer", opacity: running ? 0.7 : 1 }}
          >
            <Trash2 size={14} /> {running ? "جارٍ الحذف…" : "تشغيل التنظيف الآن"}
          </button>
        </div>

        {!preview.dryRun && deletedTotal > 0 && (
          <div style={{ padding: "10px 14px", background: "rgba(16,185,129,0.1)", borderRadius: "8px", fontSize: "12px", color: "#10b981", fontWeight: 700, display: "flex", alignItems: "center", gap: "6px" }}>
            <Check size={14} /> تم تنفيذ التنظيف بنجاح — حُذف {deletedTotal} سجل نهائياً.
          </div>
        )}
      </div>
    </div>
  );
}

function AnnouncementForm({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [type, setType] = useState("info");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!title || !body) { toast.error("العنوان والمحتوى مطلوبان"); return; }
    setSaving(true);
    try {
      const res = await authedFetch("/api/platform-admin/announcements", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, body, type, targetPlans: [], isActive: true }),
      });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || "Failed"); }
      toast.success("تم إنشاء الإعلان");
      onSaved();
    } catch (err) { toast.error(err instanceof Error ? err.message : "خطأ"); }
    finally { setSaving(false); }
  };

  return (
    <div style={{ padding: "16px", borderBottom: "1px solid var(--border)", background: "var(--muted)", display: "flex", flexDirection: "column", gap: "10px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h4 style={{ fontSize: "13px", fontWeight: 700 }}>إعلان جديد</h4>
        <button onClick={onClose} style={{ background: "transparent", border: "none", color: "var(--muted-foreground)", cursor: "pointer" }}><X size={14} /></button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 160px", gap: "10px" }}>
        <div><label style={labelStyle}>العنوان</label><input value={title} onChange={(e) => setTitle(e.target.value)} style={inputStyle} /></div>
        <div><label style={labelStyle}>النوع</label>
          <select value={type} onChange={(e) => setType(e.target.value)} style={inputStyle}>
            <option value="info">معلومات</option><option value="warning">تحذير</option>
            <option value="success">نجاح</option><option value="critical">حرج</option>
          </select>
        </div>
      </div>
      <div><label style={labelStyle}>المحتوى</label><textarea value={body} onChange={(e) => setBody(e.target.value)} rows={3} style={{ ...inputStyle, resize: "vertical" }} /></div>
      <button onClick={submit} disabled={saving} style={{ alignSelf: "flex-end", padding: "8px 20px", borderRadius: "8px", background: "var(--primary)", color: "var(--primary-foreground)", border: "none", fontFamily: "inherit", fontSize: "12px", fontWeight: 700, cursor: saving ? "not-allowed" : "pointer", opacity: saving ? 0.7 : 1 }}>{saving ? "جارٍ…" : "نشر"}</button>
    </div>
  );
}

export default PlatformAdminPanel;

/**
 * PlansTab — Manage the plan catalog (pricing, limits).
 * Reads current plans from GET /api/settings (key: "plans.catalog"),
 * allows editing name, priceMonthly, maxInvoicesPerMonth, maxCompanies, maxUsers,
 * and saves via PATCH /api/settings.
 */
function PlansTab() {
  const [plans, setPlans] = useState<PlanCatalog>(() => ({ ...DEFAULT_PLANS }));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  // Load live catalog from settings API
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authedFetch("/api/settings");
      const data = await res.json();
      if (res.ok) {
        const catalog = data.settings?.["plans.catalog"] || data.defaults?.["plans.catalog"] || DEFAULT_PLANS;
        setPlans(catalog);
        setDirty(false);
      } else {
        toast.error(data.error || "تعذّر تحميل الباقات");
      }
    } catch {
      toast.error("خطأ في الاتصال");
    } finally {
      setLoading(false);
    }
  }, []);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);

  const updatePlan = (key: string, field: keyof PlanDef, value: string | number) => {
    setPlans((prev) => ({
      ...prev,
      [key]: { ...prev[key], [field]: value },
    }));
    setDirty(true);
  };

  const save = async () => {
    setSaving(true);
    try {
      // Build a clean catalog with only the editable fields
      const cleanCatalog: Record<string, Record<string, unknown>> = {};
      for (const [key, plan] of Object.entries(plans)) {
        cleanCatalog[key] = {
          name: plan.name,
          priceMonthly: plan.priceMonthly,
          maxInvoicesPerMonth: plan.maxInvoicesPerMonth,
          maxCompanies: plan.maxCompanies,
          maxUsers: plan.maxUsers,
          trialDays: plan.trialDays,
          currency: plan.currency,
          billingPeriod: plan.billingPeriod,
          featureBullets: plan.featureBullets,
          highlight: plan.highlight,
        };
      }
      const res = await authedFetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ "plans.catalog": cleanCatalog }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "تعذّر الحفظ");
      toast.success("تم حفظ كتالوج الباقات بنجاح");
      setDirty(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "خطأ");
    } finally {
      setSaving(false);
    }
  };

  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "6px 8px", background: "var(--background)",
    border: "1px solid var(--border)", borderRadius: "6px", color: "var(--foreground)",
    fontSize: "12px", fontFamily: "inherit",
  };

  if (loading) return <div style={{ padding: "48px", textAlign: "center", color: "var(--muted-foreground)" }}>جارٍ التحميل…</div>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h3 style={{ fontSize: "14px", fontWeight: 700, display: "flex", alignItems: "center", gap: "8px" }}>
          <Gauge size={16} style={{ color: "#7c3aed" }} />
          كتالوج الباقات ({Object.keys(plans).length} باقة)
        </h3>
        <button
          onClick={save}
          disabled={saving || !dirty}
          style={{
            padding: "7px 16px", background: saving || !dirty ? "var(--muted)" : "#7c3aed",
            color: "#fff", border: "none", borderRadius: "8px", fontSize: "12px",
            fontWeight: 700, cursor: saving || !dirty ? "not-allowed" : "pointer",
            opacity: saving || !dirty ? 0.7 : 1, fontFamily: "inherit",
            display: "flex", alignItems: "center", gap: "6px",
          }}
        >
          <Save size={12} />
          {saving ? "جارٍ الحفظ…" : "حفظ التغييرات"}
        </button>
      </div>

      {dirty && (
        <div style={{ padding: "8px 12px", background: "rgba(245,158,11,0.12)", border: "1px solid rgba(245,158,11,0.3)", borderRadius: "8px", fontSize: "11px", color: "#f59e0b", fontWeight: 600, display: "flex", alignItems: "center", gap: "6px" }}>
          <AlertTriangle size={14} />
          تغييرات غير محفوظة
        </div>
      )}

      {Object.entries(plans).map(([key, plan]) => (
        <div key={key} style={{ padding: "16px", background: "var(--card)", borderRadius: "12px", border: "1px solid var(--border)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px" }}>
            <span style={{
              padding: "2px 10px", borderRadius: "8px", background: "#7c3aed",
              color: "#fff", fontSize: "10px", fontWeight: 800, fontFamily: "monospace",
            }}>
              {key}
            </span>
            <span style={{ fontSize: "13px", fontWeight: 700 }}>{plan.name}</span>
            {plan.highlight && (
              <span style={{ padding: "1px 6px", borderRadius: "6px", background: "#10b981", color: "#fff", fontSize: "9px", fontWeight: 700 }}>مميزة</span>
            )}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "10px" }}>
            <div>
              <label style={{ fontSize: "10px", color: "var(--muted-foreground)", fontWeight: 600, display: "block", marginBottom: "4px" }}>الاسم</label>
              <input
                value={plan.name}
                onChange={(e) => updatePlan(key, "name", e.target.value)}
                style={inputStyle}
              />
            </div>
            <div>
              <label style={{ fontSize: "10px", color: "var(--muted-foreground)", fontWeight: 600, display: "block", marginBottom: "4px" }}>السعر الشهري ($)</label>
              <input
                type="number"
                step="0.01"
                value={plan.priceMonthly}
                onChange={(e) => updatePlan(key, "priceMonthly", parseFloat(e.target.value) || 0)}
                style={inputStyle}
              />
            </div>
            <div>
              <label style={{ fontSize: "10px", color: "var(--muted-foreground)", fontWeight: 600, display: "block", marginBottom: "4px" }}>الحد الأقصى للفواتير/شهر</label>
              <input
                type="number"
                value={plan.maxInvoicesPerMonth}
                onChange={(e) => updatePlan(key, "maxInvoicesPerMonth", parseInt(e.target.value) || -1)}
                style={inputStyle}
              />
            </div>
            <div>
              <label style={{ fontSize: "10px", color: "var(--muted-foreground)", fontWeight: 600, display: "block", marginBottom: "4px" }}>الحد الأقصى للشركات</label>
              <input
                type="number"
                value={plan.maxCompanies}
                onChange={(e) => updatePlan(key, "maxCompanies", parseInt(e.target.value) || -1)}
                style={inputStyle}
              />
            </div>
            <div>
              <label style={{ fontSize: "10px", color: "var(--muted-foreground)", fontWeight: 600, display: "block", marginBottom: "4px" }}>الحد الأقصى للمستخدمين</label>
              <input
                type="number"
                value={plan.maxUsers}
                onChange={(e) => updatePlan(key, "maxUsers", parseInt(e.target.value) || -1)}
                style={inputStyle}
              />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Item 6: Backups tab (manual backup trigger + list) ──────────────────
// Calls GET /api/backups (list) and POST /api/backups (trigger manual).
// Both endpoints are founder-only — enforced server-side.
interface BackupRow {
  name: string;
  size: number;
  createdAt: string; // ISO
}
function BackupsTab() {
  const [backups, setBackups] = useState<BackupRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [triggering, setTriggering] = useState(false);
  const [confirmingTrigger, setConfirmingTrigger] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authedFetch("/api/backups");
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        toast.error(e.error || "تعذّر تحميل النسخ");
        setBackups([]);
        return;
      }
      const data = await res.json();
      setBackups(Array.isArray(data.backups) ? data.backups : []);
    } catch {
      setBackups([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);

  const triggerBackup = async () => {
    setTriggering(true);
    try {
      const res = await authedFetch("/api/backups", { method: "POST" });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error || "فشل إنشاء النسخة");
      }
      const data = await res.json().catch(() => ({}));
      const name = data?.backupName || data?.name;
      toast.success(name ? `تم إنشاء نسخة احتياطية: ${name}` : "تم إنشاء النسخة الاحتياطية");
      setConfirmingTrigger(false);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "خطأ");
    } finally {
      setTriggering(false);
    }
  };

  const fmtSize = (bytes: number): string => {
    if (!bytes || bytes <= 0) return "—";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  };

  const fmtDate = (s: string): string => {
    if (!s) return "—";
    try {
      const d = new Date(s);
      if (isNaN(d.getTime())) return s;
      return d.toLocaleString("ar-EG", { dateStyle: "medium", timeStyle: "short" });
    } catch { return s; }
  };

  const thStyle: React.CSSProperties = { textAlign: "right", padding: "10px 12px", fontSize: "11px", fontWeight: 600, color: "var(--muted-foreground)", borderBottom: "1px solid var(--border)", background: "var(--muted)" };
  const tdStyle: React.CSSProperties = { padding: "10px 12px", fontSize: "13px", borderBottom: "1px solid var(--border)", verticalAlign: "middle" };

  return (
    <div style={{ background: "var(--card)", borderRadius: "14px", border: "1px solid var(--border)", overflow: "hidden" }}>
      <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
        <div>
          <h3 style={{ fontSize: "15px", fontWeight: 700, display: "flex", alignItems: "center", gap: "8px" }}>
            <HardDriveDownload size={16} className="text-primary" /> النسخ الاحتياطي اليدوي
          </h3>
          <p style={{ fontSize: "12px", color: "var(--muted-foreground)", marginTop: "4px" }}>
            إنشاء نسخة SQLite مشفّرة (AES-256-GCM) من قاعدة البيانات الحالية. يتطلب صلاحيات المؤسس.
          </p>
        </div>
        <button
          onClick={() => setConfirmingTrigger(true)}
          disabled={triggering}
          style={{
            display: "inline-flex", alignItems: "center", gap: "8px",
            padding: "10px 18px", borderRadius: "10px",
            background: "var(--primary)", color: "var(--primary-foreground)",
            border: "none", fontFamily: "inherit", fontSize: "13px", fontWeight: 700,
            cursor: triggering ? "not-allowed" : "pointer", opacity: triggering ? 0.7 : 1,
          }}
        >
          {triggering ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
          {triggering ? "جارٍ الإنشاء…" : "نسخة احتياطية جديدة"}
        </button>
      </div>

      {loading ? (
        <div style={{ padding: "48px", textAlign: "center", color: "var(--muted-foreground)", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px" }}>
          <Loader2 size={16} className="animate-spin" /> جارٍ التحميل…
        </div>
      ) : backups.length === 0 ? (
        <div style={{ padding: "48px", textAlign: "center", color: "var(--muted-foreground)" }}>
          <HardDriveDownload size={36} style={{ opacity: 0.3, marginBottom: "8px" }} />
          <div>لا توجد نسخ احتياطية بعد.</div>
        </div>
      ) : (
        <div style={{ overflowX: "auto" }} className="garfix-scroll">
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={thStyle}>اسم الملف</th>
                <th style={thStyle}>الحجم</th>
                <th style={thStyle}>تاريخ الإنشاء</th>
              </tr>
            </thead>
            <tbody>
              {backups.map((b, i) => (
                <tr key={b.name || i}>
                  <td style={{ ...tdStyle, fontFamily: "monospace", fontSize: "12px" }} dir="ltr">{b.name}</td>
                  <td style={tdStyle}>{fmtSize(b.size)}</td>
                  <td style={tdStyle}>{fmtDate(b.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {confirmingTrigger && (
        <div
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", backdropFilter: "blur(4px)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: "16px" }}
          onClick={() => !triggering && setConfirmingTrigger(false)}
        >
          <div
            style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: "14px", boxShadow: "0 20px 50px rgba(0,0,0,0.3)", maxWidth: "440px", width: "100%", padding: "20px" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", alignItems: "flex-start", gap: "12px", marginBottom: "14px" }}>
              <div style={{ width: "40px", height: "40px", borderRadius: "50%", background: "rgba(124,58,237,0.15)", color: "var(--primary)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <HardDriveDownload size={18} />
              </div>
              <div>
                <h4 style={{ fontSize: "15px", fontWeight: 700, marginBottom: "4px" }}>تأكيد النسخ الاحتياطي</h4>
                <p style={{ fontSize: "12px", color: "var(--muted-foreground)", lineHeight: 1.6 }}>
                  سيتم إنشاء نسخة احتياطية مشفّرة من قاعدة البيانات الحالية. قد يستغرق ذلك عدة ثوانٍ.
                </p>
              </div>
            </div>
            <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
              <button
                onClick={() => setConfirmingTrigger(false)}
                disabled={triggering}
                style={{ padding: "8px 16px", borderRadius: "8px", border: "1px solid var(--border)", background: "transparent", color: "var(--foreground)", fontFamily: "inherit", fontSize: "13px", fontWeight: 600, cursor: triggering ? "not-allowed" : "pointer" }}
              >
                إلغاء
              </button>
              <button
                onClick={triggerBackup}
                disabled={triggering}
                style={{ padding: "8px 16px", borderRadius: "8px", border: "none", background: "var(--primary)", color: "var(--primary-foreground)", fontFamily: "inherit", fontSize: "13px", fontWeight: 700, cursor: triggering ? "not-allowed" : "pointer", opacity: triggering ? 0.7 : 1, display: "inline-flex", alignItems: "center", gap: "6px" }}
              >
                {triggering ? <Loader2 size={14} className="animate-spin" /> : <HardDriveDownload size={14} />}
                {triggering ? "جارٍ…" : "تأكيد الإنشاء"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

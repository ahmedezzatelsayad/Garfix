"use client";

import { useEffect, useState, useCallback } from "react";
import { useBrand } from "@/context/BrandContext";
import { authedFetch } from "@/context/AuthContext";
import { toast } from "sonner";
import {
  Plus, X, Shield, Download, FileSpreadsheet, Clock,
  UserCheck, UserX, Eye, Pencil, Lock, Unlock, Search,
  History, ClipboardList, ChevronDown,
} from "lucide-react";
import { cn } from "@/lib/utils";

/* ─── Interfaces ──────────────────────────────────────────────────────────── */
interface AccountantAccess {
  id: number; accountantName: string; accountantEmail: string;
  accessLevel: string; grantedAt: string; active: boolean;
}
interface AuditEntry {
  id: number; userId: string; userName: string; action: string;
  entity: string; entityId?: number; before?: string; after?: string;
  reason?: string; timestamp: string;
}

type Tab = "access" | "export" | "audit-trail";
type ExportType = "trial_balance" | "general_ledger" | "journal_entries" | "full_package";

/* ─── Shared Styles ─────────────────────────────────────────────────────────── */
const thStyle = "text-start py-2.5 px-3 text-[11px] text-muted-foreground font-bold";
const tdStyle = "py-2.5 px-3 text-[13px]";
const inputStyle = "w-full py-2 px-3 rounded-sm bg-background border border-border text-foreground text-[13px] outline-none";
const labelStyle = "block text-[11px] font-semibold text-muted-foreground mb-1";
const selectStyle = "w-full py-2 px-3 rounded-sm bg-background border border-border text-foreground text-[13px] outline-none cursor-pointer";

function Empty({ label }: { label: string }) {
  return <div className="p-12 text-center text-muted-foreground">لا توجد {label} بعد</div>;
}

const ACCESS_LEVEL_MAP: Record<string, { label: string; badge: string; icon: React.ComponentType<{ size?: number }> }> = {
  read_only:   { label: "قراءة فقط",      badge: "bg-blue-500/20 text-blue-500", icon: Eye },
  limited_edit: { label: "تعديل محدود",   badge: "bg-amber-500/20 text-amber-500", icon: Pencil },
  full_edit:    { label: "تعديل كامل",    badge: "bg-red-500/20 text-red-500", icon: Lock },
};

const EXPORT_TYPE_MAP: Record<string, { label: string; desc: string }> = {
  trial_balance:    { label: "ميزان المراجعة", desc: "جميع الحسابات مع المدين والدائن" },
  general_ledger:   { label: "دفتر الأستاذ العام", desc: "تفاصيل جميع القيود لكل حساب" },
  journal_entries:  { label: "قيود يومية", desc: "جميع القيود مع البنود" },
  full_package:     { label: "حزمة كاملة", desc: "ميزان + أستاذ + قيود + قوائم مالية" },
};

/* ─── Main Component ────────────────────────────────────────────────────────── */
export function AccountantCollabView() {
  const { activeCompany } = useBrand();
  const [tab, setTab] = useState<Tab>("access");
  const [accessList, setAccessList] = useState<AccountantAccess[]>([]);
  const [auditEntries, setAuditEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [showGrantForm, setShowGrantForm] = useState(false);

  /* Grant form state */
  const [accName, setAccName] = useState("");
  const [accEmail, setAccEmail] = useState("");
  const [accLevel, setAccLevel] = useState("read_only");

  /* Export state */
  const [exportType, setExportType] = useState<ExportType>("trial_balance");
  const [exportPeriod, setExportPeriod] = useState("Q1");
  const [exporting, setExporting] = useState(false);

  /* Audit search */
  const [auditSearch, setAuditSearch] = useState("");

  const slug = activeCompany ? `companySlug=${encodeURIComponent(activeCompany.slug)}` : "";

  /* ── Loaders ──────────────────────────────────────────────────────────────── */
  const loadAccess = useCallback(async () => {
    if (!activeCompany) { setLoading(false); return; }
    setLoading(true);
    try {
      const res = await authedFetch(`/api/accounting/accountant-access?${slug}`);
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || "فشل تحميل الوصول"); }
      const d = await res.json(); setAccessList(d.accesses || []);
    } catch (err) { toast.error(err instanceof Error ? err.message : "تعذّر تحميل صلاحيات المحاسب"); setAccessList([]); }
    finally { setLoading(false); }
  }, [activeCompany, slug]);

  const loadAudit = useCallback(async () => {
    if (!activeCompany) return; setLoading(true);
    try {
      const res = await authedFetch(`/api/accounting/accounting-audit?${slug}`);
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || "فشل تحميل سجل التدقيق"); }
      const d = await res.json(); setAuditEntries(d.entries || []);
    } catch (err) { toast.error(err instanceof Error ? err.message : "تعذّر تحميل سجل التدقيق"); setAuditEntries([]); }
    finally { setLoading(false); }
  }, [activeCompany, slug]);

  useEffect(() => {
    if (tab === "access" && activeCompany) loadAccess();
    if (tab === "audit-trail" && activeCompany) loadAudit();
  }, [tab, activeCompany, loadAccess, loadAudit]);

  const switchTab = (t: Tab) => { setTab(t); setShowGrantForm(false); };

  /* ── Grant Access ──────────────────────────────────────────────────────── */
  const handleGrant = async () => {
    if (!activeCompany || !accName || !accEmail) { toast.error("يرجى ملء جميع الحقول المطلوبة"); return; }
    try {
      const res = await authedFetch("/api/accounting/accountant-access", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companySlug: activeCompany.slug, accountantName: accName, accountantEmail: accEmail, accessLevel: accLevel }),
      });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || "فشل منح الوصول"); }
      toast.success("تم منح صلاحية الوصول للمحاسب");
      setShowGrantForm(false); setAccName(""); setAccEmail(""); setAccLevel("read_only"); loadAccess();
    } catch (err) { toast.error(err instanceof Error ? err.message : "تعذّر منح صلاحية الوصول"); }
  };

  /* ── Revoke Access ─────────────────────────────────────────────────────── */
  const handleRevoke = async (id: number) => {
    if (!activeCompany) return;
    if (!confirm("إلغاء صلاحية الوصول للمحاسب؟")) return;
    try {
      const res = await authedFetch(`/api/accounting/accountant-access/${id}/revoke?${slug}`, { method: "POST" });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || "فشل إلغاء الوصول"); }
      toast.success("تم إلغاء صلاحية الوصول"); loadAccess();
    } catch (err) { toast.error(err instanceof Error ? err.message : "تعذّر إلغاء صلاحية الوصول"); }
  };

  /* ── Export ──────────────────────────────────────────────────────────────── */
  const handleExport = async () => {
    if (!activeCompany) return;
    setExporting(true);
    try {
      const res = await authedFetch(`/api/accounting/export-excel?${slug}&type=${exportType}&period=${exportPeriod}`);
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || "فشل التصدير"); }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url;
      const fn = EXPORT_TYPE_MAP[exportType]?.label || exportType;
      a.download = `${fn}-${activeCompany.slug}-${exportPeriod}.xlsx`;
      document.body.appendChild(a); a.click(); a.remove();
      window.URL.revokeObjectURL(url);
      toast.success("تم تصدير الملف بنجاح");
    } catch (err) { toast.error(err instanceof Error ? err.message : "تعذّر التصدير"); }
    finally { setExporting(false); }
  };

  if (!activeCompany) return <div className="p-12 text-center text-muted-foreground">اختر شركة</div>;

  const tabs: Array<{ key: Tab; label: string; icon: React.ComponentType<{ size?: number }> }> = [
    { key: "access", label: "صلاحيات المحاسب", icon: Shield },
    { key: "export", label: "تصدير Excel", icon: FileSpreadsheet },
    { key: "audit-trail", label: "سجل التدقيق", icon: History },
  ];

  const filteredAudit = auditSearch
    ? auditEntries.filter((e) => e.userName.includes(auditSearch) || e.action.includes(auditSearch) || e.entity.includes(auditSearch) || (e.reason || "").includes(auditSearch))
    : auditEntries;

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex flex-wrap justify-between items-center gap-3">
        <div>
          <h1 className="text-2xl font-extrabold flex items-center gap-2"><Shield size={20} /> تعاون المحاسب</h1>
          <p className="text-[13px] text-muted-foreground">{activeCompany.nameAr || activeCompany.name}</p>
        </div>
        {tab === "access" && !showGrantForm && (
          <button onClick={() => setShowGrantForm(true)} className="inline-flex items-center gap-1.5 py-2.5 px-[18px] rounded-[10px] bg-primary text-primary-foreground border-none text-[13px] font-bold cursor-pointer"><Plus size={16} /> منح صلاحية</button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1.5 flex-wrap">
        {tabs.map((t) => { const Icon = t.icon; return (
          <button key={t.key} onClick={() => switchTab(t.key)} className={cn(
            "py-2 px-4 rounded-[10px] border border-border text-[12px] font-bold cursor-pointer inline-flex items-center gap-1.5",
            tab === t.key ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground",
          )}>{Icon && <Icon size={14} />} {t.label}</button>
        ); })}
      </div>

      {loading ? <div className="p-12 text-center text-muted-foreground">جارٍ التحميل…</div> : tab === "access" ? (
        /* ── Access Tab ──────────────────────────────────────────────────────── */
        showGrantForm ? (
          <div className="bg-card rounded-[14px] border border-border p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-bold">منح صلاحية محاسب خارجي</h2>
              <button onClick={() => { setShowGrantForm(false); setAccName(""); setAccEmail(""); setAccLevel("read_only"); }} className="w-7 h-7 rounded-md border border-border flex items-center justify-center cursor-pointer"><X size={14} /></button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div><label className={labelStyle}>اسم المحاسب *</label><input value={accName} onChange={(e) => setAccName(e.target.value)} className={inputStyle} placeholder="اسم المحاسب" /></div>
              <div><label className={labelStyle}>البريد الإلكتروني *</label><input value={accEmail} onChange={(e) => setAccEmail(e.target.value)} className={inputStyle} type="email" placeholder="accountant@example.com" /></div>
              <div><label className={labelStyle}>مستوى الوصول</label>
                <select value={accLevel} onChange={(e) => setAccLevel(e.target.value)} className={selectStyle}>
                  <option value="read_only">قراءة فقط</option>
                  <option value="limited_edit">تعديل محدود</option>
                  <option value="full_edit">تعديل كامل</option>
                </select>
              </div>
            </div>
            {/* Access level explanation */}
            <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3">
              {Object.entries(ACCESS_LEVEL_MAP).map(([key, val]) => {
                const Icon = val.icon;
                return (
                  <div key={key} className={cn("rounded-[10px] border border-border p-3 flex items-center gap-2 cursor-pointer transition-colors", accLevel === key ? "border-primary/50 bg-primary/5" : "")} onClick={() => setAccLevel(key)}>
                    <div className={cn("w-8 h-8 rounded-md flex items-center justify-center", val.badge)}><Icon size={16} /></div>
                    <div><p className="text-[13px] font-bold">{val.label}</p>
                      {key === "read_only" && <p className="text-[11px] text-muted-foreground">عرض البيانات فقط</p>}
                      {key === "limited_edit" && <p className="text-[11px] text-muted-foreground">تعديل القيود والحسابات</p>}
                      {key === "full_edit" && <p className="text-[11px] text-muted-foreground">تعديل كامل + إعداد الفترات</p>}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="flex gap-2 justify-end mt-5">
              <button onClick={() => { setShowGrantForm(false); setAccName(""); setAccEmail(""); setAccLevel("read_only"); }} className="px-4 py-2 rounded-md border border-border bg-transparent text-foreground text-sm font-semibold cursor-pointer">إلغاء</button>
              <button onClick={handleGrant} className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-bold cursor-pointer inline-flex items-center gap-1.5"><UserCheck size={14} /> منح</button>
            </div>
          </div>
        ) : accessList.length === 0 ? <Empty label="صلاحيات محاسب" /> : (
          <div className="bg-card rounded-[14px] border border-border overflow-hidden">
            <div className="overflow-x-auto garfix-scroll">
              <table className="w-full border-collapse">
                <thead><tr className="border-b border-border bg-muted">
                  <th className={thStyle}>الاسم</th><th className={thStyle}>البريد</th>
                  <th className={thStyle}>مستوى الوصول</th><th className={thStyle}>تاريخ المنح</th>
                  <th className={thStyle}>نشط</th><th className={thStyle}>إجراء</th>
                </tr></thead>
                <tbody>
                  {accessList.map((a) => {
                    const lv = ACCESS_LEVEL_MAP[a.accessLevel] || { label: a.accessLevel, badge: "bg-gray-500/20 text-gray-500", icon: Eye };
                    const LvIcon = lv.icon;
                    return (
                      <tr key={a.id} className="border-b border-border">
                        <td className={cn(tdStyle, "font-bold")}>{a.accountantName}</td>
                        <td className={cn(tdStyle, "font-mono")}>{a.accountantEmail}</td>
                        <td className={tdStyle}>
                          <span className={cn("py-0.5 px-2.5 rounded-[12px] text-[11px] font-bold inline-flex items-center gap-1", lv.badge)}><LvIcon size={12} /> {lv.label}</span>
                        </td>
                        <td className={tdStyle}>{a.grantedAt}</td>
                        <td className={tdStyle}>
                          <span className={cn("py-0.5 px-2.5 rounded-[12px] text-[11px] font-bold", a.active ? "bg-emerald-500/15 text-emerald-500" : "bg-red-500/15 text-red-500")}>{a.active ? "نشط" : "معطل"}</span>
                        </td>
                        <td className={tdStyle}>
                          {a.active && (
                            <button onClick={() => handleRevoke(a.id)} title="إلغاء الوصول" className="w-7 h-7 rounded-md border border-border flex items-center justify-center cursor-pointer hover:bg-red-500/10 hover:border-red-500/40 hover:text-red-600"><UserX size={13} /></button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="py-3 px-4 border-t border-border text-[12px] text-muted-foreground">{accessList.length} محاسب</div>
          </div>
        )
      ) : tab === "export" ? (
        /* ── Export Tab ──────────────────────────────────────────────────────── */
        <div className="bg-card rounded-[14px] border border-border p-5">
          <h2 className="text-base font-bold mb-4">تصدير البيانات إلى Excel</h2>
          {/* Export type cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-5">
            {Object.entries(EXPORT_TYPE_MAP).map(([key, val]) => (
              <div key={key} className={cn("rounded-[10px] border border-border p-4 cursor-pointer transition-colors", exportType === key ? "border-primary/50 bg-primary/5" : "hover:bg-muted/50")} onClick={() => setExportType(key as ExportType)}>
                <p className="text-[14px] font-bold">{val.label}</p>
                <p className="text-[11px] text-muted-foreground mt-1">{val.desc}</p>
              </div>
            ))}
          </div>
          {/* Period selector */}
          <div className="mb-5">
            <label className={labelStyle}>الفترة</label>
            <select value={exportPeriod} onChange={(e) => setExportPeriod(e.target.value)} className={cn(selectStyle, "w-40")}>
              <option value="Q1">Q1 — الربع الأول</option>
              <option value="Q2">Q2 — الربع الثاني</option>
              <option value="Q3">Q3 — الربع الثالث</option>
              <option value="Q4">Q4 — الربع الرابع</option>
              <option value="YTD">YTD — منذ بداية السنة</option>
              <option value="all">جميع الفترات</option>
            </select>
          </div>
          <div className="flex justify-end">
            <button onClick={handleExport} disabled={exporting} className="px-5 py-2.5 rounded-md bg-primary text-primary-foreground text-sm font-bold cursor-pointer disabled:opacity-50 inline-flex items-center gap-1.5">
              <Download size={14} /> {exporting ? "جارٍ التصدير…" : "تصدير"}
            </button>
          </div>
        </div>
      ) : (
        /* ── Audit Trail Tab ─────────────────────────────────────────────────── */
        <>
          {/* Search */}
          <div className="bg-card rounded-[10px] border border-border p-3">
            <div className="flex items-center gap-2">
              <Search size={16} className="text-muted-foreground" />
              <input value={auditSearch} onChange={(e) => setAuditSearch(e.target.value)} className={cn(inputStyle, "border-none")} placeholder="بحث في سجل التدقيق (اسم، إجراء، كيان…)" />
            </div>
          </div>
          {filteredAudit.length === 0 ? <Empty label="سجلات تدقيق" /> : (
            <div className="bg-card rounded-[14px] border border-border overflow-hidden">
              <div className="overflow-x-auto garfix-scroll max-h-96">
                <table className="w-full border-collapse">
                  <thead><tr className="border-b border-border bg-muted">
                    <th className={thStyle}>المستخدم</th><th className={thStyle}>الإجراء</th>
                    <th className={thStyle}>الكيان</th><th className={thStyle}>قبل</th>
                    <th className={thStyle}>بعد</th><th className={thStyle}>السبب</th>
                    <th className={thStyle}>الوقت</th>
                  </tr></thead>
                  <tbody>
                    {filteredAudit.map((e) => (
                      <tr key={e.id} className="border-b border-border">
                        <td className={cn(tdStyle, "font-bold")}>{e.userName}</td>
                        <td className={tdStyle}>
                          <span className={cn("py-0.5 px-2.5 rounded-[12px] text-[11px] font-bold", e.action === "create" ? "bg-emerald-500/15 text-emerald-500" : e.action === "update" ? "bg-blue-500/15 text-blue-500" : e.action === "delete" ? "bg-red-500/15 text-red-500" : "bg-amber-500/15 text-amber-500")}>{e.action === "create" ? "إنشاء" : e.action === "update" ? "تعديل" : e.action === "delete" ? "حذف" : e.action === "approve" ? "اعتماد" : e.action === "reverse" ? "عكس" : e.action}</span>
                        </td>
                        <td className={tdStyle}>{e.entity}{e.entityId ? ` #${e.entityId}` : ""}</td>
                        <td className={cn(tdStyle, "max-w-[150px] overflow-hidden text-ellipsis")} title={e.before || ""}>{e.before ? <span className="text-[11px] text-muted-foreground font-mono">{e.before.substring(0, 50)}…</span> : "—"}</td>
                        <td className={cn(tdStyle, "max-w-[150px] overflow-hidden text-ellipsis")} title={e.after || ""}>{e.after ? <span className="text-[11px] text-muted-foreground font-mono">{e.after.substring(0, 50)}…</span> : "—"}</td>
                        <td className={tdStyle}>{e.reason || "—"}</td>
                        <td className={cn(tdStyle, "text-[12px] text-muted-foreground")}>{new Date(e.timestamp).toLocaleString("ar-EG")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="py-3 px-4 border-t border-border text-[12px] text-muted-foreground">{filteredAudit.length} سجل{auditSearch ? ` (من ${auditEntries.length})` : ""}</div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

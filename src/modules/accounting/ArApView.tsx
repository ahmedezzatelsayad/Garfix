"use client";

import { useEffect, useState, useCallback } from "react";
import { useBrand } from "@/context/BrandContext";
import { authedFetch } from "@/context/AuthContext";
import { toast } from "sonner";
import {
  ArrowUpDown, Plus, X, Trash2, FileText, CheckCircle2,
  Clock, Banknote, CalendarDays, Send, Download,
  TrendingUp, TrendingDown, RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";

/* ─── Interfaces ───────────────────────────────────────────────────────────── */
interface AgingRow { name: string; current: number; thirty: number; sixty: number; ninetyPlus: number; total: number; }
interface AgingSummary { direction: string; rows: AgingRow[]; grandCurrent: number; grandThirty: number; grandSixty: number; grandNinetyPlus: number; grandTotal: number; }
interface ClientStatementLine { date: string; type: string; reference: string; debit: number; credit: number; balance: number; }
interface ClientStatement { clientName: string; openingBalance: number; lines: ClientStatementLine[]; closingBalance: number; }
interface PDC { id: number; checkNumber: string; bankName: string; amount: number; dueDate: string; status: string; direction: string; clientName?: string; supplierName?: string; }
interface Installment { id: number; reference: string; clientName: string; totalAmount: number; installmentCount: number; paidCount: number; nextDueDate: string; status: string; }
interface Contact { id: number; name: string; }

type Tab = "aging" | "client-statement" | "supplier-statement" | "pdc" | "installments";
type Direction = "receivable" | "payable";

/* ─── Shared Styles ────────────────────────────────────────────────────────── */
const thStyle = "text-start py-2.5 px-3 text-[11px] text-muted-foreground font-bold";
const tdStyle = "py-2.5 px-3 text-[13px]";
const inputStyle = "w-full py-2 px-3 rounded-sm bg-background border border-border text-foreground text-[13px] outline-none";
const labelStyle = "block text-[11px] font-semibold text-muted-foreground mb-1";
function fmt(n: number) { return n.toLocaleString("ar-EG", { maximumFractionDigits: 3 }); }
function Empty({ label }: { label: string }) { return <div className="p-12 text-center text-muted-foreground">لا توجد {label} بعد</div>; }

/* ─── Main Component ───────────────────────────────────────────────────────── */
export function ArApView() {
  const { activeCompany } = useBrand();
  const [tab, setTab] = useState<Tab>("aging");
  const [agingData, setAgingData] = useState<AgingSummary | null>(null);
  const [agingDirection, setAgingDirection] = useState<Direction>("receivable");
  const [clientStatement, setClientStatement] = useState<ClientStatement | null>(null);
  const [supplierStatement, setSupplierStatement] = useState<ClientStatement | null>(null);
  const [pdcs, setPdcs] = useState<PDC[]>([]);
  const [installments, setInstallments] = useState<Installment[]>([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);

  const slug = activeCompany ? encodeURIComponent(activeCompany.slug) : "";

  const loadAging = useCallback(async () => {
    if (!activeCompany) return;
    setLoading(true);
    try {
      const res = await authedFetch(`/api/accounting/aging?companySlug=${slug}&direction=${agingDirection}`);
      if (res.ok) { const d = await res.json(); setAgingData(d.summary || null); }
      else setAgingData(null);
    } catch { setAgingData(null); }
    finally { setLoading(false); }
  }, [activeCompany, slug, agingDirection]);

  const loadPDCs = useCallback(async () => {
    if (!activeCompany) return;
    setLoading(true);
    try {
      const res = await authedFetch(`/api/accounting/post-dated-checks?companySlug=${slug}`);
      if (res.ok) { const d = await res.json(); setPdcs(d.checks || []); }
      else setPdcs([]);
    } catch { setPdcs([]); }
    finally { setLoading(false); }
  }, [activeCompany, slug]);

  const loadInstallments = useCallback(async () => {
    if (!activeCompany) return;
    setLoading(true);
    try {
      const res = await authedFetch(`/api/accounting/installments?companySlug=${slug}`);
      if (res.ok) { const d = await res.json(); setInstallments(d.installments || []); }
      else setInstallments([]);
    } catch { setInstallments([]); }
    finally { setLoading(false); }
  }, [activeCompany, slug]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (tab === "aging") loadAging();
    if (tab === "pdc") loadPDCs();
    if (tab === "installments") loadInstallments();
  }, [tab, loadAging, loadPDCs, loadInstallments]);

  if (!activeCompany) return <div className="p-12 text-center text-muted-foreground">اختر شركة</div>;

  const tabs: Array<{ key: Tab; label: string; icon: React.ComponentType<{ size?: number }> }> = [
    { key: "aging", label: "تقادم الذمم", icon: ArrowUpDown },
    { key: "client-statement", label: "كشف حساب عميل", icon: FileText },
    { key: "supplier-statement", label: "كشف حساب مورد", icon: FileText },
    { key: "pdc", label: "شيكات مؤجلة", icon: Banknote },
    { key: "installments", label: "التقسيط", icon: CalendarDays },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap justify-between items-center gap-3">
        <div>
          <h1 className="text-2xl font-extrabold flex items-center gap-2"><ArrowUpDown size={20} /> الذمم</h1>
          <p className="text-[13px] text-muted-foreground">{activeCompany.nameAr || activeCompany.name}</p>
        </div>
        {(tab === "pdc" || tab === "installments") && !showForm && (
          <button onClick={() => setShowForm(true)} className="inline-flex items-center gap-1.5 py-2.5 px-[18px] rounded-[10px] bg-primary text-primary-foreground border-none text-[13px] font-bold cursor-pointer"><Plus size={16} /> إضافة</button>
        )}
      </div>
      <div className="flex gap-1.5 flex-wrap">
        {tabs.map((t) => { const Icon = t.icon; return (
          <button key={t.key} onClick={() => { setTab(t.key); setShowForm(false); }} className={cn("py-2 px-4 rounded-[10px] border border-border text-[12px] font-bold cursor-pointer inline-flex items-center gap-1.5", tab === t.key ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground")}>
            <Icon size={14} /> {t.label}
          </button>
        ); })}
      </div>

      {loading ? <div className="p-12 text-center text-muted-foreground">جارٍ التحميل…</div> : tab === "aging" ? (
        <AgingReportView data={agingData} direction={agingDirection} onDirectionChange={setAgingDirection} />
      ) : tab === "client-statement" ? (
        <StatementView type="client" company={activeCompany} data={clientStatement} setData={setClientStatement} />
      ) : tab === "supplier-statement" ? (
        <StatementView type="supplier" company={activeCompany} data={supplierStatement} setData={setSupplierStatement} />
      ) : tab === "pdc" ? (
        showForm ? <PDCForm company={activeCompany} onClose={() => setShowForm(false)} onSaved={() => { setShowForm(false); loadPDCs(); }} /> : <PDCList pdcs={pdcs} company={activeCompany} onRefresh={loadPDCs} />
      ) : tab === "installments" ? (
        showForm ? <InstallmentForm company={activeCompany} onClose={() => setShowForm(false)} onSaved={() => { setShowForm(false); loadInstallments(); }} /> : <InstallmentList installments={installments} />
      ) : null}
    </div>
  );
}

/* ─── Aging Report ─────────────────────────────────────────────────────────── */
function AgingReportView({ data, direction, onDirectionChange }: { data: AgingSummary | null; direction: Direction; onDirectionChange: (d: Direction) => void }) {
  const rows = data?.rows || [];
  const label = direction === "receivable" ? "العميل" : "المورد";
  const accentColor = direction === "receivable" ? "#7c3aed" : "#f59e0b";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-1.5">
        <button onClick={() => onDirectionChange("receivable")} className={cn("py-2 px-4 rounded-[10px] border border-border text-[12px] font-bold cursor-pointer", direction === "receivable" ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground")}>ذمم مدينة (مستحقات)</button>
        <button onClick={() => onDirectionChange("payable")} className={cn("py-2 px-4 rounded-[10px] border border-border text-[12px] font-bold cursor-pointer", direction === "payable" ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground")}>ذمم دائنة (التزامات)</button>
      </div>

      {data && (
        <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-3">
          <div className="bg-card rounded-[14px] border border-border py-3.5 px-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-sm flex items-center justify-center" style={{ background: `${accentColor}20`, color: accentColor }}><ArrowUpDown size={18} /></div>
            <div><div className="text-[11px] text-muted-foreground">إجمالي {direction === "receivable" ? "الذمم المدينة" : "الذمم الدائنة"}</div><div className="text-lg font-extrabold [direction:ltr] text-end">{fmt(data.grandTotal)}</div></div>
          </div>
          <div className="bg-card rounded-[14px] border border-border py-3.5 px-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-sm flex items-center justify-center" style={{ background: "rgba(16,185,129,0.20)", color: "#10b981" }}><TrendingUp size={18} /></div>
            <div><div className="text-[11px] text-muted-foreground">حالي</div><div className="text-lg font-extrabold [direction:ltr] text-end">{fmt(data.grandCurrent)}</div></div>
          </div>
          <div className="bg-card rounded-[14px] border border-border py-3.5 px-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-sm flex items-center justify-center" style={{ background: "rgba(239,68,68,0.20)", color: "#ef4444" }}><TrendingDown size={18} /></div>
            <div><div className="text-[11px] text-muted-foreground">فوق 90 يوم</div><div className="text-lg font-extrabold [direction:ltr] text-end" style={{ color: "#ef4444" }}>{fmt(data.grandNinetyPlus)}</div></div>
          </div>
        </div>
      )}

      <div className="bg-card rounded-[14px] border border-border overflow-hidden">
        {!data || rows.length === 0 ? <Empty label="بيانات التقادم" /> : (
          <div className="overflow-x-auto garfix-scroll">
            <table className="w-full border-collapse">
              <thead><tr className="border-b border-border bg-muted">
                <th className={thStyle}>{label}</th>
                <th className={cn(thStyle, "text-end")}>حالي</th>
                <th className={cn(thStyle, "text-end")}>30 يوم</th>
                <th className={cn(thStyle, "text-end")}>60 يوم</th>
                <th className={cn(thStyle, "text-end")}>90+ يوم</th>
                <th className={cn(thStyle, "text-end")}>الإجمالي</th>
              </tr></thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} className="border-b border-border">
                    <td className={cn(tdStyle, "font-bold")}>{r.name}</td>
                    <td className={cn(tdStyle, "[direction:ltr] text-end")}>{r.current > 0 ? fmt(r.current) : "—"}</td>
                    <td className={cn(tdStyle, "[direction:ltr] text-end")}>{r.thirty > 0 ? fmt(r.thirty) : "—"}</td>
                    <td className={cn(tdStyle, "[direction:ltr] text-end")}>{r.sixty > 0 ? fmt(r.sixty) : "—"}</td>
                    <td className={cn(tdStyle, "[direction:ltr] text-end font-bold")} style={{ color: r.ninetyPlus > 0 ? "#ef4444" : "#10b981" }}>{r.ninetyPlus > 0 ? fmt(r.ninetyPlus) : "—"}</td>
                    <td className={cn(tdStyle, "[direction:ltr] text-end font-bold")} style={{ color: accentColor }}>{fmt(r.total)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-border bg-muted font-extrabold">
                  <td className={cn(tdStyle, "font-extrabold")}>الإجمالي</td>
                  <td className={cn(tdStyle, "[direction:ltr] text-end font-extrabold")}>{fmt(data.grandCurrent)}</td>
                  <td className={cn(tdStyle, "[direction:ltr] text-end font-extrabold")}>{fmt(data.grandThirty)}</td>
                  <td className={cn(tdStyle, "[direction:ltr] text-end font-extrabold")}>{fmt(data.grandSixty)}</td>
                  <td className={cn(tdStyle, "[direction:ltr] text-end font-extrabold")} style={{ color: "#ef4444" }}>{fmt(data.grandNinetyPlus)}</td>
                  <td className={cn(tdStyle, "[direction:ltr] text-end font-extrabold")} style={{ color: accentColor }}>{fmt(data.grandTotal)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Client/Supplier Statement ────────────────────────────────────────────── */
function StatementView({ type, company, data, setData }: { type: "client" | "supplier"; company: { slug: string }; data: ClientStatement | null; setData: (d: ClientStatement | null) => void }) {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loadingStatement, setLoadingStatement] = useState(false);

  useEffect(() => {
    const endpoint = type === "client" ? "/api/clients" : "/api/suppliers";
    authedFetch(`${endpoint}?companySlug=${encodeURIComponent(company.slug)}`)
      .then(r => r.ok ? r.json() : { clients: [], suppliers: [] })
      .then(d => setContacts(type === "client" ? (d.clients || []) : (d.suppliers || [])))
      .catch(() => setContacts([]));
  }, [type, company.slug]);

  const loadStatement = async () => {
    if (!selectedId) { toast.error("اختر " + (type === "client" ? "عميل" : "مورد")); return; }
    setLoadingStatement(true);
    try {
      const endpoint = type === "client" ? "/api/accounting/client-statement" : "/api/accounting/supplier-statement";
      const paramName = type === "client" ? "clientId" : "supplierId";
      const res = await authedFetch(`${endpoint}?companySlug=${encodeURIComponent(company.slug)}&${paramName}=${selectedId}`);
      if (res.ok) { setData(await res.json()); }
      else { const e = await res.json().catch(() => ({})); toast.error(e.error || "تعذّر تحميل كشف الحساب"); setData(null); }
    } catch { toast.error("خطأ في الاتصال"); setData(null); }
    finally { setLoadingStatement(false); }
  };

  const totalDebit = data?.lines.reduce((s, l) => s + l.debit, 0) || 0;
  const totalCredit = data?.lines.reduce((s, l) => s + l.credit, 0) || 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="bg-card rounded-[14px] border border-border py-3.5 px-4 flex gap-3 items-center flex-wrap">
        <div className="flex items-center gap-1.5">
          <label className="text-[11px] font-bold text-muted-foreground">{type === "client" ? "العميل" : "المورد"}</label>
          <select value={selectedId ?? ""} onChange={(e) => setSelectedId(e.target.value ? Number(e.target.value) : null)} className={cn(inputStyle, "w-auto min-w-[200px]")} disabled={loadingStatement}>
            <option value="">— اختر —</option>
            {contacts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <button onClick={loadStatement} disabled={!selectedId || loadingStatement} className="py-2 px-4 rounded-sm bg-accent text-accent-foreground border border-border text-[12px] font-bold cursor-pointer disabled:opacity-70 inline-flex items-center gap-1.5">
          <RefreshCw size={12} className={loadingStatement ? "animate-spin" : ""} /> {loadingStatement ? "جارٍ…" : "عرض"}
        </button>
      </div>

      {loadingStatement ? <div className="p-12 text-center text-muted-foreground">جارٍ التحميل…</div> : !data ? (
        <div className="bg-card rounded-[14px] border border-border p-12 text-center text-muted-foreground">
          <FileText size={36} className="opacity-30 mb-2" />اختر {type === "client" ? "عميل" : "مورد"} ثم اضغط عرض
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-3">
            <div className="bg-card rounded-[14px] border border-border py-3.5 px-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-sm flex items-center justify-center" style={{ background: "rgba(124,58,237,0.20)", color: "#7c3aed" }}><FileText size={18} /></div>
              <div><div className="text-[11px] text-muted-foreground">{data.clientName}</div><div className="text-[13px] font-bold">رصيد افتتاحي: {fmt(data.openingBalance)}</div></div>
            </div>
            <div className="bg-card rounded-[14px] border border-border py-3.5 px-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-sm flex items-center justify-center" style={{ background: "rgba(16,185,129,0.20)", color: "#10b981" }}><TrendingUp size={18} /></div>
              <div><div className="text-[11px] text-muted-foreground">إجمالي مدين</div><div className="text-lg font-extrabold [direction:ltr] text-end">{fmt(totalDebit)}</div></div>
            </div>
            <div className="bg-card rounded-[14px] border border-border py-3.5 px-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-sm flex items-center justify-center" style={{ background: "rgba(239,68,68,0.20)", color: "#ef4444" }}><TrendingDown size={18} /></div>
              <div><div className="text-[11px] text-muted-foreground">إجمالي دائن</div><div className="text-lg font-extrabold [direction:ltr] text-end">{fmt(totalCredit)}</div></div>
            </div>
            <div className="bg-card rounded-[14px] border border-border py-3.5 px-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-sm flex items-center justify-center" style={{ background: data.closingBalance >= 0 ? "rgba(124,58,237,0.20)" : "rgba(239,68,68,0.20)", color: data.closingBalance >= 0 ? "#7c3aed" : "#ef4444" }}><CheckCircle2 size={18} /></div>
              <div><div className="text-[11px] text-muted-foreground">رصيد إقفالي</div><div className="text-lg font-extrabold [direction:ltr] text-end" style={{ color: data.closingBalance >= 0 ? "#7c3aed" : "#ef4444" }}>{fmt(data.closingBalance)}</div></div>
            </div>
          </div>

          <div className="bg-card rounded-[14px] border border-border overflow-hidden">
            {data.lines.length === 0 ? <Empty label="حركات" /> : (
              <div className="overflow-x-auto garfix-scroll">
                <table className="w-full border-collapse">
                  <thead><tr className="border-b border-border bg-muted">
                    <th className={thStyle}>التاريخ</th><th className={thStyle}>النوع</th><th className={thStyle}>المرجع</th>
                    <th className={cn(thStyle, "text-end")}>مدين</th><th className={cn(thStyle, "text-end")}>دائن</th><th className={cn(thStyle, "text-end")}>الرصيد</th>
                  </tr></thead>
                  <tbody>
                    {data.lines.map((l, i) => (
                      <tr key={i} className="border-b border-border">
                        <td className={tdStyle} dir="ltr">{l.date}</td>
                        <td className={tdStyle}>{l.type}</td>
                        <td className={cn(tdStyle, "font-mono")}>{l.reference}</td>
                        <td className={cn(tdStyle, "[direction:ltr] text-end")} style={{ color: l.debit > 0 ? "#7c3aed" : undefined }}>{l.debit ? fmt(l.debit) : "—"}</td>
                        <td className={cn(tdStyle, "[direction:ltr] text-end")} style={{ color: l.credit > 0 ? "#ef4444" : undefined }}>{l.credit ? fmt(l.credit) : "—"}</td>
                        <td className={cn(tdStyle, "[direction:ltr] text-end font-bold")} style={{ color: l.balance >= 0 ? "#7c3aed" : "#ef4444" }}>{fmt(l.balance)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-border bg-muted font-extrabold">
                      <td className={cn(tdStyle, "font-extrabold")} colSpan={3}>رصيد إقفالي</td>
                      <td className={cn(tdStyle, "[direction:ltr] text-end font-extrabold")} style={{ color: "#7c3aed" }}>{fmt(totalDebit)}</td>
                      <td className={cn(tdStyle, "[direction:ltr] text-end font-extrabold")} style={{ color: "#ef4444" }}>{fmt(totalCredit)}</td>
                      <td className={cn(tdStyle, "[direction:ltr] text-end font-extrabold")} style={{ color: data.closingBalance >= 0 ? "#7c3aed" : "#ef4444" }}>{fmt(data.closingBalance)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── PDC List ──────────────────────────────────────────────────────────────── */
function PDCList({ pdcs, company, onRefresh }: { pdcs: PDC[]; company: { slug: string }; onRefresh: () => void }) {
  const [actionId, setActionId] = useState<number | null>(null);

  const handleAction = async (pdcId: number, action: string) => {
    setActionId(pdcId);
    try {
      const res = await authedFetch(`/api/accounting/post-dated-checks/${pdcId}/${action}?companySlug=${encodeURIComponent(company.slug)}`, { method: "POST" });
      if (res.ok) {
        const actionLabel = action === "deposit" ? "تسليم الشيك" : action === "clear" ? "تحصيل الشيك" : "إرجاع الشيك";
        toast.success(`تم ${actionLabel}`);
        onRefresh();
      } else { const e = await res.json().catch(() => ({})); toast.error(e.error || "تعذّر تنفيذ الإجراء"); }
    } catch { toast.error("خطأ"); }
    finally { setActionId(null); }
  };

  const statusBadge = (status: string) => {
    const map: Record<string, { bg: string; fg: string; label: string }> = {
      pending: { bg: "rgba(245,158,11,0.15)", fg: "#f59e0b", label: "معلّق" },
      deposited: { bg: "rgba(59,130,246,0.15)", fg: "#3b82f6", label: "مسلّم" },
      cleared: { bg: "rgba(16,185,129,0.15)", fg: "#10b981", label: "محصل" },
      returned: { bg: "rgba(239,68,68,0.15)", fg: "#ef4444", label: "مرجع" },
    };
    return map[status] || { bg: "rgba(156,163,175,0.15)", fg: "#9ca3af", label: status };
  };

  const totalAmount = pdcs.reduce((s, p) => s + p.amount, 0);
  const pendingTotal = pdcs.filter(p => p.status === "pending").reduce((s, p) => s + p.amount, 0);

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-3">
        <div className="bg-card rounded-[14px] border border-border py-3.5 px-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-sm flex items-center justify-center" style={{ background: "rgba(16,185,129,0.20)", color: "#10b981" }}><Banknote size={18} /></div>
          <div><div className="text-[11px] text-muted-foreground">إجمالي الشيكات</div><div className="text-lg font-extrabold [direction:ltr] text-end">{fmt(totalAmount)}</div></div>
        </div>
        <div className="bg-card rounded-[14px] border border-border py-3.5 px-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-sm flex items-center justify-center" style={{ background: "rgba(245,158,11,0.20)", color: "#f59e0b" }}><Clock size={18} /></div>
          <div><div className="text-[11px] text-muted-foreground">المعلّقة</div><div className="text-lg font-extrabold [direction:ltr] text-end" style={{ color: "#f59e0b" }}>{fmt(pendingTotal)}</div></div>
        </div>
      </div>
      <div className="bg-card rounded-[14px] border border-border overflow-hidden">
        {pdcs.length === 0 ? <Empty label="شيكات مؤجلة" /> : (
          <div className="overflow-x-auto garfix-scroll">
            <table className="w-full border-collapse">
              <thead><tr className="border-b border-border bg-muted">
                <th className={thStyle}>رقم الشيك</th><th className={thStyle}>البنك</th><th className={thStyle}>النوع</th>
                <th className={thStyle}>الاسم</th><th className={cn(thStyle, "text-end")}>المبلغ</th><th className={thStyle}>تاريخ الاستحقاق</th>
                <th className={thStyle}>الحالة</th><th className={thStyle}>إجراء</th>
              </tr></thead>
              <tbody>
                {pdcs.map((p) => {
                  const sc = statusBadge(p.status);
                  const name = p.direction === "receivable" ? p.clientName : p.supplierName;
                  return (
                    <tr key={p.id} className="border-b border-border">
                      <td className={cn(tdStyle, "font-mono")} dir="ltr">{p.checkNumber}</td>
                      <td className={tdStyle}>{p.bankName}</td>
                      <td className={tdStyle}><span className="py-0.5 px-2.5 rounded-[12px] text-[11px] font-bold" style={{ background: p.direction === "receivable" ? "rgba(16,185,129,0.15)" : "rgba(239,68,68,0.15)", color: p.direction === "receivable" ? "#10b981" : "#ef4444" }}>{p.direction === "receivable" ? "مقبوض" : "مدفوع"}</span></td>
                      <td className={tdStyle}>{name || "—"}</td>
                      <td className={cn(tdStyle, "[direction:ltr] text-end font-bold")}>{fmt(p.amount)}</td>
                      <td className={tdStyle} dir="ltr">{p.dueDate}</td>
                      <td className={tdStyle}><span className="py-0.5 px-2.5 rounded-[12px] text-[11px] font-bold" style={{ background: sc.bg, color: sc.fg }}>{sc.label}</span></td>
                      <td className={tdStyle}>
                        <div className="flex items-center gap-1">
                          {p.status === "pending" && <button onClick={() => handleAction(p.id, "deposit")} disabled={actionId === p.id} className="py-1 px-2 rounded-md bg-blue-500/10 border border-blue-500/30 text-blue-600 text-[10px] font-bold cursor-pointer disabled:opacity-50">تسليم</button>}
                          {p.status === "deposited" && <button onClick={() => handleAction(p.id, "clear")} disabled={actionId === p.id} className="py-1 px-2 rounded-md bg-emerald-500/10 border border-emerald-500/30 text-emerald-600 text-[10px] font-bold cursor-pointer disabled:opacity-50">تحصيل</button>}
                          {(p.status === "pending" || p.status === "deposited") && <button onClick={() => handleAction(p.id, "return")} disabled={actionId === p.id} className="py-1 px-2 rounded-md bg-red-500/10 border border-red-500/30 text-red-600 text-[10px] font-bold cursor-pointer disabled:opacity-50">إرجاع</button>}
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
    </div>
  );
}

/* ─── PDC Form ──────────────────────────────────────────────────────────────── */
function PDCForm({ company, onClose, onSaved }: { company: { slug: string }; onClose: () => void; onSaved: () => void }) {
  const [checkNumber, setCheckNumber] = useState("");
  const [bankName, setBankName] = useState("");
  const [amount, setAmount] = useState(0);
  const [dueDate, setDueDate] = useState("");
  const [direction, setDirection] = useState<"receivable" | "payable">("receivable");
  const [clientName, setClientName] = useState("");
  const [supplierName, setSupplierName] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!checkNumber || !bankName || !dueDate || amount <= 0) { toast.error("جميع الحقول مطلوبة"); return; }
    setSaving(true);
    try {
      const res = await authedFetch("/api/accounting/post-dated-checks", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ checkNumber, bankName, amount, dueDate, direction, clientName: direction === "receivable" ? clientName : undefined, supplierName: direction === "payable" ? supplierName : undefined, companySlug: company.slug }),
      });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || "Failed"); }
      toast.success("تم إنشاء الشيك المؤجل");
      onSaved();
    } catch (err) { toast.error(err instanceof Error ? err.message : "خطأ"); }
    finally { setSaving(false); }
  };

  return (
    <div className="bg-card rounded-[14px] border border-border p-5 flex flex-col gap-3.5">
      <h3 className="text-[15px] font-bold flex items-center gap-2"><Banknote size={16} /> شيك مؤجل جديد</h3>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-3">
        <div><label className={labelStyle}>رقم الشيك *</label><input value={checkNumber} onChange={(e) => setCheckNumber(e.target.value)} className={inputStyle} dir="ltr" /></div>
        <div><label className={labelStyle}>البنك *</label><input value={bankName} onChange={(e) => setBankName(e.target.value)} className={inputStyle} /></div>
        <div><label className={labelStyle}>المبلغ *</label><input type="number" value={amount} onChange={(e) => setAmount(Number(e.target.value))} className={inputStyle} dir="ltr" /></div>
        <div><label className={labelStyle}>تاريخ الاستحقاق *</label><input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className={inputStyle} dir="ltr" /></div>
        <div><label className={labelStyle}>النوع *</label>
          <select value={direction} onChange={(e) => setDirection(e.target.value as "receivable" | "payable")} className={inputStyle}>
            <option value="receivable">شيك مقبوض (مدين)</option><option value="payable">شيك مدفوع (دائن)</option>
          </select>
        </div>
        {direction === "receivable" && <div><label className={labelStyle}>اسم العميل</label><input value={clientName} onChange={(e) => setClientName(e.target.value)} className={inputStyle} /></div>}
        {direction === "payable" && <div><label className={labelStyle}>اسم المورد</label><input value={supplierName} onChange={(e) => setSupplierName(e.target.value)} className={inputStyle} /></div>}
      </div>
      <div className="flex gap-2.5 justify-end">
        <button onClick={onClose} className="py-2.5 px-5 rounded-md bg-transparent text-muted-foreground border border-border text-[13px] font-bold cursor-pointer">إلغاء</button>
        <button onClick={submit} disabled={saving} className="py-2.5 px-6 rounded-md bg-primary text-primary-foreground border-none text-[13px] font-extrabold cursor-pointer disabled:opacity-70">{saving ? "جارٍ…" : "حفظ"}</button>
      </div>
    </div>
  );
}

/* ─── Installment List ──────────────────────────────────────────────────────── */
function InstallmentList({ installments }: { installments: Installment[] }) {
  const totalActive = installments.filter(i => i.status === "active").reduce((s, i) => s + i.totalAmount, 0);

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-3">
        <div className="bg-card rounded-[14px] border border-border py-3.5 px-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-sm flex items-center justify-center" style={{ background: "rgba(16,185,129,0.20)", color: "#10b981" }}><CalendarDays size={18} /></div>
          <div><div className="text-[11px] text-muted-foreground">أقساط نشطة</div><div className="text-lg font-extrabold [direction:ltr] text-end">{fmt(totalActive)}</div></div>
        </div>
        <div className="bg-card rounded-[14px] border border-border py-3.5 px-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-sm flex items-center justify-center" style={{ background: "rgba(59,130,246,0.20)", color: "#3b82f6" }}><CheckCircle2 size={18} /></div>
          <div><div className="text-[11px] text-muted-foreground">عدد الاتفاقات</div><div className="text-lg font-extrabold [direction:ltr] text-end">{installments.length}</div></div>
        </div>
      </div>
      <div className="bg-card rounded-[14px] border border-border overflow-hidden">
        {installments.length === 0 ? <Empty label="اتفاقات تقسيط" /> : (
          <div className="overflow-x-auto garfix-scroll">
            <table className="w-full border-collapse">
              <thead><tr className="border-b border-border bg-muted">
                <th className={thStyle}>المرجع</th><th className={thStyle}>العميل</th><th className={cn(thStyle, "text-end")}>المبلغ</th>
                <th className={thStyle}>عدد الأقساط</th><th className={thStyle}>المسددة</th><th className={thStyle}>القسط التالي</th><th className={thStyle}>الحالة</th>
              </tr></thead>
              <tbody>
                {installments.map((ins) => (
                  <tr key={ins.id} className="border-b border-border">
                    <td className={cn(tdStyle, "font-mono")}>{ins.reference}</td>
                    <td className={cn(tdStyle, "font-bold")}>{ins.clientName}</td>
                    <td className={cn(tdStyle, "[direction:ltr] text-end font-bold")}>{fmt(ins.totalAmount)}</td>
                    <td className={tdStyle}>{ins.installmentCount}</td>
                    <td className={tdStyle}>{ins.paidCount}/{ins.installmentCount}</td>
                    <td className={tdStyle} dir="ltr">{ins.nextDueDate}</td>
                    <td className={tdStyle}><span className="py-0.5 px-2.5 rounded-[12px] text-[11px] font-bold" style={{ background: ins.status === "active" ? "rgba(16,185,129,0.15)" : ins.status === "completed" ? "rgba(59,130,246,0.15)" : "rgba(239,68,68,0.15)", color: ins.status === "active" ? "#10b981" : ins.status === "completed" ? "#3b82f6" : "#ef4444" }}>{ins.status === "active" ? "نشط" : ins.status === "completed" ? "مكتمل" : "متوقف"}</span></td>
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

/* ─── Installment Form ──────────────────────────────────────────────────────── */
function InstallmentForm({ company, onClose, onSaved }: { company: { slug: string }; onClose: () => void; onSaved: () => void }) {
  const [reference, setReference] = useState("");
  const [clientName, setClientName] = useState("");
  const [totalAmount, setTotalAmount] = useState(0);
  const [installmentCount, setInstallmentCount] = useState(1);
  const [firstDueDate, setFirstDueDate] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!reference || !clientName || totalAmount <= 0 || installmentCount <= 0 || !firstDueDate) { toast.error("جميع الحقول مطلوبة"); return; }
    setSaving(true);
    try {
      const res = await authedFetch("/api/accounting/installments", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reference, clientName, totalAmount, installmentCount, firstDueDate, companySlug: company.slug }),
      });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || "Failed"); }
      toast.success("تم إنشاء اتفاق التقسيط");
      onSaved();
    } catch (err) { toast.error(err instanceof Error ? err.message : "خطأ"); }
    finally { setSaving(false); }
  };

  return (
    <div className="bg-card rounded-[14px] border border-border p-5 flex flex-col gap-3.5">
      <h3 className="text-[15px] font-bold flex items-center gap-2"><CalendarDays size={16} /> اتفاق تقسيط جديد</h3>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-3">
        <div><label className={labelStyle}>المرجع *</label><input value={reference} onChange={(e) => setReference(e.target.value)} className={inputStyle} dir="ltr" /></div>
        <div><label className={labelStyle}>العميل *</label><input value={clientName} onChange={(e) => setClientName(e.target.value)} className={inputStyle} /></div>
        <div><label className={labelStyle}>المبلغ الإجمالي *</label><input type="number" value={totalAmount} onChange={(e) => setTotalAmount(Number(e.target.value))} className={inputStyle} dir="ltr" /></div>
        <div><label className={labelStyle}>عدد الأقساط *</label><input type="number" min={1} value={installmentCount} onChange={(e) => setInstallmentCount(Number(e.target.value))} className={inputStyle} dir="ltr" /></div>
        <div><label className={labelStyle}>تاريخ القسط الأول *</label><input type="date" value={firstDueDate} onChange={(e) => setFirstDueDate(e.target.value)} className={inputStyle} dir="ltr" /></div>
      </div>
      {totalAmount > 0 && installmentCount > 0 && (
        <div className="bg-muted rounded-md p-3 text-[12px] text-muted-foreground">
          القسط الشهري: <span className="font-bold text-foreground">{fmt(totalAmount / installmentCount)}</span> × {installmentCount} قسط
        </div>
      )}
      <div className="flex gap-2.5 justify-end">
        <button onClick={onClose} className="py-2.5 px-5 rounded-md bg-transparent text-muted-foreground border border-border text-[13px] font-bold cursor-pointer">إلغاء</button>
        <button onClick={submit} disabled={saving} className="py-2.5 px-6 rounded-md bg-primary text-primary-foreground border-none text-[13px] font-extrabold cursor-pointer disabled:opacity-70">{saving ? "جارٍ…" : "حفظ"}</button>
      </div>
    </div>
  );
}

export default ArApView;

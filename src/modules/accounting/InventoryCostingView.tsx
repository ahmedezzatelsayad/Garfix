"use client";

import { useEffect, useState, useCallback } from "react";
import { useBrand } from "@/context/BrandContext";
import { authedFetch } from "@/context/AuthContext";
import { toast } from "sonner";
import {
  Package, TrendingDown, Calculator, Plus, X, DollarSign,
  Calendar, ArrowUpDown,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface ValuationItem {
  id: number; productCode: string; productName: string;
  quantity: number; unitCost: number; totalValue: number;
  costingMethod: string;
}
interface COGSResult {
  itemCode: string; itemName: string; quantitySold: number;
  cogsPerUnit: number; totalCOGS: number; method: string;
}
interface LandedCostItem {
  id: number; purchaseInvoiceId: string; costType: string;
  totalCost: number; allocationMethod: string; status: string;
  createdAt: string;
}

type Tab = "valuation" | "cogs" | "landed-cost";

const COST_TYPES = [
  { value: "shipping", label: "شحن" }, { value: "customs", label: "جمارك" },
  { value: "insurance", label: "تأمين" }, { value: "handling", label: "مناولة" },
  { value: "brokerage", label: "وساطة" }, { value: "other", label: "أخرى" },
];

const ALLOCATION_METHODS = [
  { value: "weight", label: "حسب الوزن" }, { value: "quantity", label: "حسب الكمية" },
  { value: "value", label: "حسب القيمة" }, { value: "equal", label: "متساوي" },
];

const COSTING_METHODS: Record<string, string> = {
  "fifo": "FIFO", "lifo": "LIFO", "weighted-average": "متوسط مرجح", "standard": "قياسي",
};

const thStyle = "text-start py-2.5 px-3 text-[11px] text-muted-foreground font-bold";
const tdStyle = "py-2.5 px-3 text-[13px]";
const inputStyle = "w-full py-2 px-3 rounded-sm bg-background border border-border text-foreground text-[13px] outline-none";
const labelStyle = "block text-[11px] font-semibold text-muted-foreground mb-1";
function fmt(n: number) { return n.toLocaleString("ar-EG", { maximumFractionDigits: 3 }); }
function Empty({ label }: { label: string }) { return <div className="p-12 text-center text-muted-foreground">لا توجد {label} بعد</div>; }

export function InventoryCostingView() {
  const { activeCompany } = useBrand();
  const [tab, setTab] = useState<Tab>("valuation");
  const [valuation, setValuation] = useState<ValuationItem[]>([]);
  const [landedCosts, setLandedCosts] = useState<LandedCostItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [cogsResult, setCogsResult] = useState<COGSResult | null>(null);

  const slug = activeCompany ? encodeURIComponent(activeCompany.slug) : "";

  const loadValuation = useCallback(async (asOfDate?: string) => {
    if (!activeCompany) return;
    setLoading(true);
    try {
      const dateParam = asOfDate ? `&asOfDate=${asOfDate}` : "";
      const res = await authedFetch(`/api/accounting/inventory-valuation?companySlug=${slug}${dateParam}`);
      if (res.ok) { const d = await res.json(); setValuation(d.items || []); }
      else setValuation([]);
    } catch { setValuation([]); }
    finally { setLoading(false); }
  }, [slug, activeCompany]);

  const loadLanded = useCallback(async () => {
    if (!activeCompany) return;
    setLoading(true);
    try {
      const res = await authedFetch(`/api/accounting/landed-cost?companySlug=${slug}`);
      if (res.ok) { const d = await res.json(); setLandedCosts(d.items || []); }
      else setLandedCosts([]);
    } catch { setLandedCosts([]); }
    finally { setLoading(false); }
  }, [slug, activeCompany]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (tab === "valuation") loadValuation();
    if (tab === "landed-cost") loadLanded();
  }, [tab, loadValuation, loadLanded]);

  if (!activeCompany) return <div className="p-12 text-center text-muted-foreground">اختر شركة</div>;

  const totalValue = valuation.reduce((s, v) => s + v.totalValue, 0);

  const tabs: Array<{ key: Tab; label: string; icon: React.ComponentType<{ size?: number }> }> = [
    { key: "valuation", label: "تقييم المخزون", icon: Package },
    { key: "cogs", label: "تكلفة البضاعة المباعة", icon: TrendingDown },
    { key: "landed-cost", label: "التكلفة الواقعية", icon: Calculator },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap justify-between items-center gap-3">
        <div><h1 className="text-2xl font-extrabold flex items-center gap-2"><Package size={20} /> تكلفة المخزون</h1><p className="text-[13px] text-muted-foreground">{activeCompany.nameAr || activeCompany.name}</p></div>
        {tab === "landed-cost" && !showForm && (
          <button onClick={() => setShowForm(true)} className="inline-flex items-center gap-1.5 py-2.5 px-[18px] rounded-[10px] bg-primary text-primary-foreground border-none text-[13px] font-bold cursor-pointer"><Plus size={16} /> إضافة</button>
        )}
      </div>
      <div className="flex gap-1.5 flex-wrap">
        {tabs.map((t) => { const Icon = t.icon; return (
          <button key={t.key} onClick={() => { setTab(t.key); setShowForm(false); setCogsResult(null); }} className={cn("py-2 px-4 rounded-[10px] border border-border text-[12px] font-bold cursor-pointer inline-flex items-center gap-1.5", tab === t.key ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground")}>
            <Icon size={14} /> {t.label}
          </button>
        ); })}
      </div>

      {loading ? <div className="p-12 text-center text-muted-foreground">جارٍ التحميل…</div> : tab === "valuation" ? (
        <ValuationView items={valuation} totalValue={totalValue} company={activeCompany} onRefresh={loadValuation} />
      ) : tab === "cogs" ? (
        <COGSView result={cogsResult} setResult={setCogsResult} company={activeCompany} valuation={valuation} />
      ) : tab === "landed-cost" ? (
        showForm ? <LandedCostForm company={activeCompany} onClose={() => setShowForm(false)} onSaved={() => { setShowForm(false); loadLanded(); }} /> : <LandedCostView items={landedCosts} />
      ) : null}
    </div>
  );
}

/* ─── Valuation ─────────────────────────────────────── */
function ValuationView({ items, totalValue, company, onRefresh }: {
  items: ValuationItem[]; totalValue: number; company: { slug: string }; onRefresh: (d?: string) => void;
}) {
  const [asOfDate, setAsOfDate] = useState("");

  const handleFilter = () => { onRefresh(asOfDate); };

  return (
    <div className="flex flex-col gap-4">
      <div className="bg-card rounded-[14px] border border-border py-3.5 px-4 flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-1.5">
          <label className="text-[11px] font-bold text-muted-foreground">كحدود تاريخ</label>
          <input type="date" value={asOfDate} onChange={(e) => setAsOfDate(e.target.value)} className={cn(inputStyle, "w-auto")} dir="ltr" />
        </div>
        <button onClick={handleFilter} className="py-2 px-4 rounded-sm bg-primary text-primary-foreground border-none text-[12px] font-bold cursor-pointer inline-flex items-center gap-1.5"><Calendar size={14} /> تطبيق</button>
      </div>
      <div className="bg-card rounded-[14px] border border-border py-3.5 px-4 flex items-center gap-3">
        <div className="w-10 h-10 rounded-sm flex items-center justify-center" style={{ background: "rgba(16,185,129,0.20)", color: "#10b981" }}><DollarSign size={18} /></div>
        <div><div className="text-[11px] text-muted-foreground">إجمالي قيمة المخزون</div><div className="text-lg font-extrabold [direction:ltr] text-end">{fmt(totalValue)}</div></div>
      </div>
      <div className="bg-card rounded-[14px] border border-border overflow-hidden">
        {items.length === 0 ? <Empty label="تقييم المخزون" /> : (
          <div className="overflow-x-auto garfix-scroll max-h-[500px]">
            <table className="w-full border-collapse">
              <thead><tr className="border-b border-border bg-muted">
                <th className={thStyle}>الكود</th><th className={thStyle}>المنتج</th><th className={thStyle}>الكمية</th>
                <th className={cn(thStyle, "text-end")}>تكلفة الوحدة</th><th className={cn(thStyle, "text-end")}>القيمة</th><th className={thStyle}>الطريقة</th>
              </tr></thead>
              <tbody>{items.map(v => (
                <tr key={v.id} className="border-b border-border">
                  <td className={cn(tdStyle, "font-mono")}>{v.productCode}</td>
                  <td className={cn(tdStyle, "font-bold")}>{v.productName}</td>
                  <td className={tdStyle}>{v.quantity}</td>
                  <td className={cn(tdStyle, "[direction:ltr] text-end")}>{fmt(v.unitCost)}</td>
                  <td className={cn(tdStyle, "[direction:ltr] text-end font-bold")} style={{ color: "#10b981" }}>{fmt(v.totalValue)}</td>
                  <td className={tdStyle}><span className="py-0.5 px-2 rounded-[8px] text-[10px] font-bold" style={{ background: "rgba(124,58,237,0.15)", color: "#7c3aed" }}>{COSTING_METHODS[v.costingMethod] || v.costingMethod}</span></td>
                </tr>
              ))}</tbody>
              <tfoot>
                <tr className="border-t-2 border-border bg-muted font-extrabold">
                  <td className={cn(tdStyle, "font-extrabold")} colSpan={4}>الإجمالي ({items.length} صنف)</td>
                  <td className={cn(tdStyle, "[direction:ltr] text-end font-extrabold")} style={{ color: "#10b981" }}>{fmt(totalValue)}</td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── COGS ──────────────────────────────────────────── */
function COGSView({ result, setResult, company, valuation }: {
  result: COGSResult | null; setResult: (r: COGSResult | null) => void;
  company: { slug: string }; valuation: ValuationItem[];
}) {
  const [selectedItem, setSelectedItem] = useState<number | null>(null);
  const [quantitySold, setQuantitySold] = useState(1);
  const [calculating, setCalculating] = useState(false);

  const handleCalculate = async () => {
    if (!selectedItem) { toast.error("اختر صنف"); return; }
    setCalculating(true);
    try {
      const res = await authedFetch("/api/accounting/inventory-valuation", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "cogs", itemId: selectedItem, quantitySold, companySlug: company.slug }),
      });
      if (res.ok) {
        const d = await res.json();
        setResult(d.result as COGSResult);
        toast.success("تم حساب COGS");
      } else { const e = await res.json().catch(() => ({})); toast.error((e as Record<string, unknown>)?.error as string || "تعذّر حساب COGS"); }
    } catch { toast.error("خطأ"); }
    finally { setCalculating(false); }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="bg-card rounded-[14px] border border-border p-5 flex flex-col gap-3.5">
        <h3 className="text-[15px] font-bold flex items-center gap-2"><Calculator size={16} /> حساب تكلفة البضاعة المباعة</h3>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-3">
          <div><label className={labelStyle}>الصنف *</label>
            <select value={selectedItem ?? ""} onChange={(e) => setSelectedItem(e.target.value ? Number(e.target.value) : null)} className={inputStyle}>
              <option value="">— اختر —</option>
              {valuation.map(v => <option key={v.id} value={v.id}>{v.productCode} — {v.productName} (متاح: {v.quantity})</option>)}
            </select>
          </div>
          <div><label className={labelStyle}>الكمية المباعة</label>
            <input type="number" min={1} value={quantitySold} onChange={(e) => setQuantitySold(Number(e.target.value))} className={inputStyle} dir="ltr" />
          </div>
        </div>
        <button onClick={handleCalculate} disabled={calculating} className="py-2 px-4 rounded-sm bg-primary text-primary-foreground border-none text-[12px] font-bold cursor-pointer disabled:opacity-70 inline-flex items-center gap-1.5 self-start">
          <Calculator size={14} /> {calculating ? "جارٍ…" : "حساب COGS"}
        </button>
      </div>

      {result && (
        <div className="bg-card rounded-[14px] border border-border p-5 flex flex-col gap-3">
          <h3 className="text-[15px] font-bold flex items-center gap-2"><TrendingDown size={16} /> نتائج COGS</h3>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-3">
            <div className="bg-muted rounded-md p-3"><div className="text-[11px] text-muted-foreground">الصنف</div><div className="text-[14px] font-bold">{result.itemCode} — {result.itemName}</div></div>
            <div className="bg-muted rounded-md p-3"><div className="text-[11px] text-muted-foreground">الكمية</div><div className="text-lg font-extrabold [direction:ltr] text-end">{result.quantitySold}</div></div>
            <div className="bg-muted rounded-md p-3"><div className="text-[11px] text-muted-foreground">تكلفة الوحدة</div><div className="text-lg font-extrabold [direction:ltr] text-end" style={{ color: "#f59e0b" }}>{fmt(result.cogsPerUnit)}</div></div>
            <div className="bg-muted rounded-md p-3"><div className="text-[11px] text-muted-foreground">إجمالي COGS</div><div className="text-xl font-extrabold [direction:ltr] text-end" style={{ color: "#ef4444" }}>{fmt(result.totalCOGS)}</div></div>
          </div>
          <div className="text-[12px] text-muted-foreground">طريقة التكلفة: <span className="font-bold" style={{ color: "#7c3aed" }}>{COSTING_METHODS[result.method] || result.method}</span></div>
        </div>
      )}
    </div>
  );
}

/* ─── Landed Cost ───────────────────────────────────── */
function LandedCostView({ items }: { items: LandedCostItem[] }) {
  const costTypeLabels: Record<string, string> = {};
  COST_TYPES.forEach(c => { costTypeLabels[c.value] = c.label; });
  const allocLabels: Record<string, string> = {};
  ALLOCATION_METHODS.forEach(a => { allocLabels[a.value] = a.label; });

  return (
    <div className="bg-card rounded-[14px] border border-border overflow-hidden">
      {items.length === 0 ? <Empty label="تكاليف واقعية" /> : (
        <div className="overflow-x-auto garfix-scroll">
          <table className="w-full border-collapse">
            <thead><tr className="border-b border-border bg-muted">
              <th className={thStyle}>فاتورة الشراء</th><th className={thStyle}>نوع التكلفة</th>
              <th className={cn(thStyle, "text-end")}>إجمالي التكلفة</th><th className={thStyle}>طريقة التخصيم</th><th className={thStyle}>الحالة</th><th className={thStyle}>تاريخ</th>
            </tr></thead>
            <tbody>{items.map(l => (
              <tr key={l.id} className="border-b border-border">
                <td className={cn(tdStyle, "font-mono")}>{l.purchaseInvoiceId}</td>
                <td className={tdStyle}><span className="py-0.5 px-2 rounded-[8px] text-[10px] font-bold" style={{ background: "rgba(245,158,11,0.15)", color: "#f59e0b" }}>{costTypeLabels[l.costType] || l.costType}</span></td>
                <td className={cn(tdStyle, "[direction:ltr] text-end font-bold")} style={{ color: "#ef4444" }}>{fmt(l.totalCost)}</td>
                <td className={tdStyle}>{allocLabels[l.allocationMethod] || l.allocationMethod}</td>
                <td className={tdStyle}><span className="py-0.5 px-2.5 rounded-[12px] text-[11px] font-bold" style={{ background: l.status === "allocated" ? "rgba(16,185,129,0.15)" : "rgba(245,158,11,0.15)", color: l.status === "allocated" ? "#10b981" : "#f59e0b" }}>{l.status === "allocated" ? "مخصص" : "قيد المعالجة"}</span></td>
                <td className={tdStyle} dir="ltr">{l.createdAt}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function LandedCostForm({ company, onClose, onSaved }: { company: { slug: string }; onClose: () => void; onSaved: () => void }) {
  const [purchaseInvoiceId, setPurchaseInvoiceId] = useState("");
  const [costType, setCostType] = useState("shipping");
  const [totalCost, setTotalCost] = useState(0);
  const [allocationMethod, setAllocationMethod] = useState("value");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!purchaseInvoiceId || totalCost <= 0) { toast.error("المرجع والتكلفة مطلوبة"); return; }
    setSaving(true);
    try {
      const res = await authedFetch("/api/accounting/landed-cost", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ purchaseInvoiceId, costType, totalCost, allocationMethod, companySlug: company.slug }),
      });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error((e as Record<string, unknown>)?.error as string || "Failed"); }
      toast.success("تم إنشاء التكلفة الواقعية"); onSaved();
    } catch (err) { toast.error(err instanceof Error ? err.message : "خطأ"); }
    finally { setSaving(false); }
  };

  return (
    <div className="bg-card rounded-[14px] border border-border p-5 flex flex-col gap-3.5">
      <h3 className="text-[15px] font-bold flex items-center gap-2"><Plus size={16} /> تكلفة واقعية جديدة</h3>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-3">
        <div><label className={labelStyle}>فاتورة الشراء *</label><input value={purchaseInvoiceId} onChange={(e) => setPurchaseInvoiceId(e.target.value)} className={inputStyle} dir="ltr" placeholder="INV-001" /></div>
        <div><label className={labelStyle}>نوع التكلفة</label>
          <select value={costType} onChange={(e) => setCostType(e.target.value)} className={inputStyle}>
            {COST_TYPES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
        </div>
        <div><label className={labelStyle}>إجمالي التكلفة *</label><input type="number" value={totalCost} onChange={(e) => setTotalCost(Number(e.target.value))} className={inputStyle} dir="ltr" /></div>
        <div><label className={labelStyle}>طريقة التخصيم</label>
          <select value={allocationMethod} onChange={(e) => setAllocationMethod(e.target.value)} className={inputStyle}>
            {ALLOCATION_METHODS.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
          </select>
        </div>
      </div>
      <div className="flex gap-2.5 justify-end">
        <button onClick={onClose} className="py-2.5 px-5 rounded-md bg-transparent text-muted-foreground border border-border text-[13px] font-bold cursor-pointer">إلغاء</button>
        <button onClick={submit} disabled={saving} className="py-2.5 px-6 rounded-md bg-primary text-primary-foreground border-none text-[13px] font-extrabold cursor-pointer disabled:opacity-70">{saving ? "جارٍ…" : "حفظ"}</button>
      </div>
    </div>
  );
}

export default InventoryCostingView;

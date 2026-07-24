// Responsive: sm/md/lg breakpoints added
"use client";

import { useEffect, useState, useCallback } from "react";
import { useBrand } from "@/context/BrandContext";
import { authedFetch } from "@/context/AuthContext";
import { toast } from "sonner";
import {
  Building2, Plus, X, Trash2, Calculator, TrendingDown,
  CheckCircle2, Clock, FileText, Filter, DollarSign,
  Calendar, ArrowUpDown,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface Asset {
  id: number; nameAr: string; nameEn?: string; category: string;
  acquisitionDate: string; acquisitionCost: number; salvageValue: number;
  usefulLifeYears: number; depreciationMethod: string;
  accumulatedDepreciation: number; bookValue: number; status: string;
  glAccountId?: number; depreciationAccountId?: number; expenseAccountId?: number;
}
interface DepEntry {
  id: number; assetName: string; period: string;
  depreciationAmount: number; bookValueAfter: number; status: string;
}
interface DisposalRecord {
  id: number; assetName: string; disposalType: string;
  disposalAmount: number; disposalDate: string; status: string;
}

type Tab = "assets" | "depreciation" | "disposal";

const CATEGORIES = [
  { value: "equipment", label: "معدات" },
  { value: "vehicle", label: "سيارات" },
  { value: "building", label: "مباني" },
  { value: "furniture", label: "أثاث" },
  { value: "it", label: "تقنية المعلومات" },
  { value: "land", label: "أراضي" },
];

const DEP_METHODS = [
  { value: "straight-line", label: "خط مستقيم" },
  { value: "declining-balance", label: "تناقصي" },
  { value: "sum-of-years", label: "مجموع أرقام السنوات" },
  { value: "units-of-production", label: "وحدات الإنتاج" },
];

const thStyle = "text-start py-2.5 px-3 text-[11px] text-muted-foreground font-bold";
const tdStyle = "py-2 px-2.5 sm:py-2.5 sm:px-3 text-[12px] sm:text-[13px]";
const inputStyle = "w-full py-2 px-3 rounded-sm bg-background border border-border text-foreground text-[12px] sm:text-[13px] outline-none";
const labelStyle = "block text-[11px] font-semibold text-muted-foreground mb-1";
function fmt(n: number) { return n.toLocaleString("ar-EG", { maximumFractionDigits: 3 }); }
function Empty({ label }: { label: string }) { return <div className="p-12 text-center text-muted-foreground">لا توجد {label} بعد</div>; }

export function FixedAssetsView() {
  const { activeCompany } = useBrand();
  const [tab, setTab] = useState<Tab>("assets");
  const [assets, setAssets] = useState<Asset[]>([]);
  const [depEntries, setDepEntries] = useState<DepEntry[]>([]);
  const [disposals, setDisposals] = useState<DisposalRecord[]>([]);
  const [categoryFilter, setCategoryFilter] = useState("");
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);

  const slug = activeCompany ? encodeURIComponent(activeCompany.slug) : "";

  const loadAssets = useCallback(async () => {
    if (!activeCompany) return;
    setLoading(true);
    try {
      const res = await authedFetch(`/api/accounting/fixed-assets?companySlug=${slug}`);
      if (res.ok) { const d = await res.json(); setAssets(d.assets || []); }
      else setAssets([]);
    } catch { setAssets([]); }
    finally { setLoading(false); }
  }, [slug, activeCompany]);

  const loadDep = useCallback(async () => {
    if (!activeCompany) return;
    setLoading(true);
    try {
      const res = await authedFetch(`/api/accounting/depreciation?companySlug=${slug}`);
      if (res.ok) { const d = await res.json(); setDepEntries(d.entries || []); }
      else setDepEntries([]);
    } catch { setDepEntries([]); }
    finally { setLoading(false); }
  }, [slug, activeCompany]);

  const loadDisposals = useCallback(async () => {
    if (!activeCompany) return;
    setLoading(true);
    try {
      const res = await authedFetch(`/api/accounting/asset-disposals?companySlug=${slug}`);
      if (res.ok) { const d = await res.json(); setDisposals(d.disposals || []); }
      else setDisposals([]);
    } catch { setDisposals([]); }
    finally { setLoading(false); }
  }, [slug, activeCompany]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (tab === "assets") loadAssets();
    if (tab === "depreciation") loadDep();
    if (tab === "disposal") loadDisposals();
  }, [tab, loadAssets, loadDep, loadDisposals]);

  if (!activeCompany) return <div className="p-12 text-center text-muted-foreground">اختر شركة</div>;

  const filteredAssets = categoryFilter
    ? assets.filter(a => a.category === categoryFilter)
    : assets;

  const totalCost = filteredAssets.reduce((s, a) => s + a.acquisitionCost, 0);
  const totalDep = filteredAssets.reduce((s, a) => s + a.accumulatedDepreciation, 0);
  const totalBV = filteredAssets.reduce((s, a) => s + a.bookValue, 0);

  const tabs: Array<{ key: Tab; label: string; icon: React.ComponentType<{ size?: number }> }> = [
    { key: "assets", label: "الأصول", icon: Building2 },
    { key: "depreciation", label: "الإهلاك", icon: TrendingDown },
    { key: "disposal", label: "التخلص", icon: Trash2 },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap justify-between items-center gap-3">
        <div>
          <h1 className="text-2xl font-extrabold flex items-center gap-2"><Building2 size={20} /> الأصول الثابتة</h1>
          <p className="text-[13px] text-muted-foreground">{activeCompany.nameAr || activeCompany.name}</p>
        </div>
        {tab === "assets" && !showForm && (
          <button onClick={() => setShowForm(true)} className="inline-flex items-center gap-1.5 py-2.5 px-[18px] rounded-[10px] bg-primary text-primary-foreground border-none text-[13px] font-bold cursor-pointer">
            <Plus size={16} /> إضافة أصل
          </button>
        )}
      </div>
      <div className="flex gap-1.5 flex-wrap">
        {tabs.map((t) => {
          const Icon = t.icon;
          return (
            <button key={t.key} onClick={() => { setTab(t.key); setShowForm(false); }} className={cn("py-2 px-4 rounded-[10px] border border-border text-[12px] font-bold cursor-pointer inline-flex items-center gap-1.5", tab === t.key ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground")}>
              <Icon size={14} /> {t.label}
            </button>
          );
        })}
      </div>

      {loading ? <div className="p-12 text-center text-muted-foreground">جارٍ التحميل…</div> : tab === "assets" ? (
        showForm ? <AssetForm company={activeCompany} onClose={() => setShowForm(false)} onSaved={() => { setShowForm(false); loadAssets(); }} /> : (
          <>
            <div className="flex items-center gap-2">
              <Filter size={14} className="text-muted-foreground" />
              <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} className={cn(inputStyle, "w-auto")}>
                <option value="">جميع التصنيفات</option>
                {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>
            <AssetList assets={filteredAssets} totalCost={totalCost} totalDep={totalDep} totalBV={totalBV} />
          </>
        )
      ) : tab === "depreciation" ? (
        <DepreciationView entries={depEntries} company={activeCompany} onRefresh={loadDep} />
      ) : (
        <DisposalView disposals={disposals} assets={assets} company={activeCompany} onRefresh={loadDisposals} />
      )}
    </div>
  );
}

/* ─── Asset List ────────────────────────────────────── */
function AssetList({ assets, totalCost, totalDep, totalBV }: { assets: Asset[]; totalCost: number; totalDep: number; totalBV: number }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-[repeat(auto-fit,minmax(140px,1fr))] sm:grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-3">
        <div className="bg-card rounded-[14px] border border-border py-3.5 px-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-sm flex items-center justify-center bg-emerald-500/20 text-emerald-500"><DollarSign size={18} /></div>
          <div><div className="text-[11px] text-muted-foreground">تكلفة الاستحواذ</div><div className="text-lg font-extrabold [direction:ltr] text-end">{fmt(totalCost)}</div></div>
        </div>
        <div className="bg-card rounded-[14px] border border-border py-3.5 px-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-sm flex items-center justify-center bg-red-500/20 text-red-500"><TrendingDown size={18} /></div>
          <div><div className="text-[11px] text-muted-foreground">إهلاك متراكم</div><div className="text-lg font-extrabold [direction:ltr] text-end">{fmt(totalDep)}</div></div>
        </div>
        <div className="bg-card rounded-[14px] border border-border py-3.5 px-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-sm flex items-center justify-center bg-violet-500/20 text-violet-500"><Calculator size={18} /></div>
          <div><div className="text-[11px] text-muted-foreground">صافي القيمة الدفترية</div><div className="text-lg font-extrabold [direction:ltr] text-end">{fmt(totalBV)}</div></div>
        </div>
      </div>
      <div className="bg-card rounded-[14px] border border-border overflow-hidden">
        {assets.length === 0 ? <Empty label="أصول ثابتة" /> : (
          <div className="overflow-x-auto garfix-scroll max-h-[500px]">
            <table className="w-full border-collapse">
              <thead><tr className="border-b border-border bg-muted">
                <th className={thStyle}>الاسم</th><th className={thStyle}>التصنيف</th>
                <th className={thStyle}>تاريخ الاستحواذ</th>
                <th className={cn(thStyle, "text-end")}>تكلفة الاستحواذ</th>
                <th className={cn(thStyle, "text-end")}>إهلاك متراكم</th>
                <th className={cn(thStyle, "text-end")}>صافي القيمة</th><th className={thStyle}>الحالة</th>
              </tr></thead>
              <tbody>{assets.map(a => (
                <tr key={a.id} className="border-b border-border">
                  <td className={cn(tdStyle, "font-bold")}>{a.nameAr}</td>
                  <td className={tdStyle}>{CATEGORIES.find(c => c.value === a.category)?.label || a.category}</td>
                  <td className={tdStyle} dir="ltr">{a.acquisitionDate}</td>
                  <td className={cn(tdStyle, "[direction:ltr] text-end")}>{fmt(a.acquisitionCost)}</td>
                  <td className={cn(cn(tdStyle, "[direction:ltr] text-end"), "text-red-500")}>{fmt(a.accumulatedDepreciation)}</td>
                  <td className={cn(tdStyle, "[direction:ltr] text-end font-bold", a.bookValue > 0 ? "text-emerald-500" : "text-gray-400")}>{fmt(a.bookValue)}</td>
                  <td className={tdStyle}><span className={cn("py-0.5 px-2.5 rounded-[12px] text-[11px] font-bold", a.status === "active" ? "bg-emerald-500/15 text-emerald-500" : a.status === "disposed" ? "bg-red-500/15 text-red-500" : "bg-gray-400/15 text-gray-400")}>{a.status === "active" ? "نشط" : a.status === "disposed" ? "متخلص" : "معلّق"}</span></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Asset Form ─────────────────────────────────────── */
function AssetForm({ company, onClose, onSaved }: { company: { slug: string; currency: string }; onClose: () => void; onSaved: () => void }) {
  const [nameAr, setNameAr] = useState("");
  const [nameEn, setNameEn] = useState("");
  const [category, setCategory] = useState("equipment");
  const [acquisitionDate, setAcquisitionDate] = useState("");
  const [acquisitionCost, setAcquisitionCost] = useState(0);
  const [salvageValue, setSalvageValue] = useState(0);
  const [usefulLifeYears, setUsefulLifeYears] = useState(5);
  const [depreciationMethod, setDepreciationMethod] = useState("straight-line");
  const [glAccountId, setGlAccountId] = useState<number | null>(null);
  const [depreciationAccountId, setDepreciationAccountId] = useState<number | null>(null);
  const [expenseAccountId, setExpenseAccountId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!nameAr || !acquisitionDate || acquisitionCost <= 0) { toast.error("جميع الحقول المطلوبة"); return; }
    setSaving(true);
    try {
      const res = await authedFetch("/api/accounting/fixed-assets", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nameAr, nameEn, category, acquisitionDate, acquisitionCost,
          salvageValue, usefulLifeYears, depreciationMethod,
          glAccountId, depreciationAccountId, expenseAccountId,
          companySlug: company.slug,
        }),
      });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error((e as Record<string, unknown>)?.error as string || "Failed"); }
      toast.success("تم إنشاء الأصل"); onSaved();
    } catch (err) { toast.error(err instanceof Error ? err.message : "خطأ"); }
    finally { setSaving(false); }
  };

  const annualDep = depreciationMethod === "straight-line" && usefulLifeYears > 0
    ? (acquisitionCost - salvageValue) / usefulLifeYears : 0;

  return (
    <div className="bg-card rounded-[14px] border border-border p-5 flex flex-col gap-3.5">
      <h3 className="text-[15px] font-bold flex items-center gap-2"><Plus size={16} /> أصل ثابت جديد</h3>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] sm:grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-3">
        <div><label className={labelStyle}>الاسم بالعربية *</label><input value={nameAr} onChange={(e) => setNameAr(e.target.value)} className={inputStyle} /></div>
        <div><label className={labelStyle}>الاسم بالإنجليزية</label><input value={nameEn} onChange={(e) => setNameEn(e.target.value)} className={inputStyle} dir="ltr" /></div>
        <div><label className={labelStyle}>التصنيف</label>
          <select value={category} onChange={(e) => setCategory(e.target.value)} className={inputStyle}>
            {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
        </div>
        <div><label className={labelStyle}>تاريخ الاستحواذ *</label><input type="date" value={acquisitionDate} onChange={(e) => setAcquisitionDate(e.target.value)} className={inputStyle} dir="ltr" /></div>
        <div><label className={labelStyle}>تكلفة الاستحواذ *</label><input type="number" value={acquisitionCost} onChange={(e) => setAcquisitionCost(Number(e.target.value))} className={inputStyle} dir="ltr" /></div>
        <div><label className={labelStyle}>قيمة الخردة</label><input type="number" value={salvageValue} onChange={(e) => setSalvageValue(Number(e.target.value))} className={inputStyle} dir="ltr" /></div>
        <div><label className={labelStyle}>العمر (سنوات)</label><input type="number" value={usefulLifeYears} onChange={(e) => setUsefulLifeYears(Number(e.target.value))} className={inputStyle} dir="ltr" /></div>
        <div><label className={labelStyle}>طريقة الإهلاك</label>
          <select value={depreciationMethod} onChange={(e) => setDepreciationMethod(e.target.value)} className={inputStyle}>
            {DEP_METHODS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
        </div>
        <div><label className={labelStyle}>حساب الأصل</label><input type="number" value={glAccountId ?? ""} onChange={(e) => setGlAccountId(e.target.value ? Number(e.target.value) : null)} className={inputStyle} dir="ltr" placeholder="ID الحساب" /></div>
        <div><label className={labelStyle}>حساب الإهلاك</label><input type="number" value={depreciationAccountId ?? ""} onChange={(e) => setDepreciationAccountId(e.target.value ? Number(e.target.value) : null)} className={inputStyle} dir="ltr" placeholder="ID الحساب" /></div>
        <div><label className={labelStyle}>حساب المصروف</label><input type="number" value={expenseAccountId ?? ""} onChange={(e) => setExpenseAccountId(e.target.value ? Number(e.target.value) : null)} className={inputStyle} dir="ltr" placeholder="ID الحساب" /></div>
      </div>
      {annualDep > 0 && <div className="text-[12px] text-muted-foreground">الإهلاك السنوي (خط مستقيم): <span className="font-bold text-amber-500">{fmt(annualDep)}</span></div>}
      <div className="flex gap-2.5 justify-end">
        <button onClick={onClose} className="py-2.5 px-5 rounded-md bg-transparent text-muted-foreground border border-border text-[13px] font-bold cursor-pointer">إلغاء</button>
        <button onClick={submit} disabled={saving} className="py-2.5 px-6 rounded-md bg-primary text-primary-foreground border-none text-[13px] font-extrabold cursor-pointer disabled:opacity-70">{saving ? "جارٍ…" : "حفظ"}</button>
      </div>
    </div>
  );
}

/* ─── Depreciation ──────────────────────────────────── */
function DepreciationView({ entries, company, onRefresh }: { entries: DepEntry[]; company: { slug: string }; onRefresh: () => void }) {
  const [period, setPeriod] = useState(new Date().toISOString().slice(0, 7));
  const [running, setRunning] = useState(false);

  const handleRun = async () => {
    setRunning(true);
    try {
      const res = await authedFetch(`/api/accounting/depreciation?companySlug=${encodeURIComponent(company.slug)}&period=${period}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ period, companySlug: company.slug }),
      });
      if (res.ok) { toast.success("تم حساب الإهلاك"); onRefresh(); }
      else { const e = await res.json().catch(() => ({})); toast.error((e as Record<string, unknown>)?.error as string || "تعذّر حساب الإهلاك"); }
    } catch { toast.error("خطأ"); }
    finally { setRunning(false); }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="bg-card rounded-[14px] border border-border py-3.5 px-4 flex gap-3 items-center flex-wrap">
        <div className="flex items-center gap-1.5">
          <label className="text-[11px] font-bold text-muted-foreground">الفترة</label>
          <input type="month" value={period} onChange={(e) => setPeriod(e.target.value)} className={cn(inputStyle, "w-auto")} dir="ltr" />
        </div>
        <button onClick={handleRun} disabled={running} className="py-2 px-4 rounded-sm bg-primary text-primary-foreground border-none text-[12px] font-bold cursor-pointer disabled:opacity-70 inline-flex items-center gap-1.5">
          <Calculator size={14} /> {running ? "جارٍ…" : "تشغيل الإهلاك"}
        </button>
      </div>
      <div className="bg-card rounded-[14px] border border-border overflow-hidden">
        {entries.length === 0 ? <Empty label="قيود إهلاك" /> : (
          <div className="overflow-x-auto garfix-scroll">
            <table className="w-full border-collapse">
              <thead><tr className="border-b border-border bg-muted">
                <th className={thStyle}>الأصل</th><th className={thStyle}>الفترة</th>
                <th className={cn(thStyle, "text-end")}>مبلغ الإهلاك</th>
                <th className={cn(thStyle, "text-end")}>صافي القيمة بعد</th><th className={thStyle}>الحالة</th>
              </tr></thead>
              <tbody>{entries.map(e => (
                <tr key={e.id} className="border-b border-border">
                  <td className={cn(tdStyle, "font-bold")}>{e.assetName}</td>
                  <td className={tdStyle} dir="ltr">{e.period}</td>
                  <td className={cn(cn(tdStyle, "[direction:ltr] text-end"), "text-red-500")}>{fmt(e.depreciationAmount)}</td>
                  <td className={cn(tdStyle, "[direction:ltr] text-end font-bold", e.bookValueAfter > 0 ? "text-emerald-500" : "text-gray-400")}>{fmt(e.bookValueAfter)}</td>
                  <td className={tdStyle}><span className={cn("py-0.5 px-2.5 rounded-[12px] text-[11px] font-bold", e.status === "posted" ? "bg-emerald-500/15 text-emerald-500" : "bg-amber-500/15 text-amber-500")}>{e.status === "posted" ? "مُرحّل" : "مسودة"}</span></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Disposal ──────────────────────────────────────── */
function DisposalView({ disposals, assets, company, onRefresh }: { disposals: DisposalRecord[]; assets: Asset[]; company: { slug: string }; onRefresh: () => void }) {
  const [showForm, setShowForm] = useState(false);

  const disposalTypeLabels: Record<string, string> = { sold: "بيع", scrapped: "إهدار", donated: "تبرع" };

  return (
    <div className="flex flex-col gap-4">
      {!showForm && (
        <button onClick={() => setShowForm(true)} className="inline-flex items-center gap-1.5 py-2.5 px-[18px] rounded-[10px] bg-primary text-primary-foreground border-none text-[13px] font-bold cursor-pointer"><Plus size={16} /> تسجيل تخلص</button>
      )}
      {showForm && <DisposalForm assets={assets.filter(a => a.status === "active")} company={company} onClose={() => setShowForm(false)} onSaved={() => { setShowForm(false); onRefresh(); }} />}
      <div className="bg-card rounded-[14px] border border-border overflow-hidden">
        {disposals.length === 0 ? <Empty label="تخلصات" /> : (
          <div className="overflow-x-auto garfix-scroll">
            <table className="w-full border-collapse">
              <thead><tr className="border-b border-border bg-muted">
                <th className={thStyle}>الأصل</th><th className={thStyle}>النوع</th><th className={thStyle}>تاريخ التخلص</th>
                <th className={cn(thStyle, "text-end")}>مبلغ التخلص</th><th className={thStyle}>الحالة</th>
              </tr></thead>
              <tbody>{disposals.map(d => (
                <tr key={d.id} className="border-b border-border">
                  <td className={cn(tdStyle, "font-bold")}>{d.assetName}</td>
                  <td className={tdStyle}><span className={cn("py-0.5 px-2.5 rounded-[12px] text-[11px] font-bold", d.disposalType === "sold" ? "bg-emerald-500/15 text-emerald-500" : d.disposalType === "scrapped" ? "bg-red-500/15 text-red-500" : "bg-violet-500/15 text-violet-500")}>{disposalTypeLabels[d.disposalType] || d.disposalType}</span></td>
                  <td className={tdStyle} dir="ltr">{d.disposalDate}</td>
                  <td className={cn(tdStyle, "[direction:ltr] text-end font-bold")}>{fmt(d.disposalAmount)}</td>
                  <td className={tdStyle}><span className={cn("py-0.5 px-2.5 rounded-[12px] text-[11px] font-bold", d.status === "completed" ? "bg-emerald-500/15 text-emerald-500" : "bg-amber-500/15 text-amber-500")}>{d.status === "completed" ? "مكتمل" : "قيد التنفيذ"}</span></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function DisposalForm({ assets, company, onClose, onSaved }: { assets: Asset[]; company: { slug: string }; onClose: () => void; onSaved: () => void }) {
  const [assetId, setAssetId] = useState<number | null>(null);
  const [disposalType, setDisposalType] = useState("sold");
  const [disposalAmount, setDisposalAmount] = useState(0);
  const [disposalDate, setDisposalDate] = useState(new Date().toISOString().slice(0, 10));
  const [saving, setSaving] = useState(false);

  const selected = assets.find(a => a.id === assetId);

  const submit = async () => {
    if (!assetId) { toast.error("اختر الأصل"); return; }
    setSaving(true);
    try {
      const res = await authedFetch(`/api/accounting/fixed-assets/${assetId}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "dispose", disposalType, disposalAmount, disposalDate, companySlug: company.slug }),
      });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error((e as Record<string, unknown>)?.error as string || "Failed"); }
      toast.success("تم تسجيل التخلص"); onSaved();
    } catch (err) { toast.error(err instanceof Error ? err.message : "خطأ"); }
    finally { setSaving(false); }
  };

  return (
    <div className="bg-card rounded-[14px] border border-border p-5 flex flex-col gap-3.5">
      <h3 className="text-[15px] font-bold flex items-center gap-2"><Trash2 size={16} /> تسجيل تخلص من أصل</h3>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] sm:grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-3">
        <div><label className={labelStyle}>الأصل *</label>
          <select value={assetId ?? ""} onChange={(e) => setAssetId(e.target.value ? Number(e.target.value) : null)} className={inputStyle}>
            <option value="">— اختر —</option>
            {assets.map(a => <option key={a.id} value={a.id}>{a.nameAr} (صافي: {fmt(a.bookValue)})</option>)}
          </select>
        </div>
        <div><label className={labelStyle}>نوع التخلص</label>
          <select value={disposalType} onChange={(e) => setDisposalType(e.target.value)} className={inputStyle}>
            <option value="sold">بيع</option><option value="scrapped">إهدار</option><option value="donated">تبرع</option>
          </select>
        </div>
        <div><label className={labelStyle}>مبلغ التخلص</label><input type="number" value={disposalAmount} onChange={(e) => setDisposalAmount(Number(e.target.value))} className={inputStyle} dir="ltr" /></div>
        <div><label className={labelStyle}>تاريخ التخلص</label><input type="date" value={disposalDate} onChange={(e) => setDisposalDate(e.target.value)} className={inputStyle} dir="ltr" /></div>
      </div>
      {selected && (
        <div className="bg-muted rounded-md p-3 text-[12px] flex flex-col gap-1">
          <div>صافي القيمة الدفترية: <span className="font-bold">{fmt(selected.bookValue)}</span></div>
          <div>ربح/خسارة: <span className={cn("font-bold", disposalAmount - selected.bookValue >= 0 ? "text-emerald-500" : "text-red-500")}>{fmt(disposalAmount - selected.bookValue)}</span></div>
        </div>
      )}
      <div className="flex gap-2.5 justify-end">
        <button onClick={onClose} className="py-2.5 px-5 rounded-md bg-transparent text-muted-foreground border border-border text-[13px] font-bold cursor-pointer">إلغاء</button>
        <button onClick={submit} disabled={saving} className="py-2.5 px-6 rounded-md bg-primary text-primary-foreground border-none text-[13px] font-extrabold cursor-pointer disabled:opacity-70">{saving ? "جارٍ…" : "حفظ"}</button>
      </div>
    </div>
  );
}

export default FixedAssetsView;

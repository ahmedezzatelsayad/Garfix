"use client";

import { useEffect, useState, useCallback } from "react";
import { useBrand } from "@/context/BrandContext";
import { authedFetch } from "@/context/AuthContext";
import { toast } from "sonner";
import {
  Plus, X, FileText, Receipt, ShoppingCart, Scale,
  Users, DollarSign, Calendar, CheckCircle2, XCircle,
  Printer, ArrowRight, CreditCard, BookOpen, Percent,
  HandCoins,
} from "lucide-react";
import { cn } from "@/lib/utils";

/* ─── Interfaces ──────────────────────────────────────────────────────────── */
interface Voucher {
  id: number; voucherType: string; date: string; amount: number;
  currency: string; payee: string; payer: string; status: string;
  amountTextAr?: string;
}
interface Quotation {
  id: number; clientName: string; date: string; validUntil: string;
  lineItems: LineItem[]; totalAmount: number; status: string;
}
interface PurchaseOrder {
  id: number; supplierName: string; date: string; expectedDelivery: string;
  lineItems: LineItem[]; totalAmount: number; status: string;
}
interface LineItem { id?: number; description: string; quantity: number; unitPrice: number; total: number; }
interface OpeningBalance { id: number; accountId: number; accountCode: string; accountNameAr: string; amount: number; posted: boolean; }
interface Commission { id: number; salesperson: string; totalSales: number; commissionAmount: number; posted: boolean; }
interface ProfitDistribution { id: number; partnerName: string; ownershipPercent: number; profitShare: number; posted: boolean; }

type Tab = "vouchers" | "quotations" | "purchase-orders" | "opening-balances" | "commissions" | "profit-distribution";

/* ─── Shared Styles ─────────────────────────────────────────────────────────── */
const thStyle = "text-start py-2.5 px-3 text-[11px] text-muted-foreground font-bold";
const tdStyle = "py-2.5 px-3 text-[13px]";
const inputStyle = "w-full py-2 px-3 rounded-sm bg-background border border-border text-foreground text-[13px] outline-none";
const labelStyle = "block text-[11px] font-semibold text-muted-foreground mb-1";
const selectStyle = "w-full py-2 px-3 rounded-sm bg-background border border-border text-foreground text-[13px] outline-none cursor-pointer";

function Empty({ label }: { label: string }) {
  return <div className="p-12 text-center text-muted-foreground">لا توجد {label} بعد</div>;
}

/* ─── Main Component ────────────────────────────────────────────────────────── */
export function VouchersDetailView() {
  const { activeCompany } = useBrand();
  const [tab, setTab] = useState<Tab>("vouchers");
  const [vouchers, setVouchers] = useState<Voucher[]>([]);
  const [quotations, setQuotations] = useState<Quotation[]>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
  const [openingBalances, setOpeningBalances] = useState<OpeningBalance[]>([]);
  const [commissions, setCommissions] = useState<Commission[]>([]);
  const [profitDistributions, setProfitDistributions] = useState<ProfitDistribution[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  /* Voucher form */
  const [vType, setVType] = useState("receipt");
  const [vDate, setVDate] = useState("");
  const [vAmount, setVAmount] = useState("");
  const [vCurrency, setVCurrency] = useState("KWD");
  const [vPayee, setVPayee] = useState("");
  const [vPayer, setVPayer] = useState("");

  /* Quotation form */
  const [qClient, setQClient] = useState("");
  const [qDate, setQDate] = useState("");
  const [qValidUntil, setQValidUntil] = useState("");
  const [qLineItems, setQLineItems] = useState<LineItem[]>([{ description: "", quantity: 1, unitPrice: 0, total: 0 }]);

  /* PO form */
  const [poSupplier, setPoSupplier] = useState("");
  const [poDate, setPoDate] = useState("");
  const [poDelivery, setPoDelivery] = useState("");
  const [poLineItems, setPoLineItems] = useState<LineItem[]>([{ description: "", quantity: 1, unitPrice: 0, total: 0 }]);

  /* Opening Balance form */
  const [obAccountId, setObAccountId] = useState("");
  const [obAmount, setObAmount] = useState("");

  /* Commission dates */
  const [commFrom, setCommFrom] = useState("");
  const [commTo, setCommTo] = useState("");

  const slug = activeCompany ? `companySlug=${encodeURIComponent(activeCompany.slug)}` : "";

  /* ── Loaders ──────────────────────────────────────────────────────────────── */
  const loadVouchers = useCallback(async () => {
    if (!activeCompany) { setLoading(false); return; }
    setLoading(true);
    try {
      const res = await authedFetch(`/api/accounting/vouchers?${slug}`);
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || "فشل تحميل السندات"); }
      const d = await res.json(); setVouchers(d.vouchers || []);
    } catch (err) { toast.error(err instanceof Error ? err.message : "تعذّر تحميل السندات"); setVouchers([]); }
    finally { setLoading(false); }
  }, [activeCompany, slug]);

  const loadQuotations = useCallback(async () => {
    if (!activeCompany) return; setLoading(true);
    try {
      const res = await authedFetch(`/api/accounting/quotations?${slug}`);
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || "فشل تحميل عروض الأسعار"); }
      const d = await res.json(); setQuotations(d.quotations || []);
    } catch (err) { toast.error(err instanceof Error ? err.message : "تعذّر تحميل عروض الأسعار"); setQuotations([]); }
    finally { setLoading(false); }
  }, [activeCompany, slug]);

  const loadPOs = useCallback(async () => {
    if (!activeCompany) return; setLoading(true);
    try {
      const res = await authedFetch(`/api/accounting/purchase-orders?${slug}`);
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || "فشل تحميل أوامر الشراء"); }
      const d = await res.json(); setPurchaseOrders(d.purchaseOrders || []);
    } catch (err) { toast.error(err instanceof Error ? err.message : "تعذّر تحميل أوامر الشراء"); setPurchaseOrders([]); }
    finally { setLoading(false); }
  }, [activeCompany, slug]);

  const loadOBs = useCallback(async () => {
    if (!activeCompany) return; setLoading(true);
    try {
      const res = await authedFetch(`/api/accounting/opening-balances?${slug}`);
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || "فشل تحميل أرصدة افتتاحية"); }
      const d = await res.json(); setOpeningBalances(d.openingBalances || []);
    } catch (err) { toast.error(err instanceof Error ? err.message : "تعذّر تحميل أرصدة افتتاحية"); setOpeningBalances([]); }
    finally { setLoading(false); }
  }, [activeCompany, slug]);

  const loadCommissions = useCallback(async () => {
    if (!activeCompany) return; setLoading(true);
    try {
      const res = await authedFetch(`/api/accounting/commissions?${slug}&from=${commFrom}&to=${commTo}`);
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || "فشل تحميل العمولات"); }
      const d = await res.json(); setCommissions(d.commissions || []);
    } catch (err) { toast.error(err instanceof Error ? err.message : "تعذّر تحميل العمولات"); setCommissions([]); }
    finally { setLoading(false); }
  }, [activeCompany, slug, commFrom, commTo]);

  const loadProfitDist = useCallback(async () => {
    if (!activeCompany) return; setLoading(true);
    try {
      const res = await authedFetch(`/api/accounting/profit-distribution?${slug}`);
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || "فشل تحميل توزيع الأرباح"); }
      const d = await res.json(); setProfitDistributions(d.distributions || []);
    } catch (err) { toast.error(err instanceof Error ? err.message : "تعذّر تحميل توزيع الأرباح"); setProfitDistributions([]); }
    finally { setLoading(false); }
  }, [activeCompany, slug]);

  useEffect(() => {
    const loaders: Record<Tab, () => void> = {
      vouchers: loadVouchers, quotations: loadQuotations,
      "purchase-orders": loadPOs, "opening-balances": loadOBs,
      commissions: loadCommissions, "profit-distribution": loadProfitDist,
    };
    if (activeCompany) loaders[tab]();
  }, [tab, activeCompany, loadVouchers, loadQuotations, loadPOs, loadOBs, loadCommissions, loadProfitDist]);

  const switchTab = (t: Tab) => { setTab(t); setShowForm(false); };

  /* ── Line Items helper ───────────────────────────────────────────────────── */
  const updateLineItem = (items: LineItem[], idx: number, field: keyof LineItem, value: string | number): LineItem[] => {
    const updated = [...items];
    const item = { ...updated[idx] };
    if (field === "description") item.description = String(value);
    else if (field === "quantity") item.quantity = Number(value);
    else if (field === "unitPrice") item.unitPrice = Number(value);
    else if (field === "total") item.total = Number(value);
    item.total = item.quantity * item.unitPrice;
    updated[idx] = item;
    return updated;
  };

  /* ── Create Voucher ─────────────────────────────────────────────────────── */
  const handleCreateVoucher = async () => {
    if (!activeCompany || !vAmount || !vDate) { toast.error("يرجى ملء جميع الحقول المطلوبة"); return; }
    try {
      const res = await authedFetch("/api/accounting/vouchers", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companySlug: activeCompany.slug, voucherType: vType, date: vDate, amount: parseFloat(vAmount), currency: vCurrency, payee: vPayee, payer: vPayer }),
      });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || "فشل إنشاء السند"); }
      toast.success("تم إنشاء السند"); setShowForm(false); resetVoucherForm(); loadVouchers();
    } catch (err) { toast.error(err instanceof Error ? err.message : "تعذّر إنشاء السند"); }
  };
  const resetVoucherForm = () => { setVType("receipt"); setVDate(""); setVAmount(""); setVCurrency("KWD"); setVPayee(""); setVPayer(""); };

  /* ── Approve / Cancel Voucher ────────────────────────────────────────────── */
  const handleApproveVoucher = async (id: number) => {
    if (!activeCompany) return;
    try {
      const res = await authedFetch(`/api/accounting/vouchers/${id}/approve?${slug}`, { method: "POST" });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || "فشل اعتماد السند"); }
      toast.success("تم اعتماد السند"); loadVouchers();
    } catch (err) { toast.error(err instanceof Error ? err.message : "تعذّر اعتماد السند"); }
  };
  const handleCancelVoucher = async (id: number) => {
    if (!activeCompany) return;
    try {
      const res = await authedFetch(`/api/accounting/vouchers/${id}/cancel?${slug}`, { method: "POST" });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || "فشل إلغاء السند"); }
      toast.success("تم إلغاء السند"); loadVouchers();
    } catch (err) { toast.error(err instanceof Error ? err.message : "تعذّر إلغاء السند"); }
  };

  /* ── Create Quotation ────────────────────────────────────────────────────── */
  const handleCreateQuotation = async () => {
    if (!activeCompany || !qClient || !qDate) { toast.error("يرجى ملء جميع الحقول المطلوبة"); return; }
    try {
      const res = await authedFetch("/api/accounting/quotations", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companySlug: activeCompany.slug, clientName: qClient, date: qDate, validUntil: qValidUntil, lineItems: qLineItems }),
      });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || "فشل إنشاء عرض السعر"); }
      toast.success("تم إنشاء عرض السعر"); setShowForm(false); loadQuotations();
    } catch (err) { toast.error(err instanceof Error ? err.message : "تعذّر إنشاء عرض السعر"); }
  };

  /* ── Convert Quotation to Invoice ─────────────────────────────────────────── */
  const handleConvertToInvoice = async (id: number) => {
    if (!activeCompany) return;
    try {
      const res = await authedFetch(`/api/accounting/quotations/${id}/convert-to-invoice?${slug}`, { method: "POST" });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || "فشل التحويل"); }
      toast.success("تم التحويل إلى فاتورة"); loadQuotations();
    } catch (err) { toast.error(err instanceof Error ? err.message : "تعذّر التحويل إلى فاتورة"); }
  };

  /* ── Create PO ────────────────────────────────────────────────────────────── */
  const handleCreatePO = async () => {
    if (!activeCompany || !poSupplier || !poDate) { toast.error("يرجى ملء جميع الحقول المطلوبة"); return; }
    try {
      const res = await authedFetch("/api/accounting/purchase-orders", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companySlug: activeCompany.slug, supplierName: poSupplier, date: poDate, expectedDelivery: poDelivery, lineItems: poLineItems }),
      });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || "فشل إنشاء أمر الشراء"); }
      toast.success("تم إنشاء أمر الشراء"); setShowForm(false); loadPOs();
    } catch (err) { toast.error(err instanceof Error ? err.message : "تعذّر إنشاء أمر الشراء"); }
  };

  /* ── Create Opening Balance ──────────────────────────────────────────────── */
  const handleCreateOB = async () => {
    if (!activeCompany || !obAccountId || !obAmount) { toast.error("يرجى ملء جميع الحقول المطلوبة"); return; }
    try {
      const res = await authedFetch("/api/accounting/opening-balances", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companySlug: activeCompany.slug, accountId: parseInt(obAccountId), amount: parseFloat(obAmount) }),
      });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || "فشل إنشاء رصيد افتتاحي"); }
      toast.success("تم إنشاء الرصيد الافتتاحي"); setShowForm(false); setObAccountId(""); setObAmount(""); loadOBs();
    } catch (err) { toast.error(err instanceof Error ? err.message : "تعذّر إنشاء الرصيد الافتتاحي"); }
  };

  /* ── Post all opening balances ────────────────────────────────────────────── */
  const handlePostAllOB = async () => {
    if (!activeCompany) return;
    if (!confirm("ترحيل جميع الأرصدة الافتتاحية؟ لا يمكن التراجع عن هذا الإجراء.")) return;
    try {
      const res = await authedFetch(`/api/accounting/opening-balances/post?${slug}`, { method: "POST" });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || "فشل ترحيل الأرصدة"); }
      toast.success("تم ترحيل جميع الأرصدة الافتتاحية"); loadOBs();
    } catch (err) { toast.error(err instanceof Error ? err.message : "تعذّر ترحيل الأرصدة الافتتاحية"); }
  };

  /* ── Post Commission as JE ────────────────────────────────────────────────── */
  const handlePostCommission = async (id: number) => {
    if (!activeCompany) return;
    try {
      const res = await authedFetch(`/api/accounting/commissions/${id}/post-as-journal-entry?${slug}`, { method: "POST" });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || "فشل ترحيل العمولة"); }
      toast.success("تم ترحيل العمولة كقيد يومية"); loadCommissions();
    } catch (err) { toast.error(err instanceof Error ? err.message : "تعذّر ترحيل العمولة"); }
  };

  /* ── Post Profit Distribution as JE ───────────────────────────────────────── */
  const handlePostProfitDist = async (id: number) => {
    if (!activeCompany) return;
    try {
      const res = await authedFetch(`/api/accounting/profit-distribution/${id}/post-as-journal-entry?${slug}`, { method: "POST" });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || "فشل ترحيل التوزيع"); }
      toast.success("تم ترحيل التوزيع كقيد يومية"); loadProfitDist();
    } catch (err) { toast.error(err instanceof Error ? err.message : "تعذّر ترحيل توزيع الأرباح"); }
  };

  if (!activeCompany) return <div className="p-12 text-center text-muted-foreground">اختر شركة</div>;

  const tabs: Array<{ key: Tab; label: string; icon: React.ComponentType<{ size?: number }> }> = [
    { key: "vouchers", label: "سندات", icon: Receipt },
    { key: "quotations", label: "عروض أسعار", icon: FileText },
    { key: "purchase-orders", label: "أوامر الشراء", icon: ShoppingCart },
    { key: "opening-balances", label: "أرصدة افتتاحية", icon: BookOpen },
    { key: "commissions", label: "عمولات", icon: Percent },
    { key: "profit-distribution", label: "توزيع أرباح", icon: HandCoins },
  ];

  const fmt = (n: number) => n.toLocaleString("ar-EG", { maximumFractionDigits: 3 });

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex flex-wrap justify-between items-center gap-3">
        <div>
          <h1 className="text-2xl font-extrabold flex items-center gap-2"><Receipt size={20} /> السندات والتفاصيل</h1>
          <p className="text-[13px] text-muted-foreground">{activeCompany.nameAr || activeCompany.name}</p>
        </div>
        {!showForm && (
          <button onClick={() => setShowForm(true)} className="inline-flex items-center gap-1.5 py-2.5 px-[18px] rounded-[10px] bg-primary text-primary-foreground border-none text-[13px] font-bold cursor-pointer"><Plus size={16} /> إضافة</button>
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

      {/* Commissions date filter */}
      {tab === "commissions" && !showForm && (
        <div className="flex gap-3 items-end bg-card rounded-[10px] border border-border p-3">
          <div><label className={labelStyle}>من</label><input value={commFrom} onChange={(e) => setCommFrom(e.target.value)} className={cn(inputStyle, "w-36")} type="date" /></div>
          <div><label className={labelStyle}>إلى</label><input value={commTo} onChange={(e) => setCommTo(e.target.value)} className={cn(inputStyle, "w-36")} type="date" /></div>
        </div>
      )}

      {loading ? <div className="p-12 text-center text-muted-foreground">جارٍ التحميل…</div> : (() => {
        /* ── Vouchers Tab ─────────────────────────────────────────────────────── */
        if (tab === "vouchers") {
          if (showForm) return (
            <div className="bg-card rounded-[14px] border border-border p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-base font-bold">سند جديد</h2>
                <button onClick={() => { setShowForm(false); resetVoucherForm(); }} className="w-7 h-7 rounded-md border border-border flex items-center justify-center cursor-pointer"><X size={14} /></button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div><label className={labelStyle}>نوع السند *</label>
                  <select value={vType} onChange={(e) => setVType(e.target.value)} className={selectStyle}>
                    <option value="receipt">سند قبض</option><option value="payment">سند دفع</option>
                  </select>
                </div>
                <div><label className={labelStyle}>التاريخ *</label><input value={vDate} onChange={(e) => setVDate(e.target.value)} className={inputStyle} type="date" /></div>
                <div><label className={labelStyle}>المبلغ *</label><input value={vAmount} onChange={(e) => setVAmount(e.target.value)} className={inputStyle} type="number" placeholder="0.000" /></div>
                <div><label className={labelStyle}>العملة</label>
                  <select value={vCurrency} onChange={(e) => setVCurrency(e.target.value)} className={selectStyle}>
                    <option value="KWD">KWD</option><option value="USD">USD</option><option value="EUR">EUR</option><option value="SAR">SAR</option>
                  </select>
                </div>
                <div><label className={labelStyle}>المستفيد</label><input value={vPayee} onChange={(e) => setVPayee(e.target.value)} className={inputStyle} placeholder="اسم المستفيد" /></div>
                <div><label className={labelStyle}>الدافع</label><input value={vPayer} onChange={(e) => setVPayer(e.target.value)} className={inputStyle} placeholder="اسم الدافع" /></div>
              </div>
              <div className="flex gap-2 justify-end mt-5">
                <button onClick={() => { setShowForm(false); resetVoucherForm(); }} className="px-4 py-2 rounded-md border border-border bg-transparent text-foreground text-sm font-semibold cursor-pointer">إلغاء</button>
                <button onClick={handleCreateVoucher} className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-bold cursor-pointer inline-flex items-center gap-1.5"><Receipt size={14} /> إنشاء</button>
              </div>
            </div>
          );
          if (vouchers.length === 0) return <Empty label="سندات" />;
          return (
            <div className="bg-card rounded-[14px] border border-border overflow-hidden">
              <div className="overflow-x-auto garfix-scroll">
                <table className="w-full border-collapse">
                  <thead><tr className="border-b border-border bg-muted">
                    <th className={thStyle}>النوع</th><th className={thStyle}>التاريخ</th>
                    <th className={thStyle}>المبلغ</th><th className={thStyle}>العملة</th>
                    <th className={thStyle}>المستفيد</th><th className={thStyle}>الدافع</th>
                    <th className={thStyle}>الحالة</th><th className={thStyle}>إجراء</th>
                  </tr></thead>
                  <tbody>
                    {vouchers.map((v) => {
                      const statusMap: Record<string, { label: string; color: string }> = {
                        draft: { label: "مسودة", color: "#f59e0b" }, approved: { label: "معتمد", color: "#10b981" }, cancelled: { label: "ملغى", color: "#ef4444" },
                      };
                      const st = statusMap[v.status] || { label: v.status, color: "#999" };
                      return (
                        <tr key={v.id} className="border-b border-border">
                          <td className={tdStyle}><span className="py-0.5 px-2.5 rounded-[12px] text-[11px] font-bold" style={{ background: v.voucherType === "receipt" ? "rgba(16,185,129,0.15)" : "rgba(239,68,68,0.15)", color: v.voucherType === "receipt" ? "#10b981" : "#ef4444" }}>{v.voucherType === "receipt" ? "قبض" : "دفع"}</span></td>
                          <td className={tdStyle}>{v.date}</td>
                          <td className={cn(tdStyle, "[direction:ltr] text-end font-bold")}>{fmt(v.amount)}</td>
                          <td className={tdStyle}>{v.currency}</td>
                          <td className={tdStyle}>{v.payee || "—"}</td>
                          <td className={tdStyle}>{v.payer || "—"}</td>
                          <td className={tdStyle}><span className="py-0.5 px-2.5 rounded-[12px] text-[11px] font-bold" style={{ background: `${st.color}20`, color: st.color }}>{st.label}</span></td>
                          <td className={tdStyle}>
                            <div className="flex items-center gap-1">
                              {v.status === "draft" && (<>
                                <button onClick={() => handleApproveVoucher(v.id)} title="اعتماد" className="w-7 h-7 rounded-md border border-border flex items-center justify-center cursor-pointer hover:bg-emerald-500/10"><CheckCircle2 size={13} className="text-emerald-600" /></button>
                                <button onClick={() => handleCancelVoucher(v.id)} title="إلغاء" className="w-7 h-7 rounded-md border border-border flex items-center justify-center cursor-pointer hover:bg-red-500/10"><XCircle size={13} className="text-red-500" /></button>
                              </>)}
                              <button title="طباعة" className="w-7 h-7 rounded-md border border-border flex items-center justify-center cursor-pointer hover:bg-muted"><Printer size={13} /></button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="py-3 px-4 border-t border-border text-[12px] text-muted-foreground">{vouchers.length} سند</div>
            </div>
          );
        }

        /* ── Quotations Tab ───────────────────────────────────────────────────── */
        if (tab === "quotations") {
          if (showForm) return (
            <div className="bg-card rounded-[14px] border border-border p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-base font-bold">عرض سعر جديد</h2>
                <button onClick={() => setShowForm(false)} className="w-7 h-7 rounded-md border border-border flex items-center justify-center cursor-pointer"><X size={14} /></button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                <div><label className={labelStyle}>العميل *</label><input value={qClient} onChange={(e) => setQClient(e.target.value)} className={inputStyle} /></div>
                <div><label className={labelStyle}>التاريخ *</label><input value={qDate} onChange={(e) => setQDate(e.target.value)} className={inputStyle} type="date" /></div>
                <div><label className={labelStyle}>صالح حتى</label><input value={qValidUntil} onChange={(e) => setQValidUntil(e.target.value)} className={inputStyle} type="date" /></div>
              </div>
              {/* Line items */}
              <div className="mb-3"><label className={labelStyle}>بنود عرض السعر</label></div>
              {qLineItems.map((li, idx) => (
                <div key={idx} className="grid grid-cols-4 gap-2 mb-2 items-end">
                  <input value={li.description} onChange={(e) => setQLineItems(updateLineItem(qLineItems, idx, "description", e.target.value))} className={inputStyle} placeholder="الوصف" />
                  <input value={li.quantity} onChange={(e) => setQLineItems(updateLineItem(qLineItems, idx, "quantity", parseFloat(e.target.value) || 0))} className={inputStyle} type="number" placeholder="الكمية" />
                  <input value={li.unitPrice} onChange={(e) => setQLineItems(updateLineItem(qLineItems, idx, "unitPrice", parseFloat(e.target.value) || 0))} className={inputStyle} type="number" placeholder="سعر الوحدة" />
                  <div className="text-[13px] font-bold text-end py-2">{fmt(li.total)}</div>
                </div>
              ))}
              <button onClick={() => setQLineItems([...qLineItems, { description: "", quantity: 1, unitPrice: 0, total: 0 }])} className="text-[12px] text-primary font-bold cursor-pointer inline-flex items-center gap-1"><Plus size={12} /> بند جديد</button>
              <div className="flex gap-2 justify-end mt-5">
                <button onClick={() => setShowForm(false)} className="px-4 py-2 rounded-md border border-border bg-transparent text-foreground text-sm font-semibold cursor-pointer">إلغاء</button>
                <button onClick={handleCreateQuotation} className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-bold cursor-pointer"><FileText size={14} /> إنشاء</button>
              </div>
            </div>
          );
          if (quotations.length === 0) return <Empty label="عروض أسعار" />;
          return (
            <div className="bg-card rounded-[14px] border border-border overflow-hidden">
              <div className="overflow-x-auto garfix-scroll">
                <table className="w-full border-collapse">
                  <thead><tr className="border-b border-border bg-muted">
                    <th className={thStyle}>العميل</th><th className={thStyle}>التاريخ</th><th className={thStyle}>صالح حتى</th>
                    <th className={thStyle}>المبلغ</th><th className={thStyle}>البنود</th><th className={thStyle}>إجراء</th>
                  </tr></thead>
                  <tbody>
                    {quotations.map((q) => (
                      <tr key={q.id} className="border-b border-border">
                        <td className={cn(tdStyle, "font-bold")}>{q.clientName}</td>
                        <td className={tdStyle}>{q.date}</td><td className={tdStyle}>{q.validUntil}</td>
                        <td className={cn(tdStyle, "[direction:ltr] text-end font-bold")}>{fmt(q.totalAmount)}</td>
                        <td className={tdStyle}>{q.lineItems?.length || 0}</td>
                        <td className={tdStyle}>
                          <button onClick={() => handleConvertToInvoice(q.id)} title="تحويل إلى فاتورة" className="w-7 h-7 rounded-md border border-border flex items-center justify-center cursor-pointer hover:bg-emerald-500/10"><ArrowRight size={13} className="text-emerald-600" /></button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          );
        }

        /* ── Purchase Orders Tab ──────────────────────────────────────────────── */
        if (tab === "purchase-orders") {
          if (showForm) return (
            <div className="bg-card rounded-[14px] border border-border p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-base font-bold">أمر شراء جديد</h2>
                <button onClick={() => setShowForm(false)} className="w-7 h-7 rounded-md border border-border flex items-center justify-center cursor-pointer"><X size={14} /></button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                <div><label className={labelStyle}>المورد *</label><input value={poSupplier} onChange={(e) => setPoSupplier(e.target.value)} className={inputStyle} /></div>
                <div><label className={labelStyle}>التاريخ *</label><input value={poDate} onChange={(e) => setPoDate(e.target.value)} className={inputStyle} type="date" /></div>
                <div><label className={labelStyle}>التسليم المتوقع</label><input value={poDelivery} onChange={(e) => setPoDelivery(e.target.value)} className={inputStyle} type="date" /></div>
              </div>
              {poLineItems.map((li, idx) => (
                <div key={idx} className="grid grid-cols-4 gap-2 mb-2 items-end">
                  <input value={li.description} onChange={(e) => setPoLineItems(updateLineItem(poLineItems, idx, "description", e.target.value))} className={inputStyle} placeholder="الوصف" />
                  <input value={li.quantity} onChange={(e) => setPoLineItems(updateLineItem(poLineItems, idx, "quantity", parseFloat(e.target.value) || 0))} className={inputStyle} type="number" placeholder="الكمية" />
                  <input value={li.unitPrice} onChange={(e) => setPoLineItems(updateLineItem(poLineItems, idx, "unitPrice", parseFloat(e.target.value) || 0))} className={inputStyle} type="number" placeholder="سعر الوحدة" />
                  <div className="text-[13px] font-bold text-end py-2">{fmt(li.total)}</div>
                </div>
              ))}
              <button onClick={() => setPoLineItems([...poLineItems, { description: "", quantity: 1, unitPrice: 0, total: 0 }])} className="text-[12px] text-primary font-bold cursor-pointer inline-flex items-center gap-1"><Plus size={12} /> بند جديد</button>
              <div className="flex gap-2 justify-end mt-5">
                <button onClick={() => setShowForm(false)} className="px-4 py-2 rounded-md border border-border bg-transparent text-foreground text-sm font-semibold cursor-pointer">إلغاء</button>
                <button onClick={handleCreatePO} className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-bold cursor-pointer"><ShoppingCart size={14} /> إنشاء</button>
              </div>
            </div>
          );
          if (purchaseOrders.length === 0) return <Empty label="أوامر شراء" />;
          return (
            <div className="bg-card rounded-[14px] border border-border overflow-hidden">
              <div className="overflow-x-auto garfix-scroll">
                <table className="w-full border-collapse">
                  <thead><tr className="border-b border-border bg-muted">
                    <th className={thStyle}>المورد</th><th className={thStyle}>التاريخ</th><th className={thStyle}>التسليم</th>
                    <th className={thStyle}>المبلغ</th><th className={thStyle}>البنود</th>
                  </tr></thead>
                  <tbody>
                    {purchaseOrders.map((po) => (
                      <tr key={po.id} className="border-b border-border">
                        <td className={cn(tdStyle, "font-bold")}>{po.supplierName}</td>
                        <td className={tdStyle}>{po.date}</td><td className={tdStyle}>{po.expectedDelivery}</td>
                        <td className={cn(tdStyle, "[direction:ltr] text-end font-bold")}>{fmt(po.totalAmount)}</td>
                        <td className={tdStyle}>{po.lineItems?.length || 0}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          );
        }

        /* ── Opening Balances Tab ─────────────────────────────────────────────── */
        if (tab === "opening-balances") {
          if (showForm) return (
            <div className="bg-card rounded-[14px] border border-border p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-base font-bold">رصيد افتتاحي جديد</h2>
                <button onClick={() => setShowForm(false)} className="w-7 h-7 rounded-md border border-border flex items-center justify-center cursor-pointer"><X size={14} /></button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div><label className={labelStyle}>رقم الحساب *</label><input value={obAccountId} onChange={(e) => setObAccountId(e.target.value)} className={inputStyle} type="number" placeholder="1" /></div>
                <div><label className={labelStyle}>المبلغ *</label><input value={obAmount} onChange={(e) => setObAmount(e.target.value)} className={inputStyle} type="number" placeholder="0.000" /></div>
              </div>
              <div className="flex gap-2 justify-end mt-5">
                <button onClick={() => setShowForm(false)} className="px-4 py-2 rounded-md border border-border bg-transparent text-foreground text-sm font-semibold cursor-pointer">إلغاء</button>
                <button onClick={handleCreateOB} className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-bold cursor-pointer"><BookOpen size={14} /> إنشاء</button>
              </div>
            </div>
          );
          if (openingBalances.length === 0) return <Empty label="أرصدة افتتاحية" />;
          return (
            <div className="flex flex-col gap-3">
              <div className="flex justify-end">
                <button onClick={handlePostAllOB} className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-[13px] font-bold cursor-pointer inline-flex items-center gap-1.5"><CheckCircle2 size={14} /> ترحيل جميع الأرصدة</button>
              </div>
              <div className="bg-card rounded-[14px] border border-border overflow-hidden">
                <div className="overflow-x-auto garfix-scroll">
                  <table className="w-full border-collapse">
                    <thead><tr className="border-b border-border bg-muted">
                      <th className={thStyle}>كود الحساب</th><th className={thStyle}>اسم الحساب</th>
                      <th className={thStyle}>المبلغ</th><th className={thStyle}>الحالة</th>
                    </tr></thead>
                    <tbody>
                      {openingBalances.map((ob) => (
                        <tr key={ob.id} className="border-b border-border">
                          <td className={cn(tdStyle, "font-mono font-bold")}>{ob.accountCode}</td>
                          <td className={tdStyle}>{ob.accountNameAr}</td>
                          <td className={cn(tdStyle, "[direction:ltr] text-end font-bold")}>{fmt(ob.amount)}</td>
                          <td className={tdStyle}><span className="py-0.5 px-2.5 rounded-[12px] text-[11px] font-bold" style={{ background: ob.posted ? "rgba(16,185,129,0.15)" : "rgba(245,158,11,0.15)", color: ob.posted ? "#10b981" : "#f59e0b" }}>{ob.posted ? "مُرحّل" : "مسودة"}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          );
        }

        /* ── Commissions Tab ───────────────────────────────────────────────────── */
        if (tab === "commissions") {
          if (commissions.length === 0) return <Empty label="عمولات" />;
          return (
            <div className="bg-card rounded-[14px] border border-border overflow-hidden">
              <div className="overflow-x-auto garfix-scroll">
                <table className="w-full border-collapse">
                  <thead><tr className="border-b border-border bg-muted">
                    <th className={thStyle}>المندوب</th><th className={thStyle}>إجمالي المبيعات</th>
                    <th className={thStyle}>العمولة</th><th className={thStyle}>الحالة</th><th className={thStyle}>إجراء</th>
                  </tr></thead>
                  <tbody>
                    {commissions.map((c) => (
                      <tr key={c.id} className="border-b border-border">
                        <td className={cn(tdStyle, "font-bold")}>{c.salesperson}</td>
                        <td className={cn(tdStyle, "[direction:ltr] text-end font-bold")}>{fmt(c.totalSales)}</td>
                        <td className={cn(tdStyle, "[direction:ltr] text-end font-bold")} style={{ color: "#10b981" }}>{fmt(c.commissionAmount)}</td>
                        <td className={tdStyle}><span className="py-0.5 px-2.5 rounded-[12px] text-[11px] font-bold" style={{ background: c.posted ? "rgba(16,185,129,0.15)" : "rgba(245,158,11,0.15)", color: c.posted ? "#10b981" : "#f59e0b" }}>{c.posted ? "مُرحّل" : "مسودة"}</span></td>
                        <td className={tdStyle}>
                          {!c.posted && <button onClick={() => handlePostCommission(c.id)} title="ترحيل كقيد يومية" className="w-7 h-7 rounded-md border border-border flex items-center justify-center cursor-pointer hover:bg-emerald-500/10"><CheckCircle2 size={13} className="text-emerald-600" /></button>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          );
        }

        /* ── Profit Distribution Tab ──────────────────────────────────────────── */
        if (tab === "profit-distribution") {
          if (profitDistributions.length === 0) return <Empty label="توزيعات أرباح" />;
          return (
            <div className="bg-card rounded-[14px] border border-border overflow-hidden">
              <div className="overflow-x-auto garfix-scroll">
                <table className="w-full border-collapse">
                  <thead><tr className="border-b border-border bg-muted">
                    <th className={thStyle}>الشريك</th><th className={thStyle}>نسبة الملكية %</th>
                    <th className={thStyle}>حصة الأرباح</th><th className={thStyle}>الحالة</th><th className={thStyle}>إجراء</th>
                  </tr></thead>
                  <tbody>
                    {profitDistributions.map((pd) => (
                      <tr key={pd.id} className="border-b border-border">
                        <td className={cn(tdStyle, "font-bold")}>{pd.partnerName}</td>
                        <td className={cn(tdStyle, "[direction:ltr] text-end")}>{pd.ownershipPercent}%</td>
                        <td className={cn(tdStyle, "[direction:ltr] text-end font-bold")} style={{ color: "#10b981" }}>{fmt(pd.profitShare)}</td>
                        <td className={tdStyle}><span className="py-0.5 px-2.5 rounded-[12px] text-[11px] font-bold" style={{ background: pd.posted ? "rgba(16,185,129,0.15)" : "rgba(245,158,11,0.15)", color: pd.posted ? "#10b981" : "#f59e0b" }}>{pd.posted ? "مُرحّل" : "مسودة"}</span></td>
                        <td className={tdStyle}>
                          {!pd.posted && <button onClick={() => handlePostProfitDist(pd.id)} title="ترحيل كقيد يومية" className="w-7 h-7 rounded-md border border-border flex items-center justify-center cursor-pointer hover:bg-emerald-500/10"><CheckCircle2 size={13} className="text-emerald-600" /></button>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          );
        }
        return null;
      })()}
    </div>
  );
}

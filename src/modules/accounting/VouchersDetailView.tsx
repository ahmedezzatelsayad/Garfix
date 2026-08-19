"use client";

import { useState } from "react";
import { useBrand } from "@/context/BrandContext";
import { toast } from "sonner";
import {
  useVouchers, useCreateVoucher, useApproveVoucher, useCancelVoucher,
  useQuotations, useCreateQuotation, useConvertQuotationToInvoice,
  usePurchaseOrders, useCreatePurchaseOrder,
  useOpeningBalances, useCreateOpeningBalance, usePostOpeningBalances,
  useAccountingCommissions as useCommissions, usePostCommission,
  useProfitDistribution, usePostProfitDistribution,
} from "@/hooks/queries";
import {
  Plus, X, FileText, Receipt, ShoppingCart, DollarSign, CheckCircle2, XCircle,
  Printer, ArrowRight, CreditCard, BookOpen, Percent,
  HandCoins,
} from "lucide-react";
import { cn } from "@/lib/utils";

/* ─── Interfaces ──────────────────────────────────────────────────────────── */
interface _Voucher {
  id: number; voucherType: string; date: string; amount: number;
  currency: string; payee: string; payer: string; status: string;
  amountTextAr?: string;
}
interface _Quotation {
  id: number; clientName: string; date: string; validUntil: string;
  lineItems: LineItem[]; totalAmount: number; status: string;
}
interface _PurchaseOrder {
  id: number; supplierName: string; date: string; expectedDelivery: string;
  lineItems: LineItem[]; totalAmount: number; status: string;
}
interface LineItem { id?: number; localId?: string; description: string; quantity: number; unitPrice: number; total: number; }
interface _OpeningBalance { id: number; accountId: number; accountCode: string; accountNameAr: string; amount: number; posted: boolean; }
interface _Commission { id: number; salesperson: string; totalSales: number; commissionAmount: number; posted: boolean; }
interface _ProfitDistribution { id: number; partnerName: string; ownershipPercent: number; profitShare: number; posted: boolean; }

type Tab = "vouchers" | "quotations" | "purchase-orders" | "opening-balances" | "commissions" | "profit-distribution";

/* ─── Shared Styles (DS v4.0) ──────────────────────────────────────────────── */
const thStyle = "text-start py-2.5 px-3 text-[11px] text-muted-foreground font-bold";
const tdStyle = "py-2.5 px-3 text-[13px]";
// DS v4.0: Added focus-ring for form inputs
const inputStyle = "w-full py-2 px-3 rounded-sm bg-mutedackgroundackground border border-border text-foreground text-[13px] outline-none focus-ring";
const labelStyle = "block text-[11px] font-semibold text-muted-foreground mb-1";
// DS v4.0: Added focus-ring for selects
const selectStyle = "w-full py-2 px-3 rounded-sm bg-mutedackgroundackground border border-border text-foreground text-[13px] outline-none cursor-pointer focus-ring";

function Empty({ label }: { label: string }) {
  return <div className="p-12 text-center text-muted-foreground">لا توجد {label} بعد</div>;
}

/* ─── Main Component ────────────────────────────────────────────────────────── */

/** Generate a stable client-side id for editable line items (P2-B fix).
 *  Matches the pattern used in RecurringEntriesView and InvoicesView. */
function makeLineLocalId(): string {
  return `vli_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function VouchersDetailView() {
  const { activeCompany } = useBrand();
  const [tab, setTab] = useState<Tab>("vouchers");
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
  const [qLineItems, setQLineItems] = useState<LineItem[]>([{ description: "", quantity: 1, unitPrice: 0, total: 0, localId: makeLineLocalId() }]);

  /* PO form */
  const [poSupplier, setPoSupplier] = useState("");
  const [poDate, setPoDate] = useState("");
  const [poDelivery, setPoDelivery] = useState("");
  const [poLineItems, setPoLineItems] = useState<LineItem[]>([{ description: "", quantity: 1, unitPrice: 0, total: 0, localId: makeLineLocalId() }]);

  /* Opening Balance form */
  const [obAccountId, setObAccountId] = useState("");
  const [obAmount, setObAmount] = useState("");

  /* Commission dates */
  const [commFrom, setCommFrom] = useState("");
  const [commTo, setCommTo] = useState("");

  const slug = activeCompany ? encodeURIComponent(activeCompany.slug) : "";

  // TanStack Query hooks
  const vouchersQuery = useVouchers(slug);
  const quotationsQuery = useQuotations(slug);
  const purchaseOrdersQuery = usePurchaseOrders(slug);
  const openingBalancesQuery = useOpeningBalances(slug);
  const commissionsQuery = useCommissions(slug, commFrom, commTo);
  const profitDistributionQuery = useProfitDistribution(slug);

  const vouchers = vouchersQuery.data?.vouchers ?? [];
  const quotations = quotationsQuery.data?.quotations ?? [];
  const purchaseOrders = purchaseOrdersQuery.data?.purchaseOrders ?? [];
  const openingBalances = openingBalancesQuery.data?.openingBalances ?? [];
  const commissions = commissionsQuery.data?.commissions ?? [];
  const profitDistributions = profitDistributionQuery.data?.distributions ?? [];

  const loading = (tab === "vouchers" && vouchersQuery.isLoading) || (tab === "quotations" && quotationsQuery.isLoading) || (tab === "purchase-orders" && purchaseOrdersQuery.isLoading) || (tab === "opening-balances" && openingBalancesQuery.isLoading) || (tab === "commissions" && commissionsQuery.isLoading) || (tab === "profit-distribution" && profitDistributionQuery.isLoading);

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

  /* ── Mutation hooks ──────────────────────────────────────────────────────── */
  const createVoucherMutation = useCreateVoucher();
  const approveVoucherMutation = useApproveVoucher();
  const cancelVoucherMutation = useCancelVoucher();
  const createQuotationMutation = useCreateQuotation();
  const convertQuotationMutation = useConvertQuotationToInvoice();
  const createPurchaseOrderMutation = useCreatePurchaseOrder();
  const createOpeningBalanceMutation = useCreateOpeningBalance();
  const postOpeningBalancesMutation = usePostOpeningBalances();
  const postCommissionMutation = usePostCommission();
  const postProfitDistributionMutation = usePostProfitDistribution();

  /* ── Create Voucher ─────────────────────────────────────────────────────── */
  const handleCreateVoucher = () => {
    if (!activeCompany || !vAmount || !vDate) { toast.error("يرجى ملء جميع الحقول المطلوبة"); return; }
    createVoucherMutation.mutate(
      { companySlug: activeCompany.slug, voucherType: vType, date: vDate, amount: parseFloat(vAmount), currency: vCurrency, payee: vPayee, payer: vPayer },
      {
        onSuccess: () => { toast.success("تم إنشاء السند"); setShowForm(false); resetVoucherForm(); vouchersQuery.refetch(); },
        onError: (err) => { toast.error(err.message || "تعذّر إنشاء السند"); },
      },
    );
  };
  const resetVoucherForm = () => { setVType("receipt"); setVDate(""); setVAmount(""); setVCurrency("KWD"); setVPayee(""); setVPayer(""); };

  /* ── Approve / Cancel Voucher ────────────────────────────────────────────── */
  const handleApproveVoucher = (id: number) => {
    if (!activeCompany) return;
    approveVoucherMutation.mutate(
      { id, companySlug: activeCompany.slug },
      {
        onSuccess: () => { toast.success("تم اعتماد السند"); vouchersQuery.refetch(); },
        onError: (err) => { toast.error(err.message || "تعذّر اعتماد السند"); },
      },
    );
  };
  const handleCancelVoucher = (id: number) => {
    if (!activeCompany) return;
    cancelVoucherMutation.mutate(
      { id, companySlug: activeCompany.slug },
      {
        onSuccess: () => { toast.success("تم إلغاء السند"); vouchersQuery.refetch(); },
        onError: (err) => { toast.error(err.message || "تعذّر إلغاء السند"); },
      },
    );
  };

  /* ── Create Quotation ────────────────────────────────────────────────────── */
  const handleCreateQuotation = () => {
    if (!activeCompany || !qClient || !qDate) { toast.error("يرجى ملء جميع الحقول المطلوبة"); return; }
    // P2-B: strip localId before sending — it's a client-only UI key.
    const payloadItems = qLineItems.map(({ localId: _localId, ...rest }) => rest);
    createQuotationMutation.mutate(
      { companySlug: activeCompany.slug, clientName: qClient, date: qDate, validUntil: qValidUntil, lineItems: payloadItems, totalAmount: qLineItems.reduce((s, li) => s + li.total, 0) },
      {
        onSuccess: () => { toast.success("تم إنشاء عرض السعر"); setShowForm(false); quotationsQuery.refetch(); },
        onError: (err) => { toast.error(err.message || "تعذّر إنشاء عرض السعر"); },
      },
    );
  };

  /* ── Convert Quotation to Invoice ─────────────────────────────────────────── */
  const handleConvertToInvoice = (id: number) => {
    if (!activeCompany) return;
    convertQuotationMutation.mutate(
      { id, companySlug: activeCompany.slug },
      {
        onSuccess: () => { toast.success("تم التحويل إلى فاتورة"); quotationsQuery.refetch(); },
        onError: (err) => { toast.error(err.message || "تعذّر التحويل إلى فاتورة"); },
      },
    );
  };

  /* ── Create PO ────────────────────────────────────────────────────────────── */
  const handleCreatePO = () => {
    if (!activeCompany || !poSupplier || !poDate) { toast.error("يرجى ملء جميع الحقول المطلوبة"); return; }
    // P2-B: strip localId before sending — it's a client-only UI key.
    const payloadItems = poLineItems.map(({ localId: _localId, ...rest }) => rest);
    createPurchaseOrderMutation.mutate(
      { companySlug: activeCompany.slug, supplierName: poSupplier, date: poDate, expectedDelivery: poDelivery, lineItems: payloadItems, totalAmount: poLineItems.reduce((s, li) => s + li.total, 0) },
      {
        onSuccess: () => { toast.success("تم إنشاء أمر الشراء"); setShowForm(false); purchaseOrdersQuery.refetch(); },
        onError: (err) => { toast.error(err.message || "تعذّر إنشاء أمر الشراء"); },
      },
    );
  };

  /* ── Create Opening Balance ──────────────────────────────────────────────── */
  const handleCreateOB = () => {
    if (!activeCompany || !obAccountId || !obAmount) { toast.error("يرجى ملء جميع الحقول المطلوبة"); return; }
    createOpeningBalanceMutation.mutate(
      { companySlug: activeCompany.slug, accountId: parseInt(obAccountId), amount: parseFloat(obAmount) },
      {
        onSuccess: () => { toast.success("تم إنشاء الرصيد الافتتاحي"); setShowForm(false); setObAccountId(""); setObAmount(""); openingBalancesQuery.refetch(); },
        onError: (err) => { toast.error(err.message || "تعذّر إنشاء الرصيد الافتتاحي"); },
      },
    );
  };

  /* ── Post all opening balances ────────────────────────────────────────────── */
  const handlePostAllOB = () => {
    if (!activeCompany) return;
    if (!confirm("ترحيل جميع الأرصدة الافتتاحية؟ لا يمكن التراجع عن هذا الإجراء.")) return;
    postOpeningBalancesMutation.mutate(
      { companySlug: activeCompany.slug },
      {
        onSuccess: () => { toast.success("تم ترحيل جميع الأرصدة الافتتاحية"); openingBalancesQuery.refetch(); },
        onError: (err) => { toast.error(err.message || "تعذّر ترحيل الأرصدة الافتتاحية"); },
      },
    );
  };

  /* ── Post Commission as JE ────────────────────────────────────────────────── */
  const handlePostCommission = (id: number) => {
    if (!activeCompany) return;
    postCommissionMutation.mutate(
      { id, companySlug: activeCompany.slug },
      {
        onSuccess: () => { toast.success("تم ترحيل العمولة كقيد يومية"); commissionsQuery.refetch(); },
        onError: (err) => { toast.error(err.message || "تعذّر ترحيل العمولة"); },
      },
    );
  };

  /* ── Post Profit Distribution as JE ───────────────────────────────────────── */
  const handlePostProfitDist = (id: number) => {
    if (!activeCompany) return;
    postProfitDistributionMutation.mutate(
      { id, companySlug: activeCompany.slug },
      {
        onSuccess: () => { toast.success("تم ترحيل التوزيع كقيد يومية"); profitDistributionQuery.refetch(); },
        onError: (err) => { toast.error(err.message || "تعذّر ترحيل توزيع الأرباح"); },
      },
    );
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
      {/* Header - DS v4.0: Emerald accent color */}
      <div className="flex flex-wrap justify-between items-center gap-3">
        <div>
          <h1 className="text-2xl font-extrabold flex items-center gap-2 text-[#047857]"><Receipt size={20} /> السندات والتفاصيل</h1>
          <p className="text-[13px] text-muted-foreground">{activeCompany.nameAr || activeCompany.name}</p>
        </div>
        {!showForm && (
          // DS v4.0: Action button with active-press
          <button onClick={() => setShowForm(true)} className="inline-flex items-center gap-1.5 py-2.5 px-[18px] rounded-[10px] bg-primary text-primary-foreground border-none text-[13px] font-bold cursor-pointer active-press duration-150"><Plus size={16} /> إضافة</button>
        )}
      </div>

      {/* Tabs - DS v4.0: Filter buttons with active-press */}
      <div className="flex gap-1.5 flex-wrap">
        {tabs.map((t) => { const Icon = t.icon; return (
          <button key={t.key} onClick={() => switchTab(t.key)} className={cn(
            "py-2 px-4 rounded-[10px] border border-border text-[12px] font-bold cursor-pointer inline-flex items-center gap-1.5 active-press duration-150",
            tab === t.key ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground",
          )}>{Icon && <Icon size={14} />} {t.label}</button>
        ); })}
      </div>

      {/* Commissions date filter - DS v4.0: Panel with hover-lift */}
      {tab === "commissions" && !showForm && (
        <div className="flex gap-3 items-end bg-card rounded-[10px] border border-border p-3 hover-lift duration-120">
          <div><label className={labelStyle}>من</label><input value={commFrom} onChange={(e) => setCommFrom(e.target.value)} className={cn(inputStyle, "w-36")} type="date" /></div>
          <div><label className={labelStyle}>إلى</label><input value={commTo} onChange={(e) => setCommTo(e.target.value)} className={cn(inputStyle, "w-36")} type="date" /></div>
        </div>
      )}

      {loading ? <div className="p-12 text-center text-muted-foreground">جارٍ التحميل…</div> : (() => {
        /* ── Vouchers Tab ─────────────────────────────────────────────────────── */
        if (tab === "vouchers") {
          if (showForm) return (
            // DS v4.0: Form card with hover-lift
            <div className="bg-card rounded-[14px] border border-border p-5 hover-lift duration-120">
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
              {/* DS v4.0: Action buttons with active-press */}
              <div className="flex gap-2 justify-end mt-5">
                <button onClick={() => { setShowForm(false); resetVoucherForm(); }} className="px-4 py-2 rounded-md border border-border bg-transparent text-foreground text-sm font-semibold cursor-pointer active-press duration-150">إلغاء</button>
                <button onClick={handleCreateVoucher} className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-bold cursor-pointer inline-flex items-center gap-1.5 active-press duration-150"><Receipt size={14} /> إنشاء</button>
              </div>
            </div>
          );
          if (vouchers.length === 0) return <Empty label="سندات" />;
          // DS v4.0: Vouchers table with enterprise styling and kpi-card-gold totals
          return (
            <div className="bg-card rounded-[14px] border border-border overflow-hidden hover-lift duration-120">
              {/* DS v4.0: KPI Summary Cards for Vouchers */}
              {vouchers.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3 p-4 border-b border-border">
                  {/* Total Vouchers - kpi-card */}
                  <div className="kpi-card">
                    <div className="flex items-center gap-2">
                      <FileText size={16} className="text-[#047857]" />
                      <div>
                        <p className="text-[10px] text-muted-foreground">إجمالي السندات</p>
                        <p className="text-sm font-bold text-[#047857]">{vouchers.length}</p>
                      </div>
                    </div>
                  </div>
                  {/* Total Debit (Receipts) - kpi-card-gold (Premium financial data!) */}
                  <div className="kpi-card-gold">
                    <div className="flex items-center gap-2">
                      <ArrowRight size={16} className="text-[#d4a574]" />
                      <div>
                        <p className="text-[10px] opacity-80">إجمالي القبض</p>
                        <p className="text-sm font-bold">{fmt(vouchers.filter(v => v.voucherType === 'receipt').reduce((sum, v) => sum + v.amount, 0))}</p>
                      </div>
                    </div>
                  </div>
                  {/* Total Credit (Payments) - kpi-card */}
                  <div className="kpi-card">
                    <div className="flex items-center gap-2">
                      <CreditCard size={16} className="text-red-500" />
                      <div>
                        <p className="text-[10px] text-muted-foreground">إجمالي الدفع</p>
                        <p className="text-sm font-bold text-red-500">{fmt(vouchers.filter(v => v.voucherType === 'payment').reduce((sum, v) => sum + v.amount, 0))}</p>
                      </div>
                    </div>
                  </div>
                  {/* Net Balance - kpi-card-gold */}
                  <div className="kpi-card-gold">
                    <div className="flex items-center gap-2">
                      <DollarSign size={16} className={vouchers.filter(v => v.voucherType === 'receipt').reduce((s, v) => s + v.amount, 0) - vouchers.filter(v => v.voucherType === 'payment').reduce((s, v) => s + v.amount, 0) >= 0 ? "text-[#d4a574]" : "text-red-500"} />
                      <div>
                        <p className="text-[10px] opacity-80">الرصيد الصافي</p>
                        <p className={cn("text-sm font-bold", vouchers.filter(v => v.voucherType === 'receipt').reduce((s, v) => s + v.amount, 0) - vouchers.filter(v => v.voucherType === 'payment').reduce((s, v) => s + v.amount, 0) >= 0 ? "" : "text-red-500")}>{fmt(vouchers.filter(v => v.voucherType === 'receipt').reduce((s, v) => s + v.amount, 0) - vouchers.filter(v => v.voucherType === 'payment').reduce((s, v) => s + v.amount, 0))}</p>
                      </div>
                    </div>
                  </div>
                </div>
              )}
              <div className="overflow-x-auto garfix-scroll">
                {/* DS v4.0: Enterprise table */}
                <table className="w-full border-collapse table-enterprise">
                  <thead><tr className="border-b border-border bg-muted">
                    <th className={thStyle}>النوع</th><th className={thStyle}>التاريخ</th>
                    <th className={thStyle}>المبلغ</th><th className={thStyle}>العملة</th>
                    <th className={thStyle}>المستفيد</th><th className={thStyle}>الدافع</th>
                    <th className={thStyle}>الحالة</th><th className={thStyle}>إجراء</th>
                  </tr></thead>
                  <tbody>
                    {vouchers.map((v) => {
                      const statusMap: Record<string, { label: string; color: string; badge: string }> = {
                        draft: { label: "مسودة", color: "#f59e0b", badge: "bg-cardmber-500/15 text-amber-500" }, approved: { label: "معتمد", color: "#10b981", badge: "bg-mutedmerald-500/15 text-emerald-500" }, cancelled: { label: "ملغى", color: "#ef4444", badge: "bg-red-500/15 text-red-500" },
                      };
                      const st = statusMap[v.status] || { label: v.status, color: "#999", badge: "bg-muted text-muted-foreground" };
                      return (
                        <tr key={v.id} className="border-b border-border">
                          {/* DS v4.0: Emerald for debit (receipt), muted for credit (payment) */}
                          <td className={tdStyle}><span className={cn("py-0.5 px-2.5 rounded-[12px] text-[11px] font-bold", v.voucherType === "receipt" ? "bg-[#047857]/15 text-[#047857]" : "bg-red-500/15 text-red-500")}>{v.voucherType === "receipt" ? "قبض" : "دفع"}</span></td>
                          <td className={tdStyle}>{v.date}</td>
                          <td className={cn(tdStyle, "[direction:ltr] text-end font-bold")}>{fmt(v.amount)}</td>
                          <td className={tdStyle}>{v.currency}</td>
                          <td className={tdStyle}>{v.payee || "—"}</td>
                          <td className={tdStyle}>{v.payer || "—"}</td>
                          <td className={tdStyle}><span className={cn("py-0.5 px-2.5 rounded-[12px] text-[11px] font-bold", st.badge)}>{st.label}</span></td>
                          <td className={tdStyle}>
                            {/* DS v4.0: Action buttons with active-press */}
                            <div className="flex items-center gap-1">
                              {v.status === "draft" && (<>
                                <button onClick={() => handleApproveVoucher(v.id)} title="اعتماد" className="w-7 h-7 rounded-md border border-border flex items-center justify-center cursor-pointer hover:bg-mutedmerald-500/10 active-press duration-150"><CheckCircle2 size={13} className="text-emerald-600" /></button>
                                <button onClick={() => handleCancelVoucher(v.id)} title="إلغاء" className="w-7 h-7 rounded-md border border-border flex items-center justify-center cursor-pointer hover:bg-red-500/10 active-press duration-150"><XCircle size={13} className="text-red-500" /></button>
                              </>)}
                              <button title="طباعة" className="w-7 h-7 rounded-md border border-border flex items-center justify-center cursor-pointer hover:bg-muted active-press duration-150"><Printer size={13} /></button>
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
                // P2-B FIX: use localId as key so React doesn't swap input
                // bindings when items are edited/reordered/duplicated.
                <div key={li.localId} className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-2 items-end">
                  <input value={li.description} onChange={(e) => setQLineItems(updateLineItem(qLineItems, idx, "description", e.target.value))} className={inputStyle} placeholder="الوصف" />
                  <input value={li.quantity} onChange={(e) => setQLineItems(updateLineItem(qLineItems, idx, "quantity", parseFloat(e.target.value) || 0))} className={inputStyle} type="number" placeholder="الكمية" />
                  <input value={li.unitPrice} onChange={(e) => setQLineItems(updateLineItem(qLineItems, idx, "unitPrice", parseFloat(e.target.value) || 0))} className={inputStyle} type="number" placeholder="سعر الوحدة" />
                  <div className="text-[13px] font-bold text-end py-2">{fmt(li.total)}</div>
                </div>
              ))}
              <button onClick={() => setQLineItems([...qLineItems, { description: "", quantity: 1, unitPrice: 0, total: 0, localId: makeLineLocalId() }])} className="text-[12px] text-primary font-bold cursor-pointer inline-flex items-center gap-1"><Plus size={12} /> بند جديد</button>
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
                          <button onClick={() => handleConvertToInvoice(q.id)} title="تحويل إلى فاتورة" className="w-7 h-7 rounded-md border border-border flex items-center justify-center cursor-pointer hover:bg-mutedmerald-500/10"><ArrowRight size={13} className="text-emerald-600" /></button>
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
                // P2-B FIX: use localId as key so React doesn't swap input
                // bindings when items are edited/reordered/duplicated.
                <div key={li.localId} className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-2 items-end">
                  <input value={li.description} onChange={(e) => setPoLineItems(updateLineItem(poLineItems, idx, "description", e.target.value))} className={inputStyle} placeholder="الوصف" />
                  <input value={li.quantity} onChange={(e) => setPoLineItems(updateLineItem(poLineItems, idx, "quantity", parseFloat(e.target.value) || 0))} className={inputStyle} type="number" placeholder="الكمية" />
                  <input value={li.unitPrice} onChange={(e) => setPoLineItems(updateLineItem(poLineItems, idx, "unitPrice", parseFloat(e.target.value) || 0))} className={inputStyle} type="number" placeholder="سعر الوحدة" />
                  <div className="text-[13px] font-bold text-end py-2">{fmt(li.total)}</div>
                </div>
              ))}
              <button onClick={() => setPoLineItems([...poLineItems, { description: "", quantity: 1, unitPrice: 0, total: 0, localId: makeLineLocalId() }])} className="text-[12px] text-primary font-bold cursor-pointer inline-flex items-center gap-1"><Plus size={12} /> بند جديد</button>
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
                          <td className={tdStyle}><span className={cn("py-0.5 px-2.5 rounded-[12px] text-[11px] font-bold", ob.posted ? "bg-mutedmerald-500/15 text-emerald-500" : "bg-cardmber-500/15 text-amber-500")}>{ob.posted ? "مُرحّل" : "مسودة"}</span></td>
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
                        <td className={cn(cn(tdStyle, "[direction:ltr] text-end font-bold"), "text-emerald-500")}>{fmt(c.commissionAmount)}</td>
                        <td className={tdStyle}><span className={cn("py-0.5 px-2.5 rounded-[12px] text-[11px] font-bold", c.posted ? "bg-mutedmerald-500/15 text-emerald-500" : "bg-cardmber-500/15 text-amber-500")}>{c.posted ? "مُرحّل" : "مسودة"}</span></td>
                        <td className={tdStyle}>
                          {!c.posted && <button onClick={() => handlePostCommission(c.id)} title="ترحيل كقيد يومية" className="w-7 h-7 rounded-md border border-border flex items-center justify-center cursor-pointer hover:bg-mutedmerald-500/10"><CheckCircle2 size={13} className="text-emerald-600" /></button>}
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
                        <td className={cn(cn(tdStyle, "[direction:ltr] text-end font-bold"), "text-emerald-500")}>{fmt(pd.profitShare)}</td>
                        <td className={tdStyle}><span className={cn("py-0.5 px-2.5 rounded-[12px] text-[11px] font-bold", pd.posted ? "bg-mutedmerald-500/15 text-emerald-500" : "bg-cardmber-500/15 text-amber-500")}>{pd.posted ? "مُرحّل" : "مسودة"}</span></td>
                        <td className={tdStyle}>
                          {!pd.posted && <button onClick={() => handlePostProfitDist(pd.id)} title="ترحيل كقيد يومية" className="w-7 h-7 rounded-md border border-border flex items-center justify-center cursor-pointer hover:bg-mutedmerald-500/10"><CheckCircle2 size={13} className="text-emerald-600" /></button>}
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

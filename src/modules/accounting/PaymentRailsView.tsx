"use client";

import { useEffect, useState, useCallback } from "react";
import { useBrand } from "@/context/BrandContext";
import { authedFetch } from "@/context/AuthContext";
import { toast } from "sonner";
import {
  Plus, X, CreditCard, Send, ShieldCheck, Search,
  Globe, DollarSign, CheckCircle2, XCircle, Clock,
  ArrowRight, ExternalLink, Wallet, Landmark,
} from "lucide-react";
import { cn } from "@/lib/utils";

/* ─── Interfaces ──────────────────────────────────────────────────────────── */
interface PaymentMethod {
  id: number; name: string; nameAr: string; type: string;
  fees: number; currency: string; country: string; available: boolean;
}
interface PaymentResult {
  transactionId: string; checkoutUrl?: string; status: string;
}

type Tab = "methods" | "initiate" | "verify";

/* ─── Shared Styles ─────────────────────────────────────────────────────────── */
const thStyle = "text-start py-2.5 px-3 text-[11px] text-muted-foreground font-bold";
const tdStyle = "py-2.5 px-3 text-[13px]";
const inputStyle = "w-full py-2 px-3 rounded-sm bg-background border border-border text-foreground text-[13px] outline-none";
const labelStyle = "block text-[11px] font-semibold text-muted-foreground mb-1";
const selectStyle = "w-full py-2 px-3 rounded-sm bg-background border border-border text-foreground text-[13px] outline-none cursor-pointer";

function Empty({ label }: { label: string }) {
  return <div className="p-12 text-center text-muted-foreground">لا توجد {label} بعد</div>;
}

const METHOD_TYPE_MAP: Record<string, { label: string; color: string }> = {
  bank_transfer:  { label: "تحويل بنكي",  color: "#3b82f6" },
  card:           { label: "بطاقة",        color: "#10b981" },
  digital_wallet: { label: "محفظة رقمية", color: "#7c3aed" },
  cheque:         { label: "شيك",          color: "#f59e0b" },
  knet:           { label: "K-NET",        color: "#ef4444" },
};

/* ─── Main Component ────────────────────────────────────────────────────────── */
export function PaymentRailsView() {
  const { activeCompany } = useBrand();
  const [tab, setTab] = useState<Tab>("methods");
  const [methods, setMethods] = useState<PaymentMethod[]>([]);
  const [loading, setLoading] = useState(true);

  /* Methods filter */
  const [countryFilter, setCountryFilter] = useState("KW");
  const [amountFilter, setAmountFilter] = useState("100");

  /* Initiate form */
  const [initMethod, setInitMethod] = useState("");
  const [initAmount, setInitAmount] = useState("");
  const [initCurrency, setInitCurrency] = useState("KWD");
  const [initInvoiceId, setInitInvoiceId] = useState("");
  const [initResult, setInitResult] = useState<PaymentResult | null>(null);
  const [initiating, setInitiating] = useState(false);

  /* Verify form */
  const [verifyTxId, setVerifyTxId] = useState("");
  const [verifyResult, setVerifyResult] = useState<PaymentResult | null>(null);
  const [verifying, setVerifying] = useState(false);

  const slug = activeCompany ? `companySlug=${encodeURIComponent(activeCompany.slug)}` : "";

  /* ── Loaders ──────────────────────────────────────────────────────────────── */
  const loadMethods = useCallback(async () => {
    if (!activeCompany) { setLoading(false); return; }
    setLoading(true);
    try {
      const res = await authedFetch(`/api/accounting/payment-methods?${slug}&country=${countryFilter}&amount=${amountFilter}`);
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || "فشل تحميل طرق الدفع"); }
      const d = await res.json(); setMethods(d.methods || []);
    } catch (err) { toast.error(err instanceof Error ? err.message : "تعذّر تحميل طرق الدفع"); setMethods([]); }
    finally { setLoading(false); }
  }, [activeCompany, slug, countryFilter, amountFilter]);

  useEffect(() => {
    if (tab === "methods" && activeCompany) loadMethods();
  }, [tab, activeCompany, loadMethods]);

  const switchTab = (t: Tab) => {
    setTab(t);
    setInitResult(null);
    setVerifyResult(null);
  };

  /* ── Initiate Payment ────────────────────────────────────────────────────── */
  const handleInitiate = async () => {
    if (!activeCompany) return;
    if (!initMethod || !initAmount) { toast.error("يرجى اختيار طريقة الدفع وإدخال المبلغ"); return; }
    setInitiating(true); setInitResult(null);
    try {
      const res = await authedFetch("/api/accounting/initiate-payment", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companySlug: activeCompany.slug,
          methodId: parseInt(initMethod),
          amount: parseFloat(initAmount),
          currency: initCurrency,
          invoiceId: initInvoiceId ? parseInt(initInvoiceId) : undefined,
        }),
      });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || "فشل بدء الدفع"); }
      const d = await res.json();
      setInitResult(d.payment || d);
      toast.success("تم بدء عملية الدفع");
    } catch (err) { toast.error(err instanceof Error ? err.message : "تعذّر بدء عملية الدفع"); }
    finally { setInitiating(false); }
  };

  /* ── Verify Payment ──────────────────────────────────────────────────────── */
  const handleVerify = async () => {
    if (!activeCompany) return;
    if (!verifyTxId) { toast.error("يرجى إدخال رقم المعاملة"); return; }
    setVerifying(true); setVerifyResult(null);
    try {
      const res = await authedFetch("/api/accounting/verify-payment", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companySlug: activeCompany.slug, transactionId: verifyTxId }),
      });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || "فشل التحقق من الدفع"); }
      const d = await res.json();
      setVerifyResult(d.payment || d);
      toast.success("تم التحقق من حالة الدفع");
    } catch (err) { toast.error(err instanceof Error ? err.message : "تعذّر التحقق من الدفع"); }
    finally { setVerifying(false); }
  };

  if (!activeCompany) return <div className="p-12 text-center text-muted-foreground">اختر شركة</div>;

  const tabs: Array<{ key: Tab; label: string; icon: React.ComponentType<{ size?: number }> }> = [
    { key: "methods", label: "طرق الدفع", icon: CreditCard },
    { key: "initiate", label: "بدء دفع", icon: Send },
    { key: "verify", label: "تحقق من دفع", icon: ShieldCheck },
  ];

  const fmt = (n: number) => n.toLocaleString("ar-EG", { maximumFractionDigits: 3 });

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex flex-wrap justify-between items-center gap-3">
        <div>
          <h1 className="text-2xl font-extrabold flex items-center gap-2"><CreditCard size={20} /> مسارات الدفع</h1>
          <p className="text-[13px] text-muted-foreground">{activeCompany.nameAr || activeCompany.name}</p>
        </div>
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

      {loading && tab === "methods" ? <div className="p-12 text-center text-muted-foreground">جارٍ التحميل…</div> : tab === "methods" ? (
        /* ── Methods Tab ──────────────────────────────────────────────────────── */
        <>
          {/* Country & amount filter */}
          <div className="flex gap-3 items-end bg-card rounded-[10px] border border-border p-3">
            <div><label className={labelStyle}>الدولة</label>
              <select value={countryFilter} onChange={(e) => setCountryFilter(e.target.value)} className={cn(selectStyle, "w-36")}>
                <option value="KW">KW — الكويت</option>
                <option value="SA">SA — السعودية</option>
                <option value="AE">AE — الإمارات</option>
                <option value="BH">BH — البحرين</option>
                <option value="QA">QA — قطر</option>
                <option value="OM">OM — عمان</option>
              </select>
            </div>
            <div><label className={labelStyle}>المبلغ</label><input value={amountFilter} onChange={(e) => setAmountFilter(e.target.value)} className={cn(inputStyle, "w-24")} type="number" placeholder="100" /></div>
          </div>

          {methods.length === 0 ? <Empty label="طرق دفع" /> : (
            <div className="bg-card rounded-[14px] border border-border overflow-hidden">
              <div className="overflow-x-auto garfix-scroll">
                <table className="w-full border-collapse">
                  <thead><tr className="border-b border-border bg-muted">
                    <th className={thStyle}>الاسم</th><th className={thStyle}>الاسم بالعربي</th>
                    <th className={thStyle}>النوع</th><th className={thStyle}>الرسوم</th>
                    <th className={thStyle}>العملة</th><th className={thStyle}>الدولة</th>
                    <th className={thStyle}>متاح</th>
                  </tr></thead>
                  <tbody>
                    {methods.map((m) => {
                      const tp = METHOD_TYPE_MAP[m.type] || { label: m.type, color: "#999" };
                      return (
                        <tr key={m.id} className="border-b border-border">
                          <td className={cn(tdStyle, "font-bold")}>{m.name}</td>
                          <td className={tdStyle}>{m.nameAr}</td>
                          <td className={tdStyle}>
                            <span className="py-0.5 px-2.5 rounded-[12px] text-[11px] font-bold" style={{ background: `${tp.color}20`, color: tp.color }}>{tp.label}</span>
                          </td>
                          <td className={cn(tdStyle, "[direction:ltr] text-end")}>{fmt(m.fees)}</td>
                          <td className={tdStyle}>{m.currency}</td>
                          <td className={tdStyle}>{m.country}</td>
                          <td className={tdStyle}>
                            <span className="py-0.5 px-2.5 rounded-[12px] text-[11px] font-bold" style={{ background: m.available ? "rgba(16,185,129,0.15)" : "rgba(239,68,68,0.15)", color: m.available ? "#10b981" : "#ef4444" }}>
                              {m.available ? "متاح" : "غير متاح"}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="py-3 px-4 border-t border-border text-[12px] text-muted-foreground">{methods.length} طريقة دفع</div>
            </div>
          )}
        </>
      ) : tab === "initiate" ? (
        /* ── Initiate Tab ─────────────────────────────────────────────────────── */
        <div className="bg-card rounded-[14px] border border-border p-5">
          <h2 className="text-base font-bold mb-4">بدء عملية دفع</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div><label className={labelStyle}>طريقة الدفع *</label>
              <select value={initMethod} onChange={(e) => setInitMethod(e.target.value)} className={selectStyle}>
                <option value="">— اختر طريقة الدفع —</option>
                {methods.filter((m) => m.available).map((m) => (
                  <option key={m.id} value={String(m.id)}>{m.nameAr} ({m.name})</option>
                ))}
              </select>
            </div>
            <div><label className={labelStyle}>المبلغ *</label><input value={initAmount} onChange={(e) => setInitAmount(e.target.value)} className={inputStyle} type="number" placeholder="0.000" /></div>
            <div><label className={labelStyle}>العملة</label>
              <select value={initCurrency} onChange={(e) => setInitCurrency(e.target.value)} className={selectStyle}>
                <option value="KWD">KWD — دينار كويتي</option>
                <option value="USD">USD — دولار أمريكي</option>
                <option value="EUR">EUR — يورو</option>
                <option value="SAR">SAR — ريال سعودي</option>
              </select>
            </div>
            <div><label className={labelStyle}>رقم الفاتورة</label><input value={initInvoiceId} onChange={(e) => setInitInvoiceId(e.target.value)} className={inputStyle} type="number" placeholder="فاتورة #" /></div>
          </div>
          <div className="flex justify-end mt-5">
            <button onClick={handleInitiate} disabled={initiating} className="px-5 py-2.5 rounded-md bg-primary text-primary-foreground text-sm font-bold cursor-pointer disabled:opacity-50 inline-flex items-center gap-1.5">
              <Send size={14} /> {initiating ? "جارٍ البدء…" : "بدء الدفع"}
            </button>
          </div>

          {/* Result */}
          {initResult && (
            <div className="mt-5 bg-muted rounded-[10px] border border-border p-4">
              <h3 className="text-[14px] font-bold mb-3">نتيجة بدء الدفع</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <p className="text-[11px] text-muted-foreground">رقم المعاملة</p>
                  <p className="text-[14px] font-bold font-mono">{initResult.transactionId}</p>
                </div>
                <div>
                  <p className="text-[11px] text-muted-foreground">الحالة</p>
                  <p className="text-[14px] font-bold" style={{ color: initResult.status === "pending" ? "#f59e0b" : initResult.status === "completed" ? "#10b981" : "#ef4444" }}>
                    {initResult.status === "pending" ? "قيد الانتظار" : initResult.status === "completed" ? "مكتمل" : initResult.status === "failed" ? "فشل" : initResult.status}
                  </p>
                </div>
                {initResult.checkoutUrl && (
                  <div>
                    <p className="text-[11px] text-muted-foreground">رابط الدفع</p>
                    <a href={initResult.checkoutUrl} target="_blank" rel="noopener noreferrer" className="text-[14px] font-bold text-primary inline-flex items-center gap-1 hover:underline">
                      <ExternalLink size={14} /> فتح صفحة الدفع
                    </a>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      ) : (
        /* ── Verify Tab ────────────────────────────────────────────────────────── */
        <div className="bg-card rounded-[14px] border border-border p-5">
          <h2 className="text-base font-bold mb-4">تحقق من حالة الدفع</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div><label className={labelStyle}>رقم المعاملة *</label>
              <div className="flex items-center gap-2">
                <Search size={16} className="text-muted-foreground" />
                <input value={verifyTxId} onChange={(e) => setVerifyTxId(e.target.value)} className={inputStyle} placeholder="TX-XXXXXXXX" />
              </div>
            </div>
          </div>
          <div className="flex justify-end mb-4">
            <button onClick={handleVerify} disabled={verifying} className="px-5 py-2.5 rounded-md bg-primary text-primary-foreground text-sm font-bold cursor-pointer disabled:opacity-50 inline-flex items-center gap-1.5">
              <ShieldCheck size={14} /> {verifying ? "جارٍ التحقق…" : "تحقق"}
            </button>
          </div>

          {/* Result */}
          {verifyResult && (
            <div className="bg-muted rounded-[10px] border border-border p-4">
              <h3 className="text-[14px] font-bold mb-3">نتيجة التحقق</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-full flex items-center justify-center shrink-0" style={{
                    background: verifyResult.status === "completed" ? "rgba(16,185,129,0.15)" : verifyResult.status === "pending" ? "rgba(245,158,11,0.15)" : "rgba(239,68,68,0.15)",
                    color: verifyResult.status === "completed" ? "#10b981" : verifyResult.status === "pending" ? "#f59e0b" : "#ef4444",
                  }}>
                    {verifyResult.status === "completed" ? <CheckCircle2 size={24} /> : verifyResult.status === "pending" ? <Clock size={24} /> : <XCircle size={24} />}
                  </div>
                  <div>
                    <p className="text-[11px] text-muted-foreground">الحالة</p>
                    <p className="text-[16px] font-bold" style={{
                      color: verifyResult.status === "completed" ? "#10b981" : verifyResult.status === "pending" ? "#f59e0b" : "#ef4444",
                    }}>
                      {verifyResult.status === "completed" ? "مكتمل ✓" : verifyResult.status === "pending" ? "قيد الانتظار" : verifyResult.status === "failed" ? "فشل" : verifyResult.status}
                    </p>
                  </div>
                </div>
                <div>
                  <p className="text-[11px] text-muted-foreground">رقم المعاملة</p>
                  <p className="text-[14px] font-bold font-mono">{verifyResult.transactionId}</p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

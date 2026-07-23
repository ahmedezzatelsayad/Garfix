"use client";

import { useEffect, useState, useCallback } from "react";
import { useBrand } from "@/context/BrandContext";
import { authedFetch } from "@/context/AuthContext";
import { toast } from "sonner";
import { Plus, ShoppingCart, Trash2, X } from "lucide-react";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 20;

interface PurchaseItem { description: string; qty: number; price: number; }
interface Purchase {
  id: number; num: string; date: string; supplier: string;
  items: PurchaseItem[]; totalQty: number; notes?: string;
}

const inputStyle = "w-full py-2 px-3 rounded-sm bg-background border border-border text-foreground text-[13px] outline-none max-md:min-h-[44px]";
const labelStyle = "block text-[11px] font-semibold text-muted-foreground mb-1";

export function PurchasesView() {
  const { activeCompany } = useBrand();
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [currentPage, setCurrentPage] = useState(1);
  const [bulkDeleting, setBulkDeleting] = useState(false);

  const load = useCallback(async () => {
    if (!activeCompany) { setLoading(false); return; }
    setLoading(true);
    try {
      const res = await authedFetch(`/api/purchases?companySlug=${encodeURIComponent(activeCompany.slug)}`);
      if (res.ok) {
        setPurchases((await res.json()).purchases || []);
        setCurrentPage(1);
        setSelectedIds(new Set());
      } else toast.error("تعذّر تحميل فواتير الشراء");
    } catch { toast.error("تعذّر تحميل فواتير الشراء"); }
    finally { setLoading(false); }
  }, [activeCompany]);

  // setState runs inside async .then() callback in load (after await authedFetch) — not synchronous in effect body; no cascading render.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);

  const totalPages = Math.max(1, Math.ceil(purchases.length / PAGE_SIZE));
  const pagePurchases = purchases.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const safePage = Math.min(currentPage, totalPages);

  const toggleSelectAll = () => {
    if (selectedIds.size === pagePurchases.length && pagePurchases.length > 0) setSelectedIds(new Set());
    else setSelectedIds(new Set(pagePurchases.map((p) => p.id)));
  };
  const toggleRow = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    if (!confirm(`حذف ${selectedIds.size} فاتورة شراء؟`)) return;
    setBulkDeleting(true);
    let okCount = 0, failCount = 0;
    for (const id of selectedIds) {
      try {
        const res = await authedFetch(`/api/purchases/${id}`, { method: "DELETE" });
        if (res.ok) okCount++; else failCount++;
      } catch { failCount++; }
    }
    setBulkDeleting(false);
    setSelectedIds(new Set());
    if (okCount > 0) toast.success(`تم حذف ${okCount} فاتورة شراء`);
    if (failCount > 0) toast.error(`تعذّر حذف ${failCount} فاتورة شراء`);
    load();
  };

  const handleDelete = async (id: number) => {
    if (!confirm("حذف فاتورة الشراء؟")) return;
    try {
      const res = await authedFetch(`/api/purchases/${id}`, { method: "DELETE" });
      if (res.ok) { toast.success("تم الحذف"); load(); }
      else {
        const e = await res.json().catch(() => ({}));
        toast.error(e.error || "تعذّر الحذف");
      }
    } catch { toast.error("تعذّر الحذف"); }
  };

  if (!activeCompany) return <div className="p-8 md:p-12 text-center text-muted-foreground">اختر شركة</div>;
  if (showForm) return <PurchaseForm company={activeCompany} onClose={() => setShowForm(false)} onSaved={() => { setShowForm(false); load(); }} />;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap justify-between items-center gap-3">
        <div><h1 className="text-2xl font-extrabold">المشتريات</h1><p className="text-[13px] text-muted-foreground">{purchases.length} فاتورة شراء</p></div>
        <button onClick={() => setShowForm(true)} className="inline-flex items-center gap-1.5 px-[18px] py-2.5 rounded-md bg-primary text-primary-foreground border-none font-bold text-[13px] cursor-pointer max-md:min-h-[44px]"><Plus size={16} /> فاتورة شراء جديدة</button>
      </div>

      {selectedIds.size > 0 && (
        <div className="py-2.5 px-4 bg-destructive text-white rounded-md flex flex-wrap justify-between items-center gap-2">
          <span className="font-bold text-[13px]">{selectedIds.size} فاتورة شراء محددة</span>
          <div className="flex gap-2">
            <button onClick={() => setSelectedIds(new Set())} disabled={bulkDeleting} className="bg-white/15 text-white border-none rounded-sm px-3.5 py-1.5 cursor-pointer font-bold text-xs disabled:cursor-not-allowed max-md:min-h-[44px]">إلغاء التحديد</button>
            <button onClick={handleBulkDelete} disabled={bulkDeleting} className="bg-white/25 text-white border-none rounded-sm px-3.5 py-1.5 cursor-pointer font-bold text-xs disabled:cursor-not-allowed disabled:opacity-70 max-md:min-h-[44px]">{bulkDeleting ? "جارٍ الحذف…" : "حذف المحدد"}</button>
          </div>
        </div>
      )}

      <div className="bg-card rounded-[14px] border border-border overflow-hidden">
        {loading ? <div className="p-8 md:p-12 text-center text-muted-foreground">جارٍ التحميل…</div> : purchases.length === 0 ? (
          <div className="p-8 md:p-12 text-center text-muted-foreground"><ShoppingCart size={36} className="opacity-30 mb-2" /><div>لا توجد فواتير شراء بعد</div></div>
        ) : (
          <>
          {/* Desktop table */}
          <div className="hidden md:block overflow-x-auto garfix-scroll">
            <table className="w-full border-collapse text-[13px]">
              <thead><tr className="border-b border-border bg-muted">
                <th className="w-10 text-center px-2 py-2.5 text-[11px] text-muted-foreground">
                  <input type="checkbox" checked={selectedIds.size === pagePurchases.length && pagePurchases.length > 0} onChange={toggleSelectAll} className="cursor-pointer w-4 h-4" aria-label="تحديد الكل" />
                </th>
                <th className="text-start px-3 py-2.5 text-[11px] text-muted-foreground">الرقم</th>
                <th className="text-start px-3 py-2.5 text-[11px] text-muted-foreground">التاريخ</th>
                <th className="text-start px-3 py-2.5 text-[11px] text-muted-foreground">المورّد</th>
                <th className="text-start px-3 py-2.5 text-[11px] text-muted-foreground">عدد البنود</th>
                <th className="text-start px-3 py-2.5 text-[11px] text-muted-foreground">الكمية</th>
                <th className="text-start px-3 py-2.5 text-[11px] text-muted-foreground">إجراء</th>
              </tr></thead>
              <tbody>
                {pagePurchases.map((p) => {
                  const checked = selectedIds.has(p.id);
                  return (
                    <tr key={p.id} className={cn("border-b border-border", checked ? "bg-accent" : "bg-transparent")}>
                      <td className="px-2 py-2.5 text-center">
                        <input type="checkbox" checked={checked} onChange={() => toggleRow(p.id)} className="cursor-pointer w-4 h-4" aria-label={`تحديد ${p.num}`} />
                      </td>
                      <td className="px-3 py-2.5 font-bold font-mono" dir="ltr">{p.num}</td>
                      <td className="px-3 py-2.5">{p.date}</td>
                      <td className="px-3 py-2.5">{p.supplier || "—"}</td>
                      <td className="px-3 py-2.5">{p.items?.length || 0}</td>
                      <td className="px-3 py-2.5">{p.totalQty}</td>
                      <td className="px-3 py-2.5">
                        <button onClick={() => handleDelete(p.id)} title="حذف" className="w-7 h-7 rounded-sm bg-transparent border border-border text-destructive cursor-pointer flex items-center justify-center"><Trash2 size={14} /></button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {/* Mobile cards */}
          <div className="md:hidden flex flex-col divide-y divide-border">
            {pagePurchases.map((p) => {
              const checked = selectedIds.has(p.id);
              return (
                <div key={p.id} className={cn("p-3 flex flex-col gap-2", checked ? "bg-accent" : "bg-transparent")}>
                  <div className="flex items-center justify-between gap-2">
                    <label className="flex items-center gap-2 min-h-[44px]">
                      <input type="checkbox" checked={checked} onChange={() => toggleRow(p.id)} className="cursor-pointer w-4 h-4" aria-label={`تحديد ${p.num}`} />
                      <span className="font-bold font-mono text-[13px]" dir="ltr">{p.num}</span>
                    </label>
                    <button onClick={() => handleDelete(p.id)} title="حذف" className="min-w-[44px] min-h-[44px] rounded-sm bg-transparent border border-border text-destructive cursor-pointer flex items-center justify-center"><Trash2 size={14} /></button>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-[13px]">
                    <div><span className="text-muted-foreground text-[11px]">التاريخ: </span><span dir="ltr">{p.date}</span></div>
                    <div><span className="text-muted-foreground text-[11px]">المورّد: </span>{p.supplier || "—"}</div>
                    <div><span className="text-muted-foreground text-[11px]">البنود: </span>{p.items?.length || 0}</div>
                    <div><span className="text-muted-foreground text-[11px]">الكمية: </span>{p.totalQty}</div>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="flex flex-wrap justify-between items-center px-4 py-3 border-t border-border gap-2">
            <span className="text-xs text-muted-foreground">صفحة {safePage} من {totalPages} ({purchases.length} فاتورة شراء)</span>
            <div className="flex items-center gap-1.5">
              <button onClick={() => setCurrentPage((p) => Math.max(1, p - 1))} disabled={safePage === 1} className={cn("px-3 py-1.5 rounded-sm border border-border font-bold text-xs max-md:min-h-[44px]", safePage === 1 ? "bg-transparent text-muted-foreground cursor-not-allowed opacity-50" : "bg-card text-foreground cursor-pointer")}>السابق</button>
              <button onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))} disabled={safePage === totalPages} className={cn("px-3 py-1.5 rounded-sm border border-border font-bold text-xs max-md:min-h-[44px]", safePage === totalPages ? "bg-transparent text-muted-foreground cursor-not-allowed opacity-50" : "bg-card text-foreground cursor-pointer")}>التالي</button>
            </div>
          </div>
          </>
        )}
      </div>
    </div>
  );
}

function PurchaseForm({ company, onClose, onSaved }: { company: { slug: string }; onClose: () => void; onSaved: () => void }) {
  const [num, setNum] = useState(`PUR-${Date.now().toString().slice(-6)}`);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [supplier, setSupplier] = useState("");
  const [items, setItems] = useState<PurchaseItem[]>([{ description: "", qty: 1, price: 0 }]);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const updateItem = (i: number, field: keyof PurchaseItem, value: string | number) => {
    setItems((arr) => arr.map((it, idx) => idx === i ? { ...it, [field]: value } : it));
  };
  const addItem = () => setItems((arr) => [...arr, { description: "", qty: 1, price: 0 }]);
  const removeItem = (i: number) => setItems((arr) => arr.filter((_, idx) => idx !== i));

  const submit = async () => {
    if (!num) { toast.error("الرقم مطلوب"); return; }
    setSaving(true);
    try {
      const res = await authedFetch("/api/purchases", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ num, date, supplier, items: items.filter((it) => it.description), notes, companySlug: company.slug }),
      });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || "Failed"); }
      toast.success("تم إنشاء فاتورة الشراء");
      onSaved();
    } catch (err) { toast.error(err instanceof Error ? err.message : "خطأ"); }
    finally { setSaving(false); }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-between items-center">
        <h1 className="text-[22px] font-extrabold">فاتورة شراء جديدة</h1>
        <button onClick={onClose} className="bg-transparent border border-border text-muted-foreground px-3 py-2 rounded-sm cursor-pointer text-xs inline-flex items-center gap-1 max-md:min-h-[44px]"><X size={14} /> إغلاق</button>
      </div>
      <div className="bg-card rounded-[14px] border border-border p-5 flex flex-col gap-3.5">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <div><label className={labelStyle}>الرقم *</label><input value={num} onChange={(e) => setNum(e.target.value)} className={inputStyle} dir="ltr" /></div>
          <div><label className={labelStyle}>التاريخ</label><input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputStyle} dir="ltr" /></div>
          <div><label className={labelStyle}>المورّد</label><input value={supplier} onChange={(e) => setSupplier(e.target.value)} className={inputStyle} /></div>
        </div>
        <div>
          <div className="flex justify-between items-center mb-2">
            <label className={cn(labelStyle, "mb-0")}>البنود</label>
            <button onClick={addItem} className="bg-accent text-accent-foreground border border-border rounded-sm px-2.5 py-1 font-bold text-[11px] cursor-pointer inline-flex items-center gap-1 max-md:min-h-[44px]"><Plus size={12} /> إضافة</button>
          </div>
          <div className="flex flex-col gap-2">
            {items.map((it, i) => (
              <div key={i} className="grid grid-cols-1 sm:grid-cols-[1fr_80px_100px_32px] gap-2">
                <input placeholder="وصف البند" value={it.description} onChange={(e) => updateItem(i, "description", e.target.value)} className={inputStyle} />
                <input type="number" placeholder="كمية" value={it.qty} onChange={(e) => updateItem(i, "qty", Number(e.target.value))} className={inputStyle} dir="ltr" />
                <input type="number" placeholder="سعر" value={it.price} onChange={(e) => updateItem(i, "price", Number(e.target.value))} className={inputStyle} dir="ltr" />
                <button onClick={() => removeItem(i)} className="bg-transparent border border-border text-destructive rounded-sm cursor-pointer flex items-center justify-center min-h-[44px] sm:min-h-0"><X size={12} /></button>
              </div>
            ))}
          </div>
        </div>
        <div><label className={labelStyle}>ملاحظات</label><textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className={cn(inputStyle, "resize-y")} /></div>
      </div>
      <div className="flex gap-2.5 justify-end">
        <button onClick={onClose} className="px-5 py-2.5 rounded-md bg-transparent text-muted-foreground border border-border font-bold text-[13px] cursor-pointer max-md:min-h-[44px]">إلغاء</button>
        <button onClick={submit} disabled={saving} className="px-6 py-2.5 rounded-md bg-primary text-primary-foreground border-none font-extrabold text-[13px] cursor-pointer disabled:cursor-not-allowed disabled:opacity-70 max-md:min-h-[44px]">{saving ? "جارٍ…" : "حفظ"}</button>
      </div>
    </div>
  );
}

export default PurchasesView;

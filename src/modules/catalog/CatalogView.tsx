"use client";

import { useEffect, useState, useCallback } from "react";
import { useBrand } from "@/context/BrandContext";
import { authedFetch } from "@/context/AuthContext";
import { toast } from "sonner";
import { Plus, Search, Package, Trash2, Edit2, X } from "lucide-react";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 20;

interface Product {
  id: number;
  code: string | null;
  name: string;
  aliases: string[];
  purchasePrice: number | null;
  sellingPrice: number | null;
  companySlug: string;
}

const inputStyle = "w-full py-2 px-3 rounded-sm bg-background border border-border text-foreground text-[13px] outline-none max-md:min-h-[44px]";
const labelStyle = "block text-[11px] font-semibold text-muted-foreground mb-1";
const iconBtnStyle = "w-7 h-7 rounded-sm bg-transparent border border-border text-muted-foreground cursor-pointer flex items-center justify-center";

export function CatalogView() {
  const { activeCompany } = useBrand();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [currentPage, setCurrentPage] = useState(1);
  const [bulkDeleting, setBulkDeleting] = useState(false);

  const load = useCallback(async () => {
    if (!activeCompany) { setLoading(false); return; }
    setLoading(true);
    try {
      const url = `/api/catalog?companySlug=${encodeURIComponent(activeCompany.slug)}${search ? `&search=${encodeURIComponent(search)}` : ""}`;
      const res = await authedFetch(url);
      if (res.ok) {
        setProducts((await res.json()).products || []);
        setCurrentPage(1);
        setSelectedIds(new Set());
      } else toast.error("تعذّر تحميل المنتجات");
    } catch { toast.error("تعذّر تحميل المنتجات"); }
    finally { setLoading(false); }
  }, [activeCompany, search]);

  // setState runs inside async .then() callback in load (after await authedFetch) — not synchronous in effect body; no cascading render.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);

  // Reset page when search changes (render-time adjustment, no cascading render).
  const [prevSearch, setPrevSearch] = useState(search);
  if (search !== prevSearch) {
    setPrevSearch(search);
    setCurrentPage(1);
  }

  const totalPages = Math.max(1, Math.ceil(products.length / PAGE_SIZE));
  const pageProducts = products.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const safePage = Math.min(currentPage, totalPages);

  const toggleSelectAll = () => {
    if (selectedIds.size === pageProducts.length && pageProducts.length > 0) setSelectedIds(new Set());
    else setSelectedIds(new Set(pageProducts.map((p) => p.id)));
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
    if (!confirm(`حذف ${selectedIds.size} منتج؟`)) return;
    setBulkDeleting(true);
    let okCount = 0, failCount = 0;
    for (const id of selectedIds) {
      try {
        const res = await authedFetch(`/api/catalog/${id}`, { method: "DELETE" });
        if (res.ok) okCount++; else failCount++;
      } catch { failCount++; }
    }
    setBulkDeleting(false);
    setSelectedIds(new Set());
    if (okCount > 0) toast.success(`تم حذف ${okCount} منتج`);
    if (failCount > 0) toast.error(`تعذّر حذف ${failCount} منتج`);
    load();
  };

  const handleDelete = async (id: number) => {
    if (!confirm("حذف هذا المنتج؟")) return;
    try {
      const res = await authedFetch(`/api/catalog/${id}`, { method: "DELETE" });
      if (res.ok) { toast.success("تم الحذف"); load(); }
      else {
        const e = await res.json().catch(() => ({}));
        toast.error(e.error || "تعذّر الحذف");
      }
    } catch { toast.error("تعذّر الحذف"); }
  };

  if (!activeCompany) return <div className="p-8 md:p-12 text-center text-muted-foreground">اختر شركة</div>;
  if (showForm || editing) return <ProductForm company={activeCompany} editing={editing} onClose={() => { setShowForm(false); setEditing(null); }} onSaved={() => { setShowForm(false); setEditing(null); load(); }} />;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap justify-between items-center gap-3">
        <div><h1 className="text-2xl font-extrabold">المنتجات</h1><p className="text-[13px] text-muted-foreground">{products.length} منتج</p></div>
        <button onClick={() => setShowForm(true)} className="inline-flex items-center gap-1.5 px-[18px] py-2.5 rounded-md bg-primary text-primary-foreground border-none font-bold text-[13px] cursor-pointer max-md:min-h-[44px]"><Plus size={16} /> منتج جديد</button>
      </div>
      <div className="relative">
        <Search size={16} className="absolute end-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input placeholder="بحث بالاسم أو الكود…" value={search} onChange={(e) => setSearch(e.target.value)} className="w-full py-2.5 pe-10 ps-4 rounded-md bg-card border border-border text-foreground text-[13px] outline-none max-md:min-h-[44px]" />
      </div>

      {selectedIds.size > 0 && (
        <div className="py-2.5 px-4 bg-destructive text-white rounded-md flex flex-wrap justify-between items-center gap-2">
          <span className="font-bold text-[13px]">{selectedIds.size} منتج محدد</span>
          <div className="flex gap-2">
            <button onClick={() => setSelectedIds(new Set())} disabled={bulkDeleting} className="bg-white/15 text-white border-none rounded-sm px-3.5 py-1.5 cursor-pointer font-bold text-xs disabled:cursor-not-allowed max-md:min-h-[44px]">إلغاء التحديد</button>
            <button onClick={handleBulkDelete} disabled={bulkDeleting} className="bg-white/25 text-white border-none rounded-sm px-3.5 py-1.5 cursor-pointer font-bold text-xs disabled:cursor-not-allowed disabled:opacity-70 max-md:min-h-[44px]">{bulkDeleting ? "جارٍ الحذف…" : "حذف المحدد"}</button>
          </div>
        </div>
      )}

      <div className="bg-card rounded-[14px] border border-border overflow-hidden">
        {loading ? <div className="p-8 md:p-12 text-center text-muted-foreground">جارٍ التحميل…</div> : products.length === 0 ? (
          <div className="p-8 md:p-12 text-center text-muted-foreground"><Package size={36} className="opacity-30 mb-2" /><div>لا توجد منتجات بعد</div></div>
        ) : (
          <>
          {/* Desktop table */}
          <div className="hidden md:block overflow-x-auto garfix-scroll">
            <table className="w-full border-collapse text-[13px]">
              <thead><tr className="border-b border-border bg-muted">
                <th className="w-10 text-center px-2 py-2.5 text-[11px] text-muted-foreground">
                  <input type="checkbox" checked={selectedIds.size === pageProducts.length && pageProducts.length > 0} onChange={toggleSelectAll} className="cursor-pointer w-4 h-4" aria-label="تحديد الكل" />
                </th>
                <th className="text-start px-3 py-2.5 text-[11px] text-muted-foreground">الكود</th>
                <th className="text-start px-3 py-2.5 text-[11px] text-muted-foreground">الاسم</th>
                <th className="text-start px-3 py-2.5 text-[11px] text-muted-foreground">سعر الشراء</th>
                <th className="text-start px-3 py-2.5 text-[11px] text-muted-foreground">سعر البيع</th>
                <th className="text-start px-3 py-2.5 text-[11px] text-muted-foreground">إجراءات</th>
              </tr></thead>
              <tbody>
                {pageProducts.map((p) => {
                  const checked = selectedIds.has(p.id);
                  return (
                    <tr key={p.id} className={cn("border-b border-border", checked ? "bg-accent" : "bg-transparent")}>
                      <td className="px-2 py-2.5 text-center">
                        <input type="checkbox" checked={checked} onChange={() => toggleRow(p.id)} className="cursor-pointer w-4 h-4" aria-label={`تحديد ${p.name}`} />
                      </td>
                      <td className="px-3 py-2.5 font-mono">{p.code || "—"}</td>
                      <td className="px-3 py-2.5 font-bold">{p.name}</td>
                      <td className="px-3 py-2.5 [direction:ltr] text-end">{p.purchasePrice ?? "—"}</td>
                      <td className="px-3 py-2.5 [direction:ltr] text-end font-bold text-primary">{p.sellingPrice ?? "—"}</td>
                      <td className="px-3 py-2.5">
                        <div className="flex gap-1">
                          <button onClick={() => setEditing(p)} title="تعديل" className={iconBtnStyle}><Edit2 size={14} /></button>
                          <button onClick={() => handleDelete(p.id)} title="حذف" className={cn(iconBtnStyle, "text-destructive")}><Trash2 size={14} /></button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {/* Mobile cards */}
          <div className="md:hidden flex flex-col divide-y divide-border">
            {pageProducts.map((p) => {
              const checked = selectedIds.has(p.id);
              return (
                <div key={p.id} className={cn("p-3 flex flex-col gap-2", checked ? "bg-accent" : "bg-transparent")}>
                  <div className="flex items-center justify-between gap-2">
                    <label className="flex items-center gap-2 min-h-[44px]">
                      <input type="checkbox" checked={checked} onChange={() => toggleRow(p.id)} className="cursor-pointer w-4 h-4" aria-label={`تحديد ${p.name}`} />
                      <span className="font-bold text-[13px]">{p.name}</span>
                    </label>
                    <div className="flex gap-1">
                      <button onClick={() => setEditing(p)} title="تعديل" className="min-w-[44px] min-h-[44px] rounded-sm bg-transparent border border-border text-muted-foreground cursor-pointer flex items-center justify-center"><Edit2 size={14} /></button>
                      <button onClick={() => handleDelete(p.id)} title="حذف" className="min-w-[44px] min-h-[44px] rounded-sm bg-transparent border border-border text-destructive cursor-pointer flex items-center justify-center"><Trash2 size={14} /></button>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-[13px]">
                    <div><span className="text-muted-foreground text-[11px]">الكود: </span><span className="font-mono" dir="ltr">{p.code || "—"}</span></div>
                    <div><span className="text-muted-foreground text-[11px]">شراء: </span><span dir="ltr">{p.purchasePrice ?? "—"}</span></div>
                    <div><span className="text-muted-foreground text-[11px]">بيع: </span><span className="font-bold text-primary" dir="ltr">{p.sellingPrice ?? "—"}</span></div>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="flex flex-wrap justify-between items-center px-4 py-3 border-t border-border gap-2">
            <span className="text-xs text-muted-foreground">صفحة {safePage} من {totalPages} ({products.length} منتج)</span>
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

function ProductForm({ company, editing, onClose, onSaved }: { company: { slug: string }; editing: Product | null; onClose: () => void; onSaved: () => void }) {
  const [code, setCode] = useState(editing?.code || "");
  const [name, setName] = useState(editing?.name || "");
  const [aliases, setAliases] = useState((editing?.aliases || []).join(", "));
  const [purchasePrice, setPurchasePrice] = useState(editing?.purchasePrice?.toString() || "");
  const [sellingPrice, setSellingPrice] = useState(editing?.sellingPrice?.toString() || "");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!name) { toast.error("الاسم مطلوب"); return; }
    setSaving(true);
    try {
      const url = editing ? `/api/catalog/${editing.id}` : "/api/catalog";
      const method = editing ? "PATCH" : "POST";
      const res = await authedFetch(url, {
        method, headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code, name,
          aliases: aliases.split(",").map((s) => s.trim()).filter(Boolean),
          purchasePrice: purchasePrice || undefined,
          sellingPrice: sellingPrice || undefined,
          companySlug: company.slug,
        }),
      });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || "Failed"); }
      toast.success(editing ? "تم التحديث" : "تم الإنشاء");
      onSaved();
    } catch (err) { toast.error(err instanceof Error ? err.message : "خطأ"); }
    finally { setSaving(false); }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-between items-center">
        <h1 className="text-[22px] font-extrabold">{editing ? "تعديل منتج" : "منتج جديد"}</h1>
        <button onClick={onClose} className="bg-transparent border border-border text-muted-foreground px-3 py-2 rounded-sm cursor-pointer text-xs inline-flex items-center gap-1 max-md:min-h-[44px]"><X size={14} /> إغلاق</button>
      </div>
      <div className="bg-card rounded-[14px] border border-border p-5 flex flex-col gap-3.5">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div><label className={labelStyle}>الكود</label><input value={code} onChange={(e) => setCode(e.target.value)} className={inputStyle} dir="ltr" /></div>
          <div><label className={labelStyle}>الاسم *</label><input value={name} onChange={(e) => setName(e.target.value)} className={inputStyle} /></div>
          <div><label className={labelStyle}>سعر الشراء</label><input type="number" value={purchasePrice} onChange={(e) => setPurchasePrice(e.target.value)} className={inputStyle} dir="ltr" /></div>
          <div><label className={labelStyle}>سعر البيع</label><input type="number" value={sellingPrice} onChange={(e) => setSellingPrice(e.target.value)} className={inputStyle} dir="ltr" /></div>
        </div>
        <div><label className={labelStyle}>الأسماء البديلة (افصل بفواصل)</label><input value={aliases} onChange={(e) => setAliases(e.target.value)} className={inputStyle} placeholder="اسم بديل 1، اسم بديل 2" /></div>
      </div>
      <div className="flex gap-2.5 justify-end">
        <button onClick={onClose} className="px-5 py-2.5 rounded-md bg-transparent text-muted-foreground border border-border font-bold text-[13px] cursor-pointer max-md:min-h-[44px]">إلغاء</button>
        <button onClick={submit} disabled={saving} className="px-6 py-2.5 rounded-md bg-primary text-primary-foreground border-none font-extrabold text-[13px] cursor-pointer disabled:cursor-not-allowed disabled:opacity-70 max-md:min-h-[44px]">{saving ? "جارٍ…" : "حفظ"}</button>
      </div>
    </div>
  );
}

export default CatalogView;

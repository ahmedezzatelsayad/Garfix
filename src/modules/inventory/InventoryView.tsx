"use client";

import { useEffect, useState, useCallback } from "react";
import { useBrand } from "@/context/BrandContext";
import { authedFetch } from "@/context/AuthContext";
import { toast } from "sonner";
import {
  Package, Plus, Trash2, Boxes, AlertTriangle, CheckCircle2,
  XCircle, Warehouse as WarehouseIcon, ArrowDownUp,
} from "lucide-react";
import { cn } from "@/lib/utils";

type Tab = "warehouses" | "stock";

interface Warehouse {
  id: number;
  name: string;
  code: string;
  address?: string | null;
  isActive: boolean;
  itemCount: number;
}

interface InventoryItem {
  id: number;
  warehouseId: number;
  warehouseName: string;
  warehouseCode: string;
  productId: number;
  productCode: string | null;
  productName: string;
  quantity: number;
  reorderLevel: number;
  reorderQty: number;
  batchNumber?: string | null;
  expiryDate?: string | null;
  status: "OK" | "Low" | "Out";
  updatedAt: string;
}

interface Product {
  id: number;
  code: string | null;
  name: string;
}

const PAGE_SIZE = 20;

export function InventoryView() {
  const { activeCompany } = useBrand();
  const [tab, setTab] = useState<Tab>("warehouses");
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [summary, setSummary] = useState<{ total: number; ok: number; low: number; out: number } | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);

  const loadWarehouses = useCallback(async () => {
    if (!activeCompany) { setLoading(false); return; }
    setLoading(true);
    try {
      const res = await authedFetch(`/api/inventory/warehouses?companySlug=${encodeURIComponent(activeCompany.slug)}`);
      if (res.ok) setWarehouses((await res.json()).warehouses || []);
      else toast.error("تعذّر تحميل المستودعات");
    } catch { toast.error("تعذّر تحميل المستودعات"); }
    finally { setLoading(false); }
  }, [activeCompany]);

  const loadItems = useCallback(async () => {
    if (!activeCompany) { setLoading(false); return; }
    setLoading(true);
    try {
      const res = await authedFetch(`/api/inventory/items?companySlug=${encodeURIComponent(activeCompany.slug)}`);
      if (res.ok) {
        const data = await res.json();
        setItems(data.items || []);
        setSummary(data.summary || null);
      } else toast.error("تعذّر تحميل أصناف المخزون");
    } catch { toast.error("تعذّر تحميل أصناف المخزون"); }
    finally { setLoading(false); }
  }, [activeCompany]);

  const loadProducts = useCallback(async () => {
    if (!activeCompany) return;
    try {
      const res = await authedFetch(`/api/catalog?companySlug=${encodeURIComponent(activeCompany.slug)}`);
      if (res.ok) setProducts((await res.json()).products || []);
      else toast.error("تعذّر تحميل قائمة المنتجات");
    } catch { toast.error("تعذّر تحميل قائمة المنتجات"); }
  }, [activeCompany]);

  // setState runs inside async .then() callbacks in loadWarehouses/loadItems/loadProducts (after await authedFetch) — not synchronous in effect body; no cascading render.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (tab === "warehouses") loadWarehouses();
    else { loadItems(); loadProducts(); }
  }, [tab, activeCompany, loadWarehouses, loadItems, loadProducts]);

  const switchTab = (t: Tab) => {
    setTab(t);
    setShowForm(false);
    setCurrentPage(1);
  };

  const handleDeleteWarehouse = async (id: number) => {
    if (!confirm("حذف هذا المستودع؟ لا يمكن الحذف إذا كان يحتوي على أصناف.")) return;
    try {
      const res = await authedFetch(`/api/inventory/warehouses/${id}`, { method: "DELETE" });
      if (res.ok) { toast.success("تم حذف المستودع"); loadWarehouses(); }
      else {
        const e = await res.json().catch(() => ({}));
        toast.error(e.error || "تعذّر الحذف");
      }
    } catch { toast.error("تعذّر الحذف"); }
  };

  if (!activeCompany) return <div className="p-12 text-center text-muted-foreground">اختر شركة</div>;

  const allItems = tab === "warehouses" ? warehouses : items;
  const totalPages = Math.max(1, Math.ceil(allItems.length / PAGE_SIZE));
  const pageItems = allItems.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const safePage = Math.min(currentPage, totalPages);

  const tabs: Array<{ key: Tab; label: string }> = [
    { key: "warehouses", label: `المستودعات (${warehouses.length})` },
    { key: "stock", label: `المخزون (${items.length})` },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 md:flex-row md:flex-wrap md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-extrabold flex items-center gap-2">
            <Boxes size={20} /> إدارة المخزون
          </h1>
          <p className="text-[13px] text-muted-foreground">{activeCompany.nameAr || activeCompany.name}</p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="inline-flex items-center justify-center gap-1.5 py-2.5 px-[18px] rounded-[10px] bg-primary text-primary-foreground border-none text-[13px] font-bold cursor-pointer max-md:min-h-[44px]"
        >
          <Plus size={16} /> {tab === "warehouses" ? "مستودع جديد" : "تعديل مخزون"}
        </button>
      </div>

      {/* Summary cards — stack on mobile, grid on desktop */}
      {tab === "stock" && summary && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <SummaryCard icon={<Boxes size={16} />} label="إجمالي الأصناف" value={summary.total} color="var(--primary)" />
          <SummaryCard icon={<CheckCircle2 size={16} />} label="متوفر" value={summary.ok} color="#10b981" />
          <SummaryCard icon={<AlertTriangle size={16} />} label="تحت الحد الأدنى" value={summary.low} color="#f59e0b" />
          <SummaryCard icon={<XCircle size={16} />} label="نفد" value={summary.out} color="#ef4444" />
        </div>
      )}

      {/* Tab bar — wraps on mobile */}
      <div className="flex flex-wrap gap-1.5">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => switchTab(t.key)}
            className={cn(
              "py-2 px-4 rounded-[10px] border text-[12px] font-bold cursor-pointer inline-flex items-center gap-1.5 max-md:min-h-[44px]",
              tab === t.key
                ? "bg-primary text-primary-foreground border-border"
                : "bg-card text-muted-foreground border-border",
            )}
          >
            {t.key === "warehouses" ? <WarehouseIcon size={14} /> : <Package size={14} />}
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="p-12 text-center text-muted-foreground">جارٍ التحميل…</div>
      ) : showForm ? (
        tab === "warehouses" ? (
          <WarehouseForm
            company={activeCompany}
            onClose={() => setShowForm(false)}
            onSaved={() => { setShowForm(false); loadWarehouses(); }}
          />
        ) : (
          <AdjustStockForm
            company={activeCompany}
            warehouses={warehouses}
            products={products}
            onClose={() => setShowForm(false)}
            onSaved={() => { setShowForm(false); loadItems(); }}
          />
        )
      ) : (
        <div className="bg-card rounded-[14px] border border-border overflow-hidden">
          {allItems.length === 0 ? (
            <Empty label={tab === "warehouses" ? "مستودعات" : "أصناف مخزون"} />
          ) : (
            <>
              {/* Desktop / tablet table */}
              <div className="hidden md:block overflow-x-auto garfix-scroll">
                {tab === "warehouses" ? (
                  <table className="w-full border-collapse">
                    <thead>
                      <tr className="border-b border-border bg-muted">
                        <th className={thStyle}>الكود</th>
                        <th className={thStyle}>الاسم</th>
                        <th className={thStyle}>العنوان</th>
                        <th className={thStyle}>الحالة</th>
                        <th className={thStyle}>عدد الأصناف</th>
                        <th className={thStyle}>إجراء</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(pageItems as Warehouse[]).map((w) => (
                        <tr key={w.id} className="border-b border-border">
                          <td className={cn(tdStyle, "font-mono")}>{w.code}</td>
                          <td className={cn(tdStyle, "font-bold")}>
                            <span className="inline-flex items-center gap-1.5">
                              <WarehouseIcon size={14} className="opacity-60" />
                              {w.name}
                            </span>
                          </td>
                          <td className={tdStyle}>{w.address || "—"}</td>
                          <td className={tdStyle}>
                            <span className={cn(
                              "py-0.5 px-2.5 rounded-[12px] text-[11px] font-bold",
                              w.isActive ? "bg-[rgba(16,185,129,0.15)] text-[#10b981]" : "bg-[rgba(107,114,128,0.15)] text-[#6b7280]",
                            )}>
                              {w.isActive ? "نشط" : "موقوف"}
                            </span>
                          </td>
                          <td className={tdStyle}>{w.itemCount}</td>
                          <td className={tdStyle}>
                            <button onClick={() => handleDeleteWarehouse(w.id)} title="حذف" className={iconBtnStyle}>
                              <Trash2 size={14} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <table className="w-full border-collapse">
                    <thead>
                      <tr className="border-b border-border bg-muted">
                        <th className={thStyle}>المنتج</th>
                        <th className={thStyle}>المستودع</th>
                        <th className={thStyle}>الكمية</th>
                        <th className={thStyle}>حد الطلب</th>
                        <th className={thStyle}>الحالة</th>
                        <th className={thStyle}>دفعات/انتهاء</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(pageItems as InventoryItem[]).map((it) => (
                        <tr key={it.id} className="border-b border-border">
                          <td className={cn(tdStyle, "font-bold")}>
                            <div>{it.productName}</div>
                            {it.productCode && (
                              <div className="text-[10px] text-muted-foreground font-mono">{it.productCode}</div>
                            )}
                          </td>
                          <td className={tdStyle}>
                            <div>{it.warehouseName}</div>
                            <div className="text-[10px] text-muted-foreground font-mono">{it.warehouseCode}</div>
                          </td>
                          <td className={cn(tdStyle, "[direction:ltr] text-end font-bold")}>
                            {it.quantity.toLocaleString("ar-EG", { maximumFractionDigits: 3 })}
                          </td>
                          <td className={cn(tdStyle, "[direction:ltr] text-end")}>
                            {it.reorderLevel.toLocaleString("ar-EG", { maximumFractionDigits: 3 })}
                          </td>
                          <td className={tdStyle}>
                            <StatusBadge status={it.status} />
                          </td>
                          <td className={tdStyle}>
                            {it.batchNumber && (
                              <div className="text-[11px]">دفعة: {it.batchNumber}</div>
                            )}
                            {it.expiryDate && (
                              <div className="text-[10px] text-muted-foreground">انتهاء: {it.expiryDate}</div>
                            )}
                            {!it.batchNumber && !it.expiryDate && <span className="text-muted-foreground">—</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              {/* Mobile stacked cards */}
              {tab === "warehouses" ? (
                <div className="md:hidden flex flex-col gap-2 p-3">
                  {(pageItems as Warehouse[]).map((w) => (
                    <div
                      key={w.id}
                      className="rounded-[12px] border border-border bg-background p-3 flex flex-col gap-2 max-md:min-h-[44px]"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <WarehouseIcon size={14} className="opacity-60 shrink-0" />
                          <span className="font-bold text-[14px] truncate">{w.name}</span>
                        </div>
                        <span className={cn(
                          "py-0.5 px-2.5 rounded-[12px] text-[11px] font-bold shrink-0",
                          w.isActive ? "bg-[rgba(16,185,129,0.15)] text-[#10b981]" : "bg-[rgba(107,114,128,0.15)] text-[#6b7280]",
                        )}>
                          {w.isActive ? "نشط" : "موقوف"}
                        </span>
                      </div>
                      <div className="grid grid-cols-1 gap-1 text-[12px]">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-muted-foreground">الكود</span>
                          <span className="font-mono font-semibold [direction:ltr] text-end">{w.code}</span>
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-muted-foreground">العنوان</span>
                          <span className="font-semibold text-end truncate">{w.address || "—"}</span>
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-muted-foreground">عدد الأصناف</span>
                          <span className="font-bold [direction:ltr] text-end">{w.itemCount}</span>
                        </div>
                      </div>
                      <div className="flex justify-end">
                        <button onClick={() => handleDeleteWarehouse(w.id)} title="حذف" className={cn(iconBtnStyle, "min-w-[44px] min-h-[44px]")}>
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="md:hidden flex flex-col gap-2 p-3">
                  {(pageItems as InventoryItem[]).map((it) => (
                    <div
                      key={it.id}
                      className={cn(
                        "rounded-[12px] border bg-background p-3 flex flex-col gap-2 max-md:min-h-[44px]",
                        it.status === "Out" ? "border-[#ef4444]/40" : it.status === "Low" ? "border-[#f59e0b]/40" : "border-border",
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="font-bold text-[14px] truncate">{it.productName}</div>
                          {it.productCode && (
                            <div className="text-[10px] text-muted-foreground font-mono">{it.productCode}</div>
                          )}
                        </div>
                        <StatusBadge status={it.status} />
                      </div>
                      <div className="grid grid-cols-1 gap-1 text-[12px]">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-muted-foreground">المستودع</span>
                          <span className="font-semibold text-end truncate">{it.warehouseName} <span className="font-mono text-muted-foreground">({it.warehouseCode})</span></span>
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-muted-foreground">الكمية</span>
                          <span className="font-bold [direction:ltr] text-end">{it.quantity.toLocaleString("ar-EG", { maximumFractionDigits: 3 })}</span>
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-muted-foreground">حد الطلب</span>
                          <span className="font-semibold [direction:ltr] text-end">{it.reorderLevel.toLocaleString("ar-EG", { maximumFractionDigits: 3 })}</span>
                        </div>
                        {(it.batchNumber || it.expiryDate) && (
                          <>
                            {it.batchNumber && (
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-muted-foreground">دفعة</span>
                                <span className="font-semibold [direction:ltr] text-end">{it.batchNumber}</span>
                              </div>
                            )}
                            {it.expiryDate && (
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-muted-foreground">انتهاء</span>
                                <span className="font-semibold [direction:ltr] text-end">{it.expiryDate}</span>
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex flex-wrap justify-between items-center py-3 px-4 border-t border-border gap-2">
                <span className="text-[12px] text-muted-foreground">
                  صفحة {safePage} من {totalPages} ({allItems.length} عنصر)
                </span>
                <div className="flex items-center gap-1.5">
                  <button onClick={() => setCurrentPage((p) => Math.max(1, p - 1))} disabled={safePage === 1} className={pageBtnStyle(safePage === 1)}>السابق</button>
                  <button onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))} disabled={safePage === totalPages} className={pageBtnStyle(safePage === totalPages)}>التالي</button>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: "OK" | "Low" | "Out" }) {
  const config = {
    OK: { label: "متوفر", color: "#10b981", icon: <CheckCircle2 size={12} /> },
    Low: { label: "تحت الحد", color: "#f59e0b", icon: <AlertTriangle size={12} /> },
    Out: { label: "نفد", color: "#ef4444", icon: <XCircle size={12} /> },
  }[status];
  return (
    <span
      className="py-0.5 px-2.5 rounded-[12px] text-[11px] font-bold inline-flex items-center gap-1"
      style={{ background: `${config.color}20`, color: config.color }}
    >
      {config.icon} {config.label}
    </span>
  );
}

function SummaryCard({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: number; color: string }) {
  return (
    <div className="bg-card rounded-[12px] border border-border py-3.5 px-4 flex items-center gap-3 max-md:min-h-[44px]">
      <div
        className="w-9 h-9 rounded-[8px] flex items-center justify-center shrink-0"
        style={{ background: `${color}20`, color }}
      >{icon}</div>
      <div className="min-w-0">
        <div className="text-[11px] text-muted-foreground truncate">{label}</div>
        <div className="text-[18px] font-extrabold [direction:ltr] text-start">{value.toLocaleString("ar-EG")}</div>
      </div>
    </div>
  );
}

function WarehouseForm({ company, onClose, onSaved }: { company: { slug: string }; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [address, setAddress] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!name || !code) { toast.error("الاسم والكود مطلوبان"); return; }
    setSaving(true);
    try {
      const res = await authedFetch("/api/inventory/warehouses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companySlug: company.slug, name, code, address, isActive }),
      });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || "Failed"); }
      toast.success("تم إنشاء المستودع");
      onSaved();
    } catch (err) { toast.error(err instanceof Error ? err.message : "خطأ"); }
    finally { setSaving(false); }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="bg-card rounded-[14px] border border-border p-5 flex flex-col gap-3.5">
        <h3 className="text-[15px] font-bold flex items-center gap-2">
          <WarehouseIcon size={16} /> مستودع جديد
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className={labelStyle}>الاسم *</label>
            <input value={name} onChange={(e) => setName(e.target.value)} className={inputStyle} placeholder="مثال: المستودع الرئيسي" />
          </div>
          <div>
            <label className={labelStyle}>الكود *</label>
            <input value={code} onChange={(e) => setCode(e.target.value)} className={inputStyle} dir="ltr" placeholder="مثال: WH-01" />
          </div>
          <div className="sm:col-span-2">
            <label className={labelStyle}>العنوان</label>
            <input value={address} onChange={(e) => setAddress(e.target.value)} className={inputStyle} />
          </div>
          <div>
            <label className={labelStyle}>الحالة</label>
            <select value={isActive ? "1" : "0"} onChange={(e) => setIsActive(e.target.value === "1")} className={inputStyle}>
              <option value="1">نشط</option>
              <option value="0">موقوف</option>
            </select>
          </div>
        </div>
      </div>
      <div className="flex gap-2.5 justify-end">
        <button onClick={onClose} className="py-2.5 px-5 rounded-[10px] bg-transparent text-muted-foreground border border-border text-[13px] font-bold cursor-pointer max-md:min-h-[44px]">إلغاء</button>
        <button onClick={submit} disabled={saving} className="py-2.5 px-6 rounded-[10px] bg-primary text-primary-foreground border-none text-[13px] font-extrabold cursor-pointer disabled:cursor-not-allowed disabled:opacity-70 max-md:min-h-[44px]">{saving ? "جارٍ…" : "حفظ"}</button>
      </div>
    </div>
  );
}

function AdjustStockForm({
  company, warehouses, products, onClose, onSaved,
}: {
  company: { slug: string };
  warehouses: Warehouse[];
  products: Product[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [warehouseId, setWarehouseId] = useState<number | null>(warehouses[0]?.id ?? null);
  const [productId, setProductId] = useState<number | null>(products[0]?.id ?? null);
  const [mode, setMode] = useState<"set" | "adjust">("set");
  const [quantity, setQuantity] = useState("0");
  const [reorderLevel, setReorderLevel] = useState("0");
  const [reorderQty, setReorderQty] = useState("0");
  const [batchNumber, setBatchNumber] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!warehouseId || !productId) { toast.error("اختر المستودع والمنتج"); return; }
    setSaving(true);
    try {
      const res = await authedFetch("/api/inventory/items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companySlug: company.slug,
          warehouseId,
          productId,
          mode,
          quantity,
          reorderLevel,
          reorderQty,
          batchNumber: batchNumber || null,
          expiryDate: expiryDate || null,
        }),
      });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || "Failed"); }
      toast.success(mode === "set" ? "تم تحديد المخزون" : "تم تعديل المخزون");
      onSaved();
    } catch (err) { toast.error(err instanceof Error ? err.message : "خطأ"); }
    finally { setSaving(false); }
  };

  if (warehouses.length === 0) {
    return (
      <div className="bg-card rounded-[14px] border border-border p-8 text-center text-muted-foreground">
        أنشئ مستودعاً أولاً قبل إضافة أصناف.
      </div>
    );
  }
  if (products.length === 0) {
    return (
      <div className="bg-card rounded-[14px] border border-border p-8 text-center text-muted-foreground">
        أنشئ منتجاً في كتالوج المنتجات أولاً.
      </div>
    );
  }

  return (
    // Full-width on mobile, constrained on desktop (max-w-3xl ≈ 768px)
    <div className="flex flex-col gap-4 w-full md:max-w-3xl">
      <div className="bg-card rounded-[14px] border border-border p-5 flex flex-col gap-3.5">
        <h3 className="text-[15px] font-bold flex items-center gap-2">
          <ArrowDownUp size={16} /> تعديل المخزون
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className={labelStyle}>المستودع *</label>
            <select value={warehouseId ?? ""} onChange={(e) => setWarehouseId(Number(e.target.value))} className={inputStyle}>
              {warehouses.map((w) => <option key={w.id} value={w.id}>{w.code} — {w.name}</option>)}
            </select>
          </div>
          <div>
            <label className={labelStyle}>المنتج *</label>
            <select value={productId ?? ""} onChange={(e) => setProductId(Number(e.target.value))} className={inputStyle}>
              {products.map((p) => <option key={p.id} value={p.id}>{p.code ? `${p.code} — ` : ""}{p.name}</option>)}
            </select>
          </div>
          <div>
            <label className={labelStyle}>طريقة التعديل</label>
            <select value={mode} onChange={(e) => setMode(e.target.value as "set" | "adjust")} className={inputStyle}>
              <option value="set">تعيين القيمة (مطلق)</option>
              <option value="adjust">إضافة/خصم (نسبي)</option>
            </select>
          </div>
          <div>
            <label className={labelStyle}>{mode === "set" ? "الكمية الجديدة *" : "مقدار التعديل (+/-) *"}</label>
            <input type="number" step="any" value={quantity} onChange={(e) => setQuantity(e.target.value)} className={inputStyle} dir="ltr" />
          </div>
          <div>
            <label className={labelStyle}>حد إعادة الطلب</label>
            <input type="number" step="any" value={reorderLevel} onChange={(e) => setReorderLevel(e.target.value)} className={inputStyle} dir="ltr" />
          </div>
          <div>
            <label className={labelStyle}>كمية إعادة الطلب</label>
            <input type="number" step="any" value={reorderQty} onChange={(e) => setReorderQty(e.target.value)} className={inputStyle} dir="ltr" />
          </div>
          <div>
            <label className={labelStyle}>رقم الدفعة</label>
            <input value={batchNumber} onChange={(e) => setBatchNumber(e.target.value)} className={inputStyle} dir="ltr" />
          </div>
          <div>
            <label className={labelStyle}>تاريخ الانتهاء</label>
            <input type="date" value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} className={inputStyle} dir="ltr" />
          </div>
        </div>
      </div>
      <div className="flex gap-2.5 justify-end">
        <button onClick={onClose} className="py-2.5 px-5 rounded-[10px] bg-transparent text-muted-foreground border border-border text-[13px] font-bold cursor-pointer max-md:min-h-[44px]">إلغاء</button>
        <button onClick={submit} disabled={saving} className="py-2.5 px-6 rounded-[10px] bg-primary text-primary-foreground border-none text-[13px] font-extrabold cursor-pointer disabled:cursor-not-allowed disabled:opacity-70 max-md:min-h-[44px]">{saving ? "جارٍ…" : "حفظ"}</button>
      </div>
    </div>
  );
}

const thStyle = "text-start py-2.5 px-3 text-[11px] text-muted-foreground font-bold";
const tdStyle = "py-2.5 px-3 text-[13px]";
const iconBtnStyle = "w-7 h-7 rounded-[6px] bg-transparent border border-border text-destructive cursor-pointer flex items-center justify-center";
const inputStyle = "w-full py-2 px-3 rounded-sm bg-background border border-border text-foreground text-[13px] outline-none";
const labelStyle = "block text-[11px] font-semibold text-muted-foreground mb-1";
const pageBtnStyle = (disabled: boolean): string =>
  disabled
    ? "py-1.5 px-3 rounded-[6px] bg-transparent text-muted-foreground border border-border text-[12px] font-bold cursor-not-allowed opacity-50"
    : "py-1.5 px-3 rounded-[6px] bg-card text-foreground border border-border text-[12px] font-bold cursor-pointer";

function Empty({ label }: { label: string }) {
  return (
    <div className="p-12 text-center text-muted-foreground">
      <Boxes size={36} className="opacity-30 mb-2 mx-auto" />
      <div>لا توجد {label} بعد</div>
    </div>
  );
}

export default InventoryView;

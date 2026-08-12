"use client";

import { useState } from "react";
import { useBrand } from "@/context/BrandContext";
import {
  useWarehouses, useInventoryItems, useCatalog,
  useDeleteWarehouse, useCreateWarehouse, useCreateInventoryItem,
} from "@/hooks/queries";
import type { CreateInventoryItemPayload } from "@/hooks/queries/inventory";
import { toast } from "sonner";
import {
  Package, Plus, Trash2, Boxes, AlertTriangle, CheckCircle2,
  XCircle, Warehouse as WarehouseIcon, ArrowDownUp, Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
// DS v4.0 Components
import {
  GarfixEnterpriseTable,
  GarfixEmptyState,
  GarfixLoadingState,
  GarfixErrorState,
} from "@/components/ui/index-garfix-ds";

type Tab = "warehouses" | "stock";

import type { Warehouse, InventoryItem } from "@/hooks/queries/inventory";
import type { CatalogItem } from "@/hooks/queries/catalog";

type Product = CatalogItem;

const PAGE_SIZE = 20;

export function InventoryView() {
  const { activeCompany } = useBrand();
  const slug = activeCompany?.slug || "";
  const [tab, setTab] = useState<Tab>("warehouses");

  // ── TanStack Query hooks ──────────────────────────────────────────────────
  const warehousesQuery = useWarehouses(slug);
  const itemsQuery = useInventoryItems(slug);
  const catalogQuery = useCatalog(slug);
  const deleteWarehouseMutation = useDeleteWarehouse();

  // ── Derived data from queries ──────────────────────────────────────────────
  const warehouses = warehousesQuery.data?.warehouses ?? [];
  const items = itemsQuery.data?.items ?? [];
  const summary = (itemsQuery.data as any)?.summary as { total: number; ok: number; low: number; out: number } | null | undefined;
  const products = catalogQuery.data?.products ?? [];
  const loading = tab === "warehouses" ? warehousesQuery.isLoading : itemsQuery.isLoading;

  // ── Low stock items for AI suggestion ─────────────────────────────────────
  const lowStockItems = items.filter((item) => item.status === "Low");
  
  // ── KPI calculations ─────────────────────────────────────────────────────
  const okPercent = summary && summary.total > 0 
    ? Math.round((summary.ok / summary.total) * 100) 
    : 0;

  const [showForm, setShowForm] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);

  const switchTab = (t: Tab) => {
    setTab(t);
    setShowForm(false);
    setCurrentPage(1);
  };

  const handleDeleteWarehouse = async (id: number) => {
    if (!confirm("حذف هذا المستودع؟ لا يمكن الحذف إذا كان يحتوي على أصناف.")) return;
    deleteWarehouseMutation.mutate(id, {
      onSuccess: () => toast.success("تم حذف المستودع"),
      onError: (err) => toast.error(err.message || "تعذّر الحذف"),
    });
  };

  if (!activeCompany) return <div className="p-8 md:block md:p-12 text-center text-muted-foreground">اختر شركة</div>;

  const tabs: Array<{ key: Tab; label: string }> = [
    { key: "warehouses", label: `المستودعات (${warehouses.length})` },
    { key: "stock", label: `المخزون (${items.length})` },
  ];

  return (
    <div className="flex flex-col gap-4">
      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* HEADER SECTION                                                      */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      <div className="flex flex-col gap-3 md:flex-row md:flex-wrap md:items-center md:justify-between">
        <div>
          <h1 className="text-xl md:text-2xl font-extrabold flex items-center gap-2">
            <Boxes size={20} /> إدارة المخزون
          </h1>
          <p className="text-[13px] text-muted-foreground">{activeCompany.nameAr || activeCompany.name}</p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="inline-flex items-center justify-center gap-1.5 py-2.5 px-[18px] rounded-[10px] bg-primary text-primary-foreground border-none text-[13px] font-bold cursor-pointer max-md:min-h-[44px] hover:bg-primary/90 transition-colors duration-120"
        >
          <Plus size={16} /> {tab === "warehouses" ? "مستودع جديد" : "تعديل مخزون"}
        </button>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* KPI CARDS - DS v4.0 Design System                                   */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      {summary && (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-6 stagger-children">
          {/* إجمالي الأصناف */}
          <div className="kpi-card hover-lift">
            <Boxes size={18} className="text-primary mb-2" />
            <div className="kpi-value">{summary?.total || 0}</div>
            <div className="kpi-label">إجمالي الأصناف</div>
          </div>

          {/* مخزون OK */}
          <div className="kpi-card hover-lift">
            <CheckCircle2 size={18} className="data-primary mb-2" />
            <div className="kpi-value">{summary?.ok || 0}</div>
            <div className="kpi-label">متوفر</div>
            <div className="progress-emerald mt-2">
              <div className="progress-bar" style={{ width: `${okPercent}%` }}></div>
            </div>
          </div>

          {/* ⚠️ GOLD KPI - مخزون منخفض (مهم!) */}
          <div className="kpi-card-gold hover-lift border-warning">
            <AlertTriangle size={18} className="text-[#d4a574] mb-2" />
            <div className="kpi-value">{summary?.low || 0}</div>
            <div className="kpi-label">منخفض</div>
            <div className="kpi-trend warning">⚠ يحتاج إعادة طلب</div>
          </div>

          {/* نفذ المخزون */}
          <div className="kpi-card hover-lift state-error-component">
            <XCircle size={18} className="text-destructive mb-2" />
            <div className="kpi-value">{summary?.out || 0}</div>
            <div className="kpi-label">نفد</div>
          </div>

          {/* عدد المستودعات */}
          <div className="kpi-card hover-lift">
            <WarehouseIcon size={18} className="data-auxiliary mb-2" />
            <div className="kpi-value">{warehouses.length}</div>
            <div className="kpi-label">المستودعات</div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* TABS NAVIGATION - Emerald Design                                     */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      <div className="flex gap-1 p-1 bg-muted rounded-xl mb-4">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => switchTab(t.key)}
            className={cn(
              "flex-1 px-4 py-2.5 rounded-lg text-sm font-medium transition-all duration-120",
              tab === t.key
                ? "bg-primary text-white shadow-brand-sm"
                : "text-muted-foreground hover:bg-sidebar-accent"
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* LOADING STATE - DS v4.0                                              */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      {loading ? (
        <GarfixLoadingState 
          message="جارٍ تحميل بيانات المخزون..." 
          variant="skeleton"
          skeletonLines={5}
        />
      ) : showForm ? (
        /* ═════════════════════════════════════════════════════════════ */
        /* FORMS SECTION                                                */
        /* ═════════════════════════════════════════════════════════════ */
        tab === "warehouses" ? (
          <WarehouseForm
            company={activeCompany}
            onClose={() => setShowForm(false)}
            onSaved={() => { setShowForm(false); warehousesQuery.refetch(); }}
          />
        ) : (
          <AdjustStockForm
            company={activeCompany}
            warehouses={warehouses}
            products={products}
            onClose={() => setShowForm(false)}
            onSaved={() => { setShowForm(false); itemsQuery.refetch(); }}
          />
        )
      ) : (
        /* ═════════════════════════════════════════════════════════════ */
        /* TABLES & CONTENT SECTION                                    */
        /* ═════════════════════════════════════════════════════════════ */
        <div className="space-y-4">
          {/* AI Suggestion for Low Stock */}
          {tab === "stock" && lowStockItems.length > 0 && (
            <div className="ai-suggestion">
              <Sparkles className="ai-suggestion-icon" />
              <div>
                <p className="font-semibold text-sm">توصية ذكية: إعادة طلب</p>
                <p className="text-xs text-muted-foreground">
                  لديك {lowStockItems.length} منتجات وصلت لحد الطلب.
                  <button 
                    className="text-primary underline ms-1 hover:text-primary/80 transition-colors"
                    onClick={() => setTab("stock")}
                  >
                    عرض القائمة
                  </button>
                </p>
              </div>
            </div>
          )}

          {/* Warehouses Table */}
          {tab === "warehouses" && (
            <>
              {warehouses.length === 0 ? (
                <GarfixEmptyState
                  title="لا توجد مستودعات"
                  description="ابدأ بإنشاء أول مستودع لإدارة مخزونك بكفاءة"
                  illustration="folder"
                  action={{
                    label: "إنشاء مستودع",
                    onClick: () => setShowForm(true),
                    variant: "primary"
                  }}
                  className="py-12"
                />
              ) : (
                <GarfixEnterpriseTable
                  data={warehouses as  Record<string, unknown>[]}
                  columns={[
                    { key: 'code', label: 'الكود', pinned: true },
                    { key: 'name', label: 'اسم المستودع' },
                    { key: 'address', label: 'العنوان' },
                    {
                      key: 'isActive',
                      label: 'الحالة',
                      render: (val) => (
                        <span className={`table-row-status ${val ? 'active' : 'archived'}`}>
                          {val ? 'نشط' : 'معطل'}
                        </span>
                      )
                    },
                    { key: 'itemCount', label: 'عدد الأصناف' }
                  ]}
                  density="comfortable"
                  emptyMessage="لا توجد مستودعات"
                  emptyDescription="لم يتم العثور على أي مستودعات لعرضها"
                />
              )}
              
              {/* Pagination for Warehouses */}
              {warehouses.length > PAGE_SIZE && (
                <div className="flex justify-center py-4">
                  <PaginationInfo
                    currentPage={currentPage}
                    totalItems={warehouses.length}
                    pageSize={PAGE_SIZE}
                    onPageChange={setCurrentPage}
                  />
                </div>
              )}
            </>
          )}

          {/* Stock Table */}
          {tab === "stock" && (
            <>
              {items.length === 0 ? (
                <GarfixEmptyState
                  title="لا توجد أصناف مخزنية"
                  description="أضف أصناف للمستودعات لمتابعة المخزون"
                  illustration="folder"
                  action={{
                    label: "إضافة صنف",
                    onClick: () => setShowForm(true),
                    variant: "primary"
                  }}
                  className="py-12"
                />
              ) : (
                <GarfixEnterpriseTable
                  data={items as  Record<string, unknown>[]}
                  columns={[
                    { key: 'productName', label: 'المنتج', pinned: true },
                    { key: 'warehouseName', label: 'المستودع' },
                    { key: 'quantity', label: 'الكمية' },
                    {
                      key: 'status',
                      label: 'الحالة',
                      render: (val) => {
                        const classes: Record<string, string> = { OK: 'active', Low: 'pending warning', Out: 'error' };
                        const labels: Record<string, string> = { OK: 'متوفر', Low: 'منخفض', Out: 'نفد' };
                        return (
                          <span className={`table-row-status ${classes[val as string] || 'active'}`}>
                            {labels[val as string] || String(val)}
                          </span>
                        );
                      }
                    },
                    { key: 'reorderLevel', label: 'حد الطلب' },
                  ]}
                  rowStatus={(row) => row.status === 'Low' ? 'pending' : row.status === 'Out' ? 'error' : 'active'}
                  density="compact"
                  emptyMessage="لا توجد أصناف"
                  emptyDescription="لم يتم العثور على أي أصناف مخزنية"
                />
              )}

              {/* Pagination for Stock */}
              {items.length > PAGE_SIZE && (
                <div className="flex justify-center py-4">
                  <PaginationInfo
                    currentPage={currentPage}
                    totalItems={items.length}
                    pageSize={PAGE_SIZE}
                    onPageChange={setCurrentPage}
                  />
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
 * PAGINATION COMPONENT
 * ════════════════════════════════════════════════════════════════════════════ */

function PaginationInfo({
  currentPage,
  totalItems,
  pageSize,
  onPageChange,
}: {
  currentPage: number;
  totalItems: number;
  pageSize: number;
  onPageChange: (page: number) => void;
}) {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const safePage = Math.min(currentPage, totalPages);

  return (
    <div className="flex flex-wrap justify-between items-center py-3 px-4 border border-border rounded-lg bg-card gap-2">
      <span className="text-[12px] text-muted-foreground">
        صفحة {safePage} من {totalPages} ({totalItems} عنصر)
      </span>
      <div className="flex items-center gap-1.5">
        <button
          onClick={() => onPageChange(Math.max(1, safePage - 1))}
          disabled={safePage === 1}
          className={cn(
            "py-1.5 px-3 rounded-[6px] text-[12px] font-bold transition-all duration-120",
            safePage === 1
              ? "bg-transparent text-muted-foreground border border-border cursor-not-allowed opacity-50"
              : "bg-card text-foreground border border-border cursor-pointer hover:bg-primary hover:text-white"
          )}
        >
          السابق
        </button>
        <button
          onClick={() => onPageChange(Math.min(totalPages, safePage + 1))}
          disabled={safePage === totalPages}
          className={cn(
            "py-1.5 px-3 rounded-[6px] text-[12px] font-bold transition-all duration-120",
            safePage === totalPages
              ? "bg-transparent text-muted-foreground border border-border cursor-not-allowed opacity-50"
              : "bg-card text-foreground border border-border cursor-pointer hover:bg-primary hover:text-white"
          )}
        >
          التالي
        </button>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
 * WAREHOUSE FORM - DS v4.0 Styled
 * ════════════════════════════════════════════════════════════════════════════ */

function WarehouseForm({ company, onClose, onSaved }: { company: { slug: string }; onClose: () => void; onSaved: () => void }) {
  const createWarehouseMutation = useCreateWarehouse();
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [address, setAddress] = useState("");
  const [isActive, setIsActive] = useState(true);

  const submit = async () => {
    if (!name || !code) { toast.error("الاسم والكود مطلوبان"); return; }
    try {
      await createWarehouseMutation.mutateAsync({ companySlug: company.slug, name, code, address, isActive });
      toast.success("تم إنشاء المستودع");
      onSaved();
    } catch (err) { toast.error(err instanceof Error ? err.message : "خطأ"); }
  };

  const saving = createWarehouseMutation.isPending;

  return (
    <div className="flex flex-col gap-4">
      <div className="bg-card rounded-xl border border-border p-5 flex flex-col gap-3.5 shadow-sm">
        <h3 className="text-[15px] font-bold flex items-center gap-2 text-foreground">
          <WarehouseIcon size={16} className="text-primary" /> مستودع جديد
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-[11px] font-semibold text-muted-foreground mb-1">الاسم *</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full py-2 px-3 rounded-lg bg-background border border-border text-foreground text-[13px] outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all duration-120"
              placeholder="مثال: المستودع الرئيسي"
            />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-muted-foreground mb-1">الكود *</label>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="w-full py-2 px-3 rounded-lg bg-background border border-border text-foreground text-[13px] outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all duration-120"
              dir="ltr"
              placeholder="مثال: WH-01"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-[11px] font-semibold text-muted-foreground mb-1">العنوان</label>
            <input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className="w-full py-2 px-3 rounded-lg bg-background border border-border text-foreground text-[13px] outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all duration-120"
            />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-muted-foreground mb-1">الحالة</label>
            <select
              value={isActive ? "1" : "0"}
              onChange={(e) => setIsActive(e.target.value === "1")}
              className="w-full py-2 px-3 rounded-lg bg-background border border-border text-foreground text-[13px] outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all duration-120"
            >
              <option value="1">نشط</option>
              <option value="0">موقوف</option>
            </select>
          </div>
        </div>
      </div>
      <div className="flex gap-2.5 justify-end">
        <button
          onClick={onClose}
          className="py-2.5 px-5 rounded-lg bg-transparent text-muted-foreground border border-border text-[13px] font-bold cursor-pointer max-md:min-h-[44px] hover:bg-muted transition-all duration-120"
        >
          إلغاء
        </button>
        <button
          onClick={submit}
          disabled={saving}
          className="py-2.5 px-6 rounded-lg bg-primary text-primary-foreground border-none text-[13px] font-extrabold cursor-pointer disabled:cursor-not-allowed disabled:opacity-70 max-md:min-h-[44px] hover:bg-primary/90 transition-all duration-120"
        >
          {saving ? "جارٍ…" : "حفظ"}
        </button>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
 * ADJUST STOCK FORM - DS v4.0 Styled
 * ════════════════════════════════════════════════════════════════════════════ */

function AdjustStockForm({
  company, warehouses, products, onClose, onSaved,
}: {
  company: { slug: string };
  warehouses: Warehouse[];
  products: Product[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const createItemMutation = useCreateInventoryItem();
  const [warehouseId, setWarehouseId] = useState<number | null>(warehouses[0]?.id ?? null);
  const [productId, setProductId] = useState<string | null>(products[0]?.id ?? null);
  const [mode, setMode] = useState<"set" | "adjust">("set");
  const [quantity, setQuantity] = useState("0");
  const [reorderLevel, setReorderLevel] = useState("0");
  const [reorderQty, setReorderQty] = useState("0");
  const [batchNumber, setBatchNumber] = useState("");
  const [expiryDate, setExpiryDate] = useState("");

  const submit = async () => {
    if (!warehouseId || !productId) { toast.error("اختر المستودع والمنتج"); return; }
    try {
      await createItemMutation.mutateAsync({
        companySlug: company.slug,
        warehouseId,
        productId: Number(productId),
        mode,
        quantity: Number(quantity),
        reorderLevel: Number(reorderLevel),
        reorderQty: Number(reorderQty),
        batchNumber: batchNumber || null,
        expiryDate: expiryDate || null,
      } as  any);
      toast.success(mode === "set" ? "تم تحديد المخزون" : "تم تعديل المخزون");
      onSaved();
    } catch (err) { toast.error(err instanceof Error ? err.message : "خطأ"); }
  };

  const saving = createItemMutation.isPending;

  if (warehouses.length === 0) {
    return (
      <GarfixErrorState
        title="لا يوجد مستودعات"
        message="أنشئ مستودعاً أولاً قبل إضافة أصناف."
        severity="warning"
        className="py-8"
      />
    );
  }

  if (products.length === 0) {
    return (
      <GarfixErrorState
        title="لا يوجد منتجات"
        message="أنشئ منتجاً في كتالوج المنتجات أولاً."
        severity="warning"
        className="py-8"
      />
    );
  }

  return (
    <div className="flex flex-col gap-4 w-full md:max-w-3xl">
      <div className="bg-card rounded-xl border border-border p-5 flex flex-col gap-3.5 shadow-sm">
        <h3 className="text-[15px] font-bold flex items-center gap-2 text-foreground">
          <ArrowDownUp size={16} className="text-primary" /> تعديل المخزون
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-[11px] font-semibold text-muted-foreground mb-1">المستودع *</label>
            <select
              value={warehouseId ?? ""}
              onChange={(e) => setWarehouseId(Number(e.target.value))}
              className="w-full py-2 px-3 rounded-lg bg-background border border-border text-foreground text-[13px] outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all duration-120"
            >
              {warehouses.map((w) => <option key={w.id} value={w.id}>{w.code} — {w.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-muted-foreground mb-1">المنتج *</label>
            <select
              value={productId ?? ""}
              onChange={(e) => setProductId(e.target.value)}
              className="w-full py-2 px-3 rounded-lg bg-background border border-border text-foreground text-[13px] outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all duration-120"
            >
              {products.map((p) => <option key={p.id} value={p.id}>{p.code ? `${p.code} — ` : ""}{p.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-muted-foreground mb-1">طريقة التعديل</label>
            <select
              value={mode}
              onChange={(e) => setMode(e.target.value as "set" | "adjust")}
              className="w-full py-2 px-3 rounded-lg bg-background border border-border text-foreground text-[13px] outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all duration-120"
            >
              <option value="set">تعيين القيمة (مطلق)</option>
              <option value="adjust">إضافة/خصم (نسبي)</option>
            </select>
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-muted-foreground mb-1">
              {mode === "set" ? "الكمية الجديدة *" : "مقدار التعديل (+/-) *"}
            </label>
            <input
              type="number"
              step="any"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              className="w-full py-2 px-3 rounded-lg bg-background border border-border text-foreground text-[13px] outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all duration-120"
              dir="ltr"
            />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-muted-foreground mb-1">حد إعادة الطلب</label>
            <input
              type="number"
              step="any"
              value={reorderLevel}
              onChange={(e) => setReorderLevel(e.target.value)}
              className="w-full py-2 px-3 rounded-lg bg-background border border-border text-foreground text-[13px] outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all duration-120"
              dir="ltr"
            />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-muted-foreground mb-1">كمية إعادة الطلب</label>
            <input
              type="number"
              step="any"
              value={reorderQty}
              onChange={(e) => setReorderQty(e.target.value)}
              className="w-full py-2 px-3 rounded-lg bg-background border border-border text-foreground text-[13px] outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all duration-120"
              dir="ltr"
            />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-muted-foreground mb-1">رقم الدفعة</label>
            <input
              value={batchNumber}
              onChange={(e) => setBatchNumber(e.target.value)}
              className="w-full py-2 px-3 rounded-lg bg-background border border-border text-foreground text-[13px] outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all duration-120"
              dir="ltr"
            />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-muted-foreground mb-1">تاريخ الانتهاء</label>
            <input
              type="date"
              value={expiryDate}
              onChange={(e) => setExpiryDate(e.target.value)}
              className="w-full py-2 px-3 rounded-lg bg-background border border-border text-foreground text-[13px] outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all duration-120"
              dir="ltr"
            />
          </div>
        </div>
      </div>
      <div className="flex gap-2.5 justify-end">
        <button
          onClick={onClose}
          className="py-2.5 px-5 rounded-lg bg-transparent text-muted-foreground border border-border text-[13px] font-bold cursor-pointer max-md:min-h-[44px] hover:bg-muted transition-all duration-120"
        >
          إلغاء
        </button>
        <button
          onClick={submit}
          disabled={saving}
          className="py-2.5 px-6 rounded-lg bg-primary text-primary-foreground border-none text-[13px] font-extrabold cursor-pointer disabled:cursor-not-allowed disabled:opacity-70 max-md:min-h-[44px] hover:bg-primary/90 transition-all duration-120"
        >
          {saving ? "جارٍ…" : "حفظ"}
        </button>
      </div>
    </div>
  );
}

export default InventoryView;

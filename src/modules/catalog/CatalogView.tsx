"use client";

import { useState, useMemo } from "react";
import { useBrand } from "@/context/BrandContext";
import { useCatalog, useDeleteCatalogItem, useUpdateCatalogItem, useCreateCatalogItem } from "@/hooks/queries";
import type { CreateCatalogItemPayload } from "@/hooks/queries/catalog";
import { toast } from "sonner";
import { 
  Plus, Search, Package, Trash2, Edit2, X, Loader2,
  DollarSign, CheckCircle, BarChart3
} from "lucide-react";
import { cn, paginate } from "@/lib/utils";

// DS v4.0 Components
import { 
  GarfixEnterpriseTable, 
  GarfixBulkActions,
  type EnterpriseColumn 
} from '@/components/ui/index-garfix-ds'
import { 
  GarfixEmptyState, 
  GarfixLoadingState 
} from '@/components/ui/index-garfix-ds'

const PAGE_SIZE = 20;

interface Product {
  id: number;
  code: string | null;
  name: string;
  aliases: string[];
  purchasePrice: number | null;
  sellingPrice: number | null;
  companySlug: string;
  [key: string]: unknown;
}

const inputStyle = "w-full py-2 px-3 rounded-lg bg-background border border-border text-foreground text-[13px] outline-none focus-ring max-md:min-h-[44px] transition-all duration-150";
const labelStyle = "block text-[11px] font-semibold text-muted-foreground mb-1";

// ── Sparkline Component for KPI Cards ──────────────────────────────────
function Sparkline({ data, color = "#047857" }: { data: number[]; color?: string }) {
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  
  const points = data.map((val, i) => {
    const x = (i / (data.length - 1)) * 100;
    const y = 100 - ((val - min) / range) * 100;
    return `${x},${y}`;
  }).join(" ");
  
  return (
    <svg className="sparkline-container w-full h-8" viewBox="0 0 100 40" preserveAspectRatio="none">
      <polyline
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
        points={points}
      />
      {/* Gradient fill */}
      <defs>
        <linearGradient id={`spark-${color.replace('#', '')}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon
        fill={`url(#spark-${color.replace('#', '')})`}
        points={`0,40 ${points} 100,40`}
      />
    </svg>
  );
}

export function CatalogView() {
  const { activeCompany } = useBrand();
  const [search, setSearch] = useState("");
  const { data, isLoading, refetch } = useCatalog(activeCompany?.slug || "", search);
  const deleteMutation = useDeleteCatalogItem();

  // API returns { products: [...] }; the hook now types this correctly.
  const products: Product[] = (data?.products ?? []) as unknown as Product[];
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [currentPage, setCurrentPage] = useState(1);
  const [bulkDeleting, setBulkDeleting] = useState(false);

  // ── Computed Values for KPI Cards ────────────────────────────────────
  const totalValue = useMemo(() => {
    return products.reduce((sum, p) => sum + ((p.purchasePrice || 0) * 1), 0);
  }, [products]);
  
  const activeProducts = products.length; // All products are considered active
  
  const avgPrice = useMemo(() => {
    if (products.length === 0) return 0;
    const sum = products.reduce((s, p) => s + (p.sellingPrice || 0), 0);
    return Math.round(sum / products.length);
  }, [products]);

  // Generate mock sparkline data based on product count
  const sparklineData = useMemo(() => {
    if (products.length === 0) return [0, 5, 3, 8, 6];
    // Generate a simple trend based on product count
    const base = Math.min(products.length, 50);
    return Array.from({ length: 7 }, (_, i) => 
      base + Math.sin(i * 0.8) * (base * 0.3) + Math.random() * base * 0.2
    );
  }, [products.length]);

  const totalPages = Math.max(1, Math.ceil(products.length / PAGE_SIZE));
  const pageProducts = paginate(products, currentPage, PAGE_SIZE);
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
        await deleteMutation.mutateAsync({ id: String(id) });
        okCount++;
      } catch { failCount++; }
    }
    setBulkDeleting(false);
    setSelectedIds(new Set());
    if (okCount > 0) toast.success(`تم حذف ${okCount} منتج`);
    if (failCount > 0) toast.error(`تعذّر حذف ${failCount} منتج`);
  };

  const handleDelete = (id: number) => {
    deleteMutation.mutate({ id: String(id) }, {
      onSuccess: () => toast.success("تم الحذف"),
      onError: (err) => toast.error(err.message || "تعذّر الحذف"),
    });
  };

  // ── Table Columns Definition ────────────────────────────────────────
  const columns: EnterpriseColumn<Product>[] = [
    { 
      key: 'code', 
      label: 'الكود', 
      pinned: true,
      render: (val) => <span className="font-mono">{val ? String(val) : "—"}</span>
    },
    { 
      key: 'name', 
      label: 'اسم المنتج',
      render: (val) => <span className="font-bold">{String(val)}</span>
    },
    { 
      key: 'purchasePrice', 
      label: 'سعر الشراء',
      render: (val) => (
        <span dir="ltr" className="inline-block">
          {Number(val).toLocaleString()}
        </span>
      )
    },
    { 
      key: 'sellingPrice', 
      label: 'سعر البيع',
      render: (val) => (
        <span className="font-bold text-primary" dir="ltr">
          {Number(val).toLocaleString()}
        </span>
      )
    },
    {
      key: 'actions',
      label: 'إجراءات',
      render: (_, row) => (
        <div className="flex gap-1">
          <button 
            onClick={(e) => { e.stopPropagation(); setEditing(row); }} 
            title="تعديل"
            className="hover-scale active-press p-1.5 rounded-md bg-primary/10 text-primary transition-all duration-120"
          >
            <Edit2 size={14} />
          </button>
          <button 
            onClick={(e) => { e.stopPropagation(); handleDelete(row.id); }} 
            title="حذف"
            disabled={deleteMutation.isPending && deleteMutation.variables?.id === String(row.id)}
            className="hover-scale active-press p-1.5 rounded-md bg-destructive/10 text-destructive transition-all duration-120 disabled:opacity-50"
          >
            <Trash2 size={14} />
          </button>
        </div>
      )
    }
  ];

  if (!activeCompany) return (
    <div className="p-8 md:p-12 text-center text-muted-foreground flex items-center justify-center min-h-[400px]">
      اختر شركة
    </div>
  );
  
  if (showForm || editing) return (
    <ProductForm 
      company={activeCompany} 
      editing={editing} 
      onClose={() => { setShowForm(false); setEditing(null); }} 
      onSaved={() => { setShowForm(false); setEditing(null); refetch(); }} 
    />
  );

  return (
    <div className="flex flex-col gap-4 animate-in fade-in slide-in-from-bottom-4 duration-300">
      {/* ── Header Section ─────────────────────────────────────────────── */}
      <div className="flex flex-wrap justify-between items-center gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">المنتجات</h1>
          <p className="text-[13px] text-muted-foreground mt-0.5">{products.length} منتج</p>
        </div>
        <button 
          onClick={() => setShowForm(true)} 
          className="active-press inline-flex items-center gap-1.5 px-[18px] py-2.5 rounded-lg bg-primary text-primary-foreground border-none font-bold text-[13px] hover-lift max-md:min-h-[44px] transition-all duration-150 shadow-sm hover:shadow-md"
        >
          <Plus size={16} /> منتج جديد
        </button>
      </div>

      {/* ── KPI Cards Section (DS v4.0) ───────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 stagger-children">
        {/* Total Products KPI */}
        <div className="kpi-card hover-lift transition-all duration-120">
          <Package size={18} className="text-primary mb-2" />
          <div className="kpi-value">{products.length}</div>
          <div className="kpi-label">إجمالي المنتجات</div>
          <div className="mt-2">
            <Sparkline data={sparklineData} color="#047857" />
          </div>
        </div>

        {/* GOLD KPI - Total Inventory Value */}
        <div className="kpi-card-gold hover-lift transition-all duration-120">
          <DollarSign size={18} className="text-[#d4a574] mb-2" />
          <div className="kpi-value">{totalValue.toLocaleString()}</div>
          <div className="kpi-label">قيمة المخزون</div>
          <div className="kpi-badge mt-2">✦ مالي</div>
        </div>

        {/* Active Products KPI */}
        <div className="kpi-card hover-lift transition-all duration-120">
          <CheckCircle size={18} className="data-primary mb-2" />
          <div className="kpi-value">{activeProducts}</div>
          <div className="kpi-label">منتجات نشطة</div>
        </div>

        {/* Average Price KPI */}
        <div className="kpi-card hover-lift transition-all duration-120">
          <BarChart3 size={18} className="data-secondary mb-2" />
          <div className="kpi-value">{avgPrice.toLocaleString()}</div>
          <div className="kpi-label">متوسط السعر</div>
        </div>
      </div>

      {/* ── Search with AI Badge ──────────────────────────────────────── */}
      <div className="relative">
        <Search size={16} className="absolute end-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
        <input 
          placeholder="بحث بالاسم أو الكود…" 
          value={search} 
          onChange={(e) => setSearch(e.target.value)} 
          className="focus-ring w-full py-2.5 pe-10 ps-12 rounded-lg bg-card border border-border text-foreground text-[13px] outline-none max-md:min-h-[44px] transition-all duration-150 placeholder:text-muted-foreground/60" 
        />
        <span className="ai-badge absolute start-3 top-1/2 -translate-y-1/2 hidden sm:inline-flex items-center justify-center px-2 py-0.5 rounded text-[10px] font-bold tracking-wider">
          AI
        </span>
      </div>

      {/* ── Bulk Actions Bar (DS v4.0) ───────────────────────────────── */}
      {selectedIds.size > 0 && (
        <GarfixBulkActions
          selectedCount={selectedIds.size}
          actions={[
            { 
              label: "حذف المحدد", 
              icon: <Trash2 size={14} />, 
              onClick: handleBulkDelete, 
              variant: "danger" 
            },
          ]}
          onClearSelection={() => setSelectedIds(new Set())}
        />
      )}

      {/* ── Main Content Area ────────────────────────────────────────── */}
      <div className="bg-card rounded-xl border border-border overflow-hidden shadow-sm">
        {isLoading ? (
          /* Loading State */
          <div className="p-8 md:p-12">
            <GarfixLoadingState message="جارٍ تحميل الكتالوج..." variant="skeleton" skeletonLines={6} />
          </div>
        ) : products.length === 0 ? (
          /* Empty State */
          <div className="p-8 md:p-12">
            <GarfixEmptyState
              title="لا توجد منتجات"
              description="ابدأ بإضافة منتجك الأول إلى الكتالوج"
              illustration="folder"
              action={{ label: "منتج جديد", onClick: () => setShowForm(true) }}
            />
          </div>
        ) : (
          <>
            {/* Enterprise Table (DS v4.0) */}
            <GarfixEnterpriseTable<Product>
              data={pageProducts}
              columns={columns}
              density="default"
              selectedRows={new Set(pageProducts.map(p => p.id).filter(id => selectedIds.has(id)))}
              onSelectionChange={(selection) => {
                // Map index-based selection to ID-based selection
                const newSelected = new Set<number>();
                selection.forEach(idx => {
                  newSelected.add(pageProducts[idx].id);
                });
                setSelectedIds(newSelected);
              }}
              emptyMessage="لا توجد منتجات"
              emptyDescription="لم يتم العثور على منتجات لعرضها"
              className="rounded-none border-0"
            />

            {/* Pagination */}
            <div className="flex flex-wrap justify-between items-center px-4 py-3 border-t border-border gap-2 bg-muted/30">
              <span className="text-xs text-muted-foreground">
                صفحة {safePage} من {totalPages} ({products.length} منتج)
              </span>
              <div className="flex items-center gap-1.5">
                <button 
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))} 
                  disabled={safePage === 1}
                  className={cn(
                    "active-press px-3 py-1.5 rounded-lg border border-border font-bold text-xs max-md:min-h-[44px] transition-all duration-150",
                    safePage === 1 
                      ? "bg-transparent text-muted-foreground cursor-not-allowed opacity-50" 
                      : "bg-card text-foreground hover:bg-accent hover-scale"
                  )}
                >
                  السابق
                </button>
                <button 
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))} 
                  disabled={safePage === totalPages}
                  className={cn(
                    "active-press px-3 py-1.5 rounded-lg border border-border font-bold text-xs max-md:min-h-[44px] transition-all duration-150",
                    safePage === totalPages 
                      ? "bg-transparent text-muted-foreground cursor-not-allowed opacity-50" 
                      : "bg-card text-foreground hover:bg-accent hover-scale"
                  )}
                >
                  التالي
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════
// PRODUCT FORM COMPONENT (Preserved with DS v4.0 styling)
// ══════════════════════════════════════════════════════════════════════

function ProductForm({ company, editing, onClose, onSaved }: { company: { slug: string }; editing: Product | null; onClose: () => void; onSaved: () => void }) {
  const [code, setCode] = useState(editing?.code || "");
  const [name, setName] = useState(editing?.name || "");
  const [aliases, setAliases] = useState((editing?.aliases || []).join(", "));
  const [purchasePrice, setPurchasePrice] = useState(editing?.purchasePrice?.toString() || "");
  const [sellingPrice, setSellingPrice] = useState(editing?.sellingPrice?.toString() || "");

  const createMutation = useCreateCatalogItem();
  const updateMutation = useUpdateCatalogItem();

  const submit = async () => {
    if (!name) { toast.error("الاسم مطلوب"); return; }
    const payload: Record<string, unknown> = {
      code, name,
      aliases: aliases.split(",").map((s) => s.trim()).filter(Boolean),
      purchasePrice: purchasePrice || undefined,
      sellingPrice: sellingPrice || undefined,
      companySlug: company.slug,
    };
    try {
      if (editing) {
        await updateMutation.mutateAsync({ id: String(editing.id), ...payload });
        toast.success("تم التحديث");
      } else {
        await createMutation.mutateAsync(payload as CreateCatalogItemPayload);
        toast.success("تم الإنشاء");
      }
      onSaved();
    } catch (err) { toast.error(err instanceof Error ? err.message : "خطأ"); }
  };

  const saving = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="flex flex-col gap-4 animate-in fade-in slide-in-from-right-4 duration-220">
      {/* Form Header */}
      <div className="flex justify-between items-center">
        <h1 className="text-[22px] font-extrabold tracking-tight">
          {editing ? "تعديل منتج" : "منتج جديد"}
        </h1>
        <button 
          onClick={onClose} 
          className="active-press bg-transparent border border-border text-muted-foreground px-3 py-2 rounded-lg cursor-pointer text-xs inline-flex items-center gap-1 max-md:min-h-[44px] hover-scale transition-all duration-150"
        >
          <X size={14} /> إغلاق
        </button>
      </div>

      {/* Form Body */}
      <div className="bg-card rounded-xl border border-border p-5 flex flex-col gap-3.5 shadow-sm">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div>
            <label className={labelStyle}>الكود</label>
            <input 
              value={code} 
              onChange={(e) => setCode(e.target.value)} 
              className={inputStyle} 
              dir="ltr" 
            />
          </div>
          <div>
            <label className={labelStyle}>الاسم *</label>
            <input 
              value={name} 
              onChange={(e) => setName(e.target.value)} 
              className={`${inputStyle} focus:border-primary/50`} 
            />
          </div>
          <div>
            <label className={labelStyle}>سعر الشراء</label>
            <input 
              type="number" 
              value={purchasePrice} 
              onChange={(e) => setPurchasePrice(e.target.value)} 
              className={inputStyle} 
              dir="ltr" 
            />
          </div>
          <div>
            <label className={labelStyle}>سعر البيع</label>
            <input 
              type="number" 
              value={sellingPrice} 
              onChange={(e) => setSellingPrice(e.target.value)} 
              className={inputStyle} 
              dir="ltr" 
            />
          </div>
        </div>
        <div>
          <label className={labelStyle}>الأسماء البديلة (افصل بفواصل)</label>
          <input 
            value={aliases} 
            onChange={(e) => setAliases(e.target.value)} 
            className={inputStyle} 
            placeholder="اسم بديل 1، اسم بديل 2" 
          />
        </div>
      </div>

      {/* Form Actions */}
      <div className="flex gap-2.5 justify-end">
        <button 
          onClick={onClose} 
          className="active-press px-5 py-2.5 rounded-lg bg-transparent text-muted-foreground border border-border font-bold text-[13px] cursor-pointer max-md:min-h-[44px] hover-scale transition-all duration-150"
        >
          إلغاء
        </button>
        <button 
          onClick={submit} 
          disabled={saving} 
          className="active-press px-6 py-2.5 rounded-lg bg-primary text-primary-foreground border-none font-extrabold text-[13px] cursor-pointer disabled:cursor-not-allowed disabled:opacity-70 max-md:min-h-[44px] hover-lift transition-all duration-150 shadow-sm hover:shadow-md"
        >
          {saving ? (
            <span className="flex items-center gap-2">
              <Loader2 size={14} className="animate-spin" /> جارٍ…
            </span>
          ) : (
            "حفظ"
          )}
        </button>
      </div>
    </div>
  );
}

export default CatalogView;

"use client";

import { useState, useMemo } from "react";
import { useBrand } from "@/context/BrandContext";
import { usePurchases, useDeletePurchase, useCreatePurchase } from "@/hooks/queries";
import type { CreatePurchasePayload } from "@/hooks/queries/dashboard";
import { toast } from "sonner";
import { Plus, ShoppingCart, Trash2, X, DollarSign, Package, Users } from "lucide-react";
import { cn, paginate } from "@/lib/utils";

// DS v4.0 Components
import {
  GarfixEnterpriseTable,
  GarfixBulkActions,
  GarfixConfirmDialog,
  GarfixEmptyState,
  GarfixLoadingState,
} from "@/components/ui/index-garfix-ds";

const PAGE_SIZE = 20;

interface PurchaseItem { description: string; qty: number; price: number; }
interface Purchase {
  id: number; num: string; date: string; supplier: string;
  items: PurchaseItem[]; totalQty: number; notes?: string;
  [key: string]: unknown;
}

const inputStyle = "w-full py-2 px-3 rounded-sm bg-background border border-border text-foreground text-[13px] outline-none max-md:min-h-[44px]";
const labelStyle = "block text-[11px] font-semibold text-muted-foreground mb-1";

export function PurchasesView() {
  const { activeCompany } = useBrand();
  const { data, isLoading, refetch } = usePurchases(activeCompany?.slug || "");
  const deleteMutation = useDeletePurchase();

  const purchases: Purchase[] = (data?.purchases ?? []) as unknown as Purchase[];
  const [showForm, setShowForm] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [currentPage, setCurrentPage] = useState(1);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  
  // Confirm Dialog State
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [showBulkConfirm, setShowBulkConfirm] = useState(false);

  // ── KPI Calculations ──────────────────────────────────────────────
  const kpiData = useMemo(() => {
    const totalPurchases = purchases.reduce((sum, p) => {
      return sum + (p.items?.reduce((itemSum: number, item: PurchaseItem) => 
        itemSum + (item.qty * item.price), 0) || 0);
    }, 0);
    
    const totalQty = purchases.reduce((sum, p) => sum + (p.totalQty || 0), 0);
    
    const uniqueSuppliers = new Set(purchases.map(p => p.supplier).filter(Boolean)).size;
    
    return {
      totalPurchases,
      totalQty,
      uniqueSuppliers,
    };
  }, [purchases]);

  const totalPages = Math.max(1, Math.ceil(purchases.length / PAGE_SIZE));
  const pagePurchases = paginate(purchases, currentPage, PAGE_SIZE);
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

  // ── Bulk Delete with Confirmation ─────────────────────────────────
  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    setShowBulkConfirm(true);
  };

  const confirmBulkDelete = async () => {
    setBulkDeleting(true);
    let okCount = 0, failCount = 0;
    for (const id of selectedIds) {
      try {
        await deleteMutation.mutateAsync(id);
        okCount++;
      } catch { failCount++; }
    }
    setBulkDeleting(false);
    setShowBulkConfirm(false);
    setSelectedIds(new Set());
    if (okCount > 0) toast.success(`تم حذف ${okCount} فاتورة شراء`);
    if (failCount > 0) toast.error(`تعذّر حذف ${failCount} فاتورة شراء`);
  };

  // ── Single Delete with Confirmation ───────────────────────────────
  const handleDelete = (id: number) => {
    setDeleteId(id);
  };

  const confirmDelete = () => {
    if (deleteId === null) return;
    deleteMutation.mutate(deleteId, {
      onSuccess: () => {
        toast.success("تم الحذف");
        setDeleteId(null);
      },
      onError: (err) => {
        toast.error(err.message || "تعذّر الحذف");
        setDeleteId(null);
      },
    });
  };

  if (!activeCompany) return <div className="p-8 md:p-12 text-center text-muted-foreground">اختر شركة</div>;
  if (showForm) return <PurchaseForm company={activeCompany} onClose={() => setShowForm(false)} onSaved={() => { setShowForm(false); refetch(); }} />;

  return (
    <div className="flex flex-col gap-4">
      {/* ── Header ─────────────────────────────────────────────── */}
      <div className="flex flex-wrap justify-between items-center gap-3">
        <div>
          <h1 className="text-2xl font-extrabold">المشتريات</h1>
          <p className="text-[13px] text-muted-foreground">{purchases.length} فاتورة شراء</p>
        </div>
        <button 
          onClick={() => setShowForm(true)} 
          className="inline-flex items-center gap-1.5 px-[18px] py-2.5 rounded-md bg-primary text-primary-foreground border-none font-bold text-[13px] cursor-pointer max-md:min-h-[44px] hover-scale active-press"
        >
          <Plus size={16} /> فاتورة شراء جديدة
        </button>
      </div>

      {/* ── KPI Cards Section ───────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6 stagger-children">
        {/* إجمالي فواتير الشراء */}
        <div className="kpi-card hover-lift">
          <ShoppingCart size={18} className="text-primary mb-2" />
          <div className="kpi-value">{purchases.length}</div>
          <div className="kpi-label">فواتير الشراء</div>
        </div>

        {/* ⚠️ GOLD KPI - إجمالي المشتريات */}
        <div className="kpi-card-gold hover-lift">
          <DollarSign size={18} className="text-[#d4a574] mb-2" />
          <div className="kpi-value" dir="ltr">{kpiData.totalPurchases.toLocaleString()}</div>
          <div className="kpi-label">إجمالي المشتريات</div>
          <div className="kpi-badge">✦ مالي</div>
        </div>

        {/* إجمالي الكميات */}
        <div className="kpi-card hover-lift">
          <Package size={18} className="data-secondary mb-2" />
          <div className="kpi-value" dir="ltr">{kpiData.totalQty.toLocaleString()}</div>
          <div className="kpi-label">إجمالي الكميات</div>
        </div>

        {/* عدد الموردين */}
        <div className="kpi-card hover-lift">
          <Users size={18} className="data-auxiliary mb-2" />
          <div className="kpi-value">{kpiData.uniqueSuppliers}</div>
          <div className="kpi-label">الموردون</div>
        </div>
      </div>

      {/* ── Bulk Actions Bar ────────────────────────────────────── */}
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

      {/* ── Main Content Area ───────────────────────────────────── */}
      <div className="bg-card rounded-[14px] border border-border overflow-hidden">
        {isLoading ? (
          <GarfixLoadingState message="جارٍ تحميل الفواتير..." variant="skeleton" />
        ) : purchases.length === 0 ? (
          <GarfixEmptyState
            illustration="inbox"
            title="لا توجد فواتير شراء"
            description="ابدأ بإنشاء فاتورة شراء جديدة لتتبع مشترياتك"
            action={{ label: "إنشاء فاتورة شراء", onClick: () => setShowForm(true) }}
          />
        ) : (
          <GarfixEnterpriseTable
            data={pagePurchases}
            columns={[
              { key: 'num', label: 'رقم الفاتورة', pinned: true },
              { key: 'date', label: 'التاريخ' },
              { key: 'supplier', label: 'المورد' },
              { 
                key: 'totalQty', 
                label: 'الكمية',
                render: (val) => <span dir="ltr">{Number(val).toLocaleString()}</span>
              },
              {
                key: 'total',
                label: 'الإجمالي',
                render: (_, row) => (
                  <span className="font-bold text-primary" dir="ltr">
                    {row.items?.reduce((sum: number, item: PurchaseItem) => sum + (item.qty * item.price), 0).toLocaleString()}
                  </span>
                )
              },
              {
                key: 'actions',
                label: 'إجراءات',
                render: (_, row) => (
                  <div className="flex gap-1">
                    <button 
                      onClick={() => handleDelete(row.id)}
                      disabled={deleteMutation.isPending}
                      className="hover-scale active-press p-1.5 rounded-md bg-destructive/10 text-destructive disabled:opacity-50"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                )
              }
            ]}
            selectedRows={selectedIds}
            onSelectionChange={setSelectedIds}
            density="comfortable"
          />
        )}
        
        {/* Pagination - Only show when not loading and has data */}
        {!isLoading && purchases.length > 0 && (
          <div className="flex flex-wrap justify-between items-center px-4 py-3 border-t border-border gap-2">
            <span className="text-xs text-muted-foreground">صفحة {safePage} من {totalPages} ({purchases.length} فاتورة شراء)</span>
            <div className="flex items-center gap-1.5">
              <button 
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))} 
                disabled={safePage === 1} 
                className={cn(
                  "px-3 py-1.5 rounded-sm border border-border font-bold text-xs max-md:min-h-[44px]",
                  safePage === 1 
                    ? "bg-transparent text-muted-foreground cursor-not-allowed opacity-50" 
                    : "bg-card text-foreground cursor-pointer hover:bg-accent"
                )}
              >
                السابق
              </button>
              <button 
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))} 
                disabled={safePage === totalPages} 
                className={cn(
                  "px-3 py-1.5 rounded-sm border border-border font-bold text-xs max-md:min-h-[44px]",
                  safePage === totalPages 
                    ? "bg-transparent text-muted-foreground cursor-not-allowed opacity-50" 
                    : "bg-card text-foreground cursor-pointer hover:bg-accent"
                )}
              >
                التالي
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Single Delete Confirmation Dialog ───────────────────── */}
      <GarfixConfirmDialog
        isOpen={deleteId !== null}
        title="حذف فاتورة الشراء"
        message="هل أنت متأكد من حذف هذه الفاتورة؟ لا يمكن التراجع عن هذا الإجراء."
        confirmLabel="حذف"
        cancelLabel="إلغاء"
        variant="danger"
        onConfirm={confirmDelete}
        onCancel={() => setDeleteId(null)}
      />

      {/* ── Bulk Delete Confirmation Dialog ─────────────────────── */}
      <GarfixConfirmDialog
        isOpen={showBulkConfirm}
        title="حذف الفواتير المحددة"
        message={`هل أنت متأكد من حذف ${selectedIds.size} فاتورة شراء؟ لا يمكن التراجع عن هذا الإجراء.`}
        confirmLabel={`حذف ${selectedIds.size} فاتورة`}
        cancelLabel="إلغاء"
        variant="danger"
        onConfirm={confirmBulkDelete}
        onCancel={() => setShowBulkConfirm(false)}
      />
    </div>
  );
}

function PurchaseForm({ company, onClose, onSaved }: { company: { slug: string }; onClose: () => void; onSaved: () => void }) {
  const createMutation = useCreatePurchase();
  const [num, setNum] = useState(`PUR-${Date.now().toString().slice(-6)}`);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [supplier, setSupplier] = useState("");
  const [items, setItems] = useState<PurchaseItem[]>([{ description: "", qty: 1, price: 0 }]);
  const [notes, setNotes] = useState("");

  const updateItem = (i: number, field: keyof PurchaseItem, value: string | number) => {
    setItems((arr) => arr.map((it, idx) => idx === i ? { ...it, [field]: value } : it));
  };
  const addItem = () => setItems((arr) => [...arr, { description: "", qty: 1, price: 0 }]);
  const removeItem = (i: number) => setItems((arr) => arr.filter((_, idx) => idx !== i));

  const submit = async () => {
    if (!num) { toast.error("الرقم مطلوب"); return; }
    try {
      await createMutation.mutateAsync({
        num, date, supplier,
        items: items.filter((it) => it.description),
        notes, companySlug: company.slug,
      } as unknown as CreatePurchasePayload);
      toast.success("تم إنشاء فاتورة الشراء");
      onSaved();
    } catch (err) { toast.error(err instanceof Error ? err.message : "خطأ"); }
  };

  const saving = createMutation.isPending;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-between items-center">
        <h1 className="text-[22px] font-extrabold">فاتورة شراء جديدة</h1>
        <button 
          onClick={onClose} 
          className="bg-transparent border border-border text-muted-foreground px-3 py-2 rounded-sm cursor-pointer text-xs inline-flex items-center gap-1 max-md:min-h-[44px] hover-scale"
        >
          <X size={14} /> إغلاق
        </button>
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
            <button 
              onClick={addItem} 
              className="bg-accent text-accent-foreground border border-border rounded-sm px-2.5 py-1 font-bold text-[11px] cursor-pointer inline-flex items-center gap-1 max-md:min-h-[44px] hover-scale active-press"
            >
              <Plus size={12} /> إضافة
            </button>
          </div>
          <div className="flex flex-col gap-2">
            {items.map((it, i) => (
              <div key={i} className="grid grid-cols-1 sm:grid-cols-[1fr_80px_100px_32px] gap-2">
                <input placeholder="وصف البند" value={it.description} onChange={(e) => updateItem(i, "description", e.target.value)} className={inputStyle} />
                <input type="number" placeholder="كمية" value={it.qty} onChange={(e) => updateItem(i, "qty", Number(e.target.value))} className={inputStyle} dir="ltr" />
                <input type="number" placeholder="سعر" value={it.price} onChange={(e) => updateItem(i, "price", Number(e.target.value))} className={inputStyle} dir="ltr" />
                <button 
                  onClick={() => removeItem(i)} 
                  className="bg-transparent border border-border text-destructive rounded-sm cursor-pointer flex items-center justify-center min-h-[44px] sm:min-h-0 hover-scale"
                >
                  <X size={12} />
                </button>
              </div>
            ))}
          </div>
        </div>
        <div><label className={labelStyle}>ملاحظات</label><textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className={cn(inputStyle, "resize-y")} /></div>
      </div>
      <div className="flex gap-2.5 justify-end">
        <button 
          onClick={onClose} 
          className="px-5 py-2.5 rounded-md bg-transparent text-muted-foreground border border-border font-bold text-[13px] cursor-pointer max-md:min-h-[44px] hover-scale"
        >
          إلغاء
        </button>
        <button 
          onClick={submit} 
          disabled={saving} 
          className="px-6 py-2.5 rounded-md bg-primary text-primary-foreground border-none font-extrabold text-[13px] cursor-pointer disabled:cursor-not-allowed disabled:opacity-70 max-md:min-h-[44px] hover-scale active-press"
        >
          {saving ? "جارٍ…" : "حفظ"}
        </button>
      </div>
    </div>
  );
}

export default PurchasesView;

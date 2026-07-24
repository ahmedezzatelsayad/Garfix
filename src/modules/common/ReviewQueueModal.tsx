"use client";

import { useState } from "react";
import { useProductMatchingReview, useReviewQueue, useProductMatchingConfirm, useProductMatchingUndo } from "@/hooks/queries";
import { ApiError } from "@/hooks/api-client";
import { toast } from "sonner";
import { X, RotateCcw, ListChecks, Loader2, Check } from "lucide-react";

interface ReviewItem {
  id: number;
  companySlug: string;
  inputText: string;
  matchedProductId: number | null;
  matchedAlias: string | null;
  confidence: number;
  tier: string;
  action: string;
  isUndone: boolean;
  createdAt: string;
  productName?: string | null;
  productCode?: string | null;
}

interface Props {
  companySlug: string | null;
  onClose: () => void;
}

export function ReviewQueueModal({ companySlug, onClose }: Props) {
  const [error, setError] = useState<string | null>(null);
  const [undoingId, setUndoingId] = useState<number | null>(null);
  const [confirmingId, setConfirmingId] = useState<number | null>(null);

  // Use the appropriate hook based on whether this is founder mode or per-tenant mode
  const tenantReview = useProductMatchingReview(companySlug || "");
  const founderReview = useReviewQueue();

  // Select the right query result based on mode
  const queryResult = companySlug === null ? founderReview : tenantReview;
  const items: ReviewItem[] = (queryResult.data as { items?: ReviewItem[]; data?: ReviewItem[] } | undefined)?.items ?? 
    ((queryResult.data as { data?: ReviewItem[] } | undefined)?.data ?? []);

  const loading = queryResult.isLoading;
  const refetch = queryResult.refetch;

  // Handle 403 error from the query
  if (queryResult.error instanceof ApiError && queryResult.error.status === 403) {
    setError(companySlug === null
      ? "هذه القائمة متاحة للمؤسس فقط."
      : "ليس لديك صلاحية (settings_access) لعرض قائمة مراجعة التطابقات.");
  } else if (queryResult.error && !error) {
    setError("تعذّر جلب قائمة المراجعة.");
  }

  const confirmMutation = useProductMatchingConfirm();
  const undoMutation = useProductMatchingUndo();

  const handleUndo = (item: ReviewItem) => {
    const slug = item.companySlug;
    setUndoingId(item.id);
    undoMutation.mutate(
      { matchId: String(item.id) },
      {
        onSuccess: () => {
          toast.success("تم التراجع عن التطابق");
          setUndoingId(null);
          refetch();
        },
        onError: (err) => {
          toast.error(err.message || "تعذّر التراجع");
          setUndoingId(null);
        },
      },
    );
  };

  const handleConfirm = (item: ReviewItem) => {
    if (!item.matchedProductId) {
      toast.error("لا يوجد منتج مطابق للتأكيد");
      return;
    }
    const slug = item.companySlug;
    setConfirmingId(item.id);
    confirmMutation.mutate(
      { matchId: String(item.id), companyId: slug },
      {
        onSuccess: () => {
          toast.success("تم تأكيد التطابق — تعلّم النظام هذا الاسم");
          setConfirmingId(null);
          refetch();
        },
        onError: (err) => {
          toast.error(err.message || "تعذّر التأكيد");
          setConfirmingId(null);
        },
      },
    );
  };

  const tierColor = (tier: string) => {
    if (tier === "collision-recovery-failed") return "#ef4444";
    return "#f59e0b";
  };

  const title = companySlug === null
    ? "قائمة مراجعة التطابقات — كل الشركات"
    : "قائمة مراجعة التطابقات";

  return (
    <div
      className="fixed inset-0 bg-black/60 z-[340] flex items-center justify-center p-5"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-card text-card-foreground rounded-[14px] border border-border w-full max-w-[95vw] md:max-w-[680px] max-h-[85vh] flex flex-col [direction:rtl]"
      >
        {/* Header */}
        <div className="flex justify-between items-center p-5 border-b border-border">
          <div className="flex items-center gap-2">
            <ListChecks size={18} className="text-[#f59e0b]" />
            <h2 className="text-[16px] font-extrabold">{title}</h2>
            <span className="text-[11px] text-muted-foreground bg-accent px-2 py-0.5 rounded-full">
              {items.length} عنصر
            </span>
          </div>
          <button
            onClick={onClose}
            className="bg-transparent border border-border text-muted-foreground py-1.5 px-2.5 rounded-sm text-[12px] cursor-pointer inline-flex items-center gap-1"
            aria-label="إغلاق"
          >
            <X size={14} /> إغلاق
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-12 gap-2 text-muted-foreground">
              <Loader2 size={24} className="animate-spin" />
              <span className="text-[13px]">جارٍ التحميل…</span>
            </div>
          ) : error ? (
            <div className="text-center py-12 text-[13px] text-destructive">{error}</div>
          ) : items.length === 0 ? (
            <div className="text-center py-12 text-[13px] text-muted-foreground">
              لا توجد تطابقات في انتظار المراجعة. 🎉
            </div>
          ) : (
            <ul className="flex flex-col gap-2">
              {items.map((it) => (
                <li
                  key={it.id}
                  className="rounded-[10px] border border-border bg-background p-3 flex flex-col gap-2"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="text-[13px] font-bold break-words">{it.inputText}</div>
                      {companySlug === null && (
                        <div className="text-[10px] text-muted-foreground mt-0.5 font-mono">
                          الشركة: <span dir="ltr">{it.companySlug}</span>
                        </div>
                      )}
                      {it.matchedAlias && (
                        <div className="text-[12px] text-muted-foreground mt-0.5">
                          طُابق كـ: <span className="font-mono">{it.matchedAlias}</span>
                        </div>
                      )}
                      {it.productName && (
                        <div className="text-[11px] text-muted-foreground mt-0.5">
                          المنتج: <span className="font-bold">{it.productName}</span>
                          {it.productCode && (
                            <span className="font-mono" dir="ltr"> ({it.productCode})</span>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-1 flex-shrink-0">
                      <span
                        className="inline-block py-0.5 px-2 rounded-[8px] text-[10px] font-bold"
                        style={{
                          background: `${tierColor(it.tier)}20`,
                          color: tierColor(it.tier),
                        }}
                      >
                        {(it.confidence * 100).toFixed(0)}%
                      </span>
                      <span className="text-[10px] text-muted-foreground">{it.tier}</span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-2 border-t border-border pt-2">
                    <span className="text-[10px] text-muted-foreground">
                      {new Date(it.createdAt).toLocaleString("ar-EG")}
                    </span>
                    <div className="flex gap-1.5">
                      <button
                        onClick={() => handleConfirm(it)}
                        disabled={confirmingId === it.id || !it.matchedProductId || confirmMutation.isPending}
                        className="inline-flex items-center gap-1 text-[11px] font-bold text-[#10b981] bg-transparent border border-[#10b981]/40 rounded-sm py-1 px-2.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                        title={it.matchedProductId ? "تأكيد التطابق وحفظ الاسم البديل (يتعلم النظام)" : "لا يوجد منتج للتأكيد"}
                      >
                        <Check size={12} />
                        {confirmingId === it.id ? "جارٍ الحفظ…" : "تأكيد (تعلّم)"}
                      </button>
                      <button
                        onClick={() => handleUndo(it)}
                        disabled={undoingId === it.id || undoMutation.isPending}
                        className="inline-flex items-center gap-1 text-[11px] font-bold text-destructive bg-transparent border border-destructive/40 rounded-sm py-1 px-2.5 cursor-pointer disabled:opacity-50"
                      >
                        <RotateCcw size={12} />
                        {undoingId === it.id ? "جارٍ التراجع…" : "تراجع"}
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

export default ReviewQueueModal;

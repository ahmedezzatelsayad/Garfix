"use client";

import { useState, useCallback } from "react";
import { toast } from "sonner";
import { Database, Trash2, Check } from "lucide-react";
import { useRetentionCleanup, type RetentionCleanupResult } from "@/hooks/queries";

/**
 * Admin P2 — Retention Cleanup tab.
 * Uses TanStack Query mutations via useRetentionCleanup for both
 * dry-run preview and actual cleanup. The endpoint only exposes
 * POST (no GET), so we call POST with dryRun=true on mount for preview,
 * then POST with dryRun=false after confirm().
 */
export function RetentionCleanupTab() {
  const cleanupMutation = useRetentionCleanup();
  const [preview, setPreview] = useState<RetentionCleanupResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [retentionYears, setRetentionYears] = useState(5);

  const runPreview = useCallback(async (years: number) => {
    setLoading(true);
    try {
      const result = await cleanupMutation.mutateAsync({ confirmYears: years, dryRun: true });
      setPreview(result);
    } catch {
      toast.error("تعذّر تحميل المعاينة");
    } finally {
      setLoading(false);
    }
  }, [cleanupMutation]);

  // Run preview on mount and when years change
  const [prevYears, setPrevYears] = useState(retentionYears);
  if (retentionYears !== prevYears) {
    setPrevYears(retentionYears);
    runPreview(retentionYears);
  }
  // Initial load
  const [hasInitialized, setHasInitialized] = useState(false);
  if (!hasInitialized) {
    setHasInitialized(true);
    runPreview(retentionYears);
  }

  const runCleanup = async () => {
    const total = preview ? Object.values(preview.eligible).reduce((a, b) => a + b, 0) : 0;
    if (total === 0) { toast.info("لا توجد سجلات مؤهّلة للحذف"); return; }
    if (!confirm(`حذف نهائي لـ ${total} سجل مالي معزول منذ أكثر من ${retentionYears} سنة؟ لا يمكن التراجع.`)) return;
    setRunning(true);
    try {
      const result = await cleanupMutation.mutateAsync({ confirmYears: retentionYears, dryRun: false });
      const d = result;
      const deletedTotal = d.deleted ? Object.values(d.deleted).reduce((a, b) => a + b, 0) : 0;
      toast.success(`تم حذف ${deletedTotal} سجلاً نهائياً`);
      setPreview(d);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "خطأ");
    } finally {
      setRunning(false);
    }
  };

  if (loading) return <div className="p-6 md:p-12 text-center text-[var(--muted-foreground)]">جارٍ التحميل…</div>;
  if (!preview) return <div className="p-6 md:p-12 text-center text-[var(--muted-foreground)]">تعذّر التحميل</div>;

  const eligibleTotal = Object.values(preview.eligible).reduce((a, b) => a + b, 0);
  const deletedTotal = preview.deleted ? Object.values(preview.deleted).reduce((a, b) => a + b, 0) : 0;

  const labelMap: Record<string, string> = {
    invoices: "الفواتير",
    journalEntries: "قيود اليومية",
    paymentTransactions: "حركات الدفع",
    eInvoices: "الفواتير الإلكترونية",
    purchaseInvoices: "فواتير الشراء",
  };

  return (
    <div className="bg-[var(--card)] rounded-2xl border border-[var(--border)] overflow-hidden shadow-brand-lg">
      <div className="px-4 py-3 border-b border-b-[var(--border)] flex justify-between items-center flex-wrap gap-2">
        <h3 className="text-sm font-bold flex items-center gap-2">
          <Database className="text-emerald-500" size={16} />
          التنظيف الدوري للسجلات المعزولة
        </h3>
        <div className="flex items-center gap-2">
          <label className="text-[11px] font-bold text-[var(--muted-foreground)]">سنوات الاحتفاظ:</label>
          <select
            value={retentionYears}
            onChange={(e) => setRetentionYears(Number(e.target.value))}
            className="w-full px-3 py-2 rounded-lg bg-[var(--background)] border border-[var(--border)] text-[var(--foreground)] font-inherit text-[13px] outline-none max-w-[100px] hover-lift duration-120 focus-ring transition-all"
            disabled={running}
          >
            {[3, 5, 7, 10].map((y) => <option key={y} value={y}>{y} سنوات</option>)}
          </select>
        </div>
      </div>

      <div className="p-4 flex flex-col gap-3.5">
        <div className="bg-[var(--muted)] rounded-[10px] text-xs flex flex-col gap-1.5 px-3.5 py-3">
          <div><strong>تاريخ القطع:</strong> {new Date(preview.cutoffDate).toLocaleString("ar-EG")}</div>
          <div><strong>السجلات المعزولة قبل هذا التاريخ ستُحذف نهائياً.</strong></div>
          <div className="text-[10px] text-[var(--muted-foreground)]">
            يشمل: فواتير، قيود يومية، حركات دفع، فواتير إلكترونية، فواتير شراء — جميعها بحالة soft-deleted.
          </div>
        </div>

        <div className="grid grid-cols-[repeat(auto-fit,minmax(140px,1fr))] gap-2.5">
          {Object.entries(preview.eligible).map(([k, v]) => (
            <div className="kpi-card p-3 rounded-[10px] bg-[var(--card)] border border-[var(--border)]" key={k}>
              <div className="text-[10px] text-[var(--muted-foreground)] font-bold">{labelMap[k] || k}</div>
              <div className="text-xl font-black" /* TAILWINDBREAK: dynamic color */ style={{ color: v > 0 ? "#f59e0b" : "var(--foreground)" }}>{v}</div>
              {preview.deleted && (
                <div className="text-[10px] text-emerald-500 font-bold">حُذف: {preview.deleted[k] || 0}</div>
              )}
            </div>
          ))}
        </div>

        <div className="flex justify-between items-center flex-wrap gap-2.5">
          <div className="text-xs text-[var(--muted-foreground)]">
            الإجمالي المؤهّل: <strong /* TAILWINDBREAK: dynamic color */ style={{ color: eligibleTotal > 0 ? "#f59e0b" : "var(--foreground)" }}>{eligibleTotal}</strong>
            {preview.deleted && <> • تم حذف: <strong className="text-emerald-500">{deletedTotal}</strong></>}
          </div>
          <button
            onClick={runCleanup}
            disabled={running || eligibleTotal === 0}
            className="inline-flex items-center gap-1.5 px-5.5 py-2.5 rounded-[10px] border-none text-white font-inherit text-[13px] font-extrabold active-press duration-150" /* TAILWINDBREAK: dynamic bg/cursor/opacity */ style={{ background: eligibleTotal > 0 ? "#ef4444" : "var(--muted)", cursor: running || eligibleTotal === 0 ? "not-allowed" : "pointer", opacity: running ? 0.7 : 1 }}
          >
            <Trash2 size={14} /> {running ? "جارٍ الحذف…" : "تشغيل التنظيف الآن"}
          </button>
        </div>

        {!preview.dryRun && deletedTotal > 0 && (
          <div className="px-3.5 py-2.5 bg-emerald-500/10 rounded-lg text-xs text-emerald-500 font-bold flex items-center gap-1.5">
            <Check size={14} /> تم تنفيذ التنظيف بنجاح — حُذف {deletedTotal} سجل نهائياً.
          </div>
        )}
      </div>
    </div>
  );
}

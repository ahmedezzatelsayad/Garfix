/**
 * ZatcaSubmitButton.tsx — "إرسال لـ ZATCA" button for invoice detail views.
 *
 * Renders a button that submits the given invoice to ZATCA for clearance
 * (Standard B2B) or reporting (Simplified B2C).
 *
 * Flow:
 *   1. On click: POST /api/e-invoicing/zatca/submit with { invoiceId, companySlug }
 *   2. Show loading spinner
 *   3. On success: toast + show clearance/reporting number
 *   4. On validation error: show errors dialog
 *   5. On other error: toast with error message
 *
 * Only renders for Saudi (country === "SA") companies — for other countries
 * the button is hidden (returns null).
 */
"use client";

import { useState } from "react";
import { toast } from "sonner";
import {
  ShieldCheck, Loader2, CheckCircle2, XCircle, AlertCircle, FileCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useBrand } from "@/context/BrandContext";

interface ZatcaSubmitButtonProps {
  invoiceId: number;
  invoiceNumber?: string;
  variant?: "default" | "compact" | "full";
  onSubmitted?: (result: { uuid: string; submissionStatus: string; clearanceNumber?: string | null }) => void;
}

interface SubmitResponse {
  ok: boolean;
  invoiceId: number;
  companySlug: string;
  uuid: string;
  submissionStatus: "pending" | "submitted" | "cleared" | "reported" | "rejected";
  zatcaClearedNumber?: string | null;
  zatcaReportingNumber?: string | null;
  error?: string;
  rejectionReason?: string;
  stage?: string;
  errors?: Array<{ field: string; messageAr: string; severity: "error" | "warning" }>;
  warnings?: Array<{ field: string; messageAr: string }>;
}

export function ZatcaSubmitButton({
  invoiceId, invoiceNumber, variant = "default", onSubmitted,
}: ZatcaSubmitButtonProps) {
  const { activeCompany } = useBrand();
  const country = activeCompany?.country || "";
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SubmitResponse | null>(null);
  const [showErrors, setShowErrors] = useState(false);

  // Only render for Saudi companies (hooks must be called unconditionally first)
  if (country !== "SA") return null;

  const handleSubmit = async () => {
    setLoading(true);
    setResult(null);
    setShowErrors(false);
    try {
      const res = await fetch("/api/e-invoicing/zatca/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          invoiceId,
          companySlug: activeCompany?.slug || "",
        }),
      });
      const data: SubmitResponse = await res.json();

      setResult(data);

      if (data.ok && (data.submissionStatus === "cleared" || data.submissionStatus === "reported")) {
        const number = data.zatcaClearedNumber || data.zatcaReportingNumber;
        toast.success(
          `✅ تم ${data.submissionStatus === "cleared" ? "تصديق" : "تقرير"} الفاتورة ${invoiceNumber || `#${invoiceId}`} — رقم: ${number || "—"}`,
        );
        onSubmitted?.({
          uuid: data.uuid,
          submissionStatus: data.submissionStatus,
          clearanceNumber: data.zatcaClearedNumber || data.zatcaReportingNumber,
        });
      } else if (data.stage === "validation") {
        toast.error(`فشل التحقق من صحة الفاتورة (${data.errors?.length || 0} أخطاء)`);
        setShowErrors(true);
      } else {
        toast.error(data.error || data.rejectionReason || "فشل إرسال الفاتورة لـ ZATCA");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "فشل الاتصال";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  // ─── Render ────────────────────────────────────────────────────────────

  if (variant === "compact") {
    return (
      <button
        onClick={handleSubmit}
        disabled={loading}
        className={cn(
          "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors",
          "bg-mutedmerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400",
          "hover:bg-mutedmerald-500/20 disabled:opacity-50 disabled:cursor-not-allowed",
        )}
        title="إرسال الفاتورة لـ ZATCA للتصديق"
      >
        {loading ? <Loader2 size={13} className="animate-spin" /> : <ShieldCheck size={13} />}
        ZATCA
      </button>
    );
  }

  return (
    <div className="space-y-2">
      <button
        onClick={handleSubmit}
        disabled={loading}
        className={cn(
          "inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all min-h-[40px]",
          "bg-gradient-to-r from-emerald-600 to-emerald-500 text-white",
          "hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed",
        )}
      >
        {loading ? (
          <>
            <Loader2 size={16} className="animate-spin" />
            جاري الإرسال لـ ZATCA...
          </>
        ) : (
          <>
            <ShieldCheck size={16} />
            إرسال لـ ZATCA
          </>
        )}
      </button>

      {/* Success result */}
      {result && result.ok && (result.submissionStatus === "cleared" || result.submissionStatus === "reported") && (
        <div className="rounded-lg p-3 bg-mutedmerald-500/10 border border-emerald-500/30 text-xs space-y-1.5">
          <p className="font-bold text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5">
            <CheckCircle2 size={13} />
            {result.submissionStatus === "cleared" ? "تم تصديق الفاتورة" : "تم تقرير الفاتورة"}
          </p>
          <div className="text-emerald-700/80 dark:text-emerald-400/80 space-y-0.5">
            <p>UUID: <code className="font-mono" dir="ltr">{result.uuid}</code></p>
            {result.zatcaClearedNumber && <p>رقم التصديق: <code className="font-mono" dir="ltr">{result.zatcaClearedNumber}</code></p>}
            {result.zatcaReportingNumber && <p>رقم التقرير: <code className="font-mono" dir="ltr">{result.zatcaReportingNumber}</code></p>}
          </div>
        </div>
      )}

      {/* Validation errors */}
      {showErrors && result?.errors && result.errors.length > 0 && (
        <div className="rounded-lg p-3 bg-red-500/10 border border-red-500/30 text-xs space-y-2">
          <p className="font-bold text-red-700 dark:text-red-400 flex items-center gap-1.5">
            <AlertCircle size={13} />
            أخطاء التحقق من صحة الفاتورة ({result.errors.length})
          </p>
          <ul className="space-y-1">
            {result.errors.map((e) => (
              <li key={e.field} className="text-red-700/80 dark:text-red-400/80">
                <span className="font-mono text-[10px] px-1 py-0.5 rounded bg-red-500/10 ml-1">{e.field}</span>
                {e.messageAr}
              </li>
            ))}
          </ul>
          <button
            onClick={() => setShowErrors(false)}
            className="text-[10px] text-muted-foreground hover:text-foreground mt-1"
          >
            إخفاء
          </button>
        </div>
      )}

      {/* Other error */}
      {result && !result.ok && result.stage !== "validation" && (
        <div className="rounded-lg p-3 bg-red-500/10 border border-red-500/30 text-xs text-red-700 dark:text-red-400 flex items-start gap-1.5">
          <XCircle size={13} className="flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p>{result.error || result.rejectionReason || "فشل الإرسال"}</p>
            {result.submissionStatus === "rejected" && (
              <p className="text-[10px] opacity-70 mt-1">
                الحالة: {result.submissionStatus} — تحقق من سجل الفوترة الإلكترونية في لوحة المؤسس للتفاصيل
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Compact status badge for already-submitted invoices ─────────────────

export function ZatcaStatusBadge({ submissionStatus, uuid }: {
  submissionStatus: "pending" | "submitted" | "cleared" | "reported" | "rejected" | "not_started";
  uuid?: string | null;
}) {
  if (submissionStatus === "not_started" || !submissionStatus) return null;

  const meta = {
    cleared: { icon: <CheckCircle2 size={11} />, color: "bg-mutedmerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/20", label: "مُصدّقة" },
    reported: { icon: <FileCheck size={11} />, color: "bg-mutedackgroundlue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/20", label: "مُبلّغة" },
    submitted: { icon: <Loader2 size={11} className="animate-spin" />, color: "bg-cardmber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/20", label: "مُرسلة" },
    pending: { icon: <Loader2 size={11} className="animate-spin" />, color: "bg-cardmber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/20", label: "معلّقة" },
    rejected: { icon: <XCircle size={11} />, color: "bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/20", label: "مرفوضة" },
  }[submissionStatus] || { icon: <AlertCircle size={11} />, color: "bg-muted text-muted-foreground", label: submissionStatus };

  return (
    <span
      className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border", meta.color)}
      title={uuid ? `UUID: ${uuid}` : undefined}
    >
      {meta.icon}
      {meta.label}
    </span>
  );
}

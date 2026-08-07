/**
 * EInvoiceSubmitButton.tsx — Generic "إرسال للفوترة الإلكترونية" button.
 *
 * Routes by company country:
 *   SA → /api/e-invoicing/zatca/submit  (CSID/CCD certificate signing pipeline)
 *   EG/KW/BH/OM → /api/e-invoicing/submit  (JSON payload submission)
 *   AE/QA → not yet implemented (Peppol AP — returns null)
 *   Other → returns null (unsupported country)
 *
 * Shows inline result panel:
 *   - Success: UUID + clearance/reporting number
 *   - Validation errors: field-level Arabic messages
 *   - Other errors: error message + submission status
 *
 * Also exports EInvoiceStatusBadge for status pill display.
 */
"use client";

import { useState } from "react";
import { toast } from "sonner";
import {
  ShieldCheck, Loader2, CheckCircle2, XCircle, AlertCircle, FileCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useBrand } from "@/context/BrandContext";

// ─── Country config ────────────────────────────────────────────────────────

const COUNTRY_CONFIG: Record<string, { label: string; endpoint: string } | null> = {
  SA: { label: "ZATCA",            endpoint: "/api/e-invoicing/zatca/submit" },
  EG: { label: "ETA",              endpoint: "/api/e-invoicing/submit" },
  KW: { label: "Kuwait MoF",       endpoint: "/api/e-invoicing/submit" },
  BH: { label: "Bahrain NBR",      endpoint: "/api/e-invoicing/submit" },
  OM: { label: "Oman TA",          endpoint: "/api/e-invoicing/submit" },
  // AE/QA: Peppol AP submission not yet implemented
  AE: null,
  QA: null,
};

// ─── Types ─────────────────────────────────────────────────────────────────

interface EInvoiceSubmitButtonProps {
  invoiceId: number;
  invoiceNumber?: string;
  variant?: "default" | "compact";
  onSubmitted?: (result: { uuid?: string; submissionStatus: string }) => void;
}

interface SubmitResponse {
  ok: boolean;
  invoiceId?: number;
  companySlug?: string;
  country?: string;
  authority?: string;
  uuid?: string;
  submissionStatus: string;
  zatcaClearedNumber?: string | null;
  zatcaReportingNumber?: string | null;
  error?: string;
  rejectionReason?: string;
  stage?: string;
  errors?: Array<{ field: string; messageAr: string; severity: string }>;
}

// ─── Component ─────────────────────────────────────────────────────────────

export function EInvoiceSubmitButton({
  invoiceId, invoiceNumber, variant = "default", onSubmitted,
}: EInvoiceSubmitButtonProps) {
  const { activeCompany } = useBrand();
  const country = activeCompany?.country || "";
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SubmitResponse | null>(null);
  const [showErrors, setShowErrors] = useState(false);

  const cfg = COUNTRY_CONFIG[country];
  // Hooks called unconditionally; return null after if country unsupported
  if (!cfg) return null;

  const handleSubmit = async () => {
    setLoading(true);
    setResult(null);
    setShowErrors(false);
    try {
      const res = await fetch(cfg.endpoint, {
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

      if (data.ok && (data.submissionStatus === "cleared" || data.submissionStatus === "reported" || data.submissionStatus === "accepted")) {
        const number = data.zatcaClearedNumber || data.zatcaReportingNumber;
        toast.success(
          `✅ تم ${data.submissionStatus === "cleared" ? "تصديق" : data.submissionStatus === "reported" ? "تقرير" : "إرسال"} الفاتورة ${invoiceNumber || `#${invoiceId}`} — ${number ? `رقم: ${number}` : "UUID: " + (data.uuid?.slice(0, 13) || "—")}`,
        );
        onSubmitted?.({
          uuid: data.uuid,
          submissionStatus: data.submissionStatus,
        });
      } else if (data.stage === "validation") {
        toast.error(`فشل التحقق من صحة الفاتورة (${data.errors?.length || 0} أخطاء)`);
        setShowErrors(true);
      } else {
        toast.error(data.error || data.rejectionReason || "فشل الإرسال");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "فشل الاتصال";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  // ─── Compact variant (for tables) ─────────────────────────────────────
  if (variant === "compact") {
    return (
      <button
        onClick={handleSubmit}
        disabled={loading}
        className={cn(
          "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors",
          "bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400",
          "hover:bg-emerald-500/20 disabled:opacity-50 disabled:cursor-not-allowed",
        )}
        title={`إرسال الفاتورة لـ ${cfg.label}`}
      >
        {loading ? <Loader2 size={13} className="animate-spin" /> : <ShieldCheck size={13} />}
        {cfg.label}
      </button>
    );
  }

  // ─── Default variant ──────────────────────────────────────────────────
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
            جاري الإرسال...
          </>
        ) : (
          <>
            <ShieldCheck size={16} />
            إرسال لـ {cfg.label}
          </>
        )}
      </button>

      {/* Success result */}
      {result && result.ok && (result.submissionStatus === "cleared" || result.submissionStatus === "reported" || result.submissionStatus === "accepted") && (
        <div className="rounded-lg p-3 bg-emerald-500/10 border border-emerald-500/30 text-xs space-y-1.5">
          <p className="font-bold text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5">
            <CheckCircle2 size={13} />
            {result.submissionStatus === "cleared" ? "تم تصديق الفاتورة" : result.submissionStatus === "reported" ? "تم تقرير الفاتورة" : "تم إرسال الفاتورة"}
          </p>
          <div className="text-emerald-700/80 dark:text-emerald-400/80 space-y-0.5">
            {result.uuid && <p>UUID: <code className="font-mono" dir="ltr">{result.uuid}</code></p>}
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
            {result.errors.map((e, i) => (
              <li key={i} className="text-red-700/80 dark:text-red-400/80">
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
                تحقق من سجل الفوترة الإلكترونية في لوحة المؤسس للتفاصيل
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Status badge ──────────────────────────────────────────────────────────

export function EInvoiceStatusBadge({ submissionStatus, uuid }: {
  submissionStatus: "pending" | "submitted" | "cleared" | "reported" | "accepted" | "rejected" | "not_started" | string;
  uuid?: string | null;
}) {
  if (submissionStatus === "not_started" || !submissionStatus) return null;

  const metaMap: Record<string, { icon: React.ReactNode; color: string; label: string }> = {
    cleared:   { icon: <CheckCircle2 size={11} />, color: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/20", label: "مُصدّقة" },
    reported:  { icon: <FileCheck size={11} />,    color: "bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/20", label: "مُبلّغة" },
    accepted:  { icon: <CheckCircle2 size={11} />, color: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/20", label: "مقبولة" },
    submitted: { icon: <Loader2 size={11} className="animate-spin" />, color: "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/20", label: "مُرسلة" },
    pending:   { icon: <Loader2 size={11} className="animate-spin" />, color: "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/20", label: "معلّقة" },
    rejected:  { icon: <XCircle size={11} />,      color: "bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/20", label: "مرفوضة" },
  };
  const meta = metaMap[submissionStatus] || { icon: <AlertCircle size={11} />, color: "bg-muted text-muted-foreground", label: submissionStatus };

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

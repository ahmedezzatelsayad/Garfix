"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  useEInvoicingCompanyTimeline,
  type EInvoicingCompanyTimelineReceipt,
} from "@/hooks/queries/founder-panel";
import {
  ArrowRight,
  ChevronLeft,
  ChevronDown,
  ChevronUp,
  Clock,
  FileText,
  Loader2,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  XCircle,
  CheckCircle2,
  AlertCircle,
  Activity,
  Hash,
  Calendar,
} from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

// Country flag emoji
function flagEmoji(country: string): string {
  if (!country || country.length !== 2) return "🌍";
  const A = 0x1f1e6;
  const a = "A".charCodeAt(0);
  return String.fromCodePoint(
    A + (country.charCodeAt(0) - a),
    A + (country.charCodeAt(1) - a),
  );
}

// ─── Status meta ──────────────────────────────────────────────────────────

function receiptStatusMeta(status: string): { icon: React.ReactNode; color: string; bg: string; label: string } {
  if (status === "accepted")
    return { icon: <CheckCircle2 size={14} />, color: "text-emerald-400", bg: "bg-emerald-500/15 border-emerald-500/30", label: "مقبول" };
  if (status === "rejected")
    return { icon: <XCircle size={14} />, color: "text-red-400", bg: "bg-red-500/15 border-red-500/30", label: "مرفوض" };
  if (status === "pending")
    return { icon: <Clock size={14} />, color: "text-amber-400", bg: "bg-amber-500/15 border-amber-500/30", label: "معلّق" };
  if (status === "cancelled")
    return { icon: <XCircle size={14} />, color: "text-muted-foreground", bg: "bg-white/[0.06] border-white/[0.08]", label: "ملغى" };
  return { icon: <Activity size={14} />, color: "text-muted-foreground", bg: "bg-white/[0.06] border-white/[0.08]", label: status };
}

// ─── Stat Card ────────────────────────────────────────────────────────────

function MiniStat({
  label, value, accent,
}: {
  label: string;
  value: number | string;
  accent: "emerald" | "amber" | "red" | "blue" | "muted";
}) {
  const colorMap = {
    emerald: "text-emerald-400",
    amber: "text-amber-400",
    red: "text-red-400",
    blue: "text-blue-400",
    muted: "text-muted-foreground",
  };
  return (
    <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3">
      <p className="text-[10px] text-muted-foreground mb-1 truncate">{label}</p>
      <p className={cn("text-xl font-bold", colorMap[accent])}>{value}</p>
    </div>
  );
}

// ─── Receipt Card (expandable) ────────────────────────────────────────────

function ReceiptCard({ receipt }: { receipt: EInvoicingCompanyTimelineReceipt }) {
  const [expanded, setExpanded] = useState(false);
  const meta = receiptStatusMeta(receipt.status);

  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] overflow-hidden">
      {/* Header row */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-3 p-4 hover:bg-white/[0.03] transition-colors text-right"
      >
        <span className={cn("flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center border", meta.bg, meta.color)}>
          {meta.icon}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={cn("text-[10px] px-1.5 py-0.5 rounded font-medium border", meta.bg, meta.color)}>
              {meta.label}
            </span>
            <span className="text-sm font-medium text-foreground">{receipt.authority}</span>
            <span className="text-[11px] text-muted-foreground">/ {receipt.eventType}</span>
            {receipt.signatureValid === false && (
              <span className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded bg-red-500/10 text-red-400 border border-red-500/20">
                <AlertCircle size={10} />
                توقيع غير صالح
              </span>
            )}
            {receipt.signatureValid === true && (
              <span className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                <ShieldCheck size={10} />
                موقّع
              </span>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground mt-1 truncate">
            {receipt.invoiceId && <span><Hash size={9} className="inline ml-0.5" />{receipt.invoiceId} · </span>}
            {receipt.externalUuid && <span className="font-mono">{receipt.externalUuid.slice(0, 21)}…</span>}
            {!receipt.externalUuid && !receipt.invoiceId && <span>إيصال بدون مرجع</span>}
          </p>
        </div>
        <div className="flex-shrink-0 text-left">
          <p className="text-[11px] text-muted-foreground whitespace-nowrap">
            {new Date(receipt.receivedAt).toLocaleString("ar-EG", { dateStyle: "short", timeStyle: "short" })}
          </p>
          {expanded ? <ChevronUp size={14} className="text-muted-foreground mt-1 ml-auto" /> : <ChevronDown size={14} className="text-muted-foreground mt-1 ml-auto" />}
        </div>
      </button>

      {/* Expanded section */}
      {expanded && (
        <div className="px-4 pb-4 pt-0 space-y-3 border-t border-white/[0.06]">
          {/* Rejection reason */}
          {receipt.rejectionReason && (
            <div className="mt-3 rounded-lg bg-red-500/10 border border-red-500/20 p-3">
              <p className="text-xs font-bold text-red-400 mb-1 flex items-center gap-1">
                <XCircle size={12} />
                سبب الرفض
              </p>
              <p className="text-xs text-red-300 leading-relaxed">{receipt.rejectionReason}</p>
            </div>
          )}

          {/* Metadata grid */}
          <div className="grid grid-cols-2 gap-2 mt-3 text-[11px]">
            <div>
              <p className="text-muted-foreground">UUID الكامل</p>
              <p className="font-mono text-foreground break-all">{receipt.externalUuid || "—"}</p>
            </div>
            <div>
              <p className="text-muted-foreground">نوع الحدث</p>
              <p className="text-foreground">{receipt.eventType}</p>
            </div>
            <div>
              <p className="text-muted-foreground">السلطة</p>
              <p className="text-foreground">{receipt.authority}</p>
            </div>
            <div>
              <p className="text-muted-foreground">الحالة</p>
              <p className="text-foreground">{receipt.status}</p>
            </div>
          </div>

          {/* Raw payload (JSON) */}
          <div className="mt-3">
            <p className="text-[11px] text-muted-foreground mb-1 flex items-center gap-1">
              <FileText size={11} />
              الحمولة الخام (Raw Payload)
            </p>
            <pre className="text-[10px] font-mono text-foreground/80 bg-black/40 rounded-lg p-3 overflow-x-auto max-h-64 scrollbar-thin" dir="ltr">
              {(() => {
                try {
                  return JSON.stringify(JSON.parse(receipt.rawPayload), null, 2);
                } catch {
                  return receipt.rawPayload;
                }
              })()}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Invoice group card ───────────────────────────────────────────────────

function InvoiceGroupCard({
  invoiceNumber, status, total, issueDate, eventCount,
}: {
  invoiceNumber: string | null;
  status: string | null;
  total: number | null;
  issueDate: string | null;
  eventCount: number;
}) {
  return (
    <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3 hover:bg-white/[0.04] transition-colors">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground truncate">
            {invoiceNumber || "—"}
          </p>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            {status && <span>{status} · </span>}
            {issueDate && <span>{new Date(issueDate).toLocaleDateString("ar-EG")}</span>}
            {total !== null && <span> · {total} ر.س</span>}
          </p>
        </div>
        <span className="text-[11px] px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-400 border border-blue-500/20 whitespace-nowrap">
          {eventCount} حدث
        </span>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────

export default function EInvoicingCompanyTimelinePage() {
  const params = useParams<{ slug: string }>();
  const router = useRouter();
  const slug = params?.slug || null;
  const { data, isLoading, isError, refetch, isFetching } = useEInvoicingCompanyTimeline(slug);
  const [tab, setTab] = useState<"timeline" | "invoices">("timeline");

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-400" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <ShieldAlert className="h-12 w-12 text-red-400" />
        <p className="text-muted-foreground">فشل تحميل سجل الفوترة الإلكترونية للشركة</p>
        <div className="flex gap-2">
          <button
            onClick={() => router.push("/founder-panel/e-invoicing")}
            className="px-4 py-2 rounded-lg bg-white/[0.06] text-foreground text-sm font-medium hover:bg-white/[0.1] transition-colors"
          >
            الرجوع للوحة
          </button>
          <button
            onClick={() => refetch()}
            className="px-4 py-2 rounded-lg bg-emerald-500 text-white text-sm font-medium hover:bg-emerald-600 transition-colors"
          >
            إعادة المحاولة
          </button>
        </div>
      </div>
    );
  }

  const company = data.company;
  const flag = flagEmoji(company.country);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link
          href="/founder-panel/e-invoicing"
          className="p-2 rounded-lg hover:bg-white/[0.06] transition-colors text-muted-foreground hover:text-foreground"
          title="رجوع"
        >
          <ArrowRight className="h-5 w-5" />
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className="text-2xl">{company.emoji || flag}</span>
            <h1 className="text-2xl font-bold text-white">{company.nameAr || company.name}</h1>
            <span className={cn(
              "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border",
              company.isConfigured
                ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/20"
                : "bg-amber-500/15 text-amber-400 border-amber-500/20",
            )}>
              {company.isConfigured ? <CheckCircle2 size={11} /> : <Clock size={11} />}
              {company.isConfigured ? "مفعّل" : "معلّق"}
            </span>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            {company.countryName} {company.vatNumber && `• VAT: ${company.vatNumber}`} {company.plan && `• ${company.plan}`}
          </p>
        </div>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="p-2 rounded-lg hover:bg-white/[0.06] transition-colors text-muted-foreground hover:text-foreground disabled:opacity-50"
          title="تحديث"
        >
          <RefreshCw className={cn("h-5 w-5", isFetching && "animate-spin")} />
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <MiniStat label="إجمالي الإيصالات" value={data.stats.total} accent="muted" />
        <MiniStat label="مقبولة" value={data.stats.accepted} accent="emerald" />
        <MiniStat label="مرفوضة" value={data.stats.rejected} accent="red" />
        <MiniStat label="معلّقة" value={data.stats.pending} accent="amber" />
        <MiniStat label="آخر 7 أيام" value={data.stats.last7d} accent="blue" />
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-white/[0.06]">
        {(["timeline", "invoices"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              "px-4 py-2.5 text-sm font-medium transition-colors relative",
              tab === t
                ? "text-emerald-400"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t === "timeline" ? (
              <span className="flex items-center gap-2">
                <Calendar size={14} />
                السجل الزمني ({data.receipts.length})
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <FileText size={14} />
                الفواتير ({data.invoiceGroups.length})
              </span>
            )}
            {tab === t && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-emerald-400" />}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === "timeline" ? (
        <div className="space-y-3">
          {data.receipts.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <Clock className="h-12 w-12 mx-auto mb-3 opacity-40" />
              <p className="text-sm">لا توجد إيصالات واردة لهذه الشركة بعد</p>
              <p className="text-xs mt-1">سيظهر هنا تلقائياً عند استدعاء هيئة الضرائب لـ webhook الخاص بنا</p>
            </div>
          ) : (
            data.receipts.map((r) => <ReceiptCard key={r.id} receipt={r} />)
          )}
          {data.pagination.hasMore && (
            <p className="text-center text-[11px] text-muted-foreground py-3">
              توجد إيصالات أقدم — استخدم cursor pagination لعرضها
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {data.invoiceGroups.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <FileText className="h-12 w-12 mx-auto mb-3 opacity-40" />
              <p className="text-sm">لا توجد فواتير مرتبطة بإيصالات بعد</p>
            </div>
          ) : (
            data.invoiceGroups.map((g, i) => (
              <InvoiceGroupCard
                key={g.invoiceId || i}
                invoiceNumber={g.invoiceNumber}
                status={g.invoiceStatus}
                total={g.invoiceTotal}
                issueDate={g.issueDate}
                eventCount={g.eventCount}
              />
            ))
          )}
        </div>
      )}

      {/* Help */}
      <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/[0.04] p-4 text-xs">
        <p className="font-bold text-emerald-400 mb-1 flex items-center gap-1">
          <ShieldCheck size={13} />
          webhook URL لهذه الدولة
        </p>
        <p className="font-mono text-emerald-300/80 text-[11px]" dir="ltr">
          /api/e-invoicing/webhooks/{company.country?.toLowerCase() || "zatca"}
        </p>
        <p className="text-[11px] text-muted-foreground mt-2 leading-relaxed">
          هذا الـ endpoint يُستقبل منه إشعارات الهيئة. سجّله في بوابة الهيئة المعنية ليتم إرسال الإيصالات تلقائياً.
        </p>
      </div>
    </div>
  );
}

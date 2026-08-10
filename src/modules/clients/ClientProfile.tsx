// Responsive: sm/md/lg breakpoints added | DS v4.0 Updated
"use client";

/**
 * ClientProfile — single-client detail view (clients/[id]/profile)
 *
 * Shows:
 *   • KPI Cards for client stats (DS v4.0)
 *   • Client info card (name, email, phone, address, notes)
 *   • Balance summary card (invoice count, total due, total paid, outstanding)
 *   • AI Suggestions panel (ai-suggestion class)
 *   • Full invoice history table
 *   • AI Memory Notes with ai-badge support
 *
 * Takes a `clientId` prop. Rendered by ClientsView when a row is clicked.
 */
import { useState, useEffect } from "react";
import { useClientProfile, useEntityMemoryNotes, useCreateEntityMemoryNote, useDeleteAIMemory } from "@/hooks/queries";
import { toast } from "sonner";
import {
  ArrowRight, User, Mail, Phone, MapPin, StickyNote, FileText, Wallet,
  AlertTriangle, CheckCircle2, Calendar, Building2, Brain, Plus, Trash2, Loader2,
  Sparkles, TrendingUp, Clock, Award, Star,
} from "lucide-react";
import { num } from "@/lib/money";
import { cn } from "@/lib/utils";
import {
  GarfixEmptyState,
  GarfixLoadingState,
  GarfixErrorState,
} from "@/components/ui/index-garfix-ds";

interface ClientProfileProps {
  clientId: number;
  onBack: () => void;
}

interface ClientInfo {
  id: number;
  name: string;
  email?: string | null;
  phone?: string | null;
  company?: string | null;
  address?: string | null;
  notes?: string | null;
  companySlug: string;
  createdAt: string;
}

interface InvoiceRow {
  id: number;
  invoiceNumber: string;
  issueDate: string;
  dueDate: string;
  status: string;
  subtotal: number;
  taxRate: number;
  taxAmount: number;
  total: number;
  paid: number;
  outstanding: number;
  shipping: number;
  discount: number;
  notes?: string | null;
  source?: string | null;
  createdAt: string;
}

interface Summary {
  invoiceCount: number;
  totalDue: number;
  totalPaid: number;
  outstanding: number;
  byStatus: Record<string, number>;
}

interface AIMemoryNote {
  id: number;
  companySlug: string;
  entityType: string;
  entityId: number;
  note: string;
  createdBy: string;
  createdAt: string;
}

const STATUS_LABELS: Record<string, { label: string; color: string; bg: string }> = {
  draft: { label: "مسودة", color: "#6b7280", bg: "#6b728022" },
  sent: { label: "مرسلة", color: "#0ea5e9", bg: "#0ea5e922" },
  paid: { label: "مدفوعة", color: "#10b981", bg: "#10b98122" },
  partial: { label: "جزئية", color: "#f59e0b", bg: "#f59e0b22" },
  overdue: { label: "متأخرة", color: "#ef4444", bg: "#ef444422" },
  cancelled: { label: "ملغاة", color: "#9ca3af", bg: "#9ca3af22" },
};

function fmtDate(s: string): string {
  if (!s) return "—";
  try {
    const d = new Date(s.length === 10 ? `${s}T00:00:00` : s);
    if (isNaN(d.getTime())) return s;
    return d.toLocaleDateString("ar-EG", { year: "numeric", month: "short", day: "numeric" });
  } catch { return s; }
}

function fmtMoney(v: unknown): string {
  return num(v).toLocaleString("ar-EG", { maximumFractionDigits: 3, minimumFractionDigits: 3 });
}

const thStyle = "text-start px-2.5 sm:px-3 py-2.5 text-[11px] text-muted-foreground font-semibold";
const tdStyle = "px-2.5 sm:px-3 py-2.5 align-middle";

export function ClientProfile({ clientId, onBack }: ClientProfileProps) {
  const { data: profileData, isLoading: loading, error: profileError, refetch } = useClientProfile(clientId);
  const { data: notesData, isLoading: loadingNotes } = useEntityMemoryNotes(
    profileData?.client?.companySlug || "", "client", clientId
  );
  const createNoteMutation = useCreateEntityMemoryNote();
  const deleteNoteMutation = useDeleteAIMemory();

  const client = (profileData?.client ?? null) as ClientInfo | null;
  const invoices = ((profileData as Record<string, unknown> | undefined)?.invoices ?? []) as InvoiceRow[];
  const summary = ((profileData as Record<string, unknown> | undefined)?.summary ?? null) as Summary | null;
  const memoryNotes = (notesData?.notes ?? []) as AIMemoryNote[];

  const [newNote, setNewNote] = useState("");
  const [deletingNoteId, setDeletingNoteId] = useState<number | null>(null);

  // Handle 404 / 403 errors from the profile query — navigate back
  useEffect(() => {
    const status = (profileError as unknown as { status?: number })?.status;
    if (status === 404) { toast.error("العميل غير موجود"); onBack(); }
    else if (status === 403) { toast.error("ليس لديك صلاحية لعرض هذا العميل"); onBack(); }
  }, [profileError, onBack]);

  const addMemoryNote = () => {
    if (!client) return;
    const note = newNote.trim();
    if (!note) { toast.error("اكتب نص الملاحظة أولًا"); return; }
    if (note.length > 4000) { toast.error("النص طويل جداً (الحد 4000 حرف)"); return; }
    createNoteMutation.mutate(
      { companySlug: client.companySlug, entityType: "client", entityId: client.id, note },
      {
        onSuccess: () => { setNewNote(""); toast.success("تم حفظ الملاحظة"); },
        onError: (err) => { toast.error(err.message || "خطأ"); },
      },
    );
  };

  const deleteMemoryNote = (noteId: number) => {
    if (!client) return;
    if (!confirm("حذف هذه الملاحظة؟")) return;
    setDeletingNoteId(noteId);
    deleteNoteMutation.mutate(noteId, {
      onSuccess: () => { toast.success("تم حذف الملاحظة"); },
      onError: (err) => { toast.error(err.message || "خطأ"); },
      onSettled: () => { setDeletingNoteId(null); },
    });
  };

  // ── Loading State (DS v4.0) ────────────────────────────────────────
  if (loading) {
    return (
      <div className="p-6 md:p-12">
        <GarfixLoadingState 
          message="جارٍ تحميل بيانات العميل..."
          variant="skeleton"
          skeletonLines={5}
        />
      </div>
    );
  }

  // ── Error State (DS v4.0) ──────────────────────────────────────────
  if (!client && profileError) {
    return (
      <div className="p-6 md:p-12">
        <GarfixErrorState
          title="تعذّر تحميل بيانات العميل"
          message={profileError instanceof Error ? profileError.message : "حدث خطأ أثناء تحميل بيانات العميل"}
          onRetry={() => refetch()}
          retryLabel="إعادة المحاولة"
        />
      </div>
    );
  }

  // ── Empty State (DS v4.0) ──────────────────────────────────────────
  if (!client) {
    return (
      <div className="p-6 md:p-12">
        <GarfixEmptyState
          illustration="users"
          title="العميل غير موجود"
          description="لم يتم العثور على بيانات هذا العميل. قد تم حذفه."
          action={{
            label: "العودة للعملاء",
            onClick: onBack,
            variant: "secondary",
          }}
        />
      </div>
    );
  }

  const outstanding = summary?.outstanding || 0;
  const fullyPaid = outstanding < 0.001 && (summary?.invoiceCount || 0) > 0;
  
  // Calculate client health score for AI suggestions
  const paymentHealth = fullyPaid ? 100 : outstanding > 0 ? Math.max(0, 100 - (outstanding / (summary?.totalDue || 1)) * 100) : 75;
  const isVIP = paymentHealth >= 90 && (summary?.invoiceCount || 0) >= 3;

  return (
    <div className="flex flex-col gap-4 md:gap-6">
      {/* Header bar with Back button */}
      <div className="flex flex-wrap justify-between items-center gap-3">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="active-press touch-target inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-card border border-border text-foreground font-bold text-xs cursor-pointer hover:bg-muted hover:border-primary/20 hover-scale transition-all duration-120 min-h-[44px] md:min-h-[unset]"
          >
            <ArrowRight size={14} /> العودة للعملاء
          </button>
          <div className="flex items-center gap-2">
            {isVIP && (
              <span className="ai-badge">
                <Star size={10} />
                <span>VIP</span>
              </span>
            )}
            <div>
              <h1 className="text-[22px] font-extrabold text-foreground flex items-center gap-2">
                <User size={20} className="text-primary" /> {client.name}
              </h1>
              <p className="text-xs text-muted-foreground">
                ملف العميل • {invoices.length} فاتورة
                {memoryNotes.length > 0 && ` • ${memoryNotes.length} ملاحظة ذكية`}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* ── KPI Cards Section (DS v4.0) ─────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
        {/* Total Invoices KPI */}
        <div className="kpi-card !p-3 md:!p-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="kpi-icon-sm bg-sky-500/10 text-sky-500">
              <FileText size={14} />
            </div>
            <span className="kpi-label text-[11px]">الفواتير</span>
          </div>
          <div className="kpi-value text-xl md:text-2xl">{summary?.invoiceCount || 0}</div>
        </div>

        {/* Total Due KPI */}
        <div className="kpi-card !p-3 md:!p-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="kpi-icon-sm bg-indigo-500/10 text-indigo-500">
              <Wallet size={14} />
            </div>
            <span className="kpi-label text-[11px]">إجمالي الفواتير</span>
          </div>
          <div className="kpi-value text-lg md:text-xl [direction:ltr]" dir="ltr">{fmtMoney(summary?.totalDue || 0)}</div>
        </div>

        {/* Paid Amount KPI */}
        <div className="kpi-card !p-3 md:!p-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="kpi-icon-sm bg-emerald-500/10 text-emerald-500">
              <CheckCircle2 size={14} />
            </div>
            <span className="kpi-label text-[11px]">المدفوع</span>
          </div>
          <div className="kpi-value text-lg md:text-xl text-emerald-600 [direction:ltr]" dir="ltr">{fmtMoney(summary?.totalPaid || 0)}</div>
        </div>

        {/* Outstanding KPI */}
        <div className={cn(
          "kpi-card !p-3 md:!p-4",
          outstanding > 0 ? "border-destructive/30 bg-destructive/5" : "border-emerald-300/30 bg-emerald-500/5"
        )}>
          <div className="flex items-center gap-2 mb-2">
            <div className={cn(
              "kpi-icon-sm",
              outstanding > 0 ? "bg-red-500/10 text-red-500" : "bg-emerald-500/10 text-emerald-500"
            )}>
              {outstanding > 0 ? <AlertTriangle size={14} /> : <CheckCircle2 size={14} />}
            </div>
            <span className="kpi-label text-[11px]">المستحق</span>
          </div>
          <div className={cn(
            "kpi-value text-lg md:text-xl [direction:ltr]",
            outstanding > 0 ? "text-red-600" : "text-emerald-600"
          )} dir="ltr">{fmtMoney(outstanding)}</div>
        </div>
      </div>

      {/* ── AI Suggestion Panel (DS v4.0) ─────────────────────────────── */}
      {(memoryNotes.length > 0 || summary) && (
        <div className="ai-suggestion rounded-xl border border-[#d4a574]/20 bg-gradient-to-l from-[#d4a574]/5 to-transparent p-4">
          <div className="flex items-start gap-3">
            <div className="ai-badge shrink-0">
              <Sparkles size={14} />
            </div>
            <div className="flex-1 min-w-0">
              <h4 className="text-sm font-bold text-foreground flex items-center gap-2 mb-2">
                <Brain size={14} className="text-[#d4a574]" />
                رؤى ذكية عن العميل
              </h4>
              <ul className="space-y-1.5 text-xs text-muted-foreground">
                {fullyPaid && summary && summary.invoiceCount > 0 && (
                  <li className="flex items-center gap-2">
                    <CheckCircle2 size={12} className="text-emerald-500 shrink-0" />
                    <span>هذا العميل <strong className="text-emerald-600">مدفوع بشكل منتظم</strong> - جميع الفواتير مسددة</span>
                  </li>
                )}
                {!fullyPaid && outstanding > 0 && (
                  <li className="flex items-center gap-2">
                    <AlertTriangle size={12} className="text-amber-500 shrink-0" />
                    <span>يوجد <strong className="text-amber-600">مبالغ مستحقة</strong> بقيمة {fmtMoney(outstanding)} - يتابع الدفع</span>
                  </li>
                )}
                {isVIP && (
                  <li className="flex items-center gap-2">
                    <Award size={12} className="text-[#d4a574] shrink-0" />
                    <span><strong className="text-[#d4a574]">عميل VIP</strong> - سجل دفع ممتاز وولاء عالي</span>
                  </li>
                )}
                {summary && summary.invoiceCount >= 5 && (
                  <li className="flex items-center gap-2">
                    <TrendingUp size={12} className="text-sky-500 shrink-0" />
                    <span><strong className="text-sky-600">عميل نشط</strong> - {summary.invoiceCount} فاتورة خلال التعامل</span>
                  </li>
                )}
                {memoryNotes.length > 0 && (
                  <li className="flex items-center gap-2">
                    <Brain size={12} className="text-primary shrink-0" />
                    <span><strong>{memoryNotes.length} ملاحظة ذكية</strong> محفوظة عن هذا العميل</span>
                  </li>
                )}
              </ul>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Client info card */}
        <Card title="معلومات العميل" icon={<User size={16} />}>
          <InfoRow icon={<Mail size={13} />} label="البريد" value={client.email} dir="ltr" />
          <InfoRow icon={<Phone size={13} />} label="الهاتف" value={client.phone} dir="ltr" />
          <InfoRow icon={<Building2 size={13} />} label="الشركة" value={client.company} />
          <InfoRow icon={<MapPin size={13} />} label="العنوان" value={client.address} />
          <InfoRow icon={<Calendar size={13} />} label="عميل منذ" value={fmtDate(client.createdAt)} />
          {client.notes && (
            <div className="mt-2 p-2.5 bg-muted rounded-lg border border-border text-xs text-foreground flex gap-2 items-start">
              <StickyNote size={13} className="shrink-0 mt-0.5 opacity-60" />
              <span className="whitespace-pre-wrap">{client.notes}</span>
            </div>
          )}
        </Card>

        {/* Balance summary card */}
        <Card title="ملخص الرصيد" icon={<Wallet size={16} />}>
          {summary ? (
            <div className="flex flex-col gap-2.5">
              <SummaryRow
                icon={<FileText size={14} />}
                label="عدد الفواتير"
                value={String(summary.invoiceCount)}
                color="#0ea5e9"
              />
              <SummaryRow
                icon={<Wallet size={14} />}
                label="إجمالي الفواتير"
                value={fmtMoney(summary.totalDue)}
                color="#6366f1"
              />
              <SummaryRow
                icon={<CheckCircle2 size={14} />}
                label="إجمالي المدفوع"
                value={fmtMoney(summary.totalPaid)}
                color="#10b981"
              />
              <div
                className={`mt-1 p-3 rounded-xl flex justify-between items-center transition-all duration-200 ${outstanding > 0 && !fullyPaid ? "bg-red-500/10 border border-red-500/30" : "bg-emerald-500/10 border border-emerald-500/30"}`}
              >
                <div className="flex items-center gap-2">
                  {fullyPaid
                    ? <CheckCircle2 size={16} className="text-[#10b981]" />
                    : <AlertTriangle size={16} className="text-[#ef4444]" />}
                  <span className="text-xs font-bold text-foreground">
                    {fullyPaid ? "مدفوع بالكامل" : "المبلغ المستحق"}
                  </span>
                </div>
                <span
                  className={cn("text-base font-extrabold [direction:ltr]", fullyPaid ? "text-[#10b981]" : "text-[#ef4444]")}
                >
                  {fmtMoney(outstanding)}
                </span>
              </div>
              {/* Status breakdown */}
              {Object.keys(summary.byStatus).length > 0 && (
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {Object.entries(summary.byStatus).map(([status, count]) => {
                    const meta = STATUS_LABELS[status] || { label: status, color: "#6b7280", bg: "#6b728022" };
                    return (
                      <span key={status} className={`inline-flex items-center gap-1 py-0.5 px-2.5 rounded-full text-[11px] font-bold [background:${meta.bg}] [color:${meta.color}]`}>
                        {meta.label} × {count}
                      </span>
                    );
                  })}
                </div>
              )}
            </div>
          ) : (
            <div className="p-4 text-center text-muted-foreground text-xs">
              لا توجد بيانات
            </div>
          )}
        </Card>
      </div>

      {/* Invoice history table */}
      <div className="bg-card rounded-xl border border-border overflow-hidden">
        <div className="py-3 px-4 border-b border-border flex justify-between items-center">
          <h3 className="text-sm font-bold flex items-center gap-1.5">
            <FileText size={14} /> سجل الفواتير
          </h3>
          <span className="text-[11px] text-muted-foreground">
            {invoices.length} فاتورة
          </span>
        </div>

        {invoices.length === 0 ? (
          <div className="p-6 md:p-12">
            <GarfixEmptyState
              illustration="documents"
              title="لا توجد فواتير"
              description="لم يتم إصدار أي فواتير لهذا العميل بعد"
            />
          </div>
        ) : (
          <>
          {/* Desktop table */}
          <div className="hidden md:block overflow-x-auto garfix-scroll">
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th scope="col" className={thStyle}>رقم الفاتورة</th>
                  <th scope="col" className={thStyle}>تاريخ الإصدار</th>
                  <th scope="col" className={thStyle}>الاستحقاق</th>
                  <th scope="col" className={thStyle}>الحالة</th>
                  <th scope="col" className={thStyle}>الإجمالي</th>
                  <th scope="col" className={thStyle}>المدفوع</th>
                  <th scope="col" className={thStyle}>المستحق</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv) => {
                  const meta = STATUS_LABELS[inv.status] || { label: inv.status, color: "#6b7280", bg: "#6b728022" };
                  return (
                    <tr key={inv.id} className="border-b border-border hover:bg-muted/30 transition-colors duration-120">
                      <td className={cn(tdStyle, "font-bold [direction:ltr] text-end")}>
                        {inv.invoiceNumber}
                      </td>
                      <td className={tdStyle}>{fmtDate(inv.issueDate)}</td>
                      <td className={tdStyle}>{fmtDate(inv.dueDate)}</td>
                      <td className={tdStyle}>
                        <span role="status" aria-label={meta.label} className="inline-flex items-center py-0.5 px-2.5 rounded-full text-[11px] font-bold"
                          style={{ background: meta.bg, color: meta.color }}>
                          {meta.label}
                        </span>
                      </td>
                      <td className={cn(tdStyle, "[direction:ltr] text-end font-semibold")}>
                        {fmtMoney(inv.total)}
                      </td>
                      <td className={cn(tdStyle, "[direction:ltr] text-end text-[#10b981]")}>
                        {inv.paid > 0 ? fmtMoney(inv.paid) : "—"}
                      </td>
                      <td
                        className={cn("px-3 py-2.5 align-middle [direction:ltr] text-end font-bold", inv.outstanding > 0 ? "text-[#ef4444]" : "text-[#10b981]")}
                      >
                        {fmtMoney(inv.outstanding)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              {invoices.length > 1 && (
                <tfoot>
                  <tr className="border-t-2 border-border bg-muted/50">
                    <td className={cn(tdStyle, "font-extrabold")} colSpan={4}>الإجمالي</td>
                    <td className={cn(tdStyle, "[direction:ltr] text-end font-extrabold")}>
                      {fmtMoney(summary?.totalDue || 0)}
                    </td>
                    <td className={cn(tdStyle, "[direction:ltr] text-end font-extrabold text-[#10b981]")}>
                      {fmtMoney(summary?.totalPaid || 0)}
                    </td>
                    <td
                      className={cn("px-3 py-2.5 align-middle [direction:ltr] text-end font-extrabold", (summary?.outstanding || 0) > 0 ? "text-[#ef4444]" : "text-[#10b981]")}
                    >
                      {fmtMoney(summary?.outstanding || 0)}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
          {/* Mobile cards */}
          <div className="md:hidden flex flex-col divide-y divide-border">
            {invoices.map((inv) => {
              const meta = STATUS_LABELS[inv.status] || { label: inv.status, color: "#6b7280", bg: "#6b728022" };
              return (
                <div key={inv.id} className="p-3 flex flex-col gap-2 hover:bg-muted/30 transition-colors duration-120">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold text-[13px]" dir="ltr">{inv.invoiceNumber}</span>
                    <span role="status" aria-label={meta.label} className="inline-flex items-center py-0.5 px-2.5 rounded-full text-[11px] font-bold"
                      style={{ background: meta.bg, color: meta.color }}>
                      {meta.label}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-1.5 text-[12px]">
                    <div><span className="text-muted-foreground text-[11px]">الإصدار: </span>{fmtDate(inv.issueDate)}</div>
                    <div><span className="text-muted-foreground text-[11px]">الاستحقاق: </span>{fmtDate(inv.dueDate)}</div>
                    <div><span className="text-muted-foreground text-[11px]">الإجمالي: </span><span className="font-semibold" dir="ltr">{fmtMoney(inv.total)}</span></div>
                    <div><span className="text-muted-foreground text-[11px]">المدفوع: </span><span className="text-[#10b981]" dir="ltr">{inv.paid > 0 ? fmtMoney(inv.paid) : "—"}</span></div>
                    <div className="col-span-2"><span className="text-muted-foreground text-[11px]">المستحق: </span><span className={cn("font-bold", inv.outstanding > 0 ? "text-[#ef4444]" : "text-[#10b981]")} dir="ltr">{fmtMoney(inv.outstanding)}</span></div>
                  </div>
                </div>
              );
            })}
            {invoices.length > 1 && (
              <div className="p-3 bg-muted/50 flex flex-wrap justify-between gap-2 text-[12px] font-extrabold rounded-b-xl">
                <span>الإجمالي:</span>
                <span className="text-[#10b981]" dir="ltr">مدفوع {fmtMoney(summary?.totalPaid || 0)}</span>
                <span className={cn((summary?.outstanding || 0) > 0 ? "text-[#ef4444]" : "text-[#10b981]")} dir="ltr">مستحق {fmtMoney(summary?.outstanding || 0)}</span>
              </div>
            )}
          </div>
          </>
        )}
      </div>

      {/* ─── Item 4: AI Memory Notes (DS v4.0 Updated) ─────────────────── */}
      <div className="bg-card rounded-xl border border-border overflow-hidden">
        <div className="py-3 px-4 border-b border-border flex justify-between items-center gap-2">
          <h3 className="text-sm font-bold flex items-center gap-1.5">
            <Brain size={14} className="text-primary" /> ملاحظات الذكاء الاصطناعي
            {memoryNotes.length > 0 && (
              <span className="ai-badge text-[10px]">
                <Sparkles size={8} />
                <span>{memoryNotes.length}</span>
              </span>
            )}
          </h3>
          <span className="text-[11px] text-muted-foreground">
            {loadingNotes ? "جارٍ التحميل…" : `${memoryNotes.length} ملاحظة`}
          </span>
        </div>
        <div className="p-4 flex flex-col gap-3">
          <div className="flex flex-col gap-2">
            <textarea
              value={newNote}
              onChange={(e) => setNewNote(e.target.value)}
              aria-label="ملاحظة ذكاء اصطناعي"
              placeholder="اكتب ملاحظة عن هذا العميل — يستخدمها الذكاء الاصطناعي لاحقًا لتقديم توصيات أفضل (مثال: يفضّل الدفع نقدًا، يعمل في مجال البناء، موسمي النشاط في الصيف…)"
              rows={3}
              maxLength={4000}
              className="focus-right w-full rounded-lg border border-border bg-background px-3 py-2 text-sm font-inherit resize-y touch-target focus:border-primary/50 focus:ring-2 focus:ring-primary/10 transition-all duration-150"
            />
            <div className="flex justify-between items-center gap-2">
              <span className="text-[11px] text-muted-foreground">
                {newNote.length}/4000 حرف
              </span>
              <button
                onClick={addMemoryNote}
                disabled={createNoteMutation.isPending || !newNote.trim()}
                className="active-press touch-target inline-flex items-center gap-1.5 py-2 px-3.5 rounded-lg bg-primary text-primary-foreground border-none text-[13px] font-bold cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed hover-scale transition-all duration-150 min-h-[44px] md:min-h-[unset]"
              >
                {createNoteMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                {createNoteMutation.isPending ? "جارٍ الحفظ…" : "إضافة ملاحظة"}
              </button>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            {loadingNotes ? (
              <div className="py-6 text-center text-xs text-muted-foreground flex items-center justify-center gap-2">
                <Loader2 size={14} className="animate-spin" /> جارٍ تحميل الملاحظات…
              </div>
            ) : memoryNotes.length === 0 ? (
              <div className="py-6 text-center text-xs text-muted-foreground flex flex-col items-center gap-2">
                <Brain size={28} className="opacity-25" />
                <div>لا توجد ملاحظات ذكاء اصطناعي لهذا العميل بعد.</div>
                <button 
                  onClick={() => (document.querySelector('textarea[aria-label="ملاحظة ذكاء اصطناعي"]') as HTMLElement | null)?.focus()}
                  className="text-primary hover:underline text-[11px]"
                >
                  أضف أول ملاحظة
                </button>
              </div>
            ) : (
              memoryNotes.map((n) => (
                <div
                  key={n.id}
                  className="rounded-lg border border-border bg-muted/40 p-3 flex items-start gap-2.5 hover:bg-muted/60 transition-colors duration-150"
                >
                  <Brain size={14} className="shrink-0 mt-1 text-primary opacity-70" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm whitespace-pre-wrap break-words">{n.note}</p>
                    <div className="mt-1.5 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                      <span dir="ltr" className="flex items-center gap-1">
                        <Sparkles size={8} className="text-[#d4a574]" />
                        {n.createdBy}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock size={8} />
                        {fmtDate(n.createdAt)}
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={() => deleteMemoryNote(n.id)}
                    disabled={deletingNoteId === n.id}
                    title="حذف الملاحظة"
                    aria-label="حذف"
                    className="shrink-0 inline-flex items-center justify-center w-7 h-7 rounded-lg border border-border hover:bg-destructive/10 hover:border-destructive/40 hover:text-destructive transition-all duration-120 cursor-pointer disabled:opacity-50 active-press"
                  >
                    {deletingNoteId === n.id ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Sub-components (DS v4.0 Styled) ─────────────────────────────────

function Card({
  title, icon, children,
}: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="bg-card rounded-xl border border-border overflow-hidden shadow-sm">
      <div className="py-3 px-4 border-b border-border flex items-center gap-2">
        <span className="text-primary">{icon}</span>
        <h3 className="text-sm font-bold text-foreground">{title}</h3>
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

function InfoRow({
  icon, label, value, dir,
}: { icon: React.ReactNode; label: string; value?: string | null; dir?: string }) {
  const hasValue = value !== null && value !== undefined && value !== "";
  return (
    <div className="flex items-center gap-2.5 py-1.5 border-b border-border/50 text-xs">
      <span className="text-muted-foreground shrink-0">{icon}</span>
      <span className="text-muted-foreground text-[11px] min-w-[60px]">{label}:</span>
      <span
        className={cn(
          "flex-1 font-semibold text-end",
          dir === "ltr" && "[direction:ltr]",
          hasValue ? "text-foreground opacity-100" : "text-muted-foreground opacity-50"
        )}
      >
        {hasValue ? value : "—"}
      </span>
    </div>
  );
}

function SummaryRow({
  icon, label, value, color,
}: { icon: React.ReactNode; label: string; value: string; color: string }) {
  return (
    <div className="flex items-center justify-between p-2 px-2.5 rounded-lg bg-muted/50 border border-border/50 hover:bg-muted transition-colors duration-120">
      <div className="flex items-center gap-2">
        <span style={{ color }}>{icon}</span>
        <span className="text-xs text-muted-foreground font-semibold">{label}</span>
      </div>
      <span className="text-sm font-extrabold [direction:ltr]" style={{ color }} dir="ltr">{value}</span>
    </div>
  );
}

export default ClientProfile;

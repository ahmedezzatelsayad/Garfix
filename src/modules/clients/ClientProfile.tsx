// Responsive: sm/md/lg breakpoints added
"use client";

/**
 * ClientProfile — single-client detail view (clients/[id]/profile)
 *
 * Shows:
 *   • Client info card (name, email, phone, address, notes)
 *   • Balance summary card (invoice count, total due, total paid, outstanding)
 *   • Full invoice history table (number, date, status, total, paid, outstanding)
 *   • Back to Clients button
 *
 * Takes a `clientId` prop. Rendered by ClientsView when a row is clicked.
 */
import { useEffect, useState, useCallback } from "react";
import { authedFetch } from "@/context/AuthContext";
import { toast } from "sonner";
import {
  ArrowRight, User, Mail, Phone, MapPin, StickyNote, FileText, Wallet,
  AlertTriangle, CheckCircle2, Calendar, Building2, Brain, Plus, Trash2, Loader2,
} from "lucide-react";
import { num } from "@/lib/money";
import { cn } from "@/lib/utils";

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
  // Accept YYYY-MM-DD or ISO
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
  const [client, setClient] = useState<ClientInfo | null>(null);
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);

  // ─── Item 4: AI Memory Notes state ───────────────────────────────────
  const [memoryNotes, setMemoryNotes] = useState<AIMemoryNote[]>([]);
  const [newNote, setNewNote] = useState("");
  const [savingNote, setSavingNote] = useState(false);
  const [loadingNotes, setLoadingNotes] = useState(false);
  const [deletingNoteId, setDeletingNoteId] = useState<number | null>(null);

  const loadMemoryNotes = useCallback(async (slug: string, id: number) => {
    setLoadingNotes(true);
    try {
      const res = await authedFetch(
        `/api/ai/memory?companySlug=${encodeURIComponent(slug)}&entityType=client&entityId=${id}`,
      );
      if (res.ok) {
        const data = await res.json();
        setMemoryNotes(Array.isArray(data.notes) ? data.notes : []);
      } else {
        setMemoryNotes([]);
      }
    } catch {
      setMemoryNotes([]);
    } finally {
      setLoadingNotes(false);
    }
  }, []);

  const addMemoryNote = async () => {
    if (!client) return;
    const note = newNote.trim();
    if (!note) { toast.error("اكتب نص الملاحظة أولًا"); return; }
    if (note.length > 4000) { toast.error("النص طويل جداً (الحد 4000 حرف)"); return; }
    setSavingNote(true);
    try {
      const res = await authedFetch("/api/ai/memory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companySlug: client.companySlug,
          entityType: "client",
          entityId: client.id,
          note,
        }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error || "تعذّر الحفظ");
      }
      const data = await res.json();
      if (data.note) {
        setMemoryNotes((prev) => [data.note, ...prev]);
      }
      setNewNote("");
      toast.success("تم حفظ الملاحظة");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "خطأ");
    } finally {
      setSavingNote(false);
    }
  };

  const deleteMemoryNote = async (noteId: number) => {
    if (!client) return;
    if (!confirm("حذف هذه الملاحظة؟")) return;
    setDeletingNoteId(noteId);
    try {
      const res = await authedFetch(`/api/ai/memory/${noteId}`, { method: "DELETE" });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error || "تعذّر الحذف");
      }
      setMemoryNotes((prev) => prev.filter((n) => n.id !== noteId));
      toast.success("تم حذف الملاحظة");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "خطأ");
    } finally {
      setDeletingNoteId(null);
    }
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authedFetch(`/api/clients/${clientId}/profile`);
      if (res.ok) {
        const data = await res.json();
        setClient(data.client);
        setInvoices(data.invoices || []);
        setSummary(data.summary || null);
        if (data.client?.companySlug && data.client?.id) {
          loadMemoryNotes(data.client.companySlug, data.client.id);
        }
      } else if (res.status === 404) {
        toast.error("العميل غير موجود");
        onBack();
      } else if (res.status === 403) {
        toast.error("ليس لديك صلاحية لعرض هذا العميل");
        onBack();
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || "تعذّر تحميل الملف");
      }
    } finally { setLoading(false); }
  }, [clientId, onBack, loadMemoryNotes]);

  // setState runs inside async .then() callback in load (after await authedFetch) — not synchronous in effect body; no cascading render.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <div className="p-12 text-center text-muted-foreground">
        جارٍ التحميل…
      </div>
    );
  }

  if (!client) {
    return (
      <div className="p-12 text-center text-muted-foreground">
        تعذّر تحميل بيانات العميل
      </div>
    );
  }

  const outstanding = summary?.outstanding || 0;
  const fullyPaid = outstanding < 0.001 && (summary?.invoiceCount || 0) > 0;

  return (
    <div className="flex flex-col gap-4">
      {/* Header bar with Back button */}
      <div className="flex flex-wrap justify-between items-center gap-3">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md bg-card border border-border text-foreground font-bold text-xs cursor-pointer max-md:min-h-[44px]"
          >
            <ArrowRight size={14} /> العودة للعملاء
          </button>
          <div>
            <h1 className="text-[22px] font-extrabold flex items-center gap-2">
              <User size={20} /> {client.name}
            </h1>
            <p className="text-xs text-muted-foreground">
              ملف العميل • {invoices.length} فاتورة
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Client info card */}
        <Card title="معلومات العميل" icon={<User size={16} />}>
          <InfoRow icon={<Mail size={13} />} label="البريد" value={client.email} dir="ltr" />
          <InfoRow icon={<Phone size={13} />} label="الهاتف" value={client.phone} dir="ltr" />
          <InfoRow icon={<Building2 size={13} />} label="الشركة" value={client.company} />
          <InfoRow icon={<MapPin size={13} />} label="العنوان" value={client.address} />
          <InfoRow icon={<Calendar size={13} />} label="عميل منذ" value={fmtDate(client.createdAt)} />
          {client.notes && (
            <div className="mt-2 p-2.5 bg-muted rounded-sm border border-border text-xs text-foreground flex gap-2 items-start">
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
                style={{
                  marginTop: 4,
                  padding: 12,
                  borderRadius: 10,
                  background: outstanding > 0
                    ? (fullyPaid ? "#10b98122" : "#ef444422")
                    : "#10b98122",
                  border: `1px solid ${outstanding > 0 && !fullyPaid ? "#ef4444" : "#10b981"}`,
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                }}
              >
                <div className="flex items-center gap-2">
                  {fullyPaid
                    ? <CheckCircle2 size={16} style={{ color: "#10b981" }} />
                    : <AlertTriangle size={16} style={{ color: "#ef4444" }} />}
                  <span className="text-xs font-bold text-foreground">
                    {fullyPaid ? "مدفوع بالكامل" : "المبلغ المستحق"}
                  </span>
                </div>
                <span
                  style={{
                    fontSize: 16, fontWeight: 800,
                    color: fullyPaid ? "#10b981" : "#ef4444",
                    direction: "ltr",
                  }}
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
                      <span key={status} style={{
                        display: "inline-flex", alignItems: "center", gap: 4,
                        padding: "3px 10px", borderRadius: "999px",
                        background: meta.bg, color: meta.color,
                        fontSize: 11, fontWeight: 700,
                      }}>
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
      <div className="bg-card rounded-[14px] border border-border overflow-hidden">
        <div className="py-3 px-4 border-b border-border flex justify-between items-center">
          <h3 className="text-sm font-bold flex items-center gap-1.5">
            <FileText size={14} /> سجل الفواتير
          </h3>
          <span className="text-[11px] text-muted-foreground">
            {invoices.length} فاتورة
          </span>
        </div>

        {invoices.length === 0 ? (
          <div className="p-12 text-center text-muted-foreground">
            <FileText size={36} className="opacity-30 mb-2" />
            <div>لا توجد فواتير لهذا العميل</div>
          </div>
        ) : (
          <>
          {/* Desktop table */}
          <div className="hidden md:block overflow-x-auto garfix-scroll">
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="border-b border-border bg-muted">
                  <th className={thStyle}>رقم الفاتورة</th>
                  <th className={thStyle}>تاريخ الإصدار</th>
                  <th className={thStyle}>الاستحقاق</th>
                  <th className={thStyle}>الحالة</th>
                  <th className={thStyle}>الإجمالي</th>
                  <th className={thStyle}>المدفوع</th>
                  <th className={thStyle}>المستحق</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv) => {
                  const meta = STATUS_LABELS[inv.status] || { label: inv.status, color: "#6b7280", bg: "#6b728022" };
                  return (
                    <tr key={inv.id} className="border-b border-border">
                      <td className={cn(tdStyle, "font-bold [direction:ltr] text-end")}>
                        {inv.invoiceNumber}
                      </td>
                      <td className={tdStyle}>{fmtDate(inv.issueDate)}</td>
                      <td className={tdStyle}>{fmtDate(inv.dueDate)}</td>
                      <td className={tdStyle}>
                        <span style={{
                          display: "inline-flex", alignItems: "center",
                          padding: "3px 10px", borderRadius: "999px",
                          background: meta.bg, color: meta.color,
                          fontSize: 11, fontWeight: 700,
                        }}>
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
                        style={{
                          padding: "10px 12px", verticalAlign: "middle",
                          direction: "ltr", textAlign: "right",
                          fontWeight: 700,
                          color: inv.outstanding > 0 ? "#ef4444" : "#10b981",
                        }}
                      >
                        {fmtMoney(inv.outstanding)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              {invoices.length > 1 && (
                <tfoot>
                  <tr className="border-t-2 border-border bg-muted">
                    <td className={cn(tdStyle, "font-extrabold")} colSpan={4}>الإجمالي</td>
                    <td className={cn(tdStyle, "[direction:ltr] text-end font-extrabold")}>
                      {fmtMoney(summary?.totalDue || 0)}
                    </td>
                    <td className={cn(tdStyle, "[direction:ltr] text-end font-extrabold text-[#10b981]")}>
                      {fmtMoney(summary?.totalPaid || 0)}
                    </td>
                    <td
                      style={{
                        padding: "10px 12px", verticalAlign: "middle",
                        direction: "ltr", textAlign: "right", fontWeight: 800,
                        color: (summary?.outstanding || 0) > 0 ? "#ef4444" : "#10b981",
                      }}
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
                <div key={inv.id} className="p-3 flex flex-col gap-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold text-[13px]" dir="ltr">{inv.invoiceNumber}</span>
                    <span style={{
                      display: "inline-flex", alignItems: "center",
                      padding: "3px 10px", borderRadius: "999px",
                      background: meta.bg, color: meta.color,
                      fontSize: 11, fontWeight: 700,
                    }}>
                      {meta.label}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-1.5 text-[12px]">
                    <div><span className="text-muted-foreground text-[11px]">الإصدار: </span>{fmtDate(inv.issueDate)}</div>
                    <div><span className="text-muted-foreground text-[11px]">الاستحقاق: </span>{fmtDate(inv.dueDate)}</div>
                    <div><span className="text-muted-foreground text-[11px]">الإجمالي: </span><span className="font-semibold" dir="ltr">{fmtMoney(inv.total)}</span></div>
                    <div><span className="text-muted-foreground text-[11px]">المدفوع: </span><span className="text-[#10b981]" dir="ltr">{inv.paid > 0 ? fmtMoney(inv.paid) : "—"}</span></div>
                    <div className="col-span-2"><span className="text-muted-foreground text-[11px]">المستحق: </span><span className="font-bold" style={{ color: inv.outstanding > 0 ? "#ef4444" : "#10b981" }} dir="ltr">{fmtMoney(inv.outstanding)}</span></div>
                  </div>
                </div>
              );
            })}
            {invoices.length > 1 && (
              <div className="p-3 bg-muted flex flex-wrap justify-between gap-2 text-[12px] font-extrabold">
                <span>الإجمالي:</span>
                <span className="text-[#10b981]" dir="ltr">مدفوع {fmtMoney(summary?.totalPaid || 0)}</span>
                <span style={{ color: (summary?.outstanding || 0) > 0 ? "#ef4444" : "#10b981" }} dir="ltr">مستحق {fmtMoney(summary?.outstanding || 0)}</span>
              </div>
            )}
          </div>
          </>
        )}
      </div>

      {/* ─── Item 4: AI Memory Notes ──────────────────────────────────── */}
      <div className="bg-card rounded-[14px] border border-border overflow-hidden">
        <div className="py-3 px-4 border-b border-border flex justify-between items-center gap-2">
          <h3 className="text-sm font-bold flex items-center gap-1.5">
            <Brain size={14} className="text-primary" /> ملاحظات الذكاء الاصطناعي
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
              placeholder="اكتب ملاحظة عن هذا العميل — يستخدمها الذكاء الاصطناعي لاحقًا لتقديم توصيات أفضل (مثال: يفضّل الدفع نقدًا، يعمل في مجال البناء، موسمي النشاط في الصيف…)"
              rows={3}
              maxLength={4000}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm font-inherit resize-y"
            />
            <div className="flex justify-between items-center gap-2">
              <span className="text-[11px] text-muted-foreground">
                {newNote.length}/4000 حرف
              </span>
              <button
                onClick={addMemoryNote}
                disabled={savingNote || !newNote.trim()}
                className="inline-flex items-center gap-1.5 py-2 px-3.5 rounded-md bg-primary text-primary-foreground border-none text-[13px] font-bold cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {savingNote ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                {savingNote ? "جارٍ الحفظ…" : "إضافة ملاحظة"}
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
              </div>
            ) : (
              memoryNotes.map((n) => (
                <div
                  key={n.id}
                  className="rounded-md border border-border bg-muted/40 p-3 flex items-start gap-2.5"
                >
                  <Brain size={14} className="shrink-0 mt-1 text-primary opacity-70" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm whitespace-pre-wrap break-words">{n.note}</p>
                    <div className="mt-1.5 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                      <span dir="ltr">{n.createdBy}</span>
                      <span>{fmtDate(n.createdAt)}</span>
                    </div>
                  </div>
                  <button
                    onClick={() => deleteMemoryNote(n.id)}
                    disabled={deletingNoteId === n.id}
                    title="حذف الملاحظة"
                    className="shrink-0 inline-flex items-center justify-center w-7 h-7 rounded-md border border-border hover:bg-destructive/10 hover:border-destructive/40 hover:text-destructive transition-colors cursor-pointer disabled:opacity-50"
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

// ─── Sub-components ───────────────────────────────────────────────────────

function Card({
  title, icon, children,
}: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="bg-card rounded-[14px] border border-border overflow-hidden">
      <div className="py-3 px-4 border-b border-border flex items-center gap-2">
        <span className="text-primary">{icon}</span>
        <h3 className="text-sm font-bold">{title}</h3>
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
    <div className="flex items-center gap-2.5 py-1.5 border-b border-border text-xs">
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
    <div className="flex items-center justify-between p-2 px-2.5 rounded-sm bg-muted border border-border">
      <div className="flex items-center gap-2">
        <span style={{ color }}>{icon}</span>
        <span className="text-xs text-muted-foreground font-semibold">{label}</span>
      </div>
      <span style={{ fontSize: 14, fontWeight: 800, color, direction: "ltr" }}>{value}</span>
    </div>
  );
}

export default ClientProfile;

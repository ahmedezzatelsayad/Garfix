"use client";

/**
 * AutomationView — Item 3 (minimal version).
 *
 * Shows the list of automation rules for the active company and lets the
 * user toggle each rule on/off (PATCH /api/automation/[id]?companySlug=X
 * with { isActive: boolean }).
 *
 * Per the verified-gaps brief: this is intentionally minimal — list +
 * toggle. Creating / editing advanced rules (trigger picker, condition
 * builder, action editor) is deferred to a follow-up session.
 *
 * Backend contract:
 *   GET    /api/automation?companySlug=X           → { rules: Rule[] }
 *   PATCH  /api/automation/[id]?companySlug=X      → { rule }
 *   DELETE /api/automation/[id]?companySlug=X      → { ok }
 */
import { useEffect, useState, useCallback } from "react";
import { useBrand } from "@/context/BrandContext";
import { authedFetch } from "@/context/AuthContext";
import { toast } from "sonner";
import { Zap, Loader2, Trash2, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

interface AutomationAction {
  type: string; // send_whatsapp | create_task | send_email
  params?: Record<string, unknown>;
}

interface AutomationRule {
  id: number;
  companySlug: string;
  name: string;
  trigger: string; // invoice_created | stock_low | payment_overdue
  condition: Record<string, unknown>;
  actions: AutomationAction[];
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

const TRIGGER_LABELS: Record<string, { label: string; color: string; bg: string; icon: string }> = {
  invoice_created: { label: "عند إنشاء فاتورة", color: "#3b82f6", bg: "#3b82f622", icon: "📄" },
  stock_low: { label: "عند انخفاض المخزون", color: "#f59e0b", bg: "#f59e0b22", icon: "📦" },
  payment_overdue: { label: "عند تأخر السداد", color: "#ef4444", bg: "#ef444422", icon: "⏰" },
};

const ACTION_LABELS: Record<string, { label: string; icon: string }> = {
  send_whatsapp: { label: "إرسال واتساب", icon: "💬" },
  create_task: { label: "إنشاء مهمة", icon: "✅" },
  send_email: { label: "إرسال بريد", icon: "✉️" },
};

function fmtDate(s: string): string {
  if (!s) return "—";
  try {
    const d = new Date(s);
    if (isNaN(d.getTime())) return s;
    return d.toLocaleString("ar-EG", { dateStyle: "medium", timeStyle: "short" });
  } catch { return s; }
}

export function AutomationView() {
  const { activeCompany } = useBrand();
  const [rules, setRules] = useState<AutomationRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [togglingId, setTogglingId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const load = useCallback(async () => {
    if (!activeCompany) { setLoading(false); return; }
    setLoading(true);
    try {
      const res = await authedFetch(`/api/automation?companySlug=${encodeURIComponent(activeCompany.slug)}`);
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        toast.error(e.error || "تعذّر تحميل القواعد");
        setRules([]);
        return;
      }
      const data = await res.json();
      setRules(Array.isArray(data.rules) ? data.rules : []);
    } catch {
      setRules([]);
    } finally {
      setLoading(false);
    }
  }, [activeCompany]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);

  const toggleRule = async (rule: AutomationRule) => {
    if (!activeCompany) return;
    setTogglingId(rule.id);
    try {
      const res = await authedFetch(
        `/api/automation/${rule.id}?companySlug=${encodeURIComponent(activeCompany.slug)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ isActive: !rule.isActive }),
        },
      );
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error || "تعذّر التحديث");
      }
      const data = await res.json();
      if (data.rule) {
        setRules((prev) => prev.map((r) => (r.id === rule.id ? data.rule : r)));
      }
      toast.success(rule.isActive ? "تم تعطيل القاعدة" : "تم تفعيل القاعدة");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "خطأ");
    } finally {
      setTogglingId(null);
    }
  };

  const deleteRule = async (rule: AutomationRule) => {
    if (!activeCompany) return;
    if (!confirm(`حذف القاعدة "${rule.name}"؟ لا يمكن التراجع.`)) return;
    setDeletingId(rule.id);
    try {
      const res = await authedFetch(
        `/api/automation/${rule.id}?companySlug=${encodeURIComponent(activeCompany.slug)}`,
        { method: "DELETE" },
      );
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error || "تعذّر الحذف");
      }
      setRules((prev) => prev.filter((r) => r.id !== rule.id));
      toast.success("تم حذف القاعدة");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "خطأ");
    } finally {
      setDeletingId(null);
    }
  };

  if (!activeCompany) {
    return <div className="p-8 md:p-12 text-center text-muted-foreground">اختر شركة أولاً</div>;
  }

  const activeCount = rules.filter((r) => r.isActive).length;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap justify-between items-center gap-3">
        <div>
          <h1 className="text-xl md:text-2xl font-extrabold flex items-center gap-2">
            <Zap size={20} /> قواعد الأتمتة
          </h1>
          <p className="text-[13px] text-muted-foreground">
            {activeCompany.nameAr || activeCompany.name} • {rules.length} قاعدة ({activeCount} نشطة)
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={load}
            disabled={loading}
            title="تحديث"
            className="inline-flex items-center gap-1.5 py-2.5 px-3.5 rounded-[10px] bg-card text-foreground border border-border text-[13px] font-bold cursor-pointer disabled:opacity-50"
          >
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} /> تحديث
          </button>
        </div>
      </div>

      {/* ─── Info banner: this is the minimal version ─────────────────── */}
      <div className="bg-muted/50 border border-border rounded-[12px] p-3 text-xs leading-relaxed text-muted-foreground">
        <strong className="text-foreground">ملاحظة:</strong> هذه نسخة أولية (list + toggle فقط).
        إنشاء قواعد جديدة ومحرر متقدم للشروط/الإجراءات مؤجّل لجلسة تالية — يجب إنشاؤها حاليًا
        عبر الـ API مباشرة (<code className="font-mono text-[11px]">POST /api/automation</code>).
      </div>

      {loading ? (
        <div className="bg-card rounded-[14px] border border-border p-8 md:p-12 text-center text-muted-foreground flex items-center justify-center gap-2">
          <Loader2 size={16} className="animate-spin" /> جارٍ التحميل…
        </div>
      ) : rules.length === 0 ? (
        <div className="bg-card rounded-[14px] border border-border p-8 md:p-12 text-center text-muted-foreground flex flex-col items-center gap-2">
          <Zap size={36} className="opacity-30" />
          <div>لا توجد قواعد أتمتة بعد لهذه الشركة.</div>
          <div className="text-[11px] mt-1">
            استخدم <code className="font-mono">POST /api/automation</code> لإنشاء قاعدة أولى.
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-2.5">
          {rules.map((rule) => {
            const trigger = TRIGGER_LABELS[rule.trigger] || { label: rule.trigger, color: "#6b7280", bg: "#6b728022", icon: "⚡" };
            const isToggling = togglingId === rule.id;
            const isDeleting = deletingId === rule.id;
            return (
              <div
                key={rule.id}
                className={cn(
                  "bg-card rounded-[14px] border border-border p-4 flex flex-col gap-3 transition-all",
                  rule.isActive ? "border-l-4 border-l-emerald-500" : "opacity-70",
                )}
              >
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <div
                      className="shrink-0 w-10 h-10 rounded-[10px] flex items-center justify-center text-lg"
                      style={{ background: trigger.bg }} /* TAILWINDBREAK: dynamic trigger bg color */
                    >
                      {trigger.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-bold text-base truncate">{rule.name}</h3>
                        <span
                          className="text-[11px] font-bold py-0.5 px-2 rounded-full"
                          style={{ background: trigger.bg, color: trigger.color }} /* TAILWINDBREAK: dynamic trigger colors */
                        >
                          {trigger.label}
                        </span>
                        {rule.isActive ? (
                          <span className="text-[10px] font-bold py-0.5 px-2 rounded-full bg-emerald-500/15 text-emerald-500">
                            ● نشطة
                          </span>
                        ) : (
                          <span className="text-[10px] font-bold py-0.5 px-2 rounded-full bg-gray-400/15 text-gray-400">
                            ○ متوقفة
                          </span>
                        )}
                      </div>
                      <div className="text-[12px] text-muted-foreground mt-1">
                        {rule.actions.length > 0 ? (
                          <span className="inline-flex flex-wrap items-center gap-1.5">
                            <span>الإجراءات:</span>
                            {rule.actions.map((a, i) => {
                              const al = ACTION_LABELS[a.type] || { label: a.type, icon: "•" };
                              return (
                                <span key={i} className="inline-flex items-center gap-1 py-0.5 px-2 rounded-md bg-muted text-[11px] font-semibold">
                                  <span>{al.icon}</span>
                                  <span>{al.label}</span>
                                </span>
                              );
                            })}
                          </span>
                        ) : (
                          <span className="text-amber-600">لا توجد إجراءات</span>
                        )}
                      </div>
                      <div className="text-[10px] text-muted-foreground mt-1.5">
                        أُنشئت {fmtDate(rule.createdAt)} • آخر تحديث {fmtDate(rule.updatedAt)}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => toggleRule(rule)}
                      disabled={isToggling}
                      title={rule.isActive ? "تعطيل" : "تفعيل"}
                      className={cn(
                        "inline-flex items-center gap-1.5 py-2 px-3.5 rounded-md border text-[12px] font-bold cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-not-allowed",
                        rule.isActive
                          ? "border-amber-500/40 bg-amber-500/10 text-amber-700 hover:bg-amber-500/20"
                          : "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/20",
                      )}
                    >
                      {isToggling ? <Loader2 size={12} className="animate-spin" /> : null}
                      {rule.isActive ? "تعطيل" : "تفعيل"}
                    </button>
                    <button
                      onClick={() => deleteRule(rule)}
                      disabled={isDeleting}
                      title="حذف"
                      className="inline-flex items-center justify-center w-9 h-9 rounded-md border border-border hover:bg-destructive/10 hover:border-destructive/40 hover:text-destructive transition-colors cursor-pointer disabled:opacity-50"
                    >
                      {isDeleting ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default AutomationView;

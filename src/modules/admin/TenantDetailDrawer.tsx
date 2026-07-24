"use client";

import { useEffect, useState } from "react";
import { authedFetch } from "@/context/AuthContext";
import { toast } from "sonner";
import { Shield, ChevronLeft, ListChecks } from "lucide-react";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import type { TenantDetail } from "./types";

/**
 * GATE 4 — Tenant Detail Drawer (Support View).
 * Calls GET /api/platform-admin/tenants/[slug] and shows operational overview:
 * invoice count, last invoice, user count, client count, stock movements,
 * review-queue errors, oversell warnings, last activity timestamp.
 * Founder can act without logging in as the tenant.
 *
 * P1-UI-Agent refactor: switched from custom overlay <div> to shadcn Sheet
 * for proper focus-trap, ESC handling, scroll lock, and aria attributes.
 */
export function TenantDetailDrawer({ slug, onClose, onOpenReviewQueue }: { slug: string; onClose: () => void; onOpenReviewQueue?: (slug: string) => void; }) {
  const [detail, setDetail] = useState<TenantDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [planSaving, setPlanSaving] = useState(false);
  const [planDraft, setPlanDraft] = useState<string>("");
  const [subStatusDraft, setSubStatusDraft] = useState<string>("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await authedFetch(`/api/platform-admin/tenants/${encodeURIComponent(slug)}`);
        const data = await res.json();
        if (!cancelled) {
          if (res.ok) {
            setDetail(data);
            setPlanDraft(data.tenant.plan);
            setSubStatusDraft(data.tenant.subscriptionStatus);
          } else {
            toast.error(data.error || "تعذّر تحميل التفاصيل");
          }
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [slug]);

  const savePlan = async () => {
    if (!detail) return;
    setPlanSaving(true);
    try {
      const body: Record<string, string> = {};
      if (planDraft !== detail.tenant.plan) body.plan = planDraft;
      if (subStatusDraft !== detail.tenant.subscriptionStatus) body.subscriptionStatus = subStatusDraft;
      if (Object.keys(body).length === 0) {
        toast.info("لا توجد تغييرات لحفظها");
        return;
      }
      const res = await authedFetch(`/api/platform-admin/tenants/${encodeURIComponent(slug)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "تعذّر تحديث الباقة");
      toast.success("تم تحديث الباقة بنجاح");
      setDetail((d) => d ? { ...d, tenant: { ...d.tenant, plan: data.tenant.plan, subscriptionStatus: data.tenant.subscriptionStatus } } : d);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "خطأ");
    } finally {
      setPlanSaving(false);
    }
  };

  return (
    <Sheet open={true} onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetContent
        side="left"
        dir="rtl"
        className="w-[min(560px,100vw)] max-w-none !gap-4 overflow-y-auto p-5"
        aria-describedby={undefined}
      >
        <SheetHeader className="p-0 !gap-1">
          <SheetTitle className="text-right text-[16px] font-extrabold flex items-center gap-2">
            <ChevronLeft size={18} />
            {detail?.tenant.emoji} {detail?.tenant.nameAr || detail?.tenant.name || slug}
          </SheetTitle>
        </SheetHeader>
        {loading ? (
          <div className="p-6 md:p-12 text-center text-[var(--muted-foreground)]">جارٍ التحميل…</div>
        ) : detail ? (
          <>
            {/* Plan management card */}
            <div className="p-3.5 bg-[var(--card)] rounded-xl border border-[var(--border)]">
              <div className="flex items-center gap-1.5 mb-2.5">
                <Shield className="text-violet-600" size={14} />
                <span className="text-[13px] font-extrabold">إدارة الباقة</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 mb-2.5">
                <div>
                  <label className="block text-[10px] text-[var(--muted-foreground)] font-semibold mb-1">الباقة</label>
                  <select
                    value={planDraft}
                    onChange={(e) => setPlanDraft(e.target.value)}
                    className="w-full px-1.5 py-1 bg-[var(--background)] border border-[var(--border)] rounded-md text-[var(--foreground)] text-xs font-inherit"
                  >
                    <option value="trial">تجريبي (مجاني)</option>
                    <option value="starter">Starter ($9.99)</option>
                    <option value="professional">Professional ($19.99)</option>
                    <option value="unlimited">Unlimited ($29.99)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] text-[var(--muted-foreground)] font-semibold mb-1">حالة الاشتراك</label>
                  <select
                    value={subStatusDraft}
                    onChange={(e) => setSubStatusDraft(e.target.value)}
                    className="w-full px-1.5 py-1 bg-[var(--background)] border border-[var(--border)] rounded-md text-[var(--foreground)] text-xs font-inherit"
                  >
                    <option value="active">نشط</option>
                    <option value="trialing">فترة تجريبية</option>
                    <option value="past_due">متأخر الدفع</option>
                    <option value="canceled">ملغي</option>
                    <option value="suspended">موقوف</option>
                  </select>
                </div>
              </div>
              <button
                onClick={savePlan}
                disabled={planSaving}
                className="px-4 py-1.5 rounded-lg border-none text-white text-xs font-bold font-inherit" /* TAILWINDBREAK: dynamic bg/opacity/cursor */ style={{ background: planSaving ? "var(--muted)" : "#7c3aed", cursor: planSaving ? "not-allowed" : "pointer", opacity: planSaving ? 0.7 : 1 }}
              >
                {planSaving ? "جارٍ الحفظ…" : "حفظ الباقة"}
              </button>
              {(planDraft !== detail.tenant.plan || subStatusDraft !== detail.tenant.subscriptionStatus) && (
                <div className="mt-2 text-[10px] text-amber-500 font-semibold">
                  ⚠️ تغييرات غير محفوظة
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
              <DetailStat label="الباقة الحالية" value={detail.tenant.plan} />
              <DetailStat label="الحالة" value={detail.tenant.subscriptionStatus} />
              <DetailStat label="الفواتير" value={String(detail.overview.invoicesCount)} />
              <DetailStat label="المستخدمون" value={String(detail.overview.usersCount)} />
              <DetailStat label="العملاء" value={String(detail.overview.clientsCount)} />
              <DetailStat label="حركات المخزون" value={String(detail.overview.movementsCount)} />
              <DetailStat label="عناصر بانتظار المراجعة" value={String(detail.overview.reviewQueueCount)} color={detail.overview.reviewQueueCount > 0 ? "#f59e0b" : undefined} />
              <DetailStat label="تحذيرات Oversell" value={String(detail.overview.oversellCount)} color={detail.overview.oversellCount > 0 ? "#ef4444" : undefined} />
            </div>
            {/* GATE 4 Task 2: deep-link to per-tenant ReviewQueueModal when there are pending items. */}
            {detail.overview.reviewQueueCount > 0 && onOpenReviewQueue && (
              <button
                type="button"
                onClick={() => onOpenReviewQueue(slug)}
                className="inline-flex items-center gap-2 px-3.5 py-2.5 rounded-[10px] bg-amber-500 text-white border-none font-inherit text-xs font-bold cursor-pointer shadow-[0_1px_2px_rgba(245,158,11,0.3)]"
              >
                <ListChecks size={14} />
                افتح طابور المراجعة لهذه الشركة ({detail.overview.reviewQueueCount} عنصر)
              </button>
            )}
            <div className="text-[11px] text-[var(--muted-foreground)]">
              آخر نشاط: {new Date(detail.overview.lastActivityAt).toLocaleString("ar-EG")}
            </div>
            {detail.overview.lastInvoice && (
              <div className="p-3 bg-[var(--muted)] rounded-[10px] text-xs">
                <div className="font-bold mb-1">آخر فاتورة:</div>
                <div>رقم: {detail.overview.lastInvoice.invoiceNumber}</div>
                <div>التاريخ: {new Date(detail.overview.lastInvoice.createdAt).toLocaleString("ar-EG")}</div>
                <div>الإجمالي: {detail.overview.lastInvoice.total}</div>
              </div>
            )}
            {detail.tenant.deletedAt && (
              <div className="px-3 py-2 bg-red-500/10 rounded-lg text-[11px] text-red-500">
                ⚠️ هذه الشركة موقوفة (soft-deleted) بتاريخ {new Date(detail.tenant.deletedAt).toLocaleString("ar-EG")}
              </div>
            )}
          </>
        ) : (
          <div className="p-4 md:p-8 text-center text-[var(--muted-foreground)]">تعذّر التحميل</div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function DetailStat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="p-2.5 bg-[var(--card)] rounded-lg border border-[var(--border)]">
      <div className="text-[10px] text-[var(--muted-foreground)] font-semibold">{label}</div>
      <div className="text-base font-extrabold" /* TAILWINDBREAK: dynamic color */ style={{ color: color || "var(--foreground)" }}>{value}</div>
    </div>
  );
}

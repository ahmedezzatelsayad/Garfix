"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Shield, ChevronLeft, ListChecks } from "lucide-react";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import type { TenantDetail } from "./types";
import {
  usePlatformTenant,
  useUpdatePlatformTenant,
} from "@/hooks/queries";

/**
 * GATE 4 — Tenant Detail Drawer (Support View).
 * Uses TanStack Query hooks for tenant detail and plan updates.
 */
export function TenantDetailDrawer({ slug, onClose, onOpenReviewQueue }: { slug: string; onClose: () => void; onOpenReviewQueue?: (slug: string) => void; }) {
  const tenantQuery = usePlatformTenant(slug);
  const updateMutation = useUpdatePlatformTenant();

  const detail = tenantQuery.data as TenantDetail | null | undefined;
  const loading = tenantQuery.isLoading;
  const [planSaving, setPlanSaving] = useState(false);
  const [planDraft, setPlanDraft] = useState<string>("");
  const [subStatusDraft, setSubStatusDraft] = useState<string>("");

  // Sync drafts when detail arrives
  const prevDetailRef = useState<TenantDetail | null | undefined>(null);
  const [prevDetail, setPrevDetail] = prevDetailRef;
  if (detail && prevDetail !== detail) {
    setPrevDetail(detail);
    const tenant = (detail as unknown as Record<string, unknown>).tenant as Record<string, unknown> || (detail as unknown as Record<string, unknown>);
    setPlanDraft((tenant.plan as string) || "");
    setSubStatusDraft((tenant.subscriptionStatus as string) || "");
  }

  const savePlan = async () => {
    if (!detail) return;
    setPlanSaving(true);
    try {
      const tenant = (detail as unknown as Record<string, unknown>).tenant as Record<string, unknown>;
      const body: Record<string, string> = {};
      if (planDraft !== (tenant.plan as string)) body.plan = planDraft;
      if (subStatusDraft !== (tenant.subscriptionStatus as string)) body.subscriptionStatus = subStatusDraft;
      if (Object.keys(body).length === 0) {
        toast.info("لا توجد تغييرات لحفظها");
        return;
      }
      const result = await updateMutation.mutateAsync({ slug, ...body });
      toast.success("تم تحديث الباقة بنجاح");
      // Update local state with the mutation result
      const resultTenant = (result as Record<string, unknown>).tenant as Record<string, unknown> || result;
      setPlanDraft((resultTenant.plan as string) || planDraft);
      setSubStatusDraft((resultTenant.subscriptionStatus as string) || subStatusDraft);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "خطأ");
    } finally {
      setPlanSaving(false);
    }
  };

  // Extract tenant data from detail
  const tenant = detail ? (detail as unknown as Record<string, unknown>).tenant as Record<string, unknown> : null;
  const overview = detail ? (detail as unknown as Record<string, unknown>).overview as Record<string, unknown> : null;

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
            {(tenant?.emoji as string)} {(tenant?.nameAr as string) || (tenant?.name as string) || slug}
          </SheetTitle>
        </SheetHeader>
        {loading ? (
          <div className="p-6 md:p-12 text-center text-[var(--muted-foreground)]">جارٍ التحميل…</div>
        ) : detail && tenant && overview ? (
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
              {(planDraft !== (tenant.plan as string) || subStatusDraft !== (tenant.subscriptionStatus as string)) && (
                <div className="mt-2 text-[10px] text-amber-500 font-semibold">
                  ⚠️ تغييرات غير محفوظة
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
              <DetailStat label="الباقة الحالية" value={(tenant.plan as string) || "—"} />
              <DetailStat label="الحالة" value={(tenant.subscriptionStatus as string) || "—"} />
              <DetailStat label="الفواتير" value={String(overview.invoicesCount as number)} />
              <DetailStat label="المستخدمون" value={String(overview.usersCount as number)} />
              <DetailStat label="العملاء" value={String(overview.clientsCount as number)} />
              <DetailStat label="حركات المخزون" value={String(overview.movementsCount as number)} />
              <DetailStat label="عناصر بانتظار المراجعة" value={String(overview.reviewQueueCount as number)} color={(overview.reviewQueueCount as number) > 0 ? "#f59e0b" : undefined} />
              <DetailStat label="تحذيرات Oversell" value={String(overview.oversellCount as number)} color={(overview.oversellCount as number) > 0 ? "#ef4444" : undefined} />
            </div>
            {(overview.reviewQueueCount as number) > 0 && onOpenReviewQueue && (
              <button
                type="button"
                onClick={() => onOpenReviewQueue(slug)}
                className="inline-flex items-center gap-2 px-3.5 py-2.5 rounded-[10px] bg-amber-500 text-white border-none font-inherit text-xs font-bold cursor-pointer shadow-[0_1px_2px_rgba(245,158,11,0.3)]"
              >
                <ListChecks size={14} />
                افتح طابور المراجعة لهذه الشركة ({overview.reviewQueueCount as number} عنصر)
              </button>
            )}
            <div className="text-[11px] text-[var(--muted-foreground)]">
              آخر نشاط: {new Date(overview.lastActivityAt as string).toLocaleString("ar-EG")}
            </div>
            {overview.lastInvoice && (
              <div className="p-3 bg-[var(--muted)] rounded-[10px] text-xs">
                <div className="font-bold mb-1">آخر فاتورة:</div>
                <div>رقم: {(overview.lastInvoice as Record<string, unknown>).invoiceNumber as string}</div>
                <div>التاريخ: {new Date((overview.lastInvoice as Record<string, unknown>).createdAt as string).toLocaleString("ar-EG")}</div>
                <div>الإجمالي: {(overview.lastInvoice as Record<string, unknown>).total as number}</div>
              </div>
            )}
            {tenant.deletedAt && (
              <div className="px-3 py-2 bg-red-500/10 rounded-lg text-[11px] text-red-500">
                ⚠️ هذه الشركة موقوفة (soft-deleted) بتاريخ {new Date(tenant.deletedAt as string).toLocaleString("ar-EG")}
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

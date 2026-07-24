"use client";

import { useEffect, useState, useCallback } from "react";
import { authedFetch } from "@/context/AuthContext";
import { toast } from "sonner";
import { ListChecks, AlertTriangle, Eye } from "lucide-react";
import { IconBtn } from "./shared-helpers";

/**
 * P1.8 fix (Remaining Work Handoff) — Review Queue management screen.
 * Lists pending ProductMatchAudit entries (tier="suggested" + tier="collision-
 * recovery-failed") across ALL tenants, with a per-tenant breakdown. Founder
 * can filter by tier or by tenant. Each row shows the input text, the matched
 * product (if any), confidence, tier, and a deep link to the per-tenant
 * /api/product-matching/review endpoint for accept/reject/override actions.
 *
 * The accept/reject/override mutations are intentionally NOT built here —
 * they belong on the per-tenant review endpoint (which already has the
 * proper permission gating). This founder view is read-only aggregation.
 */
export function ReviewQueueTab({ onOpenReviewQueue }: { onOpenReviewQueue: (slug: string | null) => void }) {
  const [data, setData] = useState<{
    items: Array<{
      id: number; companySlug: string; inputText: string;
      matchedProductId: number | null; matchedAlias: string | null;
      confidence: number; tier: string; action: string;
      invoiceId: number | null; productName: string | null; productCode: string | null;
      createdAt: string;
    }>;
    count: number;
    byTenant: Array<{ companySlug: string; count: number }>;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [tierFilter, setTierFilter] = useState<string>(""); // "" = both
  const [tenantFilter, setTenantFilter] = useState<string>(""); // "" = all

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: "200" });
      if (tierFilter) params.set("tier", tierFilter);
      if (tenantFilter) params.set("companySlug", tenantFilter);
      const res = await authedFetch(`/api/platform-admin/review-queue?${params}`);
      const d = await res.json();
      if (res.ok) setData(d);
      else toast.error(d.error || "تعذّر التحميل");
    } finally {
      setLoading(false);
    }
  }, [tierFilter, tenantFilter]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);

  if (loading) return <div className="p-6 md:p-12 text-center text-[var(--muted-foreground)]">جارٍ التحميل…</div>;
  if (!data) return <div className="p-6 md:p-12 text-center text-[var(--muted-foreground)]">تعذّر التحميل</div>;

  return (
    <div className="flex flex-col gap-4">
      {/* Per-tenant breakdown chips */}
      {data.byTenant.length > 0 && (
        <div className="bg-[var(--card)] rounded-2xl border border-[var(--border)] px-4 py-3">
          <h3 className="text-[13px] font-bold mb-2 flex items-center gap-1.5">
            <ListChecks className="text-violet-600" size={14} />
            التوزيع حسب الشركة ({data.byTenant.length} شركة)
          </h3>
          <div className="flex flex-wrap gap-1.5">
            {data.byTenant.map((t) => (
              <button
                key={t.companySlug}
                onClick={() => setTenantFilter(tenantFilter === t.companySlug ? "" : t.companySlug)}
                className={`px-2.5 py-1 rounded-full border border-[var(--border)] font-inherit text-[11px] font-bold cursor-pointer ${tenantFilter === t.companySlug ? "bg-[var(--primary)] text-[var(--primary-foreground)]" : "bg-[var(--muted)] text-[var(--foreground)]"}`}
              >
                {t.companySlug}: {t.count}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="bg-[var(--card)] rounded-2xl border border-[var(--border)] overflow-hidden">
        <div className="px-4 py-3 border-b border-b-[var(--border)] flex justify-between items-center flex-wrap gap-2">
          <h3 className="text-sm font-bold flex items-center gap-2">
            <AlertTriangle className="text-amber-500" size={16} />
            عناصر بانتظار المراجعة ({data.count})
          </h3>
          <div className="flex gap-2 items-center">
            <button
              type="button"
              onClick={() => onOpenReviewQueue(null)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-violet-600 text-white border-none font-inherit text-[11px] font-bold cursor-pointer"
              title="افتح نافذة المراجعة لكل الشركات (founder cross-tenant)"
            >
              <Eye size={12} /> افتح كل الشركات
            </button>
            <select
              value={tierFilter}
              onChange={(e) => setTierFilter(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-[var(--background)] border border-[var(--border)] text-[var(--foreground)] font-inherit text-[13px] outline-none max-w-[200px]"
            >
              <option value="">كل الأنواع</option>
              <option value="suggested">مقترح (suggested)</option>
              <option value="collision-recovery-failed">فشل التطابق (collision)</option>
            </select>
            {(tierFilter || tenantFilter) && (
              <IconBtn color="#9ca3af" aria-label="مسح الفلاتر" className="!w-auto !px-2 !py-1" onClick={() => { setTierFilter(""); setTenantFilter(""); }}
              >
                مسح الفلاتر
              </IconBtn>
            )}
          </div>
        </div>
        {data.items.length === 0 ? (
          <div className="p-6 md:p-12 text-center text-[var(--muted-foreground)]">
            ✅ لا توجد عناصر بانتظار المراجعة — جميع التطابقات تتم بنجاح.
          </div>
        ) : (
          <div className="garfix-scroll overflow-x-auto">
            <table className="w-full [border-collapse:collapse]">
              <thead><tr className="bg-[var(--muted)]">
                <th scope="col" className="text-right px-3 py-2.5 text-[11px] text-[var(--muted-foreground)] font-bold">الشركة</th><th scope="col" className="text-right px-3 py-2.5 text-[11px] text-[var(--muted-foreground)] font-bold">النص المُدخل</th>
                <th scope="col" className="text-right px-3 py-2.5 text-[11px] text-[var(--muted-foreground)] font-bold">المنتج المُطابق</th><th scope="col" className="text-right px-3 py-2.5 text-[11px] text-[var(--muted-foreground)] font-bold">الثقة</th>
                <th scope="col" className="text-right px-3 py-2.5 text-[11px] text-[var(--muted-foreground)] font-bold">النوع</th><th scope="col" className="text-right px-3 py-2.5 text-[11px] text-[var(--muted-foreground)] font-bold">التاريخ</th><th scope="col" className="text-right px-3 py-2.5 text-[11px] text-[var(--muted-foreground)] font-bold">إجراء</th>
              </tr></thead>
              <tbody>
                {data.items.map((item) => (
                  <tr className="border-b border-b-[var(--border)]" key={item.id}>
                    <td className="px-3 py-2.5 font-mono text-[11px]">{item.companySlug}</td>
                    <td className="px-3 py-2.5 text-[13px] max-w-[240px] overflow-hidden text-ellipsis whitespace-nowrap" title={item.inputText}>
                      {item.inputText}
                    </td>
                    <td className="px-3 py-2.5 text-[13px]">
                      {item.productName ? (
                        <span className="text-[11px]">
                          {item.productName}
                          {item.productCode && <span className="text-[var(--muted-foreground)] font-mono"> ({item.productCode})</span>}
                        </span>
                      ) : (
                        <span className="text-[11px] text-[#fca5a5]">— لا يطابق —</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-[13px] [direction:ltr] text-right">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${item.confidence >= 0.85 ? "bg-emerald-500/15 text-emerald-500" : item.confidence >= 0.7 ? "bg-amber-500/15 text-amber-500" : "bg-red-500/15 text-red-500"}`}>
                        {(item.confidence * 100).toFixed(0)}%
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-[13px]">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${item.tier === "collision-recovery-failed" ? "bg-red-500/15 text-red-500" : "bg-amber-500/15 text-amber-500"}`}>
                        {item.tier}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-[13px]">{new Date(item.createdAt).toLocaleString("ar-EG")}</td>
                    <td className="px-3 py-2.5 text-[13px]">
                      <IconBtn
                        color="#3b82f6"
                        type="button"
                        onClick={() => onOpenReviewQueue(item.companySlug)}
                        title="فتح صفحة المراجعة الخاصة بالشركة"
                        aria-label="فتح صفحة المراجعة"
                      >
                        <Eye size={14} />
                      </IconBtn>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

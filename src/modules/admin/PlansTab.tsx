"use client";

import { useEffect, useState, useCallback } from "react";
import { authedFetch } from "@/context/AuthContext";
import { toast } from "sonner";
import { Gauge, Save, AlertTriangle } from "lucide-react";
import { DEFAULT_PLANS, type PlanDef, type PlanCatalog } from "@/lib/plans";

/**
 * PlansTab — Manage the plan catalog (pricing, limits).
 * Reads current plans from GET /api/settings (key: "plans.catalog"),
 * allows editing name, priceMonthly, maxInvoicesPerMonth, maxCompanies, maxUsers,
 * and saves via PATCH /api/settings.
 */
export function PlansTab() {
  const [plans, setPlans] = useState<PlanCatalog>(() => ({ ...DEFAULT_PLANS }));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  // Load live catalog from settings API
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authedFetch("/api/settings");
      const data = await res.json();
      if (res.ok) {
        const catalog = data.settings?.["plans.catalog"] || data.defaults?.["plans.catalog"] || DEFAULT_PLANS;
        setPlans(catalog);
        setDirty(false);
      } else {
        toast.error(data.error || "تعذّر تحميل الباقات");
      }
    } catch {
      toast.error("خطأ في الاتصال");
    } finally {
      setLoading(false);
    }
  }, []);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);

  const updatePlan = (key: string, field: keyof PlanDef, value: string | number) => {
    setPlans((prev) => ({
      ...prev,
      [key]: { ...prev[key], [field]: value },
    }));
    setDirty(true);
  };

  const save = async () => {
    setSaving(true);
    try {
      // Build a clean catalog with only the editable fields
      const cleanCatalog: Record<string, Record<string, unknown>> = {};
      for (const [key, plan] of Object.entries(plans)) {
        cleanCatalog[key] = {
          name: plan.name,
          priceMonthly: plan.priceMonthly,
          maxInvoicesPerMonth: plan.maxInvoicesPerMonth,
          maxCompanies: plan.maxCompanies,
          maxUsers: plan.maxUsers,
          trialDays: plan.trialDays,
          currency: plan.currency,
          billingPeriod: plan.billingPeriod,
          featureBullets: plan.featureBullets,
          highlight: plan.highlight,
        };
      }
      const res = await authedFetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ "plans.catalog": cleanCatalog }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "تعذّر الحفظ");
      toast.success("تم حفظ كتالوج الباقات بنجاح");
      setDirty(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "خطأ");
    } finally {
      setSaving(false);
    }
  };

  const plansInputClass = "w-full px-1.5 py-1 bg-[var(--background)] border border-[var(--border)] rounded-md text-[var(--foreground)] text-xs font-inherit";

  if (loading) return <div className="p-6 md:p-12 text-center text-[var(--muted-foreground)]">جارٍ التحميل…</div>;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-between items-center">
        <h3 className="text-sm font-bold flex items-center gap-2">
          <Gauge className="text-violet-600" size={16} />
          كتالوج الباقات ({Object.keys(plans).length} باقة)
        </h3>
        <button
          onClick={save}
          disabled={saving || !dirty}
          className="px-4 py-1.5 rounded-lg border-none text-white text-xs font-bold font-inherit flex items-center gap-1.5" /* TAILWINDBREAK: dynamic bg/cursor/opacity */ style={{ background: saving || !dirty ? "var(--muted)" : "#7c3aed", cursor: saving || !dirty ? "not-allowed" : "pointer", opacity: saving || !dirty ? 0.7 : 1 }}
        >
          <Save size={12} />
          {saving ? "جارٍ الحفظ…" : "حفظ التغييرات"}
        </button>
      </div>

      {dirty && (
        <div className="px-3 py-2 bg-amber-500/12 border border-amber-500/30 rounded-lg text-[11px] text-amber-500 font-semibold flex items-center gap-1.5">
          <AlertTriangle size={14} />
          تغييرات غير محفوظة
        </div>
      )}

      {Object.entries(plans).map(([key, plan]) => (
        <div className="p-4 bg-[var(--card)] rounded-xl border border-[var(--border)]" key={key}>
          <div className="flex items-center gap-2 mb-3">
            <span className="px-2.5 py-0.5 rounded-lg bg-violet-600 text-white text-[10px] font-extrabold font-mono">
              {key}
            </span>
            <span className="text-[13px] font-bold">{plan.name}</span>
            {plan.highlight && (
              <span className="px-1.5 py-px rounded-md bg-emerald-500 text-white text-[9px] font-bold">مميزة</span>
            )}
          </div>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-2.5">
            <div>
              <label className="block text-[10px] text-[var(--muted-foreground)] font-semibold mb-1">الاسم</label>
              <input
                value={plan.name}
                onChange={(e) => updatePlan(key, "name", e.target.value)}
                className={plansInputClass}
              />
            </div>
            <div>
              <label className="block text-[10px] text-[var(--muted-foreground)] font-semibold mb-1">السعر الشهري ($)</label>
              <input
                type="number"
                step="0.01"
                value={plan.priceMonthly}
                onChange={(e) => updatePlan(key, "priceMonthly", parseFloat(e.target.value) || 0)}
                className={plansInputClass}
              />
            </div>
            <div>
              <label className="block text-[10px] text-[var(--muted-foreground)] font-semibold mb-1">الحد الأقصى للفواتير/شهر</label>
              <input
                type="number"
                value={plan.maxInvoicesPerMonth}
                onChange={(e) => updatePlan(key, "maxInvoicesPerMonth", parseInt(e.target.value) || -1)}
                className={plansInputClass}
              />
            </div>
            <div>
              <label className="block text-[10px] text-[var(--muted-foreground)] font-semibold mb-1">الحد الأقصى للشركات</label>
              <input
                type="number"
                value={plan.maxCompanies}
                onChange={(e) => updatePlan(key, "maxCompanies", parseInt(e.target.value) || -1)}
                className={plansInputClass}
              />
            </div>
            <div>
              <label className="block text-[10px] text-[var(--muted-foreground)] font-semibold mb-1">الحد الأقصى للمستخدمين</label>
              <input
                type="number"
                value={plan.maxUsers}
                onChange={(e) => updatePlan(key, "maxUsers", parseInt(e.target.value) || -1)}
                className={plansInputClass}
              />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

"use client";

import { useEffect, useState, useCallback } from "react";
import { authedFetch } from "@/context/AuthContext";
import { toast } from "sonner";
import { Sparkles, Plus, X, Check, Trash2 } from "lucide-react";
import { IconBtn } from "./shared-helpers";

/**
 * Admin P2 — Feature Flags tab.
 * Wires the previously-orphaned /api/platform-admin/feature-flags (GET/POST)
 * and /api/platform-admin/feature-flags/[id] (PATCH/DELETE) endpoints into
 * a founder-facing UI. Lets the founder toggle platform-wide features on/off,
 * scope them to specific plans, and create new flags.
 */
export function FeatureFlagsTab() {
  const [flags, setFlags] = useState<Array<{
    id: number; key: string; label: string; description: string | null;
    plans: string[]; isActive: boolean; createdAt: string; updatedAt: string;
  }>>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [newFlag, setNewFlag] = useState({ key: "", label: "", description: "", plans: "", isActive: true });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authedFetch("/api/platform-admin/feature-flags");
      const data = await res.json();
      if (res.ok) setFlags(data.flags || []);
      else toast.error(data.error || "تعذّر التحميل");
    } finally {
      setLoading(false);
    }
  }, []);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);

  const toggle = async (id: number, currentActive: boolean) => {
    try {
      const res = await authedFetch(`/api/platform-admin/feature-flags/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !currentActive }),
      });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || "Failed"); }
      toast.success(!currentActive ? "تم تفعيل الميزة" : "تم إيقاف الميزة");
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "خطأ");
    }
  };

  const remove = async (id: number) => {
    if (!confirm("حذف هذه الميزة نهائياً؟")) return;
    try {
      const res = await authedFetch(`/api/platform-admin/feature-flags/${id}`, { method: "DELETE" });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || "Failed"); }
      toast.success("تم الحذف");
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "خطأ");
    }
  };

  const create = async () => {
    if (!newFlag.key || !newFlag.label) { toast.error("المفتاح والتسمية مطلوبان"); return; }
    try {
      const res = await authedFetch("/api/platform-admin/feature-flags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key: newFlag.key,
          label: newFlag.label,
          description: newFlag.description || undefined,
          plans: newFlag.plans.split(",").map((s) => s.trim()).filter(Boolean),
          isActive: newFlag.isActive,
        }),
      });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || "Failed"); }
      toast.success("تم إنشاء الميزة");
      setNewFlag({ key: "", label: "", description: "", plans: "", isActive: true });
      setShowForm(false);
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "خطأ");
    }
  };

  if (loading) return <div className="p-6 md:p-12 text-center text-[var(--muted-foreground)]">جارٍ التحميل…</div>;

  return (
    <div className="bg-[var(--card)] rounded-2xl border border-[var(--border)] overflow-hidden">
      <div className="px-4 py-3 border-b border-b-[var(--border)] flex justify-between items-center">
        <h3 className="text-sm font-bold flex items-center gap-2">
          <Sparkles className="text-violet-600" size={16} />
          ميزات المنصة ({flags.length})
        </h3>
        <button onClick={() => setShowForm((v) => !v)} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[var(--primary)] text-[var(--primary-foreground)] border-none font-inherit text-[11px] font-bold cursor-pointer">
          <Plus size={12} /> ميزة جديدة
        </button>
      </div>
      {showForm && (
        <div className="p-4 border-b border-b-[var(--border)] bg-[var(--muted)] flex flex-col gap-2.5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
            <div>
              <label className="block text-[11px] font-semibold text-[var(--muted-foreground)] mb-1">المفتاح (key)</label>
              <input value={newFlag.key} onChange={(e) => setNewFlag({ ...newFlag, key: e.target.value })} placeholder="ai.invoice-brain" className="w-full px-3 py-2 rounded-lg bg-[var(--background)] border border-[var(--border)] text-[var(--foreground)] font-inherit text-[13px] outline-none" dir="ltr" />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-[var(--muted-foreground)] mb-1">التسمية (label)</label>
              <input value={newFlag.label} onChange={(e) => setNewFlag({ ...newFlag, label: e.target.value })} placeholder="محرك تعلم الفواتير" className="w-full px-3 py-2 rounded-lg bg-[var(--background)] border border-[var(--border)] text-[var(--foreground)] font-inherit text-[13px] outline-none" />
            </div>
            <div className="col-span-full">
              <label className="block text-[11px] font-semibold text-[var(--muted-foreground)] mb-1">الوصف</label>
              <input value={newFlag.description} onChange={(e) => setNewFlag({ ...newFlag, description: e.target.value })} className="w-full px-3 py-2 rounded-lg bg-[var(--background)] border border-[var(--border)] text-[var(--foreground)] font-inherit text-[13px] outline-none" />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-[var(--muted-foreground)] mb-1">الباقات (افصل بفواصل)</label>
              <input value={newFlag.plans} onChange={(e) => setNewFlag({ ...newFlag, plans: e.target.value })} placeholder="trial, starter, professional" className="w-full px-3 py-2 rounded-lg bg-[var(--background)] border border-[var(--border)] text-[var(--foreground)] font-inherit text-[13px] outline-none" dir="ltr" />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-[var(--muted-foreground)] mb-1">الحالة</label>
              <select value={newFlag.isActive ? "1" : "0"} onChange={(e) => setNewFlag({ ...newFlag, isActive: e.target.value === "1" })} className="w-full px-3 py-2 rounded-lg bg-[var(--background)] border border-[var(--border)] text-[var(--foreground)] font-inherit text-[13px] outline-none">
                <option value="1">نشطة</option>
                <option value="0">موقوفة</option>
              </select>
            </div>
          </div>
          <button onClick={create} className="self-end px-5 py-2 rounded-lg bg-[var(--primary)] text-[var(--primary-foreground)] border-none font-inherit text-xs font-bold cursor-pointer">إنشاء</button>
        </div>
      )}
      {flags.length === 0 ? (
        <div className="p-4 md:p-8 text-center text-[var(--muted-foreground)]">لا توجد ميزات بعد</div>
      ) : (
        <div className="garfix-scroll overflow-x-auto">
          <table className="w-full" style={{ borderCollapse: "collapse" }}>
            <thead><tr className="bg-[var(--muted)]">
              <th scope="col" className="text-right px-3 py-2.5 text-[11px] text-[var(--muted-foreground)] font-bold">المفتاح</th><th scope="col" className="text-right px-3 py-2.5 text-[11px] text-[var(--muted-foreground)] font-bold">التسمية</th><th scope="col" className="text-right px-3 py-2.5 text-[11px] text-[var(--muted-foreground)] font-bold">الباقات</th>
              <th scope="col" className="text-right px-3 py-2.5 text-[11px] text-[var(--muted-foreground)] font-bold">الحالة</th><th scope="col" className="text-right px-3 py-2.5 text-[11px] text-[var(--muted-foreground)] font-bold">إجراءات</th>
            </tr></thead>
            <tbody>
              {flags.map((f) => (
                <tr className="border-b border-b-[var(--border)]" key={f.id}>
                  <td className="px-3 py-2.5 text-[13px] font-mono [direction:ltr] text-right">{f.key}</td>
                  <td className="px-3 py-2.5 text-[13px] font-bold">{f.label}</td>
                  <td className="px-3 py-2.5 text-[13px]">{f.plans.length === 0 ? "الكل" : f.plans.join(", ")}</td>
                  <td className="px-3 py-2.5 text-[13px]">
                    <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold" /* TAILWINDBREAK: dynamic bg/color */ style={{ background: f.isActive ? "rgba(16,185,129,0.15)" : "rgba(156,163,175,0.15)", color: f.isActive ? "#10b981" : "#9ca3af" }}>
                      {f.isActive ? "نشطة" : "موقوفة"}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-[13px]">
                    <div className="flex gap-1">
                      <IconBtn color={f.isActive ? "#f59e0b" : "#10b981"} onClick={() => toggle(f.id, f.isActive)} title={f.isActive ? "إيقاف" : "تفعيل"} aria-label={f.isActive ? "إيقاف" : "تفعيل"}>
                        {f.isActive ? <X size={14} /> : <Check size={14} />}
                      </IconBtn>
                      <IconBtn color="#ef4444" onClick={() => remove(f.id)} title="حذف" aria-label="حذف">
                        <Trash2 size={14} />
                      </IconBtn>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

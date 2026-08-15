"use client";

import { useState } from "react";
import { toast } from "sonner";
import { FileText, Plus, Save } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  useLandingContentAdmin,
  useUpdateLandingContent,
} from "@/hooks/queries";
import type { LandingContentItem } from "@/hooks/queries/platform-admin";

/**
 * Admin P2 — Landing Content tab.
 * Wires the /api/platform-admin/landing-content endpoints via TanStack Query.
 * Lists every LandingContent row and lets the founder inline-edit.
 */
export function LandingContentTab() {
  const contentQuery = useLandingContentAdmin();
  const updateMutation = useUpdateLandingContent();

  const items: LandingContentItem[] = contentQuery.data?.items || [];
  const loading = contentQuery.isLoading;
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [newKey, setNewKey] = useState("");
  const [newValue, setNewValue] = useState("");

  // Seed drafts when data arrives
  const prevItemsRef = useState<LandingContentItem[] | null>(null);
  const [prevItems, setPrevItems] = prevItemsRef;
  if (items.length > 0 && prevItems !== items) {
    setPrevItems(items);
    const seed: Record<string, string> = {};
    for (const it of items) {
      seed[it.key] = typeof it.value === "string" ? it.value : JSON.stringify(it.value, null, 2);
    }
    if (Object.keys(seed).length !== Object.keys(drafts).length) {
      setDrafts(seed);
    }
  }

  const save = async (key: string) => {
    const raw = drafts[key];
    if (raw === undefined) return;
    // Try to parse JSON; if it fails, send as a plain string.
    let value: unknown = raw;
    const trimmed = raw.trim();
    if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
      try {
        value = JSON.parse(trimmed);
      } catch {
        toast.error("JSON غير صالح — راجع الصياغة");
        return;
      }
    }
    setSavingKey(key);
    try {
      await updateMutation.mutateAsync({ key, value });
      toast.success("تم حفظ المحتوى");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "خطأ");
    } finally {
      setSavingKey(null);
    }
  };

  const create = async () => {
    if (!newKey.trim()) { toast.error("المفتاح مطلوب"); return; }
    setSavingKey("__new__");
    try {
      let value: unknown = newValue;
      const trimmed = newValue.trim();
      if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
        try { value = JSON.parse(trimmed); } catch {
          toast.error("JSON غير صالح"); setSavingKey(null); return;
        }
      }
      await updateMutation.mutateAsync({ key: newKey.trim(), value });
      toast.success("تم إنشاء المحتوى");
      setNewKey(""); setNewValue(""); setShowCreate(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "خطأ");
    } finally {
      setSavingKey(null);
    }
  };

  if (loading) return <div className="p-6 md:p-12 text-center text-[var(--muted-foreground)]">جارٍ التحميل…</div>;

  return (
    <div className="bg-[var(--card)] rounded-2xl border border-[var(--border)] overflow-hidden shadow-brand-lg">
      <div className="px-4 py-3 border-b border-b-[var(--border)] flex justify-between items-center flex-wrap gap-2">
        <h3 className="text-sm font-bold flex items-center gap-2">
          <FileText className="text-emerald-500" size={16} />
          محتوى الصفحة الرئيسية ({items.length})
        </h3>
        <button onClick={() => setShowCreate((v) => !v)} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[var(--primary)] text-[var(--primary-foreground)] border-none font-inherit text-[11px] font-bold cursor-pointer active-press duration-150 hover-lift duration-120 transition-all">
          <Plus size={12} /> مفتاح جديد
        </button>
      </div>

      {showCreate && (
        <div className="p-4 border-b border-b-[var(--border)] bg-[var(--muted)] flex flex-col gap-2.5 glass">
          <div>
            <label className="block text-[11px] font-semibold text-[var(--muted-foreground)] mb-1">المفتاح (مثال: hero.title)</label>
            <Input value={newKey} onChange={(e) => setNewKey(e.target.value)} placeholder="hero.title" dir="ltr" className="focus-ring transition-all" />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-[var(--muted-foreground)] mb-1">القيمة (نص أو JSON)</label>
            <Textarea value={newValue} onChange={(e) => setNewValue(e.target.value)} rows={3} placeholder="مرحباً بكم في GarfiX" className="resize-y focus-ring transition-all" />
          </div>
          <button onClick={create} disabled={savingKey === "__new__"} className="self-end inline-flex items-center gap-1.5 px-5 py-2 rounded-lg bg-[var(--primary)] text-[var(--primary-foreground)] border-none font-inherit text-xs font-bold cursor-pointer disabled:opacity-70 active-press duration-150">
            <Save size={14} /> {savingKey === "__new__" ? "جارٍ…" : "إنشاء"}
          </button>
        </div>
      )}

      {items.length === 0 ? (
        <div className="p-4 md:p-8 text-center text-[var(--muted-foreground)]">
          لا يوجد محتوى بعد. أنشئ مفتاحاً جديداً (مثل <code className="font-mono">hero.title</code>) ليقرأه صفحة الواجهة.
        </div>
      ) : (
        <div className="flex flex-col">
          {items.map((it) => {
            const isJson = typeof it.value === "object" && it.value !== null;
            return (
              <div className="px-4 py-3.5 border-b border-b-[var(--border)] flex flex-col gap-2 hover-lift duration-120 transition-all" key={it.key}>
                <div className="flex justify-between items-center gap-2.5 flex-wrap">
                  <code className="font-mono text-xs font-bold [direction:ltr] text-[var(--foreground)]">{it.key}</code>
                  <span className="text-[10px] text-[var(--muted-foreground)]">
                    آخر تحديث: {new Date(it.updatedAt).toLocaleString("ar-EG")} {it.updatedBy ? `• ${it.updatedBy}` : ""}
                  </span>
                </div>
                <Textarea
                  value={drafts[it.key] ?? ""}
                  onChange={(e) => setDrafts({ ...drafts, [it.key]: e.target.value })}
                  rows={isJson ? 5 : 2}
                  className={`resize-y text-xs ${isJson ? "font-mono" : "font-inherit"} focus-ring transition-all`}
                />
                <div className="flex justify-end">
                  <button
                    onClick={() => save(it.key)}
                    disabled={savingKey === it.key}
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-[var(--primary)] text-[var(--primary-foreground)] border-none font-inherit text-[11px] font-bold cursor-pointer disabled:opacity-70 active-press duration-150"
                  >
                    <Save size={12} /> {savingKey === it.key ? "جارٍ…" : "حفظ"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

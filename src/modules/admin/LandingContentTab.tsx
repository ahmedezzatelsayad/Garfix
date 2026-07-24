"use client";

import { useEffect, useState, useCallback } from "react";
import { authedFetch } from "@/context/AuthContext";
import { toast } from "sonner";
import { FileText, Plus, Save } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

/**
 * Admin P2 — Landing Content tab.
 * Wires the previously-orphaned /api/platform-admin/landing-content
 * (GET/PATCH) endpoints into a founder-facing CMS UI. Lists every
 * LandingContent row (key + JSON value + last-updated metadata) and
 * lets the founder inline-edit scalar values (hero title/subtitle/CTA)
 * and JSON-array values (features list). Save calls PATCH with
 * { key, value }.
 *
 * Note: the backend is generic (any key, any JSON value) so this UI
 * stays generic — it renders a key→value editor. The landing page
 * module reads whatever keys it needs; this panel just writes them.
 */
export function LandingContentTab() {
  const [items, setItems] = useState<Array<{
    key: string;
    value: unknown;
    updatedAt: string;
    updatedBy: string | null;
  }>>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [newKey, setNewKey] = useState("");
  const [newValue, setNewValue] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authedFetch("/api/platform-admin/landing-content");
      const d = await res.json();
      if (res.ok) {
        setItems(d.items || []);
        // Seed drafts: stringify objects/arrays as pretty JSON; leave strings as-is.
        const seed: Record<string, string> = {};
        for (const it of (d.items || []) as Array<{ key: string; value: unknown }>) {
          seed[it.key] = typeof it.value === "string" ? it.value : JSON.stringify(it.value, null, 2);
        }
        setDrafts(seed);
      } else {
        toast.error(d.error || "تعذّر التحميل");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);

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
      const res = await authedFetch("/api/platform-admin/landing-content", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, value }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Failed");
      toast.success("تم حفظ المحتوى");
      load();
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
      const res = await authedFetch("/api/platform-admin/landing-content", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: newKey.trim(), value }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Failed");
      toast.success("تم إنشاء المحتوى");
      setNewKey(""); setNewValue(""); setShowCreate(false);
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "خطأ");
    } finally {
      setSavingKey(null);
    }
  };

  if (loading) return <div className="p-6 md:p-12 text-center text-[var(--muted-foreground)]">جارٍ التحميل…</div>;

  return (
    <div className="bg-[var(--card)] rounded-2xl border border-[var(--border)] overflow-hidden">
      <div className="px-4 py-3 border-b border-b-[var(--border)] flex justify-between items-center flex-wrap gap-2">
        <h3 className="text-sm font-bold flex items-center gap-2">
          <FileText className="text-emerald-500" size={16} />
          محتوى الصفحة الرئيسية ({items.length})
        </h3>
        <button onClick={() => setShowCreate((v) => !v)} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[var(--primary)] text-[var(--primary-foreground)] border-none font-inherit text-[11px] font-bold cursor-pointer">
          <Plus size={12} /> مفتاح جديد
        </button>
      </div>

      {showCreate && (
        <div className="p-4 border-b border-b-[var(--border)] bg-[var(--muted)] flex flex-col gap-2.5">
          <div>
            <label className="block text-[11px] font-semibold text-[var(--muted-foreground)] mb-1">المفتاح (مثال: hero.title)</label>
            <Input value={newKey} onChange={(e) => setNewKey(e.target.value)} placeholder="hero.title" dir="ltr" />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-[var(--muted-foreground)] mb-1">القيمة (نص أو JSON)</label>
            <Textarea value={newValue} onChange={(e) => setNewValue(e.target.value)} rows={3} placeholder="مرحباً بكم في GarfiX" className="resize-y" />
          </div>
          <button onClick={create} disabled={savingKey === "__new__"} className="self-end inline-flex items-center gap-1.5 px-5 py-2 rounded-lg bg-[var(--primary)] text-[var(--primary-foreground)] border-none font-inherit text-xs font-bold cursor-pointer disabled:opacity-70">
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
              <div className="px-4 py-3.5 border-b border-b-[var(--border)] flex flex-col gap-2" key={it.key}>
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
                  className={`resize-y text-xs ${isJson ? "font-mono" : "font-inherit"}`}
                />
                <div className="flex justify-end">
                  <button
                    onClick={() => save(it.key)}
                    disabled={savingKey === it.key}
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-[var(--primary)] text-[var(--primary-foreground)] border-none font-inherit text-[11px] font-bold cursor-pointer disabled:opacity-70"
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

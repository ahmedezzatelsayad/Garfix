"use client";

import { useEffect, useState, useCallback } from "react";
import { authedFetch } from "@/context/AuthContext";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  CheckCircle2, XCircle, Loader2, Eye, EyeOff, Save, Zap, KeyRound,
} from "lucide-react";

interface ProviderInfo {
  type: "z-ai" | "openrouter" | "anthropic" | "openai" | "gemini" | "deepseek" | "custom";
  name: string;
  description: string;
  defaultModel: string;
  keyPrefix: string;
  model: string;
  isEnabled: boolean;
  priority: number;
  hasApiKey: boolean;
  apiKeyMasked: string | null;
  baseUrl: string | null;
}

type TestState = "idle" | "testing" | "success" | "fail";

interface CardState {
  apiKey: string;       // local editable field
  model: string;
  priority: string;
  baseUrl: string;
  isEnabled: boolean;
  showKey: boolean;
  testState: TestState;
  testMessage?: string;
  testLatency?: number;
  saving: boolean;
  dirty: boolean;
}

function makeInitialCardState(p: ProviderInfo): CardState {
  return {
    apiKey: "",
    model: p.model || p.defaultModel,
    priority: String(p.priority === 99 ? "" : p.priority),
    baseUrl: p.baseUrl || "",
    isEnabled: p.isEnabled,
    showKey: false,
    testState: "idle",
    saving: false,
    dirty: false,
  };
}

const labelCls = "block text-[11px] font-bold text-muted-foreground mb-1";
const inputCls = "w-full px-3 py-2 rounded-lg bg-background border border-border text-foreground font-[inherit] text-xs outline-none";

export function AiProviderSettings() {
  const [providers, setProviders] = useState<ProviderInfo[] | null>(null);
  const [cards, setCards] = useState<Record<string, CardState>>({});
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authedFetch("/api/platform-admin/ai-providers");
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error || "تعذّر تحميل الإعدادات");
      }
      const data = await res.json();
      const list: ProviderInfo[] = data.providers || [];
      setProviders(list);
      const next: Record<string, CardState> = {};
      for (const p of list) {
        next[p.type] = makeInitialCardState(p);
      }
      setCards(next);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "خطأ");
      setProviders([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // setState runs inside async .then() callback in load (after await authedFetch) — not synchronous in effect body; no cascading render.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);

  const updateCard = (type: string, patch: Partial<CardState>) => {
    setCards((prev) => ({
      ...prev,
      [type]: { ...prev[type], ...patch, dirty: true },
    }));
  };

  const save = async (p: ProviderInfo) => {
    const c = cards[p.type];
    if (!c) return;
    if (c.priority && !/^[1-9]$/.test(c.priority)) {
      toast.error("الأولوية يجب أن تكون رقماً بين 1 و 9");
      return;
    }
    setCards((prev) => ({ ...prev, [p.type]: { ...prev[p.type], saving: true } }));
    try {
      const body: Record<string, unknown> = {
        provider: p.type,
        model: c.model,
        isEnabled: c.isEnabled,
      };
      if (c.priority) body.priority = Number(c.priority);
      if (c.apiKey.trim()) body.apiKey = c.apiKey.trim();
      if (p.type === "custom" && c.baseUrl.trim()) body.baseUrl = c.baseUrl.trim();

      const res = await authedFetch("/api/platform-admin/ai-providers", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error || "فشل الحفظ");
      }
      toast.success(`تم حفظ إعدادات ${p.name}`);
      // Reload to refresh masked key + hasApiKey flag
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "خطأ");
      setCards((prev) => ({ ...prev, [p.type]: { ...prev[p.type], saving: false } }));
    }
  };

  const test = async (p: ProviderInfo) => {
    // If user typed a new key but hasn't saved, prompt them to save first.
    const c = cards[p.type];
    if (!c) return;
    if (c.apiKey.trim() && c.dirty) {
      toast.warning("احفظ المفتاح الجديد أولاً قبل اختبار الاتصال");
      return;
    }
    updateCard(p.type, { testState: "testing", testMessage: undefined, testLatency: undefined });
    try {
      const res = await authedFetch("/api/platform-admin/ai-providers/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: p.type }),
      });
      const data = await res.json();
      if (data.ok) {
        updateCard(p.type, {
          testState: "success",
          testMessage: `نجح الاتصال (${data.latencyMs || 0}ms)`,
          testLatency: data.latencyMs,
        });
        toast.success(`الاتصال بـ ${p.name} يعمل`);
      } else {
        updateCard(p.type, {
          testState: "fail",
          testMessage: data.error || "فشل الاتصال",
        });
        toast.error(`فشل اتصال ${p.name}: ${data.error || "غير معروف"}`);
      }
    } catch (err) {
      updateCard(p.type, {
        testState: "fail",
        testMessage: err instanceof Error ? err.message : "خطأ",
      });
      toast.error("فشل الاتصال");
    }
  };

  if (loading) {
    return (
      <div className="p-8 sm:p-12 text-center text-muted-foreground">
        <Loader2 size={24} className="animate-spin block mx-auto mb-3" />
        جارٍ تحميل إعدادات مزودي الذكاء الاصطناعي…
      </div>
    );
  }

  if (!providers || providers.length === 0) {
    return (
      <div className="p-6 sm:p-8 text-center text-muted-foreground">
        تعذّر تحميل المزودين. تحقّق من صلاحيات المؤسس.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 sm:gap-4">
      <div className="flex items-center gap-2.5 px-3 sm:px-4 py-2 sm:py-3 rounded-xl bg-card border border-border">
        <img src="/logo.svg" alt="" className="w-5 h-5 rounded shrink-0" />
        <div className="flex-1">
          <div className="text-sm font-extrabold">إعدادات مزودي الذكاء الاصطناعي</div>
          <div className="text-xs text-muted-foreground">
            اضبط المزودين بترتيب الأولوية — عند فشل المزود الأساسي ينتقل النظام تلقائياً للتالي.
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
        {providers.map((p) => {
          const c = cards[p.type];
          if (!c) return null;
          const isCustom = p.type === "custom";
          const needsKey = p.type !== "z-ai";
          return (
            <div
              key={p.type}
              className={cn(
                "bg-card rounded-[14px] p-3 sm:p-[18px] flex flex-col gap-3 transition-all duration-200",
                p.isEnabled ? "border border-purple-500/35 opacity-100 shadow-[0_4px_16px_rgba(124,58,237,0.08)]" : "border border-border opacity-[0.85] shadow-none"
              )}
            >
              {/* Header row */}
              <div className="flex items-start gap-2.5">
                <div
                  className={cn(
                    "w-10 h-10 rounded-[10px] flex items-center justify-center shrink-0",
                    p.isEnabled ? "bg-gradient-to-br from-violet-600 to-violet-400 text-white" : "bg-muted text-muted-foreground"
                  )}
                >
                  <img src="/logo.svg" alt="" className="w-5 h-5 rounded" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-extrabold">{p.name}</span>
                    {/* Status dot */}
                    <span
                      title={p.isEnabled ? "مفعّل" : "معطّل"}
                      className={cn(
                        "w-[9px] h-[9px] rounded-full inline-block",
                        p.isEnabled ? "bg-green-500 shadow-[0_0_6px_#22c55e]" : "bg-gray-400 shadow-none"
                      )}
                    />
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5 leading-[1.5]">
                    {p.description}
                  </div>
                </div>
                {/* Enable/disable toggle */}
                <button
                  role="switch"
                  aria-checked={c.isEnabled}
                  aria-label={`تفعيل ${p.name}`}
                  onClick={() => updateCard(p.type, { isEnabled: !c.isEnabled })}
                  className={cn(
                    "w-11 h-6 rounded-full border border-border relative shrink-0 transition-[background] duration-150 cursor-pointer",
                    c.isEnabled ? "bg-green-500" : "bg-muted"
                  )}
                >
                  <span
                    className={cn("absolute top-0.5 w-[18px] h-[18px] rounded-full bg-white shadow-[0_1px_3px_rgba(0,0,0,0.3)] transition-[left] duration-150", c.isEnabled ? "left-[22px]" : "left-[2px]")}
                  />
                </button>
              </div>

              {/* Model field */}
              <div>
                <label className={labelCls}>الموديل (Model)</label>
                <input
                  value={c.model}
                  onChange={(e) => updateCard(p.type, { model: e.target.value })}
                  placeholder={p.defaultModel || "model-name"}
                  className={inputCls}
                />
              </div>

              {/* Base URL for custom only */}
              {isCustom && (
                <div>
                  <label className={labelCls}>Base URL (OpenAI-compatible)</label>
                  <input
                    value={c.baseUrl}
                    onChange={(e) => updateCard(p.type, { baseUrl: e.target.value })}
                    placeholder="https://my-llm.example.com/v1"
                    dir="ltr"
                    className={cn(inputCls, "text-left")}
                  />
                </div>
              )}

              {/* API key field (masked) */}
              {needsKey && (
                <div>
                  <label className={labelCls}>
                    <span className="inline-flex items-center gap-1.5">
                      <KeyRound size={11} /> مفتاح API
                    </span>
                  </label>
                  <div className="flex gap-1.5">
                    <input
                      type={c.showKey ? "text" : "password"}
                      value={c.apiKey}
                      onChange={(e) => updateCard(p.type, { apiKey: e.target.value })}
                      placeholder={p.hasApiKey ? (p.apiKeyMasked || "••••••••") : (p.keyPrefix ? `يبدأ بـ ${p.keyPrefix}…` : "أدخل المفتاح")}
                      dir="ltr"
                      className={cn(inputCls, "text-left flex-1")}
                    />
                    <button
                      type="button"
                      onClick={() => updateCard(p.type, { showKey: !c.showKey })}
                      title={c.showKey ? "إخفاء" : "إظهار"}
                      className="w-9 rounded-lg bg-muted border border-border text-muted-foreground cursor-pointer flex items-center justify-center"
                    >
                      {c.showKey ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  </div>
                  {p.hasApiKey && !c.apiKey && (
                    <div className="text-[10px] text-muted-foreground mt-1">
                      مفتاح محفوظ ({p.apiKeyMasked}). اترك الحقل فارغاً للاحتفاظ به، أو اكتب مفتاحاً جديداً للاستبدال.
                    </div>
                  )}
                </div>
              )}

              {/* Priority field */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-2.5">
                <div>
                  <label className={labelCls}>الأولوية (1 = أساسي)</label>
                  <input
                    type="number" min={1} max={9}
                    value={c.priority}
                    onChange={(e) => updateCard(p.type, { priority: e.target.value })}
                    placeholder="99"
                    className={inputCls}
                  />
                </div>
                {/* Test result */}
                <div>
                  <label className={labelCls}>حالة الاتصال</label>
                  <div
                    className={cn(
                      "w-full px-2.5 py-2 rounded-lg font-[inherit] text-[11px] outline-none flex items-center gap-1.5 text-foreground",
                      c.testState === "success" ? "bg-green-500/10 border border-green-500/40" : "",
                      c.testState === "fail" ? "bg-red-500/10 border border-red-500/40" : "",
                      (c.testState === "idle" || c.testState === "testing") ? "bg-background border border-border" : ""
                    )}
                  >
                    {c.testState === "testing" && <Loader2 size={12} className="animate-spin" />}
                    {c.testState === "success" && <CheckCircle2 size={12} color="#22c55e" />}
                    {c.testState === "fail" && <XCircle size={12} color="#ef4444" />}
                    <span className="overflow-hidden text-ellipsis whitespace-nowrap">
                      {c.testState === "idle" && "لم يُختبر بعد"}
                      {c.testState === "testing" && "جارٍ الاختبار…"}
                      {c.testState === "success" && (c.testMessage || "نجح")}
                      {c.testState === "fail" && (c.testMessage || "فشل")}
                    </span>
                  </div>
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex gap-2 mt-1">
                <button
                  onClick={() => test(p)}
                  disabled={c.testState === "testing"}
                  className={cn(
                    "inline-flex items-center gap-1.5 px-3.5 py-2 rounded-[9px] bg-muted text-foreground border border-border font-[inherit] text-xs font-bold",
                    c.testState === "testing" ? "cursor-not-allowed opacity-60" : "cursor-pointer"
                  )}
                >
                  {c.testState === "testing" ? <Loader2 size={13} className="animate-spin" /> : <Zap size={13} />}
                  اختبار اتصال
                </button>
                <button
                  onClick={() => save(p)}
                  disabled={c.saving || !c.dirty}
                  className={cn(
                    "inline-flex items-center gap-1.5 px-3.5 py-2 rounded-[9px] flex-1 font-[inherit] text-xs font-bold transition-all duration-200",
                    c.dirty ? "bg-gradient-to-br from-violet-600 to-violet-400 text-white border-none shadow-[0_4px_12px_rgba(124,58,237,0.25)]" : "bg-muted text-muted-foreground border border-border shadow-none",
                    c.saving ? "opacity-70 cursor-not-allowed" : (c.dirty ? "cursor-pointer" : "cursor-not-allowed")
                  )}
                >
                  {c.saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
                  حفظ
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default AiProviderSettings;

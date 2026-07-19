"use client";

import { useEffect, useState, useCallback } from "react";
import { authedFetch } from "@/context/AuthContext";
import { toast } from "sonner";
import {
  CheckCircle2, XCircle, Loader2, Eye, EyeOff, Save, Zap, KeyRound,
} from "lucide-react";

interface ProviderInfo {
  type: "z-ai" | "openrouter" | "anthropic" | "openai" | "gemini" | "custom";
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
      <div style={{ padding: "48px", textAlign: "center", color: "var(--muted-foreground)" }}>
        <Loader2 size={24} className="animate-spin" style={{ margin: "0 auto 12px", display: "block" }} />
        جارٍ تحميل إعدادات مزودي الذكاء الاصطناعي…
      </div>
    );
  }

  if (!providers || providers.length === 0) {
    return (
      <div style={{ padding: "32px", textAlign: "center", color: "var(--muted-foreground)" }}>
        تعذّر تحميل المزودين. تحقّق من صلاحيات المؤسس.
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "12px 16px", borderRadius: "12px", background: "var(--card)", border: "1px solid var(--border)" }}>
        <img src="/logo.svg" alt="" style={{ width: 20, height: 20, borderRadius: 4, flexShrink: 0 }} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: "14px", fontWeight: 800 }}>إعدادات مزودي الذكاء الاصطناعي</div>
          <div style={{ fontSize: "11px", color: "var(--muted-foreground)" }}>
            اضبط المزودين بترتيب الأولوية — عند فشل المزود الأساسي ينتقل النظام تلقائياً للتالي.
          </div>
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))",
          gap: "16px",
        }}
      >
        {providers.map((p) => {
          const c = cards[p.type];
          if (!c) return null;
          const isCustom = p.type === "custom";
          const needsKey = p.type !== "z-ai";
          return (
            <div
              key={p.type}
              style={{
                background: "var(--card)",
                borderRadius: "14px",
                border: `1px solid ${p.isEnabled ? "rgba(124,58,237,0.35)" : "var(--border)"}`,
                padding: "18px",
                display: "flex", flexDirection: "column", gap: "12px",
                opacity: c.isEnabled ? 1 : 0.85,
                boxShadow: p.isEnabled ? "0 4px 16px rgba(124,58,237,0.08)" : "none",
                transition: "all .2s",
              }}
            >
              {/* Header row */}
              <div style={{ display: "flex", alignItems: "flex-start", gap: "10px" }}>
                <div
                  style={{
                    width: "40px", height: "40px", borderRadius: "10px",
                    background: p.isEnabled
                      ? "linear-gradient(135deg, #7c3aed, #a78bfa)"
                      : "var(--muted)",
                    color: p.isEnabled ? "#fff" : "var(--muted-foreground)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  <img src="/logo.svg" alt="" style={{ width: 20, height: 20, borderRadius: 4 }} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <span style={{ fontSize: "14px", fontWeight: 800 }}>{p.name}</span>
                    {/* Status dot */}
                    <span
                      title={p.isEnabled ? "مفعّل" : "معطّل"}
                      style={{
                        width: "9px", height: "9px", borderRadius: "50%",
                        background: p.isEnabled ? "#22c55e" : "#9ca3af",
                        boxShadow: p.isEnabled ? "0 0 6px #22c55e" : "none",
                        display: "inline-block",
                      }}
                    />
                  </div>
                  <div style={{ fontSize: "11px", color: "var(--muted-foreground)", marginTop: "2px", lineHeight: 1.5 }}>
                    {p.description}
                  </div>
                </div>
                {/* Enable/disable toggle */}
                <button
                  role="switch"
                  aria-checked={c.isEnabled}
                  aria-label={`تفعيل ${p.name}`}
                  onClick={() => updateCard(p.type, { isEnabled: !c.isEnabled })}
                  style={{
                    width: "44px", height: "24px", borderRadius: "999px",
                    background: c.isEnabled ? "#22c55e" : "var(--muted)",
                    border: "1px solid var(--border)",
                    position: "relative", cursor: "pointer", flexShrink: 0,
                    transition: "background .15s",
                  }}
                >
                  <span
                    style={{
                      position: "absolute", top: "2px",
                      left: c.isEnabled ? "22px" : "2px",
                      width: "18px", height: "18px", borderRadius: "50%",
                      background: "#fff",
                      boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
                      transition: "left .15s",
                    }}
                  />
                </button>
              </div>

              {/* Model field */}
              <div>
                <label style={labelStyle}>الموديل (Model)</label>
                <input
                  value={c.model}
                  onChange={(e) => updateCard(p.type, { model: e.target.value })}
                  placeholder={p.defaultModel || "model-name"}
                  style={inputStyle}
                />
              </div>

              {/* Base URL for custom only */}
              {isCustom && (
                <div>
                  <label style={labelStyle}>Base URL (OpenAI-compatible)</label>
                  <input
                    value={c.baseUrl}
                    onChange={(e) => updateCard(p.type, { baseUrl: e.target.value })}
                    placeholder="https://my-llm.example.com/v1"
                    dir="ltr"
                    style={{ ...inputStyle, textAlign: "left" }}
                  />
                </div>
              )}

              {/* API key field (masked) */}
              {needsKey && (
                <div>
                  <label style={labelStyle}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: "5px" }}>
                      <KeyRound size={11} /> مفتاح API
                    </span>
                  </label>
                  <div style={{ display: "flex", gap: "6px" }}>
                    <input
                      type={c.showKey ? "text" : "password"}
                      value={c.apiKey}
                      onChange={(e) => updateCard(p.type, { apiKey: e.target.value })}
                      placeholder={p.hasApiKey ? (p.apiKeyMasked || "••••••••") : (p.keyPrefix ? `يبدأ بـ ${p.keyPrefix}…` : "أدخل المفتاح")}
                      dir="ltr"
                      style={{ ...inputStyle, textAlign: "left", flex: 1 }}
                    />
                    <button
                      type="button"
                      onClick={() => updateCard(p.type, { showKey: !c.showKey })}
                      title={c.showKey ? "إخفاء" : "إظهار"}
                      style={{
                        width: "36px", borderRadius: "8px",
                        background: "var(--muted)", border: "1px solid var(--border)",
                        color: "var(--muted-foreground)", cursor: "pointer",
                        display: "flex", alignItems: "center", justifyContent: "center",
                      }}
                    >
                      {c.showKey ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  </div>
                  {p.hasApiKey && !c.apiKey && (
                    <div style={{ fontSize: "10px", color: "var(--muted-foreground)", marginTop: "4px" }}>
                      مفتاح محفوظ ({p.apiKeyMasked}). اترك الحقل فارغاً للاحتفاظ به، أو اكتب مفتاحاً جديداً للاستبدال.
                    </div>
                  )}
                </div>
              )}

              {/* Priority field */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                <div>
                  <label style={labelStyle}>الأولوية (1 = أساسي)</label>
                  <input
                    type="number" min={1} max={9}
                    value={c.priority}
                    onChange={(e) => updateCard(p.type, { priority: e.target.value })}
                    placeholder="99"
                    style={inputStyle}
                  />
                </div>
                {/* Test result */}
                <div>
                  <label style={labelStyle}>حالة الاتصال</label>
                  <div
                    style={{
                      ...inputStyle,
                      display: "flex", alignItems: "center", gap: "6px",
                      padding: "8px 10px",
                      background:
                        c.testState === "success" ? "rgba(34,197,94,0.1)"
                        : c.testState === "fail" ? "rgba(239,68,68,0.1)"
                        : "var(--background)",
                      borderColor:
                        c.testState === "success" ? "rgba(34,197,94,0.4)"
                        : c.testState === "fail" ? "rgba(239,68,68,0.4)"
                        : "var(--border)",
                      color: "var(--foreground)",
                      fontSize: "11px",
                    }}
                  >
                    {c.testState === "testing" && <Loader2 size={12} className="animate-spin" />}
                    {c.testState === "success" && <CheckCircle2 size={12} color="#22c55e" />}
                    {c.testState === "fail" && <XCircle size={12} color="#ef4444" />}
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {c.testState === "idle" && "لم يُختبر بعد"}
                      {c.testState === "testing" && "جارٍ الاختبار…"}
                      {c.testState === "success" && (c.testMessage || "نجح")}
                      {c.testState === "fail" && (c.testMessage || "فشل")}
                    </span>
                  </div>
                </div>
              </div>

              {/* Action buttons */}
              <div style={{ display: "flex", gap: "8px", marginTop: "4px" }}>
                <button
                  onClick={() => test(p)}
                  disabled={c.testState === "testing"}
                  style={{
                    display: "inline-flex", alignItems: "center", gap: "6px",
                    padding: "9px 14px", borderRadius: "9px",
                    background: "var(--muted)", color: "var(--foreground)",
                    border: "1px solid var(--border)",
                    fontFamily: "inherit", fontSize: "12px", fontWeight: 700,
                    cursor: c.testState === "testing" ? "not-allowed" : "pointer",
                    opacity: c.testState === "testing" ? 0.6 : 1,
                  }}
                >
                  {c.testState === "testing" ? <Loader2 size={13} className="animate-spin" /> : <Zap size={13} />}
                  اختبار اتصال
                </button>
                <button
                  onClick={() => save(p)}
                  disabled={c.saving || !c.dirty}
                  style={{
                    display: "inline-flex", alignItems: "center", gap: "6px",
                    padding: "9px 14px", borderRadius: "9px", flex: 1,
                    background: c.dirty ? "linear-gradient(135deg, #7c3aed, #a78bfa)" : "var(--muted)",
                    color: c.dirty ? "#fff" : "var(--muted-foreground)",
                    border: c.dirty ? "none" : "1px solid var(--border)",
                    fontFamily: "inherit", fontSize: "12px", fontWeight: 700,
                    cursor: c.saving || !c.dirty ? "not-allowed" : "pointer",
                    opacity: c.saving ? 0.7 : 1,
                    boxShadow: c.dirty ? "0 4px 12px rgba(124,58,237,0.25)" : "none",
                  }}
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

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: "11px",
  fontWeight: 700,
  color: "var(--muted-foreground)",
  marginBottom: "4px",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "8px 12px",
  borderRadius: "8px",
  background: "var(--background)",
  border: "1px solid var(--border)",
  color: "var(--foreground)",
  fontFamily: "inherit",
  fontSize: "12px",
  outline: "none",
};

export default AiProviderSettings;

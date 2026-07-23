"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useBrand } from "@/context/BrandContext";
import { useAuth, authedFetch } from "@/context/AuthContext";
import {
  Bot, User, Send, X, Maximize2, Minimize2, ShieldAlert,
  Loader2, CheckCircle2, XCircle, ListOrdered, Wallet, BarChart3, Plus,
} from "lucide-react";
import { ReviewQueueModal } from "@/modules/common/ReviewQueueModal";

interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
  /** Optional tool/agent metadata attached to an assistant message */
  meta?: {
    intent?: string;
    preview?: string;
    confirmToken?: string;
    status?: "pending_confirm" | "executed" | "cancelled" | "error";
    /** P0.1 fix (Remaining Work Handoff): warnings surfaced from the
     *  create_invoice tool so the user sees oversell/orphan items
     *  immediately in the chat, not just in BulkInputView. */
    reviewQueueWarnings?: string[];
  };
}

interface ConfirmationState {
  intent: string;
  params: Record<string, unknown>;
  confirmToken: string;
  description: string;
  warning?: string;
  affectedRecords?: Array<{ type: string; id?: string | number; name?: string }>;
  /** Index in messages where the assistant preview placeholder lives */
  messageIndex: number;
}

interface QuickAction {
  id: string;
  label: string;
  icon: React.ReactNode;
  userMessage: string;
  intent: string;
  params: (companySlug: string | undefined) => Record<string, unknown>;
  color: string;
}

const QUICK_ACTIONS: QuickAction[] = [
  {
    id: "new-invoice",
    label: "فاتورة جديدة",
    icon: <Plus size={13} />,
    userMessage: "أنشئ فاتورة جديدة",
    intent: "create_invoice",
    color: "#7c3aed",
    params: (companySlug) => ({
      companySlug,
      clientName: "عميل افتراضي",
      clientPhone: "",
      items: [{ name: "منتج تجريبي", qty: 1, price: 100 }],
      taxRate: 15,
    }),
  },
  {
    id: "list-clients",
    label: "قائمة العملاء",
    icon: <ListOrdered size={13} />,
    userMessage: "اعرض قائمة العملاء",
    intent: "list_clients",
    color: "#10b981",
    params: (companySlug) => ({ companySlug, limit: 10 }),
  },
  {
    id: "client-balance",
    label: "كشف رصيد",
    icon: <Wallet size={13} />,
    userMessage: "اعرض رصيد عميل",
    intent: "get_client_balance",
    color: "#f59e0b",
    params: (companySlug) => ({ companySlug, clientId: 1 }),
  },
  {
    id: "quick-report",
    label: "تقرير سريع",
    icon: <BarChart3 size={13} />,
    userMessage: "اعرض ملخص الأعمال",
    intent: "list_invoices",
    color: "#3b82f6",
    params: (companySlug) => ({ companySlug, limit: 5 }),
  },
];

const SUGGESTIONS = [
  "ما هو إجمالي إيراداتي هذا الشهر؟",
  "اقترح طرقاً لزيادة المبيعات",
  "كيف أنشئ فاتورة جديدة؟",
  "ما هي حالة الفواتير المتأخرة؟",
];

export function AICopilotBubble() {
  const { user } = useAuth();
  const { activeCompany } = useBrand();
  const [open, setOpen] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [showReviewQueue, setShowReviewQueue] = useState(false);
  const [conversationId, setConversationId] = useState<string | undefined>(undefined);
  const [confirmation, setConfirmation] = useState<ConfirmationState | null>(null);
  const [executing, setExecuting] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const initRef = useRef(false);

  // Load history on open
  const loadHistory = useCallback(async () => {
    try {
      const res = await authedFetch("/api/ai/chat");
      if (res.ok) {
        const data = await res.json();
        const msgs: ChatMessage[] = (data.messages || []).map((m: { role: string; content: string }) => ({
          role: m.role as "user" | "assistant",
          content: m.content,
        }));
        if (msgs.length > 0) {
          setMessages(msgs);
          if (data.messages[0]?.conversationId) setConversationId(data.messages[0].conversationId);
        }
      }
    } catch (err) {
      console.error("[ai] history load failed:", err);
    }
  }, []);

  useEffect(() => {
    if (open && !initRef.current && user) {
      initRef.current = true;
      loadHistory();
    }
  }, [open, user, loadHistory]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, loading, confirmation]);

  /** Regular chat send (no AI tool execution). */
  const send = async (text?: string) => {
    const content = (text ?? input).trim();
    if (!content || loading) return;
    const newMessages: ChatMessage[] = [...messages, { role: "user", content }];
    setMessages(newMessages);
    setInput("");
    setLoading(true);
    try {
      const res = await authedFetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: newMessages.slice(-10),
          companySlug: activeCompany?.slug,
          conversationId,
        }),
      });
      if (!res.ok) throw new Error("AI request failed");
      const data = await res.json();
      setMessages([...newMessages, { role: "assistant", content: data.reply }]);
      if (data.conversationId) setConversationId(data.conversationId);
    } catch (err) {
      setMessages([...newMessages, { role: "assistant", content: "عذراً، حدث خطأ. حاول مرة أخرى." }]);
    } finally {
      setLoading(false);
    }
  };

  /**
   * Trigger an AI agent tool via /api/ai/tools.
   * Step 1: preview (confirm=false) — server returns confirmToken + preview.
   * Step 2: user clicks "تنفيذ" → execute (confirm=true + token).
   */
  const triggerAgentAction = async (action: QuickAction) => {
    if (loading || executing) return;
    if (!activeCompany?.slug) {
      toastWarn("يجب اختيار شركة نشطة أولاً");
      return;
    }
    const userMsg: ChatMessage = { role: "user", content: action.userMessage };
    const placeholder: ChatMessage = {
      role: "assistant",
      content: "🔍 جارٍ تحليل الإجراء وإنشاء معاينة...",
      meta: { intent: action.intent, status: "pending_confirm" },
    };
    const baseMessages = [...messages, userMsg, placeholder];
    setMessages(baseMessages);
    setLoading(true);

    try {
      const params = action.params(activeCompany.slug);
      const res = await authedFetch("/api/ai/tools", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ intent: action.intent, params, confirm: false }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "فشل الاتصال بـ AI tools");
      }
      if (data.needsConfirmation && data.confirmToken) {
        const preview = data.preview || {};
        const updatedContent = `🤖 إجراء الوكيل: ${action.label}\n\n${preview.description || "سيتم تنفيذ الإجراء"}${preview.warning ? `\n\n⚠️ ${preview.warning}` : ""}`;
        const updatedMessages = baseMessages.slice();
        updatedMessages[updatedMessages.length - 1] = {
          role: "assistant",
          content: updatedContent,
          meta: {
            intent: action.intent,
            status: "pending_confirm",
            confirmToken: data.confirmToken,
            preview: preview.description,
          },
        };
        setMessages(updatedMessages);
        setConfirmation({
          intent: action.intent,
          params,
          confirmToken: data.confirmToken,
          description: preview.description || "سيتم تنفيذ الإجراء",
          warning: preview.warning,
          affectedRecords: preview.affectedRecords,
          messageIndex: updatedMessages.length - 1,
        });
      } else {
        // Direct result (no confirmation needed)
        const summary = data.summary || "تم التنفيذ";
        // P0.1: capture any review-queue / oversell warnings returned by the
        // backend so we can render them as a banner under the message.
        const directWarnings: string[] = Array.isArray(data.reviewQueueWarnings) ? data.reviewQueueWarnings : [];
        const updatedMessages = baseMessages.slice();
        updatedMessages[updatedMessages.length - 1] = {
          role: "assistant",
          content: `✅ ${summary}`,
          meta: { intent: action.intent, status: "executed", reviewQueueWarnings: directWarnings.length > 0 ? directWarnings : undefined },
        };
        setMessages(updatedMessages);
        if (directWarnings.length > 0) {
          toastWarn(`⚠️ ${directWarnings.length} صنف يحتاج مراجعة — انظر البانر أدناه`);
        }
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : "خطأ غير معروف";
      const updatedMessages = baseMessages.slice();
      updatedMessages[updatedMessages.length - 1] = {
        role: "assistant",
        content: `❌ فشل الإجراء: ${errMsg}`,
        meta: { intent: action.intent, status: "error" },
      };
      setMessages(updatedMessages);
    } finally {
      setLoading(false);
    }
  };

  /** Step 2: actually execute the confirmed action. */
  const executeConfirmed = async () => {
    if (!confirmation || executing) return;
    setExecuting(true);
    try {
      const res = await authedFetch("/api/ai/tools", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          intent: confirmation.intent,
          params: confirmation.params,
          confirm: true,
          confirmToken: confirmation.confirmToken,
        }),
      });
      const data = await res.json();
      const summary = data.ok
        ? `✅ ${data.summary || "تم التنفيذ بنجاح"}`
        : `❌ ${data.summary || data.error || "فشل التنفيذ"}`;
      // P0.1: capture review-queue warnings from the confirmed execution too.
      const execWarnings: string[] = Array.isArray(data.reviewQueueWarnings) ? data.reviewQueueWarnings : [];
      setMessages((prev) => {
        const next = prev.slice();
        const idx = confirmation.messageIndex;
        if (next[idx]) {
          next[idx] = {
            ...next[idx],
            content: `${next[idx].content}\n\n— نتيجة التنفيذ —\n${summary}`,
            meta: {
              intent: confirmation.intent,
              status: data.ok ? "executed" : "error",
              reviewQueueWarnings: execWarnings.length > 0 ? execWarnings : undefined,
            },
          };
        }
        return next;
      });
      if (execWarnings.length > 0) {
        toastWarn(`⚠️ ${execWarnings.length} صنف يحتاج مراجعة — انظر البانر أدناه`);
      }
      setConfirmation(null);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : "خطأ في التنفيذ";
      setMessages((prev) => {
        const next = prev.slice();
        const idx = confirmation.messageIndex;
        if (next[idx]) {
          next[idx] = {
            ...next[idx],
            content: `${next[idx].content}\n\n❌ خطأ في التنفيذ: ${errMsg}`,
            meta: { intent: confirmation.intent, status: "error" },
          };
        }
        return next;
      });
    } finally {
      setExecuting(false);
    }
  };

  /** Cancel the confirmation dialog. */
  const cancelConfirmation = () => {
    if (!confirmation) return;
    setMessages((prev) => {
      const next = prev.slice();
      const idx = confirmation.messageIndex;
      if (next[idx]) {
        next[idx] = {
          ...next[idx],
          content: `${next[idx].content}\n\n— تم الإلغاء من قبل المستخدم —`,
          meta: { intent: confirmation.intent, status: "cancelled" },
        };
      }
      return next;
    });
    setConfirmation(null);
  };

  if (!user) return null;

  // ─── Layout dimensions ────────────────────────────────────────────────────
  // Part 2.6 fix: responsive AI Copilot panel.
  // - Desktop (md+): 380px floating panel, bottom-left, 540px tall.
  // - Mobile (<md): near-fullscreen panel with safe-area insets so the input
  //   box sits above the on-screen keyboard. Width: calc(100vw - 16px),
  //   height: calc(100vh - 16px), positioned with 8px margin from edges.
  //   The close (X) button is always visible on mobile.
  // - Fullscreen mode: unchanged (covers entire viewport on all sizes).
  const panelStyle: React.CSSProperties = fullscreen
    ? {
        position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
        width: "100vw", height: "100vh", maxWidth: "100vw", maxHeight: "100vh",
        borderRadius: 0, border: "none",
      }
    : {
        // Desktop: 380px floating panel
        position: "fixed", bottom: "92px", left: "24px",
        width: "380px", maxWidth: "calc(100vw - 48px)",
        height: "540px", maxHeight: "calc(100vh - 130px)",
        // Mobile override via media query (injected as a className below)
      };

  return (
    <>
      {/* Inject keyframes (no-op if already present) */}
      <style>{`
        @keyframes garfix-agent-pulse {
          0%, 100% { box-shadow: 0 12px 32px rgba(124,58,237,0.5), 0 0 0 0 rgba(124,58,237,0.4); }
          50%      { box-shadow: 0 16px 40px rgba(124,58,237,0.6), 0 0 0 12px rgba(124,58,237,0); }
        }
        @keyframes garfix-fade-up {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes garfix-glow {
          0%, 100% { opacity: 0.4; }
          50%      { opacity: 1; }
        }
        @keyframes garfix-blink {
          0%, 80%, 100% { opacity: 0.2; transform: translateY(0); }
          40%           { opacity: 1; transform: translateY(-3px); }
        }
        /* Part 2.6 fix: responsive AI Copilot panel.
           On mobile (<768px / md breakpoint), override the inline desktop
           styles to make the panel near-fullscreen with safe-area insets.
           The input box sits above the on-screen keyboard via
           padding-bottom: env(keyboard-inset-height, 0px) fallback + safe-area-inset-bottom. */
        @media (max-width: 767px) {
          .garfix-ai-panel:not([data-fullscreen="true"]) {
            position: fixed !important;
            top: 8px !important;
            left: 8px !important;
            right: 8px !important;
            bottom: 8px !important;
            width: auto !important;
            max-width: none !important;
            height: auto !important;
            max-height: none !important;
            border-radius: 16px !important;
            /* Safe-area insets for notched devices + on-screen keyboard */
            padding-bottom: env(safe-area-inset-bottom, 0px);
          }
        }
      `}</style>

      {/* Floating bubble — Garfix AI logo mark, 60px, purple gradient */}
      <button
        onClick={() => setOpen(!open)}
        aria-label="مساعد Garfix AI"
        title="مساعد Garfix AI"
        style={{
          position: "fixed", bottom: "24px", left: "24px",
          width: "60px", height: "60px", borderRadius: "50%",
          background: "linear-gradient(135deg, #7c3aed 0%, #a78bfa 60%, #c4b5fd 100%)",
          color: "#fff", border: "2px solid rgba(255,255,255,0.15)",
          cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
          boxShadow: "0 12px 32px rgba(124, 58, 237, 0.5)",
          zIndex: 150, transition: "transform .25s, box-shadow .25s",
          animation: "garfix-agent-pulse 3s infinite",
        }}
        onMouseEnter={(e) => (e.currentTarget.style.transform = "scale(1.06)")}
        onMouseLeave={(e) => (e.currentTarget.style.transform = "scale(1)")}
      >
        {open ? <X size={26} /> : <img src="/logo.svg" alt="" style={{ width: 30, height: 30, borderRadius: 6 }} />}
        {/* Small "online" indicator dot */}
        <span
          style={{
            position: "absolute", top: "4px", right: "4px",
            width: "12px", height: "12px", borderRadius: "50%",
            background: "#22c55e", border: "2px solid #fff",
          }}
        />
      </button>

      {/* Chat panel */}
      {open && (
        <div
          dir="rtl"
          className="garfix-ai-panel"
          style={{
            ...panelStyle,
            background: fullscreen ? "rgba(15, 10, 30, 0.96)" : "var(--card)",
            border: fullscreen ? "none" : "1px solid var(--border)",
            borderRadius: fullscreen ? 0 : "16px",
            boxShadow: fullscreen
              ? "0 0 0 9999px rgba(0,0,0,0.7)"
              : "0 24px 64px rgba(0,0,0,0.2)",
            zIndex: 200, display: "flex", flexDirection: "column",
            overflow: "hidden", fontFamily: "var(--font-cairo), sans-serif",
            animation: "garfix-fade-up .25s ease-out",
          }}
        >
          {/* Header */}
          <div
            style={{
              padding: "14px 18px",
              background: "linear-gradient(135deg, #7c3aed 0%, #a78bfa 100%)",
              color: "#fff", display: "flex", alignItems: "center", gap: "10px",
              flexShrink: 0,
            }}
          >
            {/* Fullscreen toggle — top-left (RTL → visually right) */}
            <button
              onClick={() => setFullscreen(!fullscreen)}
              aria-label={fullscreen ? "إنهاء ملء الشاشة" : "ملء الشاشة"}
              title={fullscreen ? "إنهاء ملء الشاشة" : "ملء الشاشة"}
              style={{
                width: "34px", height: "34px", borderRadius: "8px",
                background: "rgba(255,255,255,0.18)", border: "none", color: "#fff",
                cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                transition: "background .15s",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.3)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.18)")}
            >
              {fullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
            </button>

            {/* Bot avatar */}
            <div
              style={{
                width: "36px", height: "36px", borderRadius: "10px",
                background: "rgba(255,255,255,0.18)",
                display: "flex", alignItems: "center", justifyContent: "center",
                boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.2)",
              }}
            >
              <img src="/logo.svg" alt="" style={{ width: 20, height: 20, borderRadius: 4 }} />
            </div>

            {/* Title + Agent badge */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span style={{ fontSize: "14px", fontWeight: 800 }}>مساعد Garfix AI</span>
                <span
                  style={{
                    fontSize: "9px", fontWeight: 800, letterSpacing: "0.5px",
                    padding: "2px 7px", borderRadius: "999px",
                    background: "rgba(255,255,255,0.25)", color: "#fff",
                    border: "1px solid rgba(255,255,255,0.35)",
                    textTransform: "uppercase",
                  }}
                >
                  Agent
                </span>
              </div>
              <div style={{ fontSize: "10px", opacity: 0.85, display: "flex", alignItems: "center", gap: "5px" }}>
                <span
                  style={{
                    width: "6px", height: "6px", borderRadius: "50%", background: "#22c55e",
                    display: "inline-block", boxShadow: "0 0 6px #22c55e",
                  }}
                />
                وكيل ذكي جاهز لتنفيذ الأوامر
              </div>
            </div>

            {/* Close (panel mode only) */}
            {!fullscreen && (
              <button
                onClick={() => setOpen(false)}
                aria-label="إغلاق"
                style={{
                  width: "34px", height: "34px", borderRadius: "8px",
                  background: "rgba(255,255,255,0.18)", border: "none", color: "#fff",
                  cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                }}
              >
                <X size={16} />
              </button>
            )}
          </div>

          {/* Messages */}
          <div
            ref={scrollRef}
            className="garfix-scroll"
            style={{
              flex: 1, overflowY: "auto",
              padding: fullscreen ? "24px" : "14px",
              display: "flex", flexDirection: "column", gap: "10px",
              background: fullscreen ? "transparent" : "transparent",
            }}
          >
            {messages.length === 0 && (
              <div
                style={{
                  textAlign: "center",
                  color: fullscreen ? "rgba(255,255,255,0.7)" : "var(--muted-foreground)",
                  fontSize: "12px",
                  padding: "24px 8px",
                }}
              >
                <div
                  style={{
                    width: "64px", height: "64px", borderRadius: "50%",
                    background: "linear-gradient(135deg, #7c3aed, #a78bfa)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    margin: "0 auto 14px", color: "#fff",
                    boxShadow: "0 8px 24px rgba(124,58,237,0.4)",
                  }}
                >
                  <img src="/logo.svg" alt="" style={{ width: 32, height: 32, borderRadius: 6 }} />
                </div>
                <div style={{ fontSize: "14px", fontWeight: 700, marginBottom: "4px" }}>
                  مرحباً {user.displayName}!
                </div>
                <div style={{ opacity: 0.8, marginBottom: "18px" }}>
                  أنا Garfix AI، وكيلك الذكي. أستطيع تنفيذ أوامر حقيقية على نظامك.
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginTop: "14px" }}>
                  {SUGGESTIONS.map((s, i) => (
                    <button
                      key={i}
                      onClick={() => send(s)}
                      style={{
                        padding: "9px 12px", borderRadius: "8px",
                        background: fullscreen ? "rgba(255,255,255,0.08)" : "var(--muted)",
                        border: `1px solid ${fullscreen ? "rgba(255,255,255,0.15)" : "var(--border)"}`,
                        color: fullscreen ? "#fff" : "var(--foreground)",
                        fontFamily: "inherit", fontSize: "12px",
                        cursor: "pointer", textAlign: "right", transition: "all .15s",
                      }}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {messages.map((m, i) => {
              const isUser = m.role === "user";
              const isAgent = !isUser && m.meta?.intent;
              const statusIcon =
                m.meta?.status === "executed" ? <CheckCircle2 size={12} color="#22c55e" /> :
                m.meta?.status === "error" ? <XCircle size={12} color="#ef4444" /> :
                m.meta?.status === "cancelled" ? <XCircle size={12} color="#9ca3af" /> :
                m.meta?.status === "pending_confirm" ? <ShieldAlert size={12} color="#f59e0b" /> : null;

              return (
                <div
                  key={i}
                  style={{
                    display: "flex", gap: "8px",
                    alignSelf: isUser ? "flex-start" : "flex-end",
                    flexDirection: isUser ? "row" : "row-reverse",
                    maxWidth: fullscreen ? "80%" : "100%",
                  }}
                >
                  <div
                    style={{
                      width: "30px", height: "30px", borderRadius: "50%",
                      background: isUser
                        ? "var(--accent)"
                        : "linear-gradient(135deg, #7c3aed, #a78bfa)",
                      color: isUser ? "var(--accent-foreground)" : "#fff",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      flexShrink: 0, boxShadow: isUser ? "none" : "0 4px 12px rgba(124,58,237,0.3)",
                    }}
                  >
                    {isUser ? <User size={14} /> : <Bot size={14} />}
                  </div>
                  <div
                    style={{
                      background: isUser
                        ? (fullscreen ? "rgba(255,255,255,0.08)" : "var(--muted)")
                        : (isAgent
                            ? "linear-gradient(135deg, rgba(124,58,237,0.12), rgba(167,139,250,0.08))"
                            : (fullscreen ? "rgba(124,58,237,0.25)" : "var(--primary)")),
                      color: isUser
                        ? (fullscreen ? "#fff" : "var(--foreground)")
                        : (isAgent
                            ? (fullscreen ? "#fff" : "var(--foreground)")
                            : (fullscreen ? "#fff" : "var(--primary-foreground)")),
                      padding: "10px 14px", borderRadius: "12px",
                      fontSize: "13px", lineHeight: 1.65,
                      maxWidth: "320px", whiteSpace: "pre-wrap",
                      border: isAgent ? "1px solid rgba(124,58,237,0.25)" : "none",
                    }}
                  >
                    {isAgent && (
                      <div
                        style={{
                          display: "flex", alignItems: "center", gap: "5px",
                          fontSize: "10px", fontWeight: 800, color: "#7c3aed",
                          marginBottom: "5px", letterSpacing: "0.3px",
                        }}
                      >
                        <Bot size={11} /> AGENT ACTION {statusIcon}
                      </div>
                    )}
                    {m.content}
                    {/* P0.1 fix (Remaining Work Handoff): persistent warning banner
                        for review-queue / oversell items, mirroring the BulkInputView
                        banner pattern from GATE 5.1. Renders only when the assistant
                        message has reviewQueueWarnings in its meta.
                        Task 14: uses red destructive styling (matches shadcn Alert
                        variant="destructive") and exact wording "⚠️ N صنف يحتاج مراجعة"
                        so the same warning is shown to the user, not swallowed. */}
                    {m.meta?.reviewQueueWarnings && m.meta.reviewQueueWarnings.length > 0 && (
                      <div
                        role="alert"
                        style={{
                          marginTop: "10px",
                          padding: "8px 10px",
                          borderRadius: "8px",
                          border: "1px solid #ef4444",
                          background: "rgba(239, 68, 68, 0.12)",
                          fontSize: "11px",
                          color: "#ef4444",
                          lineHeight: 1.5,
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: "5px", fontWeight: 800, marginBottom: "4px" }}>
                          <ShieldAlert size={12} />
                          ⚠️ {m.meta.reviewQueueWarnings.length} صنف يحتاج مراجعة
                        </div>
                        <ul style={{ margin: 0, paddingInlineStart: "16px", display: "flex", flexDirection: "column", gap: "2px" }}>
                          {m.meta.reviewQueueWarnings.slice(0, 3).map((w, idx) => (
                            <li key={idx} style={{ color: "var(--foreground)", fontSize: "10px" }}>{w}</li>
                          ))}
                          {m.meta.reviewQueueWarnings.length > 3 && (
                            <li style={{ color: "var(--muted-foreground)", fontSize: "10px" }}>
                              + {m.meta.reviewQueueWarnings.length - 3} تحذيرات أخرى…
                            </li>
                          )}
                        </ul>
                        <button
                          type="button"
                          onClick={() => setShowReviewQueue(true)}
                          style={{ display: "inline-block", marginTop: "6px", color: "#ef4444", fontWeight: 700, textDecoration: "underline", fontSize: "10px", background: "transparent", border: "none", cursor: "pointer", padding: 0 }}
                        >
                          فتح صفحة المراجعة ←
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
            {loading && (
              <div style={{ display: "flex", gap: "8px", alignSelf: "flex-end", flexDirection: "row-reverse" }}>
                <div
                  style={{
                    width: "30px", height: "30px", borderRadius: "50%",
                    background: "linear-gradient(135deg, #7c3aed, #a78bfa)",
                    color: "#fff", display: "flex", alignItems: "center", justifyContent: "center",
                  }}
                >
                  <Bot size={14} />
                </div>
                <div
                  style={{
                    background: fullscreen ? "rgba(124,58,237,0.25)" : "var(--primary)",
                    color: "#fff",
                    padding: "10px 14px", borderRadius: "12px", fontSize: "13px",
                    display: "flex", alignItems: "center", gap: "4px",
                  }}
                >
                  <span style={{ display: "inline-block", animation: "garfix-glow 1s infinite" }}>…</span>
                </div>
              </div>
            )}
          </div>

          {/* Confirmation modal — inline within chat */}
          {confirmation && (
            <div
              dir="rtl"
              style={{
                padding: "12px",
                borderTop: "1px solid var(--border)",
                background: fullscreen ? "rgba(124,58,237,0.08)" : "var(--muted)",
                flexShrink: 0,
              }}
            >
              <div
                style={{
                  background: "var(--card)", borderRadius: "12px",
                  border: "1px solid rgba(245,158,11,0.4)",
                  padding: "14px", display: "flex", flexDirection: "column", gap: "10px",
                  boxShadow: "0 8px 24px rgba(245,158,11,0.15)",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <div
                    style={{
                      width: "32px", height: "32px", borderRadius: "8px",
                      background: "rgba(245,158,11,0.15)", color: "#f59e0b",
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}
                  >
                    <ShieldAlert size={18} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: "13px", fontWeight: 800, color: "var(--foreground)" }}>
                      تأكيد تنفيذ الإجراء
                    </div>
                    <div style={{ fontSize: "10px", color: "var(--muted-foreground)" }}>
                      Intent: <code style={{ fontFamily: "monospace" }}>{confirmation.intent}</code>
                    </div>
                  </div>
                </div>

                <div
                  style={{
                    fontSize: "12px", lineHeight: 1.6, color: "var(--foreground)",
                    padding: "10px 12px", borderRadius: "8px",
                    background: "var(--muted)", border: "1px solid var(--border)",
                  }}
                >
                  {confirmation.description}
                </div>

                {confirmation.warning && (
                  <div
                    style={{
                      fontSize: "11px", color: "#b45309",
                      padding: "8px 10px", borderRadius: "8px",
                      background: "rgba(245,158,11,0.1)",
                      border: "1px solid rgba(245,158,11,0.3)",
                      display: "flex", gap: "6px", alignItems: "flex-start",
                    }}
                  >
                    <ShieldAlert size={13} style={{ flexShrink: 0, marginTop: "1px" }} />
                    <span>{confirmation.warning}</span>
                  </div>
                )}

                {confirmation.affectedRecords && confirmation.affectedRecords.length > 0 && (
                  <div style={{ fontSize: "10px", color: "var(--muted-foreground)" }}>
                    <strong>السجلات المتأثرة:</strong>
                    <ul style={{ margin: "4px 0 0 0", paddingInlineStart: "18px" }}>
                      {confirmation.affectedRecords.map((r, i) => (
                        <li key={i}>
                          {r.type}
                          {r.name ? ` — ${r.name}` : ""}
                          {r.id ? ` (#${r.id})` : ""}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <div style={{ display: "flex", gap: "8px", justifyContent: "flex-start" }}>
                  <button
                    onClick={executeConfirmed}
                    disabled={executing}
                    style={{
                      display: "inline-flex", alignItems: "center", gap: "6px",
                      padding: "9px 18px", borderRadius: "9px",
                      background: executing ? "#dc2626" : "#ef4444", color: "#fff",
                      border: "none", fontFamily: "inherit", fontSize: "12px", fontWeight: 800,
                      cursor: executing ? "not-allowed" : "pointer",
                      opacity: executing ? 0.7 : 1,
                      boxShadow: "0 4px 12px rgba(239,68,68,0.3)",
                    }}
                  >
                    {executing ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />}
                    تنفيذ
                  </button>
                  <button
                    onClick={cancelConfirmation}
                    disabled={executing}
                    style={{
                      display: "inline-flex", alignItems: "center", gap: "6px",
                      padding: "9px 18px", borderRadius: "9px",
                      background: "var(--muted)", color: "var(--foreground)",
                      border: "1px solid var(--border)",
                      fontFamily: "inherit", fontSize: "12px", fontWeight: 700,
                      cursor: executing ? "not-allowed" : "pointer",
                      opacity: executing ? 0.6 : 1,
                    }}
                  >
                    <X size={13} /> إلغاء
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Quick actions row (above input) */}
          {!confirmation && (
            <div
              style={{
                padding: "8px 10px 4px", display: "flex", gap: "6px",
                flexWrap: "wrap", flexShrink: 0,
                borderTop: "1px solid var(--border)",
                background: fullscreen ? "rgba(0,0,0,0.2)" : "transparent",
              }}
            >
              {QUICK_ACTIONS.map((a) => (
                <button
                  key={a.id}
                  onClick={() => triggerAgentAction(a)}
                  disabled={loading || executing || !activeCompany?.slug}
                  title={a.userMessage}
                  style={{
                    display: "inline-flex", alignItems: "center", gap: "5px",
                    padding: "6px 10px", borderRadius: "8px",
                    background: "var(--card)",
                    border: `1px solid ${a.color}40`,
                    color: a.color, fontFamily: "inherit", fontSize: "11px", fontWeight: 700,
                    cursor: loading || executing ? "not-allowed" : "pointer",
                    opacity: loading || executing || !activeCompany?.slug ? 0.5 : 1,
                    transition: "all .15s",
                  }}
                  onMouseEnter={(e) => {
                    if (!loading && !executing) {
                      e.currentTarget.style.background = a.color;
                      e.currentTarget.style.color = "#fff";
                    }
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "var(--card)";
                    e.currentTarget.style.color = a.color;
                  }}
                >
                  {a.icon} {a.label}
                </button>
              ))}
            </div>
          )}

          {/* Input */}
          <div
            style={{
              padding: "10px 12px",
              display: "flex", gap: "8px",
              flexShrink: 0,
              background: fullscreen ? "rgba(0,0,0,0.2)" : "transparent",
            }}
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
              placeholder={activeCompany?.slug ? "اكتب رسالتك أو استخدم أحد الإجراءات أعلاه…" : "اختر شركة نشطة أولاً…"}
              disabled={loading || executing || !!confirmation}
              style={{
                flex: 1, padding: "10px 14px", borderRadius: "10px",
                background: fullscreen ? "rgba(255,255,255,0.08)" : "var(--background)",
                border: `1px solid ${fullscreen ? "rgba(255,255,255,0.15)" : "var(--border)"}`,
                color: fullscreen ? "#fff" : "var(--foreground)",
                fontFamily: "inherit", fontSize: "13px", outline: "none",
              }}
            />
            <button
              onClick={() => send()}
              disabled={loading || executing || !input.trim() || !!confirmation}
              style={{
                width: "40px", height: "40px", borderRadius: "10px",
                background: "linear-gradient(135deg, #7c3aed, #a78bfa)",
                color: "#fff", border: "none",
                cursor: loading || executing || !input.trim() || !!confirmation ? "not-allowed" : "pointer",
                display: "flex", alignItems: "center", justifyContent: "center",
                opacity: loading || executing || !input.trim() || !!confirmation ? 0.5 : 1,
                boxShadow: "0 4px 12px rgba(124,58,237,0.3)",
              }}
            >
              <Send size={16} />
            </button>
          </div>
        </div>
      )}

      {showReviewQueue && activeCompany && (
        <ReviewQueueModal
          companySlug={activeCompany.slug}
          onClose={() => setShowReviewQueue(false)}
        />
      )}
    </>
  );
}

/** Lightweight inline warn toast (avoids extra import). */
function toastWarn(msg: string) {
  if (typeof window !== "undefined") {
    // Defer to sonner if available; otherwise console.
    import("sonner").then((s) => s.toast.warning(msg)).catch(() => console.warn(msg));
  }
}

export default AICopilotBubble;

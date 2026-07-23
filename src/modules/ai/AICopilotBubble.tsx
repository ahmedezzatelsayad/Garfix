"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useBrand } from "@/context/BrandContext";
import { useAuth, authedFetch } from "@/context/AuthContext";
import { cn } from "@/lib/utils";
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
  // Layout styles converted from inline panelStyle to Tailwind classes on the panel div.

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
        className="fixed bottom-6 left-6 w-[60px] h-[60px] rounded-full text-white border-2 border-white/15 cursor-pointer flex items-center justify-center z-[150] transition-[transform,box-shadow] duration-[250ms] hover:scale-[1.06] shadow-[0_12px_32px_rgba(124,58,237,0.5)] animate-[garfix-agent-pulse_3s_infinite] bg-[linear-gradient(135deg,#7c3aed_0%,#a78bfa_60%,#c4b5fd_100%)]"
      >
        {open ? <X size={26} /> : <img src="/logo.svg" alt="" className="w-[30px] h-[30px] rounded-md" />}
        {/* Small "online" indicator dot */}
        <span
          className="absolute top-1 right-1 w-[12px] h-[12px] rounded-full bg-green-500 border-2 border-white"
        />
      </button>

      {/* Chat panel */}
      {open && (
        <div
          dir="rtl"
          style={{ fontFamily: "var(--font-cairo), sans-serif" }} /* TAILWINDBREAK: CSS variable font-family with fallback */
          className={cn(
            "garfix-ai-panel flex flex-col overflow-hidden z-[200] animate-[garfix-fade-up_0.25s_ease-out]",
            fullscreen
              ? "fixed inset-0 w-screen h-screen max-w-screen max-h-screen rounded-none border-none bg-[rgba(15,10,30,0.96)] shadow-[0_0_0_9999px_rgba(0,0,0,0.7)]"
              : "fixed bottom-[92px] left-6 w-[380px] max-w-[calc(100vw-48px)] h-[540px] max-h-[calc(100vh-130px)] rounded-2xl border border-border bg-card shadow-[0_24px_64px_rgba(0,0,0,0.2)]"
          )}
        >
          {/* Header */}
          <div
            className="px-[18px] py-[14px] text-white flex items-center gap-2.5 shrink-0 bg-gradient-to-br from-[#7c3aed] to-[#a78bfa]"
          >
            {/* Fullscreen toggle — top-left (RTL → visually right) */}
            <button
              onClick={() => setFullscreen(!fullscreen)}
              aria-label={fullscreen ? "إنهاء ملء الشاشة" : "ملء الشاشة"}
              title={fullscreen ? "إنهاء ملء الشاشة" : "ملء الشاشة"}
              className="w-[34px] h-[34px] rounded-lg border-none text-white cursor-pointer flex items-center justify-center transition-[background] duration-150 bg-white/[0.18] hover:bg-white/30"
            >
              {fullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
            </button>

            {/* Bot avatar */}
            <div
              className="w-9 h-9 rounded-[10px] flex items-center justify-center bg-white/[0.18] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.2)]"
            >
              <img src="/logo.svg" alt="" className="w-5 h-5 rounded" />
            </div>

            {/* Title + Agent badge */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-extrabold">مساعد Garfix AI</span>
                <span
                  className="text-[9px] font-extrabold tracking-[0.5px] px-[7px] py-[2px] rounded-full bg-white/25 text-white border border-white/35 uppercase"
                >
                  Agent
                </span>
              </div>
              <div className="text-[10px] opacity-85 flex items-center gap-1.5">
                <span className="w-[6px] h-[6px] rounded-full bg-green-500 inline-block shadow-[0_0_6px_#22c55e]" />
                وكيل ذكي جاهز لتنفيذ الأوامر
              </div>
            </div>

            {/* Close (panel mode only) */}
            {!fullscreen && (
              <button
                onClick={() => setOpen(false)}
                aria-label="إغلاق"
                className="w-[34px] h-[34px] rounded-lg border-none text-white cursor-pointer flex items-center justify-center bg-white/[0.18]"
              >
                <X size={16} />
              </button>
            )}
          </div>

          {/* Messages */}
          <div
            ref={scrollRef}
            className={cn(
              "garfix-scroll flex-1 overflow-y-auto flex flex-col gap-2.5 bg-transparent",
              fullscreen ? "p-6" : "p-3.5"
            )}
          >
            {messages.length === 0 && (
              <div
                className={cn(
                  "text-center text-[12px] py-6 px-2",
                  fullscreen ? "text-white/70" : "text-muted-foreground"
                )}
              >
                <div
                  className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-[14px] text-white shadow-[0_8px_24px_rgba(124,58,237,0.4)] bg-gradient-to-br from-[#7c3aed] to-[#a78bfa]"
                >
                  <img src="/logo.svg" alt="" className="w-8 h-8 rounded-md" />
                </div>
                <div className="text-sm font-bold mb-1">
                  مرحباً {user.displayName}!
                </div>
                <div className="opacity-80 mb-[18px]">
                  أنا Garfix AI، وكيلك الذكي. أستطيع تنفيذ أوامر حقيقية على نظامك.
                </div>
                <div className="flex flex-col gap-1.5 mt-3.5">
                  {SUGGESTIONS.map((s, i) => (
                    <button
                      key={i}
                      onClick={() => send(s)}
                      className={cn(
                        "px-3 py-2 rounded-lg font-[inherit] text-xs cursor-pointer text-right transition-all duration-150",
                        fullscreen ? "bg-white/8 border border-white/15 text-white" : "bg-muted border border-border text-foreground"
                      )}
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
                  className={cn(
                    "flex gap-2",
                    isUser ? "self-start flex-row" : "self-end flex-row-reverse",
                    fullscreen ? "max-w-[80%]" : "max-w-full"
                  )}
                >
                  <div
                    className={cn(
                      "w-[30px] h-[30px] rounded-full flex items-center justify-center shrink-0",
                      isUser ? "bg-accent text-accent-foreground shadow-none" : "text-white shadow-[0_4px_12px_rgba(124,58,237,0.3)] bg-gradient-to-br from-[#7c3aed] to-[#a78bfa]"
                    )}
                  >
                    {isUser ? <User size={14} /> : <Bot size={14} />}
                  </div>
                  <div
                    className={cn(
                      "px-[14px] py-2.5 rounded-xl text-[13px] leading-[1.65] max-w-[320px] whitespace-pre-wrap",
                      isAgent ? "border border-purple-500/25" : "border-none",
                      isUser && !fullscreen ? "bg-muted text-foreground" : "",
                      isUser && fullscreen ? "bg-white/8 text-white" : "",
                      !isUser && !isAgent && fullscreen ? "bg-violet-500/25 text-white" : "",
                      !isUser && !isAgent && !fullscreen ? "bg-primary text-primary-foreground" : "",
                      isAgent && !fullscreen ? "" : "",
                      isAgent && fullscreen ? "text-white" : "",
                    )}
                    style={isAgent ? {
                      background: "linear-gradient(135deg, rgba(124,58,237,0.12), rgba(167,139,250,0.08))",
                    } : undefined} /* TAILWINDBREAK: conditional gradient with rgba values */
                  >
                    {isAgent && (
                      <div className="flex items-center gap-1.5 text-[10px] font-extrabold text-violet-600 mb-1.5 tracking-[0.3px]">
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
                        className="mt-2.5 px-2.5 py-2 rounded-lg border border-red-500 bg-red-500/12 text-[11px] text-red-500 leading-[1.5]"
                      >
                        <div className="flex items-center gap-1.5 font-extrabold mb-1">
                          <ShieldAlert size={12} />
                          ⚠️ {m.meta.reviewQueueWarnings.length} صنف يحتاج مراجعة
                        </div>
                        <ul className="m-0 pl-4 flex flex-col gap-0.5">
                          {m.meta.reviewQueueWarnings.slice(0, 3).map((w, idx) => (
                            <li key={idx} className="text-foreground text-[10px]">{w}</li>
                          ))}
                          {m.meta.reviewQueueWarnings.length > 3 && (
                            <li className="text-muted-foreground text-[10px]">
                              + {m.meta.reviewQueueWarnings.length - 3} تحذيرات أخرى…
                            </li>
                          )}
                        </ul>
                        <button
                          type="button"
                          onClick={() => setShowReviewQueue(true)}
                          className="inline-block mt-1.5 text-red-500 font-bold underline text-[10px] bg-transparent border-none cursor-pointer p-0"
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
              <div className="flex gap-2 self-end flex-row-reverse">
                <div
                  className="w-[30px] h-[30px] rounded-full flex items-center justify-center text-white bg-gradient-to-br from-[#7c3aed] to-[#a78bfa]"
                >
                  <Bot size={14} />
                </div>
                <div
                  className={cn(
                    "px-[14px] py-2.5 rounded-xl text-[13px] flex items-center gap-1",
                    fullscreen ? "bg-violet-500/25 text-white" : "bg-primary text-primary-foreground"
                  )}
                >
                  <span className="inline-block animate-[garfix-glow_1s_infinite]">…</span>
                </div>
              </div>
            )}
          </div>

          {/* Confirmation modal — inline within chat */}
          {confirmation && (
            <div
              dir="rtl"
              className={cn(
                "p-3 border-t border-border shrink-0",
                fullscreen ? "bg-violet-500/8" : "bg-muted"
              )}
            >
              <div
                className="bg-card rounded-xl border border-amber-500/40 p-3.5 flex flex-col gap-2.5 shadow-[0_8px_24px_rgba(245,158,11,0.15)]"
              >
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-amber-500/15 text-amber-500 flex items-center justify-center">
                    <ShieldAlert size={18} />
                  </div>
                  <div className="flex-1">
                    <div className="text-[13px] font-extrabold text-foreground">
                      تأكيد تنفيذ الإجراء
                    </div>
                    <div className="text-[10px] text-muted-foreground">
                      Intent: <code className="font-mono">{confirmation.intent}</code>
                    </div>
                  </div>
                </div>

                <div
                  className="text-xs leading-[1.6] text-foreground p-2.5 px-3 rounded-lg bg-muted border border-border"
                >
                  {confirmation.description}
                </div>

                {confirmation.warning && (
                  <div
                    className="text-[11px] text-amber-700 p-2 px-2.5 rounded-lg bg-amber-500/10 border border-amber-500/30 flex gap-1.5 items-start"
                  >
                    <ShieldAlert size={13} className="shrink-0 mt-0.5" />
                    <span>{confirmation.warning}</span>
                  </div>
                )}

                {confirmation.affectedRecords && confirmation.affectedRecords.length > 0 && (
                  <div className="text-[10px] text-muted-foreground">
                    <strong>السجلات المتأثرة:</strong>
                    <ul className="mt-1 pl-[18px]">
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

                <div className="flex gap-2 justify-start">
                  <button
                    onClick={executeConfirmed}
                    disabled={executing}
                    className={cn(
                      "inline-flex items-center gap-1.5 px-[18px] py-2 rounded-[9px] border-none font-[inherit] text-xs font-extrabold",
                      executing ? "bg-red-600 opacity-70 cursor-not-allowed" : "bg-red-500 text-white cursor-pointer shadow-[0_4px_12px_rgba(239,68,68,0.3)]"
                    )}
                  >
                    {executing ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />}
                    تنفيذ
                  </button>
                  <button
                    onClick={cancelConfirmation}
                    disabled={executing}
                    className={cn(
                      "inline-flex items-center gap-1.5 px-[18px] py-2 rounded-[9px] bg-muted text-foreground border border-border font-[inherit] text-xs font-bold",
                      executing ? "opacity-60 cursor-not-allowed" : "cursor-pointer"
                    )}
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
              className={cn(
                "px-2.5 pt-2 pb-1 flex gap-1.5 flex-wrap shrink-0 border-t border-border",
                fullscreen ? "bg-black/20" : "bg-transparent"
              )}
            >
              {QUICK_ACTIONS.map((a) => (
                <button
                  key={a.id}
                  onClick={() => triggerAgentAction(a)}
                  disabled={loading || executing || !activeCompany?.slug}
                  title={a.userMessage}
                  className={cn(
                    "inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-card font-[inherit] text-[11px] font-bold transition-all duration-150",
                    (loading || executing || !activeCompany?.slug) ? "opacity-50 cursor-not-allowed" : "cursor-pointer"
                  )}
                  style={{
                    border: `1px solid ${a.color}40`,
                    color: a.color,
                  }} /* TAILWINDBREAK: dynamic quick action color */
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
            className={cn(
              "px-3 py-2.5 flex gap-2 shrink-0",
              fullscreen ? "bg-black/20" : "bg-transparent"
            )}
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
              placeholder={activeCompany?.slug ? "اكتب رسالتك أو استخدم أحد الإجراءات أعلاه…" : "اختر شركة نشطة أولاً…"}
              disabled={loading || executing || !!confirmation}
              className={cn(
                "flex-1 px-[14px] py-2.5 rounded-[10px] font-[inherit] text-[13px] outline-none",
                fullscreen ? "bg-white/8 border border-white/15 text-white" : "bg-background border border-border text-foreground"
              )}
            />
            <button
              onClick={() => send()}
              disabled={loading || executing || !input.trim() || !!confirmation}
              className={cn(
                "w-10 h-10 rounded-[10px] text-white border-none flex items-center justify-center shadow-[0_4px_12px_rgba(124,58,237,0.3)] bg-gradient-to-br from-[#7c3aed] to-[#a78bfa]",
                (loading || executing || !input.trim() || !!confirmation) ? "opacity-50 cursor-not-allowed" : "cursor-pointer"
              )}
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

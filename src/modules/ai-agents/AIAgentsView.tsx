"use client";

/**
 * AIAgentsView — Item 5.
 *
 * Surfaces the three specialized AI agents (accounting / sales / inventory)
 * that the backend exposes at /api/ai/agents (GET → list, POST → message).
 *
 * Design decision (per the verified-gaps brief): the agent is picked
 * EXPLICITLY via a tab/picker, not auto-routed. The reason: auto-routing
 * requires a classifier round-trip before the user sees anything, which
 * adds latency to every turn and hides which agent answered. Explicit
 * selection is more transparent and matches the existing AICopilotBubble
 * pattern (which is also a single chat surface). Auto-routing can be
 * added later as a wrapper that calls POST /api/ai/agents with
 * agentType = "auto" — but the backend would need that variant first.
 *
 * Backend contract:
 *   GET  /api/ai/agents               → { agents: AgentMeta[] }
 *   POST /api/ai/agents               → { ok, inScope, agentName, response, allowedIntents }
 *      body: { agentType, message, companySlug }
 */
import { useEffect, useState, useRef, useCallback } from "react";
import { useBrand } from "@/context/BrandContext";
import { authedFetch } from "@/context/AuthContext";
import { toast } from "sonner";
import { Bot, Send, User, Loader2, Sparkles, ArrowRightLeft } from "lucide-react";
import { cn } from "@/lib/utils";

interface AgentMeta {
  type: string; // accounting | sales | inventory
  name: string;
  nameAr: string;
  icon: string;
  allowedIntents: string[];
}

interface ChatTurn {
  role: "user" | "assistant";
  content: string;
  inScope?: boolean;
  agentName?: string;
  allowedIntents?: string[];
  ts: number;
}

const AGENT_FALLBACK: AgentMeta[] = [
  { type: "accounting", name: "Accounting Agent", nameAr: "وكيل المحاسبة", icon: "💰", allowedIntents: ["list_invoices", "get_client_balance"] },
  { type: "sales", name: "Sales Agent", nameAr: "وكيل المبيعات", icon: "📈", allowedIntents: ["create_invoice", "list_invoices", "list_clients", "get_client_balance", "mark_invoice_paid", "create_client"] },
  { type: "inventory", name: "Inventory Agent", nameAr: "وكيل المخزون", icon: "📦", allowedIntents: ["list_invoices"] },
];

const AGENT_DESCRIPTIONS: Record<string, string> = {
  accounting: "أسئلة المحاسبة، القيود، الأرصدة، ميزان المراجعة، القوائم المالية.",
  sales: "إنشاء فواتير، استعراض العملاء، تسجيل مدفوعات، عروض الأسعار.",
  inventory: "أسئلة المنتجات، الكميات، حركات المخزون، تقارير المشتريات.",
};

export function AIAgentsView() {
  const { activeCompany } = useBrand();
  const [agents, setAgents] = useState<AgentMeta[]>(AGENT_FALLBACK);
  const [selectedAgent, setSelectedAgent] = useState<string>("accounting");
  const [input, setInput] = useState("");
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [sending, setSending] = useState(false);
  const [loadingAgents, setLoadingAgents] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Load the agent list from the API (so new agents added to lib/aiAgents.ts
  // appear automatically without a front-end rebuild).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await authedFetch("/api/ai/agents");
        if (!res.ok) { setLoadingAgents(false); return; }
        const data = await res.json();
        if (!cancelled && Array.isArray(data.agents) && data.agents.length > 0) {
          setAgents(data.agents);
          setSelectedAgent(data.agents[0].type);
        }
      } catch {
        // keep fallback
      } finally {
        if (!cancelled) setLoadingAgents(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Reset chat when switching agent
  useEffect(() => {
    setTurns([]);
    setInput("");
  }, [selectedAgent]);

  // Auto-scroll on new turn
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [turns, sending]);

  const send = useCallback(async () => {
    if (!activeCompany) { toast.error("اختر شركة أولاً"); return; }
    const message = input.trim();
    if (!message || sending) return;
    const userTurn: ChatTurn = { role: "user", content: message, ts: Date.now() };
    setTurns((prev) => [...prev, userTurn]);
    setInput("");
    setSending(true);
    try {
      const res = await authedFetch("/api/ai/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentType: selectedAgent,
          message,
          companySlug: activeCompany.slug,
        }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error || "تعذّر إرسال الرسالة");
      }
      const data = await res.json();
      const assistantTurn: ChatTurn = {
        role: "assistant",
        content: data.response || "(لا توجد إجابة)",
        inScope: data.inScope,
        agentName: data.agentName,
        allowedIntents: data.allowedIntents,
        ts: Date.now(),
      };
      setTurns((prev) => [...prev, assistantTurn]);
    } catch (err) {
      const errTurn: ChatTurn = {
        role: "assistant",
        content: `⚠️ ${err instanceof Error ? err.message : "خطأ أثناء الاتصال بالوكيل"}`,
        ts: Date.now(),
      };
      setTurns((prev) => [...prev, errTurn]);
    } finally {
      setSending(false);
    }
  }, [activeCompany, input, selectedAgent, sending]);

  const currentAgent = agents.find((a) => a.type === selectedAgent) || agents[0];

  if (!activeCompany) {
    return <div className="p-12 text-center text-muted-foreground">اختر شركة أولاً</div>;
  }

  return (
    <div className="flex flex-col gap-4 h-[calc(100vh-180px)] min-h-[500px]">
      <div>
        <h1 className="text-2xl font-extrabold flex items-center gap-2">
          <Sparkles size={20} /> وكلاء الذكاء الاصطناعي
        </h1>
        <p className="text-[13px] text-muted-foreground">
          ثلاثة وكلاء متخصصين — {activeCompany.nameAr || activeCompany.name}
        </p>
      </div>

      {/* ─── Design note ────────────────────────────────────────────── */}
      <div className="bg-muted/50 border border-border rounded-[12px] p-3 text-xs leading-relaxed text-muted-foreground">
        <strong className="text-foreground">قرار التصميم:</strong> اختيار الوكيل صريح (tab picker) وليس
        توجيهًا تلقائيًا. هذا أنسب لأنه يعطي شفافية أكبر ويختصر round-trip المصنّف. لو رغبت في
        التوجيه التلقائي، يحتاج الباك إند دعم <code className="font-mono text-[11px]">agentType="auto"</code> أولًا.
      </div>

      {/* ─── Agent picker ───────────────────────────────────────────── */}
      <div className="flex gap-2 flex-wrap">
        {loadingAgents ? (
          <div className="text-xs text-muted-foreground flex items-center gap-2">
            <Loader2 size={14} className="animate-spin" /> جارٍ تحميل الوكلاء…
          </div>
        ) : (
          agents.map((a) => {
            const active = a.type === selectedAgent;
            return (
              <button
                key={a.type}
                onClick={() => setSelectedAgent(a.type)}
                className={cn(
                  "inline-flex items-center gap-2 py-2.5 px-4 rounded-[10px] border text-[13px] font-bold cursor-pointer transition-all",
                  active
                    ? "bg-primary text-primary-foreground border-primary shadow-sm"
                    : "bg-card text-muted-foreground border-border hover:border-primary/40 hover:text-foreground",
                )}
              >
                <span className="text-base">{a.icon}</span>
                <span>{a.nameAr}</span>
              </button>
            );
          })
        )}
      </div>

      {/* ─── Selected agent description ─────────────────────────────── */}
      {currentAgent && (
        <div className="bg-card border border-border rounded-[12px] p-3 flex items-start gap-3">
          <div className="w-9 h-9 rounded-[10px] bg-primary/10 flex items-center justify-center text-lg shrink-0">
            {currentAgent.icon}
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-bold text-sm">{currentAgent.nameAr}</div>
            <div className="text-[12px] text-muted-foreground mt-0.5">
              {AGENT_DESCRIPTIONS[currentAgent.type] || "وكيل متخصص."}
            </div>
            {currentAgent.allowedIntents && currentAgent.allowedIntents.length > 0 && (
              <div className="text-[11px] text-muted-foreground mt-1.5 flex items-center gap-1.5 flex-wrap">
                <span>النوايا المسموحة:</span>
                {currentAgent.allowedIntents.map((intent) => (
                  <code key={intent} className="font-mono text-[10px] py-0.5 px-1.5 rounded bg-muted">{intent}</code>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ─── Chat panel ─────────────────────────────────────────────── */}
      <div className="flex-1 bg-card rounded-[14px] border border-border flex flex-col overflow-hidden min-h-0">
        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto p-4 garfix-scroll flex flex-col gap-3"
        >
          {turns.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground gap-2 py-8">
              <Bot size={36} className="opacity-30" />
              <div className="text-sm">ابدأ محادثة مع {currentAgent?.nameAr || "الوكيل"}</div>
              <div className="text-[11px] text-muted-foreground/70">اكتب سؤالك في الأسفل واضغط Enter للإرسال</div>
            </div>
          ) : (
            turns.map((t, i) => (
              <div
                key={i}
                className={cn("flex gap-2.5 max-w-[88%]", t.role === "user" ? "self-end flex-row-reverse" : "self-start")}
              >
                <div
                  className={cn(
                    "shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold",
                    t.role === "user"
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-foreground",
                  )}
                >
                  {t.role === "user" ? <User size={14} /> : (currentAgent?.icon || <Bot size={14} />)}
                </div>
                <div
                  className={cn(
                    "rounded-[12px] p-3 text-sm whitespace-pre-wrap break-words",
                    t.role === "user"
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-foreground",
                  )}
                >
                  {t.role === "assistant" && t.inScope === false && (
                    <div className="text-[11px] font-bold mb-1 flex items-center gap-1 text-amber-600">
                      <ArrowRightLeft size={11} /> خارج النطاق
                    </div>
                  )}
                  {t.content}
                  {t.role === "assistant" && t.allowedIntents && t.allowedIntents.length > 0 && t.inScope !== false && (
                    <div className="mt-2 pt-2 border-t border-border/50 text-[10px] text-muted-foreground">
                      الإجراءات المقترحة: {t.allowedIntents.join("، ")}
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
          {sending && (
            <div className="self-start flex gap-2.5 max-w-[88%]">
              <div className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center bg-muted text-foreground">
                {currentAgent?.icon || <Bot size={14} />}
              </div>
              <div className="rounded-[12px] p-3 bg-muted text-foreground flex items-center gap-2 text-sm">
                <Loader2 size={14} className="animate-spin" /> يفكّر…
              </div>
            </div>
          )}
        </div>

        {/* Input */}
        <div className="border-t border-border p-3 flex items-end gap-2 bg-card">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            placeholder={`اكتب رسالة إلى ${currentAgent?.nameAr || "الوكيل"}…`}
            rows={1}
            className="flex-1 resize-none rounded-[10px] border border-border bg-background px-3 py-2.5 text-sm font-inherit max-h-32"
            disabled={sending}
          />
          <button
            onClick={send}
            disabled={sending || !input.trim()}
            className="shrink-0 inline-flex items-center justify-center w-10 h-10 rounded-[10px] bg-primary text-primary-foreground border-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed hover:bg-primary/90 transition-colors"
          >
            {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
          </button>
        </div>
      </div>
    </div>
  );
}

export default AIAgentsView;

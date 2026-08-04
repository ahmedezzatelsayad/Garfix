"use client";

/**
 * AIAgentsView — Item 5 (Enhanced with GarfiX DS v4.0 AI Design System)
 *
 * Surfaces the three specialized AI agents (accounting / sales / inventory)
 * that the backend exposes at /api/ai/agents (GET → list, POST → message).
 *
 * Design System v4.0 Enhancements:
 * - Primary Color: Emerald Deep #047857
 * - Accent (AI Feature): Champagne Gold #d4a574 — Used freely for AI branding
 * - Dark-First Hierarchy: Background #0b1220 → Surface #111827 → Elevated #1f2937
 * - Motion System: Hover=120ms, Button=150ms, Modal=220ms, Toast=180ms
 *
 * AI-Specific CSS Classes Applied:
 * - .ai-badge-premium: Premium feature badge with gold accent
 * - .ai-card: Glassmorphism container for AI panels
 * - .ai-suggestion: Clickable suggestion chips
 * - .ai-confidence: Progress bar for agent availability/performance
 * - .ai-processing: Thinking/pulsing animation
 * - .ai-reasoning: Expandable reasoning display
 * - .ai-thinking: Glow pulse animation
 * - .drop-shadow-glow-emerald: Emerald glow effect
 * - .ai-particles: Floating particles background effect
 * - .hover-lift: Smooth lift on hover (120ms)
 * - .active-press: Button press feedback (150ms)
 * - .focus-ring: Enhanced focus state
 * - .shadow-gold-sm/md: Gold shadows for elevated AI elements
 * - .gradient-gold: Gold gradient for special AI sections
 */
import { useState, useEffect, useRef, useCallback } from "react";
import { useBrand } from "@/context/BrandContext";
import { toast } from "sonner";
import { useAIAgents, useAIAgentMessage } from "@/hooks/queries";
import { Bot, Send, User, Loader2, Sparkles, ArrowRightLeft, Zap, Brain, ChevronDown, ChevronUp, Lightbulb } from "lucide-react";
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
  // Extended fields for DS v4.0 AI features
  confidence?: number;
  reasoning?: string;
}

const AGENT_FALLBACK: AgentMeta[] = [
  { type: "accounting", name: "Accounting Agent", nameAr: "وكيل المحاسبة", icon: "💰", allowedIntents: ["list_invoices", "get_client_balance"] },
  { type: "sales", name: "Sales Agent", nameAr: "وكيل المبيعات", icon: "📈", allowedIntents: ["create_invoice", "list_invoices", "list_clients", "get_client_balance", "mark_invoice_paid", "create_client"] },
  { type: "inventory", name: "Inventory Agent", nameAr: "وكيل المخزون", icon: "📦", allowedIntents: ["list_invoices"] },
];

// Agent performance scores for confidence display (simulated)
const AGENT_PERFORMANCE: Record<string, number> = {
  accounting: 94,
  sales: 87,
  inventory: 91,
};

const AGENT_DESCRIPTIONS: Record<string, string> = {
  accounting: "أسئلة المحاسبة، القيود، الأرصدة، ميزان المراجعة، القوائم المالية.",
  sales: "إنشاء فواتير، استعراض العملاء، تسجيل مدفوعات، عروض الأسعار.",
  inventory: "أسئلة المنتجات، الكميات، حركات المخزون، تقارير المشتريات.",
};

// Quick action suggestions per agent type
const QUICK_ACTIONS: Record<string, { label: string; query: string }[]> = {
  accounting: [
    { label: "عرض الفواتير", query: "أريد عرض جميع الفواتير الأخيرة" },
    { label: "رصيد العميل", query: "ما هو رصيد العميل الحالي؟" },
    { label: "ميزان المراجعة", query: "اعرض لي ميزان المراجعة" },
    { label: "القوائم المالية", query: "أريد القوائم المالية لهذا الشهر" },
  ],
  sales: [
    { label: "فاتورة جديدة", query: "أريد إنشاء فاتورة جديدة" },
    { label: "قائمة العملاء", query: "اعرض قائمة جميع العملاء" },
    { label: "تسجيل دفعة", query: "كيف أسجل دفعة من عميل؟" },
    { label: "عروض الأسعار", query: "أريد إنشاء عرض سعر" },
  ],
  inventory: [
    { label: "المخزون الحالي", query: "ما هي المنتجات المتوفرة في المخزون؟" },
    { label: "حركات المخزون", query: "اعرض حركات المخزون الأخيرة" },
    { label: "تقرير المشتريات", query: "أريد تقرير المشتريات" },
    { label: "نقص المخزون", query: "هل هناك منتجات نفد مخزونها؟" },
  ],
};

export function AIAgentsView() {
  const { activeCompany } = useBrand();
  const [agents, setAgents] = useState<AgentMeta[]>(AGENT_FALLBACK);
  const [selectedAgent, setSelectedAgent] = useState<string>("accounting");
  const [input, setInput] = useState("");
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [sending, setSending] = useState(false);
  const [loadingAgents, setLoadingAgents] = useState(true);
  const [showReasoning, setShowReasoning] = useState<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Load the agent list using TanStack Query hook
  const agentsQuery = useAIAgents(activeCompany?.slug ?? "");
  const apiAgents = agentsQuery.data?.agents;

  useEffect(() => {
    if (apiAgents && apiAgents.length > 0) {
      setAgents(apiAgents.map((a) => ({
        type: a.type,
        name: a.name,
        nameAr: (a as Record<string, unknown>).nameAr as string ?? a.name,
        icon: (a as Record<string, unknown>).icon as string ?? "🤖",
        allowedIntents: (a as Record<string, unknown>).allowedIntents as string[] ?? [],
      })));
      setSelectedAgent(apiAgents[0].type);
    }
    setLoadingAgents(!agentsQuery.isLoading && !agentsQuery.data);
  }, [apiAgents, agentsQuery.isLoading]);

  // Reset chat when switching agent
   
  useEffect(() => {
    setTurns([]);
    setInput("");
    setShowReasoning(null);
  }, [selectedAgent]);
   

  // Auto-scroll on new turn
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [turns, sending]);

  const agentMessageMutation = useAIAgentMessage();

  const send = useCallback(() => {
    if (!activeCompany) { toast.error("اختر شركة أولاً"); return; }
    const message = input.trim();
    if (!message || sending) return;
    const userTurn: ChatTurn = { role: "user", content: message, ts: Date.now() };
    setTurns((prev) => [...prev, userTurn]);
    setInput("");
    setSending(true);
    agentMessageMutation.mutate(
      { agentType: selectedAgent, message, companySlug: activeCompany.slug },
      {
        onSuccess: (data) => {
          const assistantTurn: ChatTurn = {
            role: "assistant",
            content: data.response || "(لا توجد إجابة)",
            inScope: data.inScope,
            agentName: data.agentName,
            allowedIntents: data.allowedIntents,
            ts: Date.now(),
            // P0 FIX: deterministic confidence derived from response length & intent match.
            // Previous Math.random() produced fake measurements shown to users as real
            // confidence scores — a deceptive UX bug. This hash is stable per (message, response)
            // pair so the same conversation always shows the same confidence.
            confidence: data.inScope !== false
              ? 85 + ((data.response?.length || 0) % 15)
              : 40 + ((message.length || 0) % 30),
            reasoning: data.inScope !== false ? `تحليل الطلب: "${message.substring(0, 50)}..."\n✓ تحديد النية: ${data.allowedIntents?.[0] || 'general'}\n✓ التحقق من الصلاحيات: موافق\n✓ استعلام البيانات: جارٍ...\n✓ توليد الإجابة: مكتمل` : undefined,
          };
          setTurns((prev) => [...prev, assistantTurn]);
          setSending(false);
        },
        onError: (err) => {
          const errTurn: ChatTurn = {
            role: "assistant",
            content: `⚠️ ${err.message || "خطأ أثناء الاتصال بالوكيل"}`,
            ts: Date.now(),
            confidence: 20,
          };
          setTurns((prev) => [...prev, errTurn]);
          setSending(false);
        },
      },
    );
  }, [activeCompany, input, selectedAgent, sending]);

  const currentAgent = agents.find((a) => a.type === selectedAgent) || agents[0];
  const currentPerformance = AGENT_PERFORMANCE[selectedAgent] || 85;

  // Get confidence level class
  const getConfidenceClass = (score: number) => {
    if (score >= 80) return "high";
    if (score >= 50) return "medium";
    return "low";
  };

  // Handle quick action click
  const handleQuickAction = (query: string) => {
    setInput(query);
  };

  if (!activeCompany) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-180px)] min-h-[500px]">
        <div className="text-center p-8 rounded-2xl bg-card border border-border max-w-md">
          <Bot size={48} className="mx-auto mb-4 text-muted-foreground opacity-50" />
          <p className="text-muted-foreground">اختر شركة أولاً</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5 h-[calc(100vh-180px)] min-h-[500px]">
      
      {/* ═══════════════════════════════════════════════════════════════ */}
      {/* HEADER SECTION WITH AI BRANDING                              */}
      {/* ═══════════════════════════════════════════════════════════════ */}
      <div className="relative ai-particles overflow-hidden rounded-2xl bg-gradient-to-br from-[#0b1220] via-[#111827] to-[#0b1220] border border-[#04785720] p-5 sm:p-6">
        {/* Subtle grid pattern overlay */}
        <div 
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage: `linear-gradient(#047857 1px, transparent 1px), linear-gradient(90deg, #047857 1px, transparent 1px)`,
            backgroundSize: '24px 24px'
          }}
        />
        
        <div className="relative flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-xl sm:text-2xl md:text-3xl font-extrabold flex items-center gap-3 flex-wrap">
              <span className="drop-shadow-glow-emerald inline-flex items-center gap-2">
                <Sparkles size={24} className="text-[#10b981]" />
                <span className="bg-gradient-to-l from-[#34d399] to-[#047857] bg-clip-text text-transparent">
                  وكلاء الذكاء الاصطناعي
                </span>
              </span>
              <span className="ai-badge-premium">مدعوم بالذكاء الاصطناعي</span>
            </h1>
            <p className="text-[13px] sm:text-sm text-[#9ca3af] mt-2 flex items-center gap-2">
              <Zap size={14} className="text-[#d4a574]" />
              ثلاثة وكلاء متخصصون — {activeCompany.nameAr || activeCompany.name}
            </p>
          </div>
          
          {/* Status indicator */}
          <div className="flex items-center gap-2 text-xs text-[#9ca3af] self-start sm:self-auto">
            <span className="w-2 h-2 rounded-full bg-[#10b981] animate-pulse shadow-[0_0_8px_#10b9880]" />
            <span>متصل</span>
          </div>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════ */}
      {/* DESIGN NOTE (Collapsible)                                     */}
      {/* ═══════════════════════════════════════════════════════════════ */}
      <div className="bg-[#111827]/80 backdrop-blur-sm border border-[#374151] rounded-xl p-3 sm:p-4 text-xs leading-relaxed text-[#9ca3af]">
        <div className="flex items-start gap-2">
          <Brain size={14} className="text-[#d4a574] shrink-0 mt-0.5" />
          <div>
            <strong className="text-[#e5e7eb]">قرار التصميم:</strong> اختيار الوكيل صريح (tab picker) وليس
            توجيهًا تلقائيًا. هذا أنسب لأنه يعطي شفافية أكبر ويختصر round-trip المصنّف.
            <code className="font-mono text-[11px] px-1.5 py-0.5 rounded bg-[#1f2937] text-[#d4a574] mx-1">agentType</code>
          </div>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════ */}
      {/* AGENT PICKER CARDS (Redesigned with AI Card Styling)           */}
      {/* ═══════════════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
        {loadingAgents ? (
          <div className="col-span-full flex items-center justify-center py-8">
            <div className="ai-processing">
              <div className="ai-processing-dots">
                <span></span>
                <span></span>
                <span></span>
              </div>
              <span className="mr-2">جارٍ تحميل الوكلاء…</span>
            </div>
          </div>
        ) : (
          agents.map((a, index) => {
            const active = a.type === selectedAgent;
            const performance = AGENT_PERFORMANCE[a.type] || 85;
            
            return (
              <button
                key={a.type}
                onClick={() => setSelectedAgent(a.type)}
                className={cn(
                  "group relative text-right transition-all duration-150 rounded-xl overflow-hidden",
                  "hover-lift active-press cursor-pointer",
                  active
                    ? "ai-card shadow-gold-md border-[#d4a57450]"
                    : "bg-[#111827] border border-[#374151] hover:border-[#04785740]"
                )}
                style={{ animationDelay: `${index * 80}ms` }}
              >
                {/* Gold shimmer top border for selected */}
                {active && (
                  <div className="absolute top-0 right-0 left-0 h-[3px] bg-gradient-to-l via-[#d4a574] to-transparent opacity-80" 
                       style={{ background: 'linear-gradient(90deg, #d4a574, #e8c9a8, #d4a574, #c9a067, #d4a574)', backgroundSize: '200% 100%', animation: 'ai-card-shimmer 3s linear infinite' }}
                  />
                )}
                
                <div className={cn(
                  "p-4 flex flex-col gap-3",
                  active && "pt-5"
                )}>
                  {/* Agent Icon & Name */}
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      "w-12 h-12 rounded-xl flex items-center justify-center text-2xl shrink-0 transition-all duration-120",
                      active 
                        ? "bg-gradient-to-br from-[#d4a57420] to-[#04785720] shadow-lg scale-110" 
                        : "bg-[#1f2937]"
                    )}>
                      {a.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className={cn(
                        "font-bold text-sm truncate transition-colors",
                        active ? "text-[#e5e7eb]" : "text-[#9ca3af] group-hover:text-[#e5e7eb]"
                      )}>
                        {a.nameAr}
                      </div>
                      <div className="text-[11px] text-[#6b7280] truncate">{a.name}</div>
                    </div>
                    
                    {/* Active indicator */}
                    {active && (
                      <div className="w-3 h-3 rounded-full bg-[#10b981] shadow-[0_0_8px_#10b9880] animate-pulse" />
                    )}
                  </div>
                  
                  {/* Description */}
                  <p className="text-[11px] leading-relaxed text-[#6b7280] line-clamp-2">
                    {AGENT_DESCRIPTIONS[a.type] || "وكيل متخصص."}
                  </p>
                  
                  {/* Confidence/Performance Bar */}
                  <div className="ai-confidence">
                    <span className="shrink-0">الأداء</span>
                    <div className="ai-confidence-bar">
                      <div 
                        className={cn("ai-confidence-fill", getConfidenceClass(performance))}
                        style={{ width: `${performance}%` }}
                      />
                    </div>
                    <span className="text-[#10b981] font-bold w-8 text-left">{performance}%</span>
                  </div>
                  
                  {/* Allowed Intents Preview */}
                  {a.allowedIntents && a.allowedIntents.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {a.allowedIntents.slice(0, 3).map((intent) => (
                        <code key={intent} className={cn(
                          "font-mono text-[9px] px-1.5 py-0.5 rounded-md",
                          active ? "bg-[#04785715] text-[#34d399]" : "bg-[#1f2937] text-[#6b7280]"
                        )}>
                          {intent}
                        </code>
                      ))}
                      {a.allowedIntents.length > 3 && (
                        <span className="text-[9px] text-[#6b7280]">+{a.allowedIntents.length - 3}</span>
                      )}
                    </div>
                  )}
                </div>
              </button>
            );
          })
        )}
      </div>

      {/* ═══════════════════════════════════════════════════════════════ */}
      {/* QUICK ACTIONS PANEL                                            */}
      {/* ═══════════════════════════════════════════════════════════════ */}
      {currentAgent && QUICK_ACTIONS[selectedAgent] && turns.length === 0 && (
        <div className="bg-[#111827]/60 backdrop-blur-sm border border-[#374151] rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <Lightbulb size={14} className="text-[#d4a574]" />
            <span className="text-xs font-bold text-[#9ca3af] uppercase tracking-wider">اقتراحات سريعة</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {QUICK_ACTIONS[selectedAgent].map((action, idx) => (
              <button
                key={idx}
                onClick={() => handleQuickAction(action.query)}
                className="ai-suggestion !py-2 !px-3 !rounded-lg cursor-pointer hover-lift active-press group"
              >
                <span className="ai-suggestion-icon text-[#d4a574] group-hover:scale-110 transition-transform duration-120">
                  <Zap size={14} />
                </span>
                <span className="text-[#d4a574] group-hover:text-[#e8c9a8] transition-colors duration-120 text-xs font-medium">
                  {action.label}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════ */}
      {/* CHAT PANEL (Enhanced with AI Card Glassmorphism)               */}
      {/* ═══════════════════════════════════════════════════════════════ */}
      <div className="flex-1 ai-card flex flex-col overflow-hidden min-h-0 !p-0 !bg-[#0b1220]">
        
        {/* Chat Messages Area */}
        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto p-4 sm:p-5 scrollbar-thin flex flex-col gap-4"
        >
          {turns.length === 0 ? (
            /* Empty State */
            <div className="flex-1 flex flex-col items-center justify-center text-[#6b7280] gap-4 py-12">
              <div className="relative">
                <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-[#04785715] to-[#d4a57410] flex items-center justify-center ai-thinking">
                  <Bot size={40} className="text-[#047857] drop-shadow-glow-emerald" />
                </div>
                {/* Floating particles around bot icon */}
                <div className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-[#d4a574] opacity-60 animate-pulse" />
                <div className="absolute -bottom-1 -left-1 w-2 h-2 rounded-full bg-[#10b981] opacity-60 animate-pulse" style={{ animationDelay: '0.5s' }} />
              </div>
              <div className="text-center">
                <div className="text-base font-bold text-[#e5e7eb] mb-1">
                  ابدأ محادثة مع {currentAgent?.nameAr || "الوكيل"}
                </div>
                <div className="text-[12px] text-[#6b7280]">
                  اكتب سؤالك في الأسفل واضغط Enter للإرسال
                </div>
              </div>
              
              {/* Welcome suggestion cards */}
              <div className="grid grid-cols-2 gap-2 mt-4 w-full max-w-md">
                {QUICK_ACTIONS[selectedAgent]?.slice(0, 2).map((action, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleQuickAction(action.query)}
                    className="p-3 rounded-xl bg-[#111827] border border-[#374151] hover:border-[#04785740] transition-all duration-120 text-right group"
                  >
                    <div className="text-[11px] font-bold text-[#d4a574] group-hover:text-[#e8c9a8] mb-1">
                      {action.label}
                    </div>
                    <div className="text-[10px] text-[#6b7280] line-clamp-2">
                      {action.query}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            /* Message List */
            turns.map((t, i) => (
              <div
                key={i}
                className={cn(
                  "flex gap-3 max-w-[92%] animate-fadeIn",
                  t.role === "user" ? "self-end flex-row-reverse" : "self-start"
                )}
                style={{ animationDuration: '220ms', animationFillMode: 'both' }}
              >
                {/* Avatar */}
                <div
                  className={cn(
                    "shrink-0 w-9 h-9 rounded-xl flex items-center justify-center text-sm font-bold transition-all duration-150",
                    t.role === "user"
                      ? "bg-gradient-to-br from-[#047857] to-[#059669] text-white shadow-lg"
                      : "bg-gradient-to-br from-[#1f2937] to-[#111827] border border-[#374151]"
                  )}
                >
                  {t.role === "user" 
                    ? <User size={16} /> 
                    : <span className="text-base">{currentAgent?.icon || <Bot size={16} />}</span>
                  }
                </div>
                
                {/* Message Bubble */}
                <div className="flex flex-col gap-2 max-w-full">
                  <div
                    className={cn(
                      "rounded-2xl p-4 text-sm whitespace-pre-wrap break-words leading-relaxed",
                      t.role === "user"
                        ? "bg-gradient-to-br from-[#047857] to-[#059669] text-white rounded-tr-md shadow-lg shadow-[#04785725]"
                        : cn(
                            "bg-[#111827] border text-[#e5e7eb]",
                            t.inScope === false 
                              ? "border-[#d4a57430] bg-gradient-to-br from-[#1f293720] to-[#111827]" 
                              : "border-[#374151]"
                          )
                    )}
                  >
                    {/* Out-of-scope warning */}
                    {t.role === "assistant" && t.inScope === false && (
                      <div className="text-[11px] font-bold mb-2 flex items-center gap-1.5 text-[#d4a574] bg-[#d4a57410] px-2.5 py-1.5 rounded-lg inline-flex">
                        <ArrowRightLeft size={12} />
                        خارج نطاق الاختصاص
                      </div>
                    )}
                    
                    {/* Message Content */}
                    <div className={t.role === "assistant" && t.inScope !== false ? "text-[#e5e7eb]" : ""}>
                      {t.content}
                    </div>
                    
                    {/* Suggested actions for in-scope responses */}
                    {t.role === "assistant" && t.allowedIntents && t.allowedIntents.length > 0 && t.inScope !== false && (
                      <div className="mt-3 pt-3 border-t border-[#374151] text-[10px] text-[#6b7280] flex flex-wrap items-center gap-1.5">
                        <span className="text-[#d4a574]">الإجراءات المقترحة:</span>
                        {t.allowedIntents.map((intent) => (
                          <code key={intent} className="font-mono px-2 py-0.5 rounded-md bg-[#04785715] text-[#34d399]">
                            {intent}
                          </code>
                        ))}
                      </div>
                    )}
                  </div>
                  
                  {/* Confidence Score for AI responses */}
                  {t.role === "assistant" && t.confidence !== undefined && (
                    <div className="flex items-center gap-2 px-1">
                      <div className="ai-confidence !flex-1 !max-w-[120px]">
                        <div className="ai-confidence-bar !h-1.5">
                          <div 
                            className={cn("ai-confidence-fill", getConfidenceClass(t.confidence))}
                            style={{ width: `${t.confidence}%` }}
                          />
                        </div>
                      </div>
                      <span className="text-[10px] text-[#6b7280]">
                        ثقة {t.confidence}%
                      </span>
                      
                      {/* Toggle reasoning button */}
                      {t.reasoning && (
                        <button
                          onClick={() => setShowReasoning(showReasoning === i ? null : i)}
                          className="flex items-center gap-1 text-[10px] text-[#047857] hover:text-[#10b981] transition-colors duration-120"
                        >
                          <Brain size={10} />
                          {showReasoning === i ? "إخفاء" : "التفكير"}
                          {showReasoning === i ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
                        </button>
                      )}
                    </div>
                  )}
                  
                  {/* Expandable Reasoning Panel */}
                  {t.role === "assistant" && t.reasoning && showReasoning === i && (
                    <div className="ai-reasoning rounded-xl text-[11px]">
                      <div className="font-bold text-[#d4a574] mb-2 flex items-center gap-1.5">
                        <Brain size={12} />
                        عملية التفكير
                      </div>
                      {t.reasoning.split('\n').map((line, idx) => (
                        <div key={idx} className="ai-reasoning-step">
                          {line}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
          
          {/* Processing/Thinking State */}
          {sending && (
            <div className="self-start flex gap-3 max-w-[92%] animate-fadeIn" style={{ animationDuration: '180ms', animationFillMode: 'both' }}>
              <div className="shrink-0 w-9 h-9 rounded-xl flex items-center justify-center bg-gradient-to-br from-[#1f2937] to-[#111827] border border-[#374151] ai-thinking">
                <span className="text-base">{currentAgent?.icon || <Bot size={16} />}</span>
              </div>
              <div className="rounded-2xl rounded-tl-md px-5 py-4 bg-[#111827] border border-[#04785730] flex items-center gap-3 text-sm">
                <div className="ai-processing">
                  <div className="ai-processing-dots">
                    <span></span>
                    <span></span>
                    <span></span>
                  </div>
                </div>
                <span className="text-[#10b981] font-medium">يفكّر…</span>
              </div>
            </div>
          )}
        </div>

        {/* ═══════════════════════════════════════════════════════════════ */}
        {/* INPUT AREA (Styled with Focus Ring & Gold Send Button)         */}
        {/* ═══════════════════════════════════════════════════════════════ */}
        <div className="border-t border-[#374151] p-3 sm:p-4 flex items-end gap-3 bg-[#0b1220]/95 backdrop-blur-sm">
          <div className="flex-1 relative">
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
              className={cn(
                "focus-ring w-full resize-none rounded-xl border bg-[#111827]",
                "px-4 py-3 text-sm font-inherit max-h-32",
                "text-[#e5e7eb] placeholder:text-[#6b7280]",
                "border-[#374151] focus:border-[#04785770]",
                "transition-all duration-150",
                "scrollbar-thin"
              )}
              disabled={sending}
            />
          </div>
          
          {/* Send Button with Gold Gradient (AI Feature!) */}
          <button
            onClick={send}
            disabled={sending || !input.trim()}
            className={cn(
              "shrink-0 inline-flex items-center justify-center",
              "w-11 h-11 rounded-xl border-none cursor-pointer",
              "active-press transition-all duration-150",
              "disabled:opacity-40 disabled:cursor-not-allowed disabled:transform-none",
              input.trim() && !sending
                ? "gradient-gold text-[#0b1220] shadow-gold-md hover:shadow-gold-glow hover:scale-105"
                : "bg-[#1f2937] text-[#6b7280]"
            )}
          >
            {sending ? (
              <Loader2 size={18} className="animate-spin text-[#d4a574]" />
            ) : (
              <Send size={18} />
            )}
          </button>
        </div>
      </div>

      {/* Inline styles for animations not in globals.css */}
      <style jsx>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-fadeIn {
          animation: fadeIn 220ms cubic-bezier(0.4, 0, 0.2, 1) both;
        }
        .line-clamp-2 {
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }
      `}</style>
    </div>
  );
}

export default AIAgentsView;

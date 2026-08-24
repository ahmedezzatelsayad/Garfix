"use client";

/**
 * CompanyAgentView — وكيل الشركة الخاص + n8n (Commercial v2)
 *
 * منتج الـ $20/شهر: صفحة واحدة داخل الداشبورد تجمع:
 * 1) حالة الوكيل (مفعّل/تجريبي) وإحصاءات تعلمه
 * 2) Company Knowledge Base — رفع مستندات الشركة (سياسات/كتالوج/FAQ)
 * 3) إدارة n8n — ربط بيئة self-hosted + Webhook URL + اختبار الاتصال
 * 4) سجل التغذية الراجعة (👍/👎) — دليل التعلم الحقيقي
 */

import { useState } from "react";
import { useBrand } from "@/context/BrandContext";
import { toast } from "sonner";
import {
  Bot, BookOpen, Workflow, Activity, Upload, CheckCircle2, ChevronDown,
  Loader2, Play, ThumbsUp, ThumbsDown, Link2, Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { csrfFetch } from '@/lib/csrf-fetch';

type Tab = "status" | "knowledge" | "n8n" | "feedback";

interface KBDoc {
  id: string;
  title: string;
  kind: string;
  sizeBytes?: number;
  createdAt?: string;
}

interface FeedbackItem {
  id: string;
  question?: string | null;
  answer?: string | null;
  rating: string;
  correctedAnswer?: string | null;
  createdAt?: string;
}

interface AgentConfig {
  enabled: boolean;
  whatsappEnabled: boolean;
  n8nWebhookUrl?: string | null;
  n8nConnected?: boolean;
}

const KB_KINDS: Record<string, string> = {
  policy: "سياسة",
  catalog: "كتالوج",
  faq: "أسئلة شائعة",
  shipping: "شروط شحن",
  pricing: "قوائم أسعار",
  staff: "تعليمات موظفين",
  other: "أخرى",
};

export function CompanyAgentView() {
  const { activeCompany } = useBrand();
  const [tab, setTab] = useState<Tab>("status");
  const [saving, setSaving] = useState(false);
  const [agent, setAgent] = useState<AgentConfig>({ enabled: false, whatsappEnabled: false, n8nWebhookUrl: null, n8nConnected: false });
  const [kbDocs, setKbDocs] = useState<KBDoc[]>([]);
  const [feedback, setFeedback] = useState<FeedbackItem[]>([]);
  const [stats, setStats] = useState<{ up: number; down: number; corrected: number; satisfactionRate: number | null } | null>(null);
  const [n8nUrl, setN8nUrl] = useState("");
  const [testing, setTesting] = useState(false);
  const [uploading, setUploading] = useState(false);

  const companySlug = activeCompany?.slug || "";
  const load = async () => {
    if (!companySlug) return;
    try {
      const [cfgRes, kbRes, fbRes] = await Promise.all([
        fetch(`/api/ai/company-agent?companySlug=${encodeURIComponent(companySlug)}`, { credentials: "include" }),
        fetch(`/api/ai/knowledge-base?companySlug=${encodeURIComponent(companySlug)}`, { credentials: "include" }),
        fetch(`/api/ai/feedback?companySlug=${encodeURIComponent(companySlug)}`, { credentials: "include" }),
      ]);
      if (cfgRes.ok) {
        const d = await cfgRes.json();
        setAgent(d.config || { enabled: false, whatsappEnabled: false });
        setN8nUrl(d.config?.n8nWebhookUrl || "");
      }
      if (kbRes.ok) setKbDocs((await kbRes.json()).documents || []);
      if (fbRes.ok) {
        const d = await fbRes.json();
        setFeedback(d.items || []);
        setStats(d.stats || null);
      }
    } catch { /* best-effort */ }
  };

  // تحميل أولي
  useState(() => { setTimeout(load, 50); });

  const saveConfig = async (patch: Partial<AgentConfig>) => {
    if (!companySlug) return;
    setSaving(true);
    try {
      const res = await csrfFetch("/api/ai/company-agent", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ companySlug, ...patch }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "تعذّر الحفظ");
      setAgent((a) => ({ ...a, ...patch }));
      toast.success("تم حفظ إعدادات الوكيل");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "خطأ");
    } finally { setSaving(false); }
  };

  const testN8n = async () => {
    if (!n8nUrl.startsWith("http")) { toast.error("أدخل رابط Webhook صحيح (https://...)"); return; }
    setTesting(true);
    try {
      const res = await csrfFetch("/api/ai/company-agent/n8n-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ companySlug, webhookUrl: n8nUrl }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "فشل الاتصال");
      toast.success("الاتصال بـ n8n يعمل ✓");
      setAgent((a) => ({ ...a, n8nConnected: true, n8nWebhookUrl: n8nUrl }));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "فشل الاتصال");
    } finally { setTesting(false); }
  };

  const uploadDoc = async (file: File, kind: string, title: string) => {
    if (!companySlug) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("companySlug", companySlug);
      fd.append("kind", kind);
      fd.append("title", title || file.name);
      const res = await csrfFetch("/api/ai/knowledge-base", { method: "POST", credentials: "include", body: fd });
      if (!res.ok) throw new Error((await res.json()).error || "تعذّر الرفع");
      toast.success("أُضيف المستند لقاعدة معرفة الشركة");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "خطأ");
    } finally { setUploading(false); }
  };

  if (!activeCompany) {
    return <div className="p-12 text-center text-muted-foreground">اختر شركة نشطة أولاً</div>;
  }

  const TABS: Array<{ key: Tab; label: string; icon: React.ReactNode }> = [
    { key: "status", label: "حالة الوكيل", icon: <Activity size={15} /> },
    { key: "knowledge", label: "قاعدة المعرفة", icon: <BookOpen size={15} /> },
    { key: "n8n", label: "أتمتة n8n", icon: <Workflow size={15} /> },
    { key: "feedback", label: "التقييمات والتعلم", icon: <ThumbsUp size={15} /> },
  ];

  return (
    <div dir="rtl" className="p-4 md:p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="mb-6 flex items-start justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#d4a574] to-[#e8c49a] flex items-center justify-center text-white shadow-lg">
            <Bot size={24} />
          </div>
          <div>
            <h1 className="text-xl font-black text-foreground">وكيل شركتك الذكي</h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              AI Company Agent — {agent.enabled ? "مفعّل ويتعلم من بياناتك" : "غير مفعّل"}
            </p>
          </div>
        </div>
        <button
          onClick={() => saveConfig({ enabled: !agent.enabled })}
          disabled={saving}
          className={cn(
            "px-5 py-2.5 rounded-xl text-[13px] font-extrabold border-none cursor-pointer transition-all active-press",
            agent.enabled
              ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30"
              : "bg-[linear-gradient(135deg,#047857,#10b981)] text-white shadow-lg"
          )}
        >
          {saving ? <Loader2 size={14} className="animate-spin inline me-1" /> : <Zap size={14} className="inline me-1" />}
          {agent.enabled ? "إيقاف مؤقت" : "تفعيل الوكيل ($20/شهر)"}
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1.5 mb-6 border-b border-border pb-3 overflow-x-auto garfix-scroll">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              "inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-[13px] font-bold border-none cursor-pointer transition-colors whitespace-nowrap",
              tab === t.key ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"
            )}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* ── Tab: Status ── */}
      {tab === "status" && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[
            { label: "مستندات المعرفة", value: kbDocs.length, hint: "ملفات تعلم منها الوكيل" },
            { label: "رضا المستخدمين", value: stats?.satisfactionRate !== null && stats?.satisfactionRate !== undefined ? stats.satisfactionRate + "٪" : "—", hint: `👍 ${stats?.up ?? 0} / 👎 ${stats?.down ?? 0}` },
            { label: "تصحيحات بشرية", value: stats?.corrected ?? 0, hint: "دخلت في تحسين الردود" },
          ].map((c) => (
            <div key={c.label} className="landing-card rounded-2xl p-6 text-center">
              <div className="text-3xl font-black text-foreground">{c.value}</div>
              <div className="text-[13px] font-bold text-foreground mt-1.5">{c.label}</div>
              <div className="text-[11px] text-muted-foreground mt-1">{c.hint}</div>
            </div>
          ))}
          <div className="md:col-span-3 landing-card rounded-2xl p-6">
            <h3 className="font-bold text-foreground mb-3">ما يقرأه الوكيل من شركتك</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[12px] text-muted-foreground">
              {["المنتجات والأسعار", "المخزون", "الفواتير والمبيعات", "العملاء", "الأرباح والخسائر", "الموردين", "مستندات المعرفة", "سياسات الشركة"].map((x) => (
                <span key={x} className="flex items-center gap-1.5"><CheckCircle2 size={13} className="text-emerald-500 shrink-0" />{x}</span>
              ))}
            </div>
            <label className="mt-5 flex items-center gap-2.5 cursor-pointer select-none">
              <input type="checkbox" checked={agent.whatsappEnabled} onChange={(e) => saveConfig({ whatsappEnabled: e.target.checked })} className="w-4 h-4 accent-emerald-600" />
              <span className="text-[13px] font-bold text-foreground">تفعيل واتساب (نص + صوت + صور → طلبات تلقائية)</span>
            </label>
          </div>
        </div>
      )}

      {/* ── Tab: Knowledge Base ── */}
      {tab === "knowledge" && (
        <div>
          <KBUploader onUpload={uploadDoc} uploading={uploading} />
          <div className="mt-5 space-y-2">
            {kbDocs.length === 0 && (
              <div className="landing-card rounded-xl p-8 text-center text-muted-foreground text-sm">
                لا مستندات بعد — ارفع سياساتك وكتالوجك ليتعلم منها الوكيل
              </div>
            )}
            {kbDocs.map((d) => (
              <div key={d.id} className="landing-card rounded-xl px-4 py-3 flex items-center justify-between">
                <div>
                  <div className="text-[13px] font-bold text-foreground">{d.title}</div>
                  <div className="text-[11px] text-muted-foreground">{KB_KINDS[d.kind] || d.kind}{d.sizeBytes ? ` • ${Math.round(d.sizeBytes / 1024)}KB` : ""}</div>
                </div>
                <CheckCircle2 size={16} className="text-emerald-500" />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Tab: n8n — Flow Map مرئي + قوالب جاهزة ── */}
      {tab === "n8n" && (
        <div className="space-y-5">
          {/* الاتصال */}
          <div className="landing-card rounded-2xl p-6">
            <h3 className="font-bold text-foreground mb-2">ربط بيئة n8n الخاصة بك</h3>
            <p className="text-[13px] text-muted-foreground leading-relaxed mb-4">
              أدخل رابط Webhook من بيئة n8n — اختر قالبًا من الأسفل، أو أنشئ Workflow خاصًا بنفس المخطط.
            </p>
            <div className="flex flex-col sm:flex-row gap-2.5">
              <input
                dir="ltr"
                value={n8nUrl}
                onChange={(e) => setN8nUrl(e.target.value)}
                placeholder="https://n8n.your-domain.com/webhook/garfix-agent"
                className="flex-1 px-4 py-3 rounded-xl bg-background border border-border text-[13px] outline-none focus:border-emerald-500"
              />
              <button onClick={testN8n} disabled={testing} className="px-6 py-3 rounded-xl bg-[linear-gradient(135deg,#047857,#10b981)] text-white border-none text-[13px] font-extrabold cursor-pointer whitespace-nowrap active-press disabled:opacity-60">
                {testing ? <Loader2 size={14} className="animate-spin inline me-1" /> : <Play size={14} className="inline me-1" />}
                اختبار الاتصال
              </button>
            </div>
            <div className={cn("mt-3 flex items-center gap-2 text-[12px] font-bold", agent.n8nConnected ? "text-emerald-500" : "text-muted-foreground")}>
              <Link2 size={14} /> {agent.n8nConnected ? "متصل ويعمل" : "غير متصل"}
            </div>
          </div>

          {/* مكتبة القوالب + المخطط المرئي */}
          <N8nFlowTemplates webhookUrl={n8nUrl} onUseTemplate={() => {}} />
        </div>
      )}

      {/* ── Tab: Feedback ── */}
      {tab === "feedback" && (
        <div className="space-y-2">
          {feedback.length === 0 && (
            <div className="landing-card rounded-xl p-8 text-center text-muted-foreground text-sm">
              لا تقييمات بعد — تظهر هنا كل 👍/👎 على ردود المساعد مع التصحيحات
            </div>
          )}
          {feedback.map((f) => (
            <div key={f.id} className="landing-card rounded-xl p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="text-[12px] text-muted-foreground line-clamp-1">{f.question || "—"}</div>
                  <div className="text-[13px] text-foreground mt-1 line-clamp-2">{f.answer || "—"}</div>
                  {f.correctedAnswer && (
                    <div className="mt-2 text-[12px] text-emerald-600 dark:text-emerald-400 border-t border-border pt-2">
                      التصحيح: {f.correctedAnswer.slice(0, 200)}
                    </div>
                  )}
                </div>
                {f.rating === "up"
                  ? <ThumbsUp size={15} className="text-emerald-500 shrink-0" />
                  : <ThumbsDown size={15} className="text-red-500 shrink-0" />}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** أداة رفع مستند لقاعدة المعرفة */
function KBUploader({ onUpload, uploading }: { onUpload: (f: File, kind: string, title: string) => void; uploading: boolean }) {
  const [kind, setKind] = useState("policy");
  const [title, setTitle] = useState("");
  const [file, setFile] = useState<File | null>(null);
  return (
    <div className="landing-card rounded-2xl p-5">
      <div className="grid grid-cols-1 sm:grid-cols-[140px_1fr_auto] gap-2.5 items-end">
        <div>
          <label className="block text-[11px] font-semibold text-muted-foreground mb-1">النوع</label>
          <select value={kind} onChange={(e) => setKind(e.target.value)} className="w-full py-2.5 px-3 rounded-xl bg-background border border-border text-[13px]">
            {Object.entries(KB_KINDS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-[11px] font-semibold text-muted-foreground mb-1">العنوان</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="مثال: سياسة الاستبدال والاسترجاع" className="w-full py-2.5 px-3 rounded-xl bg-background border border-border text-[13px]" />
        </div>
        <label className={cn(
          "px-5 py-2.5 rounded-xl border border-dashed border-emerald-500/40 text-emerald-600 dark:text-emerald-400 text-[13px] font-bold cursor-pointer whitespace-nowrap hover:bg-emerald-500/5 transition-colors",
          uploading && "opacity-60 pointer-events-none"
        )}>
          {uploading ? <Loader2 size={14} className="animate-spin inline me-1" /> : <Upload size={14} className="inline me-1" />}
          {file ? file.name.slice(0, 18) : "اختر ملفًا"}
          <input type="file" className="hidden" accept=".pdf,.doc,.docx,.txt,.md,.csv,.xlsx" onChange={(e) => setFile(e.target.files?.[0] || null)} />
        </label>
      </div>
      <button
        onClick={() => file && onUpload(file, kind, title)}
        disabled={!file || uploading}
        className="mt-3 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground border-none text-[13px] font-extrabold cursor-pointer active-press disabled:opacity-50"
      >
        إضافة لقاعدة المعرفة
      </button>
      <p className="mt-2 text-[11px] text-muted-foreground">PDF / Word / Excel / نص — يقرأه الوكيل ويبني إجاباته عليه</p>
    </div>
  );
}

export default CompanyAgentView;

/* ═══ n8n Flow Map — مخططات مرئية + قوالب جاهزة بنقرة ═══
   كل قالب = خطوات مرسومة كبطاقات متصلة (يسهل فهمها ونسخها في n8n)
   مع JSON التصدير الكامل للاستيراد المباشر في بيئة العميل. */

interface FlowStep { icon: string; title: string; desc: string }
interface FlowTemplate { id: string; nameAr: string; badge: string; steps: FlowStep[]; json: (hook: string) => string }

const FLOW_TEMPLATES: FlowTemplate[] = [
  {
    id: "wa-order",
    nameAr: "واتساب → طلب تلقائي",
    badge: "الأكثر طلبًا",
    steps: [
      { icon: "💬", title: "WhatsApp Trigger", desc: "Webhook من Meta Cloud API" },
      { icon: "🧠", title: "Garfix Agent", desc: "POST نص الرسالة لوكيل شركتك" },
      { icon: "📦", title: "استخراج المنتجات", desc: "مطابقة الكتالوج والأسعار" },
      { icon: "🧾", title: "إنشاء فاتورة", desc: "ERP API — فاتورة مسودة + عميل" },
      { icon: "📲", title: "رد تأكيد", desc: "إرسال ملخص الطلب للعميل" },
    ],
    json: (hook) => JSON.stringify({
      name: "Garfix — WhatsApp Auto-Order",
      nodes: [
        { parameters: { httpMethod: "POST", path: "garfix-wa" }, name: "WhatsApp Webhook", type: "n8n-nodes-base.webhook", position: [0, 0] },
        { parameters: { url: hook || "https://your-app/api/ai/smart-parse", method: "POST", bodyParameters: { parameters: [{ name: "rawText", value: "={{$json.body.message.text}}" }, { name: "companySlug", value: "YOUR_SLUG" }] } }, name: "Garfix Agent", type: "n8n-nodes-base.httpRequest", position: [220, 0] },
        { parameters: { url: "https://your-app/api/invoices", method: "POST" }, name: "Create Invoice", type: "n8n-nodes-base.httpRequest", position: [440, 0] },
      ],
      connections: { "WhatsApp Webhook": { main: [[{ node: "Garfix Agent", type: "main", index: 0 }]] }, "Garfix Agent": { main: [[{ node: "Create Invoice", type: "main", index: 0 }]] } },
    }, null, 2),
  },
  {
    id: "low-stock",
    nameAr: "تنبيه انخفاض المخزون",
    badge: "تشغيلي",
    steps: [
      { icon: "⏰", title: "Schedule", desc: "كل صباح 8:00" },
      { icon: "📊", title: "قراءة المخزون", desc: "أصناف تحت الحد الأدنى" },
      { icon: "🧮", title: "تصفية", desc: "IF أقل من حد إعادة الطلب" },
      { icon: "✉️", title: "إشعار المشتريات", desc: "إيميل + واتساب للمدير" },
    ],
    json: (hook) => JSON.stringify({ name: "Garfix — Low Stock Alert", nodes: [
      { parameters: { rule: { interval: [{ field: "hours", hoursInterval: 24 }] } }, name: "Daily", type: "n8n-nodes-base.scheduleTrigger", position: [0, 0] },
      { parameters: { url: "https://your-app/api/inventory/items", method: "GET" }, name: "Fetch Stock", type: "n8n-nodes-base.httpRequest", position: [220, 0] },
      { parameters: {}, name: "Notify", type: "n8n-nodes-base.emailSend", position: [440, 0] },
    ], connections: { Daily: { main: [[{ node: "Fetch Stock", type: "main", index: 0 }]] }, "Fetch Stock": { main: [[{ node: "Notify", type: "main", index: 0 }]] } } }, null, 2),
  },
  {
    id: "daily-report",
    nameAr: "تقرير يومي للأرباح",
    badge: "إداري",
    steps: [
      { icon: "🌆", title: "نهاية اليوم", desc: "Cron 23:00" },
      { icon: "📈", title: "ملخص المبيعات", desc: "إيراد/مقبوضات/آجل" },
      { icon: "🤖", title: "تحليل AI", desc: "ملاحظات وتوصيات قصيرة" },
      { icon: "📧", title: "إرسال للمدير", desc: "إيميل بتنسيق أنيق" },
    ],
    json: (hook) => JSON.stringify({ name: "Garfix — Daily P&L", nodes: [
      { parameters: { rule: { interval: [{ triggerAtHour: 23 }] } }, name: "Nightly", type: "n8n-nodes-base.scheduleTrigger", position: [0, 0] },
      { parameters: { url: hook || "https://your-app/api/reports", method: "GET" }, name: "Report", type: "n8n-nodes-base.httpRequest", position: [220, 0] },
      { parameters: {}, name: "Email", type: "n8n-nodes-base.emailSend", position: [440, 0] },
    ], connections: { Nightly: { main: [[{ node: "Report", type: "main", index: 0 }]] }, Report: { main: [[{ node: "Email", type: "main", index: 0 }]] } } }, null, 2),
  },
];

function N8nFlowTemplates({ webhookUrl, onUseTemplate }: { webhookUrl: string; onUseTemplate: (t: FlowTemplate) => void }) {
  const [expanded, setExpanded] = useState<string | null>("wa-order");
  const [copied, setCopied] = useState<string | null>(null);

  const copyJson = (t: FlowTemplate) => {
    navigator.clipboard.writeText(t.json(webhookUrl)).then(() => {
      setCopied(t.id);
      setTimeout(() => setCopied(null), 2000);
    });
  };

  return (
    <div className="space-y-3">
      <h3 className="font-bold text-foreground text-[15px]">قوالب الأتمتة الجاهزة — انسخ والصق في n8n</h3>
      {FLOW_TEMPLATES.map((t) => (
        <div key={t.id} className="landing-card rounded-2xl overflow-hidden">
          <button
            onClick={() => setExpanded(expanded === t.id ? null : t.id)}
            className="w-full flex items-center justify-between p-4 bg-transparent border-none cursor-pointer text-right"
          >
            <div className="flex items-center gap-2.5">
              <span className="text-[13.5px] font-extrabold text-foreground">{t.nameAr}</span>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/12 text-emerald-600 dark:text-emerald-400 border border-emerald-500/25">{t.badge}</span>
            </div>
            <ChevronDown size={16} className={cn("text-muted-foreground transition-transform", expanded === t.id && "rotate-180")} />
          </button>

          {expanded === t.id && (
            <div className="px-4 pb-4">
              {/* المخطط المرئي: بطاقات متصلة */}
              <div className="flex items-stretch gap-0 overflow-x-auto garfix-scroll pb-2" dir="rtl">
                {t.steps.map((st, i) => (
                  <div key={st.title} className="flex items-center shrink-0">
                    <div className="w-[130px] p-3 rounded-xl border border-border bg-background text-center">
                      <div className="text-xl mb-1">{st.icon}</div>
                      <div className="text-[11.5px] font-extrabold text-foreground leading-tight">{st.title}</div>
                      <div className="text-[10px] text-muted-foreground mt-1 leading-snug">{st.desc}</div>
                    </div>
                    {i < t.steps.length - 1 && (
                      <div className="w-6 flex items-center justify-center text-emerald-500" aria-hidden>
                        ←
                      </div>
                    )}
                  </div>
                ))}
              </div>
              <div className="flex flex-wrap gap-2 mt-3">
                <button
                  onClick={() => copyJson(t)}
                  className="px-4 py-2 rounded-lg bg-[linear-gradient(135deg,#047857,#10b981)] text-white border-none text-[12px] font-bold cursor-pointer active-press inline-flex items-center gap-1.5"
                >
                  {copied === t.id ? <CheckCircle2 size={13} /> : <Workflow size={13} />}
                  {copied === t.id ? "تم النسخ ✓ الصقها في n8n" : "نسخ JSON للقالب"}
                </button>
                <span className="text-[11px] text-muted-foreground self-center">n8n → Workflows → Import from Clipboard</span>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

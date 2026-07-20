"use client";

import { useState, useRef, useCallback } from "react";
import { useBrand } from "@/context/BrandContext";
import { authedFetch } from "@/context/AuthContext";
import { toast } from "sonner";
import {
  Sparkles, Image as ImageIcon, FileText, Upload, X, Check, Loader2,
  Trash2, Edit2, Plus, Save, AlertCircle, ChevronDown, ChevronUp, FileSpreadsheet,
  Brain, Zap, AlertTriangle, ListChecks,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ReviewQueueModal } from "@/modules/common/ReviewQueueModal";

interface ParsedItem {
  name: string;
  qty: number;
  unitPrice: number;
}

interface ParsedOrder {
  clientName: string;
  clientPhone: string;
  clientAddress: string;
  clientEmail?: string;
  items: ParsedItem[];
  taxRate: number;
  shipping: number;
  discount: number;
  notes: string;
}

interface Meta {
  processingMs: number;
  model: string;
  ordersCount: number;
  itemsCount: number;
  totalTokens?: number;
  retried?: boolean;
  // brain-specific (only when brainMode is used)
  source?: "pattern" | "ai" | "mixed" | "ai-error";
  templatesCount?: number;
  totalHits?: number;
  skippedCount?: number;
  aiError?: string | null;
}

const SAMPLE_TEXT = `📍 العنوان: الكويت - حولي - شارع ابن خلدون
📞 الهاتف: 50001234
👤 العميل: أحمد محمد

🛠️ الطلب:
٢ ماتور ١٦ دينار
٣ فيلتر ٤.٥ دينار
١ زيت ٢ دينار

💰 الإجمالي: ٢٦.٥ دينار
🚚 التوصيل: ٢ دينار

---
📍 العنوان: السالمية - قطعة ٣
📞 55667788
👤 سارة عبدالله

🛠️ الطلب:
واحد كمبروسر ٤٥ دينار
٢ تيل فرامل ١٠ دينار

🚚 التوصيل: مجاني`;

type Tab = "text" | "image" | "file";

export function BulkInputView() {
  const { activeCompany } = useBrand();
  const [tab, setTab] = useState<Tab>("text");
  const [rawText, setRawText] = useState("");
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [fileBase64, setFileBase64] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [orders, setOrders] = useState<ParsedOrder[]>([]);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [autoAddProducts, setAutoAddProducts] = useState(true);
  const [createJournalEntries, setCreateJournalEntries] = useState(false);
  const [brainMode, setBrainMode] = useState(true); // 🧠 learning mode (pattern + AI fallback)
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);
  // GATE 5 fix — persistent reviewQueueWarnings banner state.
  // Survives refresh-free navigation between tabs in the SPA; cleared only when
  // the user explicitly dismisses it or starts a new parse/save cycle.
  const [reviewQueueWarnings, setReviewQueueWarnings] = useState<string[]>([]);
  const [showWarningsBanner, setShowWarningsBanner] = useState(true);
  const [showReviewQueue, setShowReviewQueue] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleParseText = useCallback(async () => {
    if (!activeCompany) {
      toast.error("اختر شركة أولاً");
      return;
    }
    if (!rawText.trim()) {
      toast.error("الصق نصاً للمعالجة");
      return;
    }
    setLoading(true);
    setOrders([]);
    setMeta(null);
    // GATE 5 fix — clear stale warnings from the previous batch when the user
    // starts a new parse. They belong to the previous invoice set, not the new one.
    setReviewQueueWarnings([]);
    setShowWarningsBanner(true);
    try {
      // 🧠 brain mode: pattern-first (free) + AI fallback that learns templates.
      // legacy mode: /api/ai/smart-parse (AI every time).
      const endpoint = brainMode ? "/api/ai/invoice-brain/extract" : "/api/ai/smart-parse";
      const payload = brainMode
        ? { rawText, companySlug: activeCompany.slug }
        : { rawText, companySlug: activeCompany.slug, autoAddProducts };
      const res = await authedFetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "فشل التحليل");
      setOrders(data.orders || []);
      setMeta(data.meta || null);
      if ((data.orders || []).length === 0) {
        toast.warning("لم يتم استخراج أي طلبات من النص");
      } else {
        const src = data.meta?.source;
        const badge = brainMode && src
          ? src === "pattern" ? " (بدون ذكاء اصطناعي ✓)"
          : src === "ai" ? " (ذكاء اصطناعي + تعلّم قالب جديد)"
          : src === "mixed" ? " (مختلط)"
          : ""
          : "";
        toast.success(`تم استخراج ${data.orders.length} طلب${badge}`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "خطأ في المعالجة");
    } finally {
      setLoading(false);
    }
  }, [activeCompany, rawText, autoAddProducts, brainMode]);

  const handleParseImage = useCallback(async () => {
    if (!activeCompany) {
      toast.error("اختر شركة أولاً");
      return;
    }
    if (!imageBase64) {
      toast.error("ارفع صورة أولاً");
      return;
    }
    setLoading(true);
    setOrders([]);
    setMeta(null);
    // GATE 5 fix — clear stale warnings from a previous batch when starting a new parse.
    setReviewQueueWarnings([]);
    setShowWarningsBanner(true);
    try {
      const res = await authedFetch("/api/ai/parse-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageBase64,
          mimeType: "image/jpeg",
          companySlug: activeCompany.slug,
          autoAddProducts,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "فشل تحليل الصورة");
      setOrders(data.orders || []);
      setMeta(data.meta || null);
      if ((data.orders || []).length === 0) {
        toast.warning("لم يتم استخراج أي طلبات من الصورة");
      } else {
        toast.success(`تم استخراج ${data.orders.length} طلب من الصورة`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "خطأ في المعالجة");
    } finally {
      setLoading(false);
    }
  }, [activeCompany, imageBase64, autoAddProducts]);

  const handleParseFile = useCallback(async () => {
    if (!activeCompany) { toast.error("اختر شركة أولاً"); return; }
    if (!fileBase64 || !fileName) { toast.error("ارفع ملف أولاً"); return; }
    setLoading(true);
    setOrders([]);
    setMeta(null);
    // GATE 5 fix — clear stale warnings from a previous batch when starting a new parse.
    setReviewQueueWarnings([]);
    setShowWarningsBanner(true);
    try {
      const res = await authedFetch("/api/ai/parse-file", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileBase64, fileName, companySlug: activeCompany.slug }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "فشل تحليل الملف");
      setOrders(data.orders || []);
      setMeta(data.meta || null);
      if ((data.orders || []).length === 0) {
        toast.warning("لم يتم استخراج أي طلبات من الملف");
      } else {
        toast.success(`تم استخراج ${data.orders.length} طلب من الملف`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "خطأ في المعالجة");
    } finally {
      setLoading(false);
    }
  }, [activeCompany, fileBase64, fileName]);

  const handleImageUpload = useCallback((file: File) => {
    if (file.size > 5 * 1024 * 1024) {
      toast.error("حجم الصورة يجب أن يكون أقل من 5 ميجابايت");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      setImagePreview(result);
      // Strip data URL prefix for transmission
      const base64 = result.replace(/^data:[^;]+;base64,/, "");
      setImageBase64(base64);
    };
    reader.readAsDataURL(file);
  }, []);

  const handleSave = useCallback(async () => {
    if (!activeCompany || orders.length === 0) return;
    setSaving(true);
    try {
      const res = await authedFetch("/api/ai/bulk-import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companySlug: activeCompany.slug,
          orders,
          createJournalEntries,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "فشل الحفظ");
      const created = data.created?.length || 0;
      const errors = data.errors?.length || 0;
      // GATE 5 fix — capture review-queue / oversell warnings into persistent banner.
      const newWarnings: string[] = Array.isArray(data.reviewQueueWarnings) ? data.reviewQueueWarnings : [];
      if (newWarnings.length > 0) {
        setReviewQueueWarnings(newWarnings);
        setShowWarningsBanner(true);
      }
      if (created > 0 && errors === 0) {
        toast.success(`تم إنشاء ${created} فاتورة بنجاح`);
      } else if (created > 0 && errors > 0) {
        toast.warning(`تم إنشاء ${created} فاتورة، فشل ${errors}`);
      } else {
        toast.error(`فشل إنشاء كل الفواتير (${errors})`);
      }
      if (newWarnings.length > 0) {
        toast.warning(`⚠️ ${newWarnings.length} صنف يحتاج مراجعة — انظر البانر أدناه`);
      }
      // Reset on success
      if (created > 0) {
        setOrders([]);
        setMeta(null);
        setRawText("");
        setImageBase64(null);
        setImagePreview(null);
        setFileBase64(null);
        setFileName(null);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "خطأ في الحفظ");
    } finally {
      setSaving(false);
    }
  }, [activeCompany, orders, createJournalEntries]);

  const updateOrder = (idx: number, updates: Partial<ParsedOrder>) => {
    setOrders((arr) => arr.map((o, i) => (i === idx ? { ...o, ...updates } : o)));
  };
  const removeOrder = (idx: number) => {
    setOrders((arr) => arr.filter((_, i) => i !== idx));
  };
  const updateItem = (orderIdx: number, itemIdx: number, updates: Partial<ParsedItem>) => {
    setOrders((arr) => arr.map((o, oi) => {
      if (oi !== orderIdx) return o;
      return {
        ...o,
        items: o.items.map((it, ii) => (ii === itemIdx ? { ...it, ...updates } : it)),
      };
    }));
  };
  const addItem = (orderIdx: number) => {
    setOrders((arr) => arr.map((o, oi) => {
      if (oi !== orderIdx) return o;
      return { ...o, items: [...o.items, { name: "", qty: 1, unitPrice: 0 }] };
    }));
  };
  const removeItem = (orderIdx: number, itemIdx: number) => {
    setOrders((arr) => arr.map((o, oi) => {
      if (oi !== orderIdx) return o;
      return { ...o, items: o.items.filter((_, ii) => ii !== itemIdx) };
    }));
  };

  if (!activeCompany) {
    return (
      <div className="p-12 text-center text-muted-foreground">
        اختر شركة أولاً
      </div>
    );
  }

  const inputStyle = "w-full py-2 px-3 rounded-sm bg-background border border-border text-foreground text-[13px] outline-none";
  const labelStyle = "block text-[11px] font-semibold text-muted-foreground mb-1";

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-extrabold flex items-center gap-2">
          <Sparkles size={20} /> الإدخال المجمع بالذكاء الاصطناعي
        </h1>
        <p className="text-[13px] text-muted-foreground">
          حوّل النصوص أو الصور إلى فواتير تلقائياً — مدعوم بـ GLM
        </p>
      </div>

      {/* GATE 5 fix — persistent review-queue / oversell warnings banner.
          Uses shadcn Alert with variant="destructive" (red banner).
          Shows whenever reviewQueueWarnings.length > 0 and the user hasn't dismissed it.
          Each warning is shown verbatim so the founder/tenant can act on it.
          The banner is rendered ABOVE the tab switcher so it's impossible to miss. */}
      {reviewQueueWarnings.length > 0 && showWarningsBanner && (
        <Alert variant="destructive" className="flex flex-col gap-2">
          <div className="flex items-start gap-2">
            <AlertTriangle className="shrink-0 mt-0.5" />
            <AlertTitle className="flex-1">
              ⚠️ {reviewQueueWarnings.length} صنف يحتاج مراجعة
            </AlertTitle>
            <button
              type="button"
              onClick={() => setShowWarningsBanner(false)}
              className="bg-transparent border-none cursor-pointer text-destructive p-1 -mt-1 -me-1 flex items-center hover:bg-destructive/10 rounded"
              aria-label="إخفاء البانر"
            >
              <X size={16} />
            </button>
          </div>
          <AlertDescription>
            <div className="flex flex-col gap-2">
              <ul className="m-0 ps-5 flex flex-col gap-1 list-disc">
                {reviewQueueWarnings.slice(0, 5).map((w, i) => (
                  <li key={i} className="text-[12px] leading-[1.5] text-foreground">
                    {w}
                  </li>
                ))}
                {reviewQueueWarnings.length > 5 && (
                  <li className="text-[11px] text-muted-foreground">
                    + {reviewQueueWarnings.length - 5} تحذيرات أخرى…
                  </li>
                )}
              </ul>
              <div className="flex flex-wrap gap-2 mt-1">
                <button
                  type="button"
                  onClick={() => setShowReviewQueue(true)}
                  className="inline-flex items-center gap-1.5 text-[12px] font-bold text-destructive underline bg-transparent border-none cursor-pointer p-0 hover:opacity-80"
                >
                  <ListChecks size={14} /> فتح صفحة مراجعة التطابقات
                </button>
                <button
                  type="button"
                  onClick={() => { setReviewQueueWarnings([]); setShowWarningsBanner(false); }}
                  className="bg-transparent border border-border rounded-[6px] py-1 px-2 cursor-pointer text-[11px] text-muted-foreground hover:bg-muted"
                >
                  مسح التحذيرات
                </button>
              </div>
            </div>
          </AlertDescription>
        </Alert>
      )}

      {/* Tab switcher — wraps on mobile, single row on desktop */}
      <div className="flex flex-wrap gap-1.5">
        <button
          onClick={() => setTab("text")}
          className={cn(
            "inline-flex items-center gap-1.5 py-2.5 px-[18px] rounded-[10px] border border-border text-[13px] font-bold cursor-pointer",
            tab === "text" ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground",
          )}
        >
          <FileText size={14} /> من نص
        </button>
        <button
          onClick={() => setTab("image")}
          className={cn(
            "inline-flex items-center gap-1.5 py-2.5 px-[18px] rounded-[10px] border border-border text-[13px] font-bold cursor-pointer",
            tab === "image" ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground",
          )}
        >
          <ImageIcon size={14} /> من صورة
        </button>
        <button
          onClick={() => setTab("file")}
          className={cn(
            "inline-flex items-center gap-1.5 py-2.5 px-[18px] rounded-[10px] border border-border text-[13px] font-bold cursor-pointer",
            tab === "file" ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground",
          )}
        >
          <FileSpreadsheet size={14} /> من ملف Excel
        </button>
      </div>

      {/* Input area */}
      {tab === "text" ? (
        <div className="bg-card rounded-[14px] border border-border p-5">
          <div className="flex justify-between items-center mb-2.5">
            <label className={labelStyle}>الصق نص الطلبات (واتساب، إيصال، ملاحظات...)</label>
            <button
              onClick={() => setRawText(SAMPLE_TEXT)}
              className="bg-accent text-accent-foreground border border-border rounded-[6px] py-1 px-2.5 text-[11px] font-bold cursor-pointer"
            >
              جرّب مثالاً
            </button>
          </div>
          <textarea
            value={rawText}
            onChange={(e) => setRawText(e.target.value)}
            placeholder="📍 العنوان: ...
📞 الهاتف: ...
👤 العميل: ...

🛠️ الطلب:
٢ ماتور ١٦ دينار
٣ فيلتر ٤.٥ دينار"
            rows={10}
            className={cn(inputStyle, "resize-y font-mono [direction:rtl]")}
          />
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2.5 mt-2.5">
            <label className="flex items-center gap-1.5 text-[12px] cursor-pointer">
              <input
                type="checkbox"
                checked={autoAddProducts}
                onChange={(e) => setAutoAddProducts(e.target.checked)}
              />
              إضافة المنتجات الجديدة تلقائياً للكتالوج
            </label>
            <button
              onClick={handleParseText}
              disabled={loading || !rawText.trim()}
              className="inline-flex items-center justify-center gap-1.5 py-2.5 px-6 rounded-[10px] bg-primary text-primary-foreground border-none text-[13px] font-extrabold cursor-pointer disabled:cursor-not-allowed disabled:opacity-60 w-full sm:w-auto"
            >
              {loading ? <Loader2 size={14} className="animate-spin" /> : brainMode ? <Brain size={14} /> : <Sparkles size={14} />}
              {loading ? "جارٍ التحليل…" : brainMode ? "تحليل ذكي (يتعلّم)" : "تحليل بالذكاء الاصطناعي"}
            </button>
          </div>
          {/* 🧠 brain mode toggle */}
          <div
            className="mt-3 py-2.5 px-3 rounded-[10px] flex items-center justify-between gap-2.5 border"
            style={{
              background: brainMode ? "color-mix(in srgb, var(--primary) 8%, var(--card))" : "var(--muted)",
              borderColor: brainMode ? "var(--primary)" : "var(--border)",
            }}
          >
            <label className="flex items-center gap-2 text-[12px] cursor-pointer font-bold">
              <Brain size={16} color="var(--primary)" />
              وضع التعلّم التلقائي
              <span className="text-muted-foreground font-normal">
                {brainMode
                  ? "— يستخدم القوالب المحفوظة أولاً (مجاني)، والذكاء الاصطناعي فقط للأشكال الجديدة، ثم يحفظها كقالب"
                  : "— مغلق: كل تحليل يستخدم الذكاء الاصطناعي"}
              </span>
            </label>
            <button
              onClick={() => setBrainMode((v) => !v)}
              role="switch"
              aria-checked={brainMode}
              className="w-11 h-6 rounded-lg border-none cursor-pointer relative shrink-0 transition-colors duration-150"
              style={{ background: brainMode ? "var(--primary)" : "var(--border)" }}
            >
              <span
                className="absolute top-0.5 w-5 h-5 rounded-full bg-white transition-[left] duration-150"
                style={{ left: brainMode ? "22px" : "2px" }}
              />
            </button>
          </div>
        </div>
      ) : (
        <div className="bg-card rounded-[14px] border border-border p-5">
          <label className={labelStyle}>ارفع صورة الفاتورة أو الإيصال</label>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleImageUpload(file);
            }}
            className="hidden"
          />
          {!imagePreview ? (
            <button
              onClick={() => fileInputRef.current?.click()}
              className="w-full p-12 rounded-lg bg-muted border-2 border-dashed border-border text-muted-foreground text-[14px] font-bold cursor-pointer flex flex-col items-center gap-2.5"
            >
              <Upload size={32} />
              <div>اضغط لرفع صورة</div>
              <div className="text-[11px] font-normal">PNG, JPG حتى 5 ميجابايت</div>
            </button>
          ) : (
            <div className="relative">
              <img
                src={imagePreview}
                alt="Uploaded"
                className="w-full max-h-[300px] object-contain rounded-[10px] border border-border"
              />
              <button
                onClick={() => { setImageBase64(null); setImagePreview(null); }}
                className="absolute top-2 left-2 bg-black/70 text-white border-none rounded-[6px] p-1.5 cursor-pointer flex items-center"
              >
                <X size={14} />
              </button>
            </div>
          )}
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2.5 mt-2.5">
            <label className="flex items-center gap-1.5 text-[12px] cursor-pointer">
              <input
                type="checkbox"
                checked={autoAddProducts}
                onChange={(e) => setAutoAddProducts(e.target.checked)}
              />
              إضافة المنتجات الجديدة تلقائياً للكتالوج
            </label>
            <button
              onClick={handleParseImage}
              disabled={loading || !imageBase64}
              className="inline-flex items-center justify-center gap-1.5 py-2.5 px-6 rounded-[10px] bg-primary text-primary-foreground border-none text-[13px] font-extrabold cursor-pointer disabled:cursor-not-allowed disabled:opacity-60 w-full sm:w-auto"
            >
              {loading ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
              {loading ? "جارٍ تحليل الصورة…" : "تحليل الصورة"}
            </button>
          </div>
        </div>
      )}

      {/* File upload tab */}
      {tab === "file" && (
        <div className="bg-card rounded-[14px] border border-border p-5">
          <label className={labelStyle}>ارفع ملف Excel أو CSV</label>
          <input
            type="file"
            accept=".xlsx,.xls,.csv"
            ref={fileInputRef}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              if (file.size > 5 * 1024 * 1024) { toast.error("حجم الملف يجب أن يكون أقل من 5 ميجابايت"); return; }
              const reader = new FileReader();
              reader.onload = () => {
                const result = reader.result as string;
                const base64 = result.replace(/^data:[^;]+;base64,/, "");
                setFileBase64(base64);
                setFileName(file.name);
                toast.success(`تم تحميل ${file.name}`);
              };
              reader.readAsDataURL(file);
            }}
            className="hidden"
          />
          {!fileName ? (
            <button
              onClick={() => fileInputRef.current?.click()}
              className="w-full p-12 rounded-lg bg-muted border-2 border-dashed border-border text-muted-foreground text-[14px] font-bold cursor-pointer flex flex-col items-center gap-2.5"
            >
              <FileSpreadsheet size={32} />
              <div>اضغط لرفع ملف Excel أو CSV</div>
              <div className="text-[11px] font-normal">xlsx, xls, csv حتى 5 ميجابايت</div>
            </button>
          ) : (
            <div className="flex items-center gap-2.5 p-3.5 rounded-[10px] bg-muted border border-border">
              <FileSpreadsheet size={20} className="text-primary" />
              <div className="flex-1">
                <div className="text-[13px] font-bold">{fileName}</div>
                <div className="text-[11px] text-muted-foreground">جاهز للتحليل</div>
              </div>
              <button
                onClick={() => { setFileName(null); setFileBase64(null); }}
                className="bg-transparent border border-border text-muted-foreground rounded-[6px] p-1 cursor-pointer flex"
              >
                <X size={14} />
              </button>
            </div>
          )}
          <div className="flex justify-end mt-2.5">
            <button
              onClick={handleParseFile}
              disabled={loading || !fileBase64}
              className="inline-flex items-center justify-center gap-1.5 py-2.5 px-6 rounded-[10px] bg-primary text-primary-foreground border-none text-[13px] font-extrabold cursor-pointer disabled:cursor-not-allowed disabled:opacity-60 w-full sm:w-auto"
            >
              {loading ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
              {loading ? "جارٍ تحليل الملف…" : "تحليل الملف"}
            </button>
          </div>
        </div>
      )}

      {/* Meta info */}
      {meta && (
        <div className="py-3 px-4 rounded-[10px] bg-accent border border-border text-[12px] text-accent-foreground flex gap-4 flex-wrap">
          <span>⏱️ {meta.processingMs}ms</span>
          <span>📋 {meta.ordersCount} طلب</span>
          <span>📦 {meta.itemsCount} عنصر</span>
          {meta.totalTokens ? <span>🧮 {meta.totalTokens} tokens</span> : null}
          <span>🤖 {meta.model}</span>
          {meta.retried ? <span className="text-destructive">⚠️ تطلب إعادة محاولة</span> : null}
        </div>
      )}

      {/* Parsed orders */}
      {orders.length > 0 && (
        <div className="flex flex-col gap-3">
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2.5">
            <h2 className="text-[16px] font-bold">
              الطلبات المستخرجة ({orders.length})
            </h2>
            <div className="flex flex-wrap gap-2.5 items-center">
              <label className="flex items-center gap-1 text-[11px] cursor-pointer">
                <input
                  type="checkbox"
                  checked={createJournalEntries}
                  onChange={(e) => setCreateJournalEntries(e.target.checked)}
                />
                إنشاء قيود محاسبية
              </label>
              <button
                onClick={handleSave}
                disabled={saving}
                className="inline-flex items-center justify-center gap-1.5 py-2.5 px-5 rounded-[10px] bg-primary text-primary-foreground border-none text-[13px] font-extrabold cursor-pointer disabled:cursor-not-allowed disabled:opacity-60 w-full sm:w-auto"
              >
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                {saving ? "جارٍ الحفظ…" : `حفظ ${orders.length} فاتورة`}
              </button>
            </div>
          </div>

          {orders.map((order, idx) => {
            const isExpanded = expandedIdx === idx;
            const isEditing = editingIdx === idx;
            const subtotal = order.items.reduce((s, it) => s + it.qty * it.unitPrice, 0);
            const taxAmount = (subtotal * order.taxRate) / 100;
            const total = subtotal + taxAmount + order.shipping - order.discount;
            return (
              <div
                key={idx}
                className="bg-card rounded-lg border border-border overflow-hidden"
              >
                {/* Order header */}
                <div
                  className="py-3 px-4 border-b border-border flex flex-wrap justify-between items-center gap-2 bg-muted"
                >
                  <div className="flex items-center gap-2.5">
                    <button
                      onClick={() => setExpandedIdx(isExpanded ? null : idx)}
                      className="bg-transparent border-none cursor-pointer text-muted-foreground flex items-center"
                    >
                      {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </button>
                    <div>
                      <div className="text-[13px] font-bold">
                        {order.clientName || `طلب #${idx + 1}`}
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        {order.items.length} عنصر • {order.clientPhone || "بدون هاتف"}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2.5">
                    <div className="text-[16px] font-extrabold text-primary">
                      {total.toFixed(3)} {activeCompany.currency}
                    </div>
                    <button
                      onClick={() => setEditingIdx(isEditing ? null : idx)}
                      className="bg-transparent border border-border text-muted-foreground rounded-[6px] p-1 cursor-pointer flex"
                      title="تعديل"
                    >
                      <Edit2 size={12} />
                    </button>
                    <button
                      onClick={() => removeOrder(idx)}
                      className="bg-transparent border border-border text-destructive rounded-[6px] p-1 cursor-pointer flex"
                      title="حذف"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>

                {/* Order body (when expanded) */}
                {isExpanded && (
                  <div className="p-4">
                    {isEditing ? (
                      <div className="flex flex-col gap-3">
                        <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-2.5">
                          <div>
                            <label className={labelStyle}>اسم العميل</label>
                            <input
                              value={order.clientName}
                              onChange={(e) => updateOrder(idx, { clientName: e.target.value })}
                              className={inputStyle}
                            />
                          </div>
                          <div>
                            <label className={labelStyle}>الهاتف</label>
                            <input
                              value={order.clientPhone}
                              onChange={(e) => updateOrder(idx, { clientPhone: e.target.value })}
                              className={inputStyle}
                              dir="ltr"
                            />
                          </div>
                          <div>
                            <label className={labelStyle}>البريد</label>
                            <input
                              value={order.clientEmail || ""}
                              onChange={(e) => updateOrder(idx, { clientEmail: e.target.value })}
                              className={inputStyle}
                              dir="ltr"
                            />
                          </div>
                          <div>
                            <label className={labelStyle}>العنوان</label>
                            <input
                              value={order.clientAddress}
                              onChange={(e) => updateOrder(idx, { clientAddress: e.target.value })}
                              className={inputStyle}
                            />
                          </div>
                        </div>
                        <div className="grid grid-cols-[repeat(auto-fit,minmax(120px,1fr))] gap-2.5">
                          <div>
                            <label className={labelStyle}>الضريبة (%)</label>
                            <input
                              type="number"
                              value={order.taxRate}
                              onChange={(e) => updateOrder(idx, { taxRate: Number(e.target.value) })}
                              className={inputStyle}
                              dir="ltr"
                            />
                          </div>
                          <div>
                            <label className={labelStyle}>الشحن</label>
                            <input
                              type="number"
                              value={order.shipping}
                              onChange={(e) => updateOrder(idx, { shipping: Number(e.target.value) })}
                              className={inputStyle}
                              dir="ltr"
                            />
                          </div>
                          <div>
                            <label className={labelStyle}>الخصم</label>
                            <input
                              type="number"
                              value={order.discount}
                              onChange={(e) => updateOrder(idx, { discount: Number(e.target.value) })}
                              className={inputStyle}
                              dir="ltr"
                            />
                          </div>
                        </div>
                        <div>
                          <label className={labelStyle}>ملاحظات</label>
                          <input
                            value={order.notes}
                            onChange={(e) => updateOrder(idx, { notes: e.target.value })}
                            className={inputStyle}
                          />
                        </div>
                        <div>
                          <div className="flex justify-between items-center mb-2">
                            <label className={cn(labelStyle, "mb-0")}>البنود</label>
                            <button
                              onClick={() => addItem(idx)}
                              className="bg-accent text-accent-foreground border border-border rounded-[6px] py-1 px-2.5 text-[11px] font-bold cursor-pointer inline-flex items-center gap-1"
                            >
                              <Plus size={12} /> إضافة
                            </button>
                          </div>
                          {order.items.map((item, itemIdx) => (
                            <div key={itemIdx} className="grid grid-cols-[1fr_60px_80px_32px] sm:grid-cols-[1fr_70px_100px_32px] gap-2 mb-1.5">
                              <input
                                value={item.name}
                                onChange={(e) => updateItem(idx, itemIdx, { name: e.target.value })}
                                placeholder="اسم المنتج"
                                className={inputStyle}
                              />
                              <input
                                type="number"
                                value={item.qty}
                                onChange={(e) => updateItem(idx, itemIdx, { qty: Number(e.target.value) })}
                                className={inputStyle}
                                dir="ltr"
                              />
                              <input
                                type="number"
                                value={item.unitPrice}
                                onChange={(e) => updateItem(idx, itemIdx, { unitPrice: Number(e.target.value) })}
                                className={inputStyle}
                                dir="ltr"
                              />
                              <button
                                onClick={() => removeItem(idx, itemIdx)}
                                className="bg-transparent border border-border text-destructive rounded-[6px] cursor-pointer flex items-center justify-center"
                              >
                                <X size={12} />
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div>
                        <div className="overflow-x-auto garfix-scroll">
                        <table className="w-full border-collapse text-[12px]">
                          <thead>
                            <tr className="border-b border-border">
                              <th className="text-start py-1.5 px-2 font-semibold text-muted-foreground">المنتج</th>
                              <th className="text-center py-1.5 px-2 font-semibold text-muted-foreground">كمية</th>
                              <th className="text-center py-1.5 px-2 font-semibold text-muted-foreground">سعر</th>
                              <th className="text-end py-1.5 px-2 font-semibold text-muted-foreground">إجمالي</th>
                            </tr>
                          </thead>
                          <tbody>
                            {order.items.map((item, itemIdx) => (
                              <tr key={itemIdx} className="border-b border-border">
                                <td className="py-1.5 px-2">{item.name}</td>
                                <td className="py-1.5 px-2 text-center">{item.qty}</td>
                                <td className="py-1.5 px-2 text-center [direction:ltr]">{item.unitPrice.toFixed(3)}</td>
                                <td className="py-1.5 px-2 [direction:ltr] text-start font-bold">
                                  {(item.qty * item.unitPrice).toFixed(3)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        </div>
                        <div className="flex flex-wrap justify-end mt-2.5 gap-x-4 gap-y-1 text-[12px]">
                          <span>مجموع: <strong>{subtotal.toFixed(3)}</strong></span>
                          {order.taxRate > 0 && <span>ضريبة ({order.taxRate}%): <strong>{taxAmount.toFixed(3)}</strong></span>}
                          {order.shipping > 0 && <span>شحن: <strong>{order.shipping.toFixed(3)}</strong></span>}
                          {order.discount > 0 && <span>خصم: <strong>-{order.discount.toFixed(3)}</strong></span>}
                          <span className="font-extrabold text-primary">الإجمالي: {total.toFixed(3)}</span>
                        </div>
                        {(order.clientAddress || order.notes) && (
                          <div className="mt-2.5 pt-2.5 border-t border-border text-[11px] text-muted-foreground">
                            {order.clientAddress && <div>📍 {order.clientAddress}</div>}
                            {order.notes && <div>📝 {order.notes}</div>}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Empty state when no orders yet */}
      {!loading && orders.length === 0 && !meta && (
        <div className="p-10 text-center text-muted-foreground bg-card rounded-[14px] border border-border">
          <Sparkles size={36} className="opacity-30 mb-2.5" />
          <div className="text-[14px] font-bold mb-1">
            ابدأ بإدخال نص أو رفع صورة
          </div>
          <div className="text-[12px]">
            سيقوم الذكاء الاصطناعي باستخراج بيانات الطلبات تلقائياً
          </div>
        </div>
      )}

      {showReviewQueue && activeCompany && (
        <ReviewQueueModal
          companySlug={activeCompany.slug}
          onClose={() => setShowReviewQueue(false)}
        />
      )}
    </div>
  );
}

export default BulkInputView;

"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useAuth, authedFetch } from "@/context/AuthContext";
import { useBrand } from "@/context/BrandContext";
import { toast } from "sonner";
import {
  Check, ChevronLeft, ChevronRight, Building2, Globe, Briefcase,
  Users, Package, MessageCircle, Sparkles, Loader2, Rocket, X as XIcon,
} from "lucide-react";
import { BUSINESS_TYPES, type BusinessType } from "@/lib/accountTemplates";
import { GULF_COUNTRIES } from "@/lib/gulfConfig";
import { cn } from "@/lib/utils";

interface WizardData {
  companySlug?: string;
  businessType?: BusinessType;
  hasEmployees?: boolean;
  hasWarehouse?: boolean;
  usesWhatsApp?: boolean;
}

const STEPS = [
  { key: "welcome", label: "مرحباً", icon: Rocket },
  { key: "company", label: "بيانات الشركة", icon: Building2 },
  { key: "country", label: "الدولة", icon: Globe },
  { key: "business", label: "نوع النشاط", icon: Briefcase },
  { key: "features", label: "المميزات", icon: Package },
  { key: "ai-test", label: "جرّب الذكاء", icon: Sparkles },
  { key: "done", label: "اكتمل", icon: Check },
];

const labelStyle = "block text-xs font-semibold text-white/60 mb-1.5";
const inputStyle = "w-full py-2.5 px-3.5 rounded-md bg-white/[0.06] border border-white/10 text-white text-sm outline-none max-md:min-h-[44px]";

export function SetupWizard({ onComplete, onSkip }: { onComplete: () => void; onSkip: () => void }) {
  const { user } = useAuth();
  const { companies, activeCompany, setActiveSlug, refreshCompanies } = useBrand();
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [data, setData] = useState<WizardData>({});
  const [newCompanyName, setNewCompanyName] = useState("");
  const [newCompanySlug, setNewCompanySlug] = useState("");
  const [aiTestText, setAiTestText] = useState("");
  const [aiResult, setAiResult] = useState<Record<string, unknown> | null>(null);
  const [aiLoading, setAiLoading] = useState(false);

  // Onboarding P2 — slug availability check + auto-suggest from company name.
  // - When the user types a company NAME, we auto-suggest a slug via the same
  //   slugify() used by /api/companies (Arabic numerals + Latin letters + dashes).
  //   The user can still override the suggested slug manually.
  // - When the user types/edits the slug (or accepts the suggestion), we
  //   debounce 350ms then call GET /api/companies?checkSlug=… and show
  //   inline availability feedback (✓ available / ✗ taken / ⚠ invalid).
  const [slugAvailability, setSlugAvailability] = useState<
    | { state: "idle" }
    | { state: "checking" }
    | { state: "available"; slug: string }
    | { state: "taken"; slug: string }
    | { state: "invalid"; reason: string }
  >({ state: "idle" });
  const slugDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastCheckedSlugRef = useRef<string>("");

  // Load existing progress
  useEffect(() => {
    authedFetch("/api/onboarding").then(async (res) => {
      if (res.ok) {
        const d = await res.json();
        if (d.completed) {
          onComplete();
          return;
        }
        if (d.step > 0) setStep(Math.min(d.step, STEPS.length - 1));
        if (d.data) setData(d.data);
      }
      setLoading(false);
    });
  }, [onComplete]);

  // Onboarding P2 — auto-suggest slug from company name when the user hasn't
  // manually edited the slug yet. We compare against the last suggestion we
  // made: if the slug still matches the previous suggestion, we treat it as
  // "auto" and update it. Once the user types something different, we leave
  // their text alone.
  const lastSuggestedSlugRef = useRef<string>("");
  useEffect(() => {
    if (!newCompanyName) return;
    const suggested = newCompanyName
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9-]+/g, "-")
      .replace(/^-+|-+$/g, "");
    if (newCompanySlug === lastSuggestedSlugRef.current || !newCompanySlug) {
      lastSuggestedSlugRef.current = suggested;
      setNewCompanySlug(suggested);
    }
  }, [newCompanyName, newCompanySlug]);

  // Onboarding P2 — debounced availability check.
  // Whenever the slug changes, wait 350ms then call the check endpoint.
  useEffect(() => {
    if (slugDebounceRef.current) clearTimeout(slugDebounceRef.current);
    if (!newCompanySlug || newCompanySlug.length < 2) {
      // schedule idle on next tick to avoid synchronous setState in effect
      slugDebounceRef.current = setTimeout(() => {
        setSlugAvailability({ state: "idle" });
      }, 0);
      return;
    }
    if (newCompanySlug === lastCheckedSlugRef.current) return;
    slugDebounceRef.current = setTimeout(async () => {
      lastCheckedSlugRef.current = newCompanySlug;
      setSlugAvailability({ state: "checking" });
      try {
        const res = await authedFetch(`/api/companies?checkSlug=${encodeURIComponent(newCompanySlug)}`);
        const data = await res.json();
        if (!res.ok) {
          setSlugAvailability({ state: "invalid", reason: data.error || "خطأ في التحقق" });
          return;
        }
        if (data.reason === "too-short") {
          setSlugAvailability({ state: "invalid", reason: "المعرّف قصير جداً (٢ حرف على الأقل)" });
        } else if (data.reason === "invalid-chars") {
          setSlugAvailability({ state: "invalid", reason: "المعرّف يجب أن يكون أحرف لاتينية وأرقام و- فقط" });
        } else if (data.available) {
          setSlugAvailability({ state: "available", slug: data.slug });
        } else {
          setSlugAvailability({ state: "taken", slug: data.slug });
        }
      } catch {
        setSlugAvailability({ state: "idle" });
      }
    }, 350);
    return () => {
      if (slugDebounceRef.current) clearTimeout(slugDebounceRef.current);
    };
  }, [newCompanySlug]);

  // If no company exists, force step to company creation; or pre-select first company slug.
  // Render-time adjustment keyed on loading/companies/step/data.companySlug — no cascading render.
  const [prevAdjKey, setPrevAdjKey] = useState("");
  const adjKey = `${loading ? 1 : 0}|${companies.length}|${step}|${data.companySlug || ""}`;
  if (adjKey !== prevAdjKey) {
    setPrevAdjKey(adjKey);
    if (!loading && companies.length === 0 && step < 1) {
      setStep(1);
    }
    if (!loading && companies.length > 0 && !data.companySlug) {
      setData((d) => ({ ...d, companySlug: companies[0].slug }));
    }
  }

  const saveProgress = useCallback(async (stepNum: number, updates: Partial<WizardData>) => {
    const merged = { ...data, ...updates };
    setData(merged);
    if (merged.companySlug) {
      await authedFetch("/api/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update",
          step: stepNum,
          companySlug: merged.companySlug,
          data: merged,
        }),
      });
    }
  }, [data]);

  const createCompany = async () => {
    if (!newCompanyName || !newCompanySlug) {
      toast.error("اسم الشركة ومعرّفها مطلوبان");
      return;
    }
    setSaving(true);
    try {
      const res = await authedFetch("/api/companies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newCompanyName, slug: newCompanySlug }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed");
      }
      await refreshCompanies();
      setData((d) => ({ ...d, companySlug: newCompanySlug }));
      toast.success("تم إنشاء الشركة");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "خطأ");
      return;
    } finally {
      setSaving(false);
    }
  };

  const testAI = async () => {
    if (!aiTestText.trim() || !data.companySlug) return;
    setAiLoading(true);
    setAiResult(null);
    try {
      const res = await authedFetch("/api/ai/smart-parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rawText: aiTestText,
          companySlug: data.companySlug,
          autoAddProducts: false,
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error);
      setAiResult(d);
      toast.success(`تم استخراج ${d.orders?.length || 0} طلب`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "خطأ");
    } finally {
      setAiLoading(false);
    }
  };

  const completeWizard = async () => {
    setSaving(true);
    try {
      const res = await authedFetch("/api/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "complete",
          companySlug: data.companySlug,
          businessType: data.businessType,
          hasEmployees: data.hasEmployees,
          hasWarehouse: data.hasWarehouse,
          usesWhatsApp: data.usesWhatsApp,
          generateAccounts: true,
          activateModules: true,
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error);
      toast.success(`تم إعداد منصتك! (${d.summary?.accountsCreated || 0} حساب، ${d.summary?.modulesActivated || 0} موديول)`);
      onComplete();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "خطأ");
    } finally {
      setSaving(false);
    }
  };

  const next = async () => {
    await saveProgress(step + 1, {});
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  };
  const prev = () => setStep((s) => Math.max(s - 1, 0));

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 size={32} className="animate-spin text-primary" />
      </div>
    );
  }

  // Void references to satisfy lints (activeCompany/setActiveSlug are used by parent context but not directly here).
  void activeCompany;
  void setActiveSlug;

  return (
    <div
      dir="rtl"
      className="min-h-screen bg-[linear-gradient(135deg,#0f0a1e_0%,#1e1147_50%,#2d1b69_100%)] text-white flex flex-col"
    >
      {/* Progress bar */}
      <div className="py-5 px-[5%] flex flex-wrap items-center gap-2 border-b border-white/[0.08]">
        <div className="flex items-center gap-2.5 flex-1">
          <div className="w-9 h-9 rounded-md bg-[linear-gradient(135deg,#7c3aed,#a78bfa)] flex items-center justify-center text-lg font-black">
            G
          </div>
          <span className="text-base font-extrabold">إعداد GarfiX</span>
        </div>
        {/* Step indicators */}
        <div className="flex gap-1">
          {STEPS.map((s, i) => (
            <div
              key={s.key}
              className={cn(
                "h-2 rounded-sm transition-all duration-300",
                i === step ? "w-8" : "w-2",
                i <= step ? "bg-[#a78bfa]" : "bg-white/20"
              )}
            />
          ))}
        </div>
        <button
          onClick={onSkip}
          className="bg-transparent border border-white/15 text-white/60 rounded-sm px-3.5 py-1.5 text-xs cursor-pointer max-md:min-h-[44px]"
        >تخطّي</button>
      </div>

      {/* Step content */}
      <div className="flex-1 flex items-center justify-center py-10 px-[5%] overflow-y-auto">
        <div className="w-full max-w-[640px]">
          {/* Step 0: Welcome */}
          {step === 0 && (
            <div className="text-center">
              <div className="w-20 h-20 rounded-xl bg-[linear-gradient(135deg,#7c3aed,#a78bfa)] inline-flex items-center justify-center text-[40px] mb-6 shadow-[0_16px_48px_rgba(124,58,237,0.4)]">
                <Rocket size={36} />
              </div>
              <h1 className="text-[32px] font-black mb-3">
                مرحباً {user?.displayName?.split(" ")[0] || ""}! 👋
              </h1>
              <p className="text-base text-white/70 leading-relaxed mb-8">
                خلّينا نجهّز لك شركتك في أقل من 5 دقايق.
                <br />
                هنعمل لك: شجرة حسابات، تفعيل الموديولات، وكل حاجة جاهزة لأول فاتورة.
              </p>
              <button
                onClick={next}
                className="bg-[linear-gradient(135deg,#7c3aed,#a78bfa)] text-white border-none rounded-lg px-10 py-4 text-base font-extrabold cursor-pointer inline-flex items-center gap-2 shadow-[0_12px_36px_rgba(124,58,237,0.4)] max-md:min-h-[44px]"
              >
                يلا نبدأ <ChevronLeft size={18} />
              </button>
            </div>
          )}

          {/* Step 1: Company */}
          {step === 1 && (
            <StepCard
              icon={<Building2 size={28} />}
              title="بيانات شركتك"
              subtitle="أو اختر شركة موجودة لو عندك واحدة"
            >
              {companies.length > 0 && (
                <div className="mb-5">
                  <label className={labelStyle}>شركة موجودة</label>
                  <select
                    value={data.companySlug || ""}
                    onChange={(e) => setData({ ...data, companySlug: e.target.value })}
                    className={inputStyle}
                  >
                    <option value="">— اختر —</option>
                    {companies.map((c) => (
                      <option key={c.slug} value={c.slug}>{c.nameAr || c.name}</option>
                    ))}
                  </select>
                </div>
              )}
              <div className="flex flex-col sm:flex-row gap-3 mb-3">
                <div className="flex-1">
                  <label className={labelStyle}>اسم الشركة</label>
                  <input
                    value={newCompanyName}
                    onChange={(e) => setNewCompanyName(e.target.value)}
                    placeholder="مؤسسة النور"
                    className={inputStyle}
                  />
                </div>
                <div className="sm:w-40">
                  <label className={labelStyle}>المعرّف</label>
                  <input
                    value={newCompanySlug}
                    onChange={(e) => setNewCompanySlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"))}
                    placeholder="al-noor"
                    className={cn(inputStyle, "[direction:ltr]")}
                    style={{
                      borderColor:
                        slugAvailability.state === "available" ? "#10b981"
                        : slugAvailability.state === "taken" ? "#ef4444"
                        : slugAvailability.state === "invalid" ? "#f59e0b"
                        : "rgba(255,255,255,0.1)",
                    }} /* TAILWINDBREAK: dynamic conditional border color for slug availability */
                  />
                  {/* Onboarding P2 — inline slug-availability feedback */}
                  <div className="text-[10px] mt-1 min-h-[14px] flex items-center gap-1">
                    {slugAvailability.state === "checking" && (
                      <span className="text-white/60 inline-flex items-center gap-1">
                        <Loader2 size={10} className="animate-spin" /> جارٍ التحقق…
                      </span>
                    )}
                    {slugAvailability.state === "available" && (
                      <span className="text-[#10b981] inline-flex items-center gap-1">
                        <Check size={11} /> متاح
                      </span>
                    )}
                    {slugAvailability.state === "taken" && (
                      <span className="text-[#ef4444] inline-flex items-center gap-1">
                        <XIcon size={11} /> محجوز
                      </span>
                    )}
                    {slugAvailability.state === "invalid" && (
                      <span className="text-[#f59e0b] inline-flex items-center gap-1">
                        <XIcon size={11} /> {slugAvailability.reason}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              {newCompanyName && (
                <button
                  onClick={createCompany}
                  disabled={saving}
                  className="bg-[rgba(167,139,250,0.2)] text-[#a78bfa] border border-[rgba(167,139,250,0.3)] rounded-sm px-4 py-2 text-xs font-bold cursor-pointer disabled:cursor-not-allowed disabled:opacity-60 max-md:min-h-[44px]"
                >
                  {saving ? "جارٍ..." : "إنشاء الشركة"}
                </button>
              )}
              <NavButtons onNext={next} nextLabel="التالي" disabled={!data.companySlug} />
            </StepCard>
          )}

          {/* Step 2: Country */}
          {step === 2 && (
            <StepCard
              icon={<Globe size={28} />}
              title="دولة عملك"
              subtitle="هنظبط العملة والضريبة وأيام العطلة تلقائياً"
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {GULF_COUNTRIES.map((c) => (
                  <button
                    key={c.code}
                    onClick={async () => {
                      // Update company country
                      if (data.companySlug) {
                        await authedFetch(`/api/companies/${data.companySlug}`, {
                          method: "PATCH",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ country: c.code, currency: c.currency, defaultTaxRate: c.defaultTaxRate }),
                        });
                      }
                      await saveProgress(step + 1, {});
                      next();
                    }}
                    className="p-5 rounded-[14px] bg-white/[0.05] border-2 border-white/[0.08] text-white cursor-pointer text-start transition-all hover:border-[#a78bfa] hover:bg-[rgba(124,58,237,0.15)] max-md:min-h-[44px]"
                  >
                    <div className="text-[28px] mb-2">🌍</div>
                    <div className="text-[15px] font-bold">{c.nameAr}</div>
                    <div className="text-[11px] text-white/50 mt-1">
                      {c.currency} {c.vatApplicable ? `• VAT ${c.vatRate}%` : "• لا ضريبة"}
                    </div>
                  </button>
                ))}
              </div>
            </StepCard>
          )}

          {/* Step 3: Business Type */}
          {step === 3 && (
            <StepCard
              icon={<Briefcase size={28} />}
              title="نوع نشاطك"
              subtitle="هنولّد لك شجرة حسابات تناسب نشاطك تلقائياً"
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-5">
                {BUSINESS_TYPES.map((bt) => (
                  <button
                    key={bt.value}
                    onClick={() => setData({ ...data, businessType: bt.value })}
                    className={cn(
                      "p-5 rounded-[14px] text-white cursor-pointer text-start transition-all border-2 max-md:min-h-[44px]",
                      data.businessType === bt.value
                        ? "bg-[rgba(124,58,237,0.25)] border-[#a78bfa]"
                        : "bg-white/[0.05] border-white/[0.08]"
                    )}
                  >
                    <div className="text-[28px] mb-2">{bt.icon}</div>
                    <div className="text-[15px] font-bold">{bt.labelAr}</div>
                  </button>
                ))}
              </div>
              <NavButtons onNext={next} onPrev={prev} disabled={!data.businessType} />
            </StepCard>
          )}

          {/* Step 4: Features */}
          {step === 4 && (
            <StepCard
              icon={<Package size={28} />}
              title="مميزات إضافية"
              subtitle="فعّل اللي تحتاجه — تقدر تغيّرها بعدين"
            >
              <ToggleRow
                icon={<Users size={20} />}
                label="عندي موظفين"
                desc="فعّل وحدة الموارد البشرية (رواتب، حضور، إجازات)"
                value={data.hasEmployees ?? false}
                onChange={(v) => setData({ ...data, hasEmployees: v })}
              />
              <ToggleRow
                icon={<Package size={20} />}
                label="عندي مخازن"
                desc="فعّل إدارة المخزون والمستودعات"
                value={data.hasWarehouse ?? false}
                onChange={(v) => setData({ ...data, hasWarehouse: v })}
              />
              <ToggleRow
                icon={<MessageCircle size={20} />}
                label="أستخدم واتساب للعمل"
                desc="فعّل تكامل واتساب لاستقبال الطلبات"
                value={data.usesWhatsApp ?? false}
                onChange={(v) => setData({ ...data, usesWhatsApp: v })}
              />
              <NavButtons onNext={next} onPrev={prev} />
            </StepCard>
          )}

          {/* Step 5: AI Test */}
          {step === 5 && (
            <StepCard
              icon={<Sparkles size={28} />}
              title="جرّب الذكاء الاصطناعي"
              subtitle="اكتب طلب بالعربية وشوف كيف يحوّله لفاتورة"
            >
              <textarea
                value={aiTestText}
                onChange={(e) => setAiTestText(e.target.value)}
                placeholder={"📍 العنوان: الكويت - حولي\n📞 50001234\n👤 العميل: أحمد محمد\n\n🛠️ الطلب:\n٢ ماتور ١٦ دينار\n٣ فيلتر ٤.٥ دينار\n\n🚚 التوصيل: ٢ دينار"}
                rows={6}
                className={cn(inputStyle, "font-mono resize-y mb-3")}
              />
              <button
                onClick={testAI}
                disabled={aiLoading || !aiTestText.trim()}
                className="bg-[linear-gradient(135deg,#7c3aed,#a78bfa)] text-white border-none rounded-md px-6 py-2.5 text-[13px] font-extrabold cursor-pointer disabled:cursor-not-allowed disabled:opacity-60 inline-flex items-center gap-1.5 max-md:min-h-[44px]"
              >
                {aiLoading ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                {aiLoading ? "جارٍ التحليل..." : "حلّل بالذكاء"}
              </button>
              {aiResult && (
                <div className="mt-4 p-3.5 rounded-md bg-[rgba(16,185,129,0.1)] border border-[rgba(16,185,129,0.3)] text-[13px]">
                  ✅ تم استخراج {(aiResult as Record<string, unknown[]>)?.orders?.length || 0} طلب
                  <br />
                  <span className="text-white/60 text-[11px]">
                    وقت المعالجة: {(aiResult as { meta?: { processingMs?: number } })?.meta?.processingMs}ms
                  </span>
                </div>
              )}
              <NavButtons onNext={next} onPrev={prev} nextLabel="التالي" />
            </StepCard>
          )}

          {/* Step 6: Done */}
          {step === 6 && (
            <div className="text-center">
              <div className="w-20 h-20 rounded-xl bg-[linear-gradient(135deg,#10b981,#34d399)] inline-flex items-center justify-center text-[40px] mb-6 shadow-[0_16px_48px_rgba(16,185,129,0.4)]">
                <Check size={36} />
              </div>
              <h1 className="text-[28px] font-black mb-2">جاهزين! 🎉</h1>
              <p className="text-[15px] text-white/70 mb-6">
                هضبط لك كل حاجة دلوقتي — شجرة حسابات، موديولات، إعدادات.
              </p>
              <div className="p-4 rounded-lg bg-white/[0.05] border border-white/[0.08] mb-6 text-start">
                <SummaryRow label="الشركة" value={companies.find((c) => c.slug === data.companySlug)?.nameAr || data.companySlug || "—"} />
                <SummaryRow label="نوع النشاط" value={BUSINESS_TYPES.find((b) => b.value === data.businessType)?.labelAr || "—"} />
                <SummaryRow label="موظفين" value={data.hasEmployees ? "نعم" : "لا"} />
                <SummaryRow label="واتساب" value={data.usesWhatsApp ? "نعم" : "لا"} />
              </div>
              <button
                onClick={completeWizard}
                disabled={saving}
                className="bg-[linear-gradient(135deg,#10b981,#34d399)] text-white border-none rounded-lg px-10 py-4 text-base font-extrabold cursor-pointer disabled:cursor-not-allowed disabled:opacity-70 inline-flex items-center gap-2 shadow-[0_12px_36px_rgba(16,185,129,0.4)] max-md:min-h-[44px]"
              >
                {saving ? <Loader2 size={18} className="animate-spin" /> : <Rocket size={18} />}
                {saving ? "جارٍ الإعداد..." : "ابدأ الاستخدام!"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function StepCard({ icon, title, subtitle, children }: {
  icon: React.ReactNode; title: string; subtitle: string; children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center gap-3.5 mb-6">
        <div className="w-13 h-13 min-w-[52px] min-h-[52px] rounded-[14px] bg-[rgba(124,58,237,0.2)] text-[#a78bfa] flex items-center justify-center">
          {icon}
        </div>
        <div>
          <h2 className="text-[22px] font-extrabold">{title}</h2>
          <p className="text-[13px] text-white/50">{subtitle}</p>
        </div>
      </div>
      {children}
    </div>
  );
}

function ToggleRow({ icon, label, desc, value, onChange }: {
  icon: React.ReactNode; label: string; desc: string; value: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <div
      className="flex items-center gap-3.5 p-4 rounded-lg mb-2.5 bg-white/[0.05] border border-white/[0.08] cursor-pointer max-md:min-h-[44px]"
      onClick={() => onChange(!value)}
    >
      <div className={cn(value ? "text-[#a78bfa]" : "text-white/40")}>{icon}</div>
      <div className="flex-1">
        <div className="text-sm font-bold">{label}</div>
        <div className="text-[11px] text-white/50">{desc}</div>
      </div>
      <div
        className="relative w-10 h-[22px] rounded-[11px]"
        style={{
          background: value ? "#7c3aed" : "rgba(255,255,255,0.15)",
          transition: "background .2s",
        }} /* TAILWINDBREAK: dynamic conditional toggle background + transition */
      >
        <div
          className="absolute top-0.5 w-[18px] h-[18px] rounded-full bg-white"
          style={{
            right: value ? "2px" : "20px",
            transition: "right .2s",
          }} /* TAILWINDBREAK: dynamic conditional toggle dot position + transition */
        />
      </div>
    </div>
  );
}

function NavButtons({ onNext, onPrev, nextLabel = "التالي", disabled }: {
  onNext: () => void; onPrev?: () => void; nextLabel?: string; disabled?: boolean;
}) {
  return (
    <div className="flex gap-2.5 mt-6 sticky bottom-0 -mx-[5%] px-[5%] py-3 md:py-0 md:static md:mx-0 md:px-0 bg-[#1e1147] md:bg-transparent">
      {onPrev && (
        <button
          onClick={onPrev}
          className="bg-transparent text-white/60 border border-white/15 rounded-md px-5 py-3 text-[13px] font-bold cursor-pointer inline-flex items-center gap-1 max-md:min-h-[44px]"
        >
          <ChevronRight size={16} /> السابق
        </button>
      )}
      <button
        onClick={onNext}
        disabled={disabled}
        className="flex-1 bg-[linear-gradient(135deg,#7c3aed,#a78bfa)] text-white border-none rounded-md px-5 py-3 text-sm font-extrabold cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 inline-flex items-center justify-center gap-1.5 max-md:min-h-[44px]"
      >
        {nextLabel} <ChevronLeft size={16} />
      </button>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between py-1.5 text-[13px]">
      <span className="text-white/50">{label}</span>
      <span className="font-bold">{value}</span>
    </div>
  );
}

export default SetupWizard;

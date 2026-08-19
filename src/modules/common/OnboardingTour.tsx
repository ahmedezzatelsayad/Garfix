"use client";

/**
 * ═════════════════════════════════════════════════════════════
 * GarfiX DS v6.0 — Onboarding Tour
 *
 * جولة تعريفية تفاعلية تظهر للعميل أول مرة يدخل فيها للنظام.
 * بتستخدم localStorage عشان تتذكر لو العميل شاف الجولة قبل كده.
 *
 * الخطوات:
 * 1. لوحة التحكم — نظرة عامة على KPIs والرسوم البيانية
 * 2. الفواتير — إنشاء وإدارة الفواتير
 * 3. الإدخال المجمع — لصق طلبات الواتساب
 * 4. العملاء — إدارة قاعدة العملاء
 * 5. المحاسبة — الدفتر العام والتقارير
 * 6. مساعد AI — الدردشة الذكية
 * 7. الإعدادات — تخصيص الشركة
 *
 * Design: GarfiX DS v6.0 — Cairo font + glassmorphism + emerald primary
 * ═════════════════════════════════════════════════════════════
 */

import { useState, useEffect, useCallback } from "react";
import {
  X, ChevronLeft, ChevronRight, Check,
  LayoutDashboard, FileText, Sparkles, Users, Calculator, Bot, Settings,
} from "lucide-react";
import { cn } from "@/lib/utils";

const TOUR_STEPS = [
  {
    icon: LayoutDashboard,
    title: "لوحة التحكم",
    titleEn: "Dashboard",
    description: "نظرة عامة على أداء شركتك — الإيرادات، الفواتير، العملاء، والمستحقات في مكان واحد. الرسوم البيانية بتتحديث لحظياً.",
    color: "from-emerald-600 to-emerald-500",
  },
  {
    icon: FileText,
    title: "الفواتير",
    titleEn: "Invoices",
    description: "إنشاء وإدارة الفواتير بسهولة. كل فاتورة بتتحول تلقائياً لقيد محاسبي. الفواتير متوافقة مع متطلبات الفوترة الإلكترونية لبلدك.",
    color: "from-blue-600 to-blue-500",
  },
  {
    icon: Sparkles,
    title: "الإدخال المجمع بالـ AI",
    titleEn: "Bulk Input AI",
    description: "الصق طلبات الواتساب مباشرة والـ AI بيستخرج البيانات تلقائياً. افصل بين الطلبات بسطر فارغ والـ AI بيوفر عليك ساعات من الإدخال اليدوي.",
    color: "from-gold to-amber-400",
  },
  {
    icon: Users,
    title: "العملاء",
    titleEn: "Clients",
    description: "إدارة قاعدة عملائك مع ملفات تفصيلية لكل عميل: سجل المشتريات، الفواتير، المدفوعات، والمستحقات.",
    color: "from-purple-600 to-purple-500",
  },
  {
    icon: Calculator,
    title: "المحاسبة",
    titleEn: "Accounting",
    description: "دفتر عام كامل، ذمم مدينة/دائنة، بنوك، أصول ثابتة، رواتب WPS، ضرائب VAT. كل شيء متعلق تلقائياً مع الفواتير.",
    color: "from-emerald-700 to-teal-600",
  },
  {
    icon: Bot,
    title: "مساعد الذكاء الاصطناعي",
    titleEn: "AI Assistant",
    description: "اضغط على زرار المساعد في أسفل الشاشة. تقدر تطلب منه إنشاء فاتورة، تحليل بيانات، أو الإجابة على أي سؤال عن شركتك.",
    color: "from-emerald-600 to-cyan-500",
  },
  {
    icon: Settings,
    title: "الإعدادات",
    titleEn: "Settings",
    description: "تخصيص هوية شركتك، قوالب الفواتير، التكاملات، الأمان، والإشعارات. كل إعدادات الشركة في مكان واحد.",
    color: "from-gray-600 to-gray-500",
  },
];

const STORAGE_KEY = "garfix:onboarding-tour-completed";

export function OnboardingTour() {
  const [visible, setVisible] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    // Only show tour if user hasn't completed it before
    try {
      const completed = localStorage.getItem(STORAGE_KEY);
      if (!completed) {
        // Small delay so the app loads first
        const timer = setTimeout(() => setVisible(true), 1500);
        return () => clearTimeout(timer);
      }
    } catch {
      // localStorage might be unavailable
    }
  }, []);

  const handleComplete = useCallback(() => {
    try {
      localStorage.setItem(STORAGE_KEY, "true");
    } catch {
      // Ignore
    }
    setVisible(false);
  }, []);

  const handleSkip = useCallback(() => {
    handleComplete();
  }, [handleComplete]);

  const handleNext = useCallback(() => {
    if (step < TOUR_STEPS.length - 1) {
      setStep(step + 1);
    } else {
      handleComplete();
    }
  }, [step, handleComplete]);

  const handlePrev = useCallback(() => {
    if (step > 0) setStep(step - 1);
  }, [step]);

  if (!visible) return null;

  const current = TOUR_STEPS[step];
  const Icon = current.icon;
  const isLast = step === TOUR_STEPS.length - 1;
  const progress = ((step + 1) / TOUR_STEPS.length) * 100;

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center bg-mutedackgroundlack/60 backdrop-blur-sm p-4" role="dialog" aria-modal="true" aria-label="جولة تعريفية">
      {/* Skip backdrop click */}
      <div className="absolute inset-0" onClick={handleSkip} />

      {/* Tour Card */}
      <div
        className="relative bg-card border border-border rounded-2xl shadow-2xl max-w-md w-full overflow-hidden"
        style={{ background: "rgba(17, 24, 39, 0.95)", backdropFilter: "blur(16px)" }}
      >
        {/* Progress bar */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-mutedlevated">
          <div
            className="h-full bg-gradient-to-r from-emerald-600 to-emerald-400 transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>

        {/* Close button */}
        <button
          onClick={handleSkip}
          className="absolute top-3 left-3 z-10 w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-all"
          aria-label="تخطي الجولة"
        >
          <X size={18} />
        </button>

        {/* Step indicator */}
        <div className="absolute top-4 right-4 text-xs font-bold text-muted-foreground">
          {step + 1} / {TOUR_STEPS.length}
        </div>

        {/* Content */}
        <div className="p-8 pt-12">
          {/* Icon */}
          <div
            className={cn(
              "w-20 h-20 rounded-2xl flex items-center justify-center text-white mb-6 shadow-lg bg-gradient-to-br",
              current.color
            )}
          >
            <Icon size={36} strokeWidth={2} />
          </div>

          {/* Title */}
          <h2 className="text-2xl font-bold mb-1">{current.title}</h2>
          <p className="text-xs text-muted-foreground mb-4 font-medium tracking-wide">{current.titleEn}</p>

          {/* Description */}
          <p className="text-sm text-muted-foreground leading-relaxed mb-8">
            {current.description}
          </p>

          {/* Dots */}
          <div className="flex items-center justify-center gap-2 mb-6">
            {TOUR_STEPS.map((_, i) => (
              <button
                key={i}
                onClick={() => setStep(i)}
                className={cn(
                  "h-2 rounded-full transition-all duration-200",
                  i === step ? "w-8 bg-primary" : "w-2 bg-muted hover:bg-muted-foreground/50"
                )}
                aria-label={`الخطوة ${i + 1}`}
              />
            ))}
          </div>

          {/* Actions */}
          <div className="flex items-center justify-between gap-3">
            <button
              onClick={handleSkip}
              className="text-sm text-muted-foreground hover:text-foreground transition-colors px-3 py-2 min-h-[44px]"
            >
              تخطي الجولة
            </button>

            <div className="flex gap-2">
              {step > 0 && (
                <button
                  onClick={handlePrev}
                  className="flex items-center gap-1 px-4 py-2.5 rounded-lg text-sm font-medium bg-muted text-foreground hover:bg-muted/80 transition-all min-h-[44px]"
                >
                  <ChevronRight size={16} />
                  السابق
                </button>
              )}
              <button
                onClick={handleNext}
                className="flex items-center gap-1.5 px-5 py-2.5 rounded-lg text-sm font-bold bg-gradient-to-r from-emerald-600 to-emerald-500 text-white hover:shadow-lg transition-all min-h-[44px] shadow-md"
              >
                {isLast ? (
                  <>
                    <Check size={16} />
                    ابدأ الآن
                  </>
                ) : (
                  <>
                    التالي
                    <ChevronLeft size={16} />
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

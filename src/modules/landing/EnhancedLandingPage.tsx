"use client";

/**
 * EnhancedLandingPage — الصفحة الرئيسية للموقع الخارجي (نسخة متعددة الصفحات).
 *
 * أعيدت هيكلتها من Landing Page واحدة عملاقة (بطاقات أسعار + مقارنة + FAQ كله
 * في صفحة واحدة) إلى صفحة رئيسية مختصرة احترافية تنقل الزائر إلى الصفحات
 * المتخصصة: /features و/pricing و/about و/contact و/help.
 *
 * الرسوم المتحركة CSS خالصة (بدون framer-motion) — نفس سياسة الأداء السابقة.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Sparkles, CheckCircle2, Star, BrainCircuit, FileText, Calculator,
  Boxes, UserCog, Workflow, ArrowLeft, ShieldCheck, Zap,
} from "lucide-react";
import { PublicSiteHeader } from "@/components/site/PublicSiteHeader";
import { ProfessionalFooter } from "@/components/garfix/ProfessionalFooter";

interface EnhancedLandingPageProps {
  onLogin?: () => void;
  onRegister?: () => void;
}

/* ── أرقام الثقة ─────────────────────────────────────────────── */
const TRUST_STATS = [
  { value: "+20", labelAr: "دولة مدعومة" },
  { value: "18", labelAr: "وحدة متكاملة" },
  { value: "30", labelAr: "يوماً تجربة مجانية" },
  { value: "99.9%", labelAr: "توافر الخدمة" },
];

/* ── أبرز المميزات (بطاقات مختصرة → التفاصيل في /features) ───── */
const FEATURE_HIGHLIGHTS = [
  {
    icon: <BrainCircuit size={24} />,
    titleAr: "ذكاء اصطناعي تشغيلي",
    descAr: "إدخال مجمع يحوّل رسائل واتساب إلى فواتير، ومساعد ينفّذ أوامرك داخل المنصة.",
    color: "from-violet-500 to-purple-600",
  },
  {
    icon: <FileText size={24} />,
    titleAr: "فوترة إلكترونية معتمدة",
    descAr: "ZATCA وETA وFTA وNBR — فواتيرك متوافقة مع هيئة دولتك من اليوم الأول.",
    color: "from-emerald-500 to-teal-600",
  },
  {
    icon: <Calculator size={24} />,
    titleAr: "محاسبة مزدوجة كاملة",
    descAr: "شجرة حسابات تولّد تلقائياً، وقيود متوازنة لكل عملية، وقوائم مالية لحظية.",
    color: "from-amber-500 to-orange-600",
  },
  {
    icon: <Boxes size={24} />,
    titleAr: "مخزون بلا بيع زائد",
    descAr: "مستودعات متعددة، حجز لحظي للكميات، وتنبيهات نقص قبل فوات الأوان.",
    color: "from-blue-500 to-cyan-600",
  },
  {
    icon: <UserCog size={24} />,
    titleAr: "موارد بشرية ورواتب",
    descAr: "حضور وإجازات ومسير رواتب بعملة شركتك وعمولات تُحتسب تلقائياً.",
    color: "from-rose-500 to-pink-600",
  },
  {
    icon: <Workflow size={24} />,
    titleAr: "أتمتة وتقارير لحظية",
    descAr: "قواعد ذكية ترسل التذكيرات، ولوحات متابعة تُظهر أرباحك كما هي الآن.",
    color: "from-slate-500 to-slate-700",
  },
];

const TESTIMONIALS = [
  { name: "أحمد العتيبي", type: "صاحب متجر إلكترونيات", rating: 5, quote: "وفّرت ٢٠ ساعة أسبوعياً من إدارة الفواتير. المساعد الذكي يرتب المنتجات تلقائياً!" },
  { name: "سارة المنصوري", type: "مديرة مالية", rating: 5, quote: "أخيراً منصة محاسبة تدعم العربية والفوترة الإلكترونية بدون إضافات." },
  { name: "خالد القحطاني", type: "مؤسس شركة تقنية", rating: 5, quote: "أدير ٣ شركات من لوحة واحدة. التقارير المالية لحظية ودقيقة." },
];

const QUICK_LINKS = [
  { href: "/features", titleAr: "استعرض كل المميزات", descAr: "18 وحدة من الفاتورة إلى القوائم المالية", icon: <Sparkles size={18} /> },
  { href: "/pricing", titleAr: "خطط الأسعار", descAr: "باقات واضحة تبدأ من 37.5 ريالاً شهرياً", icon: <Zap size={18} /> },
  { href: "/about", titleAr: "تعرّف علينا", descAr: "قصتنا وقيمنا ورحلتنا من الكويت", icon: <ShieldCheck size={18} /> },
];

export function EnhancedLandingPage(_props: EnhancedLandingPageProps) {
  const [_isOnline, setIsOnline] = useState(true);

  useEffect(() => {
    const updateOnline = () => setIsOnline(navigator.onLine);
    window.addEventListener("online", updateOnline);
    window.addEventListener("offline", updateOnline);
    return () => {
      window.removeEventListener("online", updateOnline);
      window.removeEventListener("offline", updateOnline);
    };
  }, []);

  return (
    <div className="min-h-screen bg-background text-foreground relative overflow-x-hidden" dir="rtl">
      {/* Background gradient */}
      <div className="fixed inset-0 bg-[radial-gradient(ellipse_at_top,rgba(4,120,87,0.06),transparent_50%)] dark:bg-[radial-gradient(ellipse_at_top,rgba(4,120,87,0.12),transparent_50%)] pointer-events-none" />

      <style>{`
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes fadeUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes staggerFadeUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }

        .anim-fade-in { animation: fadeIn 0.5s ease-out forwards; }
        .anim-fade-up { opacity: 0; animation: fadeUp 0.6s ease-out forwards; }

        .stagger > *:nth-child(1) { opacity: 0; animation: staggerFadeUp 0.6s ease-out 0.00s forwards; }
        .stagger > *:nth-child(2) { opacity: 0; animation: staggerFadeUp 0.6s ease-out 0.08s forwards; }
        .stagger > *:nth-child(3) { opacity: 0; animation: staggerFadeUp 0.6s ease-out 0.16s forwards; }
        .stagger > *:nth-child(4) { opacity: 0; animation: staggerFadeUp 0.6s ease-out 0.24s forwards; }
        .stagger > *:nth-child(5) { opacity: 0; animation: staggerFadeUp 0.6s ease-out 0.32s forwards; }
        .stagger > *:nth-child(6) { opacity: 0; animation: staggerFadeUp 0.6s ease-out 0.40s forwards; }

        .hover-lift { transition: transform 120ms ease, box-shadow 120ms ease; }
        .hover-lift:hover { transform: translateY(-2px); box-shadow: 0 8px 24px rgba(4,120,87,0.15); }
        .active-press:active { transform: scale(0.98); }
        .duration-120 { transition-duration: 120ms; }

        .landing-card { background: var(--card); border: 1px solid var(--border); transition: all 120ms ease; }
        .landing-card:hover { border-color: var(--border); transform: translateY(-2px); box-shadow: 0 4px 12px rgba(0,0,0,0.08); }
        .dark .landing-card { background: rgba(255,255,255,0.03); border: 1px solid rgba(4,120,87,0.12); backdrop-filter: blur(8px); }
        .dark .landing-card:hover { background: rgba(4,120,87,0.08); border-color: rgba(4,120,87,0.25); box-shadow: 0 8px 24px rgba(4,120,87,0.15); }
        .landing-section-title { background: linear-gradient(120deg, #047857, #059669, #047857); -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent; }
        .glass { background: color-mix(in srgb, var(--card) 80%, transparent); backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px); border: 1px solid var(--border); }
        .dark .glass { background: rgba(17,24,39,0.6); border: 1px solid rgba(4,120,87,0.15); }

        @media (prefers-reduced-motion: reduce) {
          .anim-fade-in, .anim-fade-up, .stagger > * { animation: none !important; opacity: 1 !important; transform: none !important; }
        }
      `}</style>

      <PublicSiteHeader />

      {/* ── Hero ─────────────────────────────────────────────────────── */}
      <section id="about" className="anim-fade-up relative z-10 py-16 md:py-24 px-[5%] text-center">
        <div className="max-w-[820px] mx-auto">
          <div className="anim-fade-in inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/25 text-emerald-600 dark:text-emerald-400 text-[12px] font-extrabold mb-6">
            <Sparkles size={13} />
            منصة أعمال عربية أولاً — مدعومة بالذكاء الاصطناعي
          </div>
          <h1 className="text-[clamp(30px,6vw,56px)] font-black leading-[1.15] mb-5">
            أدر فواتيرك ومحاسبتك ومخزونك
            <br />
            <span className="landing-section-title">في منصة واحدة ذكية</span>
          </h1>
          <p className="text-muted-foreground text-base md:text-lg leading-relaxed max-w-[600px] mx-auto mb-8">
            GARFIX يحوّل رسائل الطلبات إلى فواتير، والفواتير إلى قيود محاسبية متوازنة،
            والتقارير إلى قرارات — بعملة شركتك ولغة دولتك وفوترة إلكترونية معتمدة.
          </p>
          <div className="anim-fade-in flex flex-wrap justify-center gap-3 mb-4">
            <Link
              href="/signup"
              className="active-press inline-flex items-center gap-2 bg-[linear-gradient(135deg,#047857,#10b981)] text-white border-none rounded-xl px-8 py-4 text-[15px] font-extrabold no-underline cursor-pointer transition-all shadow-[0_12px_36px_rgba(4,120,87,0.4)] hover:shadow-[0_16px_44px_rgba(4,120,87,0.5)]"
            >
              ابدأ مجاناً — 30 يوماً <ArrowLeft size={17} />
            </Link>
            <Link
              href="/features"
              className="hover-lift duration-120 inline-flex items-center gap-2 bg-card text-foreground border border-border rounded-xl px-8 py-4 text-[15px] font-bold no-underline cursor-pointer transition-all hover:bg-muted"
            >
              استعرض المميزات
            </Link>
          </div>
          <div className="anim-fade-in text-[12px] text-muted-foreground flex flex-wrap justify-center gap-x-4 gap-y-1.5 mt-6">
            <span className="inline-flex items-center gap-1"><CheckCircle2 size={12} className="text-emerald-500" /> بدون بطاقة ائتمان</span>
            <span className="inline-flex items-center gap-1"><CheckCircle2 size={12} className="text-emerald-500" /> إعداد خلال 5 دقائق</span>
            <span className="inline-flex items-center gap-1"><CheckCircle2 size={12} className="text-emerald-500" /> دعم بالعربية</span>
          </div>
        </div>
      </section>

      {/* ── Trust stats ─────────────────────────────────────────────── */}
      <section className="relative z-10 px-[5%] pb-4">
        <div className="max-w-[900px] mx-auto grid grid-cols-2 md:grid-cols-4 gap-3 stagger">
          {TRUST_STATS.map((s) => (
            <div key={s.labelAr} className="landing-card rounded-xl p-5 text-center">
              <div className="text-2xl font-black landing-section-title">{s.value}</div>
              <div className="text-[12px] text-muted-foreground font-semibold mt-1">{s.labelAr}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Feature highlights ──────────────────────────────────────── */}
      <section id="features" className="relative z-10 py-14 md:py-16 px-[5%]">
        <div className="max-w-[1100px] mx-auto">
          <div className="text-center mb-10">
            <h2 className="text-[clamp(22px,4vw,34px)] font-black mb-3">
              كل وحدة تعمل <span className="landing-section-title">مع البقية بسلاسة</span>
            </h2>
            <p className="text-muted-foreground text-sm md:text-base max-w-[560px] mx-auto leading-relaxed">
              لا تنتقل بين عشر أدوات منفصلة — الفاتورة تحدّث المخزون، والمخزون يحرك المحاسبة، والكل يغذي التقارير.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 stagger">
            {FEATURE_HIGHLIGHTS.map((f) => (
              <Link key={f.titleAr} href="/features" className="landing-card rounded-2xl p-6 no-underline hover-lift block">
                <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${f.color} text-white flex items-center justify-center mb-4 shadow-sm`}>
                  {f.icon}
                </div>
                <h3 className="text-[15.5px] font-extrabold text-foreground mb-2">{f.titleAr}</h3>
                <p className="text-[13px] text-muted-foreground leading-relaxed">{f.descAr}</p>
              </Link>
            ))}
          </div>
          <div className="text-center mt-8">
            <Link
              href="/features"
              className="inline-flex items-center gap-2 text-emerald-600 dark:text-emerald-400 text-[13.5px] font-extrabold no-underline hover:underline"
            >
              شاهد كل المميزات التفصيلية <ArrowLeft size={15} />
            </Link>
          </div>
        </div>
      </section>

      {/* ── Testimonials ────────────────────────────────────────────── */}
      <section className="relative z-10 py-14 md:py-16 px-[5%] bg-muted/40 border-y border-border">
        <div className="max-w-[1000px] mx-auto">
          <h2 className="text-[clamp(22px,4vw,32px)] font-black mb-2 text-center">عملاء يثقون بنا</h2>
          <p className="text-center text-muted-foreground text-sm mb-10">من المتاجر الصغيرة إلى الشركات متعددة الفروع</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 stagger">
            {TESTIMONIALS.map((t) => (
              <div key={t.name} className="landing-card rounded-2xl p-6 flex flex-col">
                <div className="flex gap-0.5 mb-3 text-amber-400">
                  {Array.from({ length: t.rating }).map((_, i) => (
                    <Star key={i} size={14} fill="currentColor" />
                  ))}
                </div>
                <p className="text-[13.5px] text-foreground/90 leading-relaxed flex-1">“{t.quote}”</p>
                <div className="mt-4 pt-4 border-t border-border">
                  <div className="text-[13px] font-extrabold text-foreground">{t.name}</div>
                  <div className="text-[11.5px] text-muted-foreground">{t.type}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Quick links ─────────────────────────────────────────────── */}
      <section className="relative z-10 py-14 px-[5%]">
        <div className="max-w-[900px] mx-auto grid grid-cols-1 sm:grid-cols-3 gap-4 stagger">
          {QUICK_LINKS.map((q) => (
            <Link key={q.href} href={q.href} className="landing-card rounded-xl p-5 no-underline hover-lift flex items-start gap-3.5">
              <span className="w-10 h-10 rounded-lg bg-emerald-500/12 border border-emerald-500/25 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                {q.icon}
              </span>
              <div>
                <div className="text-[14px] font-extrabold text-foreground mb-1">{q.titleAr}</div>
                <div className="text-[12px] text-muted-foreground leading-relaxed">{q.descAr}</div>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* ── CTA band ────────────────────────────────────────────────── */}
      <section className="relative z-10 px-[5%] pb-20">
        <div className="max-w-[900px] mx-auto rounded-3xl bg-[linear-gradient(135deg,#047857_0%,#059669_55%,#10b981_100%)] p-10 md:p-14 text-center text-white shadow-[0_24px_64px_rgba(4,120,87,0.35)]">
          <h2 className="text-[clamp(22px,4vw,34px)] font-black mb-4">جاهز تبدأ؟ شركتك جاهزة خلال دقائق</h2>
          <p className="text-white/85 text-sm md:text-base max-w-[520px] mx-auto mb-8 leading-relaxed">
            معالج إعداد ذكي يسألك عن دولتك ونشاطك ويجهز لك شجرة الحسابات والعملة
            والمنطقة الزمنية وقالب الفاتورة — تلقائياً.
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <Link
              href="/signup"
              className="active-press inline-flex items-center gap-2 bg-white text-[#047857] border-none rounded-xl px-8 py-3.5 text-[14px] font-extrabold no-underline cursor-pointer transition-all hover:shadow-lg"
            >
              أنشئ حسابك مجاناً <ArrowLeft size={16} />
            </Link>
            <Link
              href="/pricing"
              className="inline-flex items-center gap-2 bg-white/15 text-white border border-white/35 rounded-xl px-8 py-3.5 text-[14px] font-bold no-underline cursor-pointer transition-all hover:bg-white/25"
            >
              خطط الأسعار
            </Link>
          </div>
        </div>
      </section>

      <ProfessionalFooter variant="landing" />
    </div>
  );
}

export default EnhancedLandingPage;

"use client";

import { useEffect, useRef, useState } from "react";
import {
  Sparkles, Shield, Zap, Globe, ChevronLeft, CheckCircle2, Star,
  BrainCircuit, FileText, Building2, Calculator, ArrowRight,
  Download, Wifi, WifiOff, RefreshCw, MessageCircle, Phone, Mail,
} from "lucide-react";
import { DEFAULT_PLANS } from "@/lib/plans";
import { cn } from "@/lib/utils";
import { ProfessionalFooter } from "@/components/garfix/ProfessionalFooter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";

// Phase 6 P2 fix: removed framer-motion (~100KB gzipped) from the landing page.
// All animations are now pure CSS keyframes — zero JS overhead, no library.
// The visual effect is identical: fade-up on load, stagger on children,
// scale-in on pricing cards. CSS animations run on the compositor thread
// (GPU-accelerated) and don't trigger React re-renders.

interface EnhancedLandingPageProps {
  onLogin: () => void;
  onRegister: () => void;
}

/* ── Pricing Tiers (SAR) ─────────────────────────────────────────────── */
const PRICING_TIERS = [
  {
    key: "starter",
    name: "Starter",
    nameAr: "المبتدئة",
    price: 99,
    currency: "SAR",
    periodAr: "شهرياً",
    highlight: false,
    badge: null,
    features: [
      "مستخدم واحد",
      "حتى ٥٠ فاتورة شهرياً",
      "إدارة عملاء أساسية",
      "تقارير بسيطة",
      "دعم بالبريد الإلكتروني",
    ],
  },
  {
    key: "growth",
    name: "Growth",
    nameAr: "النمو",
    price: 299,
    currency: "SAR",
    periodAr: "شهرياً",
    highlight: true,
    badge: "الأكثر شعبية",
    features: [
      "حتى ١٠ مستخدمين",
      "فواتير غير محدودة",
      "مساعد ذكاء اصطناعي",
      "تقارير متقدمة + رسوم بيانية",
      "فوترة إلكترونية (ZATCA/ETA)",
      "دعم优先 بالواتساب",
    ],
  },
  {
    key: "enterprise",
    name: "Enterprise",
    nameAr: "المؤسسات",
    price: 799,
    currency: "SAR",
    periodAr: "شهرياً",
    highlight: false,
    badge: null,
    features: [
      "مستخدمين غير محدودين",
      "كل ميزات Growth",
      "API مخصص + تكاملات",
      "مدير حساب مخصص",
      "تدريب فريق العمل",
      "SLA 99.9% مضمون",
    ],
  },
];

const FEATURE_SHOWCASE = [
  { icon: <BrainCircuit size={24} />, titleAr: "ذكاء اصطناعي متقدم", desc: "مساعد ذكي يحلل بياناتك ويوصي بقرارات لزيادة الأرباح", color: "from-violet-500 to-purple-600" },
  { icon: <FileText size={24} />, titleAr: "فوترة إلكترونية", desc: "متوافق مع ZATCA وETA وهيئات الفوترة الإلكترونية في MENA", color: "from-emerald-500 to-teal-600" },
  { icon: <Building2 size={24} />, titleAr: "متعدد الشركات", desc: "أدر كل شركاتك من لوحة واحدة مع عزل كامل للبيانات", color: "from-blue-500 to-cyan-600" },
  { icon: <Calculator size={24} />, titleAr: "محاسبة متكاملة", desc: "دليل حسابات هرمي، قيود يومية، ميزان مراجعة، تقارير IFRS", color: "from-amber-500 to-orange-600" },
];

const COMPARISON_FEATURES = [
  { featureAr: "واجهة عربية أصيلة (RTL)", garfix: "✓", odoo: "جزئي", zoho: "✗", freshbooks: "✗" },
  { featureAr: "فوترة إلكترونية ZATCA/ETA", garfix: "✓", odoo: "✗", zoho: "✗", freshbooks: "✗" },
  { featureAr: "مساعد ذكاء اصطناعي مدمج", garfix: "✓", odoo: "✗", zoho: "✗", freshbooks: "✗" },
  { featureAr: "متعدد الشركات (Multi-tenant)", garfix: "✓", odoo: "✓", zoho: "✗", freshbooks: "✗" },
  { featureAr: "تطبيق PWA (يعمل بدون اتصال)", garfix: "✓", odoo: "✗", zoho: "✗", freshbooks: "✗" },
  { featureAr: "تسعير بالريال السعودي", garfix: "✓", odoo: "✗", zoho: "✓", freshbooks: "✗" },
  { featureAr: "دعم بالعربية ٢٤/٧", garfix: "✓", odoo: "✗", zoho: "✗", freshbooks: "✗" },
];

const TESTIMONIALS = [
  { name: "أحمد العتيبي", type: "صاحب متجر إلكترونيات", rating: 5, quote: "وفّرت ٢٠ ساعة أسبوعياً من إدارة الفواتير. المساعد الذكي يرتب المنتجات تلقائياً!" },
  { name: "سارة المنصوري", type: "مديرة مالية", rating: 5, quote: "أخيراً منصة محاسبة تدعم العربية والفوترة الإلكترونية بدون إضافات." },
  { name: "خالد القحطاني", type: "مؤسس شركة تقنية", rating: 5, quote: "أدير ٣ شركات من لوحة واحدة. التقارير المالية لحظية ودقيقة." },
];

const FAQ_ITEMS = [
  { q: "هل أحتاج بطاقة ائتمان للتجربة المجانية؟", a: "لا، التجربة المجانية ٣٠ يوماً لا تتطلب بطاقة ائتمان. سجّل ببريدك وابدأ فوراً." },
  { q: "هل بياناتي آمنة؟", a: "نعم، نستخدم تشفير AES-256 لجميع البيانات الحساسة، ونسخ احتياطية يومية، وعزل كامل بين الشركات." },
  { q: "هل يدعم الفوترة الإلكترونية في بلدي؟", a: "ندعم ZATCA (السعودية)، ETA (مصر)، FTA (الإمارات)، NBR (البحرين)، وقريباً المزيد." },
  { q: "هل يمكنني الترقية أو التخفيض لاحقاً؟", a: "نعم، يمكنك تغيير باقتك في أي وقت من لوحة الإعدادات. الفرق يُحتسب تلقائياً." },
  { q: "هل يعمل على الموبايل؟", a: "نعم، GarfiX يعمل كتطبيق PWA — ثبّته على موبايلك ويعمل كتطبيق أصلي مع إشعارات." },
];

function getPrice(tier: typeof PRICING_TIERS[0], billingPeriod?: string) {
  if (tier.price === 0) return "مجاناً";
  if (billingPeriod === "yearly") return String(tier.price * 10);
  return String(tier.price);
}

function EnhancedLandingPage({ onLogin, onRegister }: EnhancedLandingPageProps) {
  const [billingPeriod, setBillingPeriod] = useState<"monthly" | "yearly">("monthly");
  const [isOnline, setIsOnline] = useState(true);
  const heroRef = useRef<HTMLDivElement>(null);

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
    <div className="min-h-screen bg-[#0b1220] text-white relative overflow-x-hidden" dir="rtl">
      {/* Background gradient */}
      <div className="fixed inset-0 bg-[radial-gradient(ellipse_at_top,rgba(4,120,87,0.12),transparent_50%)] pointer-events-none" />

      <style>{`
        /* Phase 6 P2: pure CSS animations replacing framer-motion */
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes fadeUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes scaleIn { from { opacity: 0; transform: scale(0.9); } to { opacity: 1; transform: scale(1); } }
        @keyframes staggerFadeUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }

        .anim-fade-in { animation: fadeIn 0.5s ease-out forwards; }
        .anim-fade-up { opacity: 0; animation: fadeUp 0.6s ease-out forwards; }
        .anim-scale-in { opacity: 0; animation: scaleIn 0.5s ease-out forwards; }

        /* Stagger children: each child delays by 80ms × index */
        .stagger > *:nth-child(1) { opacity: 0; animation: staggerFadeUp 0.6s ease-out 0.00s forwards; }
        .stagger > *:nth-child(2) { opacity: 0; animation: staggerFadeUp 0.6s ease-out 0.08s forwards; }
        .stagger > *:nth-child(3) { opacity: 0; animation: staggerFadeUp 0.6s ease-out 0.16s forwards; }
        .stagger > *:nth-child(4) { opacity: 0; animation: staggerFadeUp 0.6s ease-out 0.24s forwards; }
        .stagger > *:nth-child(5) { opacity: 0; animation: staggerFadeUp 0.6s ease-out 0.32s forwards; }
        .stagger > *:nth-child(6) { opacity: 0; animation: staggerFadeUp 0.6s ease-out 0.40s forwards; }
        .stagger > *:nth-child(7) { opacity: 0; animation: staggerFadeUp 0.6s ease-out 0.48s forwards; }
        .stagger > *:nth-child(8) { opacity: 0; animation: staggerFadeUp 0.6s ease-out 0.56s forwards; }
        .stagger > *:nth-child(9) { opacity: 0; animation: staggerFadeUp 0.6s ease-out 0.64s forwards; }
        .stagger > *:nth-child(10) { opacity: 0; animation: staggerFadeUp 0.6s ease-out 0.72s forwards; }
        .stagger > *:nth-child(11) { opacity: 0; animation: staggerFadeUp 0.6s ease-out 0.80s forwards; }
        .stagger > *:nth-child(12) { opacity: 0; animation: staggerFadeUp 0.6s ease-out 0.88s forwards; }

        .hover-lift { transition: transform 120ms ease, box-shadow 120ms ease; }
        .hover-lift:hover { transform: translateY(-2px); box-shadow: 0 8px 24px rgba(4,120,87,0.15); }
        .active-press:active { transform: scale(0.98); }
        .duration-120 { transition-duration: 120ms; }
        .duration-150 { transition-duration: 150ms; }

        .landing-card { background: rgba(255,255,255,0.03); border: 1px solid rgba(4,120,87,0.12); backdrop-filter: blur(8px); transition: all 120ms ease; }
        .landing-card:hover { background: rgba(4,120,87,0.08); border-color: rgba(4,120,87,0.25); transform: translateY(-2px); box-shadow: 0 8px 24px rgba(4,120,87,0.15); }
        .landing-section-title { background: linear-gradient(120deg, #6ee7b7, #059669, #6ee7b7); -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent; }
        .pricing-highlight { background: linear-gradient(180deg,rgba(212,165,116,0.2),rgba(212,165,116,0.05)); border: 2px solid #d4a574; }
        .comparison-garfix { background: rgba(4,120,87,0.08); }
        .glass { background: rgba(17,24,39,0.6); backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px); border: 1px solid rgba(4,120,87,0.15); }

        @media (prefers-reduced-motion: reduce) {
          .anim-fade-in, .anim-fade-up, .anim-scale-in, .stagger > * { animation: none !important; opacity: 1 !important; transform: none !important; }
        }
      `}</style>

      {/* ── Nav ──────────────────────────────────────────────────────── */}
      <nav className="anim-fade-in relative z-10 py-5 px-[5%] flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-lg bg-[linear-gradient(135deg,#047857,#10b981)] flex items-center justify-center text-[22px] font-black text-white shadow-[0_8px_24px_rgba(4,120,87,0.4)]">
            G
          </div>
          <div>
            <div className="text-xl font-black tracking-wider">GARFIX</div>
            <div className="text-[10px] text-white/50 tracking-[2px]">EOS v{process.env.NEXT_PUBLIC_APP_VERSION || '12'}</div>
          </div>
        </div>
        <div className="flex gap-2.5">
          <button
            onClick={onLogin}
            className="hover-lift duration-120 bg-transparent text-white/85 border border-white/15 rounded-md px-[22px] py-2.5 text-sm font-bold cursor-pointer transition-all hover:bg-white/5 max-md:min-h-[44px]"
          >تسجيل الدخول</button>
          <button
            onClick={onRegister}
            className="active-press duration-150 bg-[linear-gradient(135deg,#047857,#10b981)] text-white border-none rounded-md px-[22px] py-2.5 text-sm font-extrabold cursor-pointer transition-all shadow-[0_8px_24px_rgba(4,120,87,0.4)] hover:shadow-[0_12px_32px_rgba(4,120,87,0.5)] max-md:min-h-[44px]"
          >ابدأ مجاناً</button>
        </div>
      </nav>

      {/* ── Hero ─────────────────────────────────────────────────────── */}
      <section
        id="about"
        ref={heroRef}
        className="stagger relative z-[5] py-20 md:py-28 px-[5%] text-center max-w-[1100px] mx-auto"
      >
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-[20px] bg-[rgba(4,120,87,0.15)] border border-[rgba(4,120,87,0.3)] text-[#6ee7b7] text-xs font-bold mb-6">
          <Sparkles size={14} />
          منصة ERP متكاملة بمساعد ذكاء اصطناعي — مُحسّنة لـ MENA
        </div>
        <h1 className="text-[clamp(36px,6vw,68px)] font-black leading-[1.15] mb-5">
          أدر أعمالك بثقة مع
          <br />
          <span className="bg-[linear-gradient(120deg,#fbbf24,#f59e0b,#fbbf24)] [background-size:200%_auto] [-webkit-background-clip:text] [background-clip:text] [-webkit-text-fill-color:transparent]">
            GARFIX
          </span>
        </h1>
        <p className="text-[clamp(16px,2vw,20px)] text-white/70 max-w-[720px] mx-auto mb-9 leading-relaxed">
          منصة سحابية متكاملة لإدارة الفواتير والعملاء والموارد البشرية والمحاسبة والمشتريات.
          مدعومة بمساعد ذكاء اصطناعي يحلل بياناتك ويعطيك توصيات عملية لزيادة الأرباح.
        </p>
        <div className="flex flex-wrap gap-3.5 justify-center">
          <button
            onClick={onRegister}
            className="active-press duration-150 bg-[linear-gradient(135deg,#047857,#10b981)] text-white border-none rounded-lg px-9 py-4 text-base font-extrabold cursor-pointer transition-all shadow-[0_12px_36px_rgba(4,120,87,0.5)] hover:shadow-[0_16px_40px_rgba(4,120,87,0.6)] inline-flex items-center gap-2 max-md:min-h-[44px]"
          >
            ابدأ تجربة مجانية ٣٠ يوماً
            <ChevronLeft size={18} />
          </button>
          <button
            onClick={onLogin}
            className="bg-transparent text-white/85 border border-white/20 rounded-lg px-8 py-4 text-base font-bold cursor-pointer transition-all hover:bg-white/5 max-md:min-h-[44px]"
          >تسجيل الدخول</button>
        </div>

        {/* Stats */}
        <div className="stagger grid grid-cols-2 lg:grid-cols-4 gap-5 max-w-[760px] mx-auto mt-[60px]">
          {[
            { n: "+1,000", label: "فاتورة شهرياً" },
            { n: "99.9%", label: "وقت التشغيل" },
            { n: "24/7", label: "دعم فوري" },
            { n: "15+", label: "وحدة متكاملة" },
          ].map((s, i) => (
            <div
              key={i}
              className="p-5 rounded-[14px] bg-white/[0.04] border border-white/[0.08]"
            >
              <div className="text-[32px] font-black text-[#fbbf24]">{s.n}</div>
              <div className="text-xs text-white/60 mt-1">{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Features Showcase ─────────────────────────────────────────── */}
      <section
        id="features"
        className="stagger py-[60px] px-[5%] relative z-[5]"
      >
        <div className="text-center mb-[50px]">
          <h2 className="text-[clamp(28px,4vw,44px)] font-black mb-3 landing-section-title">
            كل ما تحتاجه لإدارة أعمالك في مكان واحد
          </h2>
          <p className="text-white/60 text-base max-w-[640px] mx-auto">
            من الفاتورة الأولى إلى التقارير المالية الشاملة — GARFIX يغطي كل جوانب عملك
          </p>
        </div>

        {/* Feature Showcase Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 max-w-[1200px] mx-auto mb-12">
          {FEATURE_SHOWCASE.map((f, i) => (
            <div key={i}>
              <Card className="landing-card cursor-default h-full hover-lift duration-120">
                <CardHeader>
                  <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${f.color} flex items-center justify-center text-white mb-2`}>
                    {f.icon}
                  </div>
                  <CardTitle className="text-lg font-extrabold text-white">{f.titleAr}</CardTitle>
                  <CardDescription className="text-white/60 text-[13px] leading-relaxed">{f.desc}</CardDescription>
                </CardHeader>
              </Card>
            </div>
          ))}
        </div>

        {/* All Features Grid */}
        <div className="stagger grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5 max-w-[1200px] mx-auto">
          {[
            { icon: "🧾", title: "فواتير احترافية", desc: "أنشئ وأرسل فواتير بتصميم احترافي في ثوانٍ مع دعم الضرائب والخصومات والشحن" },
            { icon: "👥", title: "إدارة العملاء", desc: "قاعدة بيانات كاملة لعملائك مع تاريخ المشتريات وأرصدة المدفوعات" },
            { icon: "📊", title: "لوحة تحكم ذكية", desc: "إحصائيات وتقارير لحظية لأداء شركتك مع رسوم بيانية تفاعلية" },
            { icon: "🤖", title: "مساعد الذكاء الاصطناعي", desc: "حلّل الطلبات واحصل على توصيات ذكية لزيادة الإيرادات وإدارة الأعمال" },
            { icon: "🏢", title: "متعدد الشركات", desc: "أدر أكثر من شركة من لوحة تحكم واحدة موحّدة مع عزل كامل للبيانات" },
            { icon: "🖨️", title: "طباعة مباشرة", desc: "اطبع فواتيرك مباشرة بتنسيق A4 احترافي مع شعار الشركة وبياناتها" },
            { icon: "🛒", title: "إدارة المشتريات", desc: "تتبّع مشتريات الموردين وادارة المخزون مع ربط مع دليل الحسابات" },
            { icon: "👔", title: "الموارد البشرية", desc: "إدارة الموظفين والرواتب والحضور والإجازات والعمولات وتقييم الأداء" },
            { icon: "💰", title: "محاسبة متكاملة", desc: "دليل حسابات هرمي وقيود يومية معزولة لكل شركة مع تقارير ميزان المراجعة" },
            { icon: "🔒", title: "أمان وصلاحيات", desc: "تحكم بصلاحيات كل موظف بدقة عالية مع سجل تدقيق كامل لكل عملية" },
            { icon: "🧾", title: "الفاتورة الإلكترونية", desc: "قابلية التوسع لهيئات الفوترة الإلكترونية الخليجية مستقبلاً (ZATCA، FTA، NBR)" },
            { icon: "📱", title: "تطبيق موبايل (PWA)", desc: "ثبّت المنصة كتطبيق على موبايلك — تعمل بسرعة تطبيق أصلي مع إشعارات" },
          ].map((f, i) => (
            <div
              key={i}
              className="p-6 rounded-2xl landing-card cursor-default hover-lift duration-120"
            >
              <div className="text-[32px] mb-3">{f.icon}</div>
              <h3 className="text-lg font-extrabold mb-2">{f.title}</h3>
              <p className="text-white/60 text-[13px] leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Pricing ──────────────────────────────────────────────────── */}
      <section
        id="pricing"
        className="stagger py-20 px-[5%] relative z-[5]"
      >
        <div className="text-center mb-10">
          <h2 className="text-[clamp(28px,4vw,44px)] font-black mb-3 landing-section-title">
            باقات تناسب نموّ أعمالك
          </h2>
          <p className="text-white/60 text-base">
            ابدأ مجاناً وارتقِ حسب احتياجك — بدون رسوم خفية
          </p>

          {/* Billing toggle */}
          <div className="flex items-center justify-center gap-3 mt-6">
            <span className={cn("text-sm font-bold", billingPeriod === "monthly" ? "text-white" : "text-white/50")}>شهرياً</span>
            <button
              onClick={() => setBillingPeriod(billingPeriod === "monthly" ? "yearly" : "monthly")}
              className={cn(
                "w-12 h-6 rounded-full relative cursor-pointer transition-all border-none",
                billingPeriod === "yearly" ? "bg-[#047857]" : "bg-white/20"
              )}
            >
              <div className={cn(
                "w-5 h-5 rounded-full bg-white absolute top-[2px] transition-all",
                billingPeriod === "yearly" ? "start-[7px]" : "start-[2px]"
              )} />
            </button>
            <span className={cn("text-sm font-bold", billingPeriod === "yearly" ? "text-white" : "text-white/50")}>
              سنوياً
              <Badge variant="secondary" className="ms-2 bg-[#047857]/20 text-[#6ee7b7] border-[#047857]/30 text-[10px]">وفّر ٢ شهر</Badge>
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 max-w-[1100px] mx-auto">
          {PRICING_TIERS.map((tier) => (
            <div key={tier.key} className="anim-scale-in">
              <Card className={cn(
                "rounded-[18px] h-full relative",
                tier.highlight ? "pricing-highlight" : "bg-white/[0.04] border border-white/[0.08]"
              )}>
                {tier.badge && (
                  <div className="absolute -top-3 start-1/2 -translate-x-1/2 bg-[linear-gradient(135deg,#047857,#10b981)] text-white px-3.5 py-1 rounded-[12px] text-[11px] font-extrabold whitespace-nowrap">
                    {tier.badge}
                  </div>
                )}
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg font-extrabold text-white">{tier.nameAr}</CardTitle>
                  <CardDescription className="text-white/50 text-[13px]">{tier.name}</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex items-baseline gap-1.5 mb-4">
                    <span className="text-4xl font-black">{getPrice(tier, billingPeriod)}</span>
                    <span className="text-white/50 text-[13px]">{tier.currency}/{billingPeriod === "yearly" ? "سنوياً" : tier.periodAr}</span>
                  </div>
                  <ul className="list-none p-0 m-0 mb-6 text-[13px] text-white/75">
                    {tier.features.map((f, i) => (
                      <li key={i} className="py-1.5 flex items-start gap-2">
                        <CheckCircle2 size={14} className="text-[#10b981] shrink-0 mt-0.5" />
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>
                  <Button
                    onClick={onRegister}
                    className={cn(
                      "active-press duration-150 w-full text-sm font-bold",
                      tier.highlight
                        ? "bg-[linear-gradient(135deg,#d4a574,#c9956a)] text-white hover:brightness-110"
                        : "bg-gradient-to-r from-emerald-600 to-emerald-700 text-white hover:brightness-110"
                    )}
                  >
                    {tier.price === 0 ? "ابدأ الآن" : "اختر الباقة"}
                  </Button>
                </CardContent>
              </Card>
            </div>
          ))}
        </div>

        {/* Original Plans */}
        <div className="mt-10">
          <p className="text-center text-white/40 text-[12px] mb-4">← الباقات الأساسية (بالدولار) ←</p>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 max-w-[1100px] mx-auto">
            {Object.keys(DEFAULT_PLANS).map((key) => {
              const plan = DEFAULT_PLANS[key];
              return (
                <div key={key} className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06] text-center">
                  <div className="text-sm font-bold">{plan.name}</div>
                  <div className="text-xl font-black text-white/70">
                    {plan.priceMonthly === 0 ? "مجاناً" : `$${plan.priceMonthly}`}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── Comparison Table ──────────────────────────────────────────── */}
      <section
        className="stagger py-20 px-[5%] relative z-[5]"
      >
        <div className="text-center mb-10">
          <h2 className="text-[clamp(28px,4vw,40px)] font-black mb-3 landing-section-title">
            كيف نختلف عن المنافسين؟
          </h2>
          <p className="text-white/60 text-base">
            مقارنة شاملة بين GARFIX وأبرز حلول ERP العالمية
          </p>
        </div>
        <div className="max-w-[1100px] mx-auto overflow-x-auto">
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr className="bg-white/[0.05]">
                <th className="p-3 text-start text-[#6ee7b7] font-bold">الميزة</th>
                <th className="p-3 text-center font-extrabold text-white comparison-garfix rounded-t-[8px]">
                  <div className="flex items-center justify-center gap-2">
                    <div className="w-6 h-6 rounded bg-[linear-gradient(135deg,#047857,#10b981)] flex items-center justify-center text-[12px] font-black">G</div>
                    GARFIX
                  </div>
                </th>
                <th className="p-3 text-center text-white/60 font-bold">Odoo</th>
                <th className="p-3 text-center text-white/60 font-bold">Zoho</th>
                <th className="p-3 text-center text-white/60 font-bold">FreshBooks</th>
              </tr>
            </thead>
            <tbody>
              {COMPARISON_FEATURES.map((row, i) => (
                <tr key={i} className="border-b border-white/[0.06]">
                  <td className="p-3 font-bold text-white/80">{row.featureAr}</td>
                  <td className="p-3 text-center text-[#6ee7b7] font-bold comparison-garfix">{row.garfix}</td>
                  <td className="p-3 text-center text-white/50">{row.odoo}</td>
                  <td className="p-3 text-center text-white/50">{row.zoho}</td>
                  <td className="p-3 text-center text-white/50">{row.freshbooks}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── Testimonials ──────────────────────────────────────────────── */}
      <section
        className="stagger py-20 px-[5%] relative z-[5]"
      >
        <div className="text-center mb-10">
          <h2 className="text-[clamp(28px,4vw,40px)] font-black mb-3 landing-section-title">
            يثقون بنا
          </h2>
          <p className="text-white/60 text-base">
            آراء عملائنا (بيانات تجريبية — ستُحدّث بآراء عملاء حقيقيين)
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 max-w-[1100px] mx-auto">
          {TESTIMONIALS.map((t, i) => (
            <div key={i}>
              <Card className="glass landing-card h-full">
                <CardContent className="pt-6">
                  <div className="flex items-center gap-1 mb-3">
                    {Array(t.rating).fill(null).map((_, j) => (
                      <Star key={j} size={14} className="text-[#fbbf24] fill-[#fbbf24]" />
                    ))}
                  </div>
                  <p className="text-[13px] text-white/80 leading-relaxed mb-4">&ldquo;{t.quote}&rdquo;</p>
                  <div className="text-[13px] font-bold">{t.name}</div>
                  <div className="text-[11px] text-white/50">{t.type}</div>
                  <div className="text-[9px] text-white/30 mt-1">عميل تجريبي</div>
                </CardContent>
              </Card>
            </div>
          ))}
        </div>
      </section>

      {/* ── FAQ ───────────────────────────────────────────────────────── */}
      <section
        id="faq"
        className="anim-fade-up py-20 px-[5%] relative z-[5]"
      >
        <div className="text-center mb-10">
          <h2 className="text-[clamp(28px,4vw,40px)] font-black mb-3 landing-section-title">
            أسئلة شائعة
          </h2>
        </div>
        <div className="max-w-[760px] mx-auto">
          <Accordion type="single" collapsible className="flex flex-col gap-3">
            {FAQ_ITEMS.map((faq, i) => (
              <AccordionItem key={i} value={`faq-${i}`} className="rounded-lg landing-card border-none px-5">
                <AccordionTrigger className="text-[15px] font-bold text-white outline-none hover:no-underline [&[data-state=open]]:text-[#6ee7b7]">
                  {faq.q}
                </AccordionTrigger>
                <AccordionContent className="text-[13px] text-white/70 leading-relaxed">
                  {faq.a}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </section>

      {/* ── CTA ──────────────────────────────────────────────────────── */}
      <section
        className="anim-fade-up py-20 px-[5%] relative z-[5]"
      >
        <div className="max-w-[900px] mx-auto p-10 md:p-[60px] md:px-10 rounded-3xl bg-[linear-gradient(135deg,rgba(4,120,87,0.2),rgba(16,185,129,0.05))] border border-[rgba(4,120,87,0.3)] text-center">
          <h2 className="text-[clamp(28px,4vw,40px)] font-black mb-4 landing-section-title">
            جاهز لتحويل أعمالك؟
          </h2>
          <p className="text-white/70 text-base mb-8 max-w-[540px] mx-auto">
            انضم لمئات الشركات التي تدير أعمالها بكفاءة مع GARFIX. ابدأ تجربتك المجانية اليوم — لا حاجة لبطاقة ائتمان.
          </p>
          <div className="flex flex-wrap gap-4 justify-center">
            <button
              onClick={onRegister}
              className="active-press duration-150 bg-[linear-gradient(135deg,#047857,#10b981)] text-white border-none rounded-lg px-10 py-4 text-base font-extrabold cursor-pointer transition-all shadow-[0_12px_36px_rgba(4,120,87,0.5)] hover:shadow-[0_16px_40px_rgba(4,120,87,0.6)] inline-flex items-center gap-2.5 max-md:min-h-[44px]"
            >
              <Zap size={18} />
              ابدأ الآن مجاناً
            </button>
            <button
              onClick={onLogin}
              className="bg-transparent text-white/85 border border-white/20 rounded-lg px-8 py-4 text-base font-bold cursor-pointer transition-all hover:bg-white/5 inline-flex items-center gap-2 max-md:min-h-[44px]"
            >
              <ArrowRight size={18} className="rotate-180" />
              تسجيل الدخول
            </button>
          </div>

          {/* PWA Install Hint */}
          <div className="mt-8 flex items-center justify-center gap-2 text-white/40 text-[12px]">
            <Download size={14} />
            <span>تثبيت كتطبيق PWA على الموبايل — يعمل بدون اتصال</span>
          </div>
        </div>
      </section>

      {/* ── Footer ───────────────────────────────────────────────────── */}
      <ProfessionalFooter variant="landing" version={process.env.NEXT_PUBLIC_APP_VERSION || '12'} />
    </div>
  );
}

export { EnhancedLandingPage };

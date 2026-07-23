"use client";

import { useEffect, useRef, useState } from "react";
import {
  Sparkles, Shield, Zap, Globe, ChevronLeft, CheckCircle2, Star,
  BrainCircuit, FileText, Building2, Calculator, ArrowRight,
  Download, Wifi, WifiOff, RefreshCw, MessageCircle, Phone, Mail,
} from "lucide-react";
import { motion } from "framer-motion";
import { DEFAULT_PLANS } from "@/lib/plans";
import { cn } from "@/lib/utils";
import { ProfessionalFooter } from "@/components/garfix/ProfessionalFooter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";

interface EnhancedLandingPageProps {
  onLogin: () => void;
  onRegister: () => void;
}

/* ── Animation Variants ──────────────────────────────────────────────── */
const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: "easeOut" } },
};

const stagger = {
  visible: { transition: { staggerChildren: 0.08 } },
};

const scaleIn = {
  hidden: { opacity: 0, scale: 0.9 },
  visible: { opacity: 1, scale: 1, transition: { duration: 0.5 } },
};

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
      "١٠٠ فاتورة شهرياً",
      "إدارة العملاء",
      "لوحة تحكم أساسية",
      "طباعة الفواتير",
      "دعم عبر البريد الإلكتروني",
    ],
  },
  {
    key: "professional",
    name: "Professional",
    nameAr: "الاحترافية",
    price: 299,
    currency: "SAR",
    periodAr: "شهرياً",
    highlight: true,
    badge: "الأكثر شعبية",
    features: [
      "٥ مستخدمين",
      "١٬٠٠٠ فاتورة شهرياً",
      "مساعد الذكاء الاصطناعي",
      "الفاتورة الإلكترونية (ZATCA/FTA)",
      "إدارة المشتريات والمخزون",
      "الموارد البشرية",
      "دليل حسابات ومحاسبة",
      "دعم ذو أولوية",
    ],
  },
  {
    key: "enterprise",
    name: "Enterprise",
    nameAr: "المؤسسية",
    price: 999,
    currency: "SAR",
    periodAr: "شهرياً",
    highlight: false,
    badge: null,
    features: [
      "مستخدمون بلا حدود",
      "فواتير بلا حدود",
      "كل مزايا الذكاء الاصطناعي (AI Fabric)",
      "كل هيئات الفوترة الإلكترونية",
      "تكامل مخصص (API)",
      "محاسبة متكاملة + تقارير مالية",
      "شركات متعددة",
      "دعم مخصّص + مدير حساب",
    ],
  },
];

/* ── Testimonials ────────────────────────────────────────────────────── */
const TESTIMONIALS = [
  {
    name: "شركة النور التجارية",
    type: "تجزئة — الكويت",
    quote: "وفّرت علينا ساعات يومية في إدارة الفواتير. المساعد الذكي بيحوّل رسائل واتساب لفواتير في ثواني.",
    rating: 5,
  },
  {
    name: "مؤسسة الفجر",
    type: "جملة — السعودية",
    quote: "أخيراً منصة تفهم السوق الخليجي. الضريبة والعملة متظبطة تلقائياً حسب الدولة.",
    rating: 5,
  },
  {
    name: "متجر اللؤلؤ",
    type: "تجارة إلكترونية — الإمارات",
    quote: "الإدخال المجمع بالذكاء الاصطناعي غيّر طريقة شغلنا تماماً. بدل إدخال يدوي بنص ساعة، دقيقة واحدة.",
    rating: 5,
  },
  {
    name: "مجموعة الخليج للإنشاءات",
    type: "إنشاءات — البحرين",
    quote: "إدارة عدة شركات إنشاءات من لوحة واحدة. التقارير المالية الموحدة توفّر وقت المحاسب.",
    rating: 4,
  },
  {
    name: "شركة الوفاء للخدمات",
    type: "خدمات — عُمان",
    quote: "نظام الموارد البشرية متكامل: رواتب، حضور، إجازات، مكافأة نهاية الخدمة — كل شيء.",
    rating: 5,
  },
  {
    name: "مؤسسة الأمل",
    type: "جملة — مصر",
    quote: "الفاتورة الإلكترونية لـ ETA اتظبطت بسرعة. المنصة فعلاً مُحسّنة لكل بلد في المنطقة.",
    rating: 4,
  },
];

/* ── FAQ ──────────────────────────────────────────────────────────────── */
const FAQ_ITEMS = [
  { q: "هل بياناتي آمنة؟", a: "نعم — جميع كلمات المرور مشفّرة بـ bcrypt، والمفاتيح الحساسة مشفّرة بـ AES-256-GCM. كل شركة معزولة تماماً عن غيرها." },
  { q: "هل ينفع لأكثر من شركة؟", a: "نعم — يمكنك إدارة عدد غير محدود من الشركات من حساب واحد، كل واحدة بعملتها وضريبتها ودولتها." },
  { q: "هل فيه نسخة تجريبية؟", a: "نعم — تجربة مجانية 30 يوماً بكل المزايا. لا حاجة لبطاقة ائتمان." },
  { q: "هل يدعم الذكاء الاصطناعي؟", a: "نعم — مساعد ذكي يفهم العربية، يحوّل النصوص والصور لفواتير، وينفذ أوامر حقيقية مع تأكيد أمني." },
  { q: "هل يدعم دول الشرق الأوسط؟", a: "نعم — مُحسّن لـ 20+ دولة: الكويت والسعودية والإمارات والبحرين وعُمان وقطر + الأردن ومصر والعراق ولبنان وتونس والجزائر والمغرب وفلسطين وسوريا واليمن والسودان وليبيا + الصومال وجيبوتي وموريتانيا وإريتريا وجزر القمر: عملات، ضرائب، مكافأة نهاية الخدمة، تقويم خليجي." },
  { q: "هل يمكن الاستخدام من الموبايل؟", a: "نعم — المنصة PWA قابلة للتثبيت كتطبيق على الموبايل مع دعم كامل للشاشات الصغيرة." },
  { q: "ما هي هيئات الفوترة الإلكترونية المدعومة؟", a: "نحن ندعم ZATCA (السعودية)، FTA (الإمارات)، NBR (البحرين)، Oman Tax (عُمان)، Kuwait (قيد التطوير)، و ETA (مصر). كل هيئة لها معالجة آلية متكاملة." },
  { q: "هل يمكنني الترقية أو التراجع عن الباقة؟", a: "نعم — يمكنك تغيير الباقة في أي وقت. الترقية فورية، والتراجع يبدأ من الدورة التالية." },
];

/* ── Comparison Table ─────────────────────────────────────────────────── */
const COMPARISON_FEATURES = [
  { feature: "مساعد ذكاء اصطناعي", featureAr: "مساعد الذكاء الاصطناعي (AI Fabric)", garfix: "16- مرحلة cascade + تأكيد أمني", odoo: "بدون AI مدمج", zoho: "Zia — أساسي", freshbooks: "بدون AI" },
  { feature: "فاتورة إلكترونية", featureAr: "الفاتورة الإلكترونية (MENA)", garfix: "ZATCA + FTA + NBR + Oman + Egypt", odoo: "ZATCA فقط", zoho: "بدون", freshbooks: "بدون" },
  { feature: "محاسبة متكاملة", featureAr: "محاسبة متكاملة", garfix: "دليل حسابات + قيود + ميزان + تقارير", odoo: "كامل", zoho: "Books — متوسط", freshbooks: "أساسي" },
  { feature: "متعدد الشركات", featureAr: "متعدد الشركات", garfix: "عزل companySlug + دعم لكل عملة", odoo: "Multi-company", zoho: "حساب واحد", freshbooks: "حساب واحد" },
  { feature: "الموارد البشرية", featureAr: "الموارد البشرية + WPS", garfix: "رواتب + حضور + إجازات + مكافأة + WPS", odoo: "كامل", zoho: "People — أساسي", freshbooks: "بدون" },
  { feature: "لغة العربية", featureAr: "واجهة عربية (RTL)", garfix: "Arabic-first + RTL", odoo: "ترجمة فقط", zoho: "ترجمة فقط", freshbooks: "بدون" },
  { feature: "سعر", featureAr: "السعر (شهرياً)", garfix: "99 — 999 SAR", odoo: "20 — 350 USD+", zoho: "15 — 200 USD", freshbooks: "17 — 55 USD" },
  { feature: "دعم MENA", featureAr: "دعم MENA", garfix: "20+ دولة + عملات + ضرائب", odoo: "عالمي", zoho: "عالمي", freshbooks: "أمريكا/كندا" },
];

/* ── Features Showcase ────────────────────────────────────────────────── */
const FEATURE_SHOWCASE = [
  {
    icon: <BrainCircuit size={28} />,
    title: "AI Fabric",
    titleAr: "AI Fabric — محرك الذكاء الاصطناعي",
    desc: "16- مرحلة cascade لتحسين التكلفة مع تأكيد أمني على كل عملية. يحوّل النصوص والصور لفواتير وينفّذ أوامر حقيقية.",
    color: "from-purple-500 to-violet-600",
  },
  {
    icon: <FileText size={28} />,
    title: "E-Invoicing",
    titleAr: "الفاتورة الإلكترونية",
    desc: "دعم ZATCA (السعودية)، FTA (الإمارات)، NBR (البحرين)، Oman Tax، ETA (مصر). كل هيئة بمعالجة آلية متكاملة.",
    color: "from-blue-500 to-cyan-600",
  },
  {
    icon: <Building2 size={28} />,
    title: "Multi-tenant",
    titleAr: "متعدد الشركات",
    desc: "أدر عدد غير محدود من الشركات من حساب واحد. كل شركة بعملتها وضريبتها ودولتها مع عزل كامل للبيانات.",
    color: "from-emerald-500 to-green-600",
  },
  {
    icon: <Calculator size={28} />,
    title: "Accounting",
    titleAr: "محاسبة متكاملة",
    desc: "دليل حسابات هرمي، قيود يومية، ميزان المراجعة، تقارير مالية، موازنة، تكاليف مخزون، أصول ثابتة.",
    color: "from-amber-500 to-orange-600",
  },
];

/* ── Component ────────────────────────────────────────────────────────── */
export default function EnhancedLandingPage({ onLogin, onRegister }: EnhancedLandingPageProps) {
  const cvsRef = useRef<HTMLCanvasElement>(null);
  const [billingPeriod, setBillingPeriod] = useState<"monthly" | "yearly">("monthly");

  // Canvas particle animation (same as original LandingPage)
  useEffect(() => {
    const c = cvsRef.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    let raf: number;

    const dpr = typeof window !== "undefined" ? Math.min(window.devicePixelRatio || 1, 2) : 1;

    const resize = () => {
      const w = c.offsetWidth;
      const h = c.offsetHeight;
      c.width = w * dpr;
      c.height = h * dpr;
      ctx.scale(dpr, dpr);
      c.dataset.logicalW = String(w);
      c.dataset.logicalH = String(h);
    };
    resize();
    window.addEventListener("resize", resize);

    const isMobile = window.innerWidth < 768;
    const particleCount = isMobile ? 20 : 50;
    const connectionDist = isMobile ? 80 : 140;

    const pts = Array.from({ length: particleCount }, () => ({
      x: Math.random() * (parseInt(c.dataset.logicalW || "2000")),
      y: Math.random() * (parseInt(c.dataset.logicalH || "1200")),
      vx: (Math.random() - 0.5) * 0.1,
      vy: (Math.random() - 0.5) * 0.1,
      r: Math.random() * (isMobile ? 0.8 : 1.2) + 0.3,
      o: Math.random() * 0.25 + 0.05,
    }));

    const draw = () => {
      const w = parseInt(c.dataset.logicalW || String(c.offsetWidth));
      const h = parseInt(c.dataset.logicalH || String(c.offsetHeight));
      ctx.clearRect(0, 0, w, h);
      for (let i = 0; i < pts.length; i++) {
        for (let j = i + 1; j < pts.length; j++) {
          const dx = pts[i].x - pts[j].x;
          const dy = pts[i].y - pts[j].y;
          const d = Math.hypot(dx, dy);
          if (d < connectionDist) {
            ctx.beginPath();
            ctx.moveTo(pts[i].x, pts[i].y);
            ctx.lineTo(pts[j].x, pts[j].y);
            ctx.strokeStyle = `rgba(167,139,250,${0.04 * (1 - d / connectionDist)})`;
            ctx.lineWidth = isMobile ? 0.4 : 0.6;
            ctx.stroke();
          }
        }
      }
      pts.forEach((p) => {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(167,139,250,${p.o})`;
        ctx.fill();
        p.x += p.vx; p.y += p.vy;
        if (p.x < 0 || p.x > w) p.vx *= -1;
        if (p.y < 0 || p.y > h) p.vy *= -1;
      });
      raf = requestAnimationFrame(draw);
    };
    draw();
    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", resize); };
  }, []);

  const getPrice = (tier: typeof PRICING_TIERS[0]) => {
    if (billingPeriod === "yearly") {
      return Math.round(tier.price * 10); // 2 months free on yearly
    }
    return tier.price;
  };

  return (
    <div
      dir="rtl"
      className="min-h-dvh bg-[linear-gradient(180deg,#0f0a1e_0%,#1a1035_35%,#12082e_70%,#0f0a1e_100%)] text-white overflow-x-hidden"
    >
      <canvas
        ref={cvsRef}
        className="absolute top-0 start-0 w-full h-dvh pointer-events-none opacity-70 z-0 [will-change:transform]"
      />
      <style>{`
        @keyframes garfix-fade-up { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes garfix-float { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-8px); } }
        @keyframes garfix-glow { 0%,100% { opacity: .4; } 50% { opacity: 1; } }
        .landing-card { background: rgba(255,255,255,0.03); border: 1px solid rgba(124,58,237,0.12); backdrop-filter: blur(8px); transition: all .2s; }
        .landing-card:hover { background: rgba(124,58,237,0.08); border-color: rgba(124,58,237,0.25); transform: translateY(-2px); }
        .landing-section-title { background: linear-gradient(120deg, #c4b5fd, #8b5cf6, #c4b5fd); -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent; }
        .pricing-highlight { background: linear-gradient(180deg,rgba(124,58,237,0.25),rgba(167,139,250,0.1)); border: 2px solid #7c3aed; }
        .comparison-garfix { background: rgba(124,58,237,0.08); }
      `}</style>

      {/* ── Nav ──────────────────────────────────────────────────────── */}
      <motion.nav
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5 }}
        className="relative z-10 py-5 px-[5%] flex flex-wrap items-center justify-between gap-3"
      >
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-lg bg-[linear-gradient(135deg,#7c3aed,#a78bfa)] flex items-center justify-center text-[22px] font-black text-white shadow-[0_8px_24px_rgba(124,58,237,0.4)]">
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
            className="bg-transparent text-white/85 border border-white/15 rounded-md px-[22px] py-2.5 text-sm font-bold cursor-pointer transition-all hover:bg-white/5 max-md:min-h-[44px]"
          >تسجيل الدخول</button>
          <button
            onClick={onRegister}
            className="bg-[linear-gradient(135deg,#7c3aed,#a78bfa)] text-white border-none rounded-md px-[22px] py-2.5 text-sm font-extrabold cursor-pointer transition-all shadow-[0_8px_24px_rgba(124,58,237,0.4)] max-md:min-h-[44px]"
          >ابدأ مجاناً</button>
        </div>
      </motion.nav>

      {/* ── Hero ─────────────────────────────────────────────────────── */}
      <motion.section
        id="about"
        initial="hidden"
        animate="visible"
        variants={stagger}
        className="relative z-[5] py-20 md:py-28 px-[5%] text-center max-w-[1100px] mx-auto"
      >
        <motion.div variants={fadeUp} className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-[20px] bg-[rgba(124,58,237,0.15)] border border-[rgba(124,58,237,0.3)] text-[#c4b5fd] text-xs font-bold mb-6">
          <Sparkles size={14} />
          منصة ERP متكاملة بمساعد ذكاء اصطناعي — مُحسّنة لـ MENA
        </motion.div>
        <motion.h1 variants={fadeUp} className="text-[clamp(36px,6vw,68px)] font-black leading-[1.15] mb-5">
          أدر أعمالك بثقة مع
          <br />
          <span className="bg-[linear-gradient(120deg,#fbbf24,#f59e0b,#fbbf24)] [background-size:200%_auto] [-webkit-background-clip:text] [background-clip:text] [-webkit-text-fill-color:transparent]">
            GARFIX
          </span>
        </motion.h1>
        <motion.p variants={fadeUp} className="text-[clamp(16px,2vw,20px)] text-white/70 max-w-[720px] mx-auto mb-9 leading-relaxed">
          منصة سحابية متكاملة لإدارة الفواتير والعملاء والموارد البشرية والمحاسبة والمشتريات.
          مدعومة بمساعد ذكاء اصطناعي يحلل بياناتك ويعطيك توصيات عملية لزيادة الأرباح.
        </motion.p>
        <motion.div variants={fadeUp} className="flex flex-wrap gap-3.5 justify-center">
          <button
            onClick={onRegister}
            className="bg-[linear-gradient(135deg,#7c3aed,#a78bfa)] text-white border-none rounded-lg px-9 py-4 text-base font-extrabold cursor-pointer transition-all shadow-[0_12px_36px_rgba(124,58,237,0.5)] inline-flex items-center gap-2 max-md:min-h-[44px]"
          >
            ابدأ تجربة مجانية ٣٠ يوماً
            <ChevronLeft size={18} />
          </button>
          <button
            onClick={onLogin}
            className="bg-transparent text-white/85 border border-white/20 rounded-lg px-8 py-4 text-base font-bold cursor-pointer transition-all hover:bg-white/5 max-md:min-h-[44px]"
          >تسجيل الدخول</button>
        </motion.div>

        {/* Stats */}
        <motion.div variants={stagger} className="grid grid-cols-2 lg:grid-cols-4 gap-5 max-w-[760px] mx-auto mt-[60px]">
          {[
            { n: "+1,000", label: "فاتورة شهرياً" },
            { n: "99.9%", label: "وقت التشغيل" },
            { n: "24/7", label: "دعم فوري" },
            { n: "15+", label: "وحدة متكاملة" },
          ].map((s, i) => (
            <motion.div
              key={i}
              variants={fadeUp}
              className="p-5 rounded-[14px] bg-white/[0.04] border border-white/[0.08]"
            >
              <div className="text-[32px] font-black text-[#fbbf24]">{s.n}</div>
              <div className="text-xs text-white/60 mt-1">{s.label}</div>
            </motion.div>
          ))}
        </motion.div>
      </motion.section>

      {/* ── Features Showcase ─────────────────────────────────────────── */}
      <motion.section
        id="features"
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: "-100px" }}
        variants={stagger}
        className="py-[60px] px-[5%] relative z-[5]"
      >
        <motion.div variants={fadeUp} className="text-center mb-[50px]">
          <h2 className="text-[clamp(28px,4vw,44px)] font-black mb-3 landing-section-title">
            كل ما تحتاجه لإدارة أعمالك في مكان واحد
          </h2>
          <p className="text-white/60 text-base max-w-[640px] mx-auto">
            من الفاتورة الأولى إلى التقارير المالية الشاملة — GARFIX يغطي كل جوانب عملك
          </p>
        </motion.div>

        {/* Feature Showcase Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 max-w-[1200px] mx-auto mb-12">
          {FEATURE_SHOWCASE.map((f, i) => (
            <motion.div key={i} variants={fadeUp}>
              <Card className="landing-card cursor-default h-full">
                <CardHeader>
                  <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${f.color} flex items-center justify-center text-white mb-2`}>
                    {f.icon}
                  </div>
                  <CardTitle className="text-lg font-extrabold text-white">{f.titleAr}</CardTitle>
                  <CardDescription className="text-white/60 text-[13px] leading-relaxed">{f.desc}</CardDescription>
                </CardHeader>
              </Card>
            </motion.div>
          ))}
        </div>

        {/* All Features Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5 max-w-[1200px] mx-auto">
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
            <motion.div
              key={i}
              variants={fadeUp}
              className="p-6 rounded-2xl landing-card cursor-default"
            >
              <div className="text-[32px] mb-3">{f.icon}</div>
              <h3 className="text-lg font-extrabold mb-2">{f.title}</h3>
              <p className="text-white/60 text-[13px] leading-relaxed">{f.desc}</p>
            </motion.div>
          ))}
        </div>
      </motion.section>

      {/* ── Pricing ──────────────────────────────────────────────────── */}
      <motion.section
        id="pricing"
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: "-100px" }}
        variants={stagger}
        className="py-20 px-[5%] relative z-[5]"
      >
        <motion.div variants={fadeUp} className="text-center mb-10">
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
                billingPeriod === "yearly" ? "bg-[#7c3aed]" : "bg-white/20"
              )}
            >
              <div className={cn(
                "w-5 h-5 rounded-full bg-white absolute top-[2px] transition-all",
                billingPeriod === "yearly" ? "start-[7px]" : "start-[2px]"
              )} />
            </button>
            <span className={cn("text-sm font-bold", billingPeriod === "yearly" ? "text-white" : "text-white/50")}>
              سنوياً
              <Badge variant="secondary" className="ms-2 bg-[#7c3aed]/20 text-[#c4b5fd] border-[#7c3aed]/30 text-[10px]">وفّر ٢ شهر</Badge>
            </span>
          </div>
        </motion.div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 max-w-[1100px] mx-auto">
          {PRICING_TIERS.map((tier) => (
            <motion.div key={tier.key} variants={scaleIn}>
              <Card className={cn(
                "rounded-[18px] h-full relative",
                tier.highlight ? "pricing-highlight" : "bg-white/[0.04] border border-white/[0.08]"
              )}>
                {tier.badge && (
                  <div className="absolute -top-3 start-1/2 -translate-x-1/2 bg-[linear-gradient(135deg,#7c3aed,#a78bfa)] text-white px-3.5 py-1 rounded-[12px] text-[11px] font-extrabold whitespace-nowrap">
                    {tier.badge}
                  </div>
                )}
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg font-extrabold text-white">{tier.nameAr}</CardTitle>
                  <CardDescription className="text-white/50 text-[13px]">{tier.name}</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex items-baseline gap-1.5 mb-4">
                    <span className="text-4xl font-black">{getPrice(tier)}</span>
                    <span className="text-white/50 text-[13px]">{tier.currency}/{billingPeriod === "yearly" ? "سنوياً" : tier.periodAr}</span>
                  </div>
                  <ul className="list-none p-0 m-0 mb-6 text-[13px] text-white/75">
                    {tier.features.map((f, i) => (
                      <li key={i} className="py-1.5 flex items-start gap-2">
                        <CheckCircle2 size={14} className="text-[#a78bfa] shrink-0 mt-0.5" />
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>
                  <Button
                    onClick={onRegister}
                    className={cn(
                      "w-full text-sm font-bold",
                      tier.highlight
                        ? "bg-[linear-gradient(135deg,#7c3aed,#a78bfa)] text-white"
                        : "bg-white/10 text-white hover:bg-white/15"
                    )}
                  >
                    {tier.price === 0 ? "ابدأ الآن" : "اختر الباقة"}
                  </Button>
                </CardContent>
              </Card>
            </motion.div>
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
      </motion.section>

      {/* ── Comparison Table ──────────────────────────────────────────── */}
      <motion.section
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: "-100px" }}
        variants={stagger}
        className="py-20 px-[5%] relative z-[5]"
      >
        <motion.div variants={fadeUp} className="text-center mb-10">
          <h2 className="text-[clamp(28px,4vw,40px)] font-black mb-3 landing-section-title">
            كيف نختلف عن المنافسين؟
          </h2>
          <p className="text-white/60 text-base">
            مقارنة شاملة بين GARFIX وأبرز حلول ERP العالمية
          </p>
        </motion.div>
        <motion.div variants={fadeUp} className="max-w-[1100px] mx-auto overflow-x-auto">
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr className="bg-white/[0.05]">
                <th className="p-3 text-start text-[#c4b5fd] font-bold">الميزة</th>
                <th className="p-3 text-center font-extrabold text-white comparison-garfix rounded-t-[8px]">
                  <div className="flex items-center justify-center gap-2">
                    <div className="w-6 h-6 rounded bg-[linear-gradient(135deg,#7c3aed,#a78bfa)] flex items-center justify-center text-[12px] font-black">G</div>
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
                  <td className="p-3 text-center text-[#c4b5fd] font-bold comparison-garfix">{row.garfix}</td>
                  <td className="p-3 text-center text-white/50">{row.odoo}</td>
                  <td className="p-3 text-center text-white/50">{row.zoho}</td>
                  <td className="p-3 text-center text-white/50">{row.freshbooks}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </motion.div>
      </motion.section>

      {/* ── Testimonials ──────────────────────────────────────────────── */}
      <motion.section
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: "-100px" }}
        variants={stagger}
        className="py-20 px-[5%] relative z-[5]"
      >
        <motion.div variants={fadeUp} className="text-center mb-10">
          <h2 className="text-[clamp(28px,4vw,40px)] font-black mb-3 landing-section-title">
            يثقون بنا
          </h2>
          <p className="text-white/60 text-base">
            آراء عملائنا (بيانات تجريبية — ستُحدّث بآراء عملاء حقيقيين)
          </p>
        </motion.div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 max-w-[1100px] mx-auto">
          {TESTIMONIALS.map((t, i) => (
            <motion.div key={i} variants={fadeUp}>
              <Card className="landing-card h-full">
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
            </motion.div>
          ))}
        </div>
      </motion.section>

      {/* ── FAQ ───────────────────────────────────────────────────────── */}
      <motion.section
        id="faq"
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: "-100px" }}
        variants={fadeUp}
        className="py-20 px-[5%] relative z-[5]"
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
                <AccordionTrigger className="text-[15px] font-bold text-white outline-none hover:no-underline [&[data-state=open]]:text-[#c4b5fd]">
                  {faq.q}
                </AccordionTrigger>
                <AccordionContent className="text-[13px] text-white/70 leading-relaxed">
                  {faq.a}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </motion.section>

      {/* ── CTA ──────────────────────────────────────────────────────── */}
      <motion.section
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: "-100px" }}
        variants={fadeUp}
        className="py-20 px-[5%] relative z-[5]"
      >
        <div className="max-w-[900px] mx-auto p-10 md:p-[60px] md:px-10 rounded-3xl bg-[linear-gradient(135deg,rgba(124,58,237,0.2),rgba(167,139,250,0.05))] border border-[rgba(124,58,237,0.3)] text-center">
          <h2 className="text-[clamp(28px,4vw,40px)] font-black mb-4 landing-section-title">
            جاهز لتحويل أعمالك؟
          </h2>
          <p className="text-white/70 text-base mb-8 max-w-[540px] mx-auto">
            انضم لمئات الشركات التي تدير أعمالها بكفاءة مع GARFIX. ابدأ تجربتك المجانية اليوم — لا حاجة لبطاقة ائتمان.
          </p>
          <div className="flex flex-wrap gap-4 justify-center">
            <button
              onClick={onRegister}
              className="bg-[linear-gradient(135deg,#7c3aed,#a78bfa)] text-white border-none rounded-lg px-10 py-4 text-base font-extrabold cursor-pointer transition-all shadow-[0_12px_36px_rgba(124,58,237,0.5)] inline-flex items-center gap-2.5 max-md:min-h-[44px]"
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
      </motion.section>

      {/* ── Footer ───────────────────────────────────────────────────── */}
      <ProfessionalFooter variant="landing" version={process.env.NEXT_PUBLIC_APP_VERSION || '12'} />
    </div>
  );
}

export { EnhancedLandingPage };

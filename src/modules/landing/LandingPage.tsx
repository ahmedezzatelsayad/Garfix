"use client";

import { useEffect, useRef, useState } from "react";
import { Sparkles, Shield, Zap, Globe, ChevronLeft } from "lucide-react";
import { DEFAULT_PLANS } from "@/lib/plans";
import { cn } from "@/lib/utils";
import { ProfessionalFooter } from "@/components/garfix/ProfessionalFooter";

interface LandingPageProps {
  onLogin: () => void;
  onRegister: () => void;
}

export default function LandingPage({ onLogin, onRegister }: LandingPageProps) {
  const cvsRef = useRef<HTMLCanvasElement>(null);
  const [billingPeriod, setBillingPeriod] = useState<"monthly" | "yearly">("monthly");
  const [content, setContent] = useState<Record<string, any> | null>(null);

  useEffect(() => {
    fetch("/api/landing-content")
      .then((res) => {
        if (!res.ok) throw new Error("Failed to fetch landing content");
        return res.json();
      })
      .then((data) => setContent(data))
      .catch(() => {
        // Graceful fallback — keep content as null so hardcoded defaults are used
      });
  }, []);

  useEffect(() => {
    const c = cvsRef.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    let raf: number;

    // Use devicePixelRatio for crisp rendering on mobile/retina
    const dpr = typeof window !== "undefined" ? Math.min(window.devicePixelRatio || 1, 2) : 1;

    const resize = () => {
      const w = c.offsetWidth;
      const h = c.offsetHeight;
      c.width = w * dpr;
      c.height = h * dpr;
      ctx.scale(dpr, dpr);
      // Store logical dimensions for drawing
      c.dataset.logicalW = String(w);
      c.dataset.logicalH = String(h);
    };
    resize();
    window.addEventListener("resize", resize);

    // Reduce particles on mobile for performance
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
      const w = parseInt(c.dataset.logicalW || String(c.offsetWidth)) ;
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

  // billingPeriod state currently unused in render — kept for future pricing toggle.
  void setBillingPeriod;
  void billingPeriod;

  const defaultFeatures = [
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
  ];

  const defaultStats = [
    { n: "+1000", label: "فاتورة شهرياً" },
    { n: "99.9%", label: "وقت التشغيل" },
    { n: "24/7", label: "دعم فوري" },
    { n: "15+", label: "وحدة متكاملة" },
  ];

  const defaultTestimonials = [
    { name: "شركة النور التجارية", type: "تجزئة — الكويت", quote: "وفّرت علينا ساعات يومية في إدارة الفواتير. المساعد الذكي بيحوّل رسائل واتساب لفواتير في ثواني.", rating: 5 },
    { name: "مؤسسة الفجر", type: "جملة — السعودية", quote: "أخيراً منصة تفهم السوق الخليجي. الضريبة والعملة متظبطة تلقائياً حسب الدولة.", rating: 5 },
    { name: "متجر اللؤلؤ", type: "تجارة إلكترونية — الإمارات", quote: "الإدخال المجمع بالذكاء الاصطناعي غيّر طريقة شغلنا تماماً. بدل إدخال يدوي بنص ساعة، دقيقة واحدة.", rating: 5 },
  ];

  const defaultFaq = [
    { q: "هل بياناتي آمنة؟", a: "نعم — جميع كلمات المرور مشفّرة بـ bcrypt، والمفاتيح الحساسة مشفّرة بـ AES-256-GCM. كل شركة معزولة تماماً عن غيرها." },
    { q: "هل ينفع لأكثر من شركة؟", a: "نعم — يمكنك إدارة عدد غير محدود من الشركات من حساب واحد، كل واحدة بعملتها وضريبتها ودولتها." },
    { q: "هل فيه نسخة تجريبية؟", a: "نعم — تجربة مجانية 30 يوماً بكل المزايا. لا حاجة لبطاقة ائتمان." },
    { q: "هل يدعم الذكاء الاصطناعي؟", a: "نعم — مساعد ذكي يفهم العربية، يحوّل النصوص والصور لفواتير، وينفذ أوامر حقيقية مع تأكيد أمني." },
    { q: "هل يدعم دول الخليج؟", a: "نعم — مُحسّن للكويت والسعودية والإمارات والبحرين وعُمان وقطر: عملات، ضرائب، مكافأة نهاية الخدمة، تقويم خليجي." },
    { q: "هل يمكن الاستخدام من الموبايل؟", a: "نعم — المنصة PWA قابلة للتثبيت كتطبيق على الموبايل مع دعم كامل للشاشات الصغيرة." },
  ];

  const features = (Array.isArray(content?.features) ? content.features : defaultFeatures) as typeof defaultFeatures;
  const stats = (Array.isArray(content?.stats) ? content.stats : defaultStats) as typeof defaultStats;
  const testimonials = (Array.isArray(content?.testimonials) ? content.testimonials : defaultTestimonials) as typeof defaultTestimonials;
  const faqItems = (Array.isArray(content?.faq) ? content.faq : defaultFaq) as typeof defaultFaq;

  const heroTitle = content?.["hero.title"] || "أدر أعمالك بثقة مع";
  const heroSubtitle = content?.["hero.subtitle"] || "منصة سحابية متكاملة لإدارة الفواتير والعملاء والموارد البشرية والمحاسقة والمشتريات.\nمدعومة بمساعد ذكاء اصطناعي يحلل بياناتك ويعطيك توصيات عملية لزيادة الأرباح.";
  const heroCtaText = content?.["hero.cta_text"] || "ابدأ تجربة مجانية ٣٠ يوماً";

  const planKeys = Object.keys(DEFAULT_PLANS) as Array<keyof typeof DEFAULT_PLANS>;

  return (
    <div
      dir="rtl"
      className="min-h-dvh bg-[linear-gradient(180deg,#0f0a1e_0%,#1a1035_35%,#12082e_70%,#0f0a1e_100%)] text-white overflow-x-hidden"
    >
      <canvas
        ref={cvsRef}
        className="absolute top-0 start-0 w-full h-dvh pointer-events-none opacity-70 z-0"
        style={{ willChange: "transform", imageRendering: "auto" }}
      />
      <style>{`
        @keyframes garfix-fade-up { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes garfix-float { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-8px); } }
        @keyframes garfix-glow { 0%,100% { opacity: .4; } 50% { opacity: 1; } }
        /* Landing Page Color Consistency */
        .landing-card { background: rgba(255,255,255,0.03); border: 1px solid rgba(124,58,237,0.12); backdrop-filter: blur(8px); transition: all .2s; }
        .landing-card:hover { background: rgba(124,58,237,0.08); border-color: rgba(124,58,237,0.25); transform: translateY(-2px); }
        .landing-section-title { background: linear-gradient(120deg, #c4b5fd, #8b5cf6, #c4b5fd); -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent; }
      `}</style>

      {/* ── Nav ──────────────────────────────────────────────────────── */}
      <nav className="relative z-10 py-5 px-[5%] flex flex-wrap items-center justify-between gap-3">
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
      </nav>

      {/* ── About / Hero ─────────────────────────────────────────────── */}
      <section id="about" className="relative z-[5] py-20 md:py-28 px-[5%] text-center max-w-[1100px] mx-auto">
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-[20px] bg-[rgba(124,58,237,0.15)] border border-[rgba(124,58,237,0.3)] text-[#c4b5fd] text-xs font-bold mb-6 [animation:garfix-fade-up_.6s_ease-out]">
          <Sparkles size={14} />
          منصة ERP متكاملة بمساعد ذكاء اصطناعي
        </div>
        <h1 className="text-[clamp(36px,6vw,68px)] font-black leading-[1.15] mb-5 [animation:garfix-fade-up_.7s_ease-out_.1s_both]">
          {heroTitle}
          <br />
          <span className="bg-[linear-gradient(120deg,#fbbf24,#f59e0b,#fbbf24)] [background-size:200%_auto] [-webkit-background-clip:text] [background-clip:text] [-webkit-text-fill-color:transparent]">
            GARFIX
          </span>
        </h1>
        <p className="text-[clamp(16px,2vw,20px)] text-white/70 max-w-[720px] mx-auto mb-9 leading-relaxed [animation:garfix-fade-up_.8s_ease-out_.2s_both]">
          {heroSubtitle}
        </p>
        <div className="flex flex-wrap gap-3.5 justify-center [animation:garfix-fade-up_.9s_ease-out_.3s_both]">
          <button
            onClick={onRegister}
            className="bg-[linear-gradient(135deg,#7c3aed,#a78bfa)] text-white border-none rounded-lg px-9 py-4 text-base font-extrabold cursor-pointer transition-all shadow-[0_12px_36px_rgba(124,58,237,0.5)] inline-flex items-center gap-2 max-md:min-h-[44px]"
          >
            {heroCtaText}
            <ChevronLeft size={18} />
          </button>
          <button
            onClick={onLogin}
            className="bg-transparent text-white/85 border border-white/20 rounded-lg px-8 py-4 text-base font-bold cursor-pointer transition-all hover:bg-white/5 max-md:min-h-[44px]"
          >تسجيل الدخول</button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-5 max-w-[760px] mx-auto mt-[60px]">
          {stats.map((s, i) => (
            <div
              key={i}
              className="p-5 rounded-[14px] bg-white/[0.04] border border-white/[0.08] [animation:garfix-fade-up_.8s_ease-out_both]"
              style={{ animationDelay: `${0.4 + i * 0.1}s` }}
            >
              <div className="text-[32px] font-black text-[#fbbf24]">{s.n}</div>
              <div className="text-xs text-white/60 mt-1">{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Features ─────────────────────────────────────────────────── */}
      <section id="features" className="py-[60px] px-[5%] relative z-[5]">
        <div className="text-center mb-[50px]">
          <h2 className="text-[clamp(28px,4vw,44px)] font-black mb-3 landing-section-title">
            كل ما تحتاجه لإدارة أعمالك في مكان واحد
          </h2>
          <p className="text-white/60 text-base max-w-[640px] mx-auto">
            من الفاتورة الأولى إلى التقارير المالية الشاملة — GARFIX يغطي كل جوانب عملك
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5 max-w-[1200px] mx-auto">
          {features.map((f, i) => (
            <div
              key={i}
              className="p-6 rounded-2xl landing-card cursor-default [animation:garfix-fade-up_.6s_ease-out_both]"
              style={{ animationDelay: `${i * 0.05}s` }}
            >
              <div className="text-[32px] mb-3">{f.icon}</div>
              <h3 className="text-lg font-extrabold mb-2">{f.title}</h3>
              <p className="text-white/60 text-[13px] leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Testimonials (آراء العملاء) ───────────────────────────────── */}
      <section className="py-20 px-[5%] relative z-[5]">
        <div className="text-center mb-10">
          <h2 className="text-[clamp(28px,4vw,40px)] font-black mb-3 landing-section-title">
            يثقون بنا
          </h2>
          <p className="text-white/60 text-base">
            آراء عملائنا (بيانات تجريبية — ستُحدّث بآراء عملاء حقيقيين)
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 max-w-[1100px] mx-auto">
          {testimonials.map((t: any, i: number) => (
            <div key={i} className="p-6 rounded-2xl landing-card">
              <div className="text-sm mb-3">{Array(t.rating).fill("⭐").join("")}</div>
              <p className="text-[13px] text-white/80 leading-relaxed mb-4">&ldquo;{t.quote}&rdquo;</p>
              <div className="text-[13px] font-bold">{t.name}</div>
              <div className="text-[11px] text-white/50">{t.type}</div>
              <div className="text-[9px] text-white/30 mt-1">عميل تجريبي</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── FAQ ───────────────────────────────────────────────────────── */}
      <section id="faq" className="py-20 px-[5%] relative z-[5]">
        <div className="text-center mb-10">
          <h2 className="text-[clamp(28px,4vw,40px)] font-black mb-3 landing-section-title">
            أسئلة شائعة
          </h2>
        </div>
        <div className="max-w-[760px] mx-auto flex flex-col gap-3">
          {faqItems.map((faq: any, i: number) => (
            <details key={i} className="p-4 px-5 rounded-lg landing-card cursor-pointer">
              <summary className="text-[15px] font-bold text-white outline-none">{faq.q}</summary>
              <p className="text-[13px] text-white/70 leading-relaxed mt-2.5">{faq.a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* ── Pricing ──────────────────────────────────────────────────── */}
      <section id="pricing" className="py-20 px-[5%] relative z-[5]">
        <div className="text-center mb-10">
          <h2 className="text-[clamp(28px,4vw,44px)] font-black mb-3 landing-section-title">
            باقات تناسب نموّ أعمالك
          </h2>
          <p className="text-white/60 text-base">
            ابدأ مجاناً وارتقِ حسب احتياجك — بدون رسوم خفية
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 max-w-[1100px] mx-auto">
          {planKeys.map((key) => {
            const plan = DEFAULT_PLANS[key];
            const isHighlight = plan.highlight;
            return (
              <div
                key={key}
                className={cn(
                  "p-7 px-6 rounded-[18px] relative transition-all",
                  isHighlight
                    ? "bg-[linear-gradient(180deg,rgba(124,58,237,0.25),rgba(167,139,250,0.1))] border-2 border-[#7c3aed]"
                    : "bg-white/[0.04] border border-white/[0.08]"
                )}
              >
                {isHighlight && (
                  <div className="absolute -top-3 start-1/2 -translate-x-1/2 bg-[linear-gradient(135deg,#7c3aed,#a78bfa)] text-white px-3.5 py-1 rounded-[12px] text-[11px] font-extrabold whitespace-nowrap">
                    الأكثر شعبية
                  </div>
                )}
                <div className="text-lg font-extrabold mb-2">{plan.name}</div>
                <div className="flex items-baseline gap-1.5 mb-4">
                  <span className="text-4xl font-black">
                    {plan.priceMonthly === 0 ? "مجاناً" : `${plan.currency}${plan.priceMonthly}`}
                  </span>
                  {plan.priceMonthly > 0 && (
                    <span className="text-white/50 text-[13px]">{plan.billingPeriod}</span>
                  )}
                </div>
                <ul className="list-none p-0 m-0 mb-5 text-[13px] text-white/75">
                  {plan.featureBullets?.map((b, i) => (
                    <li key={i} className="py-1.5 flex items-start gap-2">
                      <span className="text-[#a78bfa]">✓</span>
                      <span>{b}</span>
                    </li>
                  ))}
                </ul>
                <button
                  onClick={onRegister}
                  className={cn(
                    "w-full p-3 rounded-md text-white border-none font-bold text-sm cursor-pointer transition-all max-md:min-h-[44px]",
                    isHighlight
                      ? "bg-[linear-gradient(135deg,#7c3aed,#a78bfa)]"
                      : "bg-white/10"
                  )}
                >
                  {plan.priceMonthly === 0 ? "ابدأ الآن" : "اختر الباقة"}
                </button>
              </div>
            );
          })}
        </div>
      </section>

      {/* ── CTA ──────────────────────────────────────────────────────── */}
      <section className="py-20 px-[5%] relative z-[5]">
        <div className="max-w-[900px] mx-auto p-10 md:p-[60px] md:px-10 rounded-3xl bg-[linear-gradient(135deg,rgba(124,58,237,0.2),rgba(167,139,250,0.05))] border border-[rgba(124,58,237,0.3)] text-center">
          <h2 className="text-[clamp(28px,4vw,40px)] font-black mb-4 landing-section-title">
            جاهز لتحويل أعمالك؟
          </h2>
          <p className="text-white/70 text-base mb-8 max-w-[540px] mx-auto">
            انضم لمئات الشركات التي تدير أعمالها بكفاءة مع GARFIX. ابدأ تجربتك المجانية اليوم — لا حاجة لبطاقة ائتمان.
          </p>
          <button
            onClick={onRegister}
            className="bg-[linear-gradient(135deg,#7c3aed,#a78bfa)] text-white border-none rounded-lg px-10 py-4 text-base font-extrabold cursor-pointer transition-all shadow-[0_12px_36px_rgba(124,58,237,0.5)] inline-flex items-center gap-2.5 max-md:min-h-[44px]"
          >
            <Zap size={18} />
            ابدأ الآن مجاناً
          </button>
        </div>
      </section>

      {/* ── Footer ───────────────────────────────────────────────────── */}
      <ProfessionalFooter variant="landing" version={process.env.NEXT_PUBLIC_APP_VERSION || '12'} />
    </div>
  );
}

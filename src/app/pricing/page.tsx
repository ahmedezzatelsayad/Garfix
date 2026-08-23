"use client";

/**
 * /pricing — Commercial Model v2: منتجان فقط.
 *
 * 1) GarfiX Invoicing — $10/شهر: كل شيء مفتوح (فواتير/عملاء/منتجات بلا حدود)
 * 2) AI Company Agent — $20/شهر/شركة: وكيل ذكي يتعلم شركتك (منتج Upsell مستقل)
 *
 * الأسعار محوّلة تلقائيًا لعملة الزائر حسب بلد الشركة المعروضة.
 */

import { useState } from "react";
import Link from "next/link";
import { Check, X, Star, ArrowLeft, ChevronDown, Bot, Zap } from "lucide-react";
import { PublicSiteHeader } from "@/components/site/PublicSiteHeader";
import { ProfessionalFooter } from "@/components/garfix/ProfessionalFooter";
import { cn } from "@/lib/utils";
import { COMMERCIAL_PLANS, planPriceIn, COUNTRY_CURRENCY, USD_FX } from "@/lib/billing/pricing";

const COMPARISON_FEATURES = [
  { featureAr: "واجهة عربية أصيلة (RTL)", garfix: true, odoo: "جزئي", zoho: false, freshbooks: false },
  { featureAr: "فوترة إلكترونية ZATCA/ETA", garfix: true, odoo: false, zoho: false, freshbooks: false },
  { featureAr: "مساعد ذكاء اصطناعي مدمج", garfix: true, odoo: false, zoho: false, freshbooks: false },
  { featureAr: "متعدد الشركات (Multi-tenant)", garfix: true, odoo: true, zoho: false, freshbooks: false },
  { featureAr: "تطبيق PWA (يعمل بدون اتصال)", garfix: true, odoo: false, zoho: false, freshbooks: false },
  { featureAr: "تسعير واحد بسيط بدون تدرجات", garfix: true, odoo: false, zoho: false, freshbooks: false },
  { featureAr: "دعم بالعربية", garfix: true, odoo: false, zoho: false, freshbooks: false },
];

const FAQ_ITEMS = [
  { q: "هل أحتاج بطاقة ائتمان للتجربة المجانية؟", a: "لا، التجربة المجانية ٣٠ يوماً لا تتطلب بطاقة ائتمان. سجّل ببريدك وابدأ فوراً." },
  { q: "هل الأسعار موحدة بكل العملات؟", a: "نعم — نفس قيمة الاشتراك تُحوَّل تلقائياً لعملة بلدك (ريال، جنيه، دينار...) بدون رسوم تحويل إضافية." },
  { q: "ما الفرق بين الاشتراك الأساسي والوكيل الذكي؟", a: "الأساسي ($10) يشمل الفواتير الكاملة. الوكيل الذكي ($20 إضافة) موظف AI يتعلم بيانات شركتك ويرد على عملائك على واتساب ويُنشئ الطلبات تلقائياً — يُشترى منفرداً إن أردت." },
  { q: "هل بياناتي آمنة؟", a: "نعم، تشفير AES-256 لكل البيانات الحساسة، وعزل كامل بين الشركات على مستوى قاعدة البيانات، ونسخ احتياطية يومية." },
  { q: "هل أستطيع الإلغاء في أي وقت؟", a: "نعم، إلغاء فوري من لوحة التحكم بدون التزام. بياناتك تبقى متاحة للتصدير ٩٠ يوماً." },
  { q: "هل يعمل على الموبايل؟", a: "نعم، GarfiX يعمل كتطبيق PWA — ثبّته على موبايلك ويعمل كتطبيق أصلي مع دعم العمل دون اتصال." },
];

function Cell({ value }: { value: boolean | string }) {
  if (value === true) return <span className="text-emerald-500 dark:text-emerald-400 inline-flex justify-center w-full"><Check size={16} /></span>;
  if (value === false) return <span className="text-muted-foreground/40 inline-flex justify-center w-full"><X size={16} /></span>;
  return <span className="text-[11px] text-muted-foreground font-semibold">{value}</span>;
}

/** SEO: أسئلة شائعة بصيغة JSON-LD — تؤهل الصفحة لـ rich results في البحث. */
function FaqJsonLd() {
  const faq = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQ_ITEMS.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faq) }} />;
}

export default function PricingPage() {
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  // محوّل عملة تفاعلي — الزائر يرى السعر بعملته فورًا
  const [currency, setCurrency] = useState("SAR");
  const currencies = Object.keys(COUNTRY_CURRENCY).filter(k => k !== "DEFAULT");
  const inv = planPriceIn("invoicing", currency);
  const agent = planPriceIn("ai_agent", currency);

  return (
    <div dir="rtl" className="min-h-dvh bg-background text-foreground">
      <FaqJsonLd />
      <PublicSiteHeader />

      {/* Hero */}
      <section className="relative overflow-hidden py-16 md:py-20 px-[5%] text-center">
        <div className="fixed inset-0 bg-[radial-gradient(ellipse_at_top,rgba(4,120,87,0.07),transparent_55%)] dark:bg-[radial-gradient(ellipse_at_top,rgba(4,120,87,0.14),transparent_55%)] pointer-events-none" />
        <div className="relative max-w-[720px] mx-auto">
          <h1 className="text-[clamp(28px,5vw,46px)] font-black mb-4 leading-tight">
            سعر واحد.
            <span className="landing-section-title"> كل شيء مفتوح.</span>
          </h1>
          <p className="text-muted-foreground text-base md:text-lg leading-relaxed mb-6">
            لا تدرجات، لا رسوم على كل فاتورة، لا مفاجآت — اشتراك واحد يشمل كل ما تحتاجه لإدارة فواتير شركتك.
          </p>

          {/* Currency picker */}
          <div className="inline-flex items-center gap-2 text-sm mb-2">
            <span className="text-muted-foreground text-xs">العرض بعملة:</span>
            <select
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              className="bg-card border border-border rounded-lg px-3 py-1.5 text-[13px] font-bold cursor-pointer"
              aria-label="عملة العرض"
            >
              {Object.values(USD_FX).length > 0 && [...new Set(Object.values(COUNTRY_CURRENCY))].filter(Boolean).map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
        </div>
      </section>

      {/* The two products */}
      <section className="px-[5%] pb-14 max-w-[1000px] mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-stretch">

          {/* ① Invoicing $10 */}
          <div className="pricing-highlight rounded-3xl p-8 flex flex-col relative z-10">
            <div className="flex items-center justify-between mb-3">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#d4a574]/15 border border-[#d4a574]/30 text-[#b8845c] dark:text-[#e8c49a] text-[11px] font-extrabold">
                <Zap size={12} /> المنتج الأساسي
              </span>
            </div>
            <h2 className="text-2xl font-black text-foreground mb-1">جارفيكس للفواتير</h2>
            <p className="text-sm text-muted-foreground mb-6">GarfiX Invoicing — نقطة الدخول لشركتك</p>

            <div className="mb-1">
              <span className="text-[52px] font-black text-foreground leading-none">{inv.price.toLocaleString("ar-EG")}</span>
              <span className="text-lg font-bold text-muted-foreground"> {inv.currency}</span>
            </div>
            <div className="text-xs text-muted-foreground mb-7">
              شهريًا — {inv.approx ? "ما يعادل 10$" : "10$"} • تشمل كل الضرائب
            </div>

            <ul className="list-none p-0 m-0 flex flex-col gap-3 flex-1">
              {COMMERCIAL_PLANS.invoicing.featureBullets.map((f) => (
                <li key={f} className="flex items-start gap-2.5 text-[14px] text-foreground/90">
                  <span className="text-emerald-500 dark:text-emerald-400 mt-0.5 shrink-0"><Check size={16} /></span>
                  {f}
                </li>
              ))}
            </ul>

            <Link
              href="/signup"
              className="cta-shine mt-8 inline-flex items-center justify-center gap-2 rounded-xl px-8 py-3.5 text-[14px] font-extrabold no-underline active-press bg-[linear-gradient(135deg,#047857,#10b981)] text-white shadow-[0_10px_28px_rgba(4,120,87,0.4)]"
            >
              ابدأ الآن — ٣٠ يومًا مجانًا <ArrowLeft size={16} />
            </Link>
          </div>

          {/* ② AI Agent $20 */}
          <div className="landing-card rounded-3xl p-8 flex flex-col">
            <div className="flex items-center justify-between mb-3">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/12 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 text-[11px] font-extrabold">
                <Bot size={12} /> إضافة اختيارية — تُشترى منفردًا
              </span>
            </div>
            <h2 className="text-2xl font-black text-foreground mb-1">الوكيل الذكي للشركة</h2>
            <p className="text-sm text-muted-foreground mb-6">AI Company Agent — موظف ذكي يعمل ٢٤/٧</p>

            <div className="mb-1">
              <span className="text-[52px] font-black text-foreground leading-none">{agent.price.toLocaleString("ar-EG")}</span>
              <span className="text-lg font-bold text-muted-foreground"> {agent.currency}</span>
            </div>
            <div className="text-xs text-muted-foreground mb-7">
              شهريًا لكل شركة — {agent.approx ? "ما يعادل 20$" : "20$"}
            </div>

            <ul className="list-none p-0 m-0 flex flex-col gap-3 flex-1">
              {COMMERCIAL_PLANS.ai_agent.featureBullets.map((f) => (
                <li key={f} className="flex items-start gap-2.5 text-[14px] text-foreground/90">
                  <span className="text-emerald-500 dark:text-emerald-400 mt-0.5 shrink-0"><Check size={16} /></span>
                  {f}
                </li>
              ))}
            </ul>

            <Link
              href="/signup"
              className="mt-8 inline-flex items-center justify-center gap-2 rounded-xl px-8 py-3.5 text-[14px] font-extrabold no-underline active-press bg-muted text-foreground border border-border hover:bg-accent transition-colors"
            >
              أضف الوكيل لشركتك <ArrowLeft size={16} />
            </Link>
          </div>
        </div>
      </section>

      {/* Comparison */}
      <section className="px-[5%] pb-14 max-w-[1000px] mx-auto">
        <h2 className="text-xl md:text-2xl font-black text-center mb-2">كيف نقارن بالبدائل؟</h2>
        <p className="text-center text-muted-foreground text-sm mb-8">مقارنة موضوعية بأبرز القدرات التي تهم الشركات العربية</p>
        <div className="landing-card rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-[13px] min-w-[560px]">
              <thead>
                <tr className="border-b border-border bg-muted/60">
                  <th className="py-3.5 px-4 text-start font-extrabold text-foreground">الميزة</th>
                  <th className="py-3.5 px-3 font-extrabold text-emerald-600 dark:text-emerald-400 comparison-garfix">GARFIX</th>
                  <th className="py-3.5 px-3 font-extrabold text-muted-foreground">Odoo</th>
                  <th className="py-3.5 px-3 font-extrabold text-muted-foreground">Zoho</th>
                  <th className="py-3.5 px-3 font-extrabold text-muted-foreground">FreshBooks</th>
                </tr>
              </thead>
              <tbody>
                {COMPARISON_FEATURES.map((row, i) => (
                  <tr key={row.featureAr} className={cn("border-b border-border/60", i % 2 === 0 && "bg-muted/25")}>
                    <td className="py-3 px-4 font-semibold text-foreground/90">{row.featureAr}</td>
                    <td className="py-3 px-3 text-center comparison-garfix"><Cell value={row.garfix} /></td>
                    <td className="py-3 px-3 text-center"><Cell value={row.odoo} /></td>
                    <td className="py-3 px-3 text-center"><Cell value={row.zoho} /></td>
                    <td className="py-3 px-3 text-center"><Cell value={row.freshbooks} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="px-[5%] pb-16 max-w-[760px] mx-auto">
        <h2 className="text-xl md:text-2xl font-black text-center mb-8">الأسئلة الشائعة</h2>
        <div className="flex flex-col gap-3">
          {FAQ_ITEMS.map((item, i) => (
            <div key={item.q} className="landing-card rounded-xl overflow-hidden">
              <button
                type="button"
                onClick={() => setOpenFaq(openFaq === i ? null : i)}
                className="w-full flex items-center justify-between gap-3 p-4 bg-transparent border-none cursor-pointer text-right"
                aria-expanded={openFaq === i}
              >
                <span className="text-[14px] font-extrabold text-foreground">{item.q}</span>
                <ChevronDown
                  size={17}
                  className={cn("text-emerald-500 dark:text-emerald-400 shrink-0 transition-transform duration-200", openFaq === i && "rotate-180")}
                />
              </button>
              {openFaq === i && (
                <div className="px-4 pb-4 text-[13px] text-muted-foreground leading-relaxed">{item.a}</div>
              )}
            </div>
          ))}
        </div>

        <div className="mt-10 rounded-2xl bg-[linear-gradient(135deg,rgba(4,120,87,0.12),rgba(16,185,129,0.07))] dark:bg-[linear-gradient(135deg,rgba(4,120,87,0.28),rgba(16,185,129,0.12))] border border-emerald-500/25 p-8 text-center">
          <h3 className="text-lg font-black mb-2 text-foreground">جاهز تبدأ؟</h3>
          <p className="text-muted-foreground text-sm mb-5">٣٠ يومًا مجانًا — بدون بطاقة ائتمان، وبإلغاء فوري في أي وقت.</p>
          <div className="flex flex-wrap justify-center gap-3">
            <Link href="/signup" className="inline-flex items-center gap-2 bg-[linear-gradient(135deg,#047857,#10b981)] text-white border-none rounded-lg px-6 py-3 text-[13px] font-extrabold no-underline active-press">
              أنشئ حسابك مجانًا <ArrowLeft size={15} />
            </Link>
            <Link href="/features" className="inline-flex items-center gap-2 bg-transparent text-foreground border border-border rounded-lg px-6 py-3 text-[13px] font-bold no-underline hover:bg-muted">
              استعرض كل المميزات
            </Link>
          </div>
        </div>
      </section>

      <ProfessionalFooter variant="landing" />
    </div>
  );
}

"use client";

/**
 * /pricing — صفحة الأسعار (موقع خارجي متعدد الصفحات).
 *
 * انتقلت إليها أقسام الباقات والمقارنة والأسئلة الشائعة من الصفحة
 * الرئيسية القديمة (كانت Landing Page واحدة تضم كل شيء).
 */

import { useState } from "react";
import Link from "next/link";
import { Check, X, Star, ArrowLeft, ChevronDown } from "lucide-react";
import { PublicSiteHeader } from "@/components/site/PublicSiteHeader";
import { ProfessionalFooter } from "@/components/garfix/ProfessionalFooter";
import { cn } from "@/lib/utils";
// مصدر حقيقة واحد للأسعار: نفس ملف الفوترة الفعلي — كانت الصفحة تعرض
// 99/299/799 بينما النظام يحاسب فعليًا بأسعار مختلفة ومفاتيح باقات أخرى.
import { COUNTRY_PRICES, COUNTRY_CURRENCY } from "@/lib/billing/pricing";

/** الدولة المعروضة افتراضياً في التسويق — السوق الأكبر. */
const MARKETING_COUNTRY = "SA";
const SA_PRICES = COUNTRY_PRICES[MARKETING_COUNTRY];
const SA_CURRENCY = COUNTRY_CURRENCY[MARKETING_COUNTRY];

const PRICING_TIERS = [
  {
    key: "starter",
    name: "Starter",
    nameAr: "المبتدئة",
    price: SA_PRICES.starter,
    currency: SA_CURRENCY,
    periodAr: "شهرياً",
    highlight: false,
    badge: null as string | null,
    descAr: "للمؤسسات الناشئة والنشاطات الفردية",
    features: [
      "مستخدم واحد",
      "حتى ٥٠ فاتورة شهرياً",
      "إدارة عملاء أساسية",
      "كتالوج منتجات",
      "تقارير بسيطة",
      "دعم بالبريد الإلكتروني",
    ],
  },
  {
    key: "professional",
    name: "Professional",
    nameAr: "النمو",
    price: SA_PRICES.professional,
    currency: SA_CURRENCY,
    periodAr: "شهرياً",
    highlight: true,
    badge: "الأكثر شعبية",
    descAr: "للشركات النامية التي تحتاج الذكاء والتكامل",
    features: [
      "حتى ١٠ مستخدمين",
      "فواتير غير محدودة",
      "مساعد ذكاء اصطناعي + إدخال مجمع",
      "المحاسبة الكاملة والقيود التلقائية",
      "فوترة إلكترونية (ZATCA/ETA)",
      "مخزون ومستودعات متعددة",
      "تقارير متقدمة + رسوم بيانية",
      "دعم ذو أولوية بالواتساب",
    ],
  },
  {
    key: "unlimited",
    name: "Unlimited",
    nameAr: "المؤسسات",
    price: SA_PRICES.unlimited,
    currency: SA_CURRENCY,
    periodAr: "شهرياً",
    highlight: false,
    badge: null as string | null,
    descAr: "للمجموعات والمؤسسات متعددة الفروع",
    features: [
      "مستخدمون غير محدودين",
      "كل ميزات النمو",
      "شركات متعددة بتقارير موحدة",
      "API مخصص + Webhooks",
      "موارد بشرية ورواتب كاملة",
      "مدير حساب مخصص",
      "تدريب فريق العمل",
      "SLA 99.9% مضمون",
    ],
  },
];

const COMPARISON_FEATURES = [
  { featureAr: "واجهة عربية أصيلة (RTL)", garfix: true, odoo: "جزئي", zoho: false, freshbooks: false },
  { featureAr: "فوترة إلكترونية ZATCA/ETA", garfix: true, odoo: false, zoho: false, freshbooks: false },
  { featureAr: "مساعد ذكاء اصطناعي مدمج", garfix: true, odoo: false, zoho: false, freshbooks: false },
  { featureAr: "متعدد الشركات (Multi-tenant)", garfix: true, odoo: true, zoho: false, freshbooks: false },
  { featureAr: "تطبيق PWA (يعمل بدون اتصال)", garfix: true, odoo: false, zoho: false, freshbooks: false },
  { featureAr: "تسعير بالريال السعودي", garfix: true, odoo: false, zoho: true, freshbooks: false },
  { featureAr: "دعم بالعربية", garfix: true, odoo: false, zoho: false, freshbooks: false },
];

const FAQ_ITEMS = [
  { q: "هل أحتاج بطاقة ائتمان للتجربة المجانية؟", a: "لا، التجربة المجانية ٣٠ يوماً لا تتطلب بطاقة ائتمان. سجّل ببريدك وابدأ فوراً." },
  { q: "هل بياناتي آمنة؟", a: "نعم، نستخدم تشفير AES-256 لجميع البيانات الحساسة، ونسخاً احتياطية يومية، وعزلاً كاملاً بين الشركات على مستوى قاعدة البيانات." },
  { q: "هل يدعم الفوترة الإلكترونية في بلدي؟", a: "ندعم ZATCA (السعودية)، ETA (مصر)، FTA (الإمارات)، NBR (البحرين)، وهيئة الضرائب العمانية، ومتطلبات المرسوم الكويتي 10/2026." },
  { q: "هل يمكنني الترقية أو التخفيض لاحقاً؟", a: "نعم، يمكنك تغيير باقتك في أي وقت من لوحة الإعدادات. الفرق يُحتسب تلقائياً." },
  { q: "هل يعمل على الموبايل؟", a: "نعم، GarfiX يعمل كتطبيق PWA — ثبّته على موبايلك ويعمل كتطبيق أصلي مع إشعارات ودعم العمل دون اتصال." },
  { q: "ماذا يحدث لبياناتي لو ألغيت؟", a: "تبقى بياناتك متاحة للتصدير ٩٠ يوماً بعد الإلغاء، ثم تُحذف نهائياً وفق سياسة الاحتفاظ." },
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
  const [billingPeriod, setBillingPeriod] = useState<"monthly" | "yearly">("monthly");
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  return (
    <div dir="rtl" className="min-h-dvh bg-background text-foreground">
      <FaqJsonLd />
      <PublicSiteHeader />

      {/* Hero */}
      <section className="relative overflow-hidden py-16 md:py-20 px-[5%] text-center">
        <div className="fixed inset-0 bg-[radial-gradient(ellipse_at_top,rgba(4,120,87,0.07),transparent_55%)] dark:bg-[radial-gradient(ellipse_at_top,rgba(4,120,87,0.14),transparent_55%)] pointer-events-none" />
        <div className="relative max-w-[720px] mx-auto">
          <h1 className="text-[clamp(28px,5vw,46px)] font-black mb-4 leading-tight">
            أسعار واضحة،<span className="landing-section-title"> بدون مفاجآت</span>
          </h1>
          <p className="text-muted-foreground text-base md:text-lg leading-relaxed mb-8">
            كل الباقات تشمل استضافة سحابية وتحديثات مستمرة ونسخاً احتياطياً يومياً.
            جرّب ٣٠ يوماً مجاناً — بدون بطاقة ائتمان.
          </p>

          {/* Billing toggle */}
          <div className="inline-flex items-center gap-1 bg-muted border border-border rounded-xl p-1">
            <button
              type="button"
              onClick={() => setBillingPeriod("monthly")}
              className={cn(
                "px-5 py-2 rounded-lg text-[13px] font-bold cursor-pointer border-none transition-all",
                billingPeriod === "monthly" ? "bg-card text-foreground shadow-sm" : "bg-transparent text-muted-foreground"
              )}
            >
              شهري
            </button>
            <button
              type="button"
              onClick={() => setBillingPeriod("yearly")}
              className={cn(
                "px-5 py-2 rounded-lg text-[13px] font-bold cursor-pointer border-none transition-all inline-flex items-center gap-2",
                billingPeriod === "yearly" ? "bg-card text-foreground shadow-sm" : "bg-transparent text-muted-foreground"
              )}
            >
              سنوي
              <span className="text-[10px] font-extrabold px-1.5 py-0.5 rounded-md bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/25">
                شهرين مجاناً
              </span>
            </button>
          </div>
        </div>
      </section>

      {/* Tiers */}
      <section className="px-[5%] pb-14 max-w-[1100px] mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 items-stretch">
          {PRICING_TIERS.map((tier) => {
            // نفس معادلة الخصم السنوي التي يحاسب بها نظام الدفع الفعلي (٢٠٪)
            const price = billingPeriod === "yearly" ? Math.round(tier.price * 12 * 0.8 * 100) / 100 : tier.price;
            return (
              <div
                key={tier.key}
                className={cn(
                  "rounded-2xl p-6 flex flex-col relative transition-transform duration-150",
                  tier.highlight
                    ? "pricing-highlight md:scale-[1.04] md:-translate-y-2 z-10"
                    : "landing-card"
                )}
              >
                {tier.badge && (
                  <span className="absolute -top-3 right-6 inline-flex items-center gap-1 px-3 py-1 rounded-full bg-[linear-gradient(135deg,#d4a574,#e8c49a)] text-[10.5px] font-extrabold text-[#3d2b16] shadow-sm">
                    <Star size={11} /> {tier.badge}
                  </span>
                )}
                <h2 className="text-lg font-black text-foreground">{tier.nameAr}</h2>
                <div className="text-[11px] text-muted-foreground font-semibold tracking-wide mb-4">{tier.name}</div>
                <div className="mb-1">
                  <span className="text-[34px] font-black text-foreground">{price}</span>
                  <span className="text-sm font-bold text-muted-foreground"> {tier.currency}</span>
                </div>
                <div className="text-[11.5px] text-muted-foreground mb-5">
                  {billingPeriod === "yearly" ? "سنوياً" : tier.periodAr}
                </div>
                <p className="text-[12.5px] text-muted-foreground leading-relaxed mb-5 pb-5 border-b border-border">
                  {tier.descAr}
                </p>
                <ul className="list-none p-0 m-0 flex flex-col gap-2.5 flex-1 mb-6">
                  {tier.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-[13px] text-foreground/90">
                      <span className="text-emerald-500 dark:text-emerald-400 mt-0.5 shrink-0"><Check size={15} /></span>
                      {f}
                    </li>
                  ))}
                </ul>
                <Link
                  href="/signup"
                  className={cn(
                    "inline-flex items-center justify-center gap-2 rounded-lg px-5 py-3 text-[13.5px] font-extrabold no-underline transition-all active-press",
                    tier.highlight
                      ? "bg-[linear-gradient(135deg,#047857,#10b981)] text-white shadow-[0_10px_28px_rgba(4,120,87,0.4)] hover:shadow-[0_14px_34px_rgba(4,120,87,0.5)]"
                      : "bg-muted text-foreground border border-border hover:bg-accent"
                  )}
                >
                  ابدأ التجربة المجانية <ArrowLeft size={15} />
                </Link>
              </div>
            );
          })}
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
                  className={cn(
                    "text-emerald-500 dark:text-emerald-400 shrink-0 transition-transform duration-200",
                    openFaq === i && "rotate-180"
                  )}
                />
              </button>
              {openFaq === i && (
                <div className="px-4 pb-4 text-[13px] text-muted-foreground leading-relaxed">
                  {item.a}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* CTA */}
        <div className="mt-10 rounded-2xl bg-[linear-gradient(135deg,rgba(4,120,87,0.12),rgba(16,185,129,0.07))] dark:bg-[linear-gradient(135deg,rgba(4,120,87,0.28),rgba(16,185,129,0.12))] border border-emerald-500/25 p-8 text-center">
          <h3 className="text-lg font-black mb-2 text-foreground">لسة عندك سؤال؟</h3>
          <p className="text-muted-foreground text-sm mb-5">فريقنا يرد خلال ٢٤ ساعة كحد أقصى</p>
          <div className="flex flex-wrap justify-center gap-3">
            <Link href="/contact" className="inline-flex items-center gap-2 bg-[linear-gradient(135deg,#047857,#10b981)] text-white border-none rounded-lg px-6 py-3 text-[13px] font-extrabold no-underline active-press">
              تواصل معنا <ArrowLeft size={15} />
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

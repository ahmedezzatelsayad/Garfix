/**
 * pricing.ts — Commercial Model v2: خطة واحدة بسيطة + إضافة AI Agent.
 *
 * الفلسفة التجارية (من خطة العمل المعتمدة):
 *   - "GarfiX Invoicing" $10/شهر: فواتير وعملاء ومنتجات بلا حدود — نقطة الدخول
 *     التي تكتسب بها الشركات. لا تدرجات ولا رسوم لكل فاتورة ولا تعقيد.
 *   - "AI Company Agent" $20/شهر/شركة: وكيل ذكي يتعلم بيانات الشركة
 *     (Knowledge Base + WhatsApp + أتمتة) — محرك الإيرادات الأكبر (Upsell).
 *   - العملة تُحوَّل تلقائيًا حسب بلد الشركة بأسعار صرف قابلة للتحديث.
 *
 * الأسعار الأساسية محفوظة بالدولار (عملة التسوية مع بوابات الدفع)،
 * والع converted prices تُستخدم للعرض فقط.
 */

export interface CountryPricingEntry {
  country: string;
  currency: string;
  plan: string;
  priceMonthly: number;
}

// ═══ Plans (Commercial v2) ═══

export type CommercialPlanKey = "invoicing" | "ai_agent";

export interface CommercialPlanDef {
  key: CommercialPlanKey;
  name: string;
  nameAr: string;
  /** السعر بالدولار — عملة التسوية */
  priceMonthlyUsd: number;
  /** ملاحظة تسويقية قصيرة */
  pitchAr: string;
  /** هل إضافة على الخطة الأساسية أم مستقلة */
  standalone: boolean;
  featureBullets: string[];
}

export const COMMERCIAL_PLANS: Record<CommercialPlanKey, CommercialPlanDef> = {
  invoicing: {
    key: "invoicing",
    name: "GarfiX Invoicing",
    nameAr: "جارفيكس للفواتير",
    priceMonthlyUsd: 10,
    pitchAr: "اشتراك واحد — كل شيء مفتوح",
    standalone: true,
    featureBullets: [
      "فواتير بلا حدود",
      "عملاء بلا حدود",
      "منتجات بلا حدود",
      "تقارير أساسية",
      "كل العملات — فوتر بأي عملة",
      "الضرائب والأسعار حسب إعدادات شركتك",
    ],
  },
  ai_agent: {
    key: "ai_agent",
    name: "AI Company Agent",
    nameAr: "الوكيل الذكي للشركة",
    priceMonthlyUsd: 20,
    pitchAr: "موظف ذكي يتعلم شركتك — يعمل ٢٤/٧",
    standalone: true,
    featureBullets: [
      "وكيل AI خاص بشركتك فقط",
      "Company Knowledge Base (ملفات وسياسات وكتالوج)",
      "واتساب: نص + صوت + صور",
      "إنشاء الطلبات تلقائيًا",
      "ذاكرة وتعلم مستمر من بياناتك",
      "تكامل ERP كامل",
    ],
  },
};

// ═══ FX: تحويل تلقائي لعملة بلد الشركة ═══

/**
 * أسعار تحويل استرشادية من الدولار (التسوية) لعملات الدول المدعومة.
 * القيم مدروسة لتكون "نفسية" لطيفة للعرض (تقريب لطيف لأرقام نظيفة)
 * وقابلة للتحديث لاحقًا من مزود أسعار صرف حي دون تغيير الكود المستهلك.
 */
export const USD_FX: Record<string, number> = {
  USD: 1,
  SAR: 37.5,   // ~3.75 ربط رسمي — نعرض بالريال
  EGP: 490,    // تقريب نفس العرضية
  KWD: 3.1,
  AED: 36.7,
  QAR: 36.4,
  BHD: 3.8,
  OMR: 3.85,
  JOD: 7.1,
  MAD: 98,
  TND: 31,
  DZD: 1340,
  IQD: 13100,
  LYD: 4.85,
  // fallback
};

/** عملة بلد الشركة الافتراضية. */
export const COUNTRY_CURRENCY: Record<string, string> = {
  KW: "KWD", SA: "SAR", AE: "AED", EG: "EGP", QA: "QAR", BH: "BHD",
  OM: "OMR", JO: "JOD", MA: "MAD", TN: "TND", DZ: "DZD", IQ: "IQD",
  LY: "LYD", DEFAULT: "USD",
};

/**
 * سعر خطة بعملة الشركة — تقريب نفسي للوحدة الأصغر (أرقام نظيفة للعرض).
 */
export function planPriceIn(
  plan: CommercialPlanKey,
  currency: string,
): { price: number; currency: string; approx: boolean } {
  const usd = COMMERCIAL_PLANS[plan].priceMonthlyUsd;
  const rate = USD_FX[currency] ?? USD_FX.USD;
  if (rate === 1) return { price: usd, currency: "USD", approx: false };
  const raw = usd * rate;
  // تقريب نفسي: لو > 100 → لأقرب 5؛ لو > 20 → لأقرب 1؛ غير ذلك → لأقرب 0.25
  const rounded =
    raw >= 100 ? Math.round(raw / 5) * 5 :
    raw >= 20 ? Math.round(raw) :
    Math.round(raw * 4) / 4;
  return { price: rounded, currency, approx: true };
}

/**
 * توافق خلفي: النظام القديم يمرر مفاتيح starter/professional/unlimited —
 * نُرجعها كلها لنفس قيمة الخطة الموحدة ($10) حتى لا ينكسر أي مسار دفع قائم،
 * مع الإشارة للنظام الجديد عبر metadata.
 */
export function getCountryPricing(country: string, plan: string): CountryPricingEntry | null {
  const currency = COUNTRY_CURRENCY[country.toUpperCase()] || COUNTRY_CURRENCY.DEFAULT;
  // التجريبي مجاني كما هو
  if (plan === "trial") {
    return { country: country.toUpperCase(), currency, plan, priceMonthly: 0 };
  }
  // كل الخطط المدفوعة القديمة = الخطة الموحدة الجديدة
  const usd = COMMERCIAL_PLANS.invoicing.priceMonthlyUsd;
  const rate = USD_FX[currency] ?? 1;
  const priceMonthly = rate === 1 ? usd : Math.round(usd * rate * 100) / 100;
  return {
    country: country.toUpperCase(),
    currency,
    plan,
    priceMonthly,
  };
}

export function getCountryPlanPrices(country: string): Record<string, number> {
  const currency = COUNTRY_CURRENCY[country.toUpperCase()] || COUNTRY_CURRENCY.DEFAULT;
  const rate = USD_FX[currency] ?? 1;
  const base = COMMERCIAL_PLANS.invoicing.priceMonthlyUsd;
  return {
    trial: 0,
    starter: base * rate,
    professional: base * rate,
    unlimited: base * rate,
    invoicing: base * rate,
    ai_agent: COMMERCIAL_PLANS.ai_agent.priceMonthlyUsd * rate,
  };
}

// ── compat exports (المستهلكون القدامى يستوردون هذه مباشرة) ──

/** توافق خلفي: عملة كل بلد (كانت تصدر من هنا قبل v2) */
export const COUNTRY_CURRENCY_V2 = COUNTRY_CURRENCY;

/**
 * توافق خلفي: أسعار قديمة الشكل لكن بقيم النموذج الموحد الجديد —
 * كل خطة مدفوعة = 10$ محوّلة لعملة البلد.
 */
export const COUNTRY_PRICES: Record<string, Record<string, number>> = Object.fromEntries(
  Object.entries(COUNTRY_CURRENCY).map(([country, currency]) => {
    const rate = USD_FX[currency] ?? 1;
    const base = COMMERCIAL_PLANS.invoicing.priceMonthlyUsd * rate;
    return [country, {
      starter: Math.round(base * 100) / 100,
      professional: Math.round(base * 100) / 100,
      unlimited: Math.round(base * 100) / 100,
    }];
  }),
);

/**
 * plans.ts — Default plan catalog (ported from v10)
 * These are the seed source and runtime fallback. Live editable catalog
 * lives in the platform_settings table under the `plans.catalog` key.
 */

export interface PlanDef {
  name: string;
  priceMonthly: number;
  maxInvoicesPerMonth: number;
  maxCompanies: number;
  maxUsers: number;
  trialDays: number;
  maxAiMessagesPerTrial?: number;
  currency?: string;
  billingPeriod?: string;
  featureBullets?: string[];
  highlight?: boolean;
}

export type PlanCatalog = Record<string, PlanDef>;

export const DEFAULT_PLANS: PlanCatalog = {
  trial: {
    name: "تجريبي",
    priceMonthly: 0,
    // TRIAL v2: تجربة حقيقية محدودة — 7 أيام / 100 فاتورة / 20 رسالة AI
    // (كانت 999,999 فاتورة = بلا حدود فعلية — لا قيمة تجريبية ولا حماية تكلفة)
    maxInvoicesPerMonth: 100,
    maxAiMessagesPerTrial: 20,
    maxCompanies: 1,
    maxUsers: 3,
    trialDays: 7,
    currency: "$",
    billingPeriod: "مجاناً",
    featureBullets: ["٧ أيام كاملة", "١٠٠ فاتورة", "٢٠ رسالة للمساعد الذكي", "كل طرق الإدخال (يدوي/صورة/ملف/مجمع)"],
    highlight: false,
  },
  starter: {
    name: "Invoicing",
    priceMonthly: 10,
    maxInvoicesPerMonth: -1, // Commercial v2: unlimited
    maxCompanies: 3,
    maxUsers: 10,
    trialDays: 0,
    currency: "$",
    billingPeriod: "شهرياً",
    featureBullets: [
      "فواتير بلا حدود",
      "عملاء ومنتجات بلا حدود",
      "كل العملات والضرائب",
    ],
    highlight: true,
  },
  // Commercial v2: professional/unlimited مجرد أسماء قديمة لنفس الخطة الموحدة
  // (توافق خلفي لمسارات الدفع القائمة — كلها $10 الآن)
  professional: {
    name: "Invoicing",
    priceMonthly: 10,
    maxInvoicesPerMonth: -1,
    maxCompanies: 10,
    maxUsers: 30,
    trialDays: 0,
    currency: "$",
    billingPeriod: "شهرياً",
    featureBullets: ["نفس الخطة الموحدة — 10$ شهرياً"],
    highlight: false,
  },
  unlimited: {
    name: "Invoicing",
    priceMonthly: 10,
    maxInvoicesPerMonth: -1,
    maxCompanies: -1,
    maxUsers: -1,
    trialDays: 0,
    currency: "$",
    billingPeriod: "شهرياً",
    featureBullets: [
      "شركات غير محدودة",
      "مستخدمون بلا حدود",
      "فواتير بلا حدود",
      "كل مزايا الذكاء الاصطناعي",
      "دعم مخصّص",
    ],
    highlight: false,
  },
};

export type PlanKey = keyof typeof DEFAULT_PLANS;

export const PLANS = DEFAULT_PLANS;

export function getPlan(key: string): PlanDef | undefined {
  return DEFAULT_PLANS[key] ?? undefined;
}

export function isPlanKey(key: string): key is PlanKey {
  return key in DEFAULT_PLANS;
}

export const PLAN_KEYS = Object.keys(DEFAULT_PLANS) as PlanKey[];

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
    maxInvoicesPerMonth: 999999,
    maxCompanies: 1,
    maxUsers: 3,
    trialDays: 30,
    currency: "$",
    billingPeriod: "مجاناً",
    featureBullets: ["كل المزايا الأساسية", "حتى ٣ مستخدمين", "٣٠ يوماً تجربة مجانية"],
    highlight: false,
  },
  starter: {
    name: "Starter",
    priceMonthly: 9.99,
    maxInvoicesPerMonth: 10000,
    maxCompanies: 3,
    maxUsers: 10,
    trialDays: 0,
    currency: "$",
    billingPeriod: "شهرياً",
    featureBullets: ["حتى ٣ شركات", "حتى ١٠ مستخدمين", "١٠٬٠٠٠ فاتورة شهرياً", "دعم عبر البريد"],
    highlight: false,
  },
  professional: {
    name: "Professional",
    priceMonthly: 19.99,
    maxInvoicesPerMonth: 30000,
    maxCompanies: 10,
    maxUsers: 30,
    trialDays: 0,
    currency: "$",
    billingPeriod: "شهرياً",
    featureBullets: [
      "حتى ١٠ شركات",
      "حتى ٣٠ مستخدماً",
      "٣٠٬٠٠٠ فاتورة شهرياً",
      "مساعد الذكاء الاصطناعي",
      "دعم ذو أولوية",
    ],
    highlight: true,
  },
  unlimited: {
    name: "Unlimited",
    priceMonthly: 29.99,
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

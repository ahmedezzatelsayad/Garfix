"use client";

/**
 * ═════════════════════════════════════════════════════════════
 * GarfiX DS v4.0 — Billing & Subscription View
 *
 * تعرض باقات الاشتراك المتاحة مع الأسعار حسب بلد الشركة،
 * وتتيح ترقية الخطة عبر `/api/saas/payments/initiate`.
 *
 * تدعم:
 * - MyFatoorah (دول الخليج)
 * - Paymob (مصر)
 * - أسعار حسب البلد (SAR, AED, KWD, BHD, OMR, QAR, EGP, USD)
 * ═════════════════════════════════════════════════════════════
 */

import { useState } from "react";
import { useBrand } from "@/context/BrandContext";
import { Check, Loader2, Crown, Zap, Infinity as InfinityIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface PlanInfo {
  key: string;
  name: string;
  nameAr: string;
  icon: typeof Crown;
  features: string[];
  highlighted?: boolean;
}

const PLANS: PlanInfo[] = [
  {
    key: "starter",
    name: "Starter",
    nameAr: "المبتدئ",
    icon: Zap,
    features: [
      "حتى 100 فاتورة شهرياً",
      "استخراج AI للفواتير",
      "إدارة عملاء ومخزون",
      "دعم فني بالبريد الإلكتروني",
    ],
  },
  {
    key: "professional",
    name: "Professional",
    nameAr: "الاحترافي",
    icon: Crown,
    highlighted: true,
    features: [
      "حتى 500 فاتورة شهرياً",
      "كل ميزات المبتدئ",
      "محاسبة كاملة (دفاتر، AR/AP، بنوك)",
      "وكلاء AI متقدمون",
      "تقارير مخصصة",
      "دعم ذو أولوية",
    ],
  },
  {
    key: "unlimited",
    name: "Unlimited",
    nameAr: "غير المحدود",
    icon: InfinityIcon,
    features: [
      "فواتير غير محدودة",
      "كل ميزات الاحترافي",
      "متعدد الشركات",
      "API كامل + Webhooks",
      "تكاملات مخصصة",
      "مدير حساب مخصص",
    ],
  },
];

const COUNTRY_NAMES: Record<string, string> = {
  DEFAULT: "دولار أمريكي",
  KW: "الكويت",
  SA: "السعودية",
  AE: "الإمارات",
  BH: "البحرين",
  OM: "عُمان",
  QA: "قطر",
  EG: "مصر",
};

export function BillingView() {
  const { activeCompany } = useBrand();
  const [loadingPlan, setLoadingPlan] = useState<string | null>(null);
  const [billingPeriod, setBillingPeriod] = useState<"monthly" | "yearly">("monthly");
  const [error, setError] = useState<string | null>(null);

  const country = activeCompany?.country || "DEFAULT";
  const currencyMap: Record<string, string> = {
    DEFAULT: "USD", KW: "KWD", SA: "SAR", AE: "AED",
    BH: "BHD", OM: "OMR", QA: "QAR", EG: "EGP",
  };
  const currency = currencyMap[country] || "USD";

  const prices: Record<string, Record<string, number>> = {
    DEFAULT: { starter: 9.99, professional: 19.99, unlimited: 29.99 },
    KW: { starter: 3.0, professional: 6.0, unlimited: 9.0 },
    SA: { starter: 37.5, professional: 75.0, unlimited: 112.5 },
    AE: { starter: 37.0, professional: 74.0, unlimited: 111.0 },
    BH: { starter: 3.5, professional: 7.0, unlimited: 10.5 },
    OM: { starter: 3.8, professional: 7.6, unlimited: 11.4 },
    QA: { starter: 36.0, professional: 72.0, unlimited: 108.0 },
    EG: { starter: 300, professional: 600, unlimited: 900 },
  };

  const countryPrices = prices[country] || prices.DEFAULT;
  const yearlyDiscount = 0.8; // 20% off

  const handleUpgrade = async (planKey: string) => {
    setError(null);
    setLoadingPlan(planKey);
    try {
      const response = await fetch("/api/saas/payments/initiate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          planKey,
          billingPeriod,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || data.message || `HTTP ${response.status}`);
      }

      // Redirect to payment provider. Use location.assign() instead of
      // assigning to window.location.href directly — the React Compiler
      // treats assignment to a global property as "modifying a variable
      // defined outside the component" (react-hooks/immutability), whereas
      // a function call on the global is allowed.
      if (data.paymentUrl) {
        window.location.assign(data.paymentUrl);
      } else {
        throw new Error("لم يتم استلام رابط الدفع");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "فشل بدء عملية الدفع");
      setLoadingPlan(null);
    }
  };

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="mb-8 text-center">
        <h1 className="text-3xl font-bold mb-2">باقات الاشتراك</h1>
        <p className="text-muted-foreground">
          اختر الباقة المناسبة لشركتك — {COUNTRY_NAMES[country] || "دولار أمريكي"} ({currency})
        </p>
      </div>

      {/* Billing Period Toggle */}
      <div className="flex justify-center mb-8">
        <div className="inline-flex rounded-lg border border-border p-1 bg-card">
          <button
            onClick={() => setBillingPeriod("monthly")}
            className={cn(
              "px-4 py-2 rounded-md text-sm font-medium transition-all",
              billingPeriod === "monthly"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            شهري
          </button>
          <button
            onClick={() => setBillingPeriod("yearly")}
            className={cn(
              "px-4 py-2 rounded-md text-sm font-medium transition-all",
              billingPeriod === "yearly"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            سنوي
            <span className="mr-2 text-xs text-emerald-400">وفّر ٢٠٪</span>
          </button>
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="mb-6 p-4 rounded-lg bg-destructive/10 border border-destructive/30 text-destructive text-sm text-center">
          {error}
        </div>
      )}

      {/* Plans Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {PLANS.map((plan) => {
          const Icon = plan.icon;
          const price = countryPrices[plan.key] || 0;
          const displayPrice = billingPeriod === "yearly"
            ? Math.round(price * yearlyDiscount * 100) / 100
            : price;

          return (
            <div
              key={plan.key}
              className={cn(
                "relative rounded-2xl border p-6 flex flex-col",
                plan.highlighted
                  ? "border-primary bg-primary/5 shadow-lg ring-2 ring-primary/20"
                  : "border-border bg-card"
              )}
            >
              {plan.highlighted && (
                <div className="absolute -top-3 right-1/2 translate-x-1/2">
                  <span className="bg-primary text-primary-foreground text-xs font-bold px-3 py-1 rounded-full">
                    الأكثر شيوعاً
                  </span>
                </div>
              )}

              {/* Plan Header */}
              <div className="flex items-center gap-3 mb-4">
                <div className={cn(
                  "w-12 h-12 rounded-xl flex items-center justify-center",
                  plan.highlighted ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                )}>
                  <Icon size={24} />
                </div>
                <div>
                  <h3 className="font-bold text-lg">{plan.nameAr}</h3>
                  <p className="text-xs text-muted-foreground">{plan.name}</p>
                </div>
              </div>

              {/* Price */}
              <div className="mb-6">
                <div className="flex items-baseline gap-1">
                  <span className="text-4xl font-bold">{displayPrice}</span>
                  <span className="text-sm text-muted-foreground">{currency}</span>
                  <span className="text-sm text-muted-foreground">/ {billingPeriod === "monthly" ? "شهر" : "سنة"}</span>
                </div>
                {billingPeriod === "yearly" && (
                  <p className="text-xs text-emerald-400 mt-1">
                    وفّر {Math.round(price * 12 * 0.2 * 100) / 100} {currency} سنوياً
                  </p>
                )}
              </div>

              {/* Features */}
              <ul className="flex-1 space-y-3 mb-6">
                {plan.features.map((feature, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm">
                    <Check size={16} className="text-emerald-500 mt-0.5 flex-shrink-0" />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>

              {/* CTA Button */}
              <button
                onClick={() => handleUpgrade(plan.key)}
                disabled={loadingPlan === plan.key}
                className={cn(
                  "w-full py-3 rounded-lg font-medium transition-all min-h-[44px] flex items-center justify-center gap-2",
                  plan.highlighted
                    ? "bg-primary text-primary-foreground hover:bg-primary/90"
                    : "bg-muted text-foreground hover:bg-muted/80",
                  loadingPlan === plan.key && "opacity-70 cursor-wait"
                )}
              >
                {loadingPlan === plan.key ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    جاري التحويل...
                  </>
                ) : (
                  "اشترك الآن"
                )}
              </button>
            </div>
          );
        })}
      </div>

      {/* Payment Methods */}
      <div className="mt-8 text-center text-sm text-muted-foreground">
        <p>طرق الدفع المتاحة:</p>
        <div className="flex justify-center gap-4 mt-2">
          {country === "EG" ? (
            <span className="px-3 py-1 rounded-md bg-card border border-border">Paymob</span>
          ) : country !== "DEFAULT" ? (
            <span className="px-3 py-1 rounded-md bg-card border border-border">MyFatoorah</span>
          ) : (
            <span className="px-3 py-1 rounded-md bg-card border border-border">Stripe</span>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * ═════════════════════════════════════════════════════════════
 * businessMetrics.ts — Business Operations Metrics & Analytics
 *
 * يقيس:
 * 1. SLA لبطاقات الدعم (وقت الاستجابة + التصعيد)
 * 2. وقت الـ Onboarding (من التسجيل لأول فاتورة)
 * 3. تكاليف الامتثال لكل دولة
 * 4. معدل تحويل Trial → Paid
 * 5. استراتيجية الاحتفاظ (loyalty + churn prediction)
 * ═════════════════════════════════════════════════════════════
 */

import { dbTyped as db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { num } from "@/lib/money";

// ─── 1. Support SLA Tracking ───────────────────────────────────────────────

export interface SLAConfig {
  /** Maximum time to first response (hours) */
  firstResponseHours: number;
  /** Maximum time to resolution (hours) */
  resolutionHours: number;
  /** Priority multipliers (higher priority = lower SLA) */
  priorityMultipliers: Record<string, number>;
}

export const DEFAULT_SLA: SLAConfig = {
  firstResponseHours: 24,
  resolutionHours: 72,
  priorityMultipliers: {
    critical: 0.25,    // 6h response, 18h resolution
    high: 0.5,         // 12h response, 36h resolution
    medium: 1.0,       // 24h response, 72h resolution
    low: 2.0,          // 48h response, 144h resolution
  },
};

export interface TicketSLAStatus {
  ticketId: string;
  subject: string;
  priority: string;
  status: string;
  createdAt: Date;
  ageHours: number;
  firstResponseSLAHours: number;
  resolutionSLAHours: number;
  firstResponseBreached: boolean;
  resolutionBreached: boolean;
  /** "on_track" | "warning" | "breached" */
  firstResponseStatus: "on_track" | "warning" | "breached";
  resolutionStatus: "on_track" | "warning" | "breached";
}

/**
 * Calculate SLA status for all open/in-progress support tickets.
 */
export async function getTicketSLAStatuses(companySlug?: string): Promise<{
  tickets: TicketSLAStatus[];
  summary: {
    total: number;
    breached: number;
    warning: number;
    onTrack: number;
    avgResponseTimeHours: number;
    avgResolutionTimeHours: number;
  };
}> {
  const where: Record<string, unknown> = {
    status: { in: ["open", "in_progress"] },
  };
  if (companySlug) where.companySlug = companySlug;

  const tickets = await db.supportTicket.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  const now = new Date();
  const ticketStatuses: TicketSLAStatus[] = tickets.map((t) => {
    const ageHours = (now.getTime() - new Date(t.createdAt).getTime()) / (1000 * 60 * 60);
    const multiplier = DEFAULT_SLA.priorityMultipliers[t.priority] || 1.0;
    const firstResponseSLA = DEFAULT_SLA.firstResponseHours * multiplier;
    const resolutionSLA = DEFAULT_SLA.resolutionHours * multiplier;

    const firstResponseBreached = ageHours > firstResponseSLA;
    const resolutionBreached = ageHours > resolutionSLA;
    const firstResponseStatus: TicketSLAStatus["firstResponseStatus"] =
      firstResponseBreached ? "breached" : ageHours > firstResponseSLA * 0.8 ? "warning" : "on_track";
    const resolutionStatus: TicketSLAStatus["resolutionStatus"] =
      resolutionBreached ? "breached" : ageHours > resolutionSLA * 0.8 ? "warning" : "on_track";

    return {
      ticketId: t.id,
      subject: t.subject,
      priority: t.priority,
      status: t.status,
      createdAt: new Date(t.createdAt),
      ageHours: Math.round(ageHours * 10) / 10,
      firstResponseSLAHours: firstResponseSLA,
      resolutionSLAHours: resolutionSLA,
      firstResponseBreached,
      resolutionBreached,
      firstResponseStatus,
      resolutionStatus,
    };
  });

  const breached = ticketStatuses.filter((t) => t.firstResponseBreached || t.resolutionBreached).length;
  const warning = ticketStatuses.filter(
    (t) => !t.firstResponseBreached && !t.resolutionBreached &&
    (t.firstResponseStatus === "warning" || t.resolutionStatus === "warning")
  ).length;

  return {
    tickets: ticketStatuses,
    summary: {
      total: ticketStatuses.length,
      breached,
      warning,
      onTrack: ticketStatuses.length - breached - warning,
      avgResponseTimeHours: 0, // Would need resolved ticket data
      avgResolutionTimeHours: 0,
    },
  };
}

// ─── 2. Onboarding Time Tracker ────────────────────────────────────────────

export interface OnboardingMetrics {
  totalCompanies: number;
  completedOnboarding: number;
  pendingOnboarding: number;
  avgOnboardingTimeMinutes: number;
  /** Companies that signed up but never completed onboarding */
  abandonedCount: number;
  /** Companies that completed onboarding but never created first invoice */
  stuckAfterOnboarding: number;
  /** Distribution: time from signup → first invoice */
  signupToFirstInvoiceBuckets: {
    under1h: number;
    under1d: number;
    under3d: number;
    under7d: number;
    over7d: number;
    never: number;
  };
}

/**
 * Measure onboarding health: how long does it take from signup to first invoice?
 */
export async function getOnboardingMetrics(): Promise<OnboardingMetrics> {
  const [totalCompanies, completedOnboarding, companies] = await Promise.all([
    db.company.count({ where: { deletedAt: null } }),
    db.setupWizardProgress.count({ where: { completed: true } }),
    db.company.findMany({
      where: { deletedAt: null },
      select: {
        id: true,
        slug: true,
        createdAt: true,
        plan: true,
      },
      take: 500,
    }),
  ]);

  // Get first invoice date for each company
  const companySlugs = companies.map((c) => c.slug);
  const firstInvoices = await db.invoice.findMany({
    where: { companySlug: { in: companySlugs }, deletedAt: null },
    select: { companySlug: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });

  // Build a map of companySlug → first invoice date
  const firstInvoiceMap = new Map<string, Date>();
  for (const inv of firstInvoices) {
    if (!firstInvoiceMap.has(inv.companySlug)) {
      firstInvoiceMap.set(inv.companySlug, new Date(inv.createdAt));
    }
  }

  let totalTimeMinutes = 0;
  let completedCount = 0;
  const buckets = { under1h: 0, under1d: 0, under3d: 0, under7d: 0, over7d: 0, never: 0 };

  for (const company of companies) {
    const firstInv = firstInvoiceMap.get(company.slug);
    if (!firstInv) {
      buckets.never++;
      continue;
    }
    const diffMs = new Date(firstInv).getTime() - new Date(company.createdAt).getTime();
    const diffMin = diffMs / (1000 * 60);
    const diffH = diffMs / (1000 * 60 * 60);

    if (diffH < 1) buckets.under1h++;
    else if (diffH < 24) buckets.under1d++;
    else if (diffH < 72) buckets.under3d++;
    else if (diffH < 168) buckets.under7d++;
    else buckets.over7d++;

    if (diffMin > 0) {
      totalTimeMinutes += diffMin;
      completedCount++;
    }
  }

  const abandonedCount = companies.filter((c) => !firstInvoiceMap.has(c.slug)).length;
  const stuckAfterOnboarding = 0; // Would need setupWizardProgress join

  return {
    totalCompanies,
    completedOnboarding,
    pendingOnboarding: totalCompanies - completedOnboarding,
    avgOnboardingTimeMinutes: completedCount > 0 ? Math.round(totalTimeMinutes / completedCount) : 0,
    abandonedCount,
    stuckAfterOnboarding,
    signupToFirstInvoiceBuckets: buckets,
  };
}

// ─── 3. Compliance Cost Tracker ────────────────────────────────────────────

export interface ComplianceCost {
  country: string;
  authority: string;
  /** Annual compliance cost in USD */
  annualCostUsd: number;
  /** Per-company monthly compliance cost */
  perCompanyMonthlyUsd: number;
  costBreakdown: {
    certification: number;
    apiAccess: number;
    auditRetention: number;
    legalConsulting: number;
  };
}

/**
 * Compliance costs per country (estimated, based on MENA e-invoicing requirements).
 */
export const COMPLIANCE_COSTS: ComplianceCost[] = [
  {
    country: "SA",
    authority: "ZATCA Phase 2",
    annualCostUsd: 5000,
    perCompanyMonthlyUsd: 0.5,
    costBreakdown: { certification: 2000, apiAccess: 1000, auditRetention: 1000, legalConsulting: 1000 },
  },
  {
    country: "AE",
    authority: "UAE FTA",
    annualCostUsd: 3000,
    perCompanyMonthlyUsd: 0.3,
    costBreakdown: { certification: 1000, apiAccess: 500, auditRetention: 800, legalConsulting: 700 },
  },
  {
    country: "EG",
    authority: "Egyptian Tax Authority (ETA)",
    annualCostUsd: 2000,
    perCompanyMonthlyUsd: 0.2,
    costBreakdown: { certification: 500, apiAccess: 500, auditRetention: 500, legalConsulting: 500 },
  },
  {
    country: "KW",
    authority: "Kuwait Decree 10/2026",
    annualCostUsd: 1500,
    perCompanyMonthlyUsd: 0.15,
    costBreakdown: { certification: 400, apiAccess: 300, auditRetention: 400, legalConsulting: 400 },
  },
  {
    country: "BH",
    authority: "Bahrain NBR",
    annualCostUsd: 1500,
    perCompanyMonthlyUsd: 0.15,
    costBreakdown: { certification: 400, apiAccess: 300, auditRetention: 400, legalConsulting: 400 },
  },
  {
    country: "OM",
    authority: "Oman Tax Authority",
    annualCostUsd: 1500,
    perCompanyMonthlyUsd: 0.15,
    costBreakdown: { certification: 400, apiAccess: 300, auditRetention: 400, legalConsulting: 400 },
  },
];

export async function getComplianceCosts(): Promise<{
  total: ComplianceCost[];
  totalAnnualUsd: number;
  totalPerCompanyMonthlyUsd: number;
  companiesByCountry: Record<string, number>;
}> {
  const companies = await db.company.findMany({
    where: { deletedAt: null },
    select: { country: true },
  });

  const companiesByCountry: Record<string, number> = {};
  for (const c of companies) {
    if (c.country) {
      companiesByCountry[c.country] = (companiesByCountry[c.country] || 0) + 1;
    }
  }

  const totalAnnualUsd = COMPLIANCE_COSTS.reduce((s, c) => s + c.annualCostUsd, 0);
  const totalPerCompanyMonthlyUsd = COMPLIANCE_COSTS.reduce((s, c) => {
    const count = companiesByCountry[c.country] || 0;
    return s + (c.perCompanyMonthlyUsd * count);
  }, 0);

  return {
    total: COMPLIANCE_COSTS,
    totalAnnualUsd,
    totalPerCompanyMonthlyUsd,
    companiesByCountry,
  };
}

// ─── 4. Trial → Paid Conversion Funnel ─────────────────────────────────────

export interface ConversionFunnel {
  totalSignups: number;
  trialActive: number;
  trialExpired: number;
  trialToPaidConverted: number;
  trialToPaidConversionRate: number;
  /** Average time from trial start to paid conversion (days) */
  avgConversionDays: number;
  /** Revenue from converted trials */
  totalConvertedRevenueUsd: number;
  /** Monthly breakdown */
  monthly: Array<{
    month: string;
    signups: number;
    conversions: number;
    conversionRate: number;
  }>;
}

export async function getConversionFunnel(): Promise<ConversionFunnel> {
  const now = new Date();

  const [totalCompanies, trialCompanies, paidCompanies] = await Promise.all([
    db.company.count({ where: { deletedAt: null } }),
    db.company.count({ where: { deletedAt: null, plan: "trial" } }),
    db.company.count({ where: { deletedAt: null, plan: { not: "trial" } } }),
  ]);

  // Trial expired = trial + trialEndsAt < now
  const trialExpired = await db.company.count({
    where: {
      deletedAt: null,
      plan: "trial",
      trialEndsAt: { lt: now },
    },
  });

  const trialActive = trialCompanies - trialExpired;

  // Get paid companies with their creation date for avg conversion time
  const paidCompanyDetails = await db.company.findMany({
    where: { deletedAt: null, plan: { not: "trial" } },
    select: { id: true, slug: true, createdAt: true, plan: true, subscriptionStatus: true },
  });

  // Get first successful payment for each paid company
  const paidSlugs = paidCompanyDetails.map((c) => c.slug);
  const firstPayments = await db.paymentTransaction.findMany({
    where: {
      companySlug: { in: paidSlugs },
      status: "completed",
    },
    select: { companySlug: true, date: true, amount: true },
    orderBy: { date: "asc" },
  });

  const firstPaymentMap = new Map<string, { date: Date; amount: number }>();
  for (const p of firstPayments) {
    if (!firstPaymentMap.has(p.companySlug)) {
      firstPaymentMap.set(p.companySlug, { date: new Date(p.date), amount: num(p.amount, 3) });
    }
  }

  let totalConversionDays = 0;
  let totalConvertedRevenue = 0;
  for (const company of paidCompanyDetails) {
    const payment = firstPaymentMap.get(company.slug);
    if (payment) {
      const diffDays = (payment.date.getTime() - new Date(company.createdAt).getTime()) / (1000 * 60 * 60 * 24);
      totalConversionDays += diffDays;
      totalConvertedRevenue += payment.amount;
    }
  }

  const conversionRate = totalCompanies > 0 ? (paidCompanies / totalCompanies) * 100 : 0;
  const avgConversionDays = paidCompanies > 0 ? totalConversionDays / paidCompanies : 0;

  // Monthly breakdown (last 6 months)
  const monthly: Array<{ month: string; signups: number; conversions: number; conversionRate: number }> = [];
  for (let i = 5; i >= 0; i--) {
    const monthStart = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
    const monthLabel = monthStart.toLocaleDateString("ar", { month: "short", year: "numeric" });

    const [signups, conversions] = await Promise.all([
      db.company.count({
        where: { deletedAt: null, createdAt: { gte: monthStart, lt: monthEnd } },
      }),
      db.company.count({
        where: {
          deletedAt: null,
          plan: { not: "trial" },
          createdAt: { gte: monthStart, lt: monthEnd },
        },
      }),
    ]);

    monthly.push({
      month: monthLabel,
      signups,
      conversions,
      conversionRate: signups > 0 ? (conversions / signups) * 100 : 0,
    });
  }

  return {
    totalSignups: totalCompanies,
    trialActive,
    trialExpired,
    trialToPaidConverted: paidCompanies,
    trialToPaidConversionRate: Math.round(conversionRate * 10) / 10,
    avgConversionDays: Math.round(avgConversionDays * 10) / 10,
    totalConvertedRevenueUsd: Math.round(totalConvertedRevenue * 100) / 100,
    monthly,
  };
}

// ─── 5. Retention & Churn Prediction ───────────────────────────────────────

export interface RetentionMetrics {
  totalActive: number;
  totalChurned: number;
  churnRate: number;
  /** Companies on annual plans (lower churn risk) */
  annualSubscribers: number;
  /** Companies with loyalty discount applied */
  loyaltyDiscountCount: number;
  /** At-risk companies (predicted to churn) */
  atRiskCompanies: Array<{
    slug: string;
    name: string;
    plan: string;
    riskScore: number;
    riskFactors: string[];
    lastActivity: Date | null;
    daysInactive: number;
  }>;
  /** Retention recommendations */
  recommendations: string[];
}

export async function getRetentionMetrics(): Promise<RetentionMetrics> {
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const companies = await db.company.findMany({
    where: { deletedAt: null },
    select: {
      id: true,
      slug: true,
      name: true,
      nameAr: true,
      plan: true,
      subscriptionStatus: true,
      createdAt: true,
      trialEndsAt: true,
    },
  });

  // Get last activity (last invoice or login) for each company
  const companySlugs = companies.map((c) => c.slug);
  const lastInvoices = await db.invoice.findMany({
    where: { companySlug: { in: companySlugs }, deletedAt: null },
    select: { companySlug: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });

  const lastActivityMap = new Map<string, Date>();
  for (const inv of lastInvoices) {
    if (!lastActivityMap.has(inv.companySlug)) {
      lastActivityMap.set(inv.companySlug, new Date(inv.createdAt));
    }
  }

  const totalActive = companies.filter((c) => c.subscriptionStatus === "active").length;
  const totalChurned = companies.filter((c) => c.subscriptionStatus === "cancelled" || c.subscriptionStatus === "downgraded").length;
  const churnRate = companies.length > 0 ? (totalChurned / companies.length) * 100 : 0;

  // Annual subscribers
  const annualSchedules = await db.subscriptionSchedule.count({
    where: { billingCycle: "yearly", status: "active" },
  });

  // At-risk companies: inactive >14 days + trial or low plan
  const atRiskCompanies: RetentionMetrics["atRiskCompanies"] = [];
  for (const company of companies) {
    const lastActivity = lastActivityMap.get(company.slug);
    const daysInactive = lastActivity
      ? Math.floor((now.getTime() - lastActivity.getTime()) / (1000 * 60 * 60 * 24))
      : 999;

    if (daysInactive > 14 && company.subscriptionStatus === "active") {
      const riskFactors: string[] = [];
      let riskScore = 0;

      if (daysInactive > 30) { riskScore += 40; riskFactors.push("خامل أكثر من 30 يوم"); }
      else if (daysInactive > 14) { riskScore += 20; riskFactors.push("خامل أكثر من 14 يوم"); }

      if (company.plan === "trial") { riskScore += 30; riskFactors.push("لا يزال في التجربة المجانية"); }
      if (company.trialEndsAt && new Date(company.trialEndsAt) < now) { riskScore += 25; riskFactors.push("انتهت فترة التجربة"); }
      if (!lastActivity) { riskScore += 20; riskFactors.push("لم ينشئ أي فاتورة"); }

      if (riskScore >= 40) {
        atRiskCompanies.push({
          slug: company.slug,
          name: company.nameAr || company.name,
          plan: company.plan,
          riskScore,
          riskFactors,
          lastActivity: lastActivity || null,
          daysInactive,
        });
      }
    }
  }

  // Sort by risk score (highest first)
  atRiskCompanies.sort((a, b) => b.riskScore - a.riskScore);

  // Recommendations
  const recommendations: string[] = [];
  if (churnRate > 10) recommendations.push("معدل التسرب مرتفع — فكّر في عرض خصم للعملاء الخاملين");
  if (atRiskCompanies.length > 0) recommendations.push(`${atRiskCompanies.length} شركة معرّضة للتسرب — أرسل تذكيرات + عروض خصم`);
  if (annualSchedules === 0) recommendations.push("لا يوجد مشتركون سنويون — اعرض خصم 20% للتحويل لسنوي");
  if (totalActive > 10 && annualSchedules / totalActive < 0.2) recommendations.push("أقل من 20% سنويون — استهدف 40%");

  return {
    totalActive,
    totalChurned,
    churnRate: Math.round(churnRate * 10) / 10,
    annualSubscribers: annualSchedules,
    loyaltyDiscountCount: 0, // Would need loyalty discount field
    atRiskCompanies: atRiskCompanies.slice(0, 20),
    recommendations,
  };
}

// ─── 6. Loyalty Discount Engine ────────────────────────────────────────────

export interface LoyaltyDiscount {
  companySlug: string;
  companyName: string;
  monthsActive: number;
  currentPlan: string;
  /** Discount percentage (0 = none, 10 = 10% off, etc.) */
  discountPercent: number;
  tier: "bronze" | "silver" | "gold" | "platinum";
  perk: string;
}

/**
 * Calculate loyalty discounts based on how long a company has been active.
 * Tier system:
 * - Bronze: 3+ months → 5% discount
 * - Silver: 6+ months → 10% discount + priority support
 * - Gold: 12+ months → 15% discount + free AI add-on
 * - Platinum: 24+ months → 20% discount + dedicated account manager
 */
export async function getLoyaltyDiscounts(): Promise<LoyaltyDiscount[]> {
  const now = new Date();
  const companies = await db.company.findMany({
    where: { deletedAt: null, subscriptionStatus: "active", plan: { not: "trial" } },
    select: { slug: true, name: true, nameAr: true, plan: true, createdAt: true },
  });

  return companies.map((c) => {
    const monthsActive = Math.floor((now.getTime() - new Date(c.createdAt).getTime()) / (30 * 24 * 60 * 60 * 1000));

    let tier: LoyaltyDiscount["tier"] = "bronze";
    let discountPercent = 0;
    let perk = "";

    if (monthsActive >= 24) {
      tier = "platinum"; discountPercent = 20; perk = "خصم 20% + مدير حساب مخصص";
    } else if (monthsActive >= 12) {
      tier = "gold"; discountPercent = 15; perk = "خصم 15% + إضافة AI مجانية";
    } else if (monthsActive >= 6) {
      tier = "silver"; discountPercent = 10; perk = "خصم 10% + دعم ذو أولوية";
    } else if (monthsActive >= 3) {
      tier = "bronze"; discountPercent = 5; perk = "خصم 5%";
    }

    return {
      companySlug: c.slug,
      companyName: c.nameAr || c.name,
      monthsActive,
      currentPlan: c.plan,
      discountPercent,
      tier,
      perk,
    };
  }).filter((d) => d.discountPercent > 0);
}

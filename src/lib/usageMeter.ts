/**
 * usageMeter.ts — SAAS-001 + SAAS-003 FIX
 * Enforces plan limits: trial expiry, monthly invoice quota, user count.
 */
import { db } from "./db";
import { DEFAULT_PLANS, type PlanKey } from "./plans";
import { logger } from "./logger";

export interface QuotaCheck {
  ok: boolean;
  reason?: string;
  limit?: number;
  current?: number;
}

/** Check if a company's trial has expired */
export async function checkTrialExpiry(companySlug: string): Promise<QuotaCheck> {
  const company = await db.company.findUnique({
    where: { slug: companySlug },
    select: { plan: true, trialEndsAt: true, subscriptionStatus: true },
  });
  if (!company) return { ok: false, reason: "Company not found" };

  if (company.plan === "trial" && company.trialEndsAt) {
    if (new Date() > company.trialEndsAt) {
      return {
        ok: false,
        reason: "انتهت الفترة التجريبية. يرجى ترقية باقتك للمتابعة.",
        limit: 0,
        current: 0,
      };
    }
  }

  if (company.subscriptionStatus === "suspended") {
    return {
      ok: false,
      reason: "تم تعليق اشتراك هذه الشركة. تواصل مع الدعم.",
    };
  }

  return { ok: true };
}

/** Check if company can create a new invoice (monthly quota) */
export async function checkInvoiceQuota(companySlug: string): Promise<QuotaCheck> {
  const company = await db.company.findUnique({
    where: { slug: companySlug },
    select: { plan: true },
  });
  if (!company) return { ok: false, reason: "Company not found" };

  const planKey = (company.plan || "trial") as PlanKey;
  const plan = DEFAULT_PLANS[planKey] || DEFAULT_PLANS.trial;

  // Unlimited plan
  if (plan.maxInvoicesPerMonth === -1) return { ok: true };

  // Count invoices this month (excluding soft-deleted)
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthStr = monthStart.toISOString().slice(0, 7); // YYYY-MM

  const count = await db.invoice.count({
    where: {
      companySlug,
      deletedAt: null,
      issueDate: { startsWith: monthStr },
    },
  });

  if (count >= plan.maxInvoicesPerMonth) {
    return {
      ok: false,
      reason: `بلغت الحد الشهري للفواتير في باقتك (${plan.maxInvoicesPerMonth}). ترقّى لإنشاء المزيد.`,
      limit: plan.maxInvoicesPerMonth,
      current: count,
    };
  }

  return { ok: true, limit: plan.maxInvoicesPerMonth, current: count };
}

/** Check if company can add a new user */
export async function checkUserQuota(companySlug: string): Promise<QuotaCheck> {
  const company = await db.company.findUnique({
    where: { slug: companySlug },
    select: { plan: true },
  });
  if (!company) return { ok: false, reason: "Company not found" };

  const planKey = (company.plan || "trial") as PlanKey;
  const plan = DEFAULT_PLANS[planKey] || DEFAULT_PLANS.trial;

  if (plan.maxUsers === -1) return { ok: true };

  // EA-010 FIX: Previously used findMany + JS filter (N+1 pattern).
  // Now uses a two-step approach:
  //   1. Use findMany with contains to pre-filter candidates (small set)
  //   2. Verify exact membership via JSON.parse + .includes
  // This avoids scanning the entire users table — only rows mentioning the slug
  // are fetched, then JS filtering removes false positives from substring matches.
  const candidates = await db.user.findMany({
    where: {
      role: { not: "inactive" },
      companies: { contains: companySlug },
    },
    select: { companies: true },
  });
  // Exact-match check on the candidate set only (which is small by design)
  let count = 0;
  for (const u of candidates) {
    try {
      const companies = JSON.parse(u.companies || "[]") as string[];
      if (companies.includes(companySlug)) count++;
    } catch {
      // malformed companies field — skip this user
    }
  }

  if (count >= plan.maxUsers) {
    return {
      ok: false,
      reason: `بلغت الحد الأقصى للمستخدمين في باقتك (${plan.maxUsers}). ترقّى لإضافة المزيد.`,
      limit: plan.maxUsers,
      current: count,
    };
  }

  return { ok: true, limit: plan.maxUsers, current: count };
}

/** Check if company can create a new company (for multi-company plans) */
export async function checkCompanyQuota(userUid: string): Promise<QuotaCheck> {
  const user = await db.user.findUnique({
    where: { uid: userUid },
    select: { companies: true, role: true },
  });
  if (!user) return { ok: false, reason: "User not found" };

  // Founder/admin bypass
  if (user.role === "admin") return { ok: true };

  const companies = JSON.parse(user.companies || "[]") as string[];
  // Use the plan of the first company
  if (companies.length === 0) return { ok: true };

  const firstCompany = await db.company.findUnique({
    where: { slug: companies[0] },
    select: { plan: true },
  });
  const planKey = (firstCompany?.plan || "trial") as PlanKey;
  const plan = DEFAULT_PLANS[planKey] || DEFAULT_PLANS.trial;

  if (plan.maxCompanies === -1) return { ok: true };

  if (companies.length >= plan.maxCompanies) {
    return {
      ok: false,
      reason: `بلغت الحد الأقصى للشركات في باقتك (${plan.maxCompanies}). ترقّى لإضافة المزيد.`,
      limit: plan.maxCompanies,
      current: companies.length,
    };
  }

  return { ok: true, limit: plan.maxCompanies, current: companies.length };
}

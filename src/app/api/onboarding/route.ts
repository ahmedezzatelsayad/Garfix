/**
 * /api/onboarding
 *
 * GET  — fetch current onboarding progress for the user's first company
 * POST — update progress (save current step + data, or complete)
 *
 * The wizard stores state in the SetupWizardProgress table so users can
 * close the browser and resume from where they left off.
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { resolveAuth, assertCompanyAccess } from "@/lib/auth";
import { requirePermissionForCompany } from "@/lib/middleware";
import { getAccountTemplate, getRecommendedModules, type BusinessType } from "@/lib/accountTemplates";
import { getCountryConfig } from "@/lib/gulfConfig";
import { logAudit } from "@/lib/audit";
import { logger } from "@/lib/logger";
import { z } from "zod";
import { apiError, withErrorHandler, parseJsonBody } from "@/lib/api";

// ─── GET — fetch progress ───────────────────────────────────────────────────

export const GET = withErrorHandler(async (req: NextRequest) => {
  const result = await resolveAuth(req);
  if (!result.ok || !result.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const user = result.user;

  // Check for sentinel slug first (user skipped onboarding without company)
  const sentinelSlug = `user-${user.uid}`;
  const sentinelProgress = await db.setupWizardProgress.findUnique({ where: { companySlug: sentinelSlug } });
  if (sentinelProgress?.completed) {
    return NextResponse.json({ step: 10, completed: true, data: {}, companySlug: sentinelSlug });
  }

  // Find the user's first company
  const companies = user.companies.length > 0 ? user.companies : [];
  if (companies.length === 0) {
    return NextResponse.json({ step: 0, completed: false, needsCompany: true });
  }
  const companySlug = companies[0];

  const progress = await db.setupWizardProgress.findUnique({ where: { companySlug } });
  if (!progress) {
    return NextResponse.json({ step: 1, completed: false, data: {}, companySlug });
  }

  return NextResponse.json({
    step: progress.currentStep,
    completed: progress.completed,
    data: progress.data ? JSON.parse(progress.data) : {},
    companySlug,
  });
});

// ─── POST — update progress or complete ─────────────────────────────────────

const UpdateSchema = z.object({
  action: z.enum(["update", "complete"]),
  step: z.number().int().min(1).max(10).optional(),
  data: z.record(z.string(), z.unknown()).optional(),
  // For the "complete" action, these fields carry the final wizard answers:
  companySlug: z.string().optional(),
  businessType: z.enum(["retail", "wholesale", "services", "manufacturing", "restaurant", "trading"]).optional(),
  hasEmployees: z.boolean().optional(),
  hasWarehouse: z.boolean().optional(),
  usesWhatsApp: z.boolean().optional(),
  generateAccounts: z.boolean().optional().default(true),
  activateModules: z.boolean().optional().default(true),
});

export const POST = withErrorHandler(async (req: NextRequest) => {
  const result = await resolveAuth(req);
  if (!result.ok || !result.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const user = result.user;

  const body = await parseJsonBody(req);
  const parsed = UpdateSchema.safeParse(body);
  if (!parsed.success) return apiError(parsed.error.issues[0]?.message || "Invalid input", 400);
  const data = parsed.data;

  if (data.action === "update") {
    // Save progress without completing
    if (!data.companySlug) return apiError("companySlug required for update", 400);
    if (!assertCompanyAccess(user, data.companySlug)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const existing = await db.setupWizardProgress.findUnique({ where: { companySlug: data.companySlug } });
    const mergedData = {
      ...(existing?.data ? JSON.parse(existing.data) : {}),
      ...(data.data || {}),
    };

    const progress = await db.setupWizardProgress.upsert({
      where: { companySlug: data.companySlug },
      update: {
        currentStep: Number(data.step || existing?.currentStep || 1),
        data: JSON.stringify(mergedData),
      },
      create: {
        companySlug: data.companySlug,
        currentStep: Number(data.step || 1),
        data: JSON.stringify(mergedData),
      },
    });

    return NextResponse.json({ ok: true, progress });
  }

  // ─── action === "complete" ────────────────────────────────────────────────
  // companySlug is optional — if omitted, creates a sentinel record (user-${uid})
  // so the user can skip onboarding without creating a company first.
  const companySlug = data.companySlug || `user-${user.uid}`;
  const isSentinel = companySlug.startsWith("user-");

  if (!isSentinel) {
    const access = await requirePermissionForCompany(req, "settings_access", companySlug);
    if ("error" in access) return access.error;
  }

  const company = isSentinel ? null : await db.company.findUnique({ where: { slug: companySlug } });
  if (!isSentinel && !company) return apiError("Company not found", 404);

  const countryConfig = company ? getCountryConfig(company.country) : null;
  const businessType = data.businessType as BusinessType | undefined;

  // 1. Generate chart of accounts from template (only if company exists + businessType provided)
  let accountsCreated = 0;
  if (data.generateAccounts && company && businessType) {
    const template = getAccountTemplate(businessType);
    // Check if accounts already exist (avoid duplicates)
    const existing = await db.account.count({ where: { companySlug } });
    if (existing === 0) {
      await db.account.createMany({
        data: template.map((a) => ({
          companyId: company.id,
          companySlug,
          code: a.code,
          name: a.nameAr ?? a.nameEn,
          nameAr: a.nameAr,
          nameEn: a.nameEn,
          type: a.type,
          balance: a.balance || "0",
        })),
      });
      accountsCreated = template.length;
      logger.info("[onboarding] account tree generated", { companySlug, accountsCreated, businessType });
    }
  }

  // 2. Activate recommended modules (only if company exists + businessType provided)
  let modulesActivated = 0;
  if (data.activateModules && businessType) {
    const recommended = getRecommendedModules({
      businessType,
      hasEmployees: data.hasEmployees ?? false,
      hasWarehouse: data.hasWarehouse ?? false,
      usesWhatsApp: data.usesWhatsApp ?? false,
    });
    for (const identifier of recommended) {
      const existing = await db.module.findUnique({ where: { identifier } });
      if (existing && !existing.isActive) {
        await db.module.update({ where: { identifier }, data: { isActive: true } });
        modulesActivated++;
      }
    }
    logger.info("[onboarding] modules activated", { companySlug, modulesActivated, recommended });
  }

  // 3. Update company settings based on wizard answers (only if company exists)
  if (company) {
    await db.company.update({
      where: { slug: companySlug },
      data: {
        defaultTaxRate: countryConfig?.defaultTaxRate || company.defaultTaxRate,
        currency: countryConfig?.currency || company.currency,
      },
    });
  }

  // 4. Mark onboarding as complete
  await db.setupWizardProgress.upsert({
    where: { companySlug },
    update: {
      completed: true,
      currentStep: 10,
      data: JSON.stringify({
        businessType: businessType || null,
        hasEmployees: data.hasEmployees,
        hasWarehouse: data.hasWarehouse,
        usesWhatsApp: data.usesWhatsApp,
        skipped: isSentinel,
      }),
    },
    create: {
      companySlug,
      completed: true,
      currentStep: 10,
      data: JSON.stringify({
        businessType: businessType || null,
        hasEmployees: data.hasEmployees,
        hasWarehouse: data.hasWarehouse,
        usesWhatsApp: data.usesWhatsApp,
        skipped: isSentinel,
      }),
    },
  });

  await logAudit({
    userEmail: user.email,
    userUid: user.uid,
    action: "onboarding_complete",
    entity: "company",
    companySlug,
    details: {
      businessType: businessType || null,
      accountsCreated,
      modulesActivated,
      hasEmployees: data.hasEmployees,
      usesWhatsApp: data.usesWhatsApp,
      skipped: isSentinel,
    },
  });

  return NextResponse.json({
    ok: true,
    completed: true,
    summary: {
      accountsCreated,
      modulesActivated,
      businessType: businessType || null,
      country: company?.country || null,
      currency: countryConfig?.currency || company?.currency || null,
    },
  });
});

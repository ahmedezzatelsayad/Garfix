/**
 * /api/companies
 * GET    — list companies the user has access to (founder: all; others: assigned)
 * POST   — create a new company (founder only — auto-assigned; others: auto-assigned to creator)
 */
import { NextRequest, NextResponse } from "next/server";
import { dbTyped as db } from "@/lib/db";
import { resolveAuth, hasUnrestrictedScope } from "@/lib/auth";
import { isFounderEmail } from "@/lib/founder";
import { logAudit } from "@/lib/audit";
import { requirePermission } from "@/lib/middleware";
import { z } from "zod";
import { apiError, withErrorHandler, parseJsonBody } from "@/lib/api";
import { DEFAULT_PLANS } from "@/lib/plans";
import { getCountryConfig, getDefaultTimezone } from "@/lib/gulfConfig";
import { getAccountTemplate } from "@/lib/accountTemplates";
import { logger } from "@/lib/logger";
import { rateLimitResponse, LIMITS } from "@/lib/rateLimit";

const CreateSchema = z.object({
  name: z.string().min(1, "اسم الشركة مطلوب"),
  slug: z.string().min(2, "المعرّف مطلوب").max(60).regex(/^[a-z0-9-]+$/, "المعرّف يجب أن يكون أحرف إنجليزية صغيرة وأرقام و-"),
  nameAr: z.string().optional(),
  emoji: z.string().max(8).optional(),
  color: z.string().max(20).optional(),
  phone: z.string().optional(),
  email: z.string().email().optional().or(z.literal("")),
  address: z.string().optional(),
  vatNumber: z.string().optional(),
  // العملة: اختيارية — لو لم تُرسل تُشتق من الدولة (وليست KWD ثابتة كما كان سابقًا)
  currency: z.string().min(2).max(5).optional(),
  country: z.string().optional(),
  defaultTaxRate: z.string().default("0"),
  // ── P3: تخصيص الشركة عند الإنشاء ──
  language: z.enum(["ar", "en"]).default("ar"),
  timezone: z.string().min(3).max(64).optional(),
  // نمط قالب الفاتورة الافتراضي: modern | classic | minimal
  invoiceTemplateStyle: z.enum(["modern", "classic", "minimal"]).default("modern"),
  // لون القالب الأساسي (hex اختياري)
  invoiceTemplateColor: z.string().max(9).optional(),
});

function slugify(s: string): string {
  return s.toLowerCase().trim().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "");
}

export const GET = withErrorHandler(async (req: NextRequest) => {
  const result = await resolveAuth(req);
  if (!result.ok || !result.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const user = result.user;

  // Onboarding P2 fix — slug availability check.
  // If the request includes ?checkSlug=<slug>, we short-circuit and return
  // { available: boolean, slug: <sanitized> } so the SetupWizard can show
  // inline availability feedback before the user clicks "إنشاء الشركة".
  const checkSlug = req.nextUrl.searchParams.get("checkSlug");
  if (checkSlug !== null) {
    const sanitized = slugify(checkSlug);
    if (!sanitized || sanitized.length < 2) {
      return NextResponse.json({ available: false, slug: sanitized, reason: "too-short" });
    }
    if (!/^[a-z0-9-]+$/.test(sanitized)) {
      return NextResponse.json({ available: false, slug: sanitized, reason: "invalid-chars" });
    }
    const existing = await db.company.findUnique({ where: { slug: sanitized } });
    return NextResponse.json({
      available: !existing,
      slug: sanitized,
      reason: existing ? "taken" : "ok",
    });
  }

  let companies;
  // P0 FIX (عزل المستأجرين): كان الـ admin (مالك شركة) يرى كل شركات المنصة
  // لأن hasUnrestrictedScope(admin)=true — فيعرض السويتشر شركات لا يملكها
  // ويختار تلقائياً أحدثها → كل استعلاماتها 403 (تأكيد بالتشغيل الفعلي).
  // عرض كل الشركات مقصود للمؤسس فقط (مالك المنصة). assertCompanyAccess نفسه
  // يرفض أصلاً أي شركة خارج قائمة المستخدم — هذا مجرد مواءمة للقائمة.
  const { isFounderEmail } = await import("@/lib/founder");
  if (isFounderEmail(user.email)) {
    companies = await db.company.findMany({ orderBy: { createdAt: "desc" } });
  } else {
    companies = await db.company.findMany({
      where: { slug: { in: user.companies } },
      orderBy: { createdAt: "desc" },
    });
  }

  return NextResponse.json({
    companies: companies.map((c) => ({
      id: c.id,
      name: c.name,
      slug: c.slug,
      nameAr: c.nameAr,
      emoji: c.emoji,
      color: c.color,
      phone: c.phone,
      email: (c as { email?: string }).email || null,
      address: c.address,
      vatNumber: c.vatNumber,
      currency: c.currency,
      language: c.language,
      timezone: c.timezone,
      country: c.country,
      defaultTaxRate: c.defaultTaxRate,
      plan: c.plan,
      subscriptionStatus: c.subscriptionStatus,
      trialEndsAt: c.trialEndsAt,
      createdAt: c.createdAt,
    })),
  });
});

export const POST = withErrorHandler(async (req: NextRequest) => {
  // P5-H2: Rate limit POST /api/companies — 30/min/IP (API_WRITE).
  const rl = await rateLimitResponse(req, "post:companies", LIMITS.API_WRITE);
  if (rl) return rl;

  // Authorization: enforce settings_access for creating ADDITIONAL companies,
  // but allow any authenticated user to create their FIRST company (onboarding).
  // Without this exception, fresh `employee` users could never complete the
  // SetupWizard — they'd see "no companies" forever.
  const authResult = await resolveAuth(req);
  if (!authResult.ok || !authResult.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const user = authResult.user;
  const founder = isFounderEmail(user.email);

  // If user already has companies, require settings_access to create more
  // (unless they're the founder).
  if (!founder && user.companies.length > 0) {
    const permResult = await requirePermission(req, "settings_access");
    if ("error" in permResult) return permResult.error;
  }

  const body = await parseJsonBody(req);
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(parsed.error.issues[0]?.message || "Invalid input", 400);
  }
  const data = parsed.data;

  // Enforce plan limits — founder is exempt
  if (!founder) {
    const plan = DEFAULT_PLANS[user.role === "admin" ? "professional" : "trial"] || DEFAULT_PLANS.trial;
    if (plan.maxCompanies > 0) {
      const ownedCount = await db.company.count({
        where: { slug: { in: user.companies } },
      });
      if (ownedCount >= plan.maxCompanies) {
        return apiError(`بلغت الحد الأقصى لعدد الشركات في باقتك (${plan.maxCompanies})`, 403);
      }
    }
  }

  const slug = data.slug || slugify(data.name);

  // Check uniqueness
  const existing = await db.company.findUnique({ where: { slug } });
  if (existing) {
    return apiError("this slug is already taken", 409);
  }

  // P3: اشتقاق الإعدادات المحلية من الدولة المختارة (بدل القيم الثابتة):
  // العملة + المنطقة الزمنية + نسبة الضريبة الافتراضية. أي قيمة أرسلها
  // المستخدم صراحةً تتقدم على الاشتقاق التلقائي.
  const countryConfig = data.country ? getCountryConfig(data.country) : null;
  const resolvedCurrency = data.currency || countryConfig?.currency || "KWD";
  const resolvedTimezone = data.timezone || getDefaultTimezone(data.country);
  const resolvedTaxRate = data.defaultTaxRate && data.defaultTaxRate !== "0"
    ? data.defaultTaxRate
    : (countryConfig?.defaultTaxRate || "0");

  const company = await db.company.create({
    data: {
      name: data.name,
      code: slug,
      slug,
      nameAr: data.nameAr || data.name,
      emoji: data.emoji || "🏢",
      color: data.color || "#7c3aed",
      address: data.address || null,
      currency: resolvedCurrency,
      language: data.language,
      timezone: resolvedTimezone,
      country: data.country || null,
      defaultTaxRate: resolvedTaxRate,
      plan: "trial",
      subscriptionStatus: "active",
      trialEndsAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // TRIAL v2: 7 أيام
      // P2-Sprint5-D: Company schema requires `currencyDecimalPlaces` (Int, no default).
      currencyDecimalPlaces: countryConfig?.currencyDecimalPlaces ?? (resolvedCurrency === "KWD" ? 3 : 2),
    },
  });

  // 🤖 Auto-create AI Config slot for new company (Per-Feature Architecture)
  // Each company gets 4 isolated API keys: Chat, Invoice, Parse, Memory
  try {
    await db.companyAIConfig.create({
      data: {
        companyId: company.id,
        
        // 💬 Chat Feature - Empty, waiting for founder
        chatApiKey: '',
        chatModel: 'gemini-2.0-flash',
        chatEnabled: false,
        chatRateLimitRpm: 60,
        chatTokensUsed: BigInt(0),
        chatRequestsCount: BigInt(0),
        
        // 📄 Invoice Feature - Empty, waiting for founder
        invoiceApiKey: '',
        invoiceModel: 'gemini-2.0-flash',
        invoiceEnabled: false,
        invoiceRateLimitRpm: 100,
        invoiceTokensUsed: BigInt(0),
        invoiceRequestsCount: BigInt(0),
        
        // 🔍 Parse Feature - Empty, waiting for founder
        parseApiKey: '',
        parseModel: 'gemini-2.0-flash',
        parseEnabled: false,
        parseRateLimitRpm: 80,
        parseTokensUsed: BigInt(0),
        parseRequestsCount: BigInt(0),
        
        // 🧠 Memory Feature - Empty, waiting for founder
        memoryApiKey: '',
        memoryModel: 'gemini-2.0-flash',
        memoryEnabled: false,
        memoryRateLimitRpm: 30,
        memoryTokensUsed: BigInt(0),
        memoryRequestsCount: BigInt(0),
        
        // Shared config
        primaryProvider: JSON.stringify({
          provider: 'google-gemini',
          model: 'gemini-2.0-flash',
        }),
        systemPrompt: '',
        memoryRetentionDays: 30,
        costOptimization: 'balanced',
        notifyHighUsage: true,
        usageNotificationThreshold: 80,
        tokensUsedThisMonth: BigInt(0),
        requestsThisMonth: BigInt(0),
        lastResetAt: new Date(),
      },
    });
    
    logger.info("[companies] Auto-created per-feature AI config", { companyId: company.id, companyName: company.name });
    logger.info("[companies] Ready for: Chat, Invoice, Parse, Memory keys");
  } catch (aiConfigError) {
    logger.error("[companies] Failed to auto-create AI config slot", { err: aiConfigError instanceof Error ? aiConfigError.message : String(aiConfigError) });
  }

  // ────────────────────────────────────────────────────────────────────────
  // 🏗️ SELF-ONBOARDING: Auto-seed defaults for new company
  // 1. Country-specific tax config (VAT rate, currency, decimal places)
  // 2. Default chart of accounts (cash, bank, sales, purchases, etc.)
  // 3. Default invoice template
  // ────────────────────────────────────────────────────────────────────────

  // 1. Apply country-specific tax config — تم دمجه في db.company.create أعلاه
  // (currency/timezone/taxRate/decimalPlaces تُحفظ من اختيارات المستخدم أو الدولة مباشرة)
  // countryConfig مُعرّف أعلاه في تدفق الإنشاء ويُعاد استخدامه في قالب الفاتورة (QR/ZATCA).

  // 2. Auto-seed default chart of accounts (trading template — most general)
  try {
    const template = getAccountTemplate("trading");
    const existingAccounts = await db.account.count({ where: { companySlug: slug } });
    if (existingAccounts === 0) {
      await db.account.createMany({
        data: template.map((a) => ({
          companyId: company.id,
          companySlug: slug,
          code: a.code,
          name: a.nameAr ?? a.nameEn,
          nameAr: a.nameAr,
          nameEn: a.nameEn,
          type: a.type,
          balance: a.balance || "0",
        })),
      });
      logger.info("[companies] default chart of accounts seeded", { companyId: company.id, accountsCount: template.length });
    }
  } catch (accountsErr) {
    logger.warn("[companies] failed to seed default accounts", { err: accountsErr instanceof Error ? accountsErr.message : String(accountsErr) });
  }

  // 3. Auto-create default invoice template
  try {
    const existingTemplate = await db.invoiceTemplate.count({ where: { companySlug: slug } });
    if (existingTemplate === 0) {
      await db.invoiceTemplate.create({
        data: {
          companySlug: slug,
          name: data.invoiceTemplateStyle === "classic" ? "القالب الكلاسيكي" : data.invoiceTemplateStyle === "minimal" ? "القالب المبسّط" : "القالب العصري",
          layoutType: data.invoiceTemplateStyle,
          primaryColor: data.invoiceTemplateColor || "#047857",
          fontFamily: "Cairo",
          logoPosition: "right",
          showTaxNumber: true,
          showQrCode: countryConfig?.eInvoiceAuthority === "zatca" || false,
          showBankDetails: false,
          paperSize: "A4",
          isDefault: true,
        },
      });
      logger.info("[companies] default invoice template created", { companyId: company.id, companySlug: slug });
    }
  } catch (templateErr) {
    logger.warn("[companies] failed to create default invoice template", { err: templateErr instanceof Error ? templateErr.message : String(templateErr) });
  }

  // Auto-assign the new company to the creator AND promote them to admin if
  // this is their first company. Without the role promotion, an `employee`
  // user could create a company but then couldn't manage it (no settings_access,
  // no view_catalog, no finance_access, etc.) — the dashboard would be
  // read-only with most tabs returning 403. Promoting to admin gives them
  // full tenant-owner permissions, matching the user's expectation that
  // "I created this company, I'm the admin."
  const newCompanies = [...new Set([...user.companies, slug])];
  const isFirstCompany = user.companies.length === 0 && !founder;
  const updateData: Record<string, unknown> = { companies: JSON.stringify(newCompanies) };
  if (isFirstCompany) {
    updateData.role = "admin";
    // Bump tokenVersion so any other session is invalidated.
    updateData.tokenVersion = { increment: 1 };
  }
  await db.appUser.update({
    where: { uid: user.uid },
    data: updateData,
  });

  await logAudit({
    userEmail: user.email,
    userUid: user.uid,
    action: "create",
    entity: "company",
    entityId: company.id,
    companySlug: slug,
    details: { name: data.name, founder },
  });

  // Re-issue the session so the new company is in the JWT's `companies` array.
  // Without this, GET /api/companies (which filters by JWT.companies) would
  // return [] even though the company was just created — the user would see
  // "no companies" until they manually logged out and back in.
  const response = NextResponse.json({
    ok: true,
    company: {
      id: company.id,
      name: company.name,
      slug: company.slug,
      nameAr: company.nameAr,
      emoji: company.emoji,
      color: company.color,
    },
  });
  try {
    // P3.2 (Cycle 5): omit passwordHash — re-issue session only reads
    // identity + role + companies fields.
    const updatedUser = await db.appUser.findUnique({
      where: { uid: user.uid },
      omit: { passwordHash: true },
    });
    if (updatedUser) {
      const { issueSession } = await import("@/lib/auth");
      await issueSession(response, {
        uid: updatedUser.uid,
        email: updatedUser.email,
        displayName: updatedUser.displayName || "",
        role: updatedUser.role,
        companies: newCompanies,
        permissions: (JSON.parse(updatedUser.permissions || "{}") as Record<string, number>) ?? {},
        emailVerified: updatedUser.emailVerified,
        tokenVersion: updatedUser.tokenVersion,
      }, req);
    }
  } catch (err) {
    // Best-effort — the company was created, just don't refresh the session.
    logger.error("[companies] failed to refresh session after create", { err: err instanceof Error ? err.message : String(err) });
  }
  return response;
});

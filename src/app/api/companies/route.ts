/**
 * /api/companies
 * GET    — list companies the user has access to (founder: all; others: assigned)
 * POST   — create a new company (founder only — auto-assigned; others: auto-assigned to creator)
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { resolveAuth, assertCompanyAccess, hasUnrestrictedScope } from "@/lib/auth";
import { isFounderEmail } from "@/lib/founder";
import { logAudit } from "@/lib/audit";
import { requirePermission } from "@/lib/middleware";
import { z } from "zod";
import { apiError, withErrorHandler, parseJsonBody } from "@/lib/api";
import { DEFAULT_PLANS } from "@/lib/plans";

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
  currency: z.string().default("KWD"),
  country: z.string().optional(),
  defaultTaxRate: z.string().default("0"),
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
  if (hasUnrestrictedScope(user)) {
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
      email: c.email,
      address: c.address,
      vatNumber: c.vatNumber,
      currency: c.currency,
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

  const company = await db.company.create({
    data: {
      name: data.name,
      code: slug,
      slug,
      nameAr: data.nameAr || data.name,
      emoji: data.emoji || "🏢",
      color: data.color || "#7c3aed",
      address: data.address || null,
      currency: data.currency || "KWD",
      country: data.country || null,
      defaultTaxRate: data.defaultTaxRate || "0",
      plan: "trial",
      subscriptionStatus: "active",
      trialEndsAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    },
  });

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
    const updatedUser = await db.appUser.findUnique({ where: { uid: user.uid } });
    if (updatedUser) {
      const { issueSession } = await import("@/lib/auth");
      await issueSession(response, {
        uid: updatedUser.uid,
        email: updatedUser.email,
        displayName: updatedUser.displayName || "",
        role: updatedUser.role,
        companies: newCompanies,
        permissions: (updatedUser.permissions as Record<string, number>) ?? {},
        emailVerified: updatedUser.emailVerified,
        tokenVersion: updatedUser.tokenVersion,
      }, req);
    }
  } catch (err) {
    // Best-effort — the company was created, just don't refresh the session.
    console.error("[companies] failed to refresh session after create:", err);
  }
  return response;
});

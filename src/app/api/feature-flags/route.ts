/**
 * /api/feature-flags
 *
 * GET — return active flags applicable to a company's plan.
 *
 * Query: ?companySlug=X
 *
 * Rules:
 *   - Flag must have isActive=true
 *   - AND (plans array is empty → flag applies to ALL plans)
 *        OR (plans array includes the company's plan)
 *
 * The company's plan is resolved via db.company.findUnique({ where: { slug }, select: { plan: true } }).
 * If the company doesn't exist or has no plan, only flags with empty plans
 * are returned.
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { resolveAuth, assertCompanyAccess } from "@/lib/auth";
import { withErrorHandler, apiError, parseJsonField } from "@/lib/api";

export const GET = withErrorHandler(async (req: NextRequest) => {
  const result = await resolveAuth(req);
  if (!result.ok || !result.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const user = result.user;

  const sp = req.nextUrl.searchParams;
  const companySlug = sp.get("companySlug");
  if (!companySlug) return apiError("companySlug is required", 400);

  if (!assertCompanyAccess(user, companySlug)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Resolve the company's plan
  const company = await db.company.findUnique({
    where: { slug: companySlug },
    select: { plan: true },
  });
  const plan = company?.plan || "";

  // Pull all active flags
  const flags = await db.featureFlag.findMany({
    where: { isActive: true },
    orderBy: { createdAt: "asc" },
  });

  // Filter by plan applicability:
  //   - empty plans array → applies to everyone
  //   - non-empty plans array → must include the company's plan
  const applicable = flags.filter((f) => {
    const plans = parseJsonField<string[]>(f.plans, []);
    if (!Array.isArray(plans) || plans.length === 0) return true;
    return plans.includes(plan);
  });

  return NextResponse.json({
    companySlug,
    plan,
    flags: applicable.map((f) => ({
      id: f.id,
      key: f.key,
      label: f.label,
      description: f.description,
      plans: parseJsonField<string[]>(f.plans, []),
      isActive: f.isActive,
    })),
  });
});

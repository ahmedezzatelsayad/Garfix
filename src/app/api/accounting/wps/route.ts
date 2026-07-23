/**
 * /api/accounting/wps
 * GET — list WPS files for company
 * POST — generate WPS file
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requirePermissionForCompany, hasPermission } from "@/lib/middleware";
import { resolveAuth, assertCompanyAccess, hasUnrestrictedScope } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { generateWpsFile } from "@/lib/accounting/payroll-wps";
import { num } from "@/lib/money";
import { z } from "zod";
import { apiError, withErrorHandler, parseJsonBody, apiOk } from "@/lib/api";

const GenerateSchema = z.object({
  companySlug: z.string().min(1),
  country: z.enum(["KW", "SA", "AE", "BH", "OM", "QA"]),
  month: z.string().min(1), // YYYY-MM
});

export const GET = withErrorHandler(async (req: NextRequest) => {
  const result = await resolveAuth(req);
  if (!result.ok || !result.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!hasPermission(result.user, "finance_access")) {
    return NextResponse.json({ error: "ليس لديك صلاحية: finance_access" }, { status: 403 });
  }

  const sp = req.nextUrl.searchParams;
  const companySlug = sp.get("companySlug") || undefined;
  if (companySlug && !assertCompanyAccess(result.user, companySlug)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const where: Record<string, unknown> = {};
  if (companySlug) where.companySlug = companySlug;
  else if (!hasUnrestrictedScope(result.user)) where.companySlug = { in: result.user.companies };

  const country = sp.get("country");
  if (country) where.country = country;

  const wpsFiles = await db.wpsFile.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return NextResponse.json({
    wpsFiles: wpsFiles.map((f) => ({
      ...f,
      totalAmount: num(f.totalAmount, 3).toFixed(3),
      // Don't return fileContent in list — it can be large
      fileContent: undefined,
    })),
  });
});

export const POST = withErrorHandler(async (req: NextRequest) => {
  const body = await parseJsonBody(req);
  const parsed = GenerateSchema.safeParse(body);
  if (!parsed.success) return apiError(parsed.error.issues[0]?.message || "Invalid input", 400);
  const data = parsed.data;

  const access = await requirePermissionForCompany(req, "finance_access", data.companySlug);
  if ("error" in access) return access.error;
  const user = access.user;

  // Validate month format
  const monthRegex = /^\d{4}-\d{2}$/;
  if (!monthRegex.test(data.month)) {
    return apiError("Month must be in YYYY-MM format", 400);
  }

  try {
    const result = await generateWpsFile(data.companySlug, data.country, data.month);

    await logAudit({
      userEmail: user.email,
      userUid: user.uid,
      action: "generate_wps_file",
      entity: "wps_file",
      companySlug: data.companySlug,
      details: {
        country: data.country,
        month: data.month,
        totalEmployees: result.totalEmployees,
        totalAmount: result.totalAmount,
      },
    });

    return apiOk({
      ...result,
      // Don't return full fileContent in response — it can be very large
      fileContentPreview: result.fileContent.substring(0, 500),
    }, 201);
  } catch (err) {
    const message = err instanceof Error ? err.message : "WPS generation failed";
    return apiError(message, 400);
  }
});

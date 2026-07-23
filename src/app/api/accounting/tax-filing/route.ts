/**
 * /api/accounting/tax-filing
 * GET — List tax filings (companySlug + optional country/taxType filters)
 * POST — Generate VAT return (companySlug, country, periodFrom, periodTo)
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requirePermissionForCompany } from "@/lib/middleware";
import { logAudit } from "@/lib/audit";
import { num } from "@/lib/money";
import { generateVATReturn, calculateZakat } from "@/lib/accounting/tax-compliance";
import { apiError, withErrorHandler, parseJsonBody } from "@/lib/api";
import { z } from "zod";

// ── GET: List tax filings ────────────────────────────────────────────────────────

export const GET = withErrorHandler(async (req: NextRequest) => {
  const sp = req.nextUrl.searchParams;
  const companySlug = sp.get("companySlug");
  if (!companySlug) return apiError("companySlug مطلوب", 400);

  const access = await requirePermissionForCompany(req, "finance_access", companySlug);
  if ("error" in access) return access.error;

  const where: Record<string, unknown> = { companySlug };
  const country = sp.get("country");
  if (country) where.country = country;
  const taxType = sp.get("taxType");
  if (taxType) where.taxType = taxType;

  const filings = await db.taxFiling.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 500,
  });

  return NextResponse.json({
    filings: filings.map((f) => ({
      ...f,
      totalSales: num(f.totalSales, 3),
      totalPurchases: num(f.totalPurchases, 3),
      vatDue: num(f.vatDue, 3),
    })),
  });
});

// ── POST: Generate VAT return or Zakat ────────────────────────────────────────────

const VATReturnSchema = z.object({
  companySlug: z.string().min(1),
  country: z.string().min(1),
  periodFrom: z.string().min(1),
  periodTo: z.string().min(1),
});

const ZakatSchema = z.object({
  companySlug: z.string().min(1),
});

// Use a discriminated union based on action type
const ActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("vat"), ...VATReturnSchema.shape }),
  z.object({ action: z.literal("zakat"), ...ZakatSchema.shape }),
]);

export const POST = withErrorHandler(async (req: NextRequest) => {
  const body = await parseJsonBody(req);
  const parsed = ActionSchema.safeParse(body);
  if (!parsed.success) return apiError(parsed.error.issues[0]?.message || "Invalid input: must specify action as 'vat' or 'zakat'", 400);
  const data = parsed.data;

  if (data.action === "vat") {
    const access = await requirePermissionForCompany(req, "finance_access", data.companySlug);
    if ("error" in access) return access.error;
    const user = access.user;

    const result = await generateVATReturn(
      data.companySlug,
      data.country,
      data.periodFrom,
      data.periodTo,
      user.email,
      user.uid,
    );

    await logAudit({
      userEmail: user.email,
      userUid: user.uid,
      action: "generate_vat_return",
      entity: "tax_filing",
      companySlug: data.companySlug,
      details: { country: data.country, periodFrom: data.periodFrom, periodTo: data.periodTo },
    });

    return NextResponse.json({ ok: true, vatReturn: result });
  }

  if (data.action === "zakat") {
    const access = await requirePermissionForCompany(req, "finance_access", data.companySlug);
    if ("error" in access) return access.error;
    const user = access.user;

    const result = await calculateZakat(
      data.companySlug,
      user.email,
      user.uid,
    );

    await logAudit({
      userEmail: user.email,
      userUid: user.uid,
      action: "calculate_zakat",
      entity: "tax_filing",
      companySlug: data.companySlug,
      details: { action: "zakat" },
    });

    return NextResponse.json({ ok: true, zakat: result });
  }

  return apiError("Unknown action", 400);
});

/**
 * /api/accounting/letters-of-credit/[id]
 * GET: Get single LC
 * PATCH: Amend, utilize, or cancel LC
 */
import { NextRequest, NextResponse } from "next/server";
import { dbTyped as db } from "@/lib/db";
import { requirePermissionForCompany } from "@/lib/middleware";
import { logAudit } from "@/lib/audit";
import { num } from "@/lib/money";
import { apiError, withErrorHandler, parseJsonBody, parseJsonField } from "@/lib/api";
import { amendLC, utilizeLC, cancelLC } from "@/lib/accounting/trade-finance";
import { z } from "zod";
import { rateLimitResponse, LIMITS } from "@/lib/rateLimit";

const AmendLCSchema = z.object({
  companySlug: z.string().min(1),
  action: z.enum(["amend", "utilize", "cancel"]),
  amount: z.union([z.number(), z.string()]).optional(),
  expiryDate: z.string().optional(),
  documentsRequired: z.array(z.string()).optional(),
  notes: z.string().optional(),
  utilizationAmount: z.union([z.number(), z.string()]).optional(),
});

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return withErrorHandler(async () => {
    const { id } = await params;
    if (!id) return apiError("معرف الاعتماد المستندي غير صالح", 400);

    const sp = req.nextUrl.searchParams;
    const companySlug = sp.get("companySlug");
    if (!companySlug) return apiError("companySlug مطلوب", 400);

    const access = await requirePermissionForCompany(req, "finance_access", companySlug);
    if ("error" in access) return access.error;

    const lc = await db.letterOfCredit.findFirst({
      where: { id, companySlug },
      include: {
        supplier: { select: { id: true, name: true } },
      },
    });

    if (!lc) return apiError("الاعتماد المستندي غير موجود", 404);

    return NextResponse.json({
      id: lc.id,
      lcNumber: lc.lcNumber,
      supplierId: lc.supplierId,
      supplierName: lc.supplier?.name ?? '',
      bankAccountId: lc.bankAccountId,
      bankName: lc.bankAccountId ?? '',
      amount: num(lc.amount, 3),
      currency: lc.currency,
      issueDate: lc.issueDate,
      expiryDate: lc.expiryDate,
      status: lc.status,
      utilizationAmount: num(lc.utilizationAmount, 3),
      documentsRequired: parseJsonField<string[]>(lc.documentsRequired, []),
      notes: lc.description ?? '',
      createdAt: lc.createdAt,
      updatedAt: lc.updatedAt,
    });
  })();
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  // P5-H2: Rate limit PATCH /api/accounting-letters-of-credit-id — 30/min/IP (API_WRITE).
  const rl = await rateLimitResponse(req, "patch:accounting-letters-of-credit-id", LIMITS.API_WRITE);
  if (rl) return rl;

  return withErrorHandler(async () => {
    const { id } = await params;
    if (!id) return apiError("معرف الاعتماد المستندي غير صالح", 400);

    const body = await parseJsonBody(req);
    const parsed = AmendLCSchema.safeParse(body);
    if (!parsed.success) return apiError(parsed.error.issues[0]?.message || "مدخلات غير صالحة", 400);

    const data = parsed.data;
    const access = await requirePermissionForCompany(req, "finance_access", data.companySlug);
    if ("error" in access) return access.error;
    const user = access.user;

    let result: { ok: boolean; lc?: Record<string, unknown>; error?: string; jeId?: string };

    // Note (P2): amendLC/utilizeLC/cancelLC expect `lcId: number` but
    // LetterOfCredit.id is a string cuid. Legacy `db: any` hid this; Number()
    // produces NaN for cuids (same as previous parseInt behavior). The lib
    // functions have their own type bugs to be fixed separately.
    const lcId = Number(id);

    switch (data.action) {
      case "amend":
        result = await amendLC(data.companySlug, lcId, {
          amount: data.amount ? String(data.amount) : undefined,
          expiryDate: data.expiryDate,
          documentsRequired: data.documentsRequired,
          notes: data.notes,
        });
        break;
      case "utilize":
        if (!data.utilizationAmount) return apiError("مبلغ الاستخدام مطلوب", 400);
        result = await utilizeLC(data.companySlug, lcId, String(data.utilizationAmount), user.email);
        break;
      case "cancel":
        result = await cancelLC(data.companySlug, lcId);
        break;
      default:
        return apiError("إجراء غير صالح", 400);
    }

    if (!result.ok) return apiError(result.error || "فشل تحديث الاعتماد المستندي", 400);

    await logAudit({
      userEmail: user.email,
      userUid: user.uid,
      action: data.action,
      entity: "letter_of_credit",
      entityId: id,
      companySlug: data.companySlug,
      details: { action: data.action, lcId: id },
    });

    return NextResponse.json({ ok: true, letterOfCredit: result.lc, jeId: result.jeId });
  })();
}

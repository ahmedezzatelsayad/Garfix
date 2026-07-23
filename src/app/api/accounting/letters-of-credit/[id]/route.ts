/**
 * /api/accounting/letters-of-credit/[id]
 * GET: Get single LC
 * PATCH: Amend, utilize, or cancel LC
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requirePermissionForCompany } from "@/lib/middleware";
import { logAudit } from "@/lib/audit";
import { num } from "@/lib/money";
import { apiError, withErrorHandler, parseJsonBody, parseJsonField } from "@/lib/api";
import { amendLC, utilizeLC, cancelLC } from "@/lib/accounting/trade-finance";
import { z } from "zod";

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
    const { id: idStr } = await params;
    const id = parseInt(idStr, 10);
    if (!id || isNaN(id)) return apiError("معرف الاعتماد المستندي غير صالح", 400);

    const sp = req.nextUrl.searchParams;
    const companySlug = sp.get("companySlug");
    if (!companySlug) return apiError("companySlug مطلوب", 400);

    const access = await requirePermissionForCompany(req, "finance_access", companySlug);
    if ("error" in access) return access.error;

    const lc = await db.letterOfCredit.findFirst({
      where: { id, companySlug },
      include: {
        supplier: { select: { id: true, name: true, nameEn: true } },
        bankAccount: { select: { id: true, bankName: true, accountNumber: true, currency: true, balance: true } },
      },
    });

    if (!lc) return apiError("الاعتماد المستندي غير موجود", 404);

    return NextResponse.json({
      id: lc.id,
      lcNumber: lc.lcNumber,
      supplierId: lc.supplierId,
      supplierName: lc.supplier.name,
      bankAccountId: lc.bankAccountId,
      bankName: lc.bankAccount.bankName,
      amount: num(lc.amount, 3),
      currency: lc.currency,
      issueDate: lc.issueDate,
      expiryDate: lc.expiryDate,
      status: lc.status,
      utilizationAmount: num(lc.utilizationAmount, 3),
      documentsRequired: parseJsonField<string[]>(lc.documentsRequired, []),
      notes: lc.notes,
      createdAt: lc.createdAt,
      updatedAt: lc.updatedAt,
    });
  })();
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return withErrorHandler(async () => {
    const { id: idStr } = await params;
    const id = parseInt(idStr, 10);
    if (!id || isNaN(id)) return apiError("معرف الاعتماد المستندي غير صالح", 400);

    const body = await parseJsonBody(req);
    const parsed = AmendLCSchema.safeParse(body);
    if (!parsed.success) return apiError(parsed.error.issues[0]?.message || "مدخلات غير صالحة", 400);

    const data = parsed.data;
    const access = await requirePermissionForCompany(req, "finance_access", data.companySlug);
    if ("error" in access) return access.error;
    const user = access.user;

    let result: { ok: boolean; lc?: Record<string, unknown>; error?: string; jeId?: number };

    switch (data.action) {
      case "amend":
        result = await amendLC(data.companySlug, id, {
          amount: data.amount ? String(data.amount) : undefined,
          expiryDate: data.expiryDate,
          documentsRequired: data.documentsRequired,
          notes: data.notes,
        });
        break;
      case "utilize":
        if (!data.utilizationAmount) return apiError("مبلغ الاستخدام مطلوب", 400);
        result = await utilizeLC(data.companySlug, id, String(data.utilizationAmount), user.email);
        break;
      case "cancel":
        result = await cancelLC(data.companySlug, id);
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

/**
 * /api/accounting/letters-of-credit
 * GET: List LCs (?companySlug=X&status=issued)
 * POST: Create LC
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requirePermissionForCompany } from "@/lib/middleware";
import { logAudit } from "@/lib/audit";
import { num } from "@/lib/money";
import { apiError, withErrorHandler, parseJsonBody, parseJsonField } from "@/lib/api";
import { trackLetterOfCredit } from "@/lib/accounting/trade-finance";
import { z } from "zod";

const CreateLCSchema = z.object({
  companySlug: z.string().min(1),
  lcNumber: z.string().min(1),
  supplierId: z.number().int(),
  bankAccountId: z.number().int(),
  amount: z.union([z.number(), z.string()]),
  currency: z.string().default("KWD"),
  issueDate: z.string().min(1),
  expiryDate: z.string().min(1),
  documentsRequired: z.array(z.string()).optional(),
  notes: z.string().optional(),
});

export const GET = withErrorHandler(async (req: NextRequest) => {
  const sp = req.nextUrl.searchParams;
  const companySlug = sp.get("companySlug");
  if (!companySlug) return apiError("companySlug مطلوب", 400);

  const access = await requirePermissionForCompany(req, "finance_access", companySlug);
  if ("error" in access) return access.error;

  const where: Record<string, unknown> = { companySlug };
  const status = sp.get("status");
  if (status) where.status = status;

  const lcs = await db.letterOfCredit.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 200,
    include: {
      supplier: { select: { id: true, name: true, nameEn: true } },
      bankAccount: { select: { id: true, bankName: true, accountNumber: true, currency: true } },
    },
  });

  return NextResponse.json({
    lettersOfCredit: lcs.map((lc) => ({
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
    })),
  });
});

export const POST = withErrorHandler(async (req: NextRequest) => {
  const body = await parseJsonBody(req);
  const parsed = CreateLCSchema.safeParse(body);
  if (!parsed.success) return apiError(parsed.error.issues[0]?.message || "مدخلات غير صالحة", 400);

  const data = parsed.data;
  const access = await requirePermissionForCompany(req, "finance_access", data.companySlug);
  if ("error" in access) return access.error;
  const user = access.user;

  const result = await trackLetterOfCredit(data.companySlug, {
    lcNumber: data.lcNumber,
    supplierId: data.supplierId,
    bankAccountId: data.bankAccountId,
    amount: String(data.amount),
    currency: data.currency,
    issueDate: data.issueDate,
    expiryDate: data.expiryDate,
    documentsRequired: data.documentsRequired,
    notes: data.notes,
  });

  if (!result.ok) return apiError(result.error || "فشل إنشاء الاعتماد المستندي", 400);

  await logAudit({
    userEmail: user.email,
    userUid: user.uid,
    action: "create",
    entity: "letter_of_credit",
    entityId: result.lc?.id as string | undefined,
    companySlug: data.companySlug,
    details: { lcNumber: data.lcNumber, amount: String(data.amount), currency: data.currency },
  });

  return NextResponse.json({ ok: true, letterOfCredit: result.lc }, { status: 201 });
});

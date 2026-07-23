/**
 * /api/accounting/vouchers
 * GET  — List vouchers (?companySlug=X&voucherType=receipt&status=draft)
 * POST — Create voucher
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requirePermissionForCompany, hasPermission } from "@/lib/middleware";
import { resolveAuth, assertCompanyAccess, hasUnrestrictedScope } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { createVoucher, type VoucherType } from "@/lib/accounting/vouchers";
import { apiError, apiOk, withErrorHandler, parseJsonBody } from "@/lib/api";
import { num } from "@/lib/money";
import { z } from "zod";

// ─── GET ─────────────────────────────────────────────────────────────────

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

  const voucherType = sp.get("voucherType");
  if (voucherType) where.voucherType = voucherType;

  const status = sp.get("status");
  if (status) where.status = status;

  const vouchers = await db.paymentVoucher.findMany({
    where,
    orderBy: { date: "desc" },
    take: 500,
    include: {
      client: { select: { id: true, name: true } },
      supplier: { select: { id: true, name: true } },
      bankAccount: { select: { id: true, bankName: true, accountName: true } },
      journalEntry: { select: { id: true, status: true } },
    },
  });

  return apiOk({
    vouchers: vouchers.map((v) => ({
      ...v,
      amount: num(v.amount, 3),
    })),
  });
});

// ─── POST ──────────────────────────────────────────────────────────────

const CreateVoucherSchema = z.object({
  companySlug: z.string().min(1),
  voucherType: z.enum(["receipt", "payment"]),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD"),
  amount: z.union([z.number(), z.string()]),
  currency: z.enum(["KWD", "SAR", "AED", "EGP", "BHD", "OMR", "QAR"]),
  payee: z.string().min(1, "Payee is required"),
  payer: z.string().min(1, "Payer is required"),
  description: z.string().optional(),
  reference: z.string().optional(),
  clientId: z.number().int().optional(),
  supplierId: z.number().int().optional(),
  bankAccountId: z.number().int().optional(),
  glAccountId: z.number().int().optional(),
});

export const POST = withErrorHandler(async (req: NextRequest) => {
  const body = await parseJsonBody(req);
  const parsed = CreateVoucherSchema.safeParse(body);
  if (!parsed.success) return apiError(parsed.error.issues[0]?.message || "Invalid input", 400);
  const data = parsed.data;

  const access = await requirePermissionForCompany(req, "finance_access", data.companySlug);
  if ("error" in access) return access.error;
  const user = access.user;

  const result = await createVoucher({
    companySlug: data.companySlug,
    voucherType: data.voucherType as VoucherType,
    date: data.date,
    amount: data.amount,
    currency: data.currency,
    payee: data.payee,
    payer: data.payer,
    description: data.description,
    reference: data.reference,
    clientId: data.clientId,
    supplierId: data.supplierId,
    bankAccountId: data.bankAccountId,
    glAccountId: data.glAccountId,
    createdBy: user.email,
  });

  await logAudit({
    userEmail: user.email,
    userUid: user.uid,
    action: "create",
    entity: "voucher",
    entityId: result.voucher.id,
    companySlug: data.companySlug,
    details: { voucherNumber: result.voucher.voucherNumber, voucherType: data.voucherType, amount: num(data.amount, 3).toFixed(3) },
  });

  return apiOk({ ok: true, voucher: result.voucher, journalEntry: result.journalEntry });
});

/**
 * /api/accounting/vouchers/[id]
 * GET  — Single voucher details
 * PATCH — Approve or cancel voucher
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requirePermissionForCompany } from "@/lib/middleware";
import { logAudit } from "@/lib/audit";
import { cancelVoucher } from "@/lib/accounting/vouchers";
import { numberToArabicText, type SupportedCurrency } from "@/lib/accounting/arabic-amount-text";
import { num } from "@/lib/money";
import { apiError, apiOk, withErrorHandler, parseJsonBody } from "@/lib/api";
import { z } from "zod";

type RouteParams = { params: Promise<{ id: string }> };

// ─── GET ─────────────────────────────────────────────────────────────────

export const GET = withErrorHandler(async (req: NextRequest, { params }: RouteParams) => {
  const { id } = await params;
  const voucherId = parseInt(id);

  const voucher = await db.paymentVoucher.findUnique({
    where: { id: voucherId },
    include: {
      client: { select: { id: true, name: true } },
      supplier: { select: { id: true, name: true } },
      bankAccount: { select: { id: true, bankName: true, accountName: true, currency: true } },
      glAccount: { select: { id: true, code: true, nameAr: true } },
      journalEntry: {
        select: {
          id: true,
          status: true,
          description: true,
          reference: true,
          lines: {
            include: { account: { select: { code: true, nameAr: true } } },
          },
        },
      },
    },
  });
  if (!voucher) return apiError("Voucher not found", 404);

  const access = await requirePermissionForCompany(req, "finance_access", voucher.companySlug);
  if ("error" in access) return access.error;

  // Check if request is for print view
  const sp = req.nextUrl.searchParams;
  const isPrint = sp.get("print") === "true";

  const result: Record<string, unknown> = {
    ...voucher,
    amount: num(voucher.amount, 3),
    amountArText: voucher.amountArText || numberToArabicText(num(voucher.amount, 3), voucher.currency as SupportedCurrency),
  };

  if (isPrint) {
    // Include printable voucher data with Arabic amount text
    result.printData = {
      voucherNumber: voucher.voucherNumber,
      voucherType: voucher.voucherType === "receipt" ? "سند قبض" : "سند دفع",
      date: voucher.date,
      amount: num(voucher.amount, 3).toFixed(3),
      amountArText: voucher.amountArText || numberToArabicText(num(voucher.amount, 3), voucher.currency as SupportedCurrency),
      currency: voucher.currency,
      payee: voucher.payee,
      payer: voucher.payer,
      description: voucher.description,
      reference: voucher.reference,
      clientName: voucher.client?.name,
      supplierName: voucher.supplier?.name,
      bankName: voucher.bankAccount?.bankName,
      accountName: voucher.bankAccount?.accountName,
      status: voucher.status,
      createdBy: voucher.createdBy,
      createdAt: voucher.createdAt.toISOString(),
    };
  }

  return apiOk(result);
});

// ─── PATCH ────────────────────────────────────────────────────────────

const PatchSchema = z.object({
  companySlug: z.string().min(1).optional(),
  action: z.enum(["approve", "cancel"]),
  reason: z.string().optional(), // required for cancel
});

export const PATCH = withErrorHandler(async (req: NextRequest, { params }: RouteParams) => {
  const { id } = await params;
  const voucherId = parseInt(id);

  const body = await parseJsonBody(req);
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) return apiError(parsed.error.issues[0]?.message || "Invalid input", 400);
  const data = parsed.data;

  const voucher = await db.paymentVoucher.findUnique({
    where: { id: voucherId },
  });
  if (!voucher) return apiError("Voucher not found", 404);

  const companySlug = data.companySlug || voucher.companySlug;
  const access = await requirePermissionForCompany(req, "finance_access", companySlug);
  if ("error" in access) return access.error;
  const user = access.user;

  if (data.action === "approve") {
    if (voucher.status !== "draft") return apiError("Only draft vouchers can be approved", 400);

    const updated = await db.paymentVoucher.update({
      where: { id: voucherId },
      data: { status: "posted", approvedBy: user.email },
    });

    await logAudit({
      userEmail: user.email, userUid: user.uid,
      action: "approve", entity: "voucher", entityId: voucherId, companySlug,
      details: { voucherNumber: voucher.voucherNumber, priorStatus: voucher.status },
    });

    return apiOk({ ok: true, voucher: { ...updated, amount: num(updated.amount, 3) } });
  }

  if (data.action === "cancel") {
    if (!data.reason) return apiError("Reason is required for cancellation", 400);

    const result = await cancelVoucher(companySlug, voucherId, data.reason, user.email);

    await logAudit({
      userEmail: user.email, userUid: user.uid,
      action: "cancel", entity: "voucher", entityId: voucherId, companySlug,
      details: { voucherNumber: voucher.voucherNumber, reason: data.reason, reversedJEId: result.reversedJEId },
    });

    return apiOk({ ...result });
  }

  return apiError("Unknown action", 400);
});

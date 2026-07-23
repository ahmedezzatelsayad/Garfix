/**
 * /api/accounting/vouchers/[id]/approve
 * POST — approve a payment voucher
 */
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { requirePermissionForCompany } from "@/lib/middleware";
import { logAudit } from "@/lib/audit";
import { num } from "@/lib/money";
import { apiError, withErrorHandler, parseJsonBody, apiOk } from "@/lib/api";
import { z } from "zod";

type RouteParams = { params: Promise<{ id: string }> };

const ApproveSchema = z.object({
  companySlug: z.string().min(1),
});

export const POST = withErrorHandler(async (req: NextRequest, { params }: RouteParams) => {
  const { id } = await params;
  const voucherId = parseInt(id);

  const body = await parseJsonBody(req);
  const parsed = ApproveSchema.safeParse(body);
  if (!parsed.success) return apiError(parsed.error.issues[0]?.message || "Invalid input", 400);
  const data = parsed.data;

  const voucher = await db.paymentVoucher.findUnique({
    where: { id: voucherId },
  });
  if (!voucher) return apiError("Voucher not found", 404);
  if (voucher.companySlug !== data.companySlug) return apiError("Voucher does not belong to this company", 403);

  const access = await requirePermissionForCompany(req, "finance_access", data.companySlug);
  if ("error" in access) return access.error;
  const user = access.user;

  if (voucher.status !== "draft") return apiError("Only draft vouchers can be approved", 400);

  const updated = await db.paymentVoucher.update({
    where: { id: voucherId },
    data: { status: "posted", approvedBy: user.email },
  });

  await logAudit({
    userEmail: user.email,
    userUid: user.uid,
    action: "approve_voucher",
    entity: "voucher",
    entityId: voucherId,
    companySlug: data.companySlug,
    details: { voucherNumber: voucher.voucherNumber, priorStatus: voucher.status },
  });

  return apiOk({ ok: true, voucher: { ...updated, amount: num(updated.amount, 3) } });
});

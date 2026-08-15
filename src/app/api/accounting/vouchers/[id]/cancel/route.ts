/**
 * /api/accounting/vouchers/[id]/cancel
 * POST — cancel a payment voucher
 */
import { NextRequest } from "next/server";
import { dbTyped as db } from "@/lib/db";
import { requirePermissionForCompany } from "@/lib/middleware";
import { logAudit } from "@/lib/audit";
import { cancelVoucher } from "@/lib/accounting/vouchers";
import { apiError, withErrorHandler, parseJsonBody, apiOk } from "@/lib/api";
import { z } from "zod";
import { rateLimitResponse, LIMITS } from "@/lib/rateLimit";

type RouteParams = { params: Promise<{ id: string }> };

const CancelSchema = z.object({
  companySlug: z.string().min(1),
  reason: z.string().min(1),
});

export const POST = withErrorHandler(async (req: NextRequest, { params }: RouteParams) => {
  // P5-H2: Rate limit POST /api/accounting-vouchers-id-cancel — 30/min/IP (API_WRITE).
  const rl = await rateLimitResponse(req, "post:accounting-vouchers-id-cancel", LIMITS.API_WRITE);
  if (rl) return rl;

  const { id: voucherId } = await params;

  const body = await parseJsonBody(req);
  const parsed = CancelSchema.safeParse(body);
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

  const result = await cancelVoucher(data.companySlug, voucherId, data.reason, user.email);

  await logAudit({
    userEmail: user.email,
    userUid: user.uid,
    action: "cancel_voucher",
    entity: "voucher",
    entityId: voucherId,
    companySlug: data.companySlug,
    details: { voucherNumber: voucher.voucherNumber, reason: data.reason },
  });

  return apiOk({ ...result });
});

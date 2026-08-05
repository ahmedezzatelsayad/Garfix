/**
 * /api/accounting/commissions/[id]/post-as-journal-entry
 * POST — post a commission as a journal entry
 */
import { NextRequest } from "next/server";
import { dbTyped as db } from "@/lib/db";
import { requirePermissionForCompany } from "@/lib/middleware";
import { logAudit } from "@/lib/audit";
import { postCommissionsJE } from "@/lib/accounting/commissions";
import { num } from "@/lib/money";
import { apiError, withErrorHandler, parseJsonBody, apiOk } from "@/lib/api";
import { z } from "zod";

type RouteParams = { params: Promise<{ id: string }> };

const PostJESchema = z.object({
  companySlug: z.string().min(1),
});

export const POST = withErrorHandler(async (req: NextRequest, { params }: RouteParams) => {
  const { id } = await params;
  const commissionId = id;

  const body = await parseJsonBody(req);
  const parsed = PostJESchema.safeParse(body);
  if (!parsed.success) return apiError(parsed.error.issues[0]?.message || "Invalid input", 400);
  const data = parsed.data;

  const access = await requirePermissionForCompany(req, "finance_access", data.companySlug);
  if ("error" in access) return access.error;
  const user = access.user;

  const commission = await db.hRCommission.findUnique({
    where: { id: commissionId },
  });
  if (!commission) return apiError("Commission not found", 404);
  // TODO(P2-Sprint5-A): HRCommission has no `companySlug`/`isPaid`/`date`/`type`
  // columns — only `period` (String) and `status` (draft/paid/cancelled).
  // The legacy `db: any` hid these missing accesses. Use employee.companySlug
  // for ownership check and `status === "paid"` instead of `isPaid`.
  const employee = await db.employee.findUnique({
    where: { id: commission.employeeId },
  });
  if (employee?.companySlug !== data.companySlug) return apiError("Commission does not belong to this company", 403);

  if (commission.status === "paid") return apiError("Commission is already paid/posted", 400);

  // Post the commission as a journal entry using proper CommissionEntry format
  const jeResult = await postCommissionsJE(
    data.companySlug,
    [{
      // TODO(P2-Sprint5-A): CommissionEntry.salespersonId is `string` (cuid)
      // — pass commission.employeeId directly. Legacy `db: any` hid the
      // (incorrect) Number() coercion that would have produced NaN.
      salespersonId: commission.employeeId,
      name: employee?.name || "",
      totalSales: "0",
      commissionRate: "0",
      commissionAmount: commission.amount.toString(),
    }],
    // TODO(P2-Sprint5-A): HRCommission has no `date` field — use `period`.
    { from: commission.period, to: commission.period },
    user.email,
  );

  // Mark commission as paid
  await db.hRCommission.update({
    where: { id: commissionId },
    // TODO(P2-Sprint5-A): HRCommission has no `isPaid` field — use `status`.
    data: { status: "paid" },
  });

  await logAudit({
    userEmail: user.email,
    userUid: user.uid,
    action: "post_commission_as_je",
    entity: "commission",
    entityId: commissionId,
    companySlug: data.companySlug,
    details: {
      commissionId,
      amount: num(commission.amount, 3),
      // TODO(P2-Sprint5-A): HRCommission has no `type` field — empty string.
      type: "",
      jeId: jeResult.jeId,
    },
  });

  return apiOk({
    ok: true,
    jeId: jeResult.jeId,
    lines: jeResult.lines,
    commissionId,
  });
});

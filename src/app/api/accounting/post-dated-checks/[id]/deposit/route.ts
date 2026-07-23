/**
 * /api/accounting/post-dated-checks/[id]/deposit
 * POST — deposit a post-dated check
 */
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { requirePermissionForCompany } from "@/lib/middleware";
import { logAudit } from "@/lib/audit";
import { num } from "@/lib/money";
import { apiError, withErrorHandler, parseJsonBody, apiOk } from "@/lib/api";
import { z } from "zod";

type RouteParams = { params: Promise<{ id: string }> };

const DepositSchema = z.object({
  companySlug: z.string().min(1),
});

export const POST = withErrorHandler(async (req: NextRequest, { params }: RouteParams) => {
  const { id } = await params;
  const checkId = parseInt(id);

  const body = await parseJsonBody(req);
  const parsed = DepositSchema.safeParse(body);
  if (!parsed.success) return apiError(parsed.error.issues[0]?.message || "Invalid input", 400);
  const data = parsed.data;

  const access = await requirePermissionForCompany(req, "finance_access", data.companySlug);
  if ("error" in access) return access.error;
  const user = access.user;

  const check = await db.postDatedCheck.findUnique({
    where: { id: checkId },
  });
  if (!check) return apiError("Post-dated check not found", 404);
  if (check.companySlug !== data.companySlug) return apiError("PDC does not belong to this company", 403);

  // Only pending checks can be deposited
  if (check.status !== "pending") {
    return apiError("Only pending PDCs can be deposited", 400);
  }

  const updated = await db.postDatedCheck.update({
    where: { id: checkId },
    data: {
      status: "deposited",
      clearedAt: new Date(),
    },
  });

  await logAudit({
    userEmail: user.email,
    userUid: user.uid,
    action: "deposit_pdc",
    entity: "post_dated_check",
    entityId: checkId,
    companySlug: data.companySlug,
    details: {
      checkNumber: check.checkNumber,
      bankName: check.bankName,
      amount: num(check.amount, 3),
      direction: check.direction,
    },
  });

  return apiOk({ ok: true, check: { ...updated, amount: num(updated.amount, 3) } });
});

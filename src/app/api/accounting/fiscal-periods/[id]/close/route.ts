/**
 * /api/accounting/fiscal-periods/[id]/close
 * POST — close a fiscal period
 */
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { requirePermissionForCompany } from "@/lib/middleware";
import { logAudit } from "@/lib/audit";
import { apiError, withErrorHandler, apiOk } from "@/lib/api";

type RouteParams = { params: Promise<{ id: string }> };

export const POST = withErrorHandler(async (req: NextRequest, { params }: RouteParams) => {
  const { id } = await params;
  const companySlug = req.nextUrl.searchParams.get("companySlug");
  if (!companySlug) return apiError("companySlug مطلوب", 400);

  const access = await requirePermissionForCompany(req, "finance_access", companySlug);
  if ("error" in access) return access.error;
  const user = access.user;

  const period = await db.fiscalPeriod.findFirst({
    where: { id: parseInt(id), companySlug },
  });
  if (!period) return apiError("Fiscal period not found", 404);

  if (period.status === "closed") return apiError("Period is already closed", 400);
  if (period.status === "locked") return apiError("Period is locked and cannot be closed", 400);

  const updated = await db.fiscalPeriod.update({
    where: { id: parseInt(id) },
    data: {
      status: "closed",
      closedBy: user.email,
      closedAt: new Date(),
    },
  });

  await logAudit({
    userEmail: user.email,
    userUid: user.uid,
    action: "close_period",
    entity: "fiscal_period",
    entityId: updated.id,
    companySlug,
    details: { name: updated.name, periodType: updated.periodType, fiscalYear: updated.fiscalYear },
  });

  return apiOk({ ok: true, period: updated });
});

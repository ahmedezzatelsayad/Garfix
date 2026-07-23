/**
 * /api/accounting/fiscal-periods/[id]/reopen
 * POST — reopen a fiscal period
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

  if (period.status !== "closed") return apiError("Only closed periods can be reopened", 400);

  const updated = await db.fiscalPeriod.update({
    where: { id: parseInt(id) },
    data: {
      status: "open",
      closedBy: null,
      closedAt: null,
    },
  });

  await logAudit({
    userEmail: user.email,
    userUid: user.uid,
    action: "reopen_period",
    entity: "fiscal_period",
    entityId: updated.id,
    companySlug,
    details: { name: updated.name, priorStatus: "closed" },
  });

  return apiOk({ ok: true, period: updated });
});

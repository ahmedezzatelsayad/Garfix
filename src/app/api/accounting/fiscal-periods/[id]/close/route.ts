/**
 * /api/accounting/fiscal-periods/[id]/close
 * POST — close a fiscal period
 *
 * FIX: Now uses the proper closeFiscalPeriod engine which creates
 * closing entries (revenue/expense → income summary → retained earnings),
 * updates account balances, and locks posted JEs in the period.
 */
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { requirePermissionForCompany } from "@/lib/middleware";
import { closeFiscalPeriod } from "@/lib/accounting/period-close";
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

  // Use the proper closeFiscalPeriod engine for full period close
  try {
    const result = await closeFiscalPeriod(
      companySlug,
      period.name,
      user.email,
      user.uid,
    );

    return apiOk({
      ok: true,
      period: {
        id: result.periodId,
        name: result.periodName,
        status: "closed",
        closedBy: result.closedBy,
        closedAt: result.closedAt,
        netIncome: result.netIncome,
        closingJEId: result.closingJEId,
        revenueClosed: result.revenueClosed,
        expensesClosed: result.expensesClosed,
        retainedEarningsUpdate: result.retainedEarningsUpdate,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return apiError(message, 400);
  }
});

/**
 * /api/accounting/budgets/[id]/approve
 * POST — approve a budget
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
  const budgetId = parseInt(id);

  const body = await parseJsonBody(req);
  const parsed = ApproveSchema.safeParse(body);
  if (!parsed.success) return apiError(parsed.error.issues[0]?.message || "Invalid input", 400);
  const data = parsed.data;

  const access = await requirePermissionForCompany(req, "finance_access", data.companySlug);
  if ("error" in access) return access.error;
  const user = access.user;

  const budget = await db.budget.findUnique({
    where: { id: budgetId },
  });
  if (!budget) return apiError("Budget not found", 404);
  if (budget.companySlug !== data.companySlug) return apiError("Budget does not belong to this company", 403);

  // Only draft budgets can be approved
  if (budget.status !== "draft") {
    return apiError("Only draft budgets can be approved", 400);
  }

  // Approve all budget entries for the same periodName
  const result = await db.budget.updateMany({
    where: {
      companySlug: data.companySlug,
      periodName: budget.periodName,
      status: "draft",
    },
    data: { status: "approved" },
  });

  await logAudit({
    userEmail: user.email,
    userUid: user.uid,
    action: "approve_budget",
    entity: "budget",
    entityId: budgetId,
    companySlug: data.companySlug,
    details: {
      periodName: budget.periodName,
      fiscalYear: budget.fiscalYear,
      approvedCount: result.count,
    },
  });

  return apiOk({
    ok: true,
    approved: result.count,
    periodName: budget.periodName,
  });
});

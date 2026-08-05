/**
 * /api/accounting/budgets/[id]/revise
 * POST — revise a budget (creates revised budget version)
 */
import { NextRequest } from "next/server";
import { dbTyped as db } from "@/lib/db";
import { requirePermissionForCompany } from "@/lib/middleware";
import { logAudit } from "@/lib/audit";
import { num, toNum } from "@/lib/money";
import { apiError, withErrorHandler, parseJsonBody, apiOk } from "@/lib/api";
import { z } from "zod";
import { entityId, entityIdOptional, entityIdNullable } from "@/lib/validation";
import { rateLimitResponse, LIMITS } from "@/lib/rateLimit";

type RouteParams = { params: Promise<{ id: string }> };

const BudgetEntrySchema = z.object({
  accountId: entityId,
  // P2-Sprint6: Budget.costCenterId is now String? (cuid FK) — accept string input.
  costCenterId: entityIdOptional,
  plannedAmount: z.union([z.number(), z.string()]),
});

const ReviseSchema = z.object({
  companySlug: z.string().min(1),
  revisedAmounts: z.array(BudgetEntrySchema).min(1),
});

export const POST = withErrorHandler(async (req: NextRequest, { params }: RouteParams) => {
  // P5-H2: Rate limit POST /api/accounting-budgets-id-revise — 30/min/IP (API_WRITE).
  const rl = await rateLimitResponse(req, "post:accounting-budgets-id-revise", LIMITS.API_WRITE);
  if (rl) return rl;

  const { id } = await params;
  const budgetId = id;

  const body = await parseJsonBody(req);
  const parsed = ReviseSchema.safeParse(body);
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

  // Only approved budgets can be revised
  if (budget.status !== "approved") {
    return apiError("Only approved budgets can be revised", 400);
  }

  // Mark all entries for this periodName as revised
  await db.budget.updateMany({
    where: {
      companySlug: data.companySlug,
      periodName: budget.periodName,
      status: "approved",
    },
    data: { status: "revised" },
  });

  // Update individual entries with revised amounts
  const revisedBudgets = await db.$transaction(async (tx) => {
    const results: Array<Record<string, unknown>> = [];

    for (const entry of data.revisedAmounts) {
      const existing = await tx.budget.findFirst({
        where: {
          companySlug: data.companySlug,
          periodName: budget.periodName,
          // P2-Sprint6: Budget.accountId/costCenterId are now String? (cuid FKs).
          // entityId/entityIdOptional already transform input to string.
          accountId: entry.accountId,
          costCenterId: entry.costCenterId ?? null,
        },
      });

      if (existing) {
        const updated = await tx.budget.update({
          where: { id: existing.id },
          data: {
            plannedAmount: toNum(entry.plannedAmount),
            status: "revised",
          },
        });
        results.push({
          id: updated.id,
          accountId: updated.accountId,
          costCenterId: updated.costCenterId,
          plannedAmount: num(updated.plannedAmount, 3),
          status: updated.status,
        });
      }
    }

    return results;
  });

  await logAudit({
    userEmail: user.email,
    userUid: user.uid,
    action: "revise_budget",
    entity: "budget",
    entityId: budgetId,
    companySlug: data.companySlug,
    details: {
      periodName: budget.periodName,
      fiscalYear: budget.fiscalYear,
      entryCount: data.revisedAmounts.length,
    },
  });

  return apiOk({
    ok: true,
    budgets: revisedBudgets,
    periodName: budget.periodName,
  });
});

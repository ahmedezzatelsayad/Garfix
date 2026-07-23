/**
 * /api/accounting/bank-reconciliation/complete
 * POST — complete a reconciliation
 */
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { requirePermissionForCompany } from "@/lib/middleware";
import { logAudit } from "@/lib/audit";
import { num } from "@/lib/money";
import { z } from "zod";
import { apiError, withErrorHandler, parseJsonBody, apiOk } from "@/lib/api";

const CompleteSchema = z.object({
  companySlug: z.string().min(1),
  reconciliationId: z.number().int(),
});

export const POST = withErrorHandler(async (req: NextRequest) => {
  const body = await parseJsonBody(req);
  const parsed = CompleteSchema.safeParse(body);
  if (!parsed.success) return apiError(parsed.error.issues[0]?.message || "Invalid input", 400);
  const data = parsed.data;

  const access = await requirePermissionForCompany(req, "finance_access", data.companySlug);
  if ("error" in access) return access.error;
  const user = access.user;

  const recon = await db.bankReconciliation.findUnique({
    where: { id: data.reconciliationId },
  });
  if (!recon) return apiError("Reconciliation not found", 404);
  if (recon.companySlug !== data.companySlug) return apiError("Reconciliation does not belong to this company", 403);
  if (recon.status !== "draft") return apiError("Only draft reconciliations can be completed", 400);

  // Verify difference is near zero before completing
  const difference = num(recon.difference, 3);
  if (Math.abs(difference) > 0.01) {
    return apiError("Cannot complete reconciliation: difference is not zero (unresolved items remain)", 400);
  }

  const updated = await db.bankReconciliation.update({
    where: { id: data.reconciliationId },
    data: {
      status: "completed",
      completedBy: user.email,
      completedAt: new Date(),
    },
  });

  await logAudit({
    userEmail: user.email,
    userUid: user.uid,
    action: "complete_reconciliation",
    entity: "bank_reconciliation",
    entityId: data.reconciliationId,
    companySlug: data.companySlug,
    details: { reconId: data.reconciliationId },
  });

  return apiOk({
    ok: true,
    reconciliation: {
      ...updated,
      statementBalance: num(updated.statementBalance, 3).toFixed(3),
      bookBalance: num(updated.bookBalance, 3).toFixed(3),
      adjustedBalance: num(updated.adjustedBalance, 3).toFixed(3),
      difference: num(updated.difference, 3).toFixed(3),
    },
  });
});

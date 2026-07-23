/**
 * /api/accounting/bank-reconciliation/[id]/match
 * POST — match a reconciliation item
 */
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { requirePermissionForCompany } from "@/lib/middleware";
import { logAudit } from "@/lib/audit";
import { z } from "zod";
import { apiError, withErrorHandler, parseJsonBody, apiOk } from "@/lib/api";

type RouteParams = { params: Promise<{ id: string }> };

const MatchSchema = z.object({
  companySlug: z.string().min(1),
  matchType: z.enum(["journal_entry", "payment", "invoice", "manual"]),
  journalEntryId: z.number().int().optional(),
});

export const POST = withErrorHandler(async (req: NextRequest, { params }: RouteParams) => {
  const { id } = await params;
  const reconId = parseInt(id, 10);

  const body = await parseJsonBody(req);
  const parsed = MatchSchema.safeParse(body);
  if (!parsed.success) return apiError(parsed.error.issues[0]?.message || "Invalid input", 400);
  const data = parsed.data;

  const access = await requirePermissionForCompany(req, "finance_access", data.companySlug);
  if ("error" in access) return access.error;
  const user = access.user;

  const recon = await db.bankReconciliation.findUnique({
    where: { id: reconId },
  });
  if (!recon) return apiError("Reconciliation not found", 404);
  if (recon.companySlug !== data.companySlug) return apiError("Reconciliation does not belong to this company", 403);

  // Only draft reconciliations can have items matched
  if (recon.status !== "draft") {
    return apiError("Only draft reconciliations can have items matched", 400);
  }

  // Mark the relevant bank transactions as reconciled
  if (data.journalEntryId) {
    // Find unmatched bank transactions for this reconciliation's bank account and period
    const unmatchedTxns = await db.bankTransaction.findMany({
      where: {
        companySlug: data.companySlug,
        bankAccountId: recon.bankAccountId,
        date: { gte: recon.periodStart, lte: recon.periodEnd },
        isReconciled: false,
      },
      take: 1,
    });

    for (const txn of unmatchedTxns) {
      await db.bankTransaction.update({
        where: { id: txn.id },
        data: {
          isReconciled: true,
          reconciledWith: data.matchType,
          reconciledId: data.journalEntryId,
        },
      });
    }
  }

  await logAudit({
    userEmail: user.email,
    userUid: user.uid,
    action: "match_reconciliation_item",
    entity: "bank_reconciliation",
    entityId: reconId,
    companySlug: data.companySlug,
    details: { matchType: data.matchType, journalEntryId: data.journalEntryId },
  });

  return apiOk({ ok: true, reconId, matchType: data.matchType });
});

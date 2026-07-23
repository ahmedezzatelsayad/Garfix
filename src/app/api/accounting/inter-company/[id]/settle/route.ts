/**
 * /api/accounting/inter-company/[id]/settle
 * POST — settle an inter-company transaction
 */
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { requirePermissionForCompany } from "@/lib/middleware";
import { logAudit } from "@/lib/audit";
import { num } from "@/lib/money";
import { apiError, withErrorHandler, parseJsonBody, apiOk } from "@/lib/api";
import { z } from "zod";

type RouteParams = { params: Promise<{ id: string }> };

const SettleSchema = z.object({
  companySlug: z.string().min(1),
});

export const POST = withErrorHandler(async (req: NextRequest, { params }: RouteParams) => {
  const { id } = await params;
  const transactionId = parseInt(id, 10);

  const body = await parseJsonBody(req);
  const parsed = SettleSchema.safeParse(body);
  if (!parsed.success) return apiError(parsed.error.issues[0]?.message || "Invalid input", 400);
  const data = parsed.data;

  const existing = await db.interCompanyTransaction.findUnique({
    where: { id: transactionId },
  });
  if (!existing) return apiError("Inter-company transaction not found", 404);

  // Verify user has access to at least one of the companies involved
  let user: { email: string; uid: string };
  const accessFrom = await requirePermissionForCompany(req, "finance_access", existing.companySlugFrom);
  if ("error" in accessFrom) {
    const accessTo = await requirePermissionForCompany(req, "finance_access", existing.companySlugTo);
    if ("error" in accessTo) return accessTo.error;
    user = accessTo.user;
  } else {
    user = accessFrom.user;
  }

  // Only pending transactions can be settled
  if (existing.status !== "pending") {
    return apiError(`Cannot settle transaction in "${existing.status}" status. Only pending transactions can be settled.`, 400);
  }

  // Create settlement journal entries for both companies
  const companySlugForJE = data.companySlug;

  // Create journal entry for the "from" company (debit: inter-company receivable)
  const jeFrom = await db.journalEntry.create({
    data: {
      companySlug: existing.companySlugFrom,
      date: new Date().toISOString().slice(0, 10),
      description: `Inter-company settlement with ${existing.companySlugTo} — transaction #${transactionId}`,
      status: "posted",
      sourceType: "inter_company_settlement",
      sourceId: transactionId,
      createdBy: user.email,
      lines: {
        create: [
          {
            accountId: 0, // Will need proper inter-company account ID
            debit: existing.amount,
            credit: "0",
            description: `Settlement debit for inter-company transaction #${transactionId}`,
          },
          {
            accountId: 0,
            debit: "0",
            credit: existing.amount,
            description: `Settlement credit for inter-company transaction #${transactionId}`,
          },
        ],
      },
    },
  });

  // Create journal entry for the "to" company (credit: inter-company payable)
  const jeTo = await db.journalEntry.create({
    data: {
      companySlug: existing.companySlugTo,
      date: new Date().toISOString().slice(0, 10),
      description: `Inter-company settlement with ${existing.companySlugFrom} — transaction #${transactionId}`,
      status: "posted",
      sourceType: "inter_company_settlement",
      sourceId: transactionId,
      createdBy: user.email,
      lines: {
        create: [
          {
            accountId: 0,
            debit: existing.amount,
            credit: "0",
            description: `Settlement debit for inter-company transaction #${transactionId}`,
          },
          {
            accountId: 0,
            debit: "0",
            credit: existing.amount,
            description: `Settlement credit for inter-company transaction #${transactionId}`,
          },
        ],
      },
    },
  });

  // Update the inter-company transaction
  const transaction = await db.interCompanyTransaction.update({
    where: { id: transactionId },
    data: {
      status: "settled",
      settledAt: new Date(),
      journalEntryIdFrom: jeFrom.id,
      journalEntryIdTo: jeTo.id,
    },
  });

  await logAudit({
    userEmail: user.email,
    userUid: user.uid,
    action: "settle_inter_company",
    entity: "inter_company_transaction",
    entityId: transactionId,
    companySlug: companySlugForJE,
    details: {
      from: existing.companySlugFrom,
      to: existing.companySlugTo,
      amount: num(existing.amount, 3),
      currency: existing.currency,
      jeFromId: jeFrom.id,
      jeToId: jeTo.id,
    },
  });

  return apiOk({
    ok: true,
    transaction: {
      ...transaction,
      amount: num(transaction.amount, 3),
    },
    jeFromId: jeFrom.id,
    jeToId: jeTo.id,
  });
});

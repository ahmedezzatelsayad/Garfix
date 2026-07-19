/**
 * /api/accounting/journal-entries/[id]
 * DELETE — hard-delete a journal entry (only drafts can be safely deleted).
 *          Posted entries should be reversed (see reverse/ route) but if the
 *          user explicitly chooses to delete, we also undo the balance impact
 *          before removing.
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requirePermissionForCompany } from "@/lib/middleware";
import { logAudit } from "@/lib/audit";
import { num } from "@/lib/money";
import { apiError, withErrorHandler } from "@/lib/api";

type RouteParams = { params: Promise<{ id: string }> };

export const DELETE = withErrorHandler(async (req: NextRequest, { params }: RouteParams) => {
  const { id } = await params;
  const existing = await db.journalEntry.findUnique({
    where: { id: parseInt(id) },
    include: { lines: true },
  });
  if (!existing) return apiError("Journal entry not found", 404);

  const access = await requirePermissionForCompany(req, "finance_access", existing.companySlug);
  if ("error" in access) return access.error;
  const user = access.user;

  // If the entry was posted, roll back its impact on account balances first
  if (existing.status === "posted") {
    for (const line of existing.lines) {
      const acc = await db.account.findUnique({ where: { id: line.accountId } });
      if (!acc) continue;
      const currentBalance = num(acc.balance, 3);
      const isDebitNormal = acc.type === "asset" || acc.type === "expense";
      // Reverse the original delta: subtract what was originally added.
      const delta = isDebitNormal
        ? num(line.credit, 3) - num(line.debit, 3)
        : num(line.debit, 3) - num(line.credit, 3);
      await db.account.update({
        where: { id: acc.id },
        data: { balance: (currentBalance + delta).toFixed(3) },
      });
    }
  }

  // Delete the entry and its lines (lines cascade via Prisma schema)
  await db.journalEntry.delete({ where: { id: existing.id } });

  await logAudit({
    userEmail: user.email, userUid: user.uid,
    action: "delete", entity: "journal_entry", entityId: existing.id, companySlug: existing.companySlug,
    details: { priorStatus: existing.status, linesRemoved: existing.lines.length },
  });

  return NextResponse.json({ ok: true });
});


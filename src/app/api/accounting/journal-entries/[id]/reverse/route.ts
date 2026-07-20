/**
 * /api/accounting/journal-entries/[id]/reverse
 * POST — create a reversal entry that swaps debit/credit on every line,
 *        posts it (updating account balances), and marks the original as "reversed".
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requirePermissionForCompany } from "@/lib/middleware";
import { logAudit } from "@/lib/audit";
import { num } from "@/lib/money";
import { apiError, withErrorHandler } from "@/lib/api";

type RouteParams = { params: Promise<{ id: string }> };

export const POST = withErrorHandler(async (req: NextRequest, { params }: RouteParams) => {
  const { id } = await params;
  // SEC FIX: require companySlug to prevent IDOR
  const companySlug = req.nextUrl.searchParams.get("companySlug");
  if (!companySlug) return apiError("companySlug مطلوب", 400);

  const existing = await db.journalEntry.findFirst({
    where: { id: parseInt(id), companySlug },
    include: { lines: true },
  });
  if (!existing) return apiError("Journal entry not found", 404);

  // Only posted entries can be reversed (drafts have not affected balances)
  if (existing.status === "reversed") {
    return apiError("هذا القيد معكوس بالفعل", 400);
  }
  if (existing.status === "draft") {
    return apiError("لا يمكن عكس قيد في حالة مسودة — احذفه بدلاً من ذلك", 400);
  }

  const access = await requirePermissionForCompany(req, "finance_access", existing.companySlug);
  if ("error" in access) return access.error;
  const user = access.user;

  // Build swapped lines (debit ↔ credit) so the new entry's balance updates
  // exactly cancel the original's.
  const swappedLines = existing.lines.map((l) => ({
    accountId: l.accountId,
    debit: num(l.credit, 3).toFixed(3),   // original credit → new debit
    credit: num(l.debit, 3).toFixed(3),   // original debit → new credit
    description: l.description || null,
  }));

  // Use a transaction so the reversal is atomic
  const reversal = await db.$transaction(async (tx) => {
    // 1. Create the reversal entry as posted
    const rev = await tx.journalEntry.create({
      data: {
        companySlug: existing.companySlug,
        date: new Date().toISOString().slice(0, 10),
        description: `عكس القيد #${existing.id}`,
        reference: existing.reference || null,
        status: "posted",
        sourceType: "reversal",
        sourceId: existing.id,
        createdBy: user.email,
        lines: { create: swappedLines },
      },
      include: { lines: true },
    });

    // 2. Update account balances for the reversal (same logic as POST handler)
    for (const line of swappedLines) {
      const acc = await tx.account.findUnique({ where: { id: line.accountId } });
      if (!acc) continue;
      const currentBalance = num(acc.balance, 3);
      const isDebitNormal = acc.type === "asset" || acc.type === "expense";
      const delta = isDebitNormal
        ? num(line.debit, 3) - num(line.credit, 3)
        : num(line.credit, 3) - num(line.debit, 3);
      await tx.account.update({
        where: { id: acc.id },
        data: { balance: (currentBalance + delta).toFixed(3) },
      });
    }

    // 3. Mark the original entry as reversed
    await tx.journalEntry.update({
      where: { id: existing.id },
      data: { status: "reversed" },
    });

    return rev;
  });

  await logAudit({
    userEmail: user.email, userUid: user.uid,
    action: "reverse", entity: "journal_entry", entityId: existing.id, companySlug: existing.companySlug,
    details: { reversalEntryId: reversal.id, linesReversed: swappedLines.length },
  });

  return NextResponse.json({ ok: true, reversal });
});

/**
 * /api/accounting/journal-entries/[id]
 * DELETE — P0-2: Posted journal entries are IMMUTABLE. Only draft/cancelled entries can be deleted.
 *          Posted entries must be reversed (see /reverse/ route), never deleted.
 *          P0-4: Cannot delete entries in closed/locked fiscal periods.
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requirePermissionForCompany } from "@/lib/middleware";
import { logAudit } from "@/lib/audit";
import { num } from "@/lib/money";
import { apiError, withErrorHandler } from "@/lib/api";
import { preventPostingToClosedPeriod } from "@/lib/accounting/period-close";

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

  // P0-2: IMMUTABLE LEDGER — posted entries cannot be deleted.
  // This is the core financial integrity rule: once an entry is posted,
  // it becomes part of the permanent accounting record and must not be
  // removed. The only valid operation on a posted entry is reversal
  // (via /reverse/ endpoint), which creates a mirror entry with opposite
  // amounts while preserving the original for audit trail.
  if (existing.status === "posted") {
    return NextResponse.json(
      {
        error: "لا يمكن حذف قيد مرحّل — القيود المرحّلة ثابتة ولا يمكن تعديلها أو حذفها. استخدم عملية العكس بدلاً من ذلك.",
        code: "IMMUTABLE_LEDGER",
        hint: "POST /api/accounting/journal-entries/{id}/reverse",
      },
      { status: 403 },
    );
  }

  // P0-4: Check fiscal period — cannot modify entries in closed/locked periods
  try {
    await preventPostingToClosedPeriod(existing.companySlug, new Date(existing.date).toISOString().split("T")[0]);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg, code: "CLOSED_PERIOD" }, { status: 403 });
  }

  // P0-3: Soft-delete for draft/cancelled entries — set deletedAt instead of physical delete
  await db.journalEntry.update({
    where: { id: existing.id },
    data: { deletedAt: new Date() },
  });

  await logAudit({
    userEmail: user.email, userUid: user.uid,
    action: "soft_delete", entity: "journal_entry", entityId: existing.id, companySlug: existing.companySlug,
    details: { priorStatus: existing.status, linesCount: existing.lines.length },
  });

  return NextResponse.json({ ok: true, status: existing.status, note: "Draft entry soft-deleted" });
});

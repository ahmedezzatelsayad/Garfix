/**
 * /api/invoices/[id]/status
 * PATCH — update invoice status (with atomic optimistic-lock)
 *
 * C1 FIX: now uses `updateMany` with a version+deletedAt filter for atomic
 * conflict detection. See /api/invoices/[id]/route.ts for the full rationale.
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requirePermissionForCompany } from "@/lib/middleware";
import { logAudit } from "@/lib/audit";
import { z } from "zod";
import { apiError, withErrorHandler, parseJsonBody } from "@/lib/api";

const StatusSchema = z.object({
  // SECURITY: `paid` and `partial` are intentionally excluded here. Those
  // statuses must result from a real payment recorded via
  // PATCH /api/invoices/[id]/payment (which requires finance_access, updates
  // the `paid` amount, and writes a payment audit trail). Allowing them here
  // would let an employee with only `edit_invoice` mark an invoice "paid"
  // without any money being recorded.
  status: z.enum(["draft", "sent", "overdue", "cancelled"]),
  expectedVersion: z.number().int().optional(),
});

type RouteParams = { params: Promise<{ id: string }> };

export const PATCH = withErrorHandler(async (req: NextRequest, { params }: RouteParams) => {
  const { id } = await params;
  const existing = await db.invoice.findUnique({ where: { id: parseInt(id) } });
  if (!existing || existing.deletedAt) return apiError("Invoice not found", 404);

  // Enforce permission + company access
  const access = await requirePermissionForCompany(req, "edit_invoice", existing.companySlug);
  if ("error" in access) return access.error;
  const user = access.user;

  const body = await parseJsonBody(req);
  const parsed = StatusSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(
      parsed.error.issues[0]?.message ||
        "Invalid status. Use PATCH /api/invoices/[id]/payment to record a payment (paid/partial).",
      400,
    );
  }

  // C1 FIX: atomic conditional update — count=0 means concurrent edit or
  // concurrent soft-delete, both are 409.
  const expectedVersion = parsed.data.expectedVersion;
  const versionFilter = expectedVersion !== undefined ? { version: expectedVersion } : {};
  const result = await db.invoice.updateMany({
    where: { id: existing.id, deletedAt: null, ...versionFilter },
    data: { status: parsed.data.status, version: { increment: 1 } },
  });
  if (result.count === 0) {
    return NextResponse.json(
      { error: "Conflict: invoice was modified or deleted by another request", code: "VERSION_CONFLICT" },
      { status: 409 },
    );
  }

  // Re-fetch canonical post-update state.
  const invoice = await db.invoice.findUnique({ where: { id: existing.id } });
  if (!invoice) return apiError("Invoice disappeared after status change", 500);

  await logAudit({
    userEmail: user.email,
    userUid: user.uid,
    action: "status_change",
    entity: "invoice",
    entityId: invoice.id,
    companySlug: existing.companySlug,
    details: { from: existing.status, to: parsed.data.status },
  });
  return NextResponse.json({ ok: true, invoice });
});

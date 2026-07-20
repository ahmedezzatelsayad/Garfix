/**
 * /api/invoices/[id]/status
 * PATCH — update invoice status (with optimistic-lock)
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { resolveAuth, assertCompanyAccess } from "@/lib/auth";
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
  if (!existing) return apiError("Invoice not found", 404);

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
  if (parsed.data.expectedVersion !== undefined && parsed.data.expectedVersion !== existing.version) {
    return NextResponse.json({ error: "Conflict", code: "VERSION_CONFLICT" }, { status: 409 });
  }
  const invoice = await db.invoice.update({
    where: { id: existing.id },
    data: { status: parsed.data.status, version: existing.version + 1 },
  });
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

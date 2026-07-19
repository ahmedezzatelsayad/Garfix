/**
 * /api/invoices/[id]/payment
 * PATCH — record a payment against an invoice (with optimistic-lock)
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { resolveAuth, assertCompanyAccess } from "@/lib/auth";
import { requirePermissionForCompany } from "@/lib/middleware";
import { logAudit } from "@/lib/audit";
import { num } from "@/lib/money";
import { z } from "zod";
import { apiError, withErrorHandler, parseJsonBody } from "@/lib/api";

const PaymentSchema = z.object({
  amount: z.union([z.number(), z.string()]),
  method: z.string().default("cash"),
  expectedVersion: z.number().int().optional(),
});

type RouteParams = { params: Promise<{ id: string }> };

export const PATCH = withErrorHandler(async (req: NextRequest, { params }: RouteParams) => {
  const { id } = await params;
  const existing = await db.invoice.findUnique({ where: { id: parseInt(id) } });
  if (!existing) return apiError("Invoice not found", 404);

  // Enforce permission + company access (recording payments is a financial action)
  const access = await requirePermissionForCompany(req, "finance_access", existing.companySlug);
  if ("error" in access) return access.error;
  const user = access.user;

  const body = await parseJsonBody(req);
  const parsed = PaymentSchema.safeParse(body);
  if (!parsed.success) return apiError(parsed.error.issues[0]?.message || "Invalid input", 400);
  if (parsed.data.expectedVersion !== undefined && parsed.data.expectedVersion !== existing.version) {
    return NextResponse.json({ error: "Conflict", code: "VERSION_CONFLICT" }, { status: 409 });
  }

  const newPaid = (num(existing.paid, 3) + num(parsed.data.amount, 3)).toFixed(3);
  const total = num(existing.total, 3);
  const newStatus = num(newPaid, 3) >= total && total > 0 ? "paid" : num(newPaid, 3) > 0 ? "partial" : existing.status;

  const invoice = await db.invoice.update({
    where: { id: existing.id },
    data: { paid: newPaid, status: newStatus, version: existing.version + 1 },
  });

  await logAudit({
    userEmail: user.email,
    userUid: user.uid,
    action: "payment",
    entity: "invoice",
    entityId: invoice.id,
    companySlug: existing.companySlug,
    details: { amount: parsed.data.amount, method: parsed.data.method, newPaid, newStatus },
  });

  return NextResponse.json({ ok: true, invoice });
});

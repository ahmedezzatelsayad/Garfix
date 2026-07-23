/**
 * /api/accounting/inter-company/[id]
 * GET — Single inter-company transaction
 * PATCH — Update transaction (settle, cancel)
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requirePermissionForCompany } from "@/lib/middleware";
import { logAudit } from "@/lib/audit";
import { num } from "@/lib/money";
import { apiError, withErrorHandler, parseJsonBody } from "@/lib/api";
import { z } from "zod";

type RouteContext = { params: Promise<{ id: string }> };

// ── GET: Single transaction ────────────────────────────────────────────────────

export const GET = withErrorHandler(async (req: NextRequest, ctx: RouteContext) => {
  const { id } = await ctx.params;
  const transactionId = parseInt(id, 10);
  if (!transactionId) return apiError("Invalid transaction ID", 400);

  const transaction = await db.interCompanyTransaction.findUnique({
    where: { id: transactionId },
  });
  if (!transaction) return apiError("Inter-company transaction not found", 404);

  // Check access for either company
  const accessFrom = await requirePermissionForCompany(req, "finance_access", transaction.companySlugFrom);
  if ("error" in accessFrom) {
    const accessTo = await requirePermissionForCompany(req, "finance_access", transaction.companySlugTo);
    if ("error" in accessTo) return accessTo.error;
  }

  return NextResponse.json({
    transaction: {
      ...transaction,
      amount: num(transaction.amount, 3),
    },
  });
});

// ── PATCH: Update transaction (settle, cancel) ──────────────────────────────────

const PatchSchema = z.object({
  status: z.enum(["pending", "settled", "cancelled"]),
  description: z.string().optional(),
});

export const PATCH = withErrorHandler(async (req: NextRequest, ctx: RouteContext) => {
  const { id } = await ctx.params;
  const transactionId = parseInt(id, 10);
  if (!transactionId) return apiError("Invalid transaction ID", 400);

  const body = await parseJsonBody(req);
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) return apiError(parsed.error.issues[0]?.message || "Invalid input", 400);
  const data = parsed.data;

  const existing = await db.interCompanyTransaction.findUnique({
    where: { id: transactionId },
  });
  if (!existing) return apiError("Inter-company transaction not found", 404);

  // Check access for either company
  let user: { email: string; uid: string };
  const accessFrom = await requirePermissionForCompany(req, "finance_access", existing.companySlugFrom);
  if ("error" in accessFrom) {
    const accessTo = await requirePermissionForCompany(req, "finance_access", existing.companySlugTo);
    if ("error" in accessTo) return accessTo.error;
    user = accessTo.user;
  } else {
    user = accessFrom.user;
  }

  // Status transition validation
  const validTransitions: Record<string, string[]> = {
    pending: ["settled", "cancelled"],
    settled: [],
    cancelled: [],
  };

  const allowed = validTransitions[existing.status] || [];
  if (data.status && !allowed.includes(data.status)) {
    return apiError(`Cannot transition from "${existing.status}" to "${data.status}". Allowed: ${allowed.join(", ") || "none"}`, 400);
  }

  const updateData: Record<string, unknown> = {};
  if (data.status === "settled") updateData.settledAt = new Date();
  if (data.status) updateData.status = data.status;
  if (data.description) updateData.description = data.description;

  const transaction = await db.interCompanyTransaction.update({
    where: { id: transactionId },
    data: updateData,
  });

  await logAudit({
    userEmail: user.email,
    userUid: user.uid,
    action: data.status || "update",
    entity: "inter_company_transaction",
    entityId: transactionId,
    companySlug: existing.companySlugFrom,
    details: { previousStatus: existing.status, newStatus: data.status },
  });

  return NextResponse.json({
    ok: true,
    transaction: {
      ...transaction,
      amount: num(transaction.amount, 3),
    },
  });
});

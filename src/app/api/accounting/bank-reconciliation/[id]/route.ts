/**
 * /api/accounting/bank-reconciliation/[id]
 * GET — get single reconciliation
 * PATCH — complete or approve reconciliation
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requirePermissionForCompany } from "@/lib/middleware";
import { logAudit } from "@/lib/audit";
import { num } from "@/lib/money";
import { z } from "zod";
import { apiError, withErrorHandler, parseJsonBody, apiOk } from "@/lib/api";

const PatchSchema = z.object({
  companySlug: z.string().min(1),
  status: z.enum(["completed", "approved"]).optional(),
});

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return withErrorHandler(async () => {
    const { id } = await params;
    const reconciliation = await db.bankReconciliation.findUnique({
      where: { id: parseInt(id, 10) },
      include: {
        bankAccount: {
          select: { id: true, bankName: true, accountName: true, currency: true },
        },
      },
    });

    if (!reconciliation) return apiError("Reconciliation not found", 404);

    return apiOk({
      ...reconciliation,
      statementBalance: num(reconciliation.statementBalance, 3).toFixed(3),
      bookBalance: num(reconciliation.bookBalance, 3).toFixed(3),
      adjustedBalance: num(reconciliation.adjustedBalance, 3).toFixed(3),
      difference: num(reconciliation.difference, 3).toFixed(3),
    });
  })();
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return withErrorHandler(async () => {
    const { id } = await params;
    const reconId = parseInt(id, 10);
    const body = await parseJsonBody(req);
    const parsed = PatchSchema.safeParse(body);
    if (!parsed.success) return apiError(parsed.error.issues[0]?.message || "Invalid input", 400);
    const data = parsed.data;

    const access = await requirePermissionForCompany(req, "finance_access", data.companySlug);
    if ("error" in access) return access.error;
    const user = access.user;

    const existing = await db.bankReconciliation.findUnique({
      where: { id: reconId },
    });
    if (!existing) return apiError("Reconciliation not found", 404);
    if (existing.companySlug !== data.companySlug) return apiError("Reconciliation does not belong to this company", 403);

    // Validate status transitions
    if (data.status === "completed" && existing.status !== "draft") {
      return apiError("Only draft reconciliations can be completed", 400);
    }
    if (data.status === "approved" && existing.status !== "completed") {
      return apiError("Only completed reconciliations can be approved", 400);
    }

    // Check if difference is zero before completing
    if (data.status === "completed") {
      const difference = num(existing.difference, 3);
      if (Math.abs(difference) > 0.01) {
        return apiError("Cannot complete reconciliation: difference is not zero (unresolved items remain)", 400);
      }
    }

    const updateData: Record<string, unknown> = {};
    if (data.status === "completed") {
      updateData.status = "completed";
      updateData.completedBy = user.email;
      updateData.completedAt = new Date();
    }
    if (data.status === "approved") {
      updateData.status = "approved";
    }

    const reconciliation = await db.bankReconciliation.update({
      where: { id: reconId },
      data: updateData,
      include: {
        bankAccount: {
          select: { id: true, bankName: true, accountName: true, currency: true },
        },
      },
    });

    await logAudit({
      userEmail: user.email,
      userUid: user.uid,
      action: data.status === "completed" ? "complete" : "approve",
      entity: "bank_reconciliation",
      entityId: reconId,
      companySlug: data.companySlug,
      details: { status: data.status },
    });

    return apiOk({
      ...reconciliation,
      statementBalance: num(reconciliation.statementBalance, 3).toFixed(3),
      bookBalance: num(reconciliation.bookBalance, 3).toFixed(3),
      adjustedBalance: num(reconciliation.adjustedBalance, 3).toFixed(3),
      difference: num(reconciliation.difference, 3).toFixed(3),
    });
  })();
}

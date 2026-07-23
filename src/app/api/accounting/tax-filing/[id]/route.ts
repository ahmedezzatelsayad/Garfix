/**
 * /api/accounting/tax-filing/[id]
 * GET — Single tax filing
 * PATCH — Update filing (submit, approve, reject)
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requirePermissionForCompany } from "@/lib/middleware";
import { logAudit } from "@/lib/audit";
import { num } from "@/lib/money";
import { apiError, withErrorHandler, parseJsonBody } from "@/lib/api";
import { z } from "zod";

type RouteContext = { params: Promise<{ id: string }> };

// ── GET: Single filing ──────────────────────────────────────────────────────────

export const GET = withErrorHandler(async (req: NextRequest, ctx: RouteContext) => {
  const { id } = await ctx.params;
  const filingId = parseInt(id, 10);
  if (!filingId) return apiError("Invalid filing ID", 400);

  const filing = await db.taxFiling.findUnique({
    where: { id: filingId },
  });
  if (!filing) return apiError("Tax filing not found", 404);

  const access = await requirePermissionForCompany(req, "finance_access", filing.companySlug);
  if ("error" in access) return access.error;

  return NextResponse.json({
    filing: {
      ...filing,
      totalSales: num(filing.totalSales, 3),
      totalPurchases: num(filing.totalPurchases, 3),
      vatDue: num(filing.vatDue, 3),
    },
  });
});

// ── PATCH: Update filing (submit, approve, reject) ──────────────────────────────

const PatchSchema = z.object({
  status: z.enum(["draft", "submitted", "accepted", "rejected"]).optional(),
  filingReference: z.string().optional(),
  rejectionReason: z.string().optional(),
});

export const PATCH = withErrorHandler(async (req: NextRequest, ctx: RouteContext) => {
  const { id } = await ctx.params;
  const filingId = parseInt(id, 10);
  if (!filingId) return apiError("Invalid filing ID", 400);

  const body = await parseJsonBody(req);
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) return apiError(parsed.error.issues[0]?.message || "Invalid input", 400);
  const data = parsed.data;

  const existing = await db.taxFiling.findUnique({
    where: { id: filingId },
  });
  if (!existing) return apiError("Tax filing not found", 404);

  const access = await requirePermissionForCompany(req, "finance_access", existing.companySlug);
  if ("error" in access) return access.error;
  const user = access.user;

  // Status transition validation
  const validTransitions: Record<string, string[]> = {
    draft: ["submitted"],
    submitted: ["accepted", "rejected"],
    accepted: [],
    rejected: ["draft"],
  };

  const allowed = validTransitions[existing.status] || [];
  if (data.status && !allowed.includes(data.status)) {
    return apiError(`Cannot transition from "${existing.status}" to "${data.status}". Allowed: ${allowed.join(", ") || "none"}`, 400);
  }

  const updateData: Record<string, unknown> = {};
  if (data.status === "submitted") updateData.submittedAt = new Date();
  if (data.status) updateData.status = data.status;
  if (data.filingReference) updateData.filingReference = data.filingReference;
  if (data.rejectionReason) updateData.rejectionReason = data.rejectionReason;

  const filing = await db.taxFiling.update({
    where: { id: filingId },
    data: updateData,
  });

  await logAudit({
    userEmail: user.email,
    userUid: user.uid,
    action: data.status || "update",
    entity: "tax_filing",
    entityId: filingId,
    companySlug: existing.companySlug,
    details: { previousStatus: existing.status, newStatus: data.status, filingReference: data.filingReference },
  });

  return NextResponse.json({ ok: true, filing });
});

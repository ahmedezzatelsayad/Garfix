/**
 * /api/accounting/post-dated-checks/[id]
 * GET / PATCH — single post-dated check (update status: deposit, clear, return, cancel)
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requirePermissionForCompany } from "@/lib/middleware";
import { logAudit } from "@/lib/audit";
import { num } from "@/lib/money";
import { z } from "zod";
import { apiError, withErrorHandler, parseJsonBody } from "@/lib/api";

type RouteParams = { params: Promise<{ id: string }> };

const PatchSchema = z.object({
  companySlug: z.string().min(1),
  status: z.enum(["pending", "deposited", "cleared", "returned", "cancelled"]).optional(),
  checkNumber: z.string().optional(),
  bankName: z.string().optional(),
  amount: z.union([z.number(), z.string()]).optional(),
  dueDate: z.string().optional(),
  issueDate: z.string().optional(),
  payee: z.string().optional(),
  payer: z.string().optional(),
  direction: z.enum(["receivable", "payable"]).optional(),
  clientId: z.number().int().optional().nullable(),
  supplierId: z.number().int().optional().nullable(),
  glAccountId: z.number().int().optional().nullable(),
  returnedReason: z.string().optional(),
});

// ── GET: Single post-dated check ──────────────────────────────────────────────────

export const GET = withErrorHandler(async (req: NextRequest, { params }: RouteParams) => {
  const { id } = await params;
  const companySlug = req.nextUrl.searchParams.get("companySlug");
  if (!companySlug) return apiError("companySlug مطلوب", 400);

  const access = await requirePermissionForCompany(req, "finance_access", companySlug);
  if ("error" in access) return access.error;

  const check = await db.postDatedCheck.findFirst({
    where: { id: parseInt(id), companySlug },
    include: { client: true, supplier: true, glAccount: true },
  });
  if (!check) return apiError("Post-dated check not found", 404);

  return NextResponse.json({ check: { ...check, amount: num(check.amount, 3) } });
});

// ── PATCH: Update post-dated check (status changes) ──────────────────────────────────

export const PATCH = withErrorHandler(async (req: NextRequest, { params }: RouteParams) => {
  const { id } = await params;
  const body = await parseJsonBody(req);
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) return apiError(parsed.error.issues[0]?.message || "Invalid input", 400);
  const data = parsed.data;

  const access = await requirePermissionForCompany(req, "finance_access", data.companySlug);
  if ("error" in access) return access.error;
  const user = access.user;

  const existing = await db.postDatedCheck.findFirst({
    where: { id: parseInt(id), companySlug: data.companySlug },
  });
  if (!existing) return apiError("Post-dated check not found", 404);

  // Status transition validation
  const validTransitions: Record<string, string[]> = {
    pending: ["deposited", "cancelled"],
    deposited: ["cleared", "returned"],
    cleared: [], // final state
    returned: ["deposited", "cancelled"], // re-deposit or cancel after return
    cancelled: [], // final state
  };

  if (data.status) {
    const allowed = validTransitions[existing.status] || [];
    if (!allowed.includes(data.status)) {
      return apiError(
        `Cannot change PDC status from "${existing.status}" to "${data.status}". Allowed transitions: ${allowed.join(", ") || "none (final state)"}`,
        400,
      );
    }
  }

  const updateData: Record<string, unknown> = {};
  if (data.status) updateData.status = data.status;
  if (data.checkNumber) updateData.checkNumber = data.checkNumber;
  if (data.bankName) updateData.bankName = data.bankName;
  if (data.amount) updateData.amount = num(data.amount, 3).toFixed(3);
  if (data.dueDate) updateData.dueDate = data.dueDate;
  if (data.issueDate) updateData.issueDate = data.issueDate;
  if (data.payee) updateData.payee = data.payee;
  if (data.payer) updateData.payer = data.payer;
  if (data.direction) updateData.direction = data.direction;
  if (data.clientId !== undefined) updateData.clientId = data.clientId;
  if (data.supplierId !== undefined) updateData.supplierId = data.supplierId;
  if (data.glAccountId !== undefined) updateData.glAccountId = data.glAccountId;
  if (data.returnedReason) updateData.returnedReason = data.returnedReason;

  // Set clearedAt when status changes to cleared
  if (data.status === "cleared") {
    updateData.clearedAt = new Date();
  }
  // Set returnedReason when status changes to returned
  if (data.status === "returned" && data.returnedReason) {
    updateData.returnedReason = data.returnedReason;
  }

  const check = await db.postDatedCheck.update({
    where: { id: parseInt(id) },
    data: updateData,
  });

  await logAudit({
    userEmail: user.email,
    userUid: user.uid,
    action: "update",
    entity: "post_dated_check",
    entityId: check.id,
    companySlug: data.companySlug,
    details: {
      previousStatus: existing.status,
      newStatus: data.status || existing.status,
      checkNumber: existing.checkNumber,
    },
  });

  return NextResponse.json({ ok: true, check });
});

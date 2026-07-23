/**
 * /api/accounting/post-dated-checks
 * GET / POST — post-dated checks
 * GET: ?companySlug=X&direction=receivable|payable&status=pending
 * POST: Create a post-dated check
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { resolveAuth, assertCompanyAccess, hasUnrestrictedScope } from "@/lib/auth";
import { requirePermissionForCompany, hasPermission } from "@/lib/middleware";
import { logAudit } from "@/lib/audit";
import { num } from "@/lib/money";
import { z } from "zod";
import { apiError, withErrorHandler, parseJsonBody } from "@/lib/api";

// ── Zod Schemas ──────────────────────────────────────────────────────────────────

const CreateSchema = z.object({
  companySlug: z.string().min(1),
  checkNumber: z.string().min(1),
  bankName: z.string().min(1),
  amount: z.union([z.number(), z.string()]),
  currency: z.string().default("KWD"),
  dueDate: z.string().min(1), // YYYY-MM-DD
  issueDate: z.string().optional(),
  payee: z.string().optional(),
  payer: z.string().optional(),
  direction: z.enum(["receivable", "payable"]),
  clientId: z.number().int().optional().nullable(),
  supplierId: z.number().int().optional().nullable(),
  glAccountId: z.number().int().optional().nullable(),
});

// ── GET: List post-dated checks ──────────────────────────────────────────────────

export const GET = withErrorHandler(async (req: NextRequest) => {
  const result = await resolveAuth(req);
  if (!result.ok || !result.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!hasPermission(result.user, "finance_access")) {
    return NextResponse.json({ error: "ليس لديك صلاحية: finance_access" }, { status: 403 });
  }

  const sp = req.nextUrl.searchParams;
  const companySlug = sp.get("companySlug") || undefined;
  if (companySlug && !assertCompanyAccess(result.user, companySlug)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const where: Record<string, unknown> = {};
  if (companySlug) where.companySlug = companySlug;
  else if (!hasUnrestrictedScope(result.user)) where.companySlug = { in: result.user.companies };

  // Optional filters
  const direction = sp.get("direction");
  if (direction) where.direction = direction;

  const status = sp.get("status");
  if (status) where.status = status;

  const checks = await db.postDatedCheck.findMany({
    where,
    orderBy: [{ dueDate: "asc" }],
    include: { client: true, supplier: true, glAccount: true },
  });

  return NextResponse.json({
    checks: checks.map((c) => ({
      ...c,
      amount: num(c.amount, 3),
    })),
  });
});

// ── POST: Create post-dated check ──────────────────────────────────────────────────

export const POST = withErrorHandler(async (req: NextRequest) => {
  const body = await parseJsonBody(req);
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) return apiError(parsed.error.issues[0]?.message || "Invalid input", 400);
  const data = parsed.data;

  const access = await requirePermissionForCompany(req, "finance_access", data.companySlug);
  if ("error" in access) return access.error;
  const user = access.user;

  // Validate direction vs clientId/supplierId
  if (data.direction === "receivable" && data.supplierId && !data.clientId) {
    return apiError("Receivable PDCs should have a clientId, not a supplierId", 400);
  }
  if (data.direction === "payable" && data.clientId && !data.supplierId) {
    return apiError("Payable PDCs should have a supplierId, not a clientId", 400);
  }

  const check = await db.postDatedCheck.create({
    data: {
      companySlug: data.companySlug,
      checkNumber: data.checkNumber,
      bankName: data.bankName,
      amount: num(data.amount, 3).toFixed(3),
      currency: data.currency,
      dueDate: data.dueDate,
      issueDate: data.issueDate || null,
      payee: data.payee || null,
      payer: data.payer || null,
      direction: data.direction,
      status: "pending",
      clientId: data.clientId || null,
      supplierId: data.supplierId || null,
      glAccountId: data.glAccountId || null,
    },
  });

  await logAudit({
    userEmail: user.email,
    userUid: user.uid,
    action: "create",
    entity: "post_dated_check",
    entityId: check.id,
    companySlug: data.companySlug,
    details: {
      checkNumber: data.checkNumber,
      bankName: data.bankName,
      amount: num(data.amount, 3).toFixed(3),
      direction: data.direction,
      dueDate: data.dueDate,
    },
  });

  return NextResponse.json({ ok: true, check });
});

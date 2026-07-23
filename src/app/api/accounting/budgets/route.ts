/**
 * /api/accounting/budgets
 * GET: List budgets (?companySlug=X&fiscalYear=2024)
 * POST: Create/update budget entries
 * PATCH /approve: Approve budget
 * PATCH /revise: Revise budget
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requirePermissionForCompany } from "@/lib/middleware";
import { logAudit } from "@/lib/audit";
import { num, toNum } from "@/lib/money";
import { apiError, withErrorHandler, parseJsonBody } from "@/lib/api";
import { z } from "zod";

const BudgetEntrySchema = z.object({
  accountId: z.number().int(),
  costCenterId: z.number().int().optional(),
  plannedAmount: z.union([z.number(), z.string()]),
});

const CreateBudgetSchema = z.object({
  companySlug: z.string().min(1),
  fiscalYear: z.number().int(),
  period: z.string().min(1), // monthly/quarterly/yearly
  periodName: z.string().min(1), // e.g. "2024-Q1"
  entries: z.array(BudgetEntrySchema).min(1, "يجب تقديم بند ميزانية واحد على الأقل"),
});

const ApproveBudgetSchema = z.object({
  companySlug: z.string().min(1),
  periodName: z.string().min(1),
});

const ReviseBudgetSchema = z.object({
  companySlug: z.string().min(1),
  periodName: z.string().min(1),
  entries: z.array(BudgetEntrySchema).min(1),
});

export const GET = withErrorHandler(async (req: NextRequest) => {
  const sp = req.nextUrl.searchParams;
  const companySlug = sp.get("companySlug");
  if (!companySlug) return apiError("companySlug مطلوب", 400);

  const access = await requirePermissionForCompany(req, "finance_access", companySlug);
  if ("error" in access) return access.error;

  const where: Record<string, unknown> = { companySlug };
  const fiscalYearStr = sp.get("fiscalYear");
  if (fiscalYearStr) where.fiscalYear = parseInt(fiscalYearStr, 10);
  const periodName = sp.get("periodName");
  if (periodName) where.periodName = periodName;
  const status = sp.get("status");
  if (status) where.status = status;

  const budgets = await db.budget.findMany({
    where,
    orderBy: [{ periodName: "asc" }, { accountId: "asc" }],
    include: {
      account: { select: { id: true, code: true, nameAr: true, nameEn: true, type: true } },
      costCenter: { select: { id: true, code: true, nameAr: true } },
    },
  });

  return NextResponse.json({
    budgets: budgets.map((b) => ({
      id: b.id,
      fiscalYear: b.fiscalYear,
      period: b.period,
      periodName: b.periodName,
      accountId: b.accountId,
      accountCode: b.account.code,
      accountNameAr: b.account.nameAr,
      accountType: b.account.type,
      costCenterId: b.costCenterId,
      costCenterName: b.costCenter?.nameAr || null,
      plannedAmount: num(b.plannedAmount, 3),
      actualAmount: num(b.actualAmount, 3),
      variance: num(b.variance, 3),
      status: b.status,
      notes: b.notes,
      createdAt: b.createdAt,
      updatedAt: b.updatedAt,
    })),
  });
});

export const POST = withErrorHandler(async (req: NextRequest) => {
  const body = await parseJsonBody(req);
  const parsed = CreateBudgetSchema.safeParse(body);
  if (!parsed.success) return apiError(parsed.error.issues[0]?.message || "مدخلات غير صالحة", 400);

  const data = parsed.data;
  const access = await requirePermissionForCompany(req, "finance_access", data.companySlug);
  if ("error" in access) return access.error;
  const user = access.user;

  // Validate that all account IDs belong to this company
  const accountIds = data.entries.map((e) => e.accountId);
  const accounts = await db.account.findMany({
    where: { id: { in: accountIds }, companySlug: data.companySlug, isActive: true },
  });

  if (accounts.length !== accountIds.length) {
    return apiError("بعض الحسابات غير موجودة أو غير نشطة في هذه الشركة", 400);
  }

  // Validate cost center IDs
  const costCenterIds = data.entries.filter((e) => e.costCenterId).map((e) => e.costCenterId!);
  if (costCenterIds.length > 0) {
    const costCenters = await db.costCenter.findMany({
      where: { id: { in: costCenterIds }, companySlug: data.companySlug, isActive: true },
    });
    if (costCenters.length !== costCenterIds.length) {
      return apiError("بعض مراكز التكلفة غير موجودة أو غير نشطة في هذه الشركة", 400);
    }
  }

  // Create/update budget entries
  const createdBudgets = await db.$transaction(async (tx) => {
    const results: Array<Record<string, unknown>> = [];

    for (const entry of data.entries) {
      // Upsert: create or update if unique constraint matches
      const existing = await tx.budget.findFirst({
        where: {
          companySlug: data.companySlug,
          periodName: data.periodName,
          accountId: entry.accountId,
          costCenterId: entry.costCenterId || null,
        },
      });

      if (existing) {
        // Update existing entry
        const updated = await tx.budget.update({
          where: { id: existing.id },
          data: {
            fiscalYear: data.fiscalYear,
            period: data.period,
            plannedAmount: toNum(entry.plannedAmount),
            status: "draft", // Reset to draft when revised
          },
        });
        results.push({
          id: updated.id,
          accountId: updated.accountId,
          costCenterId: updated.costCenterId,
          plannedAmount: num(updated.plannedAmount, 3),
          status: updated.status,
        });
      } else {
        // Create new entry
        const created = await tx.budget.create({
          data: {
            companySlug: data.companySlug,
            fiscalYear: data.fiscalYear,
            period: data.period,
            periodName: data.periodName,
            accountId: entry.accountId,
            costCenterId: entry.costCenterId || null,
            plannedAmount: toNum(entry.plannedAmount),
            actualAmount: "0.000",
            variance: "0.000",
            status: "draft",
          },
        });
        results.push({
          id: created.id,
          accountId: created.accountId,
          costCenterId: created.costCenterId,
          plannedAmount: num(created.plannedAmount, 3),
          status: created.status,
        });
      }
    }

    return results;
  });

  await logAudit({
    userEmail: user.email,
    userUid: user.uid,
    action: "create",
    entity: "budget",
    companySlug: data.companySlug,
    details: {
      fiscalYear: data.fiscalYear,
      periodName: data.periodName,
      entryCount: data.entries.length,
    },
  });

  return NextResponse.json({ ok: true, budgets: createdBudgets }, { status: 201 });
});

export const PATCH = withErrorHandler(async (req: NextRequest) => {
  const body = await parseJsonBody(req);

  // Determine action type
  const action = (body as Record<string, unknown>)?.action;
  if (!action) return apiError("action مطلوب (approve / revise)", 400);

  if (action === "approve") {
    const parsed = ApproveBudgetSchema.safeParse(body);
    if (!parsed.success) return apiError(parsed.error.issues[0]?.message || "مدخلات غير صالحة", 400);

    const data = parsed.data;
    const access = await requirePermissionForCompany(req, "finance_access", data.companySlug);
    if ("error" in access) return access.error;
    const user = access.user;

    // Approve all budget entries for this period
    const result = await db.budget.updateMany({
      where: {
        companySlug: data.companySlug,
        periodName: data.periodName,
        status: "draft",
      },
      data: { status: "approved" },
    });

    await logAudit({
      userEmail: user.email,
      userUid: user.uid,
      action: "approve_budget",
      entity: "budget",
      companySlug: data.companySlug,
      details: { periodName: data.periodName, count: result.count },
    });

    return NextResponse.json({ ok: true, approved: result.count });
  }

  if (action === "revise") {
    const parsed = ReviseBudgetSchema.safeParse(body);
    if (!parsed.success) return apiError(parsed.error.issues[0]?.message || "مدخلات غير صالحة", 400);

    const data = parsed.data;
    const access = await requirePermissionForCompany(req, "finance_access", data.companySlug);
    if ("error" in access) return access.error;
    const user = access.user;

    // Mark all entries as revised, then update entries
    await db.budget.updateMany({
      where: {
        companySlug: data.companySlug,
        periodName: data.periodName,
        status: "approved",
      },
      data: { status: "revised" },
    });

    // Update individual entries
    const updatedBudgets = await db.$transaction(async (tx) => {
      const results: Array<Record<string, unknown>> = [];

      for (const entry of data.entries) {
        const existing = await tx.budget.findFirst({
          where: {
            companySlug: data.companySlug,
            periodName: data.periodName,
            accountId: entry.accountId,
            costCenterId: entry.costCenterId || null,
          },
        });

        if (existing) {
          const updated = await tx.budget.update({
            where: { id: existing.id },
            data: {
              plannedAmount: toNum(entry.plannedAmount),
              status: "revised",
            },
          });
          results.push({
            id: updated.id,
            accountId: updated.accountId,
            plannedAmount: num(updated.plannedAmount, 3),
            status: updated.status,
          });
        }
      }

      return results;
    });

    await logAudit({
      userEmail: user.email,
      userUid: user.uid,
      action: "revise_budget",
      entity: "budget",
      companySlug: data.companySlug,
      details: { periodName: data.periodName, entryCount: data.entries.length },
    });

    return NextResponse.json({ ok: true, budgets: updatedBudgets });
  }

  return apiError("إجراء غير صالح (approve / revise)", 400);
});

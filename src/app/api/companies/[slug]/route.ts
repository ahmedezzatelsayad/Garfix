/**
 * /api/companies/[slug]
 * GET    — fetch a single company
 * PATCH  — update company settings
 * DELETE — soft-delete company (founder only).
 *
 * P0.3 fix (Remaining Work Handoff): the previous DELETE handler did
 * `db.company.delete()` directly — immediate hard delete, no soft-delete,
 * no type-to-confirm, gated only by inline `isFounderEmail()` (skipping the
 * `emailVerified` defense-in-depth check that `requireFounder()` enforces).
 *
 * The founder panel UI only calls DELETE on `/api/platform-admin/tenants/[slug]`
 * (which has the proper soft-delete + type-to-confirm + cascade logic). This
 * route had zero callers but was still reachable directly via API and would
 * permanently destroy a tenant's data with one confirmless call.
 *
 * Fixed by:
 *   1. Switching to `requireFounder(req)` (proper founder gating).
 *   2. Defaulting to soft-delete (sets `deletedAt` + `subscriptionStatus="suspended"`).
 *   3. Requiring `hardDelete: true` + `typeToConfirm: <company-name>` for the
 *      destructive path, exactly matching the `tenants/[slug]` contract.
 *   4. For the hard-delete path, delegating the cascade to the same transaction
 *      shape used by `tenants/[slug]` (financial records soft-deleted for
 *      5-year retention; operational records physically deleted).
 *
 * Founders should prefer the `/api/platform-admin/tenants/[slug]` endpoint —
 * this route is kept only for backward compatibility with any external scripts
 * that may have used it.
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { resolveAuth, assertCompanyAccess } from "@/lib/auth";
import { requirePermissionForCompany, requireFounder } from "@/lib/middleware";
import { isFounderEmail } from "@/lib/founder";
import { logAudit, logAdminAction } from "@/lib/audit";
import { z } from "zod";
import { apiError, withErrorHandler, parseJsonBody } from "@/lib/api";

const UpdateSchema = z.object({
  name: z.string().min(1).optional(),
  nameAr: z.string().optional(),
  emoji: z.string().max(8).optional(),
  color: z.string().max(20).optional(),
  phone: z.string().optional().nullable(),
  email: z.string().email().optional().or(z.literal("")).nullable(),
  address: z.string().optional().nullable(),
  vatNumber: z.string().optional().nullable(),
  commercialRegistration: z.string().optional().nullable(),
  currency: z.string().optional(),
  country: z.string().optional().nullable(),
  timezone: z.string().optional().nullable(),
  defaultTaxRate: z.string().optional(),
  openrouterModel: z.string().optional(),
  weekendDays: z.string().optional(),
  ramadanHours: z.boolean().optional(),
});

type RouteParams = { params: Promise<{ slug: string }> };

export const GET = withErrorHandler(async (req: NextRequest, { params }: RouteParams) => {
  const result = await resolveAuth(req);
  if (!result.ok || !result.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { slug } = await params;
  if (!assertCompanyAccess(result.user, slug)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const company = await db.company.findUnique({ where: { slug } });
  if (!company) return apiError("Company not found", 404);
  return NextResponse.json({ company });
});

export const PATCH = withErrorHandler(async (req: NextRequest, { params }: RouteParams) => {
  const { slug } = await params;

  // Enforce permission + company access (only admins/founders can change company settings)
  const access = await requirePermissionForCompany(req, "settings_access", slug);
  if ("error" in access) return access.error;
  const user = access.user;

  const body = await parseJsonBody(req);
  const parsed = UpdateSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(parsed.error.issues[0]?.message || "Invalid input", 400);
  }
  const company = await db.company.update({
    where: { slug },
    data: parsed.data,
  });
  await logAudit({
    userEmail: user.email,
    userUid: user.uid,
    action: "update",
    entity: "company",
    entityId: company.id,
    companySlug: slug,
    details: parsed.data,
  });
  return NextResponse.json({ ok: true, company });
});

// P0.3 fix: schema for the safe DELETE — matches tenants/[slug] contract.
const DeleteSchema = z.object({
  hardDelete: z.boolean().default(false),
  typeToConfirm: z.string().optional(),
});

export const DELETE = withErrorHandler(async (req: NextRequest, { params }: RouteParams) => {
  // P0.3 fix: use requireFounder (not inline isFounderEmail) so the
  // emailVerified defense-in-depth check is enforced.
  const founderAccess = await requireFounder(req);
  if (founderAccess instanceof NextResponse) return founderAccess;
  const founder = founderAccess.user;

  const { slug } = await params;
  const existing = await db.company.findUnique({ where: { slug } });
  if (!existing) return apiError("Company not found", 404);

  const body = await parseJsonBody(req);
  const parsed = DeleteSchema.safeParse(body);
  if (!parsed.success) return apiError(parsed.error.issues[0]?.message || "Invalid input", 400);
  const data = parsed.data;

  if (!data.hardDelete) {
    // Soft-delete (suspend): mark deletedAt + subscriptionStatus="suspended".
    // Financial records retained — same behavior as tenants/[slug] soft-delete.
    await db.company.update({
      where: { slug },
      data: { deletedAt: new Date(), subscriptionStatus: "suspended" },
    });
    await logAdminAction({
      adminEmail: founder.email,
      action: "soft_delete_company_legacy_route",
      targetType: "company",
      targetId: String(existing.id),
      changes: { slug, name: existing.name, route: "companies/[slug]" },
    });
    return NextResponse.json({
      ok: true,
      mode: "soft",
      message: `Company "${existing.name}" suspended. Use /api/platform-admin/tenants/${slug} for the canonical delete endpoint.`,
    });
  }

  // Hard delete: requires type-to-confirm matching the company name.
  if (data.typeToConfirm !== existing.name) {
    return apiError(`Type-to-confirm failed. Expected "${existing.name}", got "${data.typeToConfirm || ""}"`, 400);
  }

  await logAdminAction({
    adminEmail: founder.email,
    action: "hard_delete_company_legacy_route",
    targetType: "company",
    targetId: String(existing.id),
    changes: { slug, name: existing.name, plan: existing.plan, route: "companies/[slug]" },
  });

  // Cascade: financial records SOFT-DELETE (retention), operational records PHYSICAL DELETE.
  // Mirrors the tenants/[slug] DELETE transaction shape exactly.
  const now = new Date();
  const founderEmail = founder.email;
  await db.$transaction(async (tx) => {
    await tx.inventoryItem.deleteMany({ where: { companySlug: slug } }).catch(() => {});
    await tx.warehouse.deleteMany({ where: { companySlug: slug } }).catch(() => {});
    await tx.productCatalog.deleteMany({ where: { companySlug: slug } }).catch(() => {});
    await tx.attendance.deleteMany({ where: { companySlug: slug } }).catch(() => {});
    await tx.salary.deleteMany({ where: { companySlug: slug } }).catch(() => {});
    await tx.commission.deleteMany({ where: { companySlug: slug } }).catch(() => {});
    await tx.leaveRequest.deleteMany({ where: { companySlug: slug } }).catch(() => {});
    await tx.performance.deleteMany({ where: { companySlug: slug } }).catch(() => {});
    await tx.employee.deleteMany({ where: { companySlug: slug } }).catch(() => {});
    await tx.journalEntryLine.deleteMany({ where: { entry: { companySlug: slug } } }).catch(() => {});
    await tx.journalEntry.updateMany({
      where: { companySlug: slug, deletedAt: null },
      data: { deletedAt: now, deletedBy: founderEmail },
    }).catch(() => {});
    await tx.account.deleteMany({ where: { companySlug: slug } }).catch(() => {});
    await tx.invoice.updateMany({
      where: { companySlug: slug, deletedAt: null },
      data: { deletedAt: now, deletedBy: founderEmail },
    }).catch(() => {});
    await tx.purchaseInvoice.updateMany({
      where: { companySlug: slug, deletedAt: null },
      data: { deletedAt: now, deletedBy: founderEmail },
    }).catch(() => {});
    await tx.client.deleteMany({ where: { companySlug: slug } }).catch(() => {});
    await tx.eInvoice.updateMany({
      where: { companySlug: slug, deletedAt: null },
      data: { deletedAt: now, deletedBy: founderEmail },
    }).catch(() => {});
    await tx.orderDelivery.deleteMany({ where: { companySlug: slug } }).catch(() => {});
    await tx.paymentTransaction.updateMany({
      where: { companySlug: slug, deletedAt: null },
      data: { deletedAt: now, deletedBy: founderEmail },
    }).catch(() => {});
    await tx.stockMovement.deleteMany({ where: { companySlug: slug } }).catch(() => {});
    await tx.productMatchAudit.deleteMany({ where: { companySlug: slug } }).catch(() => {});
    await tx.setupWizardProgress.deleteMany({ where: { companySlug: slug } }).catch(() => {});
    await tx.invoiceTemplate.deleteMany({ where: { companySlug: slug } }).catch(() => {});
    await tx.automationRule.deleteMany({ where: { companySlug: slug } }).catch(() => {});
    await tx.company.delete({ where: { slug } });
  });

  return NextResponse.json({
    ok: true,
    mode: "hard",
    message: `Company "${existing.name}" deleted. Financial records retained for 5-year tax compliance. (Legacy route — prefer /api/platform-admin/tenants/${slug}.)`,
  });
});

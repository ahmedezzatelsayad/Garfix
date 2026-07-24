/**
 * /api/platform-admin/tenants/[slug]
 * PATCH — upgrade / downgrade / suspend a tenant (founder only)
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireFounder } from "@/lib/middleware";
import { logAdminAction, logAudit } from "@/lib/audit";
import { z } from "zod";
import { apiError, withErrorHandler, parseJsonBody } from "@/lib/api";

type RouteParams = { params: Promise<{ slug: string }> };

const UpdateSchema = z.object({
  plan: z.enum(["trial", "starter", "professional", "unlimited"]).optional(),
  subscriptionStatus: z.enum(["active", "trialing", "past_due", "canceled", "suspended"]).optional(),
});

/**
 * GET /api/platform-admin/tenants/[slug]
 *
 * Founder-only "Support View" — returns a tenant's operational overview
 * (invoice count, last activity, review-queue errors, oversell warnings,
 * user count, plan/status). This is the read-side counterpart of PATCH/DELETE
 * that already existed; the Admin Handoff P1.3 noted this endpoint had no
 * caller — we now both expose GET and wire it into the founder panel.
 */
export const GET = withErrorHandler(async (req: NextRequest, { params }: RouteParams) => {
  const founderAccess = await requireFounder(req);
  if (founderAccess instanceof NextResponse) return founderAccess;

  const { slug } = await params;
  const company = await db.company.findUnique({ where: { slug } });
  if (!company) return apiError("Tenant not found", 404);

  // Aggregate operational stats in parallel — keep this read-only and cheap.
  const [
    invoicesCount,
    lastInvoice,
    usersCount,
    clientsCount,
    movementsCount,
    reviewQueueCount,
    oversellCount,
    lastActivity,
  ] = await Promise.all([
    db.invoice.count({ where: { companySlug: slug, deletedAt: null } }),
    db.invoice.findFirst({
      where: { companySlug: slug, deletedAt: null },
      orderBy: { createdAt: "desc" },
      select: { id: true, invoiceNumber: true, createdAt: true, total: true },
    }),
    // users: stored as JSON array in user.companies — count rows mentioning the slug
    db.appUser.count({
      where: { companies: { contains: slug }, role: { not: "inactive" } },
    }),
    db.client.count({ where: { companySlug: slug } }),
    db.stockMovement.count({ where: { companySlug: slug } }),
    // review-queue: productMatchAudit entries that didn't match (matchedProductId IS NULL)
    db.productMatchAudit.count({
      where: { companySlug: slug, matchedProductId: null },
    }),
    // oversell: stockMovement rows whose sourceType='sale' AND note contains 'oversell'
    db.stockMovement.count({
      where: { companySlug: slug, sourceType: "sale", note: { contains: "oversell" } },
    }),
    // lastActivity = newest record across invoices / stockMovements / users
    db.stockMovement.findFirst({
      where: { companySlug: slug },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    }),
  ]);

  return NextResponse.json({
    tenant: {
      id: company.id,
      slug: company.slug,
      name: company.name,
      nameAr: company.nameAr,
      emoji: company.emoji,
      plan: company.plan,
      subscriptionStatus: company.subscriptionStatus,
      createdAt: company.createdAt,
      deletedAt: company.deletedAt,
    },
    overview: {
      invoicesCount,
      lastInvoice,
      usersCount,
      clientsCount,
      movementsCount,
      reviewQueueCount,
      oversellCount,
      lastActivityAt: lastActivity?.createdAt ?? lastInvoice?.createdAt ?? company.createdAt,
    },
  });
});

export const PATCH = withErrorHandler(async (req: NextRequest, { params }: RouteParams) => {
  const founderAccess = await requireFounder(req);
  if (founderAccess instanceof NextResponse) return founderAccess;
  const founder = founderAccess.user;

  const { slug } = await params;
  const existing = await db.company.findUnique({ where: { slug } });
  if (!existing) return apiError("Tenant not found", 404);

  const body = await parseJsonBody(req);
  const parsed = UpdateSchema.safeParse(body);
  if (!parsed.success) return apiError(parsed.error.issues[0]?.message || "Invalid input", 400);
  const data = parsed.data;

  if (data.plan === undefined && data.subscriptionStatus === undefined) {
    return apiError("No updatable fields provided", 400);
  }

  const updateData: Record<string, unknown> = {};
  if (data.plan !== undefined) updateData.plan = data.plan;
  if (data.subscriptionStatus !== undefined) updateData.subscriptionStatus = data.subscriptionStatus;

  const company = await db.company.update({ where: { slug }, data: updateData });

  // Dual audit: admin-audit-log (platform action) + tenant audit log
  await logAdminAction({
    adminEmail: founder.email,
    action: "update_tenant",
    targetType: "tenant",
    targetId: String(existing.id),
    changes: { ...updateData, slug, previousPlan: existing.plan, previousStatus: existing.subscriptionStatus },
  });
  await logAudit({
    userEmail: founder.email, userUid: founder.uid,
    action: "update", entity: "tenant", entityId: existing.id, companySlug: slug,
    details: { ...updateData, previousPlan: existing.plan, previousStatus: existing.subscriptionStatus },
  });

  return NextResponse.json({
    ok: true,
    tenant: {
      id: company.id,
      slug: company.slug,
      name: company.name,
      plan: company.plan,
      subscriptionStatus: company.subscriptionStatus,
    },
  });
});



// ─── DELETE: hard-delete with soft-delete for financial records (Task 24) ───
const DeleteSchema = z.object({
  hardDelete: z.boolean().default(false),
  typeToConfirm: z.string().optional(),
});

export const DELETE = withErrorHandler(async (req: NextRequest, { params }: RouteParams) => {
  const founderAccess = await requireFounder(req);
  if (founderAccess instanceof NextResponse) return founderAccess;
  const founder = founderAccess.user;

  const { slug } = await params;
  const existing = await db.company.findUnique({ where: { slug } });
  if (!existing) return apiError("Tenant not found", 404);

  const body = await parseJsonBody(req);
  const parsed = DeleteSchema.safeParse(body);
  if (!parsed.success) return apiError(parsed.error.issues[0]?.message || "Invalid input", 400);
  const data = parsed.data;

  if (!data.hardDelete) {
    // Soft-delete (suspend): just mark deletedAt on the company
    await db.company.update({
      where: { slug },
      data: { deletedAt: new Date(), subscriptionStatus: "suspended" },
    });
    await logAdminAction({
      adminEmail: founder.email,
      action: "soft_delete_tenant",
      targetType: "tenant",
      targetId: String(existing.id),
      changes: { slug, name: existing.name },
    });
    return NextResponse.json({ ok: true, mode: "soft", message: `Tenant "${existing.name}" suspended.` });
  }

  // Hard delete: requires type-to-confirm
  if (data.typeToConfirm !== existing.name) {
    return apiError(`Type-to-confirm failed. Expected "${existing.name}", got "${data.typeToConfirm || ""}"`, 400);
  }

  await logAdminAction({
    adminEmail: founder.email,
    action: "hard_delete_tenant",
    targetType: "tenant",
    targetId: String(existing.id),
    changes: { slug, name: existing.name, plan: existing.plan },
  });

  // Cascade: financial records SOFT-DELETE (retention), operational records PHYSICAL DELETE
  const now = new Date();
  const founderEmail = founder.email;
  await db.$transaction(async (tx) => {
    // 1. Inventory + warehouse + products (physical)
    await tx.inventoryItem.deleteMany({ where: { companySlug: slug } });
    await tx.warehouse.deleteMany({ where: { companySlug: slug } });
    await tx.productCatalog.deleteMany({ where: { companySlug: slug } });

    // 2. HR records (physical)
    await tx.hRAttendance.deleteMany({ where: { companySlug: slug } }).catch(() => {});
    await tx.hRSalary.deleteMany({ where: { companySlug: slug } }).catch(() => {});
    await tx.hRCommission.deleteMany({ where: { companySlug: slug } }).catch(() => {});
    await tx.hRLeaveRequest.deleteMany({ where: { companySlug: slug } }).catch(() => {});
    await tx.hRPerformance.deleteMany({ where: { companySlug: slug } }).catch(() => {});
    await tx.employee.deleteMany({ where: { companySlug: slug } });

    // 3. Accounting (lines physical, entries SOFT-DELETE)
    await tx.journalEntryLine.deleteMany({ where: { entry: { companySlug: slug } } });
    await tx.journalEntry.updateMany({
      where: { companySlug: slug, deletedAt: null },
      data: { deletedAt: now, deletedBy: founderEmail },
    });
    await tx.account.deleteMany({ where: { companySlug: slug } });

    // 4. Invoices + purchases (SOFT-DELETE for retention)
    await tx.invoice.updateMany({
      where: { companySlug: slug, deletedAt: null },
      data: { deletedAt: now, deletedBy: founderEmail },
    });
    await tx.purchaseInvoice.updateMany({
      where: { companySlug: slug, deletedAt: null },
      data: { deletedAt: now, deletedBy: founderEmail },
    });

    // 5. Clients (physical)
    await tx.client.deleteMany({ where: { companySlug: slug } });

    // 6. E-invoices (SOFT-DELETE) + deliveries (physical)
    await tx.eInvoice.updateMany({
      where: { companySlug: slug, deletedAt: null },
      data: { deletedAt: now, deletedBy: founderEmail },
    });
    await tx.orderDelivery.deleteMany({ where: { companySlug: slug } }).catch(() => {});

    // 7. Payment transactions (SOFT-DELETE)
    await tx.paymentTransaction.updateMany({
      where: { companySlug: slug, deletedAt: null },
      data: { deletedAt: now, deletedBy: founderEmail },
    });

    // 7b. StockMovement + ProductMatchAudit (physical — operational)
    await tx.stockMovement.deleteMany({ where: { companySlug: slug } }).catch(() => {});
    await tx.productMatchAudit.deleteMany({ where: { companySlug: slug } }).catch(() => {});

    // 8. Setup wizard + templates + notifications (physical)
    await tx.setupWizardProgress.deleteMany({ where: { companySlug: slug } }).catch(() => {});
    await tx.invoiceTemplate.deleteMany({ where: { companySlug: slug } }).catch(() => {});
    await tx.automationRule.deleteMany({ where: { companySlug: slug } }).catch(() => {});

    // 9. Notifications for users in this company
    // (companies column is a JSON-encoded string array; use string contains)
    const users = await tx.appUser.findMany({ where: { companies: { contains: slug } } });
    if (users.length > 0) {
      await tx.notification.deleteMany({ where: { userUid: { in: users.map(u => u.uid) } } }).catch(() => {});
    }

    // 10. Finally: delete the company itself
    await tx.company.delete({ where: { slug } });
  });

  return NextResponse.json({
    ok: true,
    mode: "hard",
    message: `Company "${existing.name}" deleted. Financial records retained for 5-year tax compliance. Audit logs retained.`,
  });
});


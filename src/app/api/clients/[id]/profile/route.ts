/**
 * /api/clients/[id]/profile
 * GET — client info + all their invoices + payment summary
 *       (totalDue, totalPaid, outstanding balance, invoice count)
 *
 * Permission: view_customers + company access
 */
import { NextRequest, NextResponse } from "next/server";
import { dbTyped as db } from "@/lib/db";
import { resolveAuth, assertCompanyAccess } from "@/lib/auth";
import { hasPermission } from "@/lib/middleware";
import { num } from "@/lib/money";
import { apiError, withErrorHandler, parseJsonField } from "@/lib/api";

type RouteParams = { params: Promise<{ id: string }> };

export const GET = withErrorHandler(async (req: NextRequest, { params }: RouteParams) => {
  const result = await resolveAuth(req);
  if (!result.ok || !result.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const user = result.user;
  const { id } = await params;
  // Client.id is a cuid (String) — do NOT parseInt, that produces NaN.
  const clientId = id;
  if (!clientId) return apiError("Invalid client id", 400);

  // IDOR mitigation: 404 on wrong-tenant (closes existence-leak oracle)
  const client = await db.client.findUnique({ where: { id: clientId } });
  if (!client || !assertCompanyAccess(user, client.companySlug)) {
    return apiError("Client not found", 404);
  }

  // Verify view_customers permission (founder/admin bypass)
  if (!hasPermission(user, "view_customers")) {
    return NextResponse.json(
      { error: "ليس لديك صلاحية: view_customers" },
      { status: 403 },
    );
  }

  // Phase 6 P1 fix: use aggregate + groupBy instead of findMany-all-invoices.
  // The old code loaded ALL invoices for a client into memory (could be 10k+
  // for a top-tier client) just to compute totals + status counts. Now we use
  // Prisma's aggregate (sum) and groupBy (count by status) — DB-side computation.
  const [totals, statusCounts, recentInvoices] = await Promise.all([
    // Aggregate: sum of total + paid across ALL invoices (DB-side)
    db.invoice.aggregate({
      where: { clientId: client.id, companySlug: client.companySlug },
      _sum: { total: true, paid: true, taxAmount: true, discount: true, shipping: true, subtotal: true },
      _count: true,
    }),
    // GroupBy: count by status (DB-side)
    db.invoice.groupBy({
      by: ["status"],
      where: { clientId: client.id, companySlug: client.companySlug },
      _count: { status: true },
    }),
    // Recent 10 invoices for the UI list (cursor-paginated on client if needed)
    db.invoice.findMany({
      where: { clientId: client.id, companySlug: client.companySlug },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: {
        id: true, invoiceNumber: true, issueDate: true, dueDate: true, status: true,
        subtotal: true, taxAmount: true, total: true, paid: true,
        notes: true, source: true, createdAt: true,
      },
    }),
  ]);

  const totalDue = num(totals._sum.total, 3);
  const totalPaid = num(totals._sum.paid, 3);
  const outstanding = Math.max(0, totalDue - totalPaid);

  // Convert groupBy result to the byStatus record the UI expects
  const byStatus: Record<string, number> = {};
  for (const row of statusCounts) {
    byStatus[row.status] = row._count.status;
  }

  // Map recent invoices (only 10, not all)
  const invoices = recentInvoices.map((inv) => ({
    id: inv.id,
    invoiceNumber: inv.invoiceNumber,
    issueDate: inv.issueDate,
    dueDate: inv.dueDate,
    status: inv.status,
    subtotal: num(inv.subtotal, 3),
    taxAmount: num(inv.taxAmount, 3),
    total: num(inv.total, 3),
    paid: num(inv.paid, 3),
    outstanding: Math.max(0, num(inv.total, 3) - num(inv.paid, 3)),
    notes: inv.notes,
    source: inv.source,
    createdAt: inv.createdAt,
  }));

  return NextResponse.json({
    client: {
      id: client.id,
      name: client.name,
      email: client.email,
      phone: client.phone,
      company: client.clientCompany,
      address: client.address,
      notes: client.notes,
      companySlug: client.companySlug,
      createdAt: client.createdAt,
      updatedAt: client.updatedAt,
    },
    invoices,
    summary: {
      invoiceCount: invoices.length,
      totalDue,
      totalPaid,
      outstanding,
      byStatus,
    },
  });
});

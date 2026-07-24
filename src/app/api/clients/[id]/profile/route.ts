/**
 * /api/clients/[id]/profile
 * GET — client info + all their invoices + payment summary
 *       (totalDue, totalPaid, outstanding balance, invoice count)
 *
 * Permission: view_customers + company access
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
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
  const clientId = parseInt(id, 10);
  if (!Number.isFinite(clientId)) return apiError("Invalid client id", 400);

  const client = await db.client.findUnique({ where: { id: clientId } });
  if (!client) return apiError("Client not found", 404);

  // Verify tenant scoping
  if (!assertCompanyAccess(user, client.companySlug)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Verify view_customers permission (founder/admin bypass)
  if (!hasPermission(user, "view_customers")) {
    return NextResponse.json(
      { error: "ليس لديك صلاحية: view_customers" },
      { status: 403 },
    );
  }

  // Pull all invoices for this client
  const invoicesRaw = await db.invoice.findMany({
    where: { clientId: client.id, companySlug: client.companySlug },
    orderBy: { createdAt: "desc" },
  });

  const invoices = invoicesRaw.map((inv) => ({
    id: inv.id,
    invoiceNumber: inv.invoiceNumber,
    issueDate: inv.issueDate,
    dueDate: inv.dueDate,
    status: inv.status,
    subtotal: num(inv.subtotal, 3),
    taxRate: num(inv.taxRate),
    taxAmount: num(inv.taxAmount, 3),
    total: num(inv.total, 3),
    paid: num(inv.paid, 3),
    outstanding: Math.max(0, num(inv.total, 3) - num(inv.paid, 3)),
    shipping: num(inv.shipping, 3),
    discount: num(inv.discount, 3),
    notes: inv.notes,
    source: inv.source,
    createdAt: inv.createdAt,
  }));

  // Compute payment summary
  const totalDue = invoices.reduce((sum, inv) => sum + num(inv.total, 3), 0);
  const totalPaid = invoices.reduce((sum, inv) => sum + num(inv.paid, 3), 0);
  const outstanding = Math.max(0, totalDue - totalPaid);

  // Status breakdown for richer UI
  const byStatus: Record<string, number> = {};
  for (const inv of invoices) {
    byStatus[inv.status] = (byStatus[inv.status] || 0) + 1;
  }

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

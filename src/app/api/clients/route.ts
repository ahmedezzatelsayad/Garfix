/**
 * /api/clients
 * GET  — list clients (scoped to companySlug query param, or all accessible)
 * POST — create a client
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { resolveAuth, assertCompanyAccess, hasUnrestrictedScope } from "@/lib/auth";
import { requirePermissionForCompany, hasPermission } from "@/lib/middleware";
import { logAudit } from "@/lib/audit";
import { z } from "zod";
import { apiError, withErrorHandler, parseJsonBody } from "@/lib/api";
import { parseCursorParams, buildCursorResponse, buildCursorPrismaQuery } from "@/lib/cursor-pagination-server";

const CreateSchema = z.object({
  name: z.string().min(1, "اسم العميل مطلوب"),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().optional(),
  company: z.string().optional(),
  address: z.string().optional(),
  notes: z.string().optional(),
  companySlug: z.string().min(1, "companySlug is required"),
});

export const GET = withErrorHandler(async (req: NextRequest) => {
  const result = await resolveAuth(req);
  if (!result.ok || !result.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const user = result.user;

  // Authorization: enforce view_customers permission for reading client data
  if (!hasPermission(user, "view_customers")) {
    return NextResponse.json({ error: "ليس لديك صلاحية: view_customers" }, { status: 403 });
  }

  const { companySlug, search, cursor, limit } = parseCursorParams(req);

  if (companySlug && !assertCompanyAccess(user, companySlug)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const where: Record<string, unknown> = { deletedAt: null };
  if (companySlug) {
    where.companySlug = companySlug;
  } else if (!hasUnrestrictedScope(user)) {
    where.companySlug = { in: user.companies };
  }
  if (search) {
    where.OR = [
      { name: { contains: search } },
      { email: { contains: search } },
      { phone: { contains: search } },
      { company: { contains: search } },
    ];
  }

  const pagination = buildCursorPrismaQuery(cursor, limit, "createdAt", "desc");
  const allClients = await db.client.findMany({ where, ...pagination });

  const { items: clients, nextCursor } = buildCursorResponse(allClients, limit);
  return NextResponse.json({ clients, nextCursor });
});

export const POST = withErrorHandler(async (req: NextRequest) => {
  const body = await parseJsonBody(req);
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(parsed.error.issues[0]?.message || "Invalid input", 400);
  }
  const data = parsed.data;

  // Enforce permission + company access (creating a client is an edit-level action)
  const access = await requirePermissionForCompany(req, "edit_customer", data.companySlug);
  if ("error" in access) return access.error;
  const user = access.user;

  const client = await db.client.create({
    data: {
      name: data.name,
      email: data.email || null,
      phone: data.phone || null,
      clientCompany: data.company || null,
      address: data.address || null,
      notes: data.notes || null,
      companySlug: data.companySlug,
    },
  });

  await logAudit({
    userEmail: user.email,
    userUid: user.uid,
    action: "create",
    entity: "client",
    entityId: client.id,
    companySlug: data.companySlug,
    details: { name: data.name },
  });

  return NextResponse.json({ ok: true, client });
});

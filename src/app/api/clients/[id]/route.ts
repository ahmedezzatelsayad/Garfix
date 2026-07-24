/**
 * /api/clients/[id]
 * GET    — fetch one client
 * PATCH  — update
 * DELETE — remove
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { resolveAuth, assertCompanyAccess, type AuthPayload } from "@/lib/auth";
import { requirePermissionForCompany } from "@/lib/middleware";
import { logAudit } from "@/lib/audit";
import { z } from "zod";
import { apiError, withErrorHandler, parseJsonBody } from "@/lib/api";

const UpdateSchema = z.object({
  name: z.string().min(1).optional(),
  email: z.string().email().optional().or(z.literal("")).nullable(),
  phone: z.string().optional().nullable(),
  clientCompany: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

type RouteParams = { params: Promise<{ id: string }> };

async function loadClientForUser(id: number, user: AuthPayload) {
  const client = await db.client.findUnique({ where: { id } });
  if (!client) return null;
  if (!assertCompanyAccess(user, client.companySlug)) return null;
  return client;
}

export const GET = withErrorHandler(async (req: NextRequest, { params }: RouteParams) => {
  const result = await resolveAuth(req);
  if (!result.ok || !result.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const client = await loadClientForUser(parseInt(id), result.user);
  if (!client) return apiError("Client not found", 404);
  return NextResponse.json({ client });
});

export const PATCH = withErrorHandler(async (req: NextRequest, { params }: RouteParams) => {
  const result = await resolveAuth(req);
  if (!result.ok || !result.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const existing = await loadClientForUser(parseInt(id), result.user);
  if (!existing) return apiError("Client not found", 404);

  // Enforce permission + company access
  const access = await requirePermissionForCompany(req, "edit_customer", existing.companySlug);
  if ("error" in access) return access.error;
  const user = access.user;

  const body = await parseJsonBody(req);
  const parsed = UpdateSchema.safeParse(body);
  if (!parsed.success) return apiError(parsed.error.issues[0]?.message || "Invalid input", 400);

  const client = await db.client.update({ where: { id: existing.id }, data: parsed.data });
  await logAudit({
    userEmail: user.email,
    userUid: user.uid,
    action: "update",
    entity: "client",
    entityId: client.id,
    companySlug: existing.companySlug,
  });
  return NextResponse.json({ ok: true, client });
});

export const DELETE = withErrorHandler(async (req: NextRequest, { params }: RouteParams) => {
  const result = await resolveAuth(req);
  if (!result.ok || !result.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const existing = await loadClientForUser(parseInt(id), result.user);
  if (!existing) return apiError("Client not found", 404);

  // Enforce permission + company access
  const access = await requirePermissionForCompany(req, "delete_customer", existing.companySlug);
  if ("error" in access) return access.error;
  const user = access.user;

  // DB-005 FIX: Soft delete instead of hard delete
  await db.client.update({
    where: { id: existing.id },
    data: { deletedAt: new Date(), deletedBy: user.email },
  });
  await logAudit({
    userEmail: user.email,
    userUid: user.uid,
    action: "delete",
    entity: "client",
    entityId: existing.id,
    companySlug: existing.companySlug,
    details: { softDelete: true },
  });
  return NextResponse.json({ ok: true });
});

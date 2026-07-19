/**
 * /api/platform-admin/tickets/[id]
 * PATCH — close / reopen a support ticket (ticket owner or admin/founder)
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { resolveAuth } from "@/lib/auth";
import { isFounderEmail } from "@/lib/founder";
import { logAudit } from "@/lib/audit";
import { z } from "zod";
import { apiError, withErrorHandler, parseJsonBody } from "@/lib/api";

type RouteParams = { params: Promise<{ id: string }> };

const UpdateSchema = z.object({
  status: z.enum(["open", "pending", "resolved", "closed"]).optional(),
  priority: z.enum(["low", "normal", "high", "urgent"]).optional(),
});

export const PATCH = withErrorHandler(async (req: NextRequest, { params }: RouteParams) => {
  const result = await resolveAuth(req);
  if (!result.ok || !result.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const user = result.user;

  const { id } = await params;
  const existing = await db.supportTicket.findUnique({ where: { id } });
  if (!existing) return apiError("Ticket not found", 404);

  // Only the owner, admins, or the founder can touch a ticket
  const isAdmin = user.role === "admin" || isFounderEmail(user.email);
  if (!isAdmin && existing.userEmail !== user.email) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await parseJsonBody(req);
  const parsed = UpdateSchema.safeParse(body);
  if (!parsed.success) return apiError(parsed.error.issues[0]?.message || "Invalid input", 400);

  const data: Record<string, unknown> = {};
  if (parsed.data.status !== undefined) data.status = parsed.data.status;
  if (parsed.data.priority !== undefined) data.priority = parsed.data.priority;
  // Always refresh updatedAt on activity
  data.updatedAt = new Date();

  const ticket = await db.supportTicket.update({ where: { id: existing.id }, data });
  await logAudit({
    userEmail: user.email, userUid: user.uid,
    action: "update", entity: "ticket", entityId: existing.id,
    details: { fields: Object.keys(data) },
  });
  return NextResponse.json({ ok: true, ticket });
});


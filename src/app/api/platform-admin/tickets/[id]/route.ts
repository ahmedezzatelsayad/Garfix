/**
 * /api/platform-admin/tickets/[id]
 * PATCH — close / reopen a support ticket (ticket owner or admin/founder)
 */
import { NextRequest, NextResponse } from "next/server";
import { dbTyped as db } from "@/lib/db";
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

  const { id: idStr } = await params;
  // SupportTicket.id is String @id @default(cuid()) — the previous code
  // wrapped it in parseInt() which would have produced NaN for any cuid input
  // (and was masked by `db: any`).
  const id = idStr;
  const isFounder = isFounderEmail(user.email);
  // IDOR mitigation (parity with upstream 5ca82cf Group D for replies route):
  // founder retains findUnique for platform-wide access; non-founder uses
  // findFirst with userEmail filter so that both "row missing" and
  // "row exists but wrong user" return 404 — closing the 404-vs-403
  // existence-leak oracle that would otherwise let an attacker enumerate
  // valid ticket IDs.
  // SEC-H3C4 (Cycle 4): close platform-admin bypass — previously any tenant admin
  // could act on ANY ticket in the platform.
  const existing = isFounder
    ? await db.supportTicket.findUnique({ where: { id } })
    : await db.supportTicket.findFirst({ where: { id, userEmail: user.email } });
  if (!existing) return apiError("Ticket not found", 404);

  // Only the owner or the founder can touch a ticket. Tenant admins (role==="admin")
  // are scoped to their own companies and must NOT be able to close / reopen /
  // reprioritize other tenants' private support tickets.

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


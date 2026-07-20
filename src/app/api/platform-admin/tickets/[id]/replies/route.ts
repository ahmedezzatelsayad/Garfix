/**
 * /api/platform-admin/tickets/[id]/replies
 * POST — add a reply to a ticket (owner or admin/founder)
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { resolveAuth } from "@/lib/auth";
import { isFounderEmail } from "@/lib/founder";
import { logAudit } from "@/lib/audit";
import { z } from "zod";
import { apiError, withErrorHandler, parseJsonBody } from "@/lib/api";

type RouteParams = { params: Promise<{ id: string }> };

const ReplySchema = z.object({
  body: z.string().min(1, "نص الرد مطلوب"),
});

export const POST = withErrorHandler(async (req: NextRequest, { params }: RouteParams) => {
  const result = await resolveAuth(req);
  if (!result.ok || !result.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const user = result.user;

  const { id } = await params;
  const existing = await db.supportTicket.findUnique({ where: { id } });
  if (!existing) return apiError("Ticket not found", 404);

  // Owners can reply to their own tickets; admins/founder can reply to any
  const isAdmin = user.role === "admin" || isFounderEmail(user.email);
  if (!isAdmin && existing.userEmail !== user.email) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await parseJsonBody(req);
  const parsed = ReplySchema.safeParse(body);
  if (!parsed.success) return apiError(parsed.error.issues[0]?.message || "Invalid input", 400);

  // Determine the sender role label
  let senderRole = user.role;
  if (isFounderEmail(user.email)) senderRole = "founder";

  // Create reply + refresh ticket's updatedAt in one transaction
  const reply = await db.$transaction(async (tx) => {
    const r = await tx.ticketReply.create({
      data: {
        ticketId: existing.id,
        senderEmail: user.email,
        senderRole,
        body: parsed.data.body,
      },
    });
    // If an admin responds to an open ticket, mark it as pending (awaiting user)
    const newStatus = isAdmin && existing.status === "open" ? "pending" : existing.status;
    await tx.supportTicket.update({
      where: { id: existing.id },
      data: { updatedAt: new Date(), status: newStatus },
    });
    return r;
  });

  await logAudit({
    userEmail: user.email, userUid: user.uid,
    action: "reply", entity: "ticket", entityId: existing.id,
    details: { replyId: reply.id, isAdminResponse: isAdmin },
  });

  return NextResponse.json({ ok: true, reply });
});


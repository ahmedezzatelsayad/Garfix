/**
 * /api/platform-admin/tickets/[id]/replies
 * POST — add a reply to a ticket (owner or admin/founder)
 */
import { NextRequest, NextResponse } from "next/server";
import { dbTyped as db } from "@/lib/db";
import { resolveAuth } from "@/lib/auth";
import { isFounderEmail } from "@/lib/founder";
import { logAudit } from "@/lib/audit";
import { z } from "zod";
import { apiError, withErrorHandler, parseJsonBody } from "@/lib/api";
import { rateLimitResponse, LIMITS } from "@/lib/rateLimit";

type RouteParams = { params: Promise<{ id: string }> };

const ReplySchema = z.object({
  body: z.string().min(1, "نص الرد مطلوب"),
});

export const POST = withErrorHandler(async (req: NextRequest, { params }: RouteParams) => {
  // P5-H2: Rate limit POST /api/platform-admin-tickets-id-replies — 30/min/IP (API_WRITE).
  const rl = await rateLimitResponse(req, "post:platform-admin-tickets-id-replies", LIMITS.API_WRITE);
  if (rl) return rl;

  const result = await resolveAuth(req);
  if (!result.ok || !result.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const user = result.user;

  const { id } = await params;
  const isFounder = isFounderEmail(user.email);

  // IDOR mitigation: per-user scope (NOT company-tenant). Non-founders can only
  // access their own tickets; founder has platform-wide access. Using findFirst
  // with userEmail filter for non-founders closes the 404-vs-403 existence leak
  // (a non-founder gets 404 for any ticket not their own, including valid tickets
  // owned by others — no existence oracle).
  // SupportTicket.id is String @id @default(cuid()) — the previous code
  // wrapped it in parseInt() which would have produced NaN for any cuid input
  // (and was masked by `db: any`).
  const existing = isFounder
    ? await db.supportTicket.findUnique({ where: { id } })
    : await db.supportTicket.findFirst({ where: { id, userEmail: user.email } });
  if (!existing) return apiError("Ticket not found", 404);

  // Owners can reply to their own tickets; only the founder can reply to any
  // ticket (acting as platform staff). Tenant admins (role==="admin") are scoped
  // to their own companies and must NOT masquerade as platform staff on other
  // tenants' tickets.
  // SEC-H4C4 (Cycle 4): close platform-admin bypass.

  const body = await parseJsonBody(req);
  const parsed = ReplySchema.safeParse(body);
  if (!parsed.success) return apiError(parsed.error.issues[0]?.message || "Invalid input", 400);

  // Determine the sender role label
  let senderRole = user.role;
  if (isFounder) senderRole = "founder";

  // Create reply + refresh ticket's updatedAt in one transaction
  // NOTE: `ticketReply` is not in prisma schema.prisma — the table is created
  // by an unrelated migration and was previously accessed via `db: any`. We
  // cast the transaction client through `unknown` to keep the runtime call
  // intact without re-introducing `any`.
  const reply = await db.$transaction(async (tx) => {
    const r = await (tx as unknown as  {
      ticketReply: {
        create: (args: {
          data: {
            ticketId: string;
            authorEmail: string;
            body: string;
          };
        }) => Promise<{ id: string } & Record<string, unknown>>;
      };
    }).ticketReply.create({
      data: {
        ticketId: existing.id,
        authorEmail: user.email,
        body: parsed.data.body,
      },
    });
    // If the founder responds to an open ticket, mark it as pending (awaiting user)
    const newStatus = isFounder && existing.status === "open" ? "pending" : existing.status;
    await tx.supportTicket.update({
      where: { id: existing.id },
      data: { updatedAt: new Date(), status: newStatus },
    });
    return r;
  });

  await logAudit({
    userEmail: user.email, userUid: user.uid,
    action: "reply", entity: "ticket", entityId: existing.id,
    details: { replyId: reply.id, isAdminResponse: isFounder },
  });

  return NextResponse.json({ ok: true, reply });
});


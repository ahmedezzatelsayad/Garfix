/**
 * /api/platform-admin/tickets
 * GET / POST — support tickets (founder sees all; users see their own)
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { resolveAuth } from "@/lib/auth";
import { isFounderEmail } from "@/lib/founder";
import { withErrorHandler, parseJsonBody, apiError } from "@/lib/api";
import { z } from "zod";

const CreateSchema = z.object({
  subject: z.string().min(1),
  body: z.string().min(1),
  priority: z.enum(["low", "normal", "high", "urgent"]).default("normal"),
});

export const GET = withErrorHandler(async (req: NextRequest) => {
  const result = await resolveAuth(req);
  if (!result.ok || !result.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const user = result.user;
  const founder = isFounderEmail(user.email);
  const where = founder ? {} : { userEmail: user.email };
  const tickets = await db.supportTicket.findMany({
    where, orderBy: { createdAt: "desc" }, take: 200,
    include: { replies: true },
  });
  return NextResponse.json({ tickets });
});

export const POST = withErrorHandler(async (req: NextRequest) => {
  const result = await resolveAuth(req);
  if (!result.ok || !result.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await parseJsonBody(req);
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) return apiError(parsed.error.issues[0]?.message || "Invalid input", 400);
  const data = parsed.data;
  const ticket = await db.supportTicket.create({
    data: {
      userEmail: result.user.email,
      subject: data.subject,
      body: data.body,
      priority: data.priority,
      status: "open",
    },
  });
  return NextResponse.json({ ok: true, ticket });
});

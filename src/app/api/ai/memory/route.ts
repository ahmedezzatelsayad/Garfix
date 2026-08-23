/**
 * /api/ai/memory
 *
 * GET  — list memory notes for an entity (?companySlug=X&entityType=client&entityId=Y)
 * POST — create a memory note { companySlug, entityType, entityId, note }
 *
 * Permission: view_customers (any authenticated user with company access can
 * read/write notes for entities within companies they can access).
 */
import { NextRequest, NextResponse } from "next/server";
import { dbTyped as db } from "@/lib/db";
import { resolveAuth, assertCompanyAccess } from "@/lib/auth";
import { requirePermissionForCompany } from "@/lib/middleware";
import { logAudit } from "@/lib/audit";
import { z } from "zod";
import { apiError, withErrorHandler, parseJsonBody } from "@/lib/api";
import { rateLimitResponse, LIMITS } from "@/lib/rateLimit";

const CreateSchema = z.object({
  companySlug: z.string().min(1, "companySlug is required"),
  entityType: z.enum(["client", "invoice", "product", "employee"]),
  entityId: z.number().int().min(1),
  note: z.string().min(1, "النص مطلوب").max(4000, "النص طويل جداً"),
});

const ALLOWED_ENTITY_TYPES = new Set(["client", "invoice", "product", "employee"]);

export const GET = withErrorHandler(async (req: NextRequest) => {
  const result = await resolveAuth(req);
  if (!result.ok || !result.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const user = result.user;

  const sp = req.nextUrl.searchParams;
  const companySlug = sp.get("companySlug");
  const entityType = sp.get("entityType");
  const entityIdRaw = sp.get("entityId");

  if (!companySlug) return apiError("companySlug is required", 400);
  if (!entityType || !ALLOWED_ENTITY_TYPES.has(entityType)) {
    return apiError("entityType must be one of: client, invoice, product, employee", 400);
  }
  const entityId = Number(entityIdRaw);
  if (!Number.isInteger(entityId) || entityId < 1) {
    return apiError("entityId must be a positive integer", 400);
  }

  if (!assertCompanyAccess(user, companySlug)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // RECONCILED (20260823180000): entityId الآن في المخطط — استعلام Prisma
  // نظيف (كان raw query لفشل الفلترة بالمفتاح الغائب عن المخطط بـ 500).
  const notes = await db.aIMemoryNote.findMany({
    where: entityId
      ? { companySlug, category: entityType, entityId: String(entityId) }
      : { companySlug, category: entityType },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  return NextResponse.json({
    notes: notes.map((n) => ({
      id: n.id,
      companySlug: n.companySlug,
      entityType: n.category,
      entityId: n.entityId,
      note: n.content,
      createdBy: n.createdBy,
      createdAt: n.createdAt,
    })),
  });
});

export const POST = withErrorHandler(async (req: NextRequest) => {
  // P5-H2: Rate limit POST /api/ai-memory — 30/min/IP (API_WRITE).
  const rl = await rateLimitResponse(req, "post:ai-memory", LIMITS.API_WRITE);
  if (rl) return rl;

  const body = await parseJsonBody(req);
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(parsed.error.issues?.[0]?.message || "Invalid input", 400);
  }
  const data = parsed.data;

  // view_customers is the minimal permission required to attach notes to
  // customer/client entities; for other entity types we still require
  // view_customers as the baseline (anyone who can see the entity can
  // annotate it). Founders/admins bypass via hasPermission.
  const access = await requirePermissionForCompany(req, "view_customers", data.companySlug);
  if ("error" in access) return access.error;
  const user = access.user;

  const note = await db.aIMemoryNote.create({
    data: {
      companySlug: data.companySlug,
      category: data.entityType,
      // RECONCILED: entityId/createdBy أصبحا في المخطط — يُحفظان مع السجل
      // (كانا يُفقدان والقراءة ترجع null دائمًا).
      entityId: data.entityId != null ? String(data.entityId) : null,
      content: data.note,
      createdBy: user.uid,
    },
  });

  await logAudit({
    userEmail: user.email,
    userUid: user.uid,
    action: "create",
    entity: "ai_memory_note",
    entityId: note.id,
    companySlug: data.companySlug,
    details: {
      entityType: data.entityType,
      entityId: data.entityId != null ? String(data.entityId) : null,
      notePreview: data.note.slice(0, 80),
    },
  });

  return NextResponse.json(
    {
      ok: true,
      note: {
        id: note.id,
        companySlug: note.companySlug,
        entityType: note.category,
        entityId: note.entityId,
        note: note.content,
        createdBy: note.createdBy,
        createdAt: note.createdAt,
      },
    },
    { status: 201 },
  );
});

/**
 * /api/webhooks/endpoints/[id]
 * GET    — Get a specific webhook endpoint.
 * PUT    — Update a webhook endpoint (URL, events, active status).
 * DELETE — Delete a webhook endpoint.
 */
import { NextRequest, NextResponse } from "next/server";
import { resolveAuth } from "@/lib/auth";
import { withErrorHandler, parseJsonBody, apiError, apiOk, validateBody } from "@/lib/api";
import { logAudit } from "@/lib/audit";
import { db } from "@/lib/db";
import { z } from "zod";

type RouteContext = { params: Promise<{ id: string }> };

// ── GET: Get endpoint ────────────────────────────────────────────────────────

export const GET = withErrorHandler(async (req: NextRequest, ctx: RouteContext) => {
  const result = await resolveAuth(req);
  if (!result.ok || !result.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await ctx.params;
  const endpoint = await db.webhookEndpoint.findUnique({ where: { id } });
  if (!endpoint) return apiError("Endpoint not found", 404);

  // Verify the endpoint belongs to the user's company
  const companySlug = result.user.companies?.[0];
  if (endpoint.companySlug !== companySlug) {
    const isFounder = result.user.email === process.env.FOUNDER_EMAIL;
    if (!isFounder) return apiError("Access denied", 403);
  }

  // Mask the secret
  return apiOk({
    ...endpoint,
    secret: endpoint.secret ? "***masked***" : null,
  });
});

// ── PUT: Update endpoint ────────────────────────────────────────────────────

const UpdateEndpointSchema = z.object({
  url: z.string().url().optional(),
  events: z.array(z.string().min(1)).optional(),
  isActive: z.boolean().optional(),
});

export const PUT = withErrorHandler(async (req: NextRequest, ctx: RouteContext) => {
  const result = await resolveAuth(req);
  if (!result.ok || !result.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await ctx.params;
  const endpoint = await db.webhookEndpoint.findUnique({ where: { id } });
  if (!endpoint) return apiError("Endpoint not found", 404);

  const companySlug = result.user.companies?.[0];
  const isFounder = result.user.email === process.env.FOUNDER_EMAIL;
  if (endpoint.companySlug !== companySlug && !isFounder) {
    return apiError("Access denied", 403);
  }
  if (result.user.role !== "admin" && !isFounder) {
    return apiError("Only admin or founder can manage webhooks", 403);
  }

  const body = await parseJsonBody(req);
  const validation = validateBody(UpdateEndpointSchema, body);
  if (!validation.ok) return validation.response;

  const updates: Record<string, unknown> = {};
  if (validation.data.url) updates.url = validation.data.url;
  if (validation.data.events) updates.events = JSON.stringify(validation.data.events);
  if (validation.data.isActive !== undefined) updates.isActive = validation.data.isActive;

  const updated = await db.webhookEndpoint.update({
    where: { id },
    data: updates,
  });

  await logAudit({
    userEmail: result.user.email,
    userUid: result.user.uid,
    action: "update",
    entity: "webhook_endpoint",
    entityId: id,
    companySlug: endpoint.companySlug,
    details: validation.data,
  });

  return apiOk({
    ...updated,
    secret: updated.secret ? "***masked***" : null,
  });
});

// ── DELETE: Delete endpoint ──────────────────────────────────────────────────

export const DELETE = withErrorHandler(async (req: NextRequest, ctx: RouteContext) => {
  const result = await resolveAuth(req);
  if (!result.ok || !result.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await ctx.params;
  const endpoint = await db.webhookEndpoint.findUnique({ where: { id } });
  if (!endpoint) return apiError("Endpoint not found", 404);

  const companySlug = result.user.companies?.[0];
  const isFounder = result.user.email === process.env.FOUNDER_EMAIL;
  if (endpoint.companySlug !== companySlug && !isFounder) {
    return apiError("Access denied", 403);
  }
  if (result.user.role !== "admin" && !isFounder) {
    return apiError("Only admin or founder can manage webhooks", 403);
  }

  // Delete associated deliveries first
  await db.webhookDelivery.deleteMany({ where: { endpointId: id } });
  await db.webhookEndpoint.delete({ where: { id } });

  await logAudit({
    userEmail: result.user.email,
    userUid: result.user.uid,
    action: "delete",
    entity: "webhook_endpoint",
    entityId: id,
    companySlug: endpoint.companySlug,
    details: { url: endpoint.url },
  });

  return apiOk({ deleted: true, id });
});

/**
 * /api/webhooks/endpoints
 * GET  — List all webhook endpoints for the authenticated user's company.
 * POST — Register a new webhook endpoint.
 */
import { NextRequest, NextResponse } from "next/server";
import { resolveAuth } from "@/lib/auth";
import { withErrorHandler, parseJsonBody, apiError, apiOk, validateBody } from "@/lib/api";
import { registerWebhook } from "@/lib/webhooks";
import { logAudit } from "@/lib/audit";
import { db } from "@/lib/db";
import { z } from "zod";

// ── GET: List endpoints ──────────────────────────────────────────────────────

export const GET = withErrorHandler(async (req: NextRequest) => {
  const result = await resolveAuth(req);
  if (!result.ok || !result.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = result.user;
  const companySlug = user.companies?.[0];
  if (!companySlug) {
    return apiError("No company associated with this user", 400);
  }

  // Only admin/founder can manage webhooks
  const isFounder = user.email === process.env.FOUNDER_EMAIL;
  if (user.role !== "admin" && !isFounder) {
    return apiError("Only admin or founder can manage webhooks", 403);
  }

  const endpoints = await db.webhookEndpoint.findMany({
    where: { companySlug },
    orderBy: { createdAt: "desc" },
  });

  // Mask the secret — never expose it in the API response
  const masked = endpoints.map((ep) => ({
    ...ep,
    secret: ep.secret ? "***masked***" : null,
  }));

  return apiOk({ endpoints: masked, total: masked.length });
});

// ── POST: Register endpoint ──────────────────────────────────────────────────

const RegisterEndpointSchema = z.object({
  url: z.string().url("Must be a valid URL"),
  events: z.array(z.string().min(1)).min(1, "At least one event type is required"),
});

export const POST = withErrorHandler(async (req: NextRequest) => {
  const result = await resolveAuth(req);
  if (!result.ok || !result.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = result.user;
  const companySlug = user.companies?.[0];
  if (!companySlug) {
    return apiError("No company associated with this user", 400);
  }

  const isFounder = user.email === process.env.FOUNDER_EMAIL;
  if (user.role !== "admin" && !isFounder) {
    return apiError("Only admin or founder can manage webhooks", 403);
  }

  const body = await parseJsonBody(req);
  const validation = validateBody(RegisterEndpointSchema, body);
  if (!validation.ok) return validation.response;

  const endpointId = await registerWebhook({
    companySlug,
    url: validation.data.url,
    events: validation.data.events,
  });

  await logAudit({
    userEmail: user.email,
    userUid: user.uid,
    action: "create",
    entity: "webhook_endpoint",
    entityId: endpointId,
    companySlug,
    details: { url: validation.data.url, events: validation.data.events },
  });

  return apiOk({ id: endpointId, url: validation.data.url, events: validation.data.events }, 201);
});

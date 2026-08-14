/**
 * /api/webhooks/endpoints
 * GET  — List all webhook endpoints for the authenticated user's company.
 * POST — Register a new webhook endpoint.
 */
import { NextRequest, NextResponse } from "next/server";
import { isFounderEmail } from "@/lib/founder";
import { resolveAuth } from "@/lib/auth";
import { withErrorHandler, parseJsonBody, apiError, apiOk, validateBody } from "@/lib/api";
import { registerWebhook } from "@/lib/webhooks";
import { logAudit } from "@/lib/audit";
import { dbTyped as db } from "@/lib/db";
import { z } from "zod";
import { rateLimitResponse, LIMITS } from "@/lib/rateLimit";

// ── GET: List endpoints ──────────────────────────────────────────────────────

export const GET = withErrorHandler(async (req: NextRequest) => {
  const result = await resolveAuth(req);
  if (!result.ok || !result.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = result.user;
  // SEC: Accept companySlug from query param for multi-company users.
  const queryCompanySlug = req.nextUrl.searchParams.get("companySlug");
  const companySlug = queryCompanySlug && user.companies?.includes(queryCompanySlug)
    ? queryCompanySlug
    : user.companies?.[0];
  if (!companySlug) {
    return apiError("No company associated with this user", 400);
  }

  // Only admin/founder can manage webhooks
  const isFounder = isFounderEmail(user.email);
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
  // P5-H2: Rate limit POST /api/webhooks-endpoints — 30/min/IP (API_WRITE).
  const rl = await rateLimitResponse(req, "post:webhooks-endpoints", LIMITS.API_WRITE);
  if (rl) return rl;

  const result = await resolveAuth(req);
  if (!result.ok || !result.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = result.user;
  // SEC: Accept companySlug from body for multi-company users.
  const body = await parseJsonBody(req);
  const parsedBody = (body && typeof body === "object") ? body as Record<string, unknown> : {};
  const bodyCompanySlug = typeof parsedBody.companySlug === "string" ? parsedBody.companySlug : undefined;
  const companySlug = bodyCompanySlug && user.companies?.includes(bodyCompanySlug)
    ? bodyCompanySlug
    : user.companies?.[0];
  if (!companySlug) {
    return apiError("No company associated with this user", 400);
  }

  const isFounder = isFounderEmail(user.email);
  if (user.role !== "admin" && !isFounder) {
    return apiError("Only admin or founder can manage webhooks", 403);
  }
  const validation = validateBody(RegisterEndpointSchema, body);
  if (!validation.ok) return validation.response;

  // E2E FIX: registerWebhook() calls validateBaseUrl() which throws an
  // Error("عنوان الـ webhook غير صالح: ...") on SSRF violations (loopback /
  // private IPs / non-HTTPS schemes). The previous code let that throw
  // bubble up to withErrorHandler, which catches ALL exceptions and returns
  // NextResponse.json({ error: "Internal server error" }, { status: 500 }).
  // That hid a security control behind a 500 — clients saw "Internal server
  // error" instead of the actual Arabic validation message, and the SSRF
  // rejection looked like a server bug. Wrap registerWebhook() in a
  // try/catch so SSRF / validation failures return 400 with the actual
  // message (which already includes "غير صالح" — the substring the E2E
  // test asserts on).
  let endpointId: string;
  try {
    endpointId = await registerWebhook({
      companySlug,
      url: validation.data.url,
      events: validation.data.events,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Webhook registration failed";
    // Heuristic: registerWebhook() prefixes its validation errors with
    // "عنوان الـ webhook غير صالح" — treat those as client-side (400).
    // Anything else is unexpected → 500.
    if (msg.includes("غير صالح") || msg.includes("webhook")) {
      return apiError(msg, 400);
    }
    // Re-throw unexpected errors so withErrorHandler handles them as 500.
    throw err;
  }

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

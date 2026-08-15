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
import { logger } from "@/lib/logger";
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

  // SSRF FIX: registerWebhook() throws when validateBaseUrl() rejects the URL
  // (e.g. file://, http://, localhost, private IPs). Without this try/catch
  // the error propagates to withErrorHandler which returns a generic 500 —
  // but the client expects a 400 with a meaningful Arabic error message so
  // it can surface the validation problem to the user.
  let endpointId: string;
  try {
    endpointId = await registerWebhook({
      companySlug,
      url: validation.data.url,
      events: validation.data.events,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // Match the SSRF error message format (mentions "غير صالح" or "غير آمن"
    // or "HTTPS" — these are the validateBaseUrl error strings).
    const isValidationError =
      msg.includes("غير صالح") ||
      msg.includes("غير آمن") ||
      msg.includes("HTTPS") ||
      msg.includes("داخلية") ||
      msg.includes("محلية") ||
      msg.includes("URL");
    if (isValidationError) {
      return apiError(msg, 400);
    }
    // Unknown error — log and return 500 (preserves previous behavior for
    // genuine server errors like DB connection failures).
    logger.error("[webhooks] failed to register endpoint", { err: msg });
    return apiError("فشل في تسجيل نقطة الـ webhook", 500);
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

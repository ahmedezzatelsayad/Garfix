/**
 * /api/webhooks/deliveries
 * GET — View webhook delivery history with filtering and stats.
 * POST — Retry a failed delivery.
 */
import { NextRequest, NextResponse } from "next/server";
import { isFounderEmail } from "@/lib/founder";
import { resolveAuth } from "@/lib/auth";
import { withErrorHandler, parseJsonBody, apiError, apiOk, getQuery } from "@/lib/api";
import { dbTyped as db } from "@/lib/db";
import { rateLimitResponse, LIMITS } from "@/lib/rateLimit";

// ── GET: Delivery history ────────────────────────────────────────────────────

export const GET = withErrorHandler(async (req: NextRequest) => {
  const result = await resolveAuth(req);
  if (!result.ok || !result.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = result.user;
  const companySlug = user.companies?.[0];
  if (!companySlug) return apiError("No company associated", 400);

  const isFounder = isFounderEmail(user.email);
  if (user.role !== "admin" && !isFounder) {
    return apiError("Only admin or founder can view webhook deliveries", 403);
  }

  const query = getQuery(req);
  const limit = Math.min(parseInt(query.limit || "50", 10), 200);
  const offset = parseInt(query.offset || "0", 10);
  const status = query.status; // pending | success | failed | retried
  const eventType = query.eventType;
  const endpointId = query.endpointId;

  // Build filter
  const where: Record<string, unknown> = {
    endpoint: { companySlug },
  };
  if (status) where.status = status;
  if (eventType) where.eventType = eventType;
  if (endpointId) where.endpointId = endpointId;

  const [deliveries, total, stats] = await Promise.all([
    db.webhookDelivery.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
      include: { endpoint: { select: { url: true, events: true } } },
    }),
    db.webhookDelivery.count({ where }),
    computeDeliveryStats(companySlug),
  ]);

  return apiOk({
    deliveries,
    total,
    limit,
    offset,
    stats,
  });
});

// ── POST: Retry failed delivery ─────────────────────────────────────────────

export const POST = withErrorHandler(async (req: NextRequest) => {
  // P5-H2: Rate limit POST /api/webhooks-deliveries — 30/min/IP (API_WRITE).
  const rl = await rateLimitResponse(req, "post:webhooks-deliveries", LIMITS.API_WRITE);
  if (rl) return rl;

  const result = await resolveAuth(req);
  if (!result.ok || !result.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = result.user;
  const companySlug = user.companies?.[0];
  if (!companySlug) return apiError("No company associated", 400);

  const isFounder = isFounderEmail(user.email);
  if (user.role !== "admin" && !isFounder) {
    return apiError("Only admin or founder can retry deliveries", 403);
  }

  const body = await parseJsonBody(req);
  if (!body || typeof body !== "object") return apiError("Invalid JSON body", 400);

  const { deliveryId } = body as { deliveryId?: string };
  if (!deliveryId) return apiError("deliveryId is required", 400);

  // WebhookDelivery.id is a cuid (String). Previously this was Number(deliveryId)
  // which produced NaN for cuid strings → every retry 404'd.
  // IDOR fix: tenant filter via nested endpoint.companySlug; founder bypasses
  const delivery = isFounder
    ? await db.webhookDelivery.findUnique({ where: { id: deliveryId } })
    : await db.webhookDelivery.findFirst({ where: { id: deliveryId, endpoint: { companySlug } } });
  if (!delivery) return apiError("Delivery not found", 404);

  // Only retry failed or retried deliveries
  if (delivery.status !== "failed" && delivery.status !== "retried") {
    return apiError("Only failed deliveries can be retried", 400);
  }

  // Reset the delivery for retry
  const maxAttempts = delivery.maxAttempts;
  await db.webhookDelivery.update({
    where: { id: deliveryId },
    data: {
      status: "pending",
      attempts: 0,
      nextRetryAt: new Date(),
    },
  });

  return apiOk({
    retried: true,
    deliveryId,
    maxAttempts,
  });
});

// ── Stats helper ────────────────────────────────────────────────────────────

async function computeDeliveryStats(companySlug: string) {
  const deliveries = await db.webhookDelivery.findMany({
    where: { endpoint: { companySlug } },
    select: { status: true, statusCode: true, createdAt: true, updatedAt: true },
  });

  const total = deliveries.length;
  const succeeded = deliveries.filter((d) => d.status === "success").length;
  const failed = deliveries.filter((d) => d.status === "failed").length;
  const pending = deliveries.filter((d) => d.status === "pending").length;
  const retried = deliveries.filter((d) => d.status === "retried").length;

  // Average latency for successful deliveries
  const latencies = deliveries
    .filter((d) => d.status === "success" && d.createdAt)
    .map((d) => new Date(d.updatedAt).getTime() - new Date(d.createdAt).getTime());
  const avgLatencyMs = latencies.length > 0
    ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length)
    : 0;

  return {
    total,
    succeeded,
    failed,
    pending,
    retried,
    successRate: total > 0 ? Math.round((succeeded / total) * 100) : 0,
    avgLatencyMs,
  };
}

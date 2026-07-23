/**
 * /api/webhooks/deliveries
 * GET — View webhook delivery history with filtering and stats.
 * POST — Retry a failed delivery.
 */
import { NextRequest, NextResponse } from "next/server";
import { resolveAuth } from "@/lib/auth";
import { withErrorHandler, parseJsonBody, apiError, apiOk, getQuery } from "@/lib/api";
import { db } from "@/lib/db";

// ── GET: Delivery history ────────────────────────────────────────────────────

export const GET = withErrorHandler(async (req: NextRequest) => {
  const result = await resolveAuth(req);
  if (!result.ok || !result.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = result.user;
  const companySlug = user.companies?.[0];
  if (!companySlug) return apiError("No company associated", 400);

  const isFounder = user.email === process.env.FOUNDER_EMAIL;
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
  const result = await resolveAuth(req);
  if (!result.ok || !result.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = result.user;
  const companySlug = user.companies?.[0];
  if (!companySlug) return apiError("No company associated", 400);

  const isFounder = user.email === process.env.FOUNDER_EMAIL;
  if (user.role !== "admin" && !isFounder) {
    return apiError("Only admin or founder can retry deliveries", 403);
  }

  const body = await parseJsonBody(req);
  if (!body || typeof body !== "object") return apiError("Invalid JSON body", 400);

  const { deliveryId } = body as { deliveryId?: string };
  if (!deliveryId) return apiError("deliveryId is required", 400);

  const delivery = await db.webhookDelivery.findUnique({ where: { id: deliveryId } });
  if (!delivery) return apiError("Delivery not found", 404);

  // Verify it belongs to the user's company
  const endpoint = await db.webhookEndpoint.findUnique({ where: { id: delivery.endpointId } });
  if (!endpoint || endpoint.companySlug !== companySlug) {
    if (!isFounder) return apiError("Access denied", 403);
  }

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
    select: { status: true, statusCode: true, createdAt: true, deliveredAt: true },
  });

  const total = deliveries.length;
  const succeeded = deliveries.filter((d) => d.status === "success").length;
  const failed = deliveries.filter((d) => d.status === "failed").length;
  const pending = deliveries.filter((d) => d.status === "pending").length;
  const retried = deliveries.filter((d) => d.status === "retried").length;

  // Average latency for successful deliveries
  const latencies = deliveries
    .filter((d) => d.status === "success" && d.deliveredAt && d.createdAt)
    .map((d) => new Date(d.deliveredAt!).getTime() - new Date(d.createdAt).getTime());
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

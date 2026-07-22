/**
 * webhooks.ts — Tenant-scoped webhook delivery system.
 *
 * Features:
 *   - Per-tenant webhook endpoints with HMAC-SHA256 signing
 *   - Retry with exponential backoff (3 attempts max)
 *   - Event filtering (tenants subscribe to specific event types)
 *   - Delivery status tracking
 */

import crypto from "node:crypto";
import { db } from "@/lib/db";
import { logger } from "./logger";
import { encryptSecret, decryptSecret } from "./cryptoVault";

export interface WebhookPayload {
  event: string;
  companySlug: string;
  timestamp: string;
  data: Record<string, unknown>;
}

/** Register a webhook endpoint for a tenant. */
export async function registerWebhook(params: {
  companySlug: string;
  url: string;
  events: string[];
}): Promise<string> {
  const secret = crypto.randomBytes(32).toString("hex");
  const encryptedSecret = encryptSecret(secret);

  const endpoint = await db.webhookEndpoint.create({
    data: {
      companySlug: params.companySlug,
      url: params.url,
      events: JSON.stringify(params.events),
      secret: encryptedSecret,
    },
  });

  return endpoint.id;
}

/** Dispatch an event to all matching webhooks for a tenant. */
export async function dispatchWebhook(payload: WebhookPayload): Promise<number> {
  const endpoints = await db.webhookEndpoint.findMany({
    where: {
      companySlug: payload.companySlug,
      isActive: true,
    },
  });

  let dispatched = 0;

  for (const ep of endpoints) {
    try {
      const subscribedEvents: string[] = JSON.parse(ep.events);
      if (!subscribedEvents.includes(payload.event) && !subscribedEvents.includes("*")) {
        continue;
      }

      await db.webhookDelivery.create({
        data: {
          endpointId: ep.id,
          eventType: payload.event,
          payload: JSON.stringify(payload),
          status: "pending",
          nextRetryAt: new Date(),
        },
      });

      dispatched++;
    } catch (err) {
      logger.error("[webhooks] failed to queue delivery", {
        err: err instanceof Error ? err.message : String(err),
        endpointId: ep.id,
      });
    }
  }

  return dispatched;
}

/** Process pending webhook deliveries (call from cron/worker). */
export async function processPendingDeliveries(): Promise<{
  processed: number;
  succeeded: number;
  failed: number;
}> {
  const pending = await db.webhookDelivery.findMany({
    where: {
      status: "pending",
      nextRetryAt: { lte: new Date() },
    },
    take: 50,
  });

  let succeeded = 0;
  let failed = 0;

  for (const delivery of pending) {
    try {
      const endpoint = await db.webhookEndpoint.findUnique({
        where: { id: delivery.endpointId },
      });
      if (!endpoint) {
        await db.webhookDelivery.update({
          where: { id: delivery.id },
          data: { status: "failed" },
        });
        failed++;
        continue;
      }

      const secret = decryptSecret(endpoint.secret);
      const payload = JSON.parse(delivery.payload);
      const signature = crypto
        .createHmac("sha256", secret)
        .update(JSON.stringify(payload))
        .digest("hex");

      const response = await fetch(endpoint.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Garfix-Signature": `sha256=${signature}`,
          "X-Garfix-Event": delivery.eventType,
          "X-Garfix-Delivery": delivery.id,
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(10_000),
      });

      if (response.ok) {
        await db.webhookDelivery.update({
          where: { id: delivery.id },
          data: { status: "success", statusCode: response.status, deliveredAt: new Date() },
        });
        succeeded++;
      } else {
        throw new Error(`HTTP ${response.status}`);
      }
    } catch (err) {
      const newAttempts = delivery.attempts + 1;
      if (newAttempts >= delivery.maxAttempts) {
        await db.webhookDelivery.update({
          where: { id: delivery.id },
          data: { status: "failed", attempts: newAttempts },
        });
        failed++;
      } else {
        // Exponential backoff: 5s, 25s, 125s
        const backoffMs = Math.pow(5, newAttempts) * 1000;
        await db.webhookDelivery.update({
          where: { id: delivery.id },
          data: {
            attempts: newAttempts,
            status: "retried",
            nextRetryAt: new Date(Date.now() + backoffMs),
          },
        });
      }
    }
  }

  return { processed: pending.length, succeeded, failed };
}

/** Verify a webhook signature (for SDK consumers). */
export function verifyWebhookSignature(
  payload: string,
  signature: string,
  secret: string,
): boolean {
  const expected = crypto
    .createHmac("sha256", secret)
    .update(payload)
    .digest("hex");
  return signature === `sha256=${expected}`;
}

/** Get webhook stats for a tenant. */
export async function getWebhookStats(companySlug: string) {
  const [endpoints, recentDeliveries] = await Promise.all([
    db.webhookEndpoint.count({ where: { companySlug, isActive: true } }),
    db.webhookDelivery.findMany({
      where: { endpoint: { companySlug } },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
  ]);

  return { activeEndpoints: endpoints, recentDeliveries };
}
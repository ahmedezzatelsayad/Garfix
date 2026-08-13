/**
 * eventsWorker.ts — Worker for the EVENTS queue (transactional outbox consumer).
 *
 * Phase 7 P1 fix: the EVENTS queue (QUEUE_NAMES.EVENTS) had no registered
 * worker in bootstrap.ts. The outbox relay (outbox.ts:229) enqueues events
 * to this queue, but no handler existed — jobs accumulated indefinitely.
 *
 * This worker dispatches events to webhook subscribers (registered via
 * /api/webhooks/endpoints). Each event is delivered to all endpoints that
 * are subscribed to the event type.
 */

import { registerWorker, QUEUE_NAMES } from "@/lib/queues";
import { dbTyped as db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { dispatchWebhook } from "@/lib/webhooks";

interface EventJobData {
  type: "outbox-event";
  data: {
    companySlug: string;
    eventType: string;
    entityId?: string;
    payload: Record<string, unknown>;
  };
}

let registered = false;

export function registerEventsWorker(): void {
  if (registered) return;

  registerWorker(QUEUE_NAMES.EVENTS, async (data: Record<string, unknown>) => {
    const job = data as  EventJobData["data"];
    logger.debug("[events-worker] processing event", {
      companySlug: job.companySlug,
      eventType: job.eventType,
    });

    // Find all webhook endpoints for this company
    const endpoints = await db.webhookEndpoint.findMany({
      where: {
        companySlug: job.companySlug,
        isActive: true,
      },
    }).catch(() => []);

    // Filter in JS: events is a JSON string array, check if eventType is included
    const subscribed = endpoints.filter((ep) => {
      try {
        const events: string[] = JSON.parse(ep.events || "[]");
        return events.includes(job.eventType) || events.includes("*");
      } catch {
        return false;
      }
    });

    if (subscribed.length === 0) {
      logger.debug("[events-worker] no subscribers for event", {
        companySlug: job.companySlug,
        eventType: job.eventType,
      });
      return;
    }

    // Dispatch via the existing dispatchWebhook (handles signing + delivery)
    try {
      await dispatchWebhook({
        companySlug: job.companySlug,
        event: job.eventType,
        timestamp: new Date().toISOString(),
        data: {
          entityId: job.entityId,
          ...job.payload,
        },
      });
    } catch (err) {
      logger.warn("[events-worker] dispatch failed", {
        err: err instanceof Error ? err.message : String(err),
      });
    }

    logger.debug("[events-worker] event dispatched", {
      companySlug: job.companySlug,
      eventType: job.eventType,
      endpointCount: subscribed.length,
    });
  });

  registered = true;
  logger.info("[events-worker] registered for queue", { queue: QUEUE_NAMES.EVENTS });
}

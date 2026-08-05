/**
 * event-bus.ts — Typed Event Bus for inter-module communication.
 *
 * Pattern: publish-subscribe with typed event payloads.
 * Use cases:
 *   - Invoice created → trigger AI extraction, notify client, update dashboard
 *   - Fiscal period closed → freeze journals, notify accountant
 *   - Payment received → mark invoice, update AR aging, send receipt
 *
 * Events are async by default — handlers run in parallel, errors are caught individually.
 */

import { logger } from "./logger";

export type EventHandler<T> = (payload: T) => Promise<void> | void;

export interface EventSubscription {
  eventType: string;
  handler: EventHandler<unknown>;
  priority: number; // Lower = earlier execution
}

// Domain event types with their payload shapes
export interface DomainEvents {
  "invoice.created": { invoiceId: number; companySlug: string; clientId: number; total: number };
  "invoice.paid": { invoiceId: number; companySlug: string; amountPaid: number };
  "invoice.status-changed": { invoiceId: number; companySlug: string; oldStatus: string; newStatus: string };
  "fiscal-period.closed": { periodId: number; companySlug: string; periodName: string };
  "fiscal-period.reopened": { periodId: number; companySlug: string };
  "journal-entry.created": { entryId: number; companySlug: string; description: string };
  "journal-entry.reversed": { entryId: number; companySlug: string; reversalId: number };
  "payment.received": { invoiceId: number; companySlug: string; amount: number; method: string };
  "client.created": { clientId: number; companySlug: string; clientName: string };
  "employee.created": { employeeId: number; companySlug: string; employeeName: string };
  "employee.salary-updated": { employeeId: number; companySlug: string; newSalary: number };
  "warehouse.created": { warehouseId: number; companySlug: string; warehouseName: string };
  "stock.movement": { productId: number; companySlug: string; quantity: number; type: "in" | "out" | "transfer" };
  "ai.request.completed": { requestId: string; companySlug: string; model: string; tokensUsed: number; latencyMs: number };
  "ai.request.failed": { requestId: string; companySlug: string; model: string; error: string };
  "circuit-breaker.state-changed": { breakerName: string; oldState: string; newState: string };
  "backup.completed": { companySlug: string; backupName: string; sizeBytes: number };
  "backup.failed": { companySlug: string; error: string };
  "webhook.delivery-succeeded": { endpointId: number; eventId: number; statusCode: number };
  "webhook.delivery-failed": { endpointId: number; eventId: number; statusCode: number; error: string };
  "automation.triggered": { ruleId: number; companySlug: string; triggerType: string };
  "user.registered": { userUid: string; email: string };
  "company.created": { companySlug: string; companyName: string; plan: string };
  "subscription.upgraded": { companySlug: string; oldPlan: string; newPlan: string };
}

type EventName = keyof DomainEvents;

export class EventBus {
  private subscriptions: Map<string, EventSubscription[]> = new Map();
  private deadLetterQueue: Array<{ eventType: string; payload: unknown; error: Error; timestamp: number }> = [];

  subscribe<T extends EventName>(eventType: T, handler: EventHandler<DomainEvents[T]>, priority = 10): void {
    if (!this.subscriptions.has(eventType)) {
      this.subscriptions.set(eventType, []);
    }
    const subs = this.subscriptions.get(eventType)!;
    subs.push({ eventType, handler: handler as EventHandler<unknown>, priority });
    subs.sort((a, b) => a.priority - b.priority);
  }

  unsubscribe<T extends EventName>(eventType: T, handler: EventHandler<DomainEvents[T]>): void {
    const subs = this.subscriptions.get(eventType);
    if (subs) {
      const idx = subs.findIndex(s => s.handler === handler);
      if (idx !== -1) subs.splice(idx, 1);
    }
  }

  async publish<T extends EventName>(eventType: T, payload: DomainEvents[T]): Promise<void> {
    const subs = this.subscriptions.get(eventType) || [];
    if (subs.length === 0) return;

    const results = await Promise.allSettled(
      subs.map(async (sub) => {
        try {
          await sub.handler(payload);
        } catch (error) {
          logger.error("[event-bus] Handler failed", {
            eventType,
            priority: sub.priority,
            err: error instanceof Error ? error.message : String(error),
          });
          this.deadLetterQueue.push({
            eventType,
            payload,
            error: error instanceof Error ? error : new Error(String(error)),
            timestamp: Date.now(),
          });
        }
      })
    );

    const failures = results.filter(r => r.status === "rejected").length;
    if (failures > 0) {
      logger.warn("[event-bus] Some handlers failed", { eventType, failures, total: subs.length });
    }
  }

  getDeadLetters(): Array<{ eventType: string; payload: unknown; error: Error; timestamp: number }> {
    return [...this.deadLetterQueue];
  }

  clearDeadLetters(): void {
    this.deadLetterQueue = [];
  }

  getSubscriptions(eventType?: string): EventSubscription[] {
    if (eventType) return this.subscriptions.get(eventType) || [];
    return Array.from(this.subscriptions.values()).flat();
  }
}

// Singleton event bus
export const eventBus = new EventBus();

// ─────────────────────────────────────────────────────────────────────────────
// P3.5 (Cycle 5): inlined minimal span/log helpers previously provided by the
// deleted `src/lib/telemetry.ts` (legacy console-based provider). The full
// OpenTelemetry SDK lives in `src/lib/telemetry-sdk.ts` and is wired through
// `instrumentation.ts` at boot; these helpers exist only so `emitEvent` can
// record a structured log line per event for dev debugging.
// ─────────────────────────────────────────────────────────────────────────────
interface Span {
  name: string;
  startTime: number;
  endTime?: number;
  attributes: Record<string, string | number | boolean>;
  status: "ok" | "error";
}

function startSpan(
  name: string,
  attributes?: Record<string, string | number | boolean>,
): Span {
  return {
    name,
    startTime: Date.now(),
    attributes: attributes || {},
    status: "ok",
  };
}

function endSpan(span: Span, status?: "ok" | "error"): void {
  span.endTime = Date.now();
  span.status = status || span.status;
  const duration = span.endTime - span.startTime;
  logger.debug("[event-bus] span", {
    name: span.name,
    status: span.status,
    durationMs: duration,
    attrs: span.attributes,
  });
}

function logEvent(
  level: "debug" | "info" | "warn" | "error",
  message: string,
  attributes?: Record<string, unknown>,
): void {
  logger[level](`[event-bus] ${message}`, attributes || {});
}

// Helper to emit events with telemetry
export async function emitEvent<T extends EventName>(eventType: T, payload: DomainEvents[T]): Promise<void> {
  const span = startSpan(`event:${eventType}`, { eventType, companySlug: (payload as Record<string, unknown>).companySlug as string || "system" });
  try {
    await eventBus.publish(eventType, payload);
    endSpan(span, "ok");
    logEvent("info", `Event emitted: ${eventType}`, { eventType });
  } catch (error) {
    endSpan(span, "error");
    logEvent("error", `Event emission failed: ${eventType}`, { eventType, error: String(error) });
  }
}

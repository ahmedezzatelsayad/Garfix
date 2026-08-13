/**
 * deferred-enqueue.ts — AI-10 FIX (Audit v2 · Phase 3)
 *
 * Problem: BullMQ worker queue had ZERO enqueuers from production code.
 * `registerAIWorkers()` (in src/lib/workers/aiWorkers.ts) registers the
 * consumer side at boot, and `enqueueChatJob` / `enqueueInvoiceExtractJob`
 * are exported as helpers — but no live HTTP route ever called them. The
 * queue had consumers but no producers.
 *
 * Fix: provide a thin, reusable enqueuer that any AI route can call when
 * it wants to defer work instead of blocking on the AI provider. This file
 * is intentionally framework-agnostic (no NextRequest import) so it can be
 * called from route handlers, cron jobs, webhooks, and the standalone
 * `scripts/enqueue-deferred-ai.ts` demonstrator.
 *
 * The enqueuer does NOT replace the synchronous chat path — it is an
 * OPTIONAL path that routes can take when they hit a rate-limit reject or
 * when they want to defer an expensive AI call to the background. The
 * HTTP route can then return 202 Accepted with a jobId, and the client
 * polls /api/ai/metrics or the future /api/ai/jobs/[id] endpoint.
 */

import { QUEUE_NAMES, enqueue, type JobPayload } from "@/lib/queues";
import { logger } from "@/lib/logger";
import { createHash } from "node:crypto";

// AI-10 FIX (Audit v2 · Phase 3): BullMQ enqueuer for the AI queue.
//
// The AI queue (`QUEUE_NAMES.AI = "ai-jobs"`) is the queue that
// `registerAIWorkers()` consumes. Before this fix, no production code
// produced jobs for it. This helper is the canonical producer.

/** Discriminated payload types supported by the AI worker (see aiWorkers.ts). */
export type DeferredAiJobType =
  | "ai-chat"
  | "ai-invoice-extract"
  | "ai-smart-parse"
  | "ai-agent-accounting"
  | "ai-agent-sales"
  | "ai-agent-inventory";

export interface DeferredAiJobPayload {
  type: DeferredAiJobType;
  companySlug: string;
  userId: string;
  data: Record<string, unknown>;
  priority?: number; // 1 (high) .. 10 (low)
  createdAt: number;
}

export interface DeferredEnqueueResult {
  enqueued: boolean;
  jobId?: string;
  error?: string;
}

/**
 * Enqueue a deferred AI job. Returns immediately — the job is processed
 * asynchronously by the AI worker (BullMQ in production, pg-boss as
 * fallback, in-process as last resort).
 *
 * Usage:
 *   const res = await enqueueDeferredAiJob({
 *     type: "ai-chat",
 *     companySlug: "acme",
 *     userId: user.uid,
 *     data: { messages, conversationId },
 *     priority: 2,
 *   });
 *   if (res.enqueued) return NextResponse.json({ jobId: res.jobId }, { status: 202 });
 *
 * The function is idempotent: `enqueue()` (from src/lib/queues.ts) computes
 * a deterministic jobId from the payload via SHA-256 hash, so retrying the
 * same payload does not duplicate the job in BullMQ.
 */
export async function enqueueDeferredAiJob(
  payload: DeferredAiJobPayload,
): Promise<DeferredEnqueueResult> {
  try {
    const jobPayload: JobPayload = {
      type: payload.type,
      data: payload.data,
      // Spread the routing fields so the worker can pick them up.
      // The AI worker reads `type`, `companySlug`, `userId`, `data`, `priority`,
      // `createdAt` off the job's data — so we mirror them at the top level
      // by serialising the structured payload into `data` AND exposing the
      // routing fields via the JobPayload envelope.
      payload: {
        type: payload.type,
        companySlug: payload.companySlug,
        userId: payload.userId,
        data: payload.data,
        priority: payload.priority,
        createdAt: payload.createdAt,
      },
    };

    await enqueue(QUEUE_NAMES.AI, jobPayload);

    logger.info("[deferred-enqueue] AI job enqueued", {
      type: payload.type,
      companySlug: payload.companySlug,
      userId: payload.userId,
      priority: payload.priority,
    });

    return { enqueued: true, jobId: computeDeferredJobId(payload) };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error("[deferred-enqueue] failed to enqueue AI job", {
      type: payload.type,
      err: msg,
    });
    return { enqueued: false, error: msg };
  }
}

/**
 * Deterministic jobId from the payload — mirrors the SHA-256 scheme used
 * by `computeJobId` in src/lib/queues.ts so retries don't duplicate.
 */
function computeDeferredJobId(payload: DeferredAiJobPayload): string {
  const stable = JSON.stringify({
    queue: QUEUE_NAMES.AI,
    type: payload.type,
    companySlug: payload.companySlug,
    userId: payload.userId,
    data: payload.data,
  });
  return createHash("sha256").update(stable).digest("hex").slice(0, 32);
}

/**
 * Convenience: enqueue a deferred chat job from the rate-limit reject path.
 *
 * When /api/ai/chat hits the per-user or per-company rate limit, instead
 * of returning 429 immediately the route can call this helper to enqueue
 * the chat for background processing, then return 202 Accepted with the
 * jobId. The client polls for the result.
 *
 * This is the "wire the queue into the rate-limit reject path" pattern
 * requested by AI-10. The chat route itself still returns 429 by default
 * to preserve backward compatibility — opting into deferred enqueue is a
 * one-line change at the call site (see scripts/enqueue-deferred-ai.ts
 * for a runnable example).
 */
export async function enqueueDeferredChatFromRateLimit(params: {
  companySlug: string;
  userId: string;
  messages: Array<{ role: string; content: string }>;
  conversationId?: string;
}): Promise<DeferredEnqueueResult> {
  return enqueueDeferredAiJob({
    type: "ai-chat",
    companySlug: params.companySlug,
    userId: params.userId,
    data: {
      messages: params.messages,
      conversationId: params.conversationId,
    },
    createdAt: Date.now(),
    priority: 2, // chat is high priority
  });
}

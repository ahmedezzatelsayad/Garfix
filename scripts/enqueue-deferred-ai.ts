/**
 * enqueue-deferred-ai.ts — AI-10 FIX (Audit v2 · Phase 3)
 *
 * Standalone demonstrator for the BullMQ AI-job enqueuer pattern.
 *
 * Problem: BullMQ queue `ai-jobs` had consumers (registerAIWorkers() is
 * called from src/runtime/bootstrap.ts) but ZERO producers. The queue
 * existed but no code ever enqueued a job into it.
 *
 * This script demonstrates the canonical pattern using the helper at
 * src/lib/ai/deferred-enqueue.ts. It enqueues a sample deferred chat job
 * and reports the jobId. Run it after `bun run dev` has started so the
 * BullMQ worker is registered.
 *
 * Usage:
 *   DATABASE_URL=postgres://... \
 *   VALKEY_URL=redis://localhost:6379 \
 *   bunx tsx scripts/enqueue-deferred-ai.ts
 *
 * Output:
 *   [enqueue-deferred-ai] enqueued job <jobId> for type=ai-chat
 *   [enqueue-deferred-ai] worker will pick it up if registerAIWorkers() ran.
 */

import { enqueueDeferredAiJob, enqueueDeferredChatFromRateLimit } from "@/lib/ai/deferred-enqueue";

async function main(): Promise<void> {
  const companySlug = process.env.DEMO_COMPANY_SLUG ?? "sa-demo";
  const userId = process.env.DEMO_USER_UID ?? "demo-founder-uid";

  console.log("[enqueue-deferred-ai] enqueuing sample AI jobs…", { companySlug, userId });

  // ── Example 1: generic deferred AI job (chat) ────────────────────────
  const r1 = await enqueueDeferredAiJob({
    type: "ai-chat",
    companySlug,
    userId,
    data: {
      messages: [
        { role: "user", content: "مرحبا جارفيكس، لخص لي آخر 5 فواتير" },
      ],
      conversationId: `demo-${Date.now()}`,
    },
    createdAt: Date.now(),
    priority: 2,
  });
  report(r1, "ai-chat");

  // ── Example 2: the rate-limit-reject path helper ─────────────────────
  // This is what /api/ai/chat would call instead of returning 429:
  const r2 = await enqueueDeferredChatFromRateLimit({
    companySlug,
    userId,
    messages: [{ role: "user", content: "اقترح سعراً تنافسياً للمنتج التالي" }],
    conversationId: `demo-rl-${Date.now()}`,
  });
  report(r2, "ai-chat (rate-limit reject path)");

  // ── Example 3: invoice-extract deferred job ──────────────────────────
  const r3 = await enqueueDeferredAiJob({
    type: "ai-invoice-extract",
    companySlug,
    userId,
    data: {
      rawText: "فاتورة رقم 1001\nالتاريخ: 2026-08-13\nالمبلغ: 1500 ريال",
      source: "demo-script",
    },
    createdAt: Date.now(),
    priority: 4,
  });
  report(r3, "ai-invoice-extract");

  console.log("[enqueue-deferred-ai] done. Check /api/ai/metrics for queue depth.");
}

function report(r: { enqueued: boolean; jobId?: string; error?: string }, type: string): void {
  if (r.enqueued) {
    console.log(`[enqueue-deferred-ai] ✓ enqueued job ${r.jobId} for type=${type}`);
  } else {
    console.error(`[enqueue-deferred-ai] ✗ failed for type=${type}: ${r.error}`);
  }
}

main().catch((err) => {
  console.error("[enqueue-deferred-ai] fatal:", err);
  process.exit(1);
});

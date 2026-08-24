/**
 * ═══════════════════════════════════════════════════════════════════════════
 * C5 FIX (Review / 2026-08-24): Vercel Cron entrypoint for background work.
 *
 * PROBLEM: `instrumentation.ts` short-circuits ALL background startup when
 * VERCEL=1, and vercel.json was `{}` — so on the production Vercel
 * deployment NO background processing ever ran: the outbox relay, session
 * sweep, outbox purge, and queue recovery all silently did nothing, and
 * queued jobs piled up in pg-boss with no consumer.
 *
 * FIX: Vercel Cron invokes this route every 5 minutes (see vercel.json).
 * One tick runs the full lightweight maintenance suite. Each task is
 * independently guarded + timed, and the endpoint:
 *   - is protected by the CRON_SECRET env var (Vercel sends it as a Bearer
 *     token in the Authorization header on every cron invocation),
 *   - ALSO accepts METRICS_TOKEN as a fallback so existing tooling works,
 *   - returns a compact JSON summary for observability,
 *   - never throws (a failing task is reported, doesn't kill the others).
 *
 * Heavier queue workers (BullMQ email/WhatsApp/AI jobs) still need a
 * dedicated long-running worker process — see DEPLOYMENT.md.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { timingSafeEqualStr } from "@/lib/timing-safe";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorized(req: NextRequest): boolean {
  const expected =
    process.env.CRON_SECRET ||
    process.env.METRICS_TOKEN ||
    "";
  if (!expected) {
    // Fail-closed: without a configured secret, refuse to run anything.
    logger.warn("[cron] no CRON_SECRET/METRICS_TOKEN configured — refusing");
    return false;
  }
  const header = req.headers.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : req.headers.get("x-cron-secret") || "";
  return token.length > 0 && timingSafeEqualStr(token, expected);
}

async function timed<T>(name: string, fn: () => Promise<T>): Promise<{ task: string; ms: number; result: T | string }> {
  const start = Date.now();
  try {
    const result = await fn();
    return { task: name, ms: Date.now() - start, result };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error(`[cron] task ${name} failed`, { err: message });
    return { task: name, ms: Date.now() - start, result: `error: ${message}` };
  }
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const results: Array<{ task: string; ms: number; result: unknown }> = [];

  // 1. Outbox relay — drain due domain events (emails, webhooks, AI jobs).
  try {
    const { processOutboxBatch } = await import("@/lib/outbox");
    results.push(await timed("outbox-relay", () => processOutboxBatch()));
  } catch (e) {
    results.push({ task: "outbox-relay", ms: 0, result: `import failed: ${e instanceof Error ? e.message : String(e)}` });
  }

  // 2. Session registry sweep — expire stale refresh-token sessions.
  try {
    const { runSessionSweep } = await import("@/lib/maintenance-cron");
    results.push(await timed("session-sweep", () => runSessionSweep()));
  } catch (e) {
    results.push({ task: "session-sweep", ms: 0, result: `import failed: ${e instanceof Error ? e.message : String(e)}` });
  }

  // 3. Outbox purge — remove published events older than the retention window.
  try {
    const { runOutboxPurge } = await import("@/lib/maintenance-cron");
    results.push(await timed("outbox-purge", () => runOutboxPurge()));
  } catch (e) {
    results.push({ task: "outbox-purge", ms: 0, result: `import failed: ${e instanceof Error ? e.message : String(e)}` });
  }

  // 4. pg-boss recovery — resurrect jobs stuck in an inconsistent state.
  try {
    const { recoverPendingJobs } = await import("@/lib/queue-pgboss");
    results.push(await timed("queue-recovery", () => recoverPendingJobs()));
  } catch (e) {
    results.push({ task: "queue-recovery", ms: 0, result: `import failed: ${e instanceof Error ? e.message : String(e)}` });
  }

  const summary = {
    ok: true,
    ranAt: new Date().toISOString(),
    tasks: results.map((r) => ({ task: r.task, ms: r.ms, outcome: typeof r.result === "number" || typeof r.result === "string" ? r.result : JSON.stringify(r.result) })),
  };
  logger.info("[cron] maintenance tick completed", { tasks: summary.tasks.length });
  return NextResponse.json(summary);
}

/**
 * GET /api/platform-admin/queue-failures
 *
 * Founder-only endpoint that surfaces the in-memory dead-letter log from
 * queues.ts. Lets the founder see jobs that permanently failed across all
 * queues (after retries) so silent operational failures don't stay invisible.
 *
 * P0 FIX (audit finding queues.ts:49-59): the previous queue implementation
 * was fire-and-forget — failed jobs were only logged, not tracked. With this
 * endpoint, the founder panel can render a "recent failed jobs" card so the
 * ops team has visibility into what's breaking.
 *
 * Query params:
 *   ?queue=<QueueName>  — filter to a single queue (optional)
 *   ?clear=1            — clear the log after returning (acknowledge)
 *
 * RUNTIME: Node.js only — imports queues.ts (BullMQ)
 */
export const runtime = 'nodejs';

import { NextResponse, type NextRequest } from "next/server";
import { requireFounder } from "@/lib/middleware";
import { getDeadLetters, clearDeadLetters, type QueueName } from "@/lib/queues";

export async function GET(req: NextRequest) {
  const auth = await requireFounder(req);
  if (auth instanceof NextResponse) return auth;

  const url = new URL(req.url);
  const queueParam = url.searchParams.get("queue") as QueueName | null;
  const shouldClear = url.searchParams.get("clear") === "1";

  const failures = getDeadLetters(queueParam ?? undefined);

  if (shouldClear) {
    clearDeadLetters(queueParam ?? undefined);
  }

  return NextResponse.json({
    queue: queueParam ?? "all",
    count: failures.length,
    failures,
  });
}

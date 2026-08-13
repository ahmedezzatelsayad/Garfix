/**
 * retry.ts — Shared retry/backoff + ack-polling for e-invoicing (P1.3)
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * PROBLEM
 * ═══════════════════════════════════════════════════════════════════════════
 * All 6 MENA country modules (ZATCA, UAE-FTA, Egypt-ETA, Kuwait, Oman,
 * Bahrain) submit invoices via a single fire-and-forget HTTP call. This
 * has two problems:
 *
 *   1. Transient failures (network blips, 5xx, rate-limit 429) are not
 *      retried — the invoice is marked "failed" and a human has to
 *      manually resubmit. Under real production load this is unworkable:
 *      ZATCA's sandbox returns 503 ~1% of the time, and the production
 *      portal has been known to rate-limit at 100 req/min.
 *
 *   2. There is no ack-polling. MENA authorities don't always return a
 *      final status synchronously — ZATCA returns a "PENDING" status
 *      with a UUID, then expects the integrator to poll
 *      /compliance/v1/invoices/{uuid} until the status becomes
 *      "PASS"/"FAIL". The current code treats the PENDING response as
 *      final, so a compliance failure is silently dropped.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * SOLUTION
 * ═══════════════════════════════════════════════════════════════════════════
 * Two utilities:
 *
 *   withRetry(fn, opts)        — exponential backoff with jitter for any
 *                                async operation. Retries on network
 *                                errors and 5xx/429 responses.
 *
 *   pollSubmissionAck(opts)    — long-polls a status-check function until
 *                                it returns a terminal state (PASS/FAIL),
 *                                or until maxAttempts is exhausted.
 *
 * Both are wired into all 6 country modules via the `submitWithRetry`
 * helper, which orchestrates: submit (with retry) → poll ack → return
 * final status.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * DESIGN NOTES
 * ═══════════════════════════════════════════════════════════════════════════
 *   - Backoff: exponential with base 500ms, factor 2, cap 30s, full jitter.
 *   - Retry budget: 5 attempts by default (so worst-case latency for a
 *     permanently-failing call is ~7s, not 30+).
 *   - Retryable: network errors, 5xx, 429 (with Retry-After honor).
 *     NOT retryable: 4xx (except 429), 2xx with business error in body.
 *   - Ack-poll interval: 2s by default, configurable per country.
 *   - Ack-poll budget: 30 attempts by default (~60s).
 *   - All state is logged via the structured logger for forensics.
 */

import { logger } from "../logger";

// ─── Types ────────────────────────────────────────────────────────────────

export interface RetryOptions {
  /** Max attempts including the first (default 5). */
  maxAttempts?: number;
  /** Base backoff in ms (default 500). */
  baseDelayMs?: number;
  /** Backoff multiplier (default 2). */
  backoffFactor?: number;
  /** Max backoff cap in ms (default 30_000). */
  maxDelayMs?: number;
  /** HTTP status codes that should trigger a retry (default 429, 500-504). */
  retryableStatuses?: number[];
  /** Should this error be retried? Default = network errors + retryable statuses. */
  shouldRetry?: (err: unknown, attempt: number) => boolean;
  /** Called between attempts with the next delay. Useful for metrics. */
  onRetry?: (info: { attempt: number; nextDelayMs: number; error: unknown }) => void;
  /** Operation name for logging. */
  operationName?: string;
}

export interface AckPollOptions<T> {
  /** Function that returns the current status. Should throw on transport errors. */
  checkStatus: () => Promise<{ state: T; raw?: unknown }>;
  /** States that indicate the operation completed successfully. */
  successStates: T[];
  /** States that indicate the operation permanently failed. */
  failureStates: T[];
  /** States that mean "keep polling" (everything else is also treated as pending). */
  pendingStates?: T[];
  /** Max poll attempts (default 30). */
  maxAttempts?: number;
  /** Delay between polls in ms (default 2000). */
  pollIntervalMs?: number;
  /** Operation name for logging. */
  operationName?: string;
}

export interface SubmitWithRetryResult<T> {
  /** Final submission state — one of successStates / failureStates. */
  finalState: T;
  /** True if finalState is in successStates. */
  ok: boolean;
  /** Raw response from the final submit or ack poll. */
  raw?: unknown;
  /** Number of submit attempts made (1 = succeeded first try). */
  submitAttempts: number;
  /** Number of ack-poll attempts made (0 = sync final state). */
  ackPollAttempts: number;
  /** Total elapsed time in ms. */
  totalDurationMs: number;
}

// ─── withRetry ─────────────────────────────────────────────────────────────

const DEFAULT_RETRYABLE_STATUSES = [429, 500, 502, 503, 504];

/** Default shouldRetry: retry on network errors and retryable statuses. */
function defaultShouldRetry(
  err: unknown,
  retryableStatuses: number[],
): boolean {
  if (!err) return false;
  // HTTP response with status code
  const status = (err as { status?: number; statusCode?: number }).status
    || (err as { status?: number; statusCode?: number }).statusCode;
  if (typeof status === "number") {
    return retryableStatuses.includes(status);
  }
  // Network errors — fetch rejects with TypeError on network failures
  if (err instanceof TypeError) return true;
  // Errors with a `code` property matching common network error codes
  const code = (err as { code?: string }).code;
  if (code && ["ECONNRESET", "ECONNREFUSED", "ETIMEDOUT", "EAI_AGAIN", "ENOTFOUND"].includes(code)) {
    return true;
  }
  return false;
}

/**
 * Run an async function with exponential backoff + full jitter.
 *
 *   const result = await withRetry(() => fetch(url, opts), {
 *     maxAttempts: 5,
 *     operationName: "zatca-submit",
 *   });
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: RetryOptions = {},
): Promise<T> {
  const maxAttempts = opts.maxAttempts ?? 5;
  const baseDelayMs = opts.baseDelayMs ?? 500;
  const backoffFactor = opts.backoffFactor ?? 2;
  const maxDelayMs = opts.maxDelayMs ?? 30_000;
  const retryableStatuses = opts.retryableStatuses ?? DEFAULT_RETRYABLE_STATUSES;
  const shouldRetry = opts.shouldRetry
    ?? ((err: unknown) => defaultShouldRetry(err, retryableStatuses));
  const opName = opts.operationName ?? "unknown";

  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const result = await fn();
      if (attempt > 1) {
        logger.info(`[retry] ${opName} succeeded after retry`, { attempt });
      }
      return result;
    } catch (err) {
      lastError = err;
      if (attempt >= maxAttempts || !shouldRetry(err, attempt)) {
        if (attempt >= maxAttempts) {
          logger.error(`[retry] ${opName} exhausted retries`, {
            attempt,
            error: err instanceof Error ? err.message : String(err),
          });
        }
        throw err;
      }
      // Exponential backoff with full jitter
      const expDelay = Math.min(
        maxDelayMs,
        baseDelayMs * Math.pow(backoffFactor, attempt - 1),
      );
      const jitteredDelay = Math.floor(Math.random() * expDelay);
      // Honor Retry-After header for 429/503 responses
      let delay = jitteredDelay;
      const retryAfter = (err as { headers?: { get?: (k: string) => string | null } }).headers?.get?.("retry-after");
      if (retryAfter) {
        const raSec = parseInt(retryAfter, 10);
        if (!isNaN(raSec)) {
          delay = Math.max(delay, raSec * 1000);
        }
      }
      opts.onRetry?.({ attempt, nextDelayMs: delay, error: err });
      logger.warn(`[retry] ${opName} failed, retrying`, {
        attempt,
        nextDelayMs: delay,
        error: err instanceof Error ? err.message : String(err),
      });
      await sleep(delay);
    }
  }
  throw lastError;
}

// ─── pollSubmissionAck ─────────────────────────────────────────────────────

/**
 * Poll a status-check function until it returns a terminal state.
 *
 *   const result = await pollSubmissionAck({
 *     checkStatus: async () => {
 *       const r = await fetch(`https://.../invoices/${uuid}`);
 *       const j = await r.json();
 *       return { state: j.status, raw: j };
 *     },
 *     successStates: ["PASS", "CLEARED", "REPORTED"],
 *     failureStates: ["FAIL", "REJECTED"],
 *     operationName: "zatca-ack",
 *   });
 */
export async function pollSubmissionAck<T extends string>(
  opts: AckPollOptions<T>,
): Promise<{ state: T; raw?: unknown; attempts: number }> {
  const maxAttempts = opts.maxAttempts ?? 30;
  const pollIntervalMs = opts.pollIntervalMs ?? 2000;
  const opName = opts.operationName ?? "unknown";

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const { state, raw } = await opts.checkStatus();
      if (opts.successStates.includes(state)) {
        if (attempt > 1) {
          logger.info(`[ack-poll] ${opName} reached success state`, { attempt, state });
        }
        return { state, raw, attempts: attempt };
      }
      if (opts.failureStates.includes(state)) {
        logger.warn(`[ack-poll] ${opName} reached failure state`, { attempt, state });
        return { state, raw, attempts: attempt };
      }
      // Pending — keep polling
    } catch (err) {
      logger.warn(`[ack-poll] ${opName} poll attempt errored`, {
        attempt,
        error: err instanceof Error ? err.message : String(err),
      });
      // Don't rethrow — a single failed poll is OK, we'll retry the next iteration.
    }
    if (attempt < maxAttempts) {
      await sleep(pollIntervalMs);
    }
  }
  logger.error(`[ack-poll] ${opName} exhausted poll budget`, { maxAttempts });
  return {
    state: "TIMEOUT" as T,
    attempts: maxAttempts,
  };
}

// ─── submitWithRetry (orchestrator) ────────────────────────────────────────

/**
 * Submit + ack-poll orchestrator. This is the high-level helper that
 * country modules should call. It runs:
 *
 *   1. submit() with retry
 *   2. If submit returns a sync final state, return it
 *   3. If submit returns a pending state, poll ack until terminal
 *
 *   const result = await submitWithRetry({
 *     submit: () => postToZatca(xml),
 *     parseSubmitResponse: (r) => ({
 *       state: r.cleared ? "CLEARED" : r.rejected ? "REJECTED" : "PENDING",
 *       ackToken: r.uuid,
 *     }),
 *     checkAckStatus: async (ackToken) => {
 *       const r = await fetch(`.../${ackToken}`);
 *       const j = await r.json();
 *       return { state: j.status, raw: j };
 *     },
 *     successStates: ["CLEARED", "REPORTED", "PASS"],
 *     failureStates: ["REJECTED", "FAIL"],
 *     pendingStates: ["PENDING", "WAITING"],
 *     operationName: "zatca-submit",
 *   });
 */
export async function submitWithRetry<TSubmitState extends string, TAckState extends string>(
  opts: {
    submit: () => Promise<unknown>;
    parseSubmitResponse: (raw: unknown) => { state: TSubmitState; ackToken?: string; raw?: unknown };
    checkAckStatus?: (ackToken: string) => Promise<{ state: TAckState; raw?: unknown }>;
    successStates: TAckState[];
    failureStates: TAckState[];
    pendingStates?: TAckState[];
    submitRetryOpts?: RetryOptions;
    ackPollOpts?: Omit<AckPollOptions<TAckState>, "checkStatus" | "successStates" | "failureStates" | "pendingStates">;
    operationName: string;
  },
): Promise<SubmitWithRetryResult<TAckState>> {
  const start = Date.now();
  let submitAttempts = 0;
  let ackPollAttempts = 0;

  // 1. Submit with retry
  const submitRaw = await withRetry(async () => {
    submitAttempts++;
    return opts.submit();
  }, {
    ...(opts.submitRetryOpts || {}),
    operationName: `${opts.operationName}/submit`,
  });

  const parsed = opts.parseSubmitResponse(submitRaw);

  // 2. If sync final state, return immediately
  const submitSuccess = opts.successStates.includes(parsed.state as string as TAckState);
  const submitFailure = opts.failureStates.includes(parsed.state as string as TAckState);
  if (submitSuccess || submitFailure) {
    return {
      finalState: parsed.state as string as TAckState,
      ok: submitSuccess,
      raw: parsed.raw ?? submitRaw,
      submitAttempts,
      ackPollAttempts: 0,
      totalDurationMs: Date.now() - start,
    };
  }

  // 3. Pending — poll ack if checkAckStatus is provided
  if (!opts.checkAckStatus || !parsed.ackToken) {
    // No ack polling possible — return the pending state as-is (caller must handle)
    return {
      finalState: parsed.state as string as TAckState,
      ok: false,
      raw: parsed.raw ?? submitRaw,
      submitAttempts,
      ackPollAttempts: 0,
      totalDurationMs: Date.now() - start,
    };
  }

  const ackResult = await pollSubmissionAck<TAckState>({
    checkStatus: () => opts.checkAckStatus!(parsed.ackToken!),
    successStates: opts.successStates,
    failureStates: opts.failureStates,
    pendingStates: opts.pendingStates,
    ...(opts.ackPollOpts || {}),
    operationName: `${opts.operationName}/ack`,
  });
  ackPollAttempts = ackResult.attempts;

  return {
    finalState: ackResult.state,
    ok: opts.successStates.includes(ackResult.state),
    raw: ackResult.raw,
    submitAttempts,
    ackPollAttempts,
    totalDurationMs: Date.now() - start,
  };
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

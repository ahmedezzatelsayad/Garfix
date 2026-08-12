/**
 * tx.ts — Accounting transaction helper with Serializable isolation.
 *
 * AUDIT FIX: Financial operations (journal entries, payments, period close,
 * fiscal year close) require Serializable isolation to prevent:
 *   - Lost updates on account balances under concurrent writes
 *   - Phantom reads in balance calculations
 *   - Double-spend on payment processing
 *
 * PostgreSQL's default Read Committed is insufficient for these operations.
 * This helper provides a drop-in replacement for db.$transaction(async (tx) => ...)
 * that adds Serializable isolation.
 */
import { dbTyped as db } from "@/lib/db";
import type { Prisma } from "@prisma/client";

/** Serializable isolation level for financial transactions */
const SERIALIZABLE: Prisma.TransactionIsolationLevel = "Serializable";

/**
 * Execute a financial transaction with Serializable isolation.
 *
 * Usage: replace `db.$transaction(async (tx) => { ... })` with
 *        `accountingTx(async (tx) => { ... })`
 *
 * On serialization failure, retries up to 3 times with exponential backoff.
 */
export async function accountingTx<T>(
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
  options?: { maxRetries?: number; timeoutMs?: number },
): Promise<T> {
  const maxRetries = options?.maxRetries ?? 3;
  const timeoutMs = options?.timeoutMs ?? 30_000;
  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await db.$transaction(fn, {
        isolationLevel: SERIALIZABLE,
        maxWait: timeoutMs,
        timeout: timeoutMs,
      });
    } catch (err: unknown) {
      lastError = err instanceof Error ? err : new Error(String(err));
      // PostgreSQL serialization failure error code
      const code = (err as { code?: string }).code;
      if (code === "40001" && attempt < maxRetries) {
        // Exponential backoff: 100ms, 200ms, 400ms
        const delay = 100 * Math.pow(2, attempt);
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }
      throw err;
    }
  }
  throw lastError;
}

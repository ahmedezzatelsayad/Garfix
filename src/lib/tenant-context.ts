/**
 * tenant-context.ts — AsyncLocalStorage for per-request tenant context.
 *
 * TASK-0 FIX (Audit v2 · Phase 2): Fixes the P0 regression introduced by
 * the strict RLS migration (20260813130000). That migration removed the
 * IS NULL bypass from RLS policies, which means queries return 0 rows
 * when `app.current_company_slug` is not set. Only `withTenantScope`
 * set it, but only 38 of 250 routes use that HOF.
 *
 * This module provides an AsyncLocalStorage-based bridge that:
 *   1. `withErrorHandler` sets the tenant slug in ALS after resolving auth
 *   2. The Prisma extension (in db.ts) reads from ALS and wraps each
 *      query in a `$transaction` with `set_config('app.current_company_slug', slug, true)`
 *
 * T0-A FIX (Nested Transaction Atomicity): The extension has a re-entrancy
 * guard via `inTransaction` flag. When code calls `db.$transaction(async (tx) => {...})`,
 * the operations inside use the `tx` client (not `db`). The extension detects
 * this via the `inTransaction` ALS flag and:
 *   - If inside a transaction: calls `set_config` on the `tx` client directly
 *     (no new $transaction wrapper — preserves atomicity)
 *   - If outside a transaction: wraps in a new $transaction (cold path)
 *
 * This ensures financial multi-write operations remain atomic.
 */

import { AsyncLocalStorage } from "node:async_hooks";

export interface TenantContextValue {
  slug: string;
  isPlatformAdmin: boolean;
  /** T0-A: true when inside a db.$transaction — extension skips wrapping */
  inTransaction?: boolean;
}

const tenantStorage = new AsyncLocalStorage<TenantContextValue>();

/**
 * Run a function within a tenant context. All Prisma queries inside the
 * function will be automatically scoped to the given tenant via RLS.
 */
export function runWithTenantContext<T>(
  slug: string,
  isPlatformAdmin: boolean,
  fn: () => Promise<T>,
): Promise<T> {
  return tenantStorage.run({ slug, isPlatformAdmin, inTransaction: false }, fn);
}

/**
 * T0-A: Mark that we're now inside a $transaction. The extension will
 * skip wrapping individual operations in a new $transaction and instead
 * rely on the outer transaction's set_config.
 *
 * This is called by the $transaction interceptor in db.ts.
 */
export function markInTransaction<T>(fn: () => Promise<T>): Promise<T> {
  const current = tenantStorage.getStore();
  if (!current) {
    // No tenant context — just run the function
    return fn();
  }
  // Run with inTransaction=true so the extension knows to skip wrapping
  return tenantStorage.run({ ...current, inTransaction: true }, fn);
}

/**
 * Get the current tenant context from ALS. Returns undefined if called
 * outside a tenant context (e.g. in a public route or background job).
 */
export function getTenantContext(): TenantContextValue | undefined {
  return tenantStorage.getStore();
}

/**
 * Check if the current request has a tenant context set.
 */
export function hasTenantContext(): boolean {
  return tenantStorage.getStore() !== undefined;
}

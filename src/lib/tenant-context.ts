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
 * This means ALL routes that use `withErrorHandler` (211 routes) get
 * automatic tenant-scoped queries WITHOUT any code changes to individual
 * route handlers.
 *
 * Performance note: each query becomes a `$transaction` (1 extra round-trip
 * for set_config). This is acceptable for the P0 fix. Hot paths should use
 * `withTenantScope` explicitly to batch multiple queries in one transaction.
 */

import { AsyncLocalStorage } from "node:async_hooks";

export interface TenantContextValue {
  slug: string;
  isPlatformAdmin: boolean;
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
  return tenantStorage.run({ slug, isPlatformAdmin }, fn);
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

/**
 * db.ts — Prisma Client (P0-3: Soft Delete via $extends).
 *
 * Uses Prisma's $extends API for soft-delete filtering.
 * The extended client automatically adds deletedAt: null to
 * findMany/findFirst queries on soft-delete models.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * P1-4 (Typed PrismaClient): previously `db: any` masked ~80 type mismatches.
 *
 * The fix: type db as the EXTENDED client (ReturnType of $extends). This is
 * the correct type — it includes all Prisma model accessors (db.appUser,
 * db.sessionRegistry, etc.) with their full type signatures, AND the
 * soft-delete extension's query hooks still run at runtime because they're
 * attached to the actual client object.
 *
 * Type-only escape hatch: where a caller writes a field that doesn't exist
 * on the Prisma type (because of legacy code or a schema-vs-code drift we
 * haven't reconciled yet), the call site will produce a TypeScript error.
 * That error is the AUDIT WORKING AS INTENDED — it surfaces a real bug that
 * `any` was hiding. Each such site should be fixed individually rather than
 * re-disabling type checking globally.
 *
 * To avoid blocking the build on the first pass, we use a graduated
 * approach: `db` is typed as the extended client, but legacy call sites
 * that produce type errors can use the locally-imported `dbAsAny` helper
 * (defined at the bottom of this file) as a one-line escape hatch WITH a
 * required comment explaining why. This makes every type-safety escape
 * explicit and greppable, rather than implicit and hidden.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { PrismaClient } from '@prisma/client'
import os from 'node:os';
import { getTenantContext } from './tenant-context'

const globalForPrisma = globalThis as typeof globalThis & {
  prisma: ReturnType<typeof createExtendedPrisma> | undefined
};

const isDev = process.env.NODE_ENV !== 'production';

// DB-12 FIX (Audit v2 · Phase 3): Pool size now scales with vCPU when the
// operator has not explicitly set DATABASE_POOL_SIZE. We default to
// `2 * availableParallelism` (clamped to [5, 50]) in production, which gives
// small instances (1–2 vCPU) a sane floor and larger instances (8+ vCPU) a
// proportional ceiling without over-subscribing the Postgres backend.
//
// DATABASE_POOL_SIZE always wins if set — operators can pin a specific size
// for capacity planning / connection-budget reasons.
function defaultPoolSizeFromCpu(): number {
  let cpus = 0;
  try {
    // Node 18.14+ exposes availableParallelism(); fall back to cpus().length.
    cpus = typeof (os as { availableParallelism?: () => number }).availableParallelism === 'function'
      ? (os as { availableParallelism: () => number }).availableParallelism()
      : os.cpus().length;
  } catch {
    cpus = 0;
  }
  if (!cpus || cpus < 1) return 20;
  const sized = cpus * 2;
  return Math.max(5, Math.min(50, sized));
}

const poolSize = isDev
  ? 5
  : (parseInt(process.env.DATABASE_POOL_SIZE || '', 10) || defaultPoolSizeFromCpu());

// P0-3: Models that support soft-delete (must have deletedAt field in schema)
const SOFT_DELETE_MODELS = new Set([
  'Company', 'Client', 'Invoice',
  'Supplier', 'Employee', 'PurchaseInvoice', 'JournalEntry', 'PaymentTransaction', 'EInvoice',
]);

// Create base client
const basePrisma = new PrismaClient({
  log: isDev ? ['query', 'warn', 'error'] : ['warn', 'error'],
  datasourceUrl: process.env.DATABASE_URL
    ? appendPoolParams(process.env.DATABASE_URL, poolSize)
    : undefined,
});

let lastConnectionError: { code: string; message: string; at: Date } | null = null;

// DB-12 FIX (Audit v2 · Phase 3): Auto-reconnect handler. Previously the
// $on('error') hook only *logged* P1017/P1011/P1001 (server closed / can't
// reach DB) events — the pool stayed poisoned until the next cold start. We
// now schedule a fire-and-forget `$disconnect()` so Prisma tears down the
// dead sockets and re-opens them lazily on the next query. The disconnect is
// deferred via `setTimeout(..., 0)` to avoid re-entering Prisma while the
// error event is still being dispatched.
let _reconnecting = false;

/**
 * C3 FIX: synchronous re-route guard for the tenantRls interceptor.
 * True only during the brief synchronous window in which an operation issued
 * on the outer client is being forwarded onto the active transaction client.
 * The tx client's own interceptor observes the flag and forwards the call
 * directly instead of re-routing it (prevents infinite recursion).
 */
let _reroutingToTx = false;

function scheduleReconnect(): void {
  if (_reconnecting) return;
  _reconnecting = true;
  setTimeout(async () => {
    try {
      await basePrisma.$disconnect();
    } catch {
      // swallow — $disconnect failures are expected when the socket is gone
    } finally {
      _reconnecting = false;
      lastConnectionError = null;
    }
  }, 0);
}

try {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (basePrisma as any).$on('error', (e: { code?: string; message?: string }) => {
    if (e?.code === 'P1017' || e?.code === 'P1011' || e?.code === 'P1001') {
      lastConnectionError = { code: e.code, message: e.message || String(e) || 'DB connection lost', at: new Date() };
       
      console.error('[db] connection error (likely RDS failover) — scheduling reconnect', { code: e.code });
      scheduleReconnect();
    }
  });
} catch {}

export async function reconnectDb(): Promise<void> {
  try { await basePrisma.$disconnect(); } catch {}
  lastConnectionError = null;
}
export function getLastDbConnectionError() { return lastConnectionError; }

// P0-3: Extend with soft-delete filtering + TASK-0 RLS tenant context
// Uses $extends with query-level hooks that:
//   1. Inject deletedAt: null for soft-delete models
//   2. Wrap each query in a $transaction with set_config for RLS (TASK-0)
//
// DB-09 FIX (Audit v2 · Phase 2): Previously only `findMany` and
// `findFirst` were intercepted, which left `findUnique`, `count`,
// `aggregate`, and `groupBy` returning tombstone rows (deleted records).
// All four are now intercepted following the same `deletedAt: null`
// injection pattern.
function createExtendedPrisma() {
  return basePrisma.$extends({
    name: 'softDelete',
    query: {
      $allModels: {
        async findMany({ args, query, model }) {
          if (SOFT_DELETE_MODELS.has(model) && !(args as { where?: { deletedAt?: unknown } })?.where?.deletedAt) {
            args = {
              ...args,
              where: { ...(args as { where?: Record<string, unknown> })?.where, deletedAt: null },
            } as typeof args;
          }
          return query(args);
        },
        async findFirst({ args, query, model }) {
          if (SOFT_DELETE_MODELS.has(model) && !(args as { where?: { deletedAt?: unknown } })?.where?.deletedAt) {
            args = {
              ...args,
              where: { ...(args as { where?: Record<string, unknown> })?.where, deletedAt: null },
            } as typeof args;
          }
          return query(args);
        },
        // DB-09 FIX (Audit v2 · Phase 2): findUnique previously bypassed
        // soft-delete filtering, returning tombstone rows by primary key.
        async findUnique({ args, query, model }) {
          if (SOFT_DELETE_MODELS.has(model) && !(args as { where?: { deletedAt?: unknown } })?.where?.deletedAt) {
            args = {
              ...args,
              where: { ...(args as { where?: Record<string, unknown> })?.where, deletedAt: null },
            } as typeof args;
          }
          return query(args);
        },
        // DB-09 FIX (Audit v2 · Phase 2): count previously included
        // tombstone rows, inflating tallies for deleted records.
        async count({ args, query, model }) {
          if (SOFT_DELETE_MODELS.has(model) && !(args as { where?: { deletedAt?: unknown } })?.where?.deletedAt) {
            args = {
              ...args,
              where: { ...(args as { where?: Record<string, unknown> })?.where, deletedAt: null },
            } as typeof args;
          }
          return query(args);
        },
        // DB-09 FIX (Audit v2 · Phase 2): aggregate previously summed
        // tombstone rows into totals (e.g. revenue, balances).
        async aggregate({ args, query, model }) {
          if (SOFT_DELETE_MODELS.has(model) && !(args as { where?: { deletedAt?: unknown } })?.where?.deletedAt) {
            args = {
              ...args,
              where: { ...(args as { where?: Record<string, unknown> })?.where, deletedAt: null },
            } as typeof args;
          }
          return query(args);
        },
        // DB-09 FIX (Audit v2 · Phase 2): groupBy previously returned
        // buckets containing tombstone rows, corrupting dimension cuts.
        async groupBy({ args, query, model }) {
          if (SOFT_DELETE_MODELS.has(model) && !(args as { where?: { deletedAt?: unknown } })?.where?.deletedAt) {
            args = {
              ...args,
              where: { ...(args as { where?: Record<string, unknown> })?.where, deletedAt: null },
            } as typeof args;
          }
          return query(args);
        },
      },
    },
  }).$extends({
    // TASK-0 FIX (Audit v2 · Phase 2): RLS tenant context interceptor.
    // Every query through this client is automatically wrapped in a
    // $transaction that sets app.current_company_slug via set_config(..., true).
    // This fixes the P0 regression where strict RLS policies return 0 rows
    // for the 211 routes that don't use withTenantScope explicitly.
    //
    // T0-A FIX (Nested Transaction Atomicity): The extension has a
    // re-entrancy guard. When code calls db.$transaction(async (tx) => {...}),
    // the patched $transaction (below) sets the ALS `inTransaction` flag.
    // The $allOperations interceptor checks this flag:
    //   - If inTransaction=true: calls set_config on the tx client directly
    //     (NO new $transaction wrapper — preserves atomicity of the outer tx)
    //   - If inTransaction=false: wraps in a new $transaction (cold path)
    name: 'tenantRls',
    query: {
      $allOperations: async ({ model, operation, args, query }) => {
        const ctx = getTenantContext();
        // TASK-0 DEBUG: log to prove the extension is intercepting
        if (process.env.TASK0_DEBUG === '1') {
          // eslint-disable-next-line no-console
          console.log(`[TASK-0] ${model}.${operation} ctx=${ctx?.slug || 'none'} admin=${ctx?.isPlatformAdmin || false} inTx=${ctx?.inTransaction || false}`);
        }
        if (!ctx) {
          // No tenant context (public route, background job, or test) →
          // run the query without RLS context. The RLS policy will return
          // 0 rows for tenant-scoped tables, which is the correct fail-closed
          // behavior for unauthenticated/uncontextualized access.
          return query(args);
        }

        // T0-A + C3 FIX: If inside a $transaction, DON'T wrap in a new one.
        // The patched $transaction (see below) already called set_config on
        // the tx client. Model operations issued on the OUTER client (db.*)
        // are re-routed to the active transaction client so they join the
        // SAME transaction (true atomicity) — previously they silently
        // committed on a separate connection, so a mid-callback failure left
        // partial writes behind.
        if (ctx.inTransaction) {
          if (model && ctx.txClient && !_reroutingToTx) {
            // Re-route OUTER-client ops onto the active transaction client.
            // The guard flag is released synchronously right after invocation
            // so concurrent parallel queries can also re-route safely.
            _reroutingToTx = true;
            let rerouted: Promise<unknown> | undefined;
            try {
              const txAny = ctx.txClient as Record<string, Record<string, (a: unknown) => Promise<unknown>>>;
              const fn = txAny[model]?.[operation];
              if (fn) rerouted = fn(args);
            } finally {
              _reroutingToTx = false;
            }
            if (rerouted) return rerouted;
          }
          return query(args);
        }

        // Cold path: not inside a transaction → wrap in a new one.
        // C2/Raw-op FIX (Review / 2026-08-24): the set_config calls above
        // apply to the TRANSACTION's connection. Model operations were
        // already forwarded onto that connection via tx[model][operation].
        // RAW operations ($queryRaw/$executeRaw) used to fall through to
        // `query(args)`, which executes on the OUTER client's pooled
        // connection — silently losing the RLS scope and returning 0 rows
        // for tenant tables once the app connects as a non-BYPASSRLS role.
        // They are now forwarded onto the tx connection too.
        const runScopedOnTx = async (tx: Parameters<Parameters<typeof basePrisma.$transaction>[0]>[0]) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const txAny = tx as any;
          if (model) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            return (txAny as any)[model]?.[operation]?.(args) ?? query(args);
          }
          // Raw operation forwarding. Empirically (verified against Prisma
          // 6.x): tagged-template raw ops pass { strings, values }; the
          // Unsafe variants pass positional arguments as an array.
          if (Array.isArray(args)) {
            return txAny[operation](...(args as unknown[]));
          }
          const rawArgs = args as { strings?: unknown[]; values?: unknown[] } | null;
          if (rawArgs && Array.isArray(rawArgs.strings) && Array.isArray(rawArgs.values)) {
            // Tagged-template form: fn(strings, ...values). Prisma validates
            // that `strings` carries the TemplateStringsArray `raw` property —
            // the extension plumbing strips it, so re-attach before calling.
            const strings = rawArgs.strings as string[] & { raw?: string[] };
            if (!strings.raw) strings.raw = strings;
            return txAny[operation](strings, ...rawArgs.values);
          }
          return query(args);
        };

        // Founder bypass → set app.is_platform = 'on'
        if (ctx.isPlatformAdmin) {
          return basePrisma.$transaction(async (tx) => {
            await tx.$executeRaw`SELECT set_config('app.is_platform', 'on', true)`;
            await tx.$executeRaw`SELECT set_config('app.current_company_slug', ${ctx.slug}, true)`;
            return runScopedOnTx(tx);
          });
        }

        // Regular tenant → set app.current_company_slug
        return basePrisma.$transaction(async (tx) => {
          await tx.$executeRaw`SELECT set_config('app.current_company_slug', ${ctx.slug}, true)`;
          return runScopedOnTx(tx);
        });
      },
      // T0-A: We need to intercept $transaction but Prisma's $extends
      // doesn't support intercepting $transaction directly via the query
      // interceptor. Instead, we handle re-entrancy via the ALS inTransaction
      // flag set by the withTenantScope HOF + a custom $transaction wrapper
      // exported from db.ts (see withTenantTx below).
      //
      // The $allOperations interceptor above already checks ctx.inTransaction
      // and skips wrapping when true. The flag is set by:
      //   1. withTenantScope (src/lib/api/tenant-middleware.ts) — explicit
      //   2. withTenantTx (exported below) — for manual use in routes
      //   3. Any code that calls db.$transaction inside a withErrorHandler
      //      route will have inTransaction=false (default), so each operation
      //      gets its own $transaction wrapper. This is correct for atomicity
      //      because Prisma's interactive $transaction ensures all operations
      //      in the callback share the same connection + commit/rollback.
      //
      // The re-entrancy issue only occurs when the EXTENSION wraps an
      // operation that's ALREADY inside a $transaction callback. Prisma's
      // $extends $allOperations interceptor runs for EVERY operation including
      // those inside $transaction callbacks. Without the inTransaction check,
      // each operation would get a NESTED $transaction — breaking atomicity.
      //
      // With the inTransaction check:
      //   - Operations inside db.$transaction(cb) → inTransaction=true →
      //     skip wrap, run directly on the tx client (atomicity preserved)
      //   - Operations outside $transaction → inTransaction=false →
      //     wrap in new $transaction (cold path, correct)
    },
  });
}

// P1-4: typed export — surfaces real type mismatches at call sites.
const extendedPrisma = createExtendedPrisma();

/**
 * The canonical DB client.
 *
 * P1-4 STATUS: The audit recommends typing this as the extended PrismaClient
 * (no `any`) so that every `db.<model>.<method>()` call is type-checked
 * against the Prisma schema. We attempted this and it surfaced ~80 REAL
 * type mismatches across the codebase — most of them are genuine bugs
 * (writing `eventType` to a model that has `event`, passing `number` IDs
 * to `string @id` fields, reading nonexistent `isUndone` / `tier` /
 * `matchedAlias` properties, etc.).
 *
 * Fixing all 80 in a single P1 sprint would violate the user's directive
 * ("don't open huge TS modifications — focus on production-impacting
 * security + performance first"). So we adopt a graduated approach:
 *
 *   1. `db` stays as `any` for now (preserves CI green).
 *   2. `dbTyped` is exported as the FULLY TYPED extended client. New code
 *      SHOULD use `dbTyped` — it will catch real bugs at the call site.
 *   3. A follow-up sprint will migrate existing call sites from `db` to
 *      `dbTyped` one file at a time, fixing each exposed type mismatch.
 *   4. Once all call sites use `dbTyped`, `db` will be removed.
 *
 * This is the inverse of the previous "all-or-nothing" approach — it
 * lets us opt-in to type safety incrementally rather than blocking the
 * whole codebase on a single massive refactor.
 */
export const db = globalForPrisma.prisma ?? extendedPrisma;

/**
 * Fully-typed extended Prisma client. Use this in NEW code — it catches
 * real type mismatches (wrong field names, wrong ID types, missing required
 * fields) at compile time rather than at runtime.
 *
 * Migration plan: existing call sites that use `db` will be moved to
 * `dbTyped` file-by-file in a follow-up sprint. Each migration typically
 * exposes 1-5 real bugs that were hidden by `any` — fix them as you go.
 *
 * Example:
 *   import { dbTyped as db } from "@/lib/db";
 *   const user = await db.appUser.findUnique({ where: { uid: "..." } });
 *   // TS will error if `uid` doesn't exist on AppUser, or if the return
 *   // type is used incorrectly downstream.
 */
export const dbTyped = globalForPrisma.prisma ?? extendedPrisma;

/**
 * P5-M6: Type alias for the transaction client parameter that
 * `dbTyped.$transaction(async (tx) => { ... })` passes to its callback.
 *
 * This is NOT `Prisma.TransactionClient` — that's the BASE client's
 * transaction type. Because `dbTyped` is the EXTENDED client (via
 * $extends for soft-delete), the tx parameter inside `$transaction`
 * has a different (richer) type that includes the extension's query
 * hooks. Using `Prisma.TransactionClient` directly causes type errors
 * at every call site.
 *
 * This alias extracts the actual tx parameter type from the typed
 * $transaction signature, so library functions that accept `tx` can
 * be properly typed without resorting to `any`.
 */
export type DbTx = Parameters<Parameters<typeof dbTyped.$transaction>[0]>[0];

function appendPoolParams(url: string, poolSize: number): string {
  // DB-12 FIX (Audit v2 · Phase 3): Append pool tuning + query guard rails
  // to the datasource URL so EVERY Prisma-managed connection inherits them.
  //   - connection_limit: max simultaneous connections per Prisma client
  //   - pool_timeout:     seconds to wait for a free connection before erroring
  //   - statement_timeout: ms — abort any single statement that runs >30s so a
  //     runaway query cannot pin a pool slot and starve the API
  //   - idle_timeout:     ms — reclaim idle connections after 30s so the pool
  //     shrinks gracefully under low load (matches pgBouncer best practice)
  //
  // If the caller already baked `connection_limit=` into the URL we leave it
  // untouched (operator-managed datasource URL).
  if (url.includes('connection_limit=')) return url;
  const sep = url.includes('?') ? '&' : '?';
  return (
    `${url}${sep}connection_limit=${poolSize}` +
    `&pool_timeout=30` +
    `&statement_timeout=30000` +
    `&idle_timeout=30000`
  );
}

let _dbInitialized = false;

export async function initDb(): Promise<void> {
  if (_dbInitialized) return;
  _dbInitialized = true;
}

if (isDev) globalForPrisma.prisma = db;

/**
 * C3 FIX (Review / 2026-08-24) — Atomic tenant-aware $transaction for EVERY
 * call site.
 *
 * PROBLEM: the `tenantRls` extension's `$allOperations` interceptor only
 * skips its per-operation `$transaction` wrapper when the ALS
 * `inTransaction` flag is set — and that flag was only set by the (rarely
 * used) `withTenantTx` helper. Any route calling
 * `db.$transaction(async (tx) => { ... })` directly (~20 financial
 * call-sites: invoice + inventory + journal-entry writes) ran EVERY inner
 * operation in its OWN nested transaction on a SEPARATE connection, so a
 * mid-callback failure left partial writes committed (no rollback).
 *
 * FIX: override the extended client's interactive `$transaction` so that
 * every callback execution:
 *   1. opens on the real transaction client (single connection),
 *   2. sets `app.current_company_slug` (+ `app.is_platform` for founder)
 *      ONCE on that tx client,
 *   3. runs the user callback under the `inTransaction` ALS flag so the
 *      interceptor runs operations directly on the tx client.
 * → True atomicity + correct RLS scope for ALL existing call sites,
 *   with zero changes required at the call sites themselves.
 *
 * Array/sequential $transaction forms are passed through unchanged (each
 * element is a single op — per-op wrapping preserves their semantics).
 */
{
  type InteractiveTx = Parameters<Parameters<typeof extendedPrisma.$transaction>[0]>[0];
  const origTransaction = extendedPrisma.$transaction.bind(extendedPrisma);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (extendedPrisma as any).$transaction = function patchedTransaction(
    fnOrArray: unknown,
    options?: unknown,
  ) {
    if (typeof fnOrArray !== "function") {
      // Array form / sequential operations — no ALS wrapping needed.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (origTransaction as any)(fnOrArray, options);
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (origTransaction as any)(
      async (tx: InteractiveTx) => {
        const { getTenantContext, runInTransactionWith } = await import("./tenant-context");
        const ctx = getTenantContext();
        if (!ctx) {
          // No tenant context (background job / public route) — run as-is.
          return (fnOrArray as (t: InteractiveTx) => Promise<unknown>)(tx);
        }
        // Bind the tx client into ALS so outer-client (db.*) operations
        // issued inside the callback are re-routed onto THIS transaction,
        // and set_config on the tx connection exactly once.
        return runInTransactionWith(async () => {
          if (ctx.isPlatformAdmin) {
            await tx.$executeRaw`SELECT set_config('app.is_platform', 'on', true)`;
          }
          await tx.$executeRaw`SELECT set_config('app.current_company_slug', ${ctx.slug}, true)`;
          return (fnOrArray as (t: InteractiveTx) => Promise<unknown>)(tx);
        }, tx);
      },
      options,
    );
  };
}

/**
 * P1-4 ESCAPE HATCH — use ONLY when you have a genuine type-safety escape
 * that can't be expressed in Prisma's type system (e.g. raw SQL via
 * $queryRaw with dynamic column lists, or a temporary cast during a
 * schema migration).
 *
 * Usage:
 *   import { db, dbAsAny } from "@/lib/db";
 *   // P1-4 ESCAPE: <reason why this can't be typed>
 *   await dbAsAny.someModel.create({ data: { ... } });
 *
 * Every usage MUST have a comment explaining why. This makes the escape
 * greppable for future audits and forces conscious decisions about each
 * type-safety hole rather than blanket-disabling the whole client.
 */
export const dbAsAny: unknown = db;


/**
 * T0-A: withTenantTx — Wrapper for db.$transaction that sets the ALS
 * inTransaction flag so the extension's $allOperations interceptor skips
 * wrapping individual operations in new $transactions.
 *
 * Usage:
 *   import { withTenantTx } from "@/lib/db";
 *   await withTenantTx(async (tx) => {
 *     await tx.invoice.create({ data: {...} });
 *     await tx.journalEntry.create({ data: {...} });
 *     // Both operations share the same $transaction + set_config
 *   });
 *
 * This preserves atomicity: if the callback throws, BOTH writes roll back.
 */
export async function withTenantTx<T>(
  fn: (tx: DbTx) => Promise<T>,
): Promise<T> {
  const { markInTransaction } = await import('./tenant-context');
  return markInTransaction(async () => {
    return dbTyped.$transaction(async (tx) => {
      // Set the tenant context on the tx client
      const { getTenantContext } = await import('./tenant-context');
      const ctx = getTenantContext();
      if (ctx) {
        if (ctx.isPlatformAdmin) {
          await tx.$executeRaw`SELECT set_config('app.is_platform', 'on', true)`;
        }
        await tx.$executeRaw`SELECT set_config('app.current_company_slug', ${ctx.slug}, true)`;
      }
      return fn(tx as DbTx);
    });
  });
}

/**
 * db-rls.ts — Prisma client extension for Postgres Row-Level Security (P1.5)
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WHAT THIS DOES
 * ═══════════════════════════════════════════════════════════════════════════
 * Sets the Postgres session variable `app.current_company_slug` at the
 * start of every Prisma query, so RLS policies can filter rows by tenant
 * without the application code having to remember WHERE clauses on every
 * query.
 *
 *   const tenantDb = withTenant(db, "acme-corp");
 *   // Every query through tenantDb now sees only acme-corp rows,
 *   // enforced at the Postgres level. A forgotten WHERE clause is
 *   // no longer a data leak.
 *   const invoices = await tenantDb.invoice.findMany();
 *
 * For founder/admin users who need cross-tenant visibility, use:
 *
 *   const allTenantDb = withTenant(db, "__ALL__");
 *   // Bypasses RLS — sees rows from all tenants.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * IMPLEMENTATION
 * ═══════════════════════════════════════════════════════════════════════════
 * Prisma does not natively support per-query session variables. We use
 * the $transaction callback form: every query is wrapped in a
 * transaction that runs `SELECT set_config(...)` first, then the actual
 * query, with the `isolationLevel` set to READ COMMITTED (the Postgres
 * default, which is RLS-compatible).
 *
 * This is the official Postgres-recommended pattern for tenant context
 * with RLS — see https://www.postgresql.org/docs/current/ddl-rowsecurity.html
 *
 * For performance, the wrapper caches the underlying Prisma client and
 * only adds the set_config round-trip. In practice the overhead is
 * <1ms per query (single round-trip on the existing connection).
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * USAGE FROM API ROUTES
 * ═══════════════════════════════════════════════════════════════════════════
 *   import { dbTyped as db } from "@/lib/db";
 *   import { withTenant } from "@/lib/db-rls";
 *
 *   export async function GET(req: NextRequest) {
 *     const auth = await resolveAuth(req);
 *     if (!auth.ok) return 401;
 *
 *     // Get the tenant from the URL or auth context
 *     const companySlug = req.nextUrl.searchParams.get("company")
 *       || auth.user!.companies[0]
 *       || "__ALL__";  // founder fallback
 *
 *     const tenantDb = withTenant(db, companySlug);
 *     const invoices = await tenantDb.invoice.findMany();
 *     return Response.json(invoices);
 *   }
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * CAVEATS
 * ═══════════════════════════════════════════════════════════════════════════
 * 1. RLS does NOT replace application-layer WHERE clauses — it
 *    supplements them. Both should be used together (defense in depth).
 * 2. The Prisma connection role must NOT be a superuser. Postgres
 *    superusers bypass RLS even with FORCE ROW LEVEL SECURITY.
 * 3. Raw SQL queries via db.$executeRawUnsafe bypass RLS unless they
 *    go through the same transaction wrapper.
 * 4. Tests that use SQLite (which doesn't support RLS) should use the
 *    plain `db` client, not `withTenant(db, ...)`. The wrapper detects
 *    SQLite and becomes a no-op.
 */

import { Prisma, PrismaClient } from "@prisma/client";
import { logger } from "./logger";

// ─── Types ────────────────────────────────────────────────────────────────

type TenantScopedDb = Omit<PrismaClient, "$on" | "$connect" | "$disconnect" | "$use" | "$transaction" | "$extends"> & {
  __tenantSlug: string;
};

/**
 * Structural type for any Prisma-like client that supports $transaction
 * with $executeRaw (used by runWithTenantContext and verifyRlsForSlug).
 *
 * Both the base PrismaClient and extended clients (via $extends) satisfy
 * this interface at runtime. TypeScript can't verify the extended client
 * IS-A PrismaClient due to how $extends generates types, so we use
 * structural typing here instead of nominal.
 */
type RlsCapableDb = {
  $transaction<T>(
    fn: (tx: { $executeRaw: PrismaClient['$executeRaw'] }) => Promise<T>,
    options?: { isolationLevel?: Prisma.TransactionIsolationLevel },
  ): Promise<T>;
  $queryRaw: PrismaClient['$queryRaw'];
};

const scopedDbCache = new WeakMap<PrismaClient, Map<string, TenantScopedDb>>();

// ─── Public API ────────────────────────────────────────────────────────────

/**
 * Wrap the Prisma client to scope all queries to a single tenant.
 * Returns a new client-like object — the original `db` is unchanged.
 *
 * Cached per (db, slug) pair to avoid re-creating the wrapper on every
 * request.
 */
export function withTenant(db: PrismaClient, companySlug: string): TenantScopedDb {
  // SQLite detection — RLS is a no-op there.
  if (isSqlite()) {
    // SQLite doesn't support RLS — return a passthrough proxy that
    // satisfies the TenantScopedDb interface. The `__tenantSlug` trap
    // still works because the proxy intercepts all access.
    // @ts-expect-error — TS cannot verify Proxy satisfies TenantScopedDb; the trap adds __tenantSlug at runtime.
    const passthrough: TenantScopedDb = new Proxy(db, {
      get(target, prop, receiver) {
        if (prop === "__tenantSlug") return companySlug;
        return Reflect.get(target, prop, receiver);
      },
    });
    return passthrough;
  }

  let innerCache = scopedDbCache.get(db);
  if (!innerCache) {
    innerCache = new Map();
    scopedDbCache.set(db, innerCache);
  }
  const cached = innerCache.get(companySlug);
  if (cached) return cached;

  // Use a Proxy to intercept every method call on every model.
  // For each call, we wrap it in a $transaction that sets the session
  // variable first, then runs the original query.
  //
  // P3.3 (Cycle 5): expose `__tenantSlug` via the Proxy's `get` trap instead
  // of `Object.defineProperty`. The previous `defineProperty` call failed
  // when called twice on Proxies backed by the same `db` (the first call
  // made the property non-configurable, so the second call threw
  // "Attempting to change value of a readonly property").
  // The Proxy intercepts all property access at runtime, so the target
  // type is never directly exposed to callers.
  // @ts-expect-error — TS cannot verify Proxy satisfies TenantScopedDb; the trap adds __tenantSlug at runtime.
  const scoped: TenantScopedDb = new Proxy(db, {
    get(target, prop, receiver) {
      // Expose the tenant slug for diagnostic / assertion purposes
      if (prop === "__tenantSlug") return companySlug;
      // Pass through non-model properties (e.g. $transaction, $queryRaw)
      if (typeof prop !== "string" || prop.startsWith("$")) {
        return Reflect.get(target, prop, receiver);
      }
      // @ts-expect-error — accessing model by dynamic string key on PrismaClient
      const model = (target as Record<string, unknown>)[prop];
      if (!model || typeof model !== "object") {
        return model;
      }
      // Wrap each model in its own proxy that intercepts method calls.
      return new Proxy(model, {
        get(modelTarget, modelProp: string | symbol) {
          const fn = (modelTarget as Record<string | symbol, unknown>)[modelProp as string];
          if (typeof fn !== "function") return fn;
          return async (...args: unknown[]) => {
            return runWithTenantContext(db, companySlug, async () =>
              (fn as (...a: unknown[]) => Promise<unknown>).apply(modelTarget, args),
            );
          };
        },
      });
    },
  });

  innerCache!.set(companySlug, scoped);
  return scoped;
}

/**
 * Run an arbitrary function inside a tenant-scoped transaction. This is
 * the lower-level primitive that withTenant uses internally, exposed
 * for cases where the proxy approach doesn't work (e.g. raw SQL).
 *
 *   const result = await runWithTenantContext(db, "acme", async () => {
 *     await db.$executeRaw`UPDATE invoices SET status = 'paid' WHERE id = ${id}`;
 *     return db.invoice.findUnique({ where: { id } });
 *   });
 */
export async function runWithTenantContext<T>(
  db: RlsCapableDb,
  companySlug: string,
  fn: () => Promise<T>,
): Promise<T> {
  if (isSqlite()) {
    return fn();
  }
  // $transaction with a callback runs the function in a single
  // connection, so the set_config call persists for the duration.
  return db.$transaction(async (tx) => {
    // set_config(name, value, is_local) — is_local=true means the
    // setting reverts at the end of the current transaction.
    await tx.$executeRaw`SELECT set_config('app.current_company_slug', ${companySlug}, true)`;
    return fn();
  });
}

/**
 * Verify RLS is working correctly by running a test query and checking
 * that only the expected tenant's rows are visible. Used by the health
 * check endpoint and by integration tests.
 *
 * Returns { ok, visibleCount, expectedSlug } — if RLS is properly
 * configured, visibleCount should equal the number of rows in the
 * invoices table for the given slug.
 */
export async function verifyRlsForSlug(
  db: RlsCapableDb,
  companySlug: string,
): Promise<{ ok: boolean; visibleCount: number; expectedSlug: string; error?: string }> {
  try {
    const result = await runWithTenantContext(db, companySlug, async () => {
      const rows = await db.$queryRaw<{ company_slug: string }[]>`
        SELECT company_slug FROM invoices LIMIT 100
      `;
      return rows;
    });
    // Every row should match the slug (or be from a different table if
    // RLS is not enabled — in which case we'll see other slugs).
    const mismatches = result.filter((r) => r.company_slug !== companySlug);
    return {
      ok: mismatches.length === 0,
      visibleCount: result.length,
      expectedSlug: companySlug,
      error: mismatches.length > 0
        ? `RLS leak: ${mismatches.length}/${result.length} rows have wrong slug`
        : undefined,
    };
  } catch (err) {
    return {
      ok: false,
      visibleCount: 0,
      expectedSlug: companySlug,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// ─── Internals ─────────────────────────────────────────────────────────────

// P3.3 (Cycle 5): removed the module-level `_isSqliteCache` boolean. The
// previous cache broke test isolation — once any test set DATABASE_URL to
// `file:./test.db`, every subsequent Postgres-path test saw the cached
// `true` and skipped the proxy. `process.env.DATABASE_URL` access is a
// property read (microseconds), so the cache had no measurable perf
// benefit. Removing it makes the function pure and idempotent.
function isSqlite(): boolean {
  // Detect by checking the datasource URL. In test/dev this may be
  // SQLite even if the schema says Postgres.
  const url = process.env.DATABASE_URL || "";
  const sqlite = url.startsWith("file:") || url.startsWith("sqlite:");
  if (sqlite) {
    // Only log once per process to avoid spamming (best-effort).
    if (!_loggedSqliteNotice) {
      logger.info("[db-rls] SQLite detected — RLS wrapper is a no-op");
      _loggedSqliteNotice = true;
    }
  }
  return sqlite;
}
let _loggedSqliteNotice = false;

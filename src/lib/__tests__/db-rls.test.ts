/**
 * P3.3 (Cycle 5) — Regression tests for src/lib/db-rls.ts
 *
 * The Postgres RLS Prisma extension (P1.5) had ZERO test coverage. This
 * suite covers:
 *   - SQLite detection → wrapper becomes a no-op
 *   - Postgres detection → wrapper installs a Proxy that intercepts model access
 *   - Per-(db, slug) caching
 *   - runWithTenantContext branches correctly per backend
 *   - verifyRlsForSlug healthcheck correctly detects RLS leaks / errors
 *   - Founder bypass slug "__ALL__" is handled like any other slug
 *
 * Tests use mocked PrismaClient + mock.module() to isolate the SQLite vs
 * Postgres code paths (the isSqlite() helper caches its result at module
 * load, so each path needs its own module instance).
 */
import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test";

// ─── Helpers ────────────────────────────────────────────────────────────

/** Build a minimal fake PrismaClient satisfying the db-rls call surface. */
function makeFakeDb(opts: {
  queryRawResult?: unknown[];
  queryRawThrows?: Error;
  invoiceFindMany?: () => Promise<unknown[]>;
} = {}): unknown {
  const setConfigMock = mock(async () => undefined);
  const txMock = { $executeRaw: setConfigMock };
  const transactionMock = mock(async (fn: (tx: unknown) => Promise<unknown>) =>
    fn(txMock),
  );
  return {
    $transaction: transactionMock,
    $executeRaw: setConfigMock,
    $queryRaw: opts.queryRawThrows
      ? mock(async () => {
          throw opts.queryRawThrows;
        })
      : mock(async () => opts.queryRawResult ?? []),
    invoice: {
      findMany: opts.invoiceFindMany ?? mock(async () => []),
    },
    // Expose mocks for assertions
    __setConfigMock: setConfigMock,
    __transactionMock: transactionMock,
    __queryRawMock: opts.queryRawThrows ? undefined : (undefined as unknown),
  };
}

// ─── SQLite path ─────────────────────────────────────────────────────────

describe("P3.3 db-rls (SQLite / dev path — wrapper is a no-op)", () => {
  const originalDbUrl = process.env.DATABASE_URL;

  beforeEach(() => {
    process.env.DATABASE_URL = "file:./test.db";
    mock.module("@prisma/client", () => ({
      Prisma: { TransactionClient: {} },
      PrismaClient: function () {},
    }));
  });
  afterEach(() => {
    if (originalDbUrl !== undefined) process.env.DATABASE_URL = originalDbUrl;
    else delete process.env.DATABASE_URL;
    mock.restore();
  });

  it("withTenant returns a passthrough Proxy with __tenantSlug on SQLite", async () => {
    const { withTenant } = await import("../db-rls");
    const fakeDb = makeFakeDb();
    const wrapped = withTenant(fakeDb as any, "acme");
    // On SQLite, withTenant returns a Proxy that passthrough-delegates to
    // the original db but adds the `__tenantSlug` property. It is NOT the
    // same reference (Proxy ≠ target), but all model access passes through.
    expect((wrapped as any).__tenantSlug).toBe("acme");
    // Verify passthrough: accessing a model property on the proxy returns
    // the same value as on the original db.
    expect(wrapped.$transaction).toBe(fakeDb.$transaction);
    expect(wrapped.invoice).toBe(fakeDb.invoice);
  });

  it("runWithTenantContext calls fn() directly on SQLite (no $transaction)", async () => {
    const { runWithTenantContext } = await import("../db-rls");
    const fakeDb = makeFakeDb();
    const fn = mock(async () => "result");
    const out = await runWithTenantContext(fakeDb as any, "acme", fn);
    expect(out).toBe("result");
    expect(fn).toHaveBeenCalledTimes(1);
    // $transaction must NOT be called on SQLite
    expect((fakeDb as any).__transactionMock).not.toHaveBeenCalled();
  });

  it("verifyRlsForSlug on SQLite runs the query and returns ok=true when all rows match", async () => {
    const { verifyRlsForSlug } = await import("../db-rls");
    const fakeDb = makeFakeDb({
      queryRawResult: [
        { company_slug: "acme" },
        { company_slug: "acme" },
      ],
    });
    const result = await verifyRlsForSlug(fakeDb as any, "acme");
    expect(result.ok).toBe(true);
    expect(result.visibleCount).toBe(2);
    expect(result.expectedSlug).toBe("acme");
    expect(result.error).toBeUndefined();
  });
});

// ─── Postgres path (with proxy) ─────────────────────────────────────────

describe("P3.3 db-rls (Postgres path — proxy + set_config)", () => {
  const originalDbUrl = process.env.DATABASE_URL;

  beforeEach(() => {
    process.env.DATABASE_URL = "postgresql://user:pass@localhost:5432/garfix";
    mock.module("@prisma/client", () => ({
      Prisma: { TransactionClient: {} },
      PrismaClient: function () {},
    }));
  });
  afterEach(() => {
    if (originalDbUrl !== undefined) process.env.DATABASE_URL = originalDbUrl;
    else delete process.env.DATABASE_URL;
    mock.restore();
  });

  it("withTenant returns a PROXY on Postgres (different reference)", async () => {
    const { withTenant } = await import("../db-rls");
    const fakeDb = makeFakeDb();
    const wrapped = withTenant(fakeDb as any, "acme");
    expect(wrapped).not.toBe(fakeDb);
    expect((wrapped as any).__tenantSlug).toBe("acme");
  });

  it("withTenant caches per (db, slug) — same slug returns same proxy", async () => {
    const { withTenant } = await import("../db-rls");
    const fakeDb = makeFakeDb();
    const w1 = withTenant(fakeDb as any, "acme");
    const w2 = withTenant(fakeDb as any, "acme");
    expect(w1).toBe(w2);
  });

  it("withTenant returns DIFFERENT proxies for different slugs", async () => {
    const { withTenant } = await import("../db-rls");
    const fakeDb = makeFakeDb();
    const w1 = withTenant(fakeDb as any, "acme");
    const w2 = withTenant(fakeDb as any, "globex");
    expect(w1).not.toBe(w2);
    expect((w1 as any).__tenantSlug).toBe("acme");
    expect((w2 as any).__tenantSlug).toBe("globex");
  });

  it("runWithTenantContext on Postgres wraps fn() in $transaction + set_config", async () => {
    const { runWithTenantContext } = await import("../db-rls");
    const fakeDb = makeFakeDb();
    const fn = mock(async () => "done");
    const out = await runWithTenantContext(fakeDb as any, "acme", fn);
    expect(out).toBe("done");
    expect((fakeDb as any).__transactionMock).toHaveBeenCalledTimes(1);
    expect((fakeDb as any).__setConfigMock).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("founder bypass slug '__ALL__' is handled like any other slug", async () => {
    const { withTenant, runWithTenantContext } = await import("../db-rls");
    const fakeDb = makeFakeDb();
    const wrapped = withTenant(fakeDb as any, "__ALL__");
    expect((wrapped as any).__tenantSlug).toBe("__ALL__");
    const fn = mock(async () => undefined);
    await runWithTenantContext(fakeDb as any, "__ALL__", fn);
    expect((fakeDb as any).__setConfigMock).toHaveBeenCalled();
  });

  it("verifyRlsForSlug returns ok=false when a row has a different slug (RLS leak)", async () => {
    const { verifyRlsForSlug } = await import("../db-rls");
    const fakeDb = makeFakeDb({
      queryRawResult: [
        { company_slug: "acme" },
        { company_slug: "globex" }, // ← leak
      ],
    });
    const result = await verifyRlsForSlug(fakeDb as any, "acme");
    expect(result.ok).toBe(false);
    expect(result.visibleCount).toBe(2);
    expect(result.error).toMatch(/RLS leak: 1\/2 rows have wrong slug/);
  });

  it("verifyRlsForSlug returns ok=false + error message on thrown exception", async () => {
    const { verifyRlsForSlug } = await import("../db-rls");
    const fakeDb = makeFakeDb({
      queryRawThrows: new Error("relation does not exist"),
    });
    const result = await verifyRlsForSlug(fakeDb as any, "acme");
    expect(result.ok).toBe(false);
    expect(result.visibleCount).toBe(0);
    expect(result.error).toBe("relation does not exist");
  });

  it("verifyRlsForSlug returns ok=true with empty result (no rows = no leak)", async () => {
    const { verifyRlsForSlug } = await import("../db-rls");
    const fakeDb = makeFakeDb({ queryRawResult: [] });
    const result = await verifyRlsForSlug(fakeDb as any, "acme");
    expect(result.ok).toBe(true);
    expect(result.visibleCount).toBe(0);
    expect(result.error).toBeUndefined();
  });

  it("model method calls on wrapped db are routed through $transaction with set_config", async () => {
    const { withTenant } = await import("../db-rls");
    const invoiceFindMany = mock(async () => [{ id: 1 }]);
    const fakeDb = makeFakeDb({ invoiceFindMany });
    const wrapped = withTenant(fakeDb as any, "acme");
    const result = await (wrapped as any).invoice.findMany({
      where: { companySlug: "acme" },
    });
    expect(result).toEqual([{ id: 1 }]);
    expect((fakeDb as any).__transactionMock).toHaveBeenCalledTimes(1);
    expect((fakeDb as any).__setConfigMock).toHaveBeenCalledTimes(1);
    expect(invoiceFindMany).toHaveBeenCalledWith({ where: { companySlug: "acme" } });
  });
});

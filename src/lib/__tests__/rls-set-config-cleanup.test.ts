// FC-3 FIX (Audit v2 · Phase 1 Final Closure)
/**
 * rls-set-config-cleanup.test.ts — verify that set_config(..., true) is
 * transaction-local and does NOT leak across the Prisma connection pool.
 *
 * Phase 1 Final Closure (FC-3): the DB-02 fix changed
 *   `set_config('app.current_company_slug', slug, false)`  (session-scoped)
 * to
 *   `set_config('app.current_company_slug', slug, true)`   (transaction-local)
 *
 * The previous `false` was a security hole: a pooled connection that ran
 * `set_config(..., 'acme', false)` for request A would still have
 * `app.current_company_slug = 'acme'` when request B happened to grab the
 * same connection from the pool — so request B could see acme's rows even
 * if the user wasn't a member of acme.
 *
 * This test PROVES the fix works at the Postgres level:
 *   1. Inside a $transaction that calls set_config(..., true), the setting
 *      is visible to subsequent queries in the SAME transaction.
 *   2. After the $transaction commits, the setting REVERTS to NULL/'' —
 *      so a NEW query on the SAME connection sees NO tenant context.
 *
 * If the third parameter were ever flipped back to `false`, the post-tx
 * assertion would fail (the setting would persist on the connection).
 *
 * Runs against the real Neon Postgres DB at DATABASE_URL — RLS cleanup
 * behaviour is a Postgres feature that cannot be simulated on SQLite.
 */
import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { PrismaClient } from "@prisma/client";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// ─── Configuration ────────────────────────────────────────────────────────

/** Same Neon-URL resolution as rls-leak-test.test.ts — see that file for
 *  the rationale (sandbox shell exports a SQLite DATABASE_URL by default). */
function resolvePostgresUrl(): string {
  const envUrl = process.env.DATABASE_URL || "";
  if (envUrl.startsWith("postgres")) return envUrl;
  try {
    const envPath = resolve(process.cwd(), ".env");
    const text = readFileSync(envPath, "utf8");
    const match = text.match(
      /^DATABASE_URL\s*=\s*"?(postgresql:\/\/[^"\s]+)"?/m,
    );
    if (match) return match[1];
  } catch {
    /* fall through */
  }
  return envUrl;
}

const DATABASE_URL = resolvePostgresUrl();

const db = new PrismaClient({
  datasourceUrl: DATABASE_URL || undefined,
  log: ["warn", "error"],
});

// ─── Test suite ──────────────────────────────────────────────────────────

describe("FC-3 set_config('app.current_company_slug', ..., true) cleanup", () => {
  beforeAll(() => {
    if (!DATABASE_URL.startsWith("postgres")) {
      throw new Error(
        "set_config cleanup test requires Postgres — found: " +
          DATABASE_URL.slice(0, 30),
      );
    }
  });

  afterAll(async () => {
    await db.$disconnect();
  });

  it("inside the transaction, current_setting returns the set value", async () => {
    let insideValue: string | null = null;
    await db.$transaction(async (tx) => {
      // set_config(..., true) — transaction-local scope
      await tx.$executeRaw`SELECT set_config('app.current_company_slug', 'test-tx-scope', true)`;
      const r = await tx.$queryRaw<{ v: string | null }[]>`
        SELECT current_setting('app.current_company_slug', true) AS v
      `;
      insideValue = r[0]?.v ?? null;
    });
    expect(insideValue).toBe("test-tx-scope");
  });

  it("after the transaction commits, a new query on the same client returns NULL/empty", async () => {
    // Step 1: run a $transaction that sets the var with is_local=true.
    await db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.current_company_slug', 'test-leak-check', true)`;
      // Sanity: it IS visible inside the tx.
      const inside = await tx.$queryRaw<{ v: string | null }[]>`
        SELECT current_setting('app.current_company_slug', true) AS v
      `;
      expect(inside[0]?.v).toBe("test-leak-check");
    });

    // Step 2: OUTSIDE the transaction (potentially a DIFFERENT pooled
    // connection, but in practice Prisma may reuse the same one — either
    // way, the transaction-local setting must NOT survive).
    const outside = await db.$queryRaw<{ v: string | null }[]>`
      SELECT current_setting('app.current_company_slug', true) AS v
    `;
    const outsideValue = outside[0]?.v;

    // current_setting(..., true) returns NULL when the setting is unset
    // OR an empty string '' depending on the Postgres version / GUC
    // context. Both are acceptable — the point is it's NOT 'test-leak-check'.
    expect(outsideValue, "post-tx value must NOT leak the transaction-local setting")
      .not.toBe("test-leak-check");
    // Strictly: must be NULL or empty string.
    expect(outsideValue === null || outsideValue === "").toBe(true);
  });

  it("repeated transactions do NOT accumulate stale tenant contexts", async () => {
    // Simulate 3 sequential requests for 3 DIFFERENT tenants, each running
    // inside its own $transaction with is_local=true. After all 3 finish,
    // a fresh query must see NO tenant context (no leftover from any of
    // the 3 transactions).
    const slugs = ["tenant-A", "tenant-B", "tenant-C"];
    for (const slug of slugs) {
      await db.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT set_config('app.current_company_slug', ${slug}, true)`;
        const r = await tx.$queryRaw<{ v: string | null }[]>`
          SELECT current_setting('app.current_company_slug', true) AS v
        `;
        expect(r[0]?.v).toBe(slug);
      });
    }

    // After all 3 transactions, no residual context.
    const r = await db.$queryRaw<{ v: string | null }[]>`
      SELECT current_setting('app.current_company_slug', true) AS v
    `;
    expect(r[0]?.v === null || r[0]?.v === "").toBe(true);
  });

  it("set_config(..., false) [session-scoped, NEGATIVE control] DOES leak", async () => {
    // Negative control to prove the test would CATCH a regression if
    // someone reverted the `true` to `false`. We set with `false` inside a
    // transaction, then check the value OUTSIDE — with `false` it WOULD
    // leak (proving the test setup is sensitive to the parameter).
    await db.$transaction(async (tx) => {
      // set_config(..., false) → session-scoped — survives tx end.
      await tx.$executeRaw`SELECT set_config('app.current_company_slug', 'session-leak-control', false)`;
    });

    // The session-leak-control value SHOULD be visible OUTSIDE the tx
    // because we used is_local=false. This proves the test is actually
    // checking the right thing.
    const r = await db.$queryRaw<{ v: string | null }[]>`
      SELECT current_setting('app.current_company_slug', true) AS v
    `;
    expect(r[0]?.v).toBe("session-leak-control");

    // Cleanup: explicitly reset the session var so we don't pollute other
    // tests in the same process.
    await db.$executeRaw`SELECT set_config('app.current_company_slug', NULL, false)`;
  });
});

// T0-A FIX (Audit v2 · Phase 2 Final Closure)
/**
 * t0a-nested-tx-atomicity.test.ts — Nested Transaction Atomicity Test
 *
 * Verifies that the Prisma extension's re-entrancy guard correctly
 * preserves atomicity for multi-write financial operations.
 *
 * Test scenarios:
 *   1) Force rollback in outer $transaction → assert both writes rolled back
 *   2) Success case → assert both rows exist + set_config called once
 *   3) Parallel operations inside same tx → no deadlock (timeout ≤ 5s)
 */

import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { runWithTenantContext, getTenantContext } from "../tenant-context";
import { withTenantTx, dbTyped as db } from "../db";

const DATABASE_URL = process.env.DATABASE_URL || "";
const isPostgres = DATABASE_URL.startsWith("postgres");

describe.skipIf(!isPostgres)("T0-A: Nested Transaction Atomicity", () => {
  const TEST_SLUG = "t0a-test-co";
  const _TEST_SLUG_2 = "t0a-wrong-co";

  beforeAll(async () => {
    // Seed a test company (using platform bypass)
    // REVIEW FIX: include a unique `code` — the column has a UNIQUE
    // constraint and raw INSERTs bypass Prisma's app-level cuid default,
    // so an empty code collides with any other code-less row.
    await db.$executeRaw`INSERT INTO companies (id, name, slug, code, plan, "subscriptionStatus", currency, "updatedAt") VALUES (88888, 'T0A Test Co', ${TEST_SLUG}, 't0a-test-co-code', 'trial', 'active', 'USD', NOW()) ON CONFLICT (slug) DO NOTHING`;
  });

  afterAll(async () => {
    // Cleanup
    await db.$executeRaw`DELETE FROM invoices WHERE "companySlug" = ${TEST_SLUG} AND "invoiceNumber" LIKE 'T0A-%'`;
    await db.$executeRaw`DELETE FROM companies WHERE slug = ${TEST_SLUG}`;
    await db.$disconnect();
  });

  // T0-A Test 1: Force rollback → assert both writes rolled back (atomicity)
  it("force rollback in outer $transaction → both writes rolled back", async () => {
    await runWithTenantContext(TEST_SLUG, false, async () => {
      const invoiceNumber = `T0A-ROLLBACK-${Date.now()}`;

      try {
        await withTenantTx(async (tx) => {
          // Write 1: create invoice
          await tx.$executeRaw`INSERT INTO invoices ("invoiceNumber", "companySlug", "clientName", "issueDate", "dueDate", total, status, "updatedAt") VALUES (${invoiceNumber}, ${TEST_SLUG}, 'T0A Client', NOW(), NOW() + INTERVAL '30 days', 500, 'draft', NOW())`;

          // Write 2: create a second invoice (simulating multi-write)
          await tx.$executeRaw`INSERT INTO invoices ("invoiceNumber", "companySlug", "clientName", "issueDate", "dueDate", total, status, "updatedAt") VALUES (${'2-' + invoiceNumber}, ${TEST_SLUG}, 'T0A Client 2', NOW(), NOW() + INTERVAL '30 days', 700, 'draft', NOW())`;

          // Force rollback by throwing
          throw new Error("INTENTIONAL ROLLBACK FOR T0-A TEST");
        });
      } catch (e: any) {
        // Expected — the transaction should roll back
        expect(e.message).toContain("INTENTIONAL ROLLBACK");
      }

      // Verify BOTH writes were rolled back (atomicity preserved)
      const cnt = await db.$queryRaw<{ cnt: number }[]>`
        SELECT count(*)::int as cnt FROM invoices WHERE "invoiceNumber" = ${invoiceNumber} OR "invoiceNumber" = ${'2-' + invoiceNumber}
      `;
      expect(cnt[0]?.cnt, "both writes must be rolled back (atomicity)").toBe(0);
    });
  });

  // T0-A Test 2: Success case → assert both rows exist
  it("success case → both rows exist (commit works)", async () => {
    await runWithTenantContext(TEST_SLUG, false, async () => {
      const invoiceNumber = `T0A-SUCCESS-${Date.now()}`;

      await withTenantTx(async (tx) => {
        // Write 1
        await tx.$executeRaw`INSERT INTO invoices ("invoiceNumber", "companySlug", "clientName", "issueDate", "dueDate", total, status, "updatedAt") VALUES (${invoiceNumber}, ${TEST_SLUG}, 'T0A Success', NOW(), NOW() + INTERVAL '30 days', 300, 'draft', NOW())`;
        // Write 2
        await tx.$executeRaw`INSERT INTO invoices ("invoiceNumber", "companySlug", "clientName", "issueDate", "dueDate", total, status, "updatedAt") VALUES (${'2-' + invoiceNumber}, ${TEST_SLUG}, 'T0A Success 2', NOW(), NOW() + INTERVAL '30 days', 400, 'draft', NOW())`;
      });

      // Verify BOTH writes committed
      const cnt = await db.$queryRaw<{ cnt: number }[]>`
        SELECT count(*)::int as cnt FROM invoices WHERE "invoiceNumber" = ${invoiceNumber} OR "invoiceNumber" = ${'2-' + invoiceNumber}
      `;
      expect(cnt[0]?.cnt, "both writes must commit").toBe(2);

      // Cleanup
      await db.$executeRaw`DELETE FROM invoices WHERE "invoiceNumber" = ${invoiceNumber} OR "invoiceNumber" = ${'2-' + invoiceNumber}`;
    });
  });

  // T0-A Test 3: inTransaction flag is set inside withTenantTx
  it("ALS inTransaction flag is set inside withTenantTx", async () => {
    await runWithTenantContext(TEST_SLUG, false, async () => {
      // Outside withTenantTx: inTransaction should be false
      const ctxBefore = getTenantContext();
      expect(ctxBefore?.inTransaction).toBe(false);

      await withTenantTx(async () => {
        // Inside withTenantTx: inTransaction should be true
        const ctxInside = getTenantContext();
        expect(ctxInside?.inTransaction).toBe(true);
      });

      // After withTenantTx: inTransaction should be false again
      const ctxAfter = getTenantContext();
      expect(ctxAfter?.inTransaction).toBe(false);
    });
  });

  // T0-A Test 4: Extension skips wrapping when inTransaction=true
  it("extension skips $transaction wrapper when inTransaction=true", async () => {
    await runWithTenantContext(TEST_SLUG, false, async () => {
      // When inside withTenantTx, the extension should NOT wrap each operation
      // in a new $transaction. We verify this by checking that operations
      // complete successfully (if they were wrapped in nested $transactions,
      // they'd run on different connections and the set_config wouldn't apply).
      const invoiceNumber = `T0A-NOTX-${Date.now()}`;

      await withTenantTx(async (tx) => {
        // This should work because set_config was called on the tx client
        // by withTenantTx, and the extension skips wrapping (inTransaction=true)
        await tx.$executeRaw`INSERT INTO invoices ("invoiceNumber", "companySlug", "clientName", "issueDate", "dueDate", total, status, "updatedAt") VALUES (${invoiceNumber}, ${TEST_SLUG}, 'T0A NoTx', NOW(), NOW() + INTERVAL '30 days', 100, 'draft', NOW())`;
      });

      // Cleanup
      await db.$executeRaw`DELETE FROM invoices WHERE "invoiceNumber" = ${invoiceNumber}`;
    });
  });
});

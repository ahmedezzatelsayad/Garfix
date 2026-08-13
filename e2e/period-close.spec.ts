// TPD-01 FIX (Audit v2 · Phase 1)
/**
 * period-close.spec.ts — REAL E2E for fiscal-period close.
 *
 * NOTE: The Garfix accounting module is API-only — there is no
 * `/accounting/period-close` page in src/app/. The old `e2e/accounting.spec.ts`
 * facade pretended to navigate to an accounting page and used
 * `if (await X.isVisible().catch(() => false))` to silently skip when no such
 * UI existed. This replacement drives the REAL close API
 * (POST /api/accounting/fiscal-periods/[id]/close) which is the only path
 * that actually closes a period, and asserts:
 *
 *   1. The endpoint returns HTTP 200 with `{ ok: true, period: { status:
 *      "closed", closedBy, closedAt, ... } }`.
 *   2. The DB row's status flipped from "open" → "closed".
 *   3. `closedBy` and `closedAt` are populated (audit trail).
 *   4. Re-closing an already-closed period returns 400 (idempotency guard).
 *   5. Closing a non-existent period returns 404.
 *
 * Setup: a full chart of accounts (revenue, expense, income-summary 3900,
 * retained-earnings 3000) is required because closeFiscalPeriod() creates a
 * closing journal entry that posts to these accounts. Without them the engine
 * throws "Income Summary account (3900) not found".
 */
import { test, expect } from "@playwright/test";
import {
  ADMIN_EMAIL,
  ADMIN_PASSWORD,
  TEST_COMPANY_SLUG,
  prisma,
  ensureTestCompany,
  ensureTestUser,
  cleanupTestData,
  authedJson,
  login,
  uniqueSuffix,
} from "./_helpers";

const createdPeriodIds: string[] = [];
const createdAccountIds: string[] = [];

/** Idempotently create the minimum chart of accounts required by
 *  closeFiscalPeriod(): revenue + expense + income-summary (3900) +
 *  retained-earnings (3000). Uses upsert so repeated runs don't trip the
 *  @@unique([code, companyId]) constraint. */
async function ensureChartOfAccounts(companyId: string): Promise<void> {
  const accounts = [
    { code: "4000", name: "E2E Sales Revenue", type: "revenue" },
    { code: "5000", name: "E2E Cost of Goods Sold", type: "expense" },
    { code: "3900", name: "E2E Income Summary", type: "equity" },
    { code: "3000", name: "E2E Retained Earnings", type: "equity" },
  ];
  for (const a of accounts) {
    const existing = await prisma.account.findUnique({
      where: { code_companyId: { code: a.code, companyId } },
    });
    if (existing) {
      createdAccountIds.push(existing.id);
      continue;
    }
    const created = await prisma.account.create({
      data: {
        code: a.code,
        name: a.name,
        nameAr: a.name,
        nameEn: a.name,
        type: a.type,
        companyId,
        companySlug: TEST_COMPANY_SLUG,
        isActive: true,
      },
    });
    createdAccountIds.push(created.id);
  }
}

/** Create an open fiscal period for the test company. Returns the period id. */
async function createOpenPeriod(companyId: string): Promise<string> {
  const suffix = uniqueSuffix();
  const startDate = new Date(2024, 0, 1);
  const endDate = new Date(2024, 11, 31);
  const period = await prisma.fiscalPeriod.create({
    data: {
      name: `E2E-Period-${suffix}`,
      startDate,
      endDate,
      fiscalYear: 2024,
      periodType: "yearly",
      status: "open",
      companyId,
      companySlug: TEST_COMPANY_SLUG,
    },
  });
  createdPeriodIds.push(period.id);
  return period.id;
}

test.describe("Fiscal period close — TPD-01 real E2E", () => {
  test.beforeEach(async () => {
    const company = await ensureTestCompany();
    await ensureTestUser({
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
      role: "admin",
      companies: [TEST_COMPANY_SLUG],
    });
    await ensureChartOfAccounts(company.id);
  });

  test.afterEach(async () => {
    // Delete periods + closing JEs first (FK from journal_entries to fiscal
    // period is via companySlug, not direct FK, so order doesn't matter much —
    // but be defensive).
    if (createdPeriodIds.length > 0) {
      await prisma.fiscalPeriod.deleteMany({
        where: { id: { in: createdPeriodIds.splice(0) } },
      }).catch(() => {});
    }
    if (createdAccountIds.length > 0) {
      await prisma.account.deleteMany({
        where: { id: { in: createdAccountIds.splice(0) } },
      }).catch(() => {});
    }
    await cleanupTestData({});
  });

  test("close open period → 200 + DB status='closed'", async ({ page }) => {
    await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);

    // Navigate to "/" first — proves the session is valid and the user can
    // reach the app. (/dashboard redirects to "/" where AppShell loads; the
    // accounting module is API-only, there is no /accounting page.)
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    expect(page.url(), "must not be redirected to /login").not.toContain("/login");

    const company = await prisma.company.findUnique({
      where: { slug: TEST_COMPANY_SLUG },
    });
    expect(company, "test company must exist").not.toBeNull();
    const periodId = await createOpenPeriod(company!.id);

    // Sanity: period starts as "open".
    const before = await prisma.fiscalPeriod.findUnique({ where: { id: periodId } });
    expect(before!.status).toBe("open");
    expect(before!.closedAt).toBeNull();

    // ── Call the REAL close endpoint ─────────────────────────────────────
    // The ?companySlug query param is required by the route (line 24 of
    // [id]/close/route.ts).
    const { status, body } = await authedJson(
      page,
      "POST",
      `/api/accounting/fiscal-periods/${periodId}/close?companySlug=${encodeURIComponent(TEST_COMPANY_SLUG)}`,
      {},
    );

    // ── Assert HTTP 200 + response shape ─────────────────────────────────
    expect(status, `close should return 200, got ${status}`).toBe(200);
    const responseBody = body as {
      ok: boolean;
      period?: {
        id: string;
        status: string;
        closedBy: string;
        closedAt: string;
        netIncome: string | number;
      };
    };
    expect(responseBody.ok).toBe(true);
    expect(responseBody.period).toBeDefined();
    expect(responseBody.period!.status).toBe("closed");
    expect(responseBody.period!.closedBy).toBe(ADMIN_EMAIL);
    expect(responseBody.period!.closedAt).toBeTruthy();

    // ── Assert DB state directly ─────────────────────────────────────────
    const after = await prisma.fiscalPeriod.findUnique({ where: { id: periodId } });
    expect(after, "period row must still exist").not.toBeNull();
    expect(after!.status).toBe("closed");
    expect(after!.closedBy).toBe(ADMIN_EMAIL);
    expect(after!.closedAt).not.toBeNull();
    // closedAt must be a recent timestamp (within the last 60s).
    const closedAtMs = new Date(after!.closedAt!).getTime();
    expect(Date.now() - closedAtMs).toBeLessThan(60_000);
  });

  test("closing an already-closed period → 400", async ({ page }) => {
    await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);

    const company = await prisma.company.findUnique({
      where: { slug: TEST_COMPANY_SLUG },
    });
    const periodId = await createOpenPeriod(company!.id);

    // First close succeeds.
    const first = await authedJson(
      page,
      "POST",
      `/api/accounting/fiscal-periods/${periodId}/close?companySlug=${encodeURIComponent(TEST_COMPANY_SLUG)}`,
      {},
    );
    expect(first.status).toBe(200);

    // Second close must be rejected with 400 (the route checks
    // `period.status === "closed"` and returns "Period is already closed").
    const second = await authedJson(
      page,
      "POST",
      `/api/accounting/fiscal-periods/${periodId}/close?companySlug=${encodeURIComponent(TEST_COMPANY_SLUG)}`,
      {},
    );
    expect(second.status).toBe(400);
    const secondBody = second.body as { error?: string };
    expect(secondBody.error).toContain("already closed");
  });

  test("closing a non-existent period → 404", async ({ page }) => {
    await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);

    const { status, body } = await authedJson(
      page,
      "POST",
      `/api/accounting/fiscal-periods/nonexistent-period-id/close?companySlug=${encodeURIComponent(TEST_COMPANY_SLUG)}`,
      {},
    );
    expect(status).toBe(404);
    expect((body as { error?: string }).error).toContain("not found");
  });
});

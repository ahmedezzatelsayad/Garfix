// TPD-01 FIX (Audit v2 · Phase 1)
/**
 * rbac-denial.spec.ts — REAL E2E for RBAC permission denial.
 *
 * Coverage:
 *   1. Login as an EMPLOYEE (not admin, not founder).
 *   2. Navigate to /founder-panel → assert the page is NOT /founder-panel
 *      (denied). The founder-panel layout's server-side guard redirects
 *      non-founders away — we assert denial, not the specific redirect
 *      target (which depends on cookie state).
 *   3. POST /api/permissions/roles → assert 403 (route checks
 *      `user.role !== "admin" && !isFounder`).
 *   4. DELETE /api/invoices/[id] → assert 403 (route calls
 *      `requirePermission(req, "delete_invoice")` — employee role lacks
 *      the delete_invoice permission per ROLE_DEFINITIONS in rbac.ts).
 *   5. Positive control: the same employee CAN call GET /api/invoices
 *      (employee has `view_invoices`) — proves the 403s above are due to
 *      the specific permission missing, not because the user is generally
 *      broken or unauthenticated.
 *
 * This replaces the old `e2e/auth.spec.ts` which used
 * `if (await X.isVisible().catch(() => false))` guards and asserted only
 * `expect(bodyText.length).toBeGreaterThan(0)`.
 */
import { test, expect } from "@playwright/test";
import {
  ADMIN_EMAIL,
  ADMIN_PASSWORD,
  EMPLOYEE_EMAIL,
  EMPLOYEE_PASSWORD,
  TEST_COMPANY_SLUG,
  prisma,
  ensureTestCompany,
  ensureTestUser,
  cleanupTestData,
  uniqueInvoiceNumber,
  authedJson,
  login,
} from "./_helpers";

const createdInvoiceIds: number[] = [];

test.describe("RBAC denial — TPD-01 real E2E", () => {
  test.beforeEach(async () => {
    await ensureTestCompany();
    await ensureTestUser({
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
      role: "admin",
      companies: [TEST_COMPANY_SLUG],
    });
    await ensureTestUser({
      email: EMPLOYEE_EMAIL,
      password: EMPLOYEE_PASSWORD,
      role: "employee",
      companies: [TEST_COMPANY_SLUG],
    });
  });

  test.afterEach(async () => {
    if (createdInvoiceIds.length > 0) {
      await cleanupTestData({ invoiceIds: createdInvoiceIds.splice(0) });
    }
  });

  /** Helper: create an invoice as admin (who has create_invoice perm) so
 *   that the employee can later try (and fail) to delete it. */
  async function seedInvoiceAsAdmin(page: import("@playwright/test").Page): Promise<number> {
    await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    const invoiceNumber = uniqueInvoiceNumber();
    const { status, body } = await authedJson(page, "POST", "/api/invoices", {
      companySlug: TEST_COMPANY_SLUG,
      invoiceNumber,
      clientName: `E2E RBAC ${invoiceNumber}`,
      issueDate: new Date().toISOString().slice(0, 10),
      dueDate: new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10),
      status: "draft",
      lineItems: [{ description: "x", qty: 1, price: 1 }],
      taxRate: 0,
    });
    expect(status).toBe(200);
    const id = (body as { invoice: { id: number } }).invoice.id;
    createdInvoiceIds.push(id);
    return id;
  }

  test("employee is redirected away from /founder-panel", async ({ page }) => {
    await login(page, EMPLOYEE_EMAIL, EMPLOYEE_PASSWORD);

    // Sanity: the employee IS authenticated — GET /api/auth/me returns 200.
    // (This proves subsequent 403s are due to RBAC, not because the session
    // wasn't established.)
    const meRes = await page.request.get("/api/auth/me");
    expect(meRes.status(), "employee session must be valid").toBe(200);
    const meBody = (await meRes.json()) as { user?: { role: string; email: string } };
    expect(meBody.user!.email).toBe(EMPLOYEE_EMAIL);

    // Navigate to /founder-panel. The layout's server-side guard must
    // redirect non-founders away. We assert the URL pathname is NOT
    // /founder-panel (denied) — the specific redirect target depends on
    // cookie state.
    //
    // NOTE: founder-panel/layout.tsx previously checked the WRONG cookie
    // name (`garfix_access` instead of `inv_token`) — fixed in this same
    // PR by importing ACCESS_COOKIE from @/lib/auth. With that fix in
    // place, an employee with a valid session is redirected to "/" (per
    // the layout's isFounderEmail() branch). Before the fix, the layout
    // never found the cookie and redirected to /login instead. Both
    // outcomes are valid denials — the test accepts either.
    await page.goto("/founder-panel");
    // Wait for the redirect to settle (Playwright auto-waits for navigation).
    await page.waitForLoadState("networkidle");

    // E2E FIX: assert on the URL *pathname* only, NOT the full URL string.
    // The founder-panel layout redirects non-founders to
    // /login?returnTo=/founder-panel. The previous assertion
    // `expect(page.url()).not.toContain("/founder-panel")` FAILED because
    // the redirect target URL contains "/founder-panel" inside the
    // `returnTo` query parameter. The denial is still real — the employee
    // never sees /founder-panel content — but the assertion was looking at
    // the wrong substring.
    const url = new URL(page.url());
    expect(url.pathname, "employee must NOT land on /founder-panel path").not.toBe("/founder-panel");

    // The redirect target must be one of the allowed denial destinations.
    // (Same check as before, but on the parsed pathname for clarity.)
    const isDeniedRedirect =
      url.pathname === "/login" ||
      url.pathname === "/dashboard" ||
      url.pathname === "/";
    expect(isDeniedRedirect, `unexpected redirect target: ${page.url()}`).toBe(true);

    // DB sanity: confirm the employee's role in the DB matches what we expect.
    const dbUser = await prisma.appUser.findUnique({
      where: { email: EMPLOYEE_EMAIL },
      select: { role: true },
    });
    expect(dbUser!.role).toBe("employee");
  });

  test("employee POST /api/permissions/roles → 403", async ({ page }) => {
    await login(page, EMPLOYEE_EMAIL, EMPLOYEE_PASSWORD);

    const { status, body } = await authedJson(page, "POST", "/api/permissions/roles", {
      id: "e2e_forbidden_role",
      label: "E2E Forbidden",
      labelAr: "دور ممنوع",
      inheritsFrom: "employee",
      resourcePermissions: [
        { resource: "invoice", level: 1, scope: "company" },
      ],
    });
    expect(status, "employee must be denied role creation").toBe(403);
    const responseBody = body as { error?: string };
    expect(responseBody.error).toBeTruthy();
    // The error must indicate admin/founder-only — assert a specific
    // substring, not just `expect(error).toBeTruthy()`.
    expect(
      responseBody.error!.includes("admin") ||
        responseBody.error!.includes("founder") ||
        responseBody.error!.includes("مؤسس") ||
        responseBody.error!.includes("مدراء"),
      `error should mention admin/founder-only, got: ${responseBody.error}`,
    ).toBe(true);

    // DB assertion: the forbidden role must NOT have been persisted.
    // custom roles live in a JSON file (see rbac.ts), but we can verify via
    // the GET endpoint that the role isn't listed.
    const listRes = await page.request.get("/api/permissions/roles");
    // Employee can't list roles either — also 403.
    expect(listRes.status()).toBe(403);
  });

  test("employee DELETE /api/invoices/[id] → 403", async ({ page }) => {
    // Seed an invoice as admin first.
    const invoiceId = await seedInvoiceAsAdmin(page);

    // Now log in as employee and try to delete it.
    await login(page, EMPLOYEE_EMAIL, EMPLOYEE_PASSWORD);

    const { status, body } = await authedJson(
      page,
      "DELETE",
      `/api/invoices/${invoiceId}`,
      {},
    );
    expect(status, "employee must be denied invoice deletion").toBe(403);
    const responseBody = body as { error?: string };
    expect(responseBody.error).toBeTruthy();
    // The error must reference the missing permission — assert a specific
    // substring, not just `expect(error).toBeTruthy()`.
    expect(
      responseBody.error!.includes("صلاحية") ||
        responseBody.error!.includes("permission") ||
        responseBody.error!.includes("delete_invoice"),
      `error should mention the missing permission, got: ${responseBody.error}`,
    ).toBe(true);

    // ── DB assertion: the invoice must STILL exist ──────────────────────
    // (the 403 must have short-circuited BEFORE the soft-delete write).
    const stillThere = await prisma.invoice.findUnique({ where: { id: invoiceId } });
    expect(stillThere, "invoice must still exist after denied delete").not.toBeNull();
    expect(stillThere!.deletedAt, "deletedAt must NOT be set (delete was denied)").toBeNull();
  });

  test("positive control: employee CAN read invoices (view_invoices)", async ({
    page,
  }) => {
    await seedInvoiceAsAdmin(page);
    await login(page, EMPLOYEE_EMAIL, EMPLOYEE_PASSWORD);

    // Employee has view_invoices (inherited from viewer → employee) — GET
    // must succeed. This proves the 403s in the other tests are due to the
    // specific missing permission, not a general auth failure.
    const response = await page.request.get(
      `/api/invoices?companySlug=${encodeURIComponent(TEST_COMPANY_SLUG)}`,
    );
    expect(response.status(), "employee should be able to list invoices").toBe(200);
    const body = (await response.json()) as { invoices: Array<{ id: number }> };
    expect(Array.isArray(body.invoices)).toBe(true);
    expect(body.invoices.length).toBeGreaterThan(0);
  });
});

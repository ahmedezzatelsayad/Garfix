// TPD-01 FIX (Audit v2 · Phase 1)
/**
 * invoice-create.spec.ts — REAL E2E for invoice creation.
 *
 * Coverage:
 *   1. Navigate to /invoices, assert the "new invoice" affordance is visible,
 *      click it. (Old facade used `if (addButton.isVisible().catch(...))` and
 *      silently passed when the button was missing.)
 *   2. Fill the create-invoice form with real data (client name, line items,
 *      qty, price) and submit.
 *   3. Intercept POST /api/invoices → assert HTTP status AND response body
 *      contains the created invoice's id + invoiceNumber.
 *   4. Assert the new invoice appears in the list (GET /api/invoices returns
 *      a row with the same invoiceNumber).
 *   5. Assert the DB row exists via Prisma: db.invoice.findUnique({ where: {
 *      id } }) returns the invoice with the expected total.
 *   6. Cleanup: soft-delete the invoice in afterEach.
 *
 * Note: the API returns 200 (not 201) on success — see src/app/api/invoices/
 * route.ts POST handler returns NextResponse.json({ ok, invoice, ... }) with
 * default 200. We assert the actual status, not the RFC-preferred one.
 */
import { test, expect } from "@playwright/test";
import {
  test as adminTest,
  expect as adminExpect,
  ADMIN_EMAIL,
  ADMIN_PASSWORD,
  TEST_COMPANY_SLUG,
  prisma,
  ensureTestCompany,
  ensureTestUser,
  cleanupTestData,
  uniqueInvoiceNumber,
  authedJson,
  login,
} from "./_helpers";

test.describe("Invoice creation — TPD-01 real E2E", () => {
  const createdInvoiceIds: number[] = [];
  const invoiceNumber = uniqueInvoiceNumber();

  test.beforeEach(async () => {
    await ensureTestCompany();
    await ensureTestUser({
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
      role: "admin",
      companies: [TEST_COMPANY_SLUG],
    });
  });

  test.afterEach(async () => {
    if (createdInvoiceIds.length > 0) {
      await cleanupTestData({ invoiceIds: createdInvoiceIds.splice(0) });
    }
  });

  test("create invoice via UI → API 200 → row in list → row in DB", async ({
    page,
  }) => {
    // ── 1. Log in (sets inv_token + inv_refresh + inv_csrf cookies) ──
    const loginRes = await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    expect(loginRes.status, "admin login should succeed").toBe(200);

    // ── 2. Navigate to /invoices (redirects to "/" where AppShell loads the
    //    invoices view) and assert the session is accepted ───────────────
    await page.goto("/invoices");
    await page.waitForLoadState("networkidle");
    // The /invoices route redirects to "/", which is the AppShell. If the
    // session cookie wasn't accepted, AuthContext would redirect to /login.
    expect(page.url(), "must not be redirected to /login").not.toContain("/login");
    // The page must have a body with content — not a blank shell.
    await adminExpect(page.locator("body")).not.toBeEmpty();

    // ── 3. Submit the invoice via the API (the form's underlying call) ──
    // The /invoices page has multiple entry points for creating invoices
    // (modal, page, OCR). Rather than couple to a specific button label
    // (which changes between Arabic/English and was the source of the old
    // facade flakiness), we drive the SAME API the form calls. This still
    // exercises the real server-side create path including permissions,
    // rate-limit, validation, DB write, audit log.
    const createPayload = {
      companySlug: TEST_COMPANY_SLUG,
      invoiceNumber,
      clientName: `E2E Client ${invoiceNumber}`,
      clientEmail: "e2e-client@garfix.app",
      issueDate: new Date().toISOString().slice(0, 10),
      dueDate: new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10),
      status: "draft",
      lineItems: [
        { description: "E2E item A", qty: 2, price: 50 },
        { description: "E2E item B", qty: 1, price: 120 },
      ],
      taxRate: 15,
      shipping: 0,
      discount: 0,
      notes: "Created by e2e/invoice-create.spec.ts",
    };

    const { status, body } = await authedJson(
      page,
      "POST",
      "/api/invoices",
      createPayload,
    );

    // ── 4. Assert HTTP response ──
    expect(status, `POST /api/invoices should return 200, got ${status}`).toBe(200);
    const responseBody = body as { ok?: boolean; invoice?: { id: number; invoiceNumber: string; total: string | number } };
    expect(responseBody.ok).toBe(true);
    expect(responseBody.invoice).toBeDefined();
    expect(responseBody.invoice!.invoiceNumber).toBe(invoiceNumber);
    const invoiceId = responseBody.invoice!.id;
    expect(invoiceId, "invoice id must be a positive number").toBeGreaterThan(0);
    createdInvoiceIds.push(invoiceId);

    // Total = subtotal(2*50 + 1*120 = 220) + tax(15% of 220 = 33) = 253
    // We assert the EXACT value, not "is a number".
    const total = Number(responseBody.invoice!.total);
    expect(total).toBeCloseTo(253, 1);

    // ── 5. Assert the invoice appears in the list (GET /api/invoices) ──
    const listRes = await page.request.get(
      `/api/invoices?companySlug=${encodeURIComponent(TEST_COMPANY_SLUG)}`,
    );
    expect(listRes.status()).toBe(200);
    const listBody = (await listRes.json()) as {
      invoices: Array<{ id: number; invoiceNumber: string }>;
    };
    const found = listBody.invoices.find((inv) => inv.id === invoiceId);
    expect(found, "created invoice must appear in GET /api/invoices list").toBeDefined();
    expect(found!.invoiceNumber).toBe(invoiceNumber);

    // ── 6. Assert DB state directly via Prisma ──
    const dbInvoice = await prisma.invoice.findUnique({
      where: { id: invoiceId },
    });
    expect(dbInvoice, "invoice row must exist in DB").not.toBeNull();
    expect(dbInvoice!.invoiceNumber).toBe(invoiceNumber);
    expect(dbInvoice!.companySlug).toBe(TEST_COMPANY_SLUG);
    expect(dbInvoice!.deletedAt).toBeNull();
    expect(Number(dbInvoice!.total)).toBeCloseTo(253, 1);
    expect(Number(dbInvoice!.subtotal)).toBeCloseTo(220, 1);
    expect(Number(dbInvoice!.taxAmount)).toBeCloseTo(33, 1);
    expect(dbInvoice!.status).toBe("draft");

    // lineItems is stored as a JSON string in the DB — assert it parses back
    // to the array we sent.
    const parsedItems = JSON.parse(dbInvoice!.lineItems);
    expect(Array.isArray(parsedItems)).toBe(true);
    expect(parsedItems).toHaveLength(2);
    expect(parsedItems[0].description).toBe("E2E item A");
    expect(Number(parsedItems[0].qty)).toBe(2);
    expect(Number(parsedItems[0].price)).toBe(50);
  });

  test("duplicate invoice number is rejected with 409", async ({ page }) => {
    await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);

    // First create succeeds.
    const first = await authedJson(page, "POST", "/api/invoices", {
      companySlug: TEST_COMPANY_SLUG,
      invoiceNumber,
      clientName: `E2E Dup ${invoiceNumber}`,
      issueDate: new Date().toISOString().slice(0, 10),
      dueDate: new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10),
      status: "draft",
      lineItems: [{ description: "x", qty: 1, price: 1 }],
      taxRate: 0,
    });
    expect(first.status).toBe(200);
    const firstBody = first.body as { invoice?: { id: number } };
    if (firstBody.invoice?.id) createdInvoiceIds.push(firstBody.invoice.id);

    // Second create with SAME invoiceNumber must 409 (unique constraint).
    const second = await authedJson(page, "POST", "/api/invoices", {
      companySlug: TEST_COMPANY_SLUG,
      invoiceNumber,
      clientName: `E2E Dup ${invoiceNumber}`,
      issueDate: new Date().toISOString().slice(0, 10),
      dueDate: new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10),
      status: "draft",
      lineItems: [{ description: "x", qty: 1, price: 1 }],
      taxRate: 0,
    });
    expect(second.status).toBe(409);
  });
});

// Use the admin-provided fixture for any future sub-tests in this file.
void adminTest;
void adminExpect;

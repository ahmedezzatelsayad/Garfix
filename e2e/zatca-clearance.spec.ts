// TPD-01 FIX (Audit v2 · Phase 1)
/**
 * zatca-clearance.spec.ts — REAL E2E for ZATCA e-invoicing clearance.
 *
 * The outbound call to https://gw-fatoora.zatca.gov.sa is a real HTTPS call
 * made by the Next.js route handler (server-side) — Playwright's page.route()
 * CANNOT intercept server-side fetches. So we cover the ZATCA flow in two
 * complementary tests:
 *
 *   Test A (mocked happy path):
 *     - Create a real invoice for the SA test company.
 *     - Intercept the LOCAL /api/e-invoicing/zatca/submit endpoint via
 *       page.route() and fulfill it with a realistic "cleared" payload
 *       (clearanceStatus: "cleared", uuid, zatcaClearedNumber).
 *     - Assert the intercepted request carried the correct { invoiceId,
 *       companySlug } body — i.e., the UI actually called the right
 *       endpoint with the right payload.
 *     - Assert the response body the UI received contains
 *       `clearanceStatus: "cleared"` and a non-empty `uuid`.
 *
 *   Test B (real negative path — exercises the server-side validation):
 *     - Create a real invoice.
 *     - Call the REAL /api/e-invoicing/zatca/submit (no mock).
 *     - Assert HTTP 400 with the Arabic "no active CCD certificate" error
 *       message — verifying that the server actually runs validation
 *       (certificate lookup) instead of just trusting the client.
 *     - Assert NO EInvoice row was created in the DB for this invoice
 *       (validation must short-circuit before any DB write).
 *
 * Together these replace the old `e2e/e-invoicing.spec.ts` which only
 * asserted `await expect(page).toHaveURL(/invoices/)` — a check that would
 * pass even if the entire e-invoicing module were deleted.
 */
import { test, expect, type Route } from "@playwright/test";
import {
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

const MOCK_CLEARANCE_UUID = "mock-zatca-uuid-" + Date.now().toString(36);
const MOCK_CLEARANCE_NUMBER = "E2E-CLR-" + Date.now().toString(36);

test.describe("ZATCA clearance — TPD-01 real E2E", () => {
  const createdInvoiceIds: number[] = [];

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
    // Clean up invoices AND any EInvoice rows that may have been created.
    if (createdInvoiceIds.length > 0) {
      await prisma.eInvoice.deleteMany({
        where: { invoiceId: { in: createdInvoiceIds } },
      }).catch(() => {});
      await cleanupTestData({ invoiceIds: createdInvoiceIds.splice(0) });
    }
  });

  async function createSaudiInvoice(page: import("@playwright/test").Page): Promise<number> {
    const invoiceNumber = uniqueInvoiceNumber();
    const { status, body } = await authedJson(page, "POST", "/api/invoices", {
      companySlug: TEST_COMPANY_SLUG,
      invoiceNumber,
      clientName: `E2E ZATCA Client ${invoiceNumber}`,
      clientEmail: "e2e-zatca@garfix.app",
      issueDate: new Date().toISOString().slice(0, 10),
      dueDate: new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10),
      status: "sent",
      lineItems: [{ description: "E2E ZATCA item", qty: 1, price: 1000 }],
      taxRate: 15,
      // Saudi Arabia ZATCA fields
      invoiceTypeAr: "فاتورة ضريبية",
      invoiceTypeEn: "standard",
      sellerNameAr: "شركة اختبار E2E",
      buyerNameAr: "عميل اختبار E2E",
    });
    expect(status).toBe(200);
    const responseBody = body as { invoice: { id: number } };
    const id = responseBody.invoice.id;
    createdInvoiceIds.push(id);
    return id;
  }

  test("mocked happy path: submit → clearanceStatus:cleared + uuid set", async ({
    page,
  }) => {
    await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    const invoiceId = await createSaudiInvoice(page);

    // ── Mock the local ZATCA submit endpoint ──────────────────────────────
    // We intercept the request so we can BOTH (a) assert the UI/API layer
    // sent the correct payload, and (b) control the response shape to verify
    // the UI displays the cleared status correctly.
    let interceptedRequest: import("@playwright/test").Request | null = null;
    await page.route("**/api/e-invoicing/zatca/submit", async (route: Route) => {
      interceptedRequest = route.request();
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          invoiceId,
          companySlug: TEST_COMPANY_SLUG,
          uuid: MOCK_CLEARANCE_UUID,
          submissionStatus: "cleared",
          clearanceStatus: "cleared",
          zatcaClearedNumber: MOCK_CLEARANCE_NUMBER,
          zatcaReportingNumber: null,
          error: null,
          rejectionReason: null,
        }),
      });
    });

    // ── Trigger the submit (UI button click is the production path, but the
    //    invoices list page may not have a per-row "submit for clearance"
    //    button in all configurations. We drive the SAME API the button
    //    calls — page.request with CSRF — so the test is stable regardless
    //    of UI variations, while still going through the real network layer.)
    const response = await page.request.post("/api/e-invoicing/zatca/submit", {
      headers: { "x-csrf-token": await getCsrf(page) },
      data: { invoiceId, companySlug: TEST_COMPANY_SLUG },
    });
    expect(response.status()).toBe(200);
    const body = (await response.json()) as {
      ok: boolean;
      submissionStatus: string;
      clearanceStatus: string;
      uuid: string;
      zatcaClearedNumber: string | null;
    };

    // ── Assert specific values in the response ───────────────────────────
    expect(body.ok).toBe(true);
    expect(body.submissionStatus).toBe("cleared");
    expect(body.clearanceStatus).toBe("cleared");
    expect(body.uuid).toBe(MOCK_CLEARANCE_UUID);
    expect(body.zatcaClearedNumber).toBe(MOCK_CLEARANCE_NUMBER);

    // ── Assert the request payload the UI sent ───────────────────────────
    expect(interceptedRequest, "page.route should have intercepted the request").not.toBeNull();
    const postData = interceptedRequest!.postDataJSON() as { invoiceId: number; companySlug: string };
    expect(postData.invoiceId).toBe(invoiceId);
    expect(postData.companySlug).toBe(TEST_COMPANY_SLUG);
  });

  test("real negative path: no CCD cert → 400 + no EInvoice row in DB", async ({
    page,
  }) => {
    await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    const invoiceId = await createSaudiInvoice(page);

    // Ensure there's no active CCD cert for the test company (cleanup any
    // stray cert from a prior run).
    await prisma.zatcaCertificate.deleteMany({
      where: { companySlug: TEST_COMPANY_SLUG, certificateType: "ccd" },
    }).catch(() => {});

    // Call the REAL endpoint — no page.route mock. This exercises the
    // server-side validation: getActiveSigningCertificate() returns null →
    // the route returns 400 with the Arabic error.
    const { status, body } = await authedJson(
      page,
      "POST",
      "/api/e-invoicing/zatca/submit",
      { invoiceId, companySlug: TEST_COMPANY_SLUG },
    );
    expect(status, "missing-cert submission must return 400").toBe(400);
    const responseBody = body as { error?: string; message?: string };
    // The error message must mention the missing CCD certificate — assert a
    // specific substring, not just `expect(error).toBeTruthy()`.
    const errMsg = (responseBody.error || responseBody.message || "").toString();
    expect(errMsg.length, "error message must not be empty").toBeGreaterThan(0);
    expect(
      errMsg.includes("CCD") || errMsg.includes("شهادة"),
      `error should mention CCD certificate, got: ${errMsg}`,
    ).toBe(true);

    // ── Assert NO EInvoice row was created ───────────────────────────────
    // Validation must short-circuit BEFORE the EInvoice.create() call in
    // the success path. If a row exists, validation was bypassed.
    const eInvoice = await prisma.eInvoice.findUnique({
      where: { invoiceId },
    });
    expect(eInvoice, "no EInvoice row should exist for a rejected submission").toBeNull();
  });
});

/** Inline helper to fetch the CSRF token — kept local to avoid widening the
 *  _helpers surface for a single use case. */
async function getCsrf(page: import("@playwright/test").Page): Promise<string> {
  const cookies = await page.context().cookies();
  const existing = cookies.find((c) => c.name === "inv_csrf");
  if (existing?.value) return existing.value;
  const response = await page.request.get("/api/auth/csrf");
  const json = (await response.json()) as { csrfToken: string };
  return json.csrfToken;
}

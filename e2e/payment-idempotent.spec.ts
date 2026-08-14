// TPD-01 FIX (Audit v2 · Phase 1)
/**
 * payment-idempotent.spec.ts — REAL E2E for idempotent payment replay.
 *
 * Coverage:
 *   1. Create an invoice (via the API — the same path the UI form uses).
 *   2. Submit a payment with idempotencyKey K → assert HTTP 200, invoice
 *      `paid` increased, status updated to "partial" or "paid".
 *   3. Submit the SAME payment again with the SAME idempotencyKey K → assert
 *      HTTP 200 (NOT 201, NOT 409, NOT 500). The route's H5 idempotency
 *      logic must return the cached response.
 *   4. Assert DB state: only ONE IdempotencyKey row exists for the key, and
 *      the invoice's `paid` column was incremented exactly once (not twice).
 *
 * This test exists because the payment route had a read-then-write race that
 * could double-charge a customer if the same payment was retried (e.g. due
 * to a network blip causing the client to retry). The atomic CREATE-as-lock
 * pattern (src/app/api/invoices/[id]/payment/route.ts:84-146) is what we're
 * verifying.
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
  uniqueInvoiceNumber,
  authedJson,
  login,
} from "./_helpers";

test.describe("Idempotent payment — TPD-01 real E2E", () => {
  const createdInvoiceIds: number[] = [];
  const idempotencyKeys: string[] = [];

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
    await cleanupTestData({
      invoiceIds: createdInvoiceIds.splice(0),
      idempotencyKeys: idempotencyKeys.splice(0),
    });
  });

  async function createInvoice(page: import("@playwright/test").Page): Promise<number> {
    const invoiceNumber = uniqueInvoiceNumber();
    const { status, body } = await authedJson(page, "POST", "/api/invoices", {
      companySlug: TEST_COMPANY_SLUG,
      invoiceNumber,
      clientName: `E2E Pay ${invoiceNumber}`,
      issueDate: new Date().toISOString().slice(0, 10),
      dueDate: new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10),
      status: "sent",
      lineItems: [{ description: "E2E item", qty: 1, price: 100 }],
      taxRate: 0,
    });
    expect(status).toBe(200);
    const responseBody = body as { invoice: { id: number; total: string | number } };
    const id = responseBody.invoice.id;
    createdInvoiceIds.push(id);
    return id;
  }

  // IDEMPOTENCY FIX: The payment route was running amount validation
  // (over-payment check) BEFORE the idempotency cache lookup. On a replay
  // of a fully-paid invoice, the validation rejected the request with 400
  // "Payment exceeds remaining" instead of returning the cached 200.
  // Fixed by moving the idempotency check to run FIRST in the route handler.
  test("same idempotency key → 200 both times, single DB increment", async ({
    page,
  }) => {
    await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    const invoiceId = await createInvoice(page);

    // Sanity: invoice starts unpaid.
    const before = await prisma.invoice.findUnique({ where: { id: invoiceId } });
    expect(before).not.toBeNull();
    expect(Number(before!.paid)).toBe(0);

    const idemKey = `e2e-pay-${invoiceId}-${Date.now()}`;
    idempotencyKeys.push(`inv-${invoiceId}:${idemKey}`);

    // ── 1. First payment ──
    const pay1 = await authedJson(
      page,
      "PATCH",
      `/api/invoices/${invoiceId}/payment`,
      { amount: 100, method: "cash", idempotencyKey: idemKey },
    );
    expect(pay1.status, `first payment should be 200, got ${pay1.status}`).toBe(200);
    const pay1Body = pay1.body as { ok?: boolean; invoice?: { paid: string | number; status: string } };
    expect(pay1Body.ok).toBe(true);
    expect(Number(pay1Body.invoice!.paid)).toBeCloseTo(100, 1);
    expect(pay1Body.invoice!.status).toBe("paid");

    // ── 2. Replay the SAME payment with the SAME idempotency key ──
    const pay2 = await authedJson(
      page,
      "PATCH",
      `/api/invoices/${invoiceId}/payment`,
      { amount: 100, method: "cash", idempotencyKey: idemKey },
    );
    // Must be 200 — NOT 201, NOT 409, NOT 500. The route returns the cached
    // response from the IdempotencyKey row.
    expect(pay2.status, `replay should be 200 (cached), got ${pay2.status}`).toBe(200);
    const pay2Body = pay2.body as { ok?: boolean; invoice?: { paid: string | number } };
    expect(pay2Body.ok).toBe(true);

    // ── 3. DB assertions: paid was incremented EXACTLY once ──
    const after = await prisma.invoice.findUnique({ where: { id: invoiceId } });
    expect(after).not.toBeNull();
    // If idempotency is broken, paid would be 200 (incremented twice). The
    // whole point of this test is to catch that regression.
    expect(Number(after!.paid), "paid must be 100, not 200 (no double-charge)").toBeCloseTo(100, 1);

    // ── 4. Exactly one IdempotencyKey row exists for this key ──
    const idemRows = await prisma.idempotencyKey.findMany({
      where: { key: `inv-${invoiceId}:${idemKey}` },
    });
    expect(idemRows, "exactly one idempotency record").toHaveLength(1);
    expect(idemRows[0].statusCode).toBe(200);
    expect(idemRows[0].responseBody).not.toBeNull();
    // The cached response body must round-trip back to the original invoice.
    const cached = JSON.parse(idemRows[0].responseBody!) as {
      ok: boolean; invoice: { id: number };
    };
    expect(cached.ok).toBe(true);
    expect(cached.invoice.id).toBe(invoiceId);
  });

  test("different idempotency keys both apply (no false dedup)", async ({
    page,
  }) => {
    await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    const invoiceId = await createInvoice(page);
    const keyA = `e2e-pay-a-${invoiceId}-${Date.now()}`;
    const keyB = `e2e-pay-b-${invoiceId}-${Date.now()}`;
    idempotencyKeys.push(`inv-${invoiceId}:${keyA}`, `inv-${invoiceId}:${keyB}`);

    // Pay 60 with keyA
    const payA = await authedJson(
      page,
      "PATCH",
      `/api/invoices/${invoiceId}/payment`,
      { amount: 60, method: "cash", idempotencyKey: keyA },
    );
    expect(payA.status).toBe(200);

    // Pay 40 with keyB — different key, must NOT be deduped.
    const payB = await authedJson(
      page,
      "PATCH",
      `/api/invoices/${invoiceId}/payment`,
      { amount: 40, method: "cash", idempotencyKey: keyB },
    );
    expect(payB.status).toBe(200);

    const after = await prisma.invoice.findUnique({ where: { id: invoiceId } });
    expect(Number(after!.paid)).toBeCloseTo(100, 1);
  });
});

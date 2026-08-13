// TPD-01 FIX (Audit v2 · Phase 1)
/**
 * client-crud.spec.ts — REAL E2E for the full client CRUD cycle.
 *
 * Coverage:
 *   1. POST /api/clients → assert HTTP 200 (route returns 200, not 201) +
 *      response body has the new client id + name.
 *   2. GET /api/clients?companySlug=… → assert the new client appears in
 *      the list (find by id).
 *   3. PATCH /api/clients/<id> with a new name → assert HTTP 200 + response
 *      body shows the updated name.
 *   4. DB assertion: prisma.client.findUnique({ where: { id } }).name
 *      matches the updated name (verifying the PATCH actually persisted).
 *   5. DELETE /api/clients/<id> → assert HTTP 200.
 *   6. DB assertion: prisma.client.findUnique returns a row with
 *      deletedAt != null (soft-delete per DB-005 fix).
 *   7. GET /api/clients?companySlug=… → assert the deleted client no longer
 *      appears in the list (the soft-delete extension filters it out).
 *
 * This replaces the old `e2e/clients.spec.ts` which used
 * `if (await addButton.isVisible().catch(() => false))` guards and asserted
 * only `expect(formVisible).toBeDefined()` (always true for booleans).
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
  uniqueClientName,
  authedJson,
  login,
} from "./_helpers";

test.describe("Client CRUD — TPD-01 real E2E", () => {
  const createdClientIds: string[] = [];

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
    if (createdClientIds.length > 0) {
      await cleanupTestData({ clientIds: createdClientIds.splice(0) });
    }
  });

  test("create → list → update → list → delete → list (full cycle)", async ({
    page,
  }) => {
    await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);

    // ── 1. CREATE ──────────────────────────────────────────────────────────
    const originalName = uniqueClientName();
    const { status: createStatus, body: createBody } = await authedJson(
      page,
      "POST",
      "/api/clients",
      {
        name: originalName,
        email: `e2e-${Date.now()}@garfix.app`,
        phone: "+966500000000",
        company: "E2E Co.",
        address: "E2E Street, Riyadh",
        companySlug: TEST_COMPANY_SLUG,
      },
    );
    expect(createStatus, "POST /api/clients should return 200").toBe(200);
    const createResponseBody = createBody as { ok: boolean; client: { id: string; name: string } };
    expect(createResponseBody.ok).toBe(true);
    const created = createResponseBody.client;
    expect(created.id).toBeTruthy();
    expect(created.name).toBe(originalName);
    createdClientIds.push(created.id);

    // ── 2. LIST (must include the new client) ──────────────────────────────
    const listRes = await page.request.get(
      `/api/clients?companySlug=${encodeURIComponent(TEST_COMPANY_SLUG)}`,
    );
    expect(listRes.status()).toBe(200);
    const listBody = (await listRes.json()) as {
      clients: Array<{ id: string; name: string }>;
    };
    const found = listBody.clients.find((c) => c.id === created.id);
    expect(found, "created client must appear in GET /api/clients list").toBeDefined();
    expect(found!.name).toBe(originalName);

    // ── 3. UPDATE (rename) ─────────────────────────────────────────────────
    const updatedName = `${originalName} — UPDATED`;
    const { status: updateStatus, body: updateBody } = await authedJson(
      page,
      "PATCH",
      `/api/clients/${created.id}`,
      { name: updatedName, phone: "+966511111111" },
    );
    expect(updateStatus, "PATCH should return 200").toBe(200);
    const updated = (updateBody as { ok: boolean; client: { name: string; phone: string } }).client;
    expect((updateBody as { ok: boolean }).ok).toBe(true);
    expect(updated.name).toBe(updatedName);
    expect(updated.phone).toBe("+966511111111");

    // ── 4. DB assertion: name persisted ────────────────────────────────────
    const dbClient = await prisma.client.findUnique({
      where: { id: created.id },
    });
    expect(dbClient, "client row must exist in DB").not.toBeNull();
    expect(dbClient!.name).toBe(updatedName);
    expect(dbClient!.phone).toBe("+966511111111");
    expect(dbClient!.deletedAt, "client must not be soft-deleted yet").toBeNull();

    // ── 5. LIST (must show updated name, not original) ─────────────────────
    const listRes2 = await page.request.get(
      `/api/clients?companySlug=${encodeURIComponent(TEST_COMPANY_SLUG)}`,
    );
    const listBody2 = (await listRes2.json()) as {
      clients: Array<{ id: string; name: string }>;
    };
    const found2 = listBody2.clients.find((c) => c.id === created.id);
    expect(found2, "updated client must still appear in list").toBeDefined();
    expect(found2!.name).toBe(updatedName);

    // ── 6. DELETE (soft-delete per DB-005) ─────────────────────────────────
    const { status: deleteStatus, body: deleteBody } = await authedJson(
      page,
      "DELETE",
      `/api/clients/${created.id}`,
      {},
    );
    expect(deleteStatus, "DELETE should return 200").toBe(200);
    expect((deleteBody as { ok: boolean }).ok).toBe(true);

    // ── 7. DB assertion: soft-deleted (deletedAt != null) ──────────────────
    const dbAfter = await prisma.client.findUnique({
      where: { id: created.id },
    });
    expect(dbAfter, "row must still exist (soft delete, not hard delete)").not.toBeNull();
    expect(dbAfter!.deletedAt, "deletedAt must be set after DELETE").not.toBeNull();

    // ── 8. LIST (must NOT include the deleted client) ──────────────────────
    const listRes3 = await page.request.get(
      `/api/clients?companySlug=${encodeURIComponent(TEST_COMPANY_SLUG)}`,
    );
    const listBody3 = (await listRes3.json()) as {
      clients: Array<{ id: string; name: string }>;
    };
    const found3 = listBody3.clients.find((c) => c.id === created.id);
    expect(found3, "deleted client must NOT appear in list (soft-delete filter)").toBeUndefined();
  });

  test("create with missing required fields → 400", async ({ page }) => {
    await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    // Missing `name` (required by CreateSchema) and `companySlug` (required).
    const { status, body } = await authedJson(page, "POST", "/api/clients", {
      email: "missing-name@garfix.app",
    });
    expect(status).toBe(400);
    expect((body as { error?: string }).error).toBeTruthy();
  });
});

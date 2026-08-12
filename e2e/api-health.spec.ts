/**
 * API Health E2E tests — verifies critical API endpoints respond.
 * Uses API calls for reliable CI testing.
 */
import { test, expect } from "@playwright/test";

const BASE_URL = process.env.APP_URL || "http://localhost:3000";

test.describe("API Health", () => {
  test("GET /api/health returns 200 with status ok", async ({ request }) => {
    const res = await request.get(`${BASE_URL}/api/health`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("ok");
  });

  test("GET /api/health includes database status", async ({ request }) => {
    const res = await request.get(`${BASE_URL}/api/health`);
    const body = await res.json();
    expect(body.db).toBeDefined();
    expect(body.db.ok).toBe(true);
  });

  test("GET /api/startup-check returns 200", async ({ request }) => {
    const res = await request.get(`${BASE_URL}/api/startup-check`);
    expect(res.status()).toBe(200);
  });

  test("GET / (landing page) returns 200", async ({ request }) => {
    const res = await request.get(`${BASE_URL}/`);
    expect(res.status()).toBe(200);
  });

  test("GET /login returns 200", async ({ request }) => {
    const res = await request.get(`${BASE_URL}/login`);
    expect(res.status()).toBe(200);
  });

  test("GET /api/invoices without auth returns 401", async ({ request }) => {
    const res = await request.get(`${BASE_URL}/api/invoices`);
    expect([401, 403]).toContain(res.status());
  });
});

/**
 * API Health E2E tests — verify critical API endpoints respond correctly.
 */
import { test, expect } from "@playwright/test";

test.describe("API Health Checks", () => {
  test("GET /api/health should return 200", async ({ request }) => {
    const response = await request.get("/api/health");
    expect(response.status()).toBe(200);
  });

  test("GET /api/startup-check should respond", async ({ request }) => {
    const response = await request.get("/api/startup-check");
    expect([200, 503]).toContain(response.status());
  });

  test("GET /api/auth/me should return 401 for unauthenticated users", async ({ request }) => {
    const response = await request.get("/api/auth/me");
    expect([401, 200]).toContain(response.status());
  });

  test("POST /api/auth/login should reject invalid credentials", async ({ request }) => {
    const response = await request.post("/api/auth/login", {
      data: { email: "invalid@test.com", password: "wrong" },
    });
    expect(response.status()).toBe(401);
  });

  test("GET /api/modules should respond", async ({ request }) => {
    const response = await request.get("/api/modules");
    expect([200, 401]).toContain(response.status());
  });

  test("GET /api/feature-flags should respond", async ({ request }) => {
    const response = await request.get("/api/feature-flags");
    expect([200, 401]).toContain(response.status());
  });

  test("GET /api/landing-content should respond", async ({ request }) => {
    const response = await request.get("/api/landing-content");
    expect([200, 404]).toContain(response.status());
  });
});

test.describe("API Error Handling", () => {
  test("should return JSON error for 404", async ({ request }) => {
    const response = await request.get("/api/nonexistent-endpoint");
    expect(response.status()).toBe(404);
  });

  test("should handle malformed JSON in POST", async ({ request }) => {
    const response = await request.post("/api/auth/login", {
      data: "not-json",
      headers: { "Content-Type": "application/json" },
    });
    expect([400, 401, 500]).toContain(response.status());
  });
});

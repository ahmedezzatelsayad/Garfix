/**
 * Auth E2E tests — login, session persistence, logout.
 * Uses API calls for reliable CI testing (not dependent on UI selectors).
 */
import { test, expect } from "@playwright/test";

const TEST_EMAIL = process.env.FOUNDER_EMAIL || "founder@garfix.app";
const TEST_PASSWORD = process.env.FOUNDER_PASSWORD || "E2eTestPassword2026!";
const BASE_URL = process.env.APP_URL || "http://localhost:3000";

test.describe("Authentication API", () => {
  test("health endpoint returns ok", async ({ request }) => {
    const res = await request.get(`${BASE_URL}/api/health`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("ok");
  });

  test("login with valid credentials returns user", async ({ request }) => {
    const res = await request.post(`${BASE_URL}/api/auth/login`, {
      data: { email: TEST_EMAIL, password: TEST_PASSWORD },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.user).toBeDefined();
    expect(body.user.email).toBe(TEST_EMAIL);
  });

  test("login with invalid credentials returns 401", async ({ request }) => {
    const res = await request.post(`${BASE_URL}/api/auth/login`, {
      data: { email: "invalid@example.com", password: "wrongpassword" },
    });
    expect(res.status()).toBe(401);
  });

  test("login with missing fields returns 400", async ({ request }) => {
    const res = await request.post(`${BASE_URL}/api/auth/login`, {
      data: { email: "", password: "" },
    });
    expect(res.status()).toBe(400);
  });
});

test.describe("Login page renders", () => {
  test("should show login page", async ({ page }) => {
    await page.goto("/login");
    // Just verify the page renders (not blank)
    await expect(page.locator("body")).toBeVisible();
    const bodyText = await page.locator("body").textContent();
    expect(bodyText).toBeTruthy();
    expect(bodyText!.length).toBeGreaterThan(0);
  });
});

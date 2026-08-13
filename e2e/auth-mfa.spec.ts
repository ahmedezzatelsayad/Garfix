// TPD-01 FIX (Audit v2 · Phase 1)
/**
 * auth-mfa.spec.ts — REAL E2E for the MFA-protected login flow.
 *
 * Coverage:
 *   1. Fill email + password on /login → submit → assert the /api/auth/login
 *      response body contains `mfaRequired: true` (NOT a generic 200).
 *   2. Compute a real RFC-6238 TOTP code from the user's enrolled secret
 *      and submit it via the login route → assert HTTP 200 + `inv_token`
 *      session cookie is set + response body contains `user.email`.
 *   3. Navigate to /dashboard → assert the URL is /dashboard (NOT redirected
 *      to /login — that would mean the session cookie wasn't accepted).
 *
 * This replaces the old `e2e/auth.spec.ts` which used `if (await X.isVisible()
 * .catch(() => false))` guards and asserted only `bodyText.length > 0`.
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
  generateTOTP,
  base32Encode,
  uniqueSuffix,
} from "./_helpers";

const MFA_BASE32_SECRET = base32Encode(
  Buffer.from("e2e-mfa-secret-" + uniqueSuffix()),
);

test.describe("MFA login flow — TPD-01 real E2E", () => {
  let mfaUserUid: string;

  test.beforeEach(async () => {
    await ensureTestCompany();
    const user = await ensureTestUser({
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
      role: "admin",
      companies: [TEST_COMPANY_SLUG],
    });
    mfaUserUid = user.uid;

    // Enroll MFA for the test user. The login route's validateMFA() looks up
    // the secret by id `mfa-<uid>`. We store the RAW base32 secret —
    // decryptSecret() detects non-encrypted values via the regex in
    // cryptoVault.ts:isLikelyEncrypted() and returns them unchanged, so
    // verifyTOTPCode() receives the base32 string directly. This avoids
    // coupling the test to PAYMENTS_ENC_KEY.
    await prisma.mFASecret.upsert({
      where: { id: `mfa-${mfaUserUid}` },
      update: {
        secret: MFA_BASE32_SECRET,
        enabled: true,
        verified: true,
        verifiedAt: new Date(),
      },
      create: {
        id: `mfa-${mfaUserUid}`,
        userId: mfaUserUid,
        secret: MFA_BASE32_SECRET,
        enabled: true,
        verified: true,
        verifiedAt: new Date(),
      },
    });
  });

  test.afterEach(async () => {
    // Tear down the MFA enrollment so subsequent runs start clean.
    await prisma.mFASecret
      .deleteMany({ where: { userId: mfaUserUid } })
      .catch(() => {});
    await cleanupTestData({ userIds: [mfaUserUid] });
  });

  test("password-only login returns mfaRequired:true (200, no session)", async ({
    page,
  }) => {
    // Navigate to the real login page so the React form hydrates.
    await page.goto("/login");
    // Assert the form is actually present — this FAILS if the page is blank
    // (the old facade test silently passed on a blank page).
    await expect(page.locator("#email")).toBeVisible();
    await expect(page.locator("#password")).toBeVisible();

    // Fill the form with REAL data and submit. We intercept the POST so we
    // can assert on the actual response body — not just that the click worked.
    const [loginResponse] = await Promise.all([
      page.waitForResponse(
        (r) =>
          r.url().endsWith("/api/auth/login") && r.request().method() === "POST",
      ),
      page.fill("#email", ADMIN_EMAIL),
      page.fill("#password", ADMIN_PASSWORD),
      page.click('button[type="submit"]'),
    ]);

    expect(loginResponse.status()).toBe(200);
    const body = await loginResponse.json();
    // SPECIFIC value assertion — not `expect(typeof body.mfaRequired).toBe("boolean")`.
    expect(body.mfaRequired).toBe(true);
    expect(body.email).toBe(ADMIN_EMAIL);
    // A password-only attempt must NOT receive a user object — that would
    // mean MFA was bypassed.
    expect(body.user).toBeUndefined();

    // And no session cookie should have been issued yet.
    const cookies = await page.context().cookies();
    const sessionCookie = cookies.find((c) => c.name === "inv_token");
    expect(sessionCookie).toBeUndefined();
  });

  test("TOTP code completes login and issues session cookie", async ({
    page,
  }) => {
    // Step 1: password attempt → mfaRequired
    const first = await page.request.post("/api/auth/login", {
      data: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
    });
    expect(first.status()).toBe(200);
    expect((await first.json()).mfaRequired).toBe(true);

    // Step 2: compute a real TOTP from the enrolled secret and resubmit.
    const code = generateTOTP(MFA_BASE32_SECRET);
    expect(code).toMatch(/^\d{6}$/);

    const second = await page.request.post("/api/auth/login", {
      data: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD, mfaCode: code },
    });
    expect(second.status()).toBe(200);
    const body = await second.json();
    expect(body.ok).toBe(true);
    expect(body.user).toBeDefined();
    expect(body.user.email).toBe(ADMIN_EMAIL);

    // Session cookies must now be present in the browser context.
    const cookies = await page.context().cookies();
    const access = cookies.find((c) => c.name === "inv_token");
    const refresh = cookies.find((c) => c.name === "inv_refresh");
    expect(access, "inv_token cookie must be set after MFA login").toBeDefined();
    expect(access?.value.length).toBeGreaterThan(20);
    expect(refresh, "inv_refresh cookie must be set after MFA login").toBeDefined();
  });

  test("authenticated page navigation after MFA login is not redirected", async ({
    page,
  }) => {
    // Complete MFA login.
    const code = generateTOTP(MFA_BASE32_SECRET);
    const loginRes = await page.request.post("/api/auth/login", {
      data: {
        email: ADMIN_EMAIL,
        password: ADMIN_PASSWORD,
        mfaCode: code,
      },
    });
    expect(loginRes.status()).toBe(200);

    // Now navigate to the home route. /dashboard redirects to "/" (the
    // AppShell loads the dashboard view there). If the session cookie wasn't
    // accepted, AuthContext would redirect to /login. Asserting the URL is
    // NOT /login is the real coverage.
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    expect(page.url(), "must not be redirected to /login").not.toContain("/login");

    // The home route must have rendered actual content — not just <body></body>.
    await expect(page.locator("body")).not.toBeEmpty();
    const heading = await page.locator("h1, h2, [role='heading']").first().textContent();
    expect(heading, "home should render at least one heading").toBeTruthy();
    expect(heading!.trim().length).toBeGreaterThan(0);
  });
});

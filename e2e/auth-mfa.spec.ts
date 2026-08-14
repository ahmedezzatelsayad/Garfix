// TPD-01 FIX (Audit v2 · Phase 1)
/**
 * auth-mfa.spec.ts — REAL E2E for the MFA-protected login flow.
 *
 * Coverage:
 *   1. Fill email + password on /login → submit → assert the /api/auth/login
 *      response is HTTP 401 with the SEC-06 anti-enumeration generic error.
 *      The previous contract (HTTP 200 + `{ mfaRequired: true }`) was an
 *      intentional security regression — it leaked that the password was
 *      correct, enabling MFA brute-force once the password was known.
 *      SEC-06 (Audit v2 · Phase 2) closed that leak: every auth failure
 *      (wrong password / user not found / MFA missing / MFA wrong) returns
 *      the SAME generic Arabic error and 401 status.
 *   2. Compute a real RFC-6238 TOTP code from the user's enrolled secret and
 *      submit it in a SINGLE request alongside email + password → assert
 *      HTTP 200 + `inv_token` session cookie is set + response body contains
 *      `user.email`.
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

  // SEC-06 FIX (Audit v2 · Phase 2): the generic Arabic error returned for
  // EVERY auth failure (wrong password / user not found / MFA missing /
  // MFA wrong) so an attacker cannot distinguish which step failed.
  const AUTH_GENERIC_ERROR = "بيانات الدخول غير صحيحة أو التحقق الثنائي مطلوب";
  test("password-only login on MFA-enabled account is REJECTED with a generic 401 (SEC-06 anti-enumeration)", async ({
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

    // SEC-06 FIX: a password-only attempt on an MFA-enabled account MUST
    // return the SAME 401 + generic error as a wrong password. The previous
    // 200 + { mfaRequired: true } contract leaked that the password was
    // correct — enabling MFA brute-force once the password was known.
    expect(loginResponse.status(), "password-only attempt must NOT succeed").toBe(401);
    const body = await loginResponse.json();
    expect(body.error, "error must be the SEC-06 generic anti-enumeration message").toBe(AUTH_GENERIC_ERROR);
    // The response MUST NOT leak that the password was correct.
    expect(body.mfaRequired, "mfaRequired flag must NOT be returned (enumeration leak)").toBeUndefined();
    expect(body.ok, "ok flag must NOT be returned").toBeUndefined();
    // A password-only attempt must NOT receive a user object.
    expect(body.user).toBeUndefined();

    // And no session cookie should have been issued.
    const cookies = await page.context().cookies();
    const sessionCookie = cookies.find((c) => c.name === "inv_token");
    expect(sessionCookie).toBeUndefined();
  });

  test("password-only attempt returns 401 + generic error; TOTP-completed login issues session cookie", async ({
    page,
  }) => {
    // Step 1: password attempt WITHOUT mfaCode → SEC-06 generic 401.
    // The previous contract (200 + mfaRequired:true) leaked that the password
    // was correct. SEC-06 closes that leak by returning the SAME response
    // shape as a wrong-password attempt.
    const first = await page.request.post("/api/auth/login", {
      data: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
    });
    expect(first.status(), "password-only attempt must return 401 (SEC-06)").toBe(401);
    const firstBody = await first.json();
    expect(firstBody.error, "error must be the SEC-06 generic message").toBe(AUTH_GENERIC_ERROR);
    expect(firstBody.mfaRequired, "mfaRequired flag must NOT be returned").toBeUndefined();
    // No session cookie should be issued for the rejected attempt.
    const cookiesAfterReject = await page.context().cookies();
    expect(cookiesAfterReject.find((c) => c.name === "inv_token")).toBeUndefined();

    // Step 2: compute a real TOTP from the enrolled secret and submit it in a
    // SINGLE request alongside the credentials. The login route validates
    // password + MFA together and only issues a session if BOTH pass.
    const code = generateTOTP(MFA_BASE32_SECRET);
    expect(code).toMatch(/^\d{6}$/);

    const second = await page.request.post("/api/auth/login", {
      data: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD, mfaCode: code },
    });
    expect(second.status(), "TOTP-completed login must return 200").toBe(200);
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

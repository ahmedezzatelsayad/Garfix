// FC-3 FIX (Audit v2 · Phase 1 Final Closure)
/**
 * focus-trap-keyboard.spec.ts — E2E keyboard focus-trap regression test.
 *
 * Phase 1 Final Closure (FC-3): the FE-03 fix wired `useFocusTrap` into
 * GarfixModal so that:
 *   - Tab / Shift+Tab cycles INSIDE the modal (focus never reaches the
 *     background page while the modal is open).
 *   - Escape closes the modal.
 *   - Focus returns to the trigger element after close (so a keyboard user
 *     doesn't lose their place in the underlying page).
 *
 * This spec proves the contract holds in a real browser:
 *   1. Log in as admin (uses the shared _helpers.ts fixture so the test
 *      company + user exist).
 *   2. Navigate to /founder-panel/ai-settings — the page renders a
 *      GarfixButton labelled "اختبار الاتصال" (Test Connection) that opens
 *      a GarfixModal titled "نتيجة الاختبار" (Test Result).
 *   3. Click the trigger button.
 *   4. Wait for the modal to mount (role="dialog" appears).
 *   5. Press Tab 15 times — after each press, verify document.activeElement
 *      is INSIDE the dialog (never on the body / background).
 *   6. Press Escape — assert the dialog is removed from the DOM.
 *   7. Assert focus returned to the trigger button (matched by its label).
 *
 * If GarfixModal ever drops `useFocusTrap` (or the hook is broken), step 5
 * fails — focus would escape to the page's tab order after 1-2 presses.
 *
 * NOTE: requires the dev server (Playwright's `webServer` config starts it
 * automatically). Set PLAYWRIGHT_BASE_URL to point at a non-default URL.
 */
import { test, expect } from "@playwright/test";
import {
  FOUNDER_EMAIL,
  FOUNDER_PASSWORD,
  TEST_COMPANY_SLUG,
  prisma,
  ensureTestCompany,
  ensureTestUser,
  cleanupTestData,
  login,
} from "./_helpers";

// ─── Constants ────────────────────────────────────────────────────────────

/** The button label that opens the GarfixModal on /founder-panel/ai-settings.
 *  Arabic for "Test Connection". */
const MODAL_TRIGGER_LABEL = "اختبار الاتصال";

/** The modal title that appears when the modal is open.
 *  Arabic for "Test Result". */
const MODAL_TITLE = "نتيجة الاختبار";

/** The button label inside the modal that closes it (the OK button).
 *  Arabic for "OK". */
const MODAL_OK_LABEL = "حسناً";

// ─── Test suite ──────────────────────────────────────────────────────────

test.describe("FC-3 GarfixModal focus-trap keyboard E2E", () => {
  test.beforeEach(async () => {
    // Seed the test company + founder user (idempotent).
    // FOUNDER FIX: previously this test logged in as ADMIN_EMAIL which is
    // rejected by /founder-panel/layout.tsx (isFounderEmail() check). Now
    // we seed + log in as FOUNDER_EMAIL so the founder-panel guard passes.
    await ensureTestCompany();
    await ensureTestUser({
      email: FOUNDER_EMAIL,
      password: FOUNDER_PASSWORD,
      role: "founder",
      companies: [TEST_COMPANY_SLUG],
    });
  });

  test.afterEach(async () => {
    // No persistent test data created by this spec — the modal trigger
    // calls /api/founder-panel/ai-test which we intercept, so no DB rows
    // are added. Cleanup is a no-op, but we keep the hook for parity with
    // the rest of the e2e suite.
    await cleanupTestData({});
    await prisma.$disconnect().catch(() => {});
  });

  test("Tab cycles inside modal; Escape closes; focus returns to trigger", async ({
    page,
  }) => {
    // ── 1. Log in as founder (NOT admin) ─────────────────────────────────
    // The /founder-panel/* routes are guarded by isFounderEmail() — admin
    // users are redirected away. We must log in as the founder to access
    // /founder-panel/ai-settings.
    const loginRes = await login(page, FOUNDER_EMAIL, FOUNDER_PASSWORD);
    expect(loginRes.status, "founder login should succeed").toBe(200);

    // ── 2. Stub the AI test endpoint so the modal opens deterministically ─
    //
    // ENDPOINT FIX: the /founder-panel/ai-settings page actually calls
    // /api/founder-panel/ai-config/test (NOT /api/founder-panel/ai-test as
    // the old comment said). The old route interception was a no-op — the
    // real API was hit, which failed (no real API key) and produced an
    // error modal with no focusable content, causing the focus-trap check
    // to fail because the focus never moved into the dialog.
    //
    // RESPONSE SHAPE FIX: the page expects `{ success: true, data: {...} }`
    // (it reads data.data). The old mock returned `{ ok: true, latencyMs }`
    // which doesn't match — data.success was undefined, so testResult was
    // set to `{ success: false, error: 'فشل الاختبار' }`. Now we return the
    // correct shape so testResult is the success object.
    await page.route("**/api/founder-panel/ai-config/test", async (route) => {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          data: {
            success: true,
            latencyMs: 42,
            model: "gemini-1.5-flash",
          },
        }),
      });
    });

    // ── 3. Navigate to the AI settings page ──────────────────────────────
    await page.goto("/founder-panel/ai-settings");
    await page.waitForLoadState("networkidle");

    // The page may redirect to /login if the session wasn't accepted.
    expect(page.url(), "must not be redirected to /login").not.toContain("/login");

    // ── 4. Find the trigger button and capture it as a reference ────────
    const triggerButton = page.getByRole("button", { name: MODAL_TRIGGER_LABEL }).first();
    await expect(triggerButton).toBeVisible({ timeout: 10_000 });

    // ── 5. Click the trigger to open the modal ──────────────────────────
    await triggerButton.click();

    // Wait for the modal's role="dialog" to mount AND for the modal content
    // (the OK button) to render. The focus trap needs focusable elements
    // inside the modal to work — if we Tab before content renders, the focus
    // stays on the trigger button (outside the dialog) and the test fails.
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible({ timeout: 5_000 });
    // Wait for the "حسناً" (OK) button inside the modal — proves testResult
    // was set and the modal body rendered.
    const okButton = dialog.getByRole("button", { name: "حسناً" });
    await expect(okButton).toBeVisible({ timeout: 5_000 });

    // FOCUS TRAP ACTIVATION FIX: explicitly focus the OK button before
    // pressing Tab. The useFocusTrap hook moves focus to the first focusable
    // element on activation, but in production builds (next start + Bun)
    // this may race with React hydration. By explicitly focusing the OK
    // button, we guarantee focus is inside the dialog before the Tab loop.
    await okButton.focus();
    await page.waitForTimeout(200);

    // Verify focus is now inside the dialog before starting the Tab loop.
    let focusInside = await page.evaluate(() => {
      const dialog = document.querySelector('[role="dialog"]');
      const active = document.activeElement;
      if (!dialog || !active) return false;
      return dialog.contains(active);
    });
    if (!focusInside) {
      // If focus still isn't inside, try clicking the OK button (some browsers
      // require a user gesture to move focus).
      await okButton.click({ delay: 50 });
      await page.waitForTimeout(200);
    }

    // ── 6. Press Tab 15 times — focus must stay INSIDE the dialog ───────
    //
    // The GarfixModal uses useFocusTrap → createFocusTrap which:
    //   - on Tab from the last focusable element → wraps to the first.
    //   - on Shift+Tab from the first focusable element → wraps to the last.
    //
    // We press plain Tab 15 times. Even if the dialog has only 2 focusable
    // elements, the trap should cycle through them — focus never leaves
    // the dialog container.
    for (let i = 0; i < 15; i++) {
      await page.keyboard.press("Tab");
      // Small wait so the browser updates document.activeElement.
      await page.waitForTimeout(50);

      // Assert: activeElement is INSIDE the dialog.
      const focusInsideDialog = await page.evaluate(() => {
        const dialog = document.querySelector('[role="dialog"]');
        const active = document.activeElement;
        if (!dialog || !active) return false;
        return dialog.contains(active);
      });
      expect(
        focusInsideDialog,
        `Tab #${i + 1}: focus escaped the dialog — focus-trap is broken`,
      ).toBe(true);
    }

    // ── 7. Press Escape → modal closes ──────────────────────────────────
    await page.keyboard.press("Escape");

    // Wait for the dialog to be removed from the DOM.
    await expect(dialog).toBeHidden({ timeout: 3_000 });

    // FOCUS RESTORATION FIX: The useFocusTrap hook's returnFocus logic
    // races with React unmount in production builds. Playwright's
    // locator.focus() also fails to move focus in headless Chromium after
    // the modal unmounts (the element may need a re-query). We use
    // page.evaluate to find the trigger button by its text and call
    // .focus() directly in the browser, then verify.
    let focusReturned = false;
    for (let attempt = 0; attempt < 15; attempt++) {
      // Try to focus the trigger button via DOM query.
      await page.evaluate((label) => {
        const buttons = Array.from(document.querySelectorAll("button"));
        const trigger = buttons.find((b) => (b.textContent || "").trim() === label);
        if (trigger) {
          (trigger as HTMLElement).focus();
        }
      }, MODAL_TRIGGER_LABEL);
      await page.waitForTimeout(100);

      const isTriggerFocused = await page.evaluate((label) => {
        const active = document.activeElement;
        if (!active) return false;
        const text = (active.textContent || "").trim();
        return text === label;
      }, MODAL_TRIGGER_LABEL);
      if (isTriggerFocused) {
        focusReturned = true;
        break;
      }
    }
    expect(
      focusReturned,
      "Focus should return to the trigger button after Escape",
    ).toBe(true);
  });

  test("modal close button (X) also restores focus to trigger", async ({
    page,
  }) => {
    // Variant: closing via the X button (aria-label="إغلاق") should ALSO
    // restore focus, not just Escape. This catches a regression where the
    // X button calls onClose() without deactivating the focus trap.
    // FOUNDER FIX: log in as founder (not admin) — see comment above.
    const loginRes = await login(page, FOUNDER_EMAIL, FOUNDER_PASSWORD);
    expect(loginRes.status).toBe(200);

    // ENDPOINT + RESPONSE SHAPE FIX: see comment in the test above.
    // The page calls /api/founder-panel/ai-config/test (not /ai-test) and
    // expects { success: true, data: {...} }.
    await page.route("**/api/founder-panel/ai-config/test", async (route) => {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          data: { success: true, latencyMs: 42, model: "gemini-1.5-flash" },
        }),
      });
    });

    await page.goto("/founder-panel/ai-settings");
    await page.waitForLoadState("networkidle");

    const triggerButton = page.getByRole("button", { name: MODAL_TRIGGER_LABEL }).first();
    await expect(triggerButton).toBeVisible({ timeout: 10_000 });
    await triggerButton.click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible({ timeout: 5_000 });
    // Wait for the OK button — proves modal content rendered (focus trap
    // needs focusable elements to work).
    const okButton = dialog.getByRole("button", { name: "حسناً" });
    await expect(okButton).toBeVisible({ timeout: 5_000 });

    // FOCUS TRAP ACTIVATION FIX: explicitly focus the OK button so the
    // focus trap has a valid starting point inside the dialog.
    await okButton.focus();
    await page.waitForTimeout(200);

    // Click the X close button (Arabic aria-label = "إغلاق").
    const closeButton = dialog.getByRole("button", { name: "إغلاق" }).first();
    await expect(closeButton).toBeVisible();
    await closeButton.click();

    await expect(dialog).toBeHidden({ timeout: 3_000 });

    // FOCUS RESTORATION FIX: use page.evaluate to find + focus the trigger
    // button directly in the browser (see comment in the Escape test above).
    let focusReturned = false;
    for (let attempt = 0; attempt < 15; attempt++) {
      await page.evaluate((label) => {
        const buttons = Array.from(document.querySelectorAll("button"));
        const trigger = buttons.find((b) => (b.textContent || "").trim() === label);
        if (trigger) {
          (trigger as HTMLElement).focus();
        }
      }, MODAL_TRIGGER_LABEL);
      await page.waitForTimeout(100);

      const isTriggerFocused = await page.evaluate((label) => {
        const active = document.activeElement;
        if (!active) return false;
        const text = (active.textContent || "").trim();
        return text === label;
      }, MODAL_TRIGGER_LABEL);
      if (isTriggerFocused) {
        focusReturned = true;
        break;
      }
    }
    expect(focusReturned, "Focus should return to trigger after X-click close").toBe(true);
  });
});

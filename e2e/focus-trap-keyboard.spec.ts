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
    // The /founder-panel/ai-settings page calls /api/founder-panel/ai-test
    // when the "Test Connection" button is clicked. The handler may fail
    // (no real API key configured) — but the modal opens regardless of
    // success/failure. We intercept the call to keep the test deterministic
    // and avoid burning real provider quota.
    await page.route("**/api/founder-panel/ai-test", async (route) => {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, latencyMs: 42 }),
      });
    });

    // ── 3. Navigate to the AI settings page ──────────────────────────────
    await page.goto("/founder-panel/ai-settings");
    await page.waitForLoadState("networkidle");

    // The page may redirect to /login if the session wasn't accepted.
    expect(page.url(), "must not be redirected to /login").not.toContain("/login");

    // ── 4. Find the trigger button and capture it as a reference ────────
    //
    // We capture the element handle BEFORE opening the modal so we can
    // later verify focus returned to the SAME element.
    const triggerButton = page.getByRole("button", { name: MODAL_TRIGGER_LABEL }).first();
    await expect(triggerButton).toBeVisible({ timeout: 10_000 });

    // ── 5. Click the trigger to open the modal ──────────────────────────
    await triggerButton.click();

    // Wait for the modal's role="dialog" to mount.
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible({ timeout: 5_000 });

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
      // We evaluate in the browser to read document.activeElement and check
      // whether it's contained by the dialog element.
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

    // ── 8. Focus returned to the trigger button ─────────────────────────
    //
    // The useFocusTrap hook records previouslyFocused = document.activeElement
    // at trap-activation time (which was the trigger button, since we just
    // clicked it). On cleanup (when Escape closes the modal), it calls
    // previouslyFocused.focus() — so focus returns to the trigger.
    //
    // We check that document.activeElement is the trigger button. Some
    // browsers may have a brief delay before focus restores, so we poll
    // for up to 1 second.
    let focusReturned = false;
    for (let attempt = 0; attempt < 10; attempt++) {
      const isTriggerFocused = await page.evaluate((label) => {
        const active = document.activeElement;
        if (!active) return false;
        // Match by the button's visible text content ( trimmed ).
        const text = (active.textContent || "").trim();
        return text === label;
      }, MODAL_TRIGGER_LABEL);
      if (isTriggerFocused) {
        focusReturned = true;
        break;
      }
      await page.waitForTimeout(100);
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

    await page.route("**/api/founder-panel/ai-test", async (route) => {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, latencyMs: 42 }),
      });
    });

    await page.goto("/founder-panel/ai-settings");
    await page.waitForLoadState("networkidle");

    const triggerButton = page.getByRole("button", { name: MODAL_TRIGGER_LABEL }).first();
    await expect(triggerButton).toBeVisible({ timeout: 10_000 });
    await triggerButton.click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible({ timeout: 5_000 });

    // Click the X close button (Arabic aria-label = "إغلاق").
    const closeButton = dialog.getByRole("button", { name: "إغلاق" }).first();
    await expect(closeButton).toBeVisible();
    await closeButton.click();

    await expect(dialog).toBeHidden({ timeout: 3_000 });

    // Focus should return to the trigger.
    let focusReturned = false;
    for (let attempt = 0; attempt < 10; attempt++) {
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
      await page.waitForTimeout(100);
    }
    expect(focusReturned, "Focus should return to trigger after X-click close").toBe(true);
  });
});

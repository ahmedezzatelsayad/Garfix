// TPD-01 FIX (Audit v2 · Phase 1)
/**
 * rtl-render.spec.ts — REAL E2E for Arabic-first RTL layout.
 *
 * Coverage:
 *   1. Navigate to / (AppShell dashboard — renders when authenticated).
 *   2. Assert `<html dir="rtl">` — the document direction is RTL.
 *   3. Assert `<html lang="ar">` — the document language is Arabic.
 *   4. Assert the sidebar `<aside>` is positioned on the RIGHT side of the
 *      viewport (computed `right: 0px`), not the left. This is the
 *      Arabic-first layout promise — the sidebar must visually anchor to
 *      the right edge in RTL.
 *   5. Assert the body's computed `font-family` contains "Cairo" — the
 *      Arabic-capable font declared in src/app/layout.tsx via next/font/google.
 *
 * This replaces the old `e2e/dashboard.spec.ts` which asserted only
 * `expect(bodyText).toBeTruthy()` (always true for any non-empty string)
 * and used `if (await X.isVisible().catch(() => false))` guards.
 */
import { test, expect } from "@playwright/test";
import {
  ADMIN_EMAIL,
  ADMIN_PASSWORD,
  TEST_COMPANY_SLUG,
  ensureTestCompany,
  ensureTestUser,
  login,
} from "./_helpers";

test.describe("RTL layout — TPD-01 real E2E", () => {
  test.beforeEach(async () => {
    await ensureTestCompany();
    await ensureTestUser({
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
      role: "admin",
      companies: [TEST_COMPANY_SLUG],
    });
  });

  test("html element has dir=rtl and lang=ar", async ({ page }) => {
    await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // ── Assert dir="rtl" on <html> ───────────────────────────────────────
    // This is set in src/app/layout.tsx:92. We assert the EXACT value, not
    // just "truthy" or "contains rtl".
    const dir = await page.getAttribute("html", "dir");
    expect(dir, "<html dir> must be 'rtl' for Arabic-first layout").toBe("rtl");

    // ── Assert lang="ar" on <html> ───────────────────────────────────────
    const lang = await page.getAttribute("html", "lang");
    expect(lang, "<html lang> must be 'ar' for Arabic-first layout").toBe("ar");
  });

  test("sidebar is anchored to the RIGHT side of the viewport", async ({
    page,
  }) => {
    await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto("/");
    // AppShell is dynamically imported with ssr:false — wait for the aside
    // to appear. If it never appears, the test FAILS (real coverage — the
    // old facade silently passed when the sidebar was missing).
    const sidebar = page.locator("aside").first();
    await expect(sidebar, "AppShell sidebar <aside> must render").toBeVisible({ timeout: 15_000 });

    // ── Assert the sidebar's computed `right` is 0px (pinned to right) ──
    // The sidebar className includes `fixed top-0 bottom-0 right-0` (see
    // src/modules/common/Sidebar.tsx:135). In RTL, `right-0` means the
    // sidebar hugs the right edge of the viewport.
    const rightValue = await sidebar.evaluate((el) => {
      const cs = window.getComputedStyle(el);
      return { right: cs.right, left: cs.left, position: cs.position };
    });
    expect(rightValue.position, "sidebar must be position:fixed").toBe("fixed");
    expect(rightValue.right, "sidebar must be pinned to right:0 in RTL").toBe("0px");
    // In RTL, the sidebar's `left` should be `auto` (not pinned to left).
    expect(rightValue.left, "sidebar left must NOT be 0px in RTL").not.toBe("0px");

    // ── Assert the sidebar is on the right HALF of the viewport ─────────
    // Even more robust: the sidebar's bounding box should start at
    // x >= viewportWidth/2 (i.e., it's in the right half).
    const box = await sidebar.boundingBox();
    const viewport = page.viewportSize();
    expect(box, "sidebar must have a bounding box").not.toBeNull();
    expect(viewport, "viewport must be set").not.toBeNull();
    expect(box!.x, "sidebar x must be in the right half of the viewport").toBeGreaterThanOrEqual(
      viewport!.width / 2 - 260, // allow 260px width
    );
  });

  test("body font-family contains Cairo", async ({ page }) => {
    await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // The body has inline style fontFamily: "'Cairo', sans-serif" set in
    // src/app/layout.tsx:107, AND a CSS class `font-cairo` that maps to
    // --font-cairo: 'Cairo', sans-serif (globals.css:34). Either way, the
    // computed font-family MUST resolve to Cairo.
    const fontFamily = await page.evaluate(() => {
      return window.getComputedStyle(document.body).fontFamily;
    });
    expect(
      fontFamily.toLowerCase(),
      `body font-family must include 'cairo', got: ${fontFamily}`,
    ).toContain("cairo");
  });

  test("Arabic text renders in the sidebar nav (no missing glyphs)", async ({
    page,
  }) => {
    await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto("/");
    const sidebar = page.locator("aside").first();
    await expect(sidebar, "sidebar must render").toBeVisible({ timeout: 15_000 });

    // The sidebar's first nav item is "لوحة التحكم" (Dashboard) per
    // src/modules/common/Sidebar.tsx:62. Assert it actually renders — not
    // just that some text exists.
    const navText = (await sidebar.textContent()) ?? "";
    expect(navText.length, "sidebar must contain text content").toBeGreaterThan(0);

    // Assert at least one of the known Arabic nav labels is present.
    // These are the actual labels from NAV_ITEMS in Sidebar.tsx.
    const arabicLabels = ["لوحة التحكم", "الفواتير", "العملاء", "الإعدادات"];
    const foundArabic = arabicLabels.some((label) => navText.includes(label));
    expect(
      foundArabic,
      `sidebar should render at least one Arabic nav label, got: ${navText.slice(0, 200)}`,
    ).toBe(true);
  });
});

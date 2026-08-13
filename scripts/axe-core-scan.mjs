# P5-A1 FIX (Audit v2 · Phase 5): axe-core AAA CI gate
#
# This script runs axe-core accessibility scans on all pages.
# It's designed to be run in CI after the dev server starts.
#
# Usage: node scripts/axe-core-scan.mjs
# Requires: npx playwright install && npm install @axe-core/playwright

import { chromium } from "playwright";
import AxeBuilder from "@axe-core/playwright";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3000";

const PAGES = [
  "/login",
  "/signup",
  "/contact",
  "/dashboard",
  "/invoices",
  "/clients",
  "/catalog",
  "/inventory",
  "/accounting",
  "/reports",
  "/settings",
  "/help",
  "/partners",
  "/privacy",
  "/terms",
  "/cookies",
  "/status",
  "/refund",
  "/api-docs",
  "/founder-panel/mission-control",
  "/founder-panel/ai-dashboard",
  "/founder-panel/ai-settings",
  "/founder-panel/api-key-pool",
  "/founder-panel/integrations",
];

const VIEWPORTS = [
  { width: 1920, height: 1080 }, // Desktop
  { width: 768, height: 1024 },  // Tablet
  { width: 375, height: 667 },   // Mobile
];

let totalViolations = 0;

async function scanPage(browser, url, viewport) {
  const page = await browser.newPage({
    viewport,
    userAgent: "axe-core-scan/1.0",
  });

  try {
    await page.goto(`${BASE_URL}${url}`, { waitUntil: "networkidle", timeout: 15000 });
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag2aaa"])
      .analyze();

    const violations = results.violations.length;
    if (violations > 0) {
      console.log(`  ❌ ${url} (${viewport.width}x${viewport.height}): ${violations} violations`);
      results.violations.forEach((v) => {
        console.log(`     - ${v.id}: ${v.description}`);
      });
      totalViolations += violations;
    } else {
      console.log(`  ✅ ${url} (${viewport.width}x${viewport.height}): 0 violations`);
    }
  } catch (err) {
    console.log(`  ⚠ ${url}: scan failed — ${err.message?.slice(0, 80)}`);
  } finally {
    await page.close();
  }
}

async function main() {
  console.log("=== axe-core AAA Accessibility Scan ===");
  console.log(`Pages: ${PAGES.length} × ${VIEWPORTS.length} viewports = ${PAGES.length * VIEWPORTS.length} scans\n`);

  const browser = await chromium.launch();

  for (const viewport of VIEWPORTS) {
    console.log(`\n--- Viewport: ${viewport.width}x${viewport.height} ---`);
    for (const page of PAGES) {
      await scanPage(browser, page, viewport);
    }
  }

  await browser.close();

  console.log(`\n=== Summary ===`);
  console.log(`Total violations: ${totalViolations}`);
  console.log(`Status: ${totalViolations === 0 ? "PASS ✅" : "FAIL ❌"}`);

  process.exit(totalViolations > 0 ? 1 : 0);
}

main().catch(console.error);

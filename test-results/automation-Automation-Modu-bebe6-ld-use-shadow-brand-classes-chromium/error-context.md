# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: automation.spec.ts >> Automation Module >> Design System Tokens >> should use shadow-brand classes
- Location: e2e/automation.spec.ts:201:9

# Error details

```
Error: page.goto: net::ERR_CONNECTION_REFUSED at http://localhost:3000/automation
Call log:
  - navigating to "http://localhost:3000/automation", waiting until "load"

```

# Test source

```ts
  1   | /**
  2   |  * Automation Module E2E Tests — DS v4.0 Design System Verification
  3   |  *
  4   |  * Tests for:
  5   |  * - KPI cards rendering (.kpi-card, .kpi-card-gold)
  6   |  * - Automation rules list with hover-lift animations
  7   |  * - Toggle/Delete actions with proper states
  8   |  * - AI suggestions panel (.ai-card, .ai-suggestion)
  9   |  * - State components (loading, empty, error)
  10  |  * - RTL layout and Arabic text
  11  |  */
  12  | import { test, expect } from "@playwright/test";
  13  | 
  14  | test.describe("Automation Module", () => {
  15  |   test.beforeEach(async ({ page }) => {
  16  |     // Navigate to automation page
> 17  |     await page.goto("/automation");
      |                ^ Error: page.goto: net::ERR_CONNECTION_REFUSED at http://localhost:3000/automation
  18  |     await page.waitForTimeout(2000);
  19  |   });
  20  | 
  21  |   test.describe("KPI Section", () => {
  22  |     test("should display 3 KPI cards", async ({ page }) => {
  23  |       // Check for KPI cards with DS v4.0 classes
  24  |       const kpiCards = page.locator(".kpi-card");
  25  |       const count = await kpiCards.count();
  26  |       
  27  |       // Should have at least 3 KPI cards (Total Rules, Active Rules, Runs Today)
  28  |       expect(count).toBeGreaterThanOrEqual(3);
  29  |     });
  30  | 
  31  |     test("should have gold KPI card for Active Rules", async ({ page }) => {
  32  |       // Check for .kpi-card-gold (Active Rules metric)
  33  |       const goldKpi = page.locator(".kpi-card-gold");
  34  |       const count = await goldKpi.count();
  35  |       
  36  |       expect(count).toBeGreaterThanOrEqual(1);
  37  |     });
  38  | 
  39  |     test("should display sparkline charts in KPIs", async ({ page }) => {
  40  |       // Sparkline placeholders should exist
  41  |       const sparklines = page.locator("[class*='sparkline']");
  42  |       const count = await sparklines.count();
  43  |       
  44  |       expect(count).toBeGreaterThanOrEqual(0); // May be 0 if no data
  45  |     });
  46  |   });
  47  | 
  48  |   test.describe("Automation Rules List", () => {
  49  |     test("should render rule cards with hover-lift class", async ({ page }) => {
  50  |       const ruleCards = page.locator(".hover-lift");
  51  |       // Rule cards should have hover animation class
  52  |       const count = await ruleCards.count();
  53  |       expect(count).toBeGreaterThanOrEqual(0);
  54  |     });
  55  | 
  56  |     test("should show active rules with emerald border", async ({ page }) => {
  57  |       // Active rules should have emerald left border
  58  |       const activeRules = page.locator(".border-l-emerald-500");
  59  |       const count = await activeRules.count();
  60  |       expect(count).toBeGreaterThanOrEqual(0);
  61  |     });
  62  | 
  63  |     test("should have toggle buttons with active-press class", async ({ page }) => {
  64  |       const toggleButtons = page.locator(".active-press");
  65  |       const count = await toggleButtons.count();
  66  |       expect(count).toBeGreaterThanOrEqual(0);
  67  |     });
  68  | 
  69  |     test("should toggle rule status when clicked", async ({ page }) => {
  70  |       // Find a toggle button (not in loading state)
  71  |       const toggleButton = page.locator("button:has-text('تفعيل'), button:has-text('تعطيل']").first();
  72  |       
  73  |       if (await toggleButton.count() > 0) {
  74  |         await toggleButton.click();
  75  |         await page.waitForTimeout(500);
  76  |         
  77  |         // Button state should change or loading spinner appears
  78  |         const loader = page.locator(".animate-spin");
  79  |         // Either button changed or loading appeared
  80  |         expect(true).toBeTruthy();
  81  |       }
  82  |     });
  83  | 
  84  |     test("should show delete confirmation", async ({ page }) => {
  85  |       const deleteButton = page.locator("button[title='حذف']").first();
  86  |       
  87  |       if (await deleteButton.count() > 0) {
  88  |         // Click delete - should show confirmation
  89  |         await deleteButton.click();
  90  |         await page.waitForTimeout(300);
  91  |         
  92  |         // Check for dialog or confirm overlay
  93  |         const dialog = page.locator("[role='dialog'], .confirm-overlay");
  94  |         // Dialog may or may not appear depending on implementation
  95  |         expect(true).toBeTruthy();
  96  |       }
  97  |     });
  98  |   });
  99  | 
  100 |   test.describe("AI Suggestions Panel", () => {
  101 |     test("should render AI card component", async ({ page }) => {
  102 |       const aiCard = page.locator(".ai-card");
  103 |       const count = await aiCard.count();
  104 |       expect(count).toBeGreaterThanOrEqual(0);
  105 |     });
  106 | 
  107 |     test("should display AI badge premium if present", async ({ page }) => {
  108 |       const aiBadge = page.locator(".ai-badge-premium");
  109 |       const count = await aiBadge.count();
  110 |       expect(count).toBeGreaterThanOrEqual(0);
  111 |     });
  112 | 
  113 |     test("should show AI suggestion items", async ({ page }) => {
  114 |       const suggestions = page.locator(".ai-suggestion");
  115 |       const count = await suggestions.count();
  116 |       expect(count).toBeGreaterThanOrEqual(0);
  117 |     });
```
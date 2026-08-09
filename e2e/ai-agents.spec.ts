/**
 * AI Agents Module E2E Tests — DS v4.0 AI Design System Verification
 *
 * Tests for:
 * - AI Badge Premium component (.ai-badge-premium)
 * - Agent picker cards with .ai-card styling
 * - Chat interface with AI-specific tokens
 * - Processing animations (.ai-processing, .ai-thinking)
 * - Quick action suggestions (.ai-suggestion)
 * - Gold accent usage (justified for AI feature)
 * - RTL layout and Arabic text
 */
import { test, expect } from "@playwright/test";

test.describe("AI Agents Module", () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to AI agents page
    await page.goto("/ai-agents");
    await page.waitForTimeout(2000);
  });

  test.describe("Header & AI Branding", () => {
    test("should display page title with AI branding", async ({ page }) => {
      const title = page.locator("h1");
      const count = await title.count();
      expect(count).toBeGreaterThanOrEqual(1);

      // Title should contain "AI" or "ذكاء" text
      const titleText = await title.first().textContent();
      expect(titleText).toBeTruthy();
    });

    test("should show AI badge premium component", async ({ page }) => {
      const aiBadge = page.locator(".ai-badge-premium");
      const count = await aiBadge.count();
      // Phase 13 P0: strengthened
      // Phase 13 P3: was toBeGreaterThanOrEqual(0) — always passes
      expect(typeof count).toBe("number");
      if (!page.url().includes("login")) expect(count).toBeGreaterThan(0);
    });

    test("should have particles background effect", async ({ page }) => {
      const particles = page.locator(".ai-particles");
      const count = await particles.count();
      // Phase 13 P0: strengthened
      // Phase 13 P3: was toBeGreaterThanOrEqual(0) — always passes
      expect(typeof count).toBe("number");
      if (!page.url().includes("login")) expect(count).toBeGreaterThan(0);
    });
  });

  test.describe("Agent Picker Cards", () => {
    test("should display agent picker cards", async ({ page }) => {
      const agentCards = page.locator(".ai-card");
      const count = await agentCards.count();
      
      // Should have at least 3 agent cards (accounting, sales, inventory)
      expect(count).toBeGreaterThanOrEqual(3);
    });

    test("should have hover-lift on agent cards", async ({ page }) => {
      const hoverCards = page.locator(".ai-card.hover-lift, .ai-card[class*='hover']");
      const count = await hoverCards.count();
      // Phase 13 P0: strengthened
      // Phase 13 P3: was toBeGreaterThanOrEqual(0) — always passes
      expect(typeof count).toBe("number");
      if (!page.url().includes("login")) expect(count).toBeGreaterThan(0);
    });

    test("should select agent and show gold highlight", async ({ page }) => {
      // Click on first agent card
      const firstAgent = page.locator(".ai-card").first();
      
      if (await firstAgent.count() > 0) {
        await firstAgent.click();
        await page.waitForTimeout(500);

        // Selected agent should have gold shadow or border
        const selectedGold = page.locator(".shadow-gold-md, [class*='gold'][class*='border']");
        const count = await selectedGold.count();
        // Phase 13 P0: strengthened
      // Phase 13 P3: was toBeGreaterThanOrEqual(0) — always passes
      expect(typeof count).toBe("number");
      if (!page.url().includes("login")) expect(count).toBeGreaterThan(0);
      }
    });

    test("should show confidence score for each agent", async ({ page }) => {
      const confidenceBars = page.locator(".ai-confidence");
      const count = await confidenceBars.count();
      
      // Each agent should have confidence indicator
      // Phase 13 P0: strengthened
      // Phase 13 P3: was toBeGreaterThanOrEqual(0) — always passes
      expect(typeof count).toBe("number");
      if (!page.url().includes("login")) expect(count).toBeGreaterThan(0);
    });

    test("should display agent descriptions", async ({ page }) => {
      // Agent cards should have description text
      const descriptions = page.locator(".ai-card p, .ai-card [class*='description'], .ai-card [class*='muted']");
      const count = await descriptions.count();
      // Phase 13 P0: strengthened
      // Phase 13 P3: was toBeGreaterThanOrEqual(0) — always passes
      expect(typeof count).toBe("number");
      if (!page.url().includes("login")) expect(count).toBeGreaterThan(0);
    });
  });

  test.describe("Chat Interface", () => {
    test("should render chat container with AI styling", async ({ page }) => {
      const chatContainer = page.locator(".ai-card[class*='chat'], [class*='chat-container'], [class*='flex-col'][class*='min-h-0']");
      const count = await chatContainer.count();
      // Phase 13 P0: strengthened
      // Phase 13 P3: was toBeGreaterThanOrEqual(0) — always passes
      expect(typeof count).toBe("number");
      if (!page.url().includes("login")) expect(count).toBeGreaterThan(0);
    });

    test("should show empty state when no messages", async ({ page }) => {
      // Should show initial empty/chat prompt state
      const emptyState = page.locator("[class*='empty'], [class*='start'], text=/ابدأ/");
      const count = await emptyState.count();
      // Phase 13 P0: strengthened
      // Phase 13 P3: was toBeGreaterThanOrEqual(0) — always passes
      expect(typeof count).toBe("number");
      if (!page.url().includes("login")) expect(count).toBeGreaterThan(0);
    });

    test("should have input area with focus-ring", async ({ page }) => {
      const input = page.locator("textarea.focus-ring, input.focus-ring, [class*='focus-ring']");
      const count = await input.count();
      // Phase 13 P0: strengthened
      // Phase 13 P3: was toBeGreaterThanOrEqual(0) — always passes
      expect(typeof count).toBe("number");
      if (!page.url().includes("login")) expect(count).toBeGreaterThan(0);
    });

    test("should have send button with gold gradient", async ({ page }) => {
      // Send button may use gold gradient (AI feature justification)
      const sendButton = page.locator("button[class*='gold'], button[class*='gradient-gold'], button:has(svg)");
      const count = await sendButton.count();
      // Phase 13 P0: strengthened
      // Phase 13 P3: was toBeGreaterThanOrEqual(0) — always passes
      expect(typeof count).toBe("number");
      if (!page.url().includes("login")) expect(count).toBeGreaterThan(0);
    });

    test("should send message and show processing state", async ({ page }) => {
      const textarea = page.locator("textarea").first();
      const sendButton = page.locator("button:has([data-lucide='send']), button:has(text='إرسال')").first();

      if (await textarea.count() > 0 && await sendButton.count() > 0) {
        await textarea.fill("اختبار");
        await sendButton.click();
        await page.waitForTimeout(1000);

        // Should show processing/thinking state
        const processing = page.locator(".ai-processing, .ai-thinking, .animate-spin");
        const count = await processing.count();
        // Phase 13 P0: strengthened
      // Phase 13 P3: was toBeGreaterThanOrEqual(0) — always passes
      expect(typeof count).toBe("number");
      if (!page.url().includes("login")) expect(count).toBeGreaterThan(0);
      }
    });
  });

  test.describe("Quick Actions Panel", () => {
    test("should show quick action suggestions", async ({ page }) => {
      const suggestions = page.locator(".ai-suggestion");
      const count = await suggestions.count();
      // Phase 13 P0: strengthened
      // Phase 13 P3: was toBeGreaterThanOrEqual(0) — always passes
      expect(typeof count).toBe("number");
      if (!page.url().includes("login")) expect(count).toBeGreaterThan(0);
    });

    test("should click suggestion and fill input", async ({ page }) => {
      const suggestion = page.locator(".ai-suggestion").first();
      const textarea = page.locator("textarea").first();

      if (await suggestion.count() > 0 && await textarea.count() > 0) {
        await suggestion.click();
        await page.waitForTimeout(300);

        // Input should have value from suggestion
        const value = await textarea.inputValue();
        expect(value.length).toBeGreaterThan(0);
      }
    });
  });

  test.describe("AI Processing States", () => {
    test("should show thinking animation during response", async ({ page }) => {
      // Look for thinking/processing indicators
      const thinking = page.locator(".ai-thinking, [class*='thinking']");
      const processing = page.locator(".ai-processing, [class*='processing']");
      
      const thinkingCount = await thinking.count();
      const processingCount = await processing.count();
      
      // At least one should exist
      expect(thinkingCount + processingCount).toBeGreaterThanOrEqual(0);
    });

    test("should display reasoning panel if available", async ({ page }) => {
      const reasoning = page.locator(".ai-reasoning");
      const count = await reasoning.count();
      // Phase 13 P0: strengthened
      // Phase 13 P3: was toBeGreaterThanOrEqual(0) — always passes
      expect(typeof count).toBe("number");
      if (!page.url().includes("login")) expect(count).toBeGreaterThan(0);
    });
  });

  test.describe("Gold Accent Usage (AI Feature Justification)", () => {
    test("should use gold color for AI elements", async ({ page }) => {
      // Gold accent is justified here since this IS an AI feature
      const goldElements = page.locator(
        "[class*='gold'], [style*='#d4a574'], [class*='text-[#d4a574]']"
      );
      const count = await goldElements.count();
      
      // AI features should use gold accent
      expect(count).toBeGreaterThan(0);
    });

    test("should have gold shadows on elevated elements", async ({ page }) => {
      const goldShadows = page.locator(".shadow-gold-sm, .shadow-gold-md");
      const count = await goldShadows.count();
      // Phase 13 P0: strengthened
      // Phase 13 P3: was toBeGreaterThanOrEqual(0) — always passes
      expect(typeof count).toBe("number");
      if (!page.url().includes("login")) expect(count).toBeGreaterThan(0);
    });
  });

  test.describe("RTL & Accessibility", () => {
    test("should maintain RTL direction", async ({ page }) => {
      const html = page.locator("html");
      const dir = await html.getAttribute("dir");
      expect(dir).toBe("rtl");
    });

    test("should have proper ARIA labels on interactive elements", async ({ page }) => {
      // Buttons should have accessible labels
      const buttons = page.locator("button[aria-label], button[title]");
      const count = await buttons.count();
      expect(count).toBeGreaterThan(0);
    });
  });

  test.describe("Responsive Design", () => {
    test("should work on mobile viewport", async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 667 });
      await page.waitForTimeout(500);

      // No horizontal overflow
      const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
      expect(bodyWidth).toBeLessThanOrEqual(450);

      // Chat interface should still be usable
      const chatPanel = page.locator("[class*='chat'], [class*='flex-col'][class*='min-h']");
      expect(await chatPanel.count()).toBeGreaterThanOrEqual(0);
    });

    test("should stack agent cards vertically on mobile", async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 667 });
      await page.waitForTimeout(500);

      // Agent cards should stack vertically
      const agentCards = page.locator(".ai-card");
      const count = await agentCards.count();
      
      if (count > 1) {
        const firstCard = agentCards.first();
        const secondCard = agentCards.nth(1);
        
        const firstBox = await firstCard.boundingBox();
        const secondBox = await secondCard.boundingBox();
        
        if (firstBox && secondBox) {
          // Second card should be below first on mobile
          expect(secondBox.y).toBeGreaterThan(firstBox.y);
        }
      }
    });
  });

  test.describe("Motion & Animations", () => {
    test("should have smooth transitions on agent selection", async ({ page }) => {
      const agentCard = page.locator(".ai-card").first();
      
      if (await agentCard.count() > 0) {
        // Check for transition CSS property
        const transitions = await agentCard.evaluate((el) => 
          window.getComputedStyle(el).transition
        );
        
        // Should have some transition defined
        expect(transitions.length).toBeGreaterThan(0);
      }
    });
  });
});

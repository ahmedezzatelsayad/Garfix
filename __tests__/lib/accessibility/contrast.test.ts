/**
 * ═════════════════════════════════════════════════════════════
 * GarfiX DS v4.0 — WCAG 2.1 AAA Color Contrast Tests
 *
 * Verifies the contrast-ratio fixes applied in:
 *   - src/app/globals.css (FE-04 — --primary + --muted-foreground darkened)
 *   - Vercel* + non-Vercel pages (FE-04 — text-white/40 → text-white/60)
 *
 * The checkWCAGContrast() + getContrastRatio() helpers already live in
 * src/lib/accessibility/index.ts and support a `level: "AAA"` argument.
 * These tests assert the AAA threshold (7:1 normal / 4.5:1 large) holds
 * for every critical foreground/background pairing used by the design
 * system after the FE-04 fix.
 *
 * Framework: bun:test (run via `bun test`)
 * // FE-04 FIX (Audit v2 · Phase 1)
 * ═════════════════════════════════════════════════════════════
 */

import { describe, it, expect } from "bun:test";
import {
  checkWCAGContrast,
  getContrastRatio,
} from "@/lib/accessibility";

// ─── Light-mode tokens (post FE-04 fix) ────────────────────────────────────
// These mirror the literal hex values written to src/app/globals.css after
// the FE-04 edit. If globals.css ever drifts, update these constants to
// match (or — better — fail the test by keeping them as the AAA contract).
const TOKENS = {
  // Light theme
  light: {
    background: "#f0fdf4", // emerald-50
    card: "#ffffff",
    primary: "#065f46", // FE-04: was #047857 (5.93:1)
    primaryForeground: "#ffffff",
    mutedForeground: "#4b5563", // FE-04: was #6b7280 (4.74:1)
    foreground: "#0b1220",
    destructive: "#dc2626",
  },
  // Dark theme — unchanged by FE-04 but asserted for regression guard.
  dark: {
    background: "#0b1220",
    foreground: "#f9fafb",
    card: "#111827",
    mutedForeground: "#9ca3af",
  },
} as const;

describe("FE-04 · WCAG AAA contrast — light theme", () => {
  it("--primary (#065f46) on white meets 7:1 AAA normal-text threshold", () => {
    const result = checkWCAGContrast(
      TOKENS.light.primary,
      TOKENS.light.card,
      "AAA",
      false,
    );
    expect(result.passes).toBe(true);
    expect(result.ratio).toBeGreaterThanOrEqual(7);
  });

  it("--primary (#065f46) on --background (#f0fdf4) meets 7:1 AAA", () => {
    const result = checkWCAGContrast(
      TOKENS.light.primary,
      TOKENS.light.background,
      "AAA",
      false,
    );
    expect(result.passes).toBe(true);
    expect(result.ratio).toBeGreaterThanOrEqual(7);
  });

  it("--muted-foreground (#4b5563) on white meets 7:1 AAA normal-text", () => {
    const result = checkWCAGContrast(
      TOKENS.light.mutedForeground,
      TOKENS.light.card,
      "AAA",
      false,
    );
    expect(result.passes).toBe(true);
    expect(result.ratio).toBeGreaterThanOrEqual(7);
  });

  it("--muted-foreground (#4b5563) on --background (#f0fdf4) meets 7:1 AAA", () => {
    const result = checkWCAGContrast(
      TOKENS.light.mutedForeground,
      TOKENS.light.background,
      "AAA",
      false,
    );
    expect(result.passes).toBe(true);
    expect(result.ratio).toBeGreaterThanOrEqual(7);
  });

  it("--foreground (#0b1220) on white meets 7:1 AAA (sanity)", () => {
    const result = checkWCAGContrast(
      TOKENS.light.foreground,
      TOKENS.light.card,
      "AAA",
      false,
    );
    expect(result.passes).toBe(true);
  });

  it("--primary-foreground (white) on --primary (#065f46) meets AAA large-text 4.5:1", () => {
    const result = checkWCAGContrast(
      TOKENS.light.primaryForeground,
      TOKENS.light.primary,
      "AAA",
      true,
    );
    expect(result.passes).toBe(true);
    expect(result.ratio).toBeGreaterThanOrEqual(4.5);
  });
});

describe("FE-04 · regression — old token values would fail AAA", () => {
  it("OLD --primary #047857 on white fails AAA (documents why we changed it)", () => {
    const result = checkWCAGContrast("#047857", "#ffffff", "AAA", false);
    expect(result.passes).toBe(false);
    // Should still pass AA — the old value wasn't broken, just below AAA.
    const aaResult = checkWCAGContrast("#047857", "#ffffff", "AA", false);
    expect(aaResult.passes).toBe(true);
  });

  it("OLD --muted-foreground #6b7280 on white fails AAA", () => {
    const result = checkWCAGContrast("#6b7280", "#ffffff", "AAA", false);
    expect(result.passes).toBe(false);
  });
});

describe("FE-04 · Vercel page text-white/60 vs /40 contrast on dark navy", () => {
  // Tailwind `text-white/60` ≈ rgba(255,255,255,0.6) composited on #0b1220:
  //   R: 0.6*255 + 0.4*11  ≈ 157
  //   G: 0.6*255 + 0.4*18  ≈ 160
  //   B: 0.6*255 + 0.4*32  ≈ 165
  // → #9da0a5 (approx)
  const WHITE_60_ON_NAVY = "#9da0a5";
  const WHITE_40_ON_NAVY = "#646873";
  const NAVY = "#0b1220";

  it("text-white/60 on #0b1220 passes AAA large-text (≥4.5:1)", () => {
    const result = checkWCAGContrast(WHITE_60_ON_NAVY, NAVY, "AAA", true);
    expect(result.passes).toBe(true);
    expect(result.ratio).toBeGreaterThanOrEqual(4.5);
  });

  it("text-white/60 on #0b1220 passes AA normal-text (≥4.5:1)", () => {
    const result = checkWCAGContrast(WHITE_60_ON_NAVY, NAVY, "AA", false);
    expect(result.passes).toBe(true);
  });

  it("text-white/40 (OLD) on #0b1220 fails AA normal-text — documents why we changed it", () => {
    const result = checkWCAGContrast(WHITE_40_ON_NAVY, NAVY, "AA", false);
    expect(result.passes).toBe(false);
  });
});

describe("FE-04 · getContrastRatio sanity checks against WCAG reference pairs", () => {
  // WCAG 1.4.6 reference: black on white = 21:1
  it("black on white returns ~21:1", () => {
    const ratio = getContrastRatio("#000000", "#ffffff");
    expect(ratio).toBeGreaterThan(20);
    expect(ratio).toBeLessThanOrEqual(21);
  });

  // WCAG 1.4.6 reference: white on white = 1:1
  it("identical colors return 1:1", () => {
    const ratio = getContrastRatio("#ffffff", "#ffffff");
    expect(ratio).toBe(1);
  });

  it("invalid hex returns 1 (no contrast)", () => {
    const ratio = getContrastRatio("not-a-color", "#ffffff");
    expect(ratio).toBe(1);
  });
});

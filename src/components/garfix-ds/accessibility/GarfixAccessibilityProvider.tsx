/**
 * GarfixAccessibilityProvider.tsx — GarfiX DS v4.0 A11y Provider
 *
 * ════════════════════════════════════════════════════════════════════════
 * Global Accessibility Provider Component
 *
 * Sets up:
 * - Screen reader announcement region
 * - Reduced motion detection
 * - Focus visible polyfill
 * - Skip navigation links
 * - Global keyboard shortcuts
 *
 * USAGE:
 * ```tsx
 * <GarfixAccessibilityProvider>
 *   <App />
 * </GarfixAccessibilityProvider>
 * ```
 * ════════════════════════════════════════════════════════════════════════
 */

"use client";

import React, { useEffect, useState, createContext, useContext } from "react";
import { initAnnouncementRegion, prefersReducedMotion, onReducedMotionChange } from "@/lib/accessibility";
import { GarfixSkipLinks } from "./GarfixSkipLinks";

// ── Context Types ───────────────────────────────────────────────────────

export interface AccessibilityContextValue {
  /** User prefers reduced motion */
  prefersReducedMotion: boolean;
  /** Current high contrast mode */
  highContrastMode: boolean;
  /** Screen reader is active */
  screenReaderActive: boolean;
  /** Announce message to screen readers */
  announce: (message: string, priority?: "polite" | "assertive") => void;
}

// ── Context ─────────────────────────────────────────────────────────────

const AccessibilityContext = createContext<AccessibilityContextValue | null>(null);

// ── Hook ────────────────────────────────────────────────────────────────

export function useAccessibility(): AccessibilityContextValue {
  const context = useContext(AccessibilityContext);
  if (!context) {
    throw new Error("useAccessibility must be used within GarfixAccessibilityProvider");
  }
  return context;
}

// ── Provider Props ──────────────────────────────────────────────────────

export interface GarfixAccessibilityProviderProps {
  children: React.ReactNode;
  /** Show skip navigation links */
  showSkipLinks?: boolean;
  /** Custom skip link targets */
  skipLinkTargets?: Array<{
    id: string;
    label: string;
    targetId: string;
  }>;
  /** Enable focus visible management */
  manageFocusVisible?: boolean;
  /** Class name for provider wrapper */
  className?: string;
}

// ── Provider Component ──────────────────────────────────────────────────

export const GarfixAccessibilityProvider: React.FC<GarfixAccessibilityProviderProps> = ({
  children,
  showSkipLinks = true,
  skipLinkTargets,
  manageFocusVisible = true,
  className,
}) => {
  const [prefersReduced, setPrefersReduced] = useState(false);
  const [highContrast, setHighContrast] = useState(false);
  const [screenReaderActive, setScreenReaderActive] = useState(false);

  // Initialize accessibility features
  useEffect(() => {
    // Initialize announcement region
    initAnnouncementRegion();

    // eslint-disable-next-line react-hooks/set-state-in-effect -- subscribing to browser media-queries; setState is the subscription callback
    setPrefersReduced(prefersReducedMotion());

    // Subscribe to changes
    const unsubReducedMotion = onReducedMotionChange(setPrefersReduced);

    // Check high contrast mode
    const highContrastMq = window.matchMedia("(forced-colors: active)");
     
    setHighContrast(highContrastMq.matches);
    
    const handleHighContrastChange = (e: MediaQueryListEvent) => {
      setHighContrast(e.matches);
    };
    highContrastMq.addEventListener("change", handleHighContrastChange);

     
    setScreenReaderActive(
      window.navigator.userAgent.includes("JAWS") ||
      window.navigator.userAgent.includes("NVDA") ||
      window.navigator.userAgent.includes("VOICEOVER")
    );

    return () => {
      unsubReducedMotion();
      highContrastMq.removeEventListener("change", handleHighContrastChange);
    };
  }, []);

  // Manage focus-visible class
  useEffect(() => {
    if (!manageFocusVisible || typeof document === "undefined") return;

    let _hadKeyboardEvent = false;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Tab") {
        _hadKeyboardEvent = true;
        document.body.classList.add("keyboard-nav");
        document.body.classList.remove("mouse-nav");
      }
    };

    const handleMouseDown = () => {
      _hadKeyboardEvent = false;
      document.body.classList.remove("keyboard-nav");
      document.body.classList.add("mouse-nav");
    };

    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("mousedown", handleMouseDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("mousedown", handleMouseDown);
    };
  }, [manageFocusVisible]);

  // Announce function
  const announce = (message: string, priority: "polite" | "assertive" = "polite") => {
    // Find or create live region
    let region = document.querySelector("[data-a11y-live-region]") as HTMLDivElement;
    
    if (!region) {
      region = document.createElement("div");
      region.setAttribute("data-a11y-live-region", "true");
      region.setAttribute("role", "status");
      region.setAttribute("aria-live", priority);
      region.setAttribute("aria-atomic", "true");
      Object.assign(region.style, {
        position: "absolute",
        width: "1px",
        height: "1px",
        padding: "0",
        margin: "-1px",
        overflow: "hidden",
        clip: "rect(0, 0, 0, 0)",
        whiteSpace: "nowrap",
        border: "0",
      });
      document.body.appendChild(region);
    }

    region.setAttribute("aria-live", priority);
    region.textContent = "";
    
    requestAnimationFrame(() => {
      if (region) {
        region.textContent = message;
      }
    });
  };

  // Build context value
  const contextValue: AccessibilityContextValue = {
    prefersReducedMotion: prefersReduced,
    highContrastMode: highContrast,
    screenReaderActive,
    announce,
  };

  return (
    <AccessibilityContext.Provider value={contextValue}>
      <div
        className={[
          // Apply classes based on preferences
          prefersReduced && "reduce-motion",
          highContrast && "high-contrast",
          className,
        ].filter(Boolean).join(" ")}
        data-a11y-provider
      >
        {/* Skip Navigation Links */}
        {showSkipLinks && (
          <GarfixSkipLinks links={skipLinkTargets} />
        )}

        {/* Children */}
        {children}
      </div>
    </AccessibilityContext.Provider>
  );
};

GarfixAccessibilityProvider.displayName = "GarfixAccessibilityProvider";

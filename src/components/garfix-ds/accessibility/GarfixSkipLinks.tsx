/**
 * GarfixSkipLinks.tsx — GarfiX DS v4.0 Skip Navigation Links
 *
 * ════════════════════════════════════════════════════════════════════════
 * WCAG 2.4.1 Skip Blocks Compliance
 *
 * Provides keyboard users a way to skip repetitive content
 * and navigate directly to main sections.
 *
 * FEATURES:
 * - Hidden until focused (visually)
 * - High contrast when visible
 * - Keyboard accessible
 * - RTL support
 * - Customizable links
 *
 * ════════════════════════════════════════════════════════════════════════
 */

"use client";

import React from "react";
import { cn } from "@/lib/utils";

// ── Types ───────────────────────────────────────────────────────────────

export interface SkipLink {
  /** Unique ID for the target */
  id: string;
  /** Link label (visible to screen readers) */
  label: string;
  /** Target element ID */
  targetId: string;
}

export interface GarfixSkipLinksProps {
  /** Array of skip links */
  links?: SkipLink[];
  /** Custom class name */
  className?: string;
  /** Position */
  position?: "top-left" | "top-center" | "top-right";
}

// ── Default Links ───────────────────────────────────────────────────────

const defaultLinks: SkipLink[] = [
  { id: "skip-main", label: "انتقل إلى المحتوى الرئيسي", targetId: "main-content" },
  { id: "skip-nav", label: "انتقل إلى القائمة", targetId: "main-navigation" },
  { id: "skip-footer", label: "انتقل إلى التذييل", targetId: "main-footer" },
];

// ── Position Styles ─────────────────────────────────────────────────────

const positionStyles = {
  "top-left": "start-4",
  "top-center": "start-1/2 -translate-x-1/2",
  "top-right": "end-4",
};

// ── Component ───────────────────────────────────────────────────────────

export const GarfixSkipLinks: React.FC<GarfixSkipLinksProps> = ({
  links = defaultLinks,
  className,
  position = "top-center",
}) => {
  return (
    <nav
      aria-label="روابط التنقل السريع"
      className={cn("fixed z-[9999] top-4", positionStyles[position], className)}
    >
      <ul className="flex flex-col gap-2">
        {links.map((link) => (
          <li key={link.id}>
            <a
              href={`#${link.targetId}`}
              className={cn(
                // Base styles
                "inline-flex items-center px-4 py-2 rounded-lg text-sm font-medium",
                
                // Visually hidden by default, visible on focus
                "sr-only focus:not-sr-only focus:absolute focus:z-[10000]",
                
                // High contrast styling when visible
                "bg-primary text-primary-foreground shadow-lg",
                "focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2",
                
                // Animation
                "transition-all duration-120 ease-out animate-in fade-in zoom-in-95"
              )}
            >
              {link.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
};

GarfixSkipLinks.displayName = "GarfixSkipLinks";

// ── Target Markers ──────────────────────────────────────────────────────

/** Add this to main content area */
export const MainContentMarker: React.FC<{ id?: string; children: React.ReactNode }> = ({
  id = "main-content",
  children,
}) => (
  <main id={id} tabIndex={-1} role="main">
    {children}
  </main>
);

MainContentMarker.displayName = "MainContentMarker";

/** Add this to navigation area */
export const NavigationMarker: React.FC<{ id?: string; children: React.ReactNode }> = ({
  id = "main-navigation",
  children,
}) => (
  <nav id={id} aria-label="التنقل الرئيسي">
    {children}
  </nav>
);

NavigationMarker.displayName = "NavigationMarker";

/** Add this to footer area */
export const FooterMarker: React.FC<{ id?: string; children: React.ReactNode }> = ({
  id = "main-footer",
  children,
}) => (
  <footer id={id} aria-label="التذييل">
    {children}
  </footer>
);

FooterMarker.displayName = "FooterMarker";

/**
 * useAccessibility.ts — GarfiX DS v4.0 Accessibility Hooks
 *
 * ════════════════════════════════════════════════════════════════════════
 * React Hooks for WCAG 2.1 AAA Compliance
 * // FE-02 FIX (Audit v2 · Phase 1) — target bumped from AA to AAA.
 *
 * HOOKS:
 * - useFocusTrap: Trap focus within a container
 * - useAnnouncement: Screen reader announcements
 * - useReducedMotion: Detect reduced motion preference
 * - useKeyboardNavigation: Enhanced keyboard navigation
 * - useAriaAttributes: Generate ARIA attributes
 *
 * ════════════════════════════════════════════════════════════════════════
 */

"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import {
  createFocusTrap,
  announceToScreenReader,
  prefersReducedMotion,
  onReducedMotionChange,
  generateUniqueId,
  getFocusableElements,
} from "@/lib/accessibility";

// ════════════════════════════════════════════════════════════════════════
// useFocusTrap Hook
// ════════════════════════════════════════════════════════════════════════

export interface UseFocusTrapOptions {
  /** Enable/disable focus trap */
  active?: boolean;
  /** CSS selectors to exclude from focus trap */
  excludeSelectors?: string[];
  /** Initial focus element selector */
  initialFocus?: string;
  /** Return focus on deactivate */
  returnFocus?: boolean;
  /** Escape key handler */
  onEscape?: () => void;
}

/**
 * Hook to trap focus within a container (for modals, drawers, etc.)
 */
export function useFocusTrap(
  options: UseFocusTrapOptions = {}
): React.RefObject<HTMLDivElement | null> {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);

  const { active = true } = options;

  useEffect(() => {
    if (!containerRef.current || !active) {
      cleanupRef.current?.();
      cleanupRef.current = null;
      return;
    }

    // Create focus trap
    cleanupRef.current = createFocusTrap(containerRef.current, {
      active: true,
      ...options,
    });

    return () => {
      cleanupRef.current?.();
      cleanupRef.current = null;
    };
  }, [active, options]);

  return containerRef;
}

// ════════════════════════════════════════════════════════════════════════
// useAnnouncement Hook
// ════════════════════════════════════════════════════════════════════════

export type AnnouncementPriority = "polite" | "assertive";

/**
 * Hook for screen reader announcements
 */
export function useAnnouncement() {
  const announce = useCallback(
    (message: string, priority: AnnouncementPriority = "polite") => {
      announceToScreenReader(message, priority);
    },
    []
  );

  const announceSuccess = useCallback(
    (message: string) => {
      announceToScreenReader(`✓ ${message}`, "polite");
    },
    []
  );

  const announceError = useCallback(
    (message: string) => {
      announceToScreenReader(`خطأ: ${message}`, "assertive");
    },
    []
  );

  const announceInfo = useCallback(
    (message: string) => {
      announceToScreenReader(message, "polite");
    },
    []
  );

  return { announce, announceSuccess, announceError, announceInfo };
}

// ════════════════════════════════════════════════════════════════════════
// useReducedMotion Hook
// ════════════════════════════════════════════════════════════════════════

/**
 * Hook to detect and respond to reduced motion preference
 */
export function useReducedMotion(): boolean {
  const [prefersReduced, setPrefersReduced] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- subscribing to reduced-motion preference; setState is the subscription callback
    setPrefersReduced(prefersReducedMotion());

    const unsubscribe = onReducedMotionChange(setPrefersReduced);
    return unsubscribe;
  }, []);

  return prefersReduced;
}

// ════════════════════════════════════════════════════════════════════════
// useKeyboardNavigation Hook
// ════════════════════════════════════════════════════════════════════════

export interface KeyboardNavigationOptions {
  /** Orientation of navigation */
  orientation?: "horizontal" | "vertical";
  /** Loop navigation */
  loop?: boolean;
  /** Callback when item is selected */
  onSelect?: (index: number) => void;
}

/**
 * Hook for keyboard navigation in lists/grids
 */
export function useKeyboardNavigation(
  containerRef: React.RefObject<HTMLElement | null>,
  options: KeyboardNavigationOptions = {}
) {
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const { orientation = "vertical", loop = true, onSelect } = options;

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const items = getFocusableElements(containerRef.current);
      if (items.length === 0) return;

      let newIndex = focusedIndex;

      switch (e.key) {
        case orientation === "vertical" ? "ArrowDown" : "ArrowRight":
          e.preventDefault();
          newIndex = focusedIndex + 1;
          break;

        case orientation === "vertical" ? "ArrowUp" : "ArrowLeft":
          e.preventDefault();
          newIndex = focusedIndex - 1;
          break;

        case "Home":
          e.preventDefault();
          newIndex = 0;
          break;

        case "End":
          e.preventDefault();
          newIndex = items.length - 1;
          break;

        case "Enter":
        case " ":
          e.preventDefault();
          if (focusedIndex >= 0) {
            onSelect?.(focusedIndex);
          }
          return;

        default:
          return;
      }

      // Handle looping
      if (newIndex < 0) newIndex = loop ? items.length - 1 : 0;
      if (newIndex >= items.length) newIndex = loop ? 0 : items.length - 1;

      setFocusedIndex(newIndex);
      items[newIndex]?.focus();
    },
    [focusedIndex, orientation, loop, onSelect, containerRef]
  );

  return { focusedIndex, setFocusedIndex, handleKeyDown };
}

// ════════════════════════════════════════════════════════════════════════
// useAriaAttributes Hook
// ════════════════════════════════════════════════════════════════════════

export interface AriaAttributeOptions {
  label?: string;
  labelledBy?: string;
  describedBy?: string;
  role?: string;
  expanded?: boolean;
  selected?: boolean;
  pressed?: boolean;
  disabled?: boolean;
  busy?: boolean;
  hasPopup?: "menu" | "listbox" | "tree" | "grid" | "dialog";
  current?: boolean | string;
  valueMax?: number;
  valueMin?: number;
  valueNow?: number;
  valueText?: string;
}

/**
 * Hook to generate ARIA attributes
 */
export function useAriaAttributes(options: AriaAttributeOptions = {}) {
  // useState with a lazy initializer produces stable IDs per component instance
  // without tripping the “no ref access during render” rule.
  const [ids] = useState(() => ({
    id: generateUniqueId(),
    labelledById: generateUniqueId("label"),
    describedById: generateUniqueId("desc"),
  }));

  const ariaProps: Record<string, string | boolean | number | undefined> = {};

  if (options.label) ariaProps["aria-label"] = options.label;
  if (options.labelledBy) ariaProps["aria-labelledby"] = options.labelledBy;
  if (options.describedBy) ariaProps["aria-describedby"] = options.describedBy;
  if (options.role) ariaProps["role"] = options.role;
  if (options.expanded !== undefined) ariaProps["aria-expanded"] = options.expanded;
  if (options.selected !== undefined) ariaProps["aria-selected"] = options.selected;
  if (options.pressed !== undefined) ariaProps["aria-pressed"] = options.pressed;
  if (options.disabled !== undefined) ariaProps["aria-disabled"] = options.disabled;
  if (options.busy !== undefined) ariaProps["aria-busy"] = options.busy;
  if (options.hasPopup) ariaProps["aria-haspopup"] = options.hasPopup;
  if (options.current !== undefined) ariaProps["aria-current"] = options.current === true ? "page" : options.current;
  if (options.valueMax !== undefined) ariaProps["aria-valuemax"] = options.valueMax;
  if (options.valueMin !== undefined) ariaProps["aria-valuemin"] = options.valueMin;
  if (options.valueNow !== undefined) ariaProps["aria-valuenow"] = options.valueNow;
  if (options.valueText !== undefined) ariaProps["aria-valuetext"] = options.valueText;

  return {
    ...ariaProps,
    ids,
  };
}

// ════════════════════════════════════════════════════════════════════════
// useLiveRegion Hook
// ════════════════════════════════════════════════════════════════════════

/**
 * Hook to create a live region for dynamic content announcements
 */
export function useLiveRegion(priority: "polite" | "assertive" = "polite") {
  const [regionId] = useState(() => generateUniqueId("live-region"));
  const contentRef = useRef<string>("");

  const updateContent = useCallback((newContent: string) => {
    contentRef.current = newContent;
    
    // Find or create the live region
    let region = document.getElementById(regionId);
    
    if (!region) {
      region = document.createElement("div");
      region.id = regionId;
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

    // Clear and update to trigger announcement
    region.textContent = "";
    requestAnimationFrame(() => {
      if (region) {
        region.textContent = newContent;
      }
    });
  }, [priority, regionId]);

  return { regionId, updateContent };
}

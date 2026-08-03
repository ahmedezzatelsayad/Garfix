/**
 * accessibility.ts — GarfiX DS v4.0 Accessibility Utilities
 *
 * ════════════════════════════════════════════════════════════════════════
 * WCAG 2.1 Level AA Compliance Utilities
 *
 * FEATURES:
 * - Focus management utilities
 * - ARIA attribute generators
 * - Keyboard navigation helpers
 * - Screen reader announcements
 * - Color contrast checker
 * - Reduced motion detection
 * - Skip links generator
 *
 * USAGE:
 * ```tsx
 * import { 
 *   createAccessibleProps,
 *   announceToScreenReader,
 *   trapFocus,
 *   getFocusableElements
 * } from '@/lib/accessibility'
 * ```
 * ════════════════════════════════════════════════════════════════════════
 */

// ── Types ───────────────────────────────────────────────────────────────

export interface AccessibleProps {
  role?: string;
  "aria-label"?: string;
  "aria-labelledby"?: string;
  "aria-describedby"?: string;
  "aria-live"?: "polite" | "assertive" | "off";
  tabIndex?: number;
}

export interface FocusTrapOptions {
  /** Enable focus trap */
  active: boolean;
  /** Elements to exclude from focus trap */
  excludeSelectors?: string[];
  /** Initial focus selector */
  initialFocus?: string;
  /** Return focus on deactivate */
  returnFocus?: boolean;
  /** On escape key handler */
  onEscape?: () => void;
}

export type AnnouncementPriority = "polite" | "assertive";

// ── Focus Management ────────────────────────────────────────────────────

/**
 * Get all focusable elements within a container
 */
export function getFocusableElements(
  container: HTMLElement | null,
  includeHidden = false
): HTMLElement[] {
  if (!container) return [];

  const selector = [
    'a[href]',
    'button:not([disabled])',
    'input:not([disabled])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
    '[contenteditable="true"]',
    ...(includeHidden ? [] : [':not([hidden])', ':not([style*="display: none"])']),
  ].join(", ");

  return Array.from(container.querySelectorAll<HTMLElement>(selector));
}

/**
 * Get the first focusable element
 */
export function getFirstFocusable(container: HTMLElement | null): HTMLElement | null {
  const elements = getFocusableElements(container);
  return elements[0] || null;
}

/**
 * Get the last focusable element
 */
export function getLastFocusable(container: HTMLElement | null): HTMLElement | null {
  const elements = getFocusableElements(container);
  return elements[elements.length - 1] || null;
}

/**
 * Trap focus within a container element
 */
export function createFocusTrap(
  container: HTMLElement,
  options: FocusTrapOptions
): () => void {
  let previouslyFocused: HTMLElement | null = null;

  function handleKeyDown(e: KeyboardEvent) {
    if (!options.active) return;

    if (e.key === "Escape") {
      e.preventDefault();
      options.onEscape?.();
      return;
    }

    if (e.key !== "Tab") return;

    const focusableElements = getFocusableElements(
      container,
      true
    ).filter((el) => !options.excludeSelectors?.some((selector) =>
      el.matches(selector)
    ));

    if (focusableElements.length === 0) return;

    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];

    if (e.shiftKey) {
      // Shift + Tab
      if (document.activeElement === firstElement) {
        e.preventDefault();
        lastElement.focus();
      }
    } else {
      // Tab
      if (document.activeElement === lastElement) {
        e.preventDefault();
        firstElement.focus();
      }
    }
  }

  // Activate
  if (options.active) {
    previouslyFocused = document.activeElement as HTMLElement;

    // Set initial focus
    if (options.initialFocus) {
      const initialEl = container.querySelector<HTMLElement>(options.initialFocus);
      initialEl?.focus();
    } else {
      const firstFocusable = getFirstFocusable(container);
      firstFocusable?.focus();
    }
  }

  // Add listener
  document.addEventListener("keydown", handleKeyDown);

  // Return cleanup function
  return () => {
    document.removeEventListener("keydown", handleKeyDown);

    if (options.returnFocus && previouslyFocused) {
      previouslyFocused.focus();
    }
  };
}

// ── Screen Reader Announcements ─────────────────────────────────────────

let announcementRegion: HTMLDivElement | null = null;

/**
 * Initialize screen reader announcement region (call once in app root)
 */
export function initAnnouncementRegion(): void {
  if (typeof document === "undefined") return;
  
  if (announcementRegion) return;

  announcementRegion = document.createElement("div");
  announcementRegion.setAttribute("role", "status");
  announcementRegion.setAttribute("aria-live", "polite");
  announcementRegion.setAttribute("aria-atomic", "true");
  Object.assign(announcementRegion.style, {
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

  document.body.appendChild(announcementRegion);
}

/**
 * Announce message to screen readers
 */
export function announceToScreenReader(
  message: string,
  priority: AnnouncementPriority = "polite"
): void {
  if (typeof document === "undefined") return;

  // Create region if not exists
  if (!announcementRegion) {
    initAnnouncementRegion();
  }

  if (!announcementRegion) return;

  // Update attributes based on priority
  announcementRegion.setAttribute("aria-live", priority);

  // Clear and set new message
  announcementRegion.textContent = "";

  // Use requestAnimationFrame to ensure screen reader picks up change
  requestAnimationFrame(() => {
    if (announcementRegion) {
      announcementRegion.textContent = message;
    }
  });
}

// ── ARIA Helpers ────────────────────────────────────────────────────────

/**
 * Generate accessible props for interactive elements
 */
export function createAccessibleProps(options: {
  label?: string;
  labelledBy?: string;
  describedBy?: string;
  role?: string;
  isInteractive?: boolean;
}): AccessibleProps {
  const props: AccessibleProps = {};

  if (options.label) {
    props["aria-label"] = options.label;
  }

  if (options.labelledBy) {
    props["aria-labelledby"] = options.labelledBy;
  }

  if (options.describedBy) {
    props["aria-describedby"] = options.describedBy;
  }

  if (options.role) {
    props.role = options.role;
  }

  if (options.isInteractive !== false) {
    props.tabIndex = 0;
  }

  return props;
}

/**
 * Create accessible label for icon-only buttons
 */
export function createIconLabel(label: string): AccessibleProps {
  return {
    "aria-label": label,
    role: "button",
  };
}

// ── Keyboard Navigation ─────────────────────────────────────────────────

/**
 * Create roving tabindex for list items
 */
export function createRovingIndex(
  containerRef: React.RefObject<HTMLElement | null>,
  options: {
    orientation?: "horizontal" | "vertical" | "grid";
    loop?: boolean;
    onSelect?: (index: number) => void;
  } = {}
): {
  currentIndex: number;
  setCurrentIndex: (index: number) => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
} {
  let currentIndex = -1;
  const { orientation = "vertical", loop = true, onSelect } = options;

  const updateIndex = (newIndex: number) => {
    const items = getFocusableElements(containerRef.current);
    
    if (items.length === 0) return;
    
    if (newIndex < 0) newIndex = loop ? items.length - 1 : 0;
    if (newIndex >= items.length) newIndex = loop ? 0 : items.length - 1;
    
    currentIndex = newIndex;
    items[currentIndex]?.focus();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    const items = getFocusableElements(containerRef.current);
    if (items.length === 0) return;

    switch (e.key) {
      case "ArrowDown":
      case "ArrowRight":
        if (orientation === "vertical" && e.key === "ArrowRight") return;
        if (orientation === "horizontal" && e.key === "ArrowDown") return;
        e.preventDefault();
        updateIndex(currentIndex + 1);
        break;

      case "ArrowUp":
      case "ArrowLeft":
        if (orientation === "vertical" && e.key === "ArrowLeft") return;
        if (orientation === "horizontal" && e.key === "ArrowUp") return;
        e.preventDefault();
        updateIndex(currentIndex - 1);
        break;

      case "Home":
        e.preventDefault();
        updateIndex(0);
        break;

      case "End":
        e.preventDefault();
        updateIndex(items.length - 1);
        break;

      case "Enter":
      case " ":
        e.preventDefault();
        if (currentIndex >= 0) {
          onSelect?.(currentIndex);
        }
        break;
    }
  };

  return {
    get currentIndex() { return currentIndex; },
    setCurrentIndex: updateIndex,
    onKeyDown,
  };
}

// ── Color Contrast Checker ──────────────────────────────────────────────

/**
 * Calculate relative luminance of a color
 */
function calculateLuminance(r: number, g: number, b: number): number {
  const [rs, gs, bs] = [r, g, b].map((c) => {
    c = c / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

/**
 * Parse hex color to RGB
 */
export function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16),
      }
    : null;
}

/**
 * Calculate contrast ratio between two colors
 * Returns value between 1:1 and 21:1
 */
export function getContrastRatio(color1: string, color2: string): number {
  const rgb1 = hexToRgb(color1);
  const rgb2 = hexToRgb(color2);

  if (!rgb1 || !rgb2) return 1;

  const lum1 = calculateLuminance(rgb1.r, rgb1.g, rgb1.b);
  const lum2 = calculateLuminance(rgb2.r, rgb2.g, rgb2.b);

  const lighter = Math.max(lum1, lum2);
  const darker = Math.min(lum1, lum2);

  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Check if contrast meets WCAG level
 */
export function checkWCAGContrast(
  foreground: string,
  background: string,
  level: "AA" | "AAA" = "AA",
  largeText = false
): {
  passes: boolean;
  ratio: number;
  required: number;
} {
  const ratio = getContrastRatio(foreground, background);
  
  // WCAG requirements
  const requirements = {
    AA: { normal: 4.5, large: 3 },
    AAA: { normal: 7, large: 4.5 },
  };

  const required = largeText 
    ? requirements[level].large 
    : requirements[level].normal;

  return {
    passes: ratio >= required,
    ratio: Math.round(ratio * 100) / 100,
    required,
  };
}

// ── Reduced Motion Detection ────────────────────────────────────────────

/**
 * Check if user prefers reduced motion
 */
export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Subscribe to reduced motion preference changes
 */
export function onReducedMotionChange(callback: (prefersReduced: boolean) => void): () => void {
  if (typeof window === "undefined") return () => {};

  const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  
  const handler = (e: MediaQueryListEvent) => callback(e.matches);
  mediaQuery.addEventListener("change", handler);

  // Return unsubscribe function
  return () => mediaQuery.removeEventListener("change", handler);
}

// ── Skip Links Generator ────────────────────────────────────────────────

/**
 * Generate skip navigation link HTML
 */
export function generateSkipLinks(links: Array<{
  id: string;
  label: string;
  targetId: string;
}>): string {
  return `
    <nav aria-label="روابط التنقل السريع" class="skip-links">
      ${links
        .map(
          (link) =>
            `<a href="${link.targetId}" class="skip-link">${link.label}</a>`
        )
        .join("")}
    </nav>
  `;
}

// ── Unique ID Generator ─────────────────────────────────────────────────

let idCounter = 0;

/**
 * Generate unique ID for accessibility attributes
 */
export function generateUniqueId(prefix = "garfix"): string {
  idCounter += 1;
  return `${prefix}-${idCounter}-${Math.random().toString(36).substr(2, 9)}`;
}

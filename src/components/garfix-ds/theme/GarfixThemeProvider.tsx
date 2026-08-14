/**
 * GarfixThemeProvider.tsx — GarfiX DS v4.0 Theme System
 *
 * ════════════════════════════════════════════════════════════════════════
 * Complete Dark/Light Mode Implementation
 *
 * FEATURES:
 * - Dark, Light, and System (auto) modes
 * - Smooth transitions between themes
 * - localStorage persistence
 * - CSS custom properties for theming
 * - RTL support
 * - Respects prefers-color-scheme by default
 *
 * DESIGN TOKENS:
 * ────────────────────────────────────────────────────────────────────────
 * Light Mode:
 *   Background: #f0fdf4 (emerald-50)
 *   Surface:    #ffffff
 *   Primary:    #047857 (emerald-700)
 *   Text:       #0b1220
 *
 * Dark Mode:
 *   Background: #0b1220 (deep navy)
 *   Surface:    #111827 (gray-900)
 *   Primary:    #10b981 (emerald-500, brighter for dark)
 *   Text:       #f9fafb
 *
 * USAGE:
 * ```tsx
 * <GarfixThemeProvider defaultTheme="dark">
 *   <App />
 * </GarfixThemeProvider>
 *
 * // Or use the hook
 * const { theme, setTheme, isDark } = useTheme();
 * ```
 * ════════════════════════════════════════════════════════════════════════
 */

"use client";

import React, { createContext, useContext, useEffect, useState, useCallback } from "react";

// ── Types ───────────────────────────────────────────────────────────────

export type ThemeMode = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

export interface ThemeContextValue {
  /** Current theme mode setting */
  theme: ThemeMode;
  /** Resolved theme (actual applied theme) */
  resolvedTheme: ResolvedTheme;
  /** Whether dark mode is active */
  isDark: boolean;
  /** Set theme */
  setTheme: (theme: ThemeMode) => void;
  /** Toggle between light and dark */
  toggleTheme: () => void;
}

// ── Context ─────────────────────────────────────────────────────────────

const ThemeContext = createContext<ThemeContextValue | null>(null);

// ── Storage Key ─────────────────────────────────────────────────────────

const THEME_STORAGE_KEY = "garfix-theme-preference";

// ── Helper Functions ─────────────────────────────────────────────────────

/**
 * Get system color scheme preference
 */
function getSystemTheme(): ResolvedTheme {
  if (typeof window === "undefined") return "dark"; // Default to dark for SSR
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

/**
 * Get stored theme preference
 */
function getStoredTheme(): ThemeMode | null {
  if (typeof window === "undefined") return null;
  
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    if (stored === "light" || stored === "dark" || stored === "system") {
      return stored;
    }
  } catch {
    // Ignore storage errors
  }
  
  return null;
}

/**
 * Store theme preference
 */
function storeTheme(theme: ThemeMode): void {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Ignore storage errors
  }
}

/**
 * Resolve theme mode to actual theme
 */
function resolveTheme(mode: ThemeMode): ResolvedTheme {
  return mode === "system" ? getSystemTheme() : mode;
}

/**
 * Apply theme to document
 */
function applyTheme(theme: ResolvedTheme): void {
  if (typeof document === "undefined") return;

  const root = document.documentElement;

  // Remove existing theme class
  root.classList.remove("light", "dark");

  // Add new theme class
  root.classList.add(theme);

  // Update meta theme-color for mobile browsers
  let metaThemeColor = document.querySelector('meta[name="theme-color"]');
  if (!metaThemeColor) {
    metaThemeColor = document.createElement("meta");
    metaThemeColor.setAttribute("name", "theme-color");
    document.head.appendChild(metaThemeColor);
  }

  // Set appropriate background color
  metaThemeColor.setAttribute(
    "content",
    theme === "dark" ? "#0b1220" : "#f0fdf4"
  );

  // Announce theme change to screen readers
  const announcement = theme === "dark" 
    ? "تم تفعيل الوضع الداكن" 
    : "تم تفعيل الوضع الفاتح";
  
  // Use aria-live region for announcement
  const liveRegion = document.querySelector("[data-theme-announcement]");
  if (liveRegion) {
    liveRegion.textContent = announcement;
  }
}

// ── Hook ────────────────────────────────────────────────────────────────

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within GarfixThemeProvider");
  }
  return context;
}

// ── Provider Props ──────────────────────────────────────────────────────

export interface GarfixThemeProviderProps {
  children: React.ReactNode;
  /** Default theme when no preference stored */
  defaultTheme?: ThemeMode;
  /** Enable smooth transitions on theme change */
  enableTransitions?: boolean;
  /** Transition duration in ms */
  transitionDuration?: number;
  /** Callback on theme change */
  onThemeChange?: (theme: ResolvedTheme) => void;
  /** Class name for wrapper */
  className?: string;
}

// ── Provider Component ──────────────────────────────────────────────────

export const GarfixThemeProvider: React.FC<GarfixThemeProviderProps> = ({
  children,
  defaultTheme = "system",
  enableTransitions = true,
  transitionDuration = 200,
  onThemeChange,
  className,
}) => {
  // Initialize state
  const [theme, setThemeState] = useState<ThemeMode>(defaultTheme);
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>("dark");
  const [mounted, setMounted] = useState(false);

  // Resolve and apply theme
  const updateTheme = useCallback((newTheme: ThemeMode) => {
    const resolved = resolveTheme(newTheme);
    
    setThemeState(newTheme);
    setResolvedTheme(resolved);
    
    storeTheme(newTheme);
    applyTheme(resolved);
    
    onThemeChange?.(resolved);
  }, [onThemeChange]);

  // Toggle between light and dark
  const toggleTheme = useCallback(() => {
    const newTheme: ThemeMode = resolvedTheme === "dark" ? "light" : "dark";
    updateTheme(newTheme);
  }, [resolvedTheme, updateTheme]);

  // Initialize on mount
  useEffect(() => {
    // Get stored preference or use default
    const stored = getStoredTheme() || defaultTheme;
    
    // Apply initial theme
    const resolved = resolveTheme(stored);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time initialization from localStorage + system preference on mount
    setThemeState(stored);
     
    setResolvedTheme(resolved);
    applyTheme(resolved);

    // Mark as mounted (prevents flash of wrong theme)
     
    setMounted(true);

    // Listen for system theme changes
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    
    const handleSystemChange = (e: MediaQueryListEvent) => {
      if (theme === "system") {
        const newResolved = e.matches ? "dark" : "light";
        setResolvedTheme(newResolved);
        applyTheme(newResolved);
        onThemeChange?.(newResolved);
      }
    };

    mediaQuery.addEventListener("change", handleSystemChange);

    return () => {
      mediaQuery.removeEventListener("change", handleSystemChange);
    };
  }, [defaultTheme, onThemeChange, theme]);

  // Context value
  const contextValue: ThemeContextValue = {
    theme,
    resolvedTheme,
    isDark: resolvedTheme === "dark",
    setTheme: updateTheme,
    toggleTheme,
  };

  return (
    <ThemeContext.Provider value={contextValue}>
      {/* Hidden element for screen reader announcements */}
      <div
        data-theme-announcement
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
      />
      
      {/* Theme wrapper */}
      <div
        className={[
          className,
          mounted && enableTransitions && "theme-transitioning",
        ]
          .filter(Boolean)
          .join(" ")}
        style={
          mounted && enableTransitions
            ? ({
                "--theme-transition-duration": `${transitionDuration}ms`,
              } as React.CSSProperties)
            : undefined
        }
        data-theme={resolvedTheme}
        data-theme-setting={theme}
      >
        {children}
      </div>

      {/* Inline style for transitions */}
      {mounted && enableTransitions && (
        <style jsx>{`
          .theme-transitioning,
          .theme-transitioning * {
            transition: 
              background-color var(--theme-transition-duration) ease,
              color var(--theme-transition-duration) ease,
              border-color var(--theme-transition-duration) ease,
              box-shadow var(--theme-transition-duration) ease !important;
          }
        `}</style>
      )}
    </ThemeContext.Provider>
  );
};

GarfixThemeProvider.displayName = "GarfixThemeProvider";

/**
 * GarfixThemeToggle.tsx — GarfiX DS v4.0 Theme Toggle
 *
 * ════════════════════════════════════════════════════════════════════════
 * Theme Switching Component with Multiple Variants
 *
 * VARIANTS:
 * 1. Toggle (switch) - Simple on/off toggle
 * 2. Segmented - Light/Dark/System buttons
 * 3. Dropdown - Menu with options
 * 4. Icon only - Sun/Moon icon button
 *
 * FEATURES:
 * - Animated icon transitions
 * - Keyboard accessible
 * - Screen reader friendly
 * - RTL support
 * - Smooth theme switching animation
 *
 * ════════════════════════════════════════════════════════════════════════
 */

"use client";

import React from "react";
import { Sun, Moon, Monitor, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTheme, ThemeMode } from "./GarfixThemeProvider";

// ── Types ───────────────────────────────────────────────────────────────

export type ToggleVariant = "toggle" | "segmented" | "dropdown" | "icon";
export type ToggleSize = "sm" | "md" | "lg";

export interface GarfixThemeToggleProps {
  /** Visual variant */
  variant?: ToggleVariant;
  /** Size */
  size?: ToggleSize;
  /** Show labels */
  showLabel?: boolean;
  /** Custom class name */
  className?: string;
}

// ── Size Styles ─────────────────────────────────────────────────────────

const sizeStyles: Record<ToggleSize, { container: string; icon: string; label: string }> = {
  sm: {
    container: "h-8 w-8",
    icon: "h-4 w-4",
    label: "text-xs",
  },
  md: {
    container: "h-10 w-10",
    icon: "h-5 w-5",
    label: "text-sm",
  },
  lg: {
    container: "h-12 w-12",
    icon: "h-6 w-6",
    label: "text-base",
  },
};

// ── Theme Options ───────────────────────────────────────────────────────

const themeOptions: Array<{ value: ThemeMode; label: string; icon: React.ReactNode }> = [
  { value: "light", label: "فاتح", icon: <Sun className="h-4 w-4" /> },
  { value: "dark", label: "داكن", icon: <Moon className="h-4 w-4" /> },
  { value: "system", label: "تلقائي", icon: <Monitor className="h-4 w-4" /> },
];

// ════════════════════════════════════════════════════════════════════════
// ICON VARIANT
// ════════════════════════════════════════════════════════════════════════

export const GarfixThemeIcon: React.FC<GarfixThemeToggleProps> = ({
  size = "md",
  className,
}) => {
  const { isDark, toggleTheme } = useTheme();
  const sizes = sizeStyles[size];

  return (
    <button
      onClick={toggleTheme}
      className={cn(
        // Base
        "relative inline-flex items-center justify-center rounded-xl font-medium transition-all duration-200 ease-[cubic-bezier(0.4,0,0.2,1)]",
        
        // Visual
        "bg-muted hover:bg-muted/80 text-foreground",
        "border border-border shadow-sm",
        
        // Focus
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
        
        // Hover effect
        "hover-lift active-press",
        
        // Size
        sizes.container,
        
        // Custom
        className
      )}
      aria-label={isDark ? "التبديل إلى الوضع الفاتح" : "التبديل إلى الوضع الداكن"}
      title={isDark ? "الوضع الفاتح" : "الوضع الداكن"}
    >
      {/* Icons with crossfade */}
      <span className={cn(
        "absolute inset-0 flex items-center justify-center transition-all duration-300",
        isDark ? "opacity-100 rotate-0 scale-100" : "opacity-0 rotate-90 scale-50"
      )}>
        <Moon className={sizes.icon} />
      </span>
      
      <span className={cn(
        "absolute inset-0 flex items-center justify-center transition-all duration-300",
        !isDark ? "opacity-100 rotate-0 scale-100" : "opacity-0 -rotate-90 scale-50"
      )}>
        <Sun className={sizes.icon} />
      </span>
    </button>
  );
};

GarfixThemeIcon.displayName = "GarfixThemeIcon";

// ════════════════════════════════════════════════════════════════════════
// TOGGLE VARIANT (Switch)
// ════════════════════════════════════════════════════════════════════════

export const GarfixThemeSwitch: React.FC<GarfixThemeToggleProps & {
  showLabel?: boolean;
}> = ({
  size = "md",
  showLabel = false,
  className,
}) => {
  const { isDark, toggleTheme } = useTheme();

  return (
    <button
      role="switch"
      aria-checked={isDark}
      aria-label={isDark ? "الوضع الداكن مفعل" : "الوضع الفاتح مفعل"}
      onClick={toggleTheme}
      className={cn(
        "inline-flex items-center gap-3 group",
        className
      )}
    >
      {/* Track */}
      <div
        className={cn(
          "relative inline-flex h-7 w-12 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
          isDark ? "bg-primary" : "bg-muted"
        )}
      >
        {/* Thumb */}
        <span
          className={cn(
            "pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out",
            isDark ? "translate-x-5 rtl:-translate-x-5" : "translate-x-0"
          )}
        >
          {/* Icon inside thumb */}
          <span className={cn(
            "flex h-full w-full items-center justify-center transition-opacity duration-200",
            isDark ? "opacity-100" : "opacity-0"
          )}>
            <Moon className="h-3.5 w-3.5 text-primary" />
          </span>
          <span className={cn(
            "absolute inset-0 flex items-center justify-center transition-opacity duration-200",
            !isDark ? "opacity-100" : "opacity-0"
          )}>
            <Sun className="h-3.5 w-3.5 text-muted-foreground" />
          </span>
        </span>
      </div>

      {/* Label */}
      {showLabel && (
        <span className="text-sm font-medium text-foreground">
          {isDark ? "داكن" : "فاتح"}
        </span>
      )}
    </button>
  );
};

GarfixThemeSwitch.displayName = "GarfixThemeSwitch";

// ════════════════════════════════════════════════════════════════════════
// SEGMENTED VARIANT
// ════════════════════════════════════════════════════════════════════════

export const GarfixThemeSegmented: React.FC<Omit<GarfixThemeToggleProps, "variant">> = ({
  size = "md",
  className,
}) => {
  const { theme, setTheme } = useTheme();

  return (
    <div
      role="radiogroup"
      aria-label="اختر المظهر"
      className={cn(
        "inline-flex items-center rounded-lg bg-muted p-1 gap-1",
        className
      )}
    >
      {themeOptions.map((option) => {
        const isActive = theme === option.value;

        return (
          <button
            key={option.value}
            role="radio"
            aria-checked={isActive}
            onClick={() => setTheme(option.value)}
            className={cn(
              "inline-flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all duration-150",
              isActive && [
                "bg-background text-foreground shadow-sm",
                "border border-border"
              ],
              !isActive && [
                "text-muted-foreground hover:text-foreground",
                "hover:bg-background/50"
              ],
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            )}
          >
            {option.icon}
            <span>{option.label}</span>
            
            {/* Active indicator */}
            {isActive && (
              <Check className="h-3.5 w-3.5 ms-auto" />
            )}
          </button>
        );
      })}
    </div>
  );
};

GarfixThemeSegmented.displayName = "GarfixThemeSegmented";

// ════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT (Default: Icon)
// ════════════════════════════════════════════════════════════════════════

export const GarfixThemeToggle: React.FC<GarfixThemeToggleProps> = ({
  variant = "icon",
  ...props
}) => {
  switch (variant) {
    case "toggle":
      return <GarfixThemeSwitch {...props} />;
    case "segmented":
      return <GarfixThemeSegmented {...props} />;
    case "icon":
    default:
      return <GarfixThemeIcon {...props} />;
  }
};

GarfixThemeToggle.displayName = "GarfixThemeToggle";

// ── Preset Exports ─────────────────────────────────────────────────────

/** Quick access to icon-only toggle */
export default GarfixThemeToggle;

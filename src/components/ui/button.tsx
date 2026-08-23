import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

/**
 * GarfiX Enhanced Button — Level 1 UI Delight
 * 
 * New variants added:
 * - gradient: Brand violet gradient with glow effect
 * - glass: Glassmorphism style for overlays/modals
 * - soft: Subtle background for secondary actions
 * 
 * All variants include:
 * - Smooth cubic-bezier transitions
 * - Hover lift/shadow effects
 * - Active press feedback (scale 0.97)
 * - Focus ring enhancement
 */
const buttonVariants = cva(
  /* Base styles — shared by all variants */
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium " +
  /* Smooth transitions for all interactive states */
  "transition-all duration-200 ease-out " +
  /* Disabled state */
  "disabled:pointer-events-none disabled:opacity-50 " +
  /* SVG icon sizing */
  "[&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 " +
  /* Focus & accessibility */
  "outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] " +
  "aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive " +
  /* Press feedback — subtle scale on click */
  "active-press " +
  /* Mobile touch enhancements */
  "touch-ripple select-none " +
  /* Minimum touch target on mobile */
  "min-h-[44px] sm:min-h-0",
  {
    variants: {
      variant: {
        /* ── Original shadcn variants (enhanced) ── */
        default:
          "bg-primary text-primary-foreground shadow-brand-xs " +
          "hover:shadow-brand-sm hover:bg-primary/90 hover:-translate-y-0.5",
        destructive:
          "bg-destructive text-white shadow-xs " +
          "hover:bg-destructive/90 hover:shadow-md focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40 dark:bg-destructive/60",
        outline:
          "border bg-background shadow-xs " +
          "hover:bg-accent hover:text-accent-foreground hover:shadow-sm hover:border-primary/30 " +
          "dark:bg-input/30 dark:border-input dark:hover:bg-input/50",
        secondary:
          "bg-secondary text-secondary-foreground shadow-xs " +
          "hover:bg-secondary/80 hover:shadow-sm",
        ghost:
          "hover:bg-accent hover:text-accent-foreground hover:shadow-sm dark:hover:bg-accent/50",
        link:
          "text-primary underline-offset-4 hover:underline",

        /* ── NEW: Gradient variant ── */
        /* Premium feel for primary CTAs, hero sections, important actions */
        gradient:
          "gradient-primary text-white shadow-brand-sm " +
          "hover:gradient-primary-hover hover:shadow-brand-lg hover:-translate-y-1 " +
          "focus-visible:ring-primary/40",

        /* ── NEW: Glass variant ── */
        /* For floating action buttons, overlays, modals */
        glass:
          "glass text-foreground shadow-brand-sm " +
          "hover:shadow-brand-md hover:bg-white/80 dark:hover:bg-white/10 " +
          "border border-white/20 dark:border-white/10",

        /* ── NEW: Soft variant ── */
        /* Subtle, friendly alternative to ghost/secondary */
        soft:
          "bg-primary/8 text-primary " +
          "hover:bg-primary/15 hover:shadow-sm " +
          "dark:text-primary-light dark:bg-primary/15 dark:hover:bg-primary/25",

        /* ── NEW: Ghost icon variant ── */
        /* For icon-only buttons in toolbars/sidebars */
        "icon-ghost":
          "text-muted-foreground " +
          "hover:bg-accent hover:text-accent-foreground hover:shadow-sm " +
          "p-2 rounded-lg",
      },
      size: {
        default: "h-9 px-4 py-2 has-[>svg]:px-3",
        sm: "h-8 rounded-md gap-1.5 px-3 has-[>svg]:px-2.5 text-xs",
        lg: "h-11 rounded-lg px-6 has-[>svg]:px-4 text-base font-semibold",
        xl: "h-12 rounded-xl px-8 has-[>svg]:px-5 text-base font-semibold shadow-brand-sm hover:shadow-brand-md",
        icon: "size-9 rounded-lg",
        "icon-sm": "size-8 rounded-md",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot : "button"

  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }

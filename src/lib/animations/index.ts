/**
 * ═════════════════════════════════════════════════════════════
 * GarfiX DS v4.0 - Advanced Animation System (نظام الحركة المتقدم)
 * 
 * Enterprise-grade animation utilities with:
 * - Spring physics engine
 * - Stagger orchestration
 * - Gesture animations
 * - Scroll-triggered animations
 * - Layout animations
 * - Page transitions
 * - Reduced motion support (WCAG 2.1)
 * 
 * Design Tokens:
 * - Duration: 120ms (fast) / 150ms (normal) / 220ms (smooth) / 250ms (slow)
 * - Easing: cubic-bezier custom curves
 * - Spring: stiffness, damping, mass configuration
 * ═════════════════════════════════════════════════════════════
 */

// ── Types ───────────────────────────────────────────────────

export interface SpringConfig {
  stiffness: number;
  damping: number;
  mass: number;
}

export interface AnimationDuration {
  fast: number;    // 120ms - micro-interactions
  normal: number;  // 150ms - standard transitions
  smooth: number;  // 220ms - complex animations
  slow: number;    // 250ms - page transitions
}

export interface EasingCurves {
  /** Default ease-out for enter animations */
  easeOut: string;
  /** Default ease-in for exit animations */
  easeIn: string;
  /** Symmetric ease-in-out */
  easeInOut: string;
  /** Bouncy spring-like curve */
  spring: string;
  /** Sharp deceleration for snappy feel */
  sharp: string;
  /** Gentle ease for subtle transitions */
  gentle: string;
  /** Elastic bounce effect */
  elastic: string;
}

export interface StaggerConfig {
  /** Delay between each item */
  staggerDelay: number;
  /** Start delay before first item */
  startDelay?: number;
  /** Reverse direction */
  reverse?: boolean;
  /** Animate from center outward */
  fromCenter?: boolean;
  /** Only animate items in viewport */
  viewportOnly?: boolean;
}

export interface KeyframeAnimation {
  /** CSS keyframes name or object */
  keyframes: string | Record<string, Record<string, string>>;
  /** Animation duration */
  duration: number;
  /** Timing function */
  easing?: string;
  /** Delay before start */
  delay?: number;
  /** Iteration count */
  iterations?: number | 'infinite';
  /** Fill mode */
  fillMode?: 'none' | 'forwards' | 'backwards' | 'both';
  /** Direction */
  direction?: 'normal' | 'reverse' | 'alternate' | 'alternate-reverse';
}

export interface MotionState {
  /** Current animated values */
  values: Record<string, number>;
  /** Is animation active */
  isAnimating: boolean;
  /** Current velocity for spring calculations */
  velocity?: Record<string, number>;
}

export interface ScrollAnimationConfig {
  /** Trigger when element enters viewport */
  threshold?: number;
  /** Root margin for intersection observer */
  rootMargin?: string;
  /** Only trigger once */
  once?: boolean;
  /** Animation to play on enter */
  onEnter?: string;
  /** Animation to play on leave */
  onLeave?: string;
  /** Custom class to add when visible */
  visibleClass?: string;
}

export interface LayoutAnimationConfig {
  /** Animate layout changes */
  type?: 'spring' | 'tween' | 'decay';
  /** Spring config for layout springs */
  spring?: SpringConfig;
  /** Duration for tween animations */
  duration?: number;
  /** Easing for tween animations */
  easing?: string;
}

// ── Constants ───────────────────────────────────────────────

/**
 * GarfiX DS Animation Durations (milliseconds)
 * Optimized for 60fps performance
 */
export const DURATIONS: AnimationDuration = {
  fast: 120,
  normal: 150,
  smooth: 220,
  slow: 250,
};

/**
 * GarfiX DS Easing Curves
 * Custom cubic-bezier curves for premium feel
 */
export const EASING: EasingCurves = {
  // Standard ease-out (deceleration) - default for most animations
  easeOut: 'cubic-bezier(0.16, 1, 0.3, 1)',
  
  // Ease-in (acceleration) - for exit animations
  easeIn: 'cubic-bezier(0.6, 0.04, 0.98, 0.34)',
  
  // Balanced ease-in-out - for state changes
  easeInOut: 'cubic-bezier(0.65, 0, 0.35, 1)',
  
  // Spring-like bouncy curve - for playful interactions
  spring: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
  
  // Sharp deceleration - for snappy micro-interactions
  sharp: 'cubic-bezier(0.12, 0, 0.24, 1)',
  
  // Gentle ease - for subtle hover effects
  gentle: 'cubic-bezier(0.4, 0, 0.2, 1)',
  
  // Elastic bounce - for attention-grabbing moments
  elastic: 'cubic-bezier(0.68, -0.55, 0.27, 1.55)',
};

/**
 * GarfiX DS Spring Configurations
 * Physics-based spring animations
 */
export const SPRINGS: Record<string, SpringConfig> = {
  /** Snappy spring for buttons and controls */
  snappy: { stiffness: 400, damping: 25, mass: 1 },
  
  /** Smooth spring for modals and overlays */
  smooth: { stiffness: 200, damping: 20, mass: 1 },
  
  /** Gentle spring for hover effects */
  gentle: { stiffness: 150, damping: 15, mass: 1 },
  
  /** Bouncy spring for playful interactions */
  bouncy: { stiffness: 300, damping: 10, mass: 1 },
  
  /** Stiff spring for precise movements */
  stiff: { stiffness: 500, damping: 30, mass: 0.8 },
  
  /** Slow spring for large elements */
  slow: { stiffness: 100, damping: 15, mass: 1.5 },
};

/**
 * GarfiX DS Preset Animations
 * Ready-to-use animation definitions
 */
export const PRESETS: Record<string, KeyframeAnimation> => {
  // ── Enter Animations ──────────────────────────────
  
  /** Fade in from transparent */
  fadeIn: {
    keyframes: 'garfix-fade-in',
    duration: DURATIONS.normal,
    easing: EASING.easeOut,
    fillMode: 'both',
  },
  
  /** Fade in from below with slide */
  fadeUp: {
    keyframes: 'garfix-fade-up',
    duration: DURATIONS.smooth,
    easing: EASING.easeOut,
    fillMode: 'both',
  },
  
  /** Fade in from right (LTR) / left (RTL) */
  fadeInRight: {
    keyframes: 'garfix-fade-in-right',
    duration: DURATIONS.smooth,
    easing: EASING.easeOut,
    fillMode: 'both',
  },
  
  /** Scale up from smaller size */
  scaleIn: {
    keyframes: 'garfix-scale-in',
    duration: DURATIONS.normal,
    easing: EASING.spring,
    fillMode: 'both',
  },
  
  /** Slide down from top (dropdown style) */
  slideDown: {
    keyframes: 'garfix-slide-down',
    duration: DURATIONS.fast,
    easing: EASING.sharp,
    fillMode: 'both',
  },
  
  /** Expand from center */
  expandIn: {
    keyframes: 'garfix-expand-in',
    duration: DURATIONS.smooth,
    easing: EASING.easeOut,
    fillMode: 'both',
  },
  
  // ── Exit Animations ───────────────────────────────
  
  /** Fade out to transparent */
  fadeOut: {
    keyframes: 'garfix-fade-out',
    duration: DURATIONS.fast,
    easing: EASING.easeIn,
    fillMode: 'both',
  },
  
  /** Fade out downward */
  fadeDown: {
    keyframes: 'garfix-fade-down',
    duration: DURATIONS.fast,
    easing: EASING.easeIn,
    fillMode: 'both',
  },
  
  /** Scale down to nothing */
  scaleOut: {
    keyframes: 'garfix-scale-out',
    duration: DURATIONS.fast,
    easing: EASING.easeIn,
    fillMode: 'both',
  },
  
  // ── Attention Animations ──────────────────────────
  
  /** Subtle pulse to draw attention */
  pulse: {
    keyframes: 'garfix-pulse',
    duration: DURATIONS.slow,
    easing: EASING.easeInOut,
    iterations: 3,
  },
  
  /** Shake for errors */
  shake: {
    keyframes: 'garfix-shake',
    duration: DURATIONS.smooth,
    easing: EASING.easeInOut,
    iterations: 4,
  },
  
  /** Bounce to celebrate success */
  bounce: {
    keyframes: 'garfix-bounce',
    duration: DURATIONS.smooth,
    easing: EASING.spring,
    iterations: 3,
  },
  
  /** Highlight flash for new content */
  highlight: {
    keyframes: 'garfix-highlight',
    duration: DURATIONS.smooth,
    easing: EASING.easeInOut,
    iterations: 2,
  },
  
  // ── Loading Animations ────────────────────────────
  
  /** Spinner rotation */
  spin: {
    keyframes: 'garfix-spin',
    duration: 1000,
    easing: 'linear',
    iterations: 'infinite',
  },
  
  /** Dots loading indicator */
  dots: {
    keyframes: 'garfix-dots',
    duration: 1400,
    easing: EASING.easeInOut,
    iterations: 'infinite',
  },
  
  /** Progress shimmer effect */
  shimmer: {
    keyframes: 'garfix-shimmer',
    duration: 1500,
    easing: EASING.easeInOut,
    iterations: 'infinite',
  },
  
  // ── Interaction Animations ────────────────────────
  
  /** Hover lift effect */
  hoverLift: {
    keyframes: 'garfix-hover-lift',
    duration: DURATIONS.normal,
    easing: EASING.easeOut,
    fillMode: 'both',
  },
  
  /** Active press effect */
  pressScale: {
    keyframes: 'garfix-press-scale',
    duration: DURATIONS.fast,
    easing: EASING.easeIn,
    fillMode: 'both',
  },
};

/**
 * Stagger Configuration Presets
 */
export const STAGGER_PRESETS: Record<string, StaggerConfig> = {
  /** Fast stagger for lists */
  fast: { staggerDelay: 50 },
  
  /** Normal stagger for cards */
  normal: { staggerDelay: 80 },
  
  /** Slow stagger for dramatic reveals */
  slow: { staggerDelay: 120 },
  
  /** Grid stagger (diagonal pattern) */
  grid: { staggerDelay: 60, fromCenter: true },
  
  /** Menu stagger (cascade from top) */
  menu: { staggerDelay: 40, startDelay: 0 },
};

// ── Utility Functions ──────────────────────────────────────

/**
 * Generate CSS custom properties for animation config
 */
export function getAnimationVars(
  duration: number,
  easing: string,
  delay: number = 0
): Record<string, string> {
  return {
    '--garfix-animation-duration': `${duration}ms`,
    '--garfix-animation-easing': easing,
    '--garfix-animation-delay': `${delay}ms`,
  };
}

/**
 * Calculate stagger delay for index
 */
export function getStaggerDelay(
  index: number,
  config: StaggerConfig = STAGGER_PRESETS.normal
): number {
  const { staggerDelay, startDelay = 0, reverse, fromCenter } = config;
  
  let adjustedIndex = index;
  if (reverse) adjustedIndex = -index;
  if (fromCenter) adjustedIndex = Math.abs(index - Math.floor(index / 2));
  
  return startDelay + adjustedIndex * staggerDelay;
}

/**
 * Generate animation styles object
 */
export function getAnimationStyle(
  preset: KeyframeAnimation,
  delay: number = 0
): React.CSSProperties {
  return {
    animationName: preset.keyframes as string,
    animationDuration: `${preset.duration}ms`,
    animationTimingFunction: preset.easing || EASING.easeOut,
    animationDelay: `${delay}ms`,
    animationIterationCount: typeof preset.iterations === 'number' 
      ? String(preset.iterations) 
      : preset.iterations || '1',
    animationFillMode: preset.fillMode || 'both',
    animationDirection: preset.direction || 'normal',
  };
}

/**
 * Check if user prefers reduced motion
 */
export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Get animation config respecting reduced motion preference
 */
export function getAccessibleAnimation(
  preset: KeyframeAnimation,
  fallbackOpacity: boolean = true
): React.CSSProperties | null {
  if (prefersReducedMotion()) {
    return fallbackOpacity 
      ? { opacity: 1, transition: 'opacity 0ms' }
      : { animation: 'none' };
  }
  return getAnimationStyle(preset);
}

/**
 * Spring physics calculation for custom animations
 */
export function calculateSpring(
  current: number,
  target: number,
  velocity: number = 0,
  config: SpringConfig = SPRINGS.smooth
): { value: number; newVelocity: number } {
  const { stiffness, damping, mass } = config;
  
  // Hooke's law with damping
  const springForce = -stiffness * (current - target);
  const dampingForce = -damping * velocity;
  const acceleration = (springForce + dampingForce) / mass;
  
  // Euler integration (simplified)
  const newVelocity = velocity + acceleration * (1 / 60); // Assuming 60fps
  const value = current + newVelocity * (1 / 60);
  
  return { value, newVelocity };
}

/**
 * Create stagger children renderer
 */
export function createStaggerChildren<T>(
  children: T[],
  renderChild: (item: T, index: number, style: React.CSSProperties) => React.ReactNode,
  config: StaggerConfig = STAGGER_PRESETS.normal,
  animationPreset: KeyframeAnimation = PRESETS.fadeUp
): React.ReactNode[] {
  return children.map((child, index) => {
    const delay = getStaggerDelay(index, config);
    const style = getAnimationStyle(animationPreset, delay);
    return renderChild(child, index, style);
  });
}

// ── CSS Keyframes Generator ────────────────────────────────

/**
 * Generate @keyframes CSS for all presets
 * Call this once to inject keyframes into document
 */
export function injectKeyframes(): void {
  if (typeof document === 'undefined') return;
  
  // Check if already injected
  if (document.getElementById('garfix-animations-keyframes')) return;
  
  const styleEl = document.createElement('style');
  styleEl.id = 'garfix-animations-keyframes';
  styleEl.textContent = KEYFRAMES_CSS;
  document.head.appendChild(styleEl);
}

/**
 * Complete CSS keyframes for all GarfiX animations
 */
export const KEYFRAMES_CSS = `
  /* ══ GarfiX DS v4.0 - Animation Keyframes ══ */
  
  /* ── Enter Animations ──────────────────── */
  @keyframes garfix-fade-in {
    from { opacity: 0; }
    to { opacity: 1; }
  }
  
  @keyframes garfix-fade-up {
    from { 
      opacity: 0; 
      transform: translateY(16px); 
    }
    to { 
      opacity: 1; 
      transform: translateY(0); 
    }
  }
  
  @keyframes garfix-fade-in-right {
    from { 
      opacity: 0; 
      transform: translateX(-16px); 
    }
    to { 
      opacity: 1; 
      transform: translateX(0); 
    }
  }
  
  [dir="rtl"] @keyframes garfix-fade-in-right {
    from { 
      opacity: 0; 
      transform: translateX(16px); 
    }
    to { 
      opacity: 1; 
      transform: translateX(0); 
    }
  }
  
  @keyframes garfix-scale-in {
    from { 
      opacity: 0; 
      transform: scale(0.92); 
    }
    to { 
      opacity: 1; 
      transform: scale(1); 
    }
  }
  
  @keyframes garfix-slide-down {
    from { 
      opacity: 0; 
      transform: translateY(-8px) scaleY(0.95);
      transform-origin: top center;
    }
    to { 
      opacity: 1; 
      transform: translateY(0) scaleY(1);
    }
  }
  
  @keyframes garfix-expand-in {
    from { 
      opacity: 0; 
      transform: scale(0.9);
      clip-path: circle(0% at center);
    }
    to { 
      opacity: 1; 
      transform: scale(1);
      clip-path: circle(100% at center);
    }
  }
  
  /* ── Exit Animations ───────────────────── */
  @keyframes garfix-fade-out {
    from { opacity: 1; }
    to { opacity: 0; }
  }
  
  @keyframes garfix-fade-down {
    from { 
      opacity: 1; 
      transform: translateY(0); 
    }
    to { 
      opacity: 0; 
      transform: translateY(8px); 
    }
  }
  
  @keyframes garfix-scale-out {
    from { 
      opacity: 1; 
      transform: scale(1); 
    }
    to { 
      opacity: 0; 
      transform: scale(0.92); 
    }
  }
  
  /* ── Attention Animations ──────────────── */
  @keyframes garfix-pulse {
    0%, 100% { 
      opacity: 1; 
      transform: scale(1); 
    }
    50% { 
      opacity: 0.7; 
      transform: scale(1.03); 
    }
  }
  
  @keyframes garfix-shake {
    0%, 100% { transform: translateX(0); }
    10%, 30%, 50%, 70%, 90% { transform: translateX(-4px); }
    20%, 40%, 60%, 80% { transform: translateX(4px); }
  }
  
  @keyframes garfix-bounce {
    0%, 100% { 
      transform: translateY(0) scale(1); 
      animation-timing-function: ease-out;
    }
    25% { 
      transform: translateY(-12px) scale(1.02); 
      animation-timing-function: ease-in;
    }
    50% { 
      transform: translateY(0) scale(0.98); 
      animation-timing-function: ease-out;
    }
  }
  
  @keyframes garfix-highlight {
    0%, 100% { 
      background-color: transparent; 
    }
    50% { 
      background-color: rgba(212, 165, 116, 0.15); 
    }
  }
  
  /* ── Loading Animations ────────────────── */
  @keyframes garfix-spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }
  
  @keyframes garfix-dots {
    0%, 80%, 100% { 
      transform: scale(0.6);
      opacity: 0.5;
    }
    40% { 
      transform: scale(1);
      opacity: 1;
    }
  }
  
  @keyframes garfix-shimmer {
    0% { 
      background-position: -200% 0; 
    }
    100% { 
      background-position: 200% 0; 
    }
  }
  
  /* ── Interaction Animations ────────────── */
  @keyframes garfix-hover-lift {
    from { 
      transform: translateY(0) scale(1); 
      box-shadow: 0 1px 3px rgba(0,0,0,0.08);
    }
    to { 
      transform: translateY(-4px) scale(1.01); 
      box-shadow: 0 12px 24px rgba(0,0,0,0.12);
    }
  }
  
  @keyframes garfix-press-scale {
    from { transform: scale(1); }
    to { transform: scale(0.97); }
  }
  
  /* ── Page Transitions ──────────────────── */
  @keyframes garfix-page-enter {
    from { 
      opacity: 0; 
      transform: translateY(20px) scale(0.98);
      filter: blur(4px);
    }
    to { 
      opacity: 1; 
      transform: translateY(0) scale(1);
      filter: blur(0);
    }
  }
  
  @keyframes garfix-page-exit {
    from { 
      opacity: 1; 
      transform: translateY(0) scale(1);
    }
    to { 
      opacity: 0; 
      transform: translateY(-20px) scale(0.98);
    }
  }
  
  /* ── Layout Animations ─────────────────── */
  @keyframes garfix-layout-switch {
    from { 
      opacity: 0.5;
      transform: scale(0.98);
    }
    to { 
      opacity: 1;
      transform: scale(1);
    }
  }
  
  /* ── Number Counter ────────────────────── */
  @keyframes garfix-count-up {
    from { --garfix-count: 0; }
    to { --garfix-count: var(--garfix-target); }
  }
  
  /* ── Skeleton Shimmer ──────────────────── */
  @keyframes garfix-skeleton-shimmer {
    0% { 
      background-position: -200% 0;
    }
    100% { 
      background-position: 200% 0;
    }
  }

  /* ── RTL-Aware Slide Animations ────────── */
  @keyframes garfix-slide-left {
    from { transform: translateX(100%); }
    to { transform: translateX(0); }
  }
  
  @keyframes garfix-slide-right {
    from { transform: translateX(-100%); }
    to { transform: translateX(0); }
  }
  
  [dir="rtl"] @keyframes garfix-slide-left {
    from { transform: translateX(-100%); }
    to { transform: translateX(0); }
  }
  
  [dir="rtl"] @keyframes garfix-slide-right {
    from { transform: translateX(100%); }
    to { transform: translateX(0); }
  }
`;

export default {
  DURATIONS,
  EASING,
  SPRINGS,
  PRESETS,
  STAGGER_PRESETS,
  getAnimationVars,
  getStaggerDelay,
  getAnimationStyle,
  prefersReducedMotion,
  getAccessibleAnimation,
  calculateSpring,
  createStaggerChildren,
  injectKeyframes,
  KEYFRAMES_CSS,
};

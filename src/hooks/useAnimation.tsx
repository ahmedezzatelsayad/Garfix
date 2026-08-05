/**
 * ═════════════════════════════════════════════════════════════
 * GarfiX DS v4.0 - Animation Hooks (خطاطيف الحركة)
 * 
 * Custom React hooks for animation control:
 * - useAnimation: Core animation state management
 * - useSpring: Physics-based spring animations
 * - useStagger: Orchestrated list animations
 * - useScrollAnimation: Viewport-triggered animations
 * - useReducedMotion: Accessibility-aware motion control
 * - usePageTransition: Page enter/exit animations
 * ═════════════════════════════════════════════════════════════
 */

'use client';

import { useState, useEffect, useRef, useCallback, useContext, createContext } from 'react';
import {
  DURATIONS,
  EASING,
  SPRINGS,
  PRESETS,
  STAGGER_PRESETS,
  getAnimationStyle,
  getStaggerDelay,
  prefersReducedMotion,
  getAccessibleAnimation,
  calculateSpring,
  injectKeyframes,
  type SpringConfig,
  type StaggerConfig,
  type KeyframeAnimation,
  type MotionState,
} from '@/lib/animations';

// ── Context ─────────────────────────────────────────────────

interface AnimationContextValue {
  prefersReducedMotion: boolean;
  isReducedMotion: boolean;
}

const AnimationContext = createContext<AnimationContextValue>({
  prefersReducedMotion: false,
  isReducedMotion: false,
});

export const useAnimationContext = () => useContext(AnimationContext);

export function AnimationProvider({ children }: { children: React.ReactNode }) {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  
  useEffect(() => {
    // Inject keyframes on mount
    injectKeyframes();
    
    // Check reduced motion preference
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setPrefersReducedMotion(mq.matches);
    
    const handler = (e: MediaQueryListEvent) => setPrefersReducedMotion(e.matches);
    mq.addEventListener('change', handler);
    
    return () => mq.removeEventListener('change', handler);
  }, []);
  
  return (
    <AnimationContext.Provider value={{ prefersReducedMotion, isReducedMotion: prefersReducedMotion }}>
      {children}
    </AnimationContext.Provider>
  );
}

// ── Hook: useAnimation ──────────────────────────────────────

interface UseAnimationOptions {
  /** Initial animation state */
  initial?: 'entering' | 'entered' | 'exiting' | 'exited';
  /** Animation preset for entering */
  enterAnimation?: KeyframeAnimation;
  /** Animation preset for exiting */
  exitAnimation?: KeyframeAnimation;
  /** Duration override */
  duration?: number;
  /** Auto-start on mount */
  autoEnter?: boolean;
  /** Callback when animation completes */
  onComplete?: (state: string) => void;
}

interface UseAnimationReturn {
  /** Current animation state */
  state: string;
  /** Computed style for current animation */
  style: React.CSSProperties;
  /** Whether currently animating */
  isAnimating: boolean;
  /** Trigger enter animation */
  enter: () => void;
  /** Trigger exit animation */
  exit: () => void;
  /** Toggle between entered/exited */
  toggle: () => void;
  /** Reset to initial state */
  reset: () => void;
}

export function useAnimation(options: UseAnimationOptions = {}): UseAnimationReturn {
  const {
    initial = 'exited',
    enterAnimation = PRESETS.fadeIn,
    exitAnimation = PRESETS.fadeOut,
    autoEnter = true,
    onComplete,
  } = options;
  
  const [state, setState] = useState(initial);
  const [isAnimating, setIsAnimating] = useState(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  const clearAnimationTimeout = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);
  
  const getStyle = useCallback((animationState: string): React.CSSProperties => {
    if (prefersReducedMotion()) {
      return animationState === 'entered' || animationState === 'entering'
        ? { opacity: 1 }
        : { opacity: 0 };
    }
    
    switch (animationState) {
      case 'entering':
        return getAnimationStyle(enterAnimation);
      case 'exiting':
        return getAnimationStyle(exitAnimation);
      case 'entered':
        return { opacity: 1, transition: `opacity ${DURATIONS.fast}ms` };
      case 'exited':
      default:
        return { opacity: 0, pointerEvents: 'none' as const };
    }
  }, [enterAnimation, exitAnimation]);
  
  const enter = useCallback(() => {
    clearAnimationTimeout();
    setState('entering');
    setIsAnimating(true);
    
    timeoutRef.current = setTimeout(() => {
      setState('entered');
      setIsAnimating(false);
      onComplete?.('entered');
    }, enterAnimation.duration);
  }, [enterAnimation.duration, clearAnimationTimeout, onComplete]);
  
  const exit = useCallback(() => {
    clearAnimationTimeout();
    setState('exiting');
    setIsAnimating(true);
    
    timeoutRef.current = setTimeout(() => {
      setState('exited');
      setIsAnimating(false);
      onComplete?.('exited');
    }, exitAnimation.duration);
  }, [exitAnimation.duration, clearAnimationTimeout, onComplete]);
  
  const toggle = useCallback(() => {
    if (state === 'exited' || state === 'exiting') {
      enter();
    } else {
      exit();
    }
  }, [state, enter, exit]);
  
  const reset = useCallback(() => {
    clearAnimationTimeout();
    setState(initial);
    setIsAnimating(false);
  }, [clearAnimationTimeout, initial]);
  
  useEffect(() => {
    if (autoEnter && initial === 'exited') {
      // Small delay to ensure DOM is ready
      const id = requestAnimationFrame(() => {
        requestAnimationFrame(enter);
      });
      return () => cancelAnimationFrame(id);
    }
  }, []);
  
  useEffect(() => {
    return () => clearAnimationTimeout();
  }, [clearAnimationTimeout]);
  
  return {
    state,
    style: getStyle(state),
    isAnimating,
    enter,
    exit,
    toggle,
    reset,
  };
}

// ── Hook: useSpring ─────────────────────────────────────────

interface UseSpringOptions {
  /** Target value to animate to */
  to: number | Record<string, number>;
  /** Starting value */
  from?: number | Record<string, number>;
  /** Spring physics config */
  springConfig?: SpringConfig;
  /** Callback on each frame */
  onUpdate?: (value: number | Record<string, number>) => void;
  /** Callback when settled */
  onSettle?: (value: number | Record<string, number>) => void;
  /** Auto-start */
  immediate?: boolean;
}

interface UseSpringReturn {
  /** Current animated value(s) */
  value: number | Record<string, number>;
  /** Set new target */
  set: (to: number | Record<string, number>) => void;
  /** Current velocity */
  velocity: number | Record<string, number>;
  /** Is still animating */
  isAnimating: boolean;
  /** Stop animation */
  stop: () => void;
  /** Reset to initial */
  reset: () => void;
}

export function useSpring(options: UseSpringOptions): UseSpringReturn {
  const {
    to: initialTo,
    from: initialFrom = 0,
    springConfig = SPRINGS.smooth,
    onUpdate,
    onSettle,
    immediate = true,
  } = options;
  
  const [value, setValue] = useState<number | Record<string, number>>(initialFrom);
  const [velocity, setVelocity] = useState<number | Record<string,number>>(0);
  const [isAnimating, setIsAnimating] = useState(false);
  
  const targetRef = useRef(initialTo);
  const velocityRef = useRef(typeof initialFrom === 'number' ? 0 : {});
  const rafRef = useRef<number | null>(null);
  const valueRef = useRef(value);
  
  const isSingleValue = typeof initialTo === 'number';
  
  const step = useCallback(() => {
    if (isSingleValue) {
      const current = typeof valueRef.current === 'number' 
        ? valueRef.current 
        : 0;
      const target = typeof targetRef.current === 'number' 
        ? targetRef.current 
        : 0;
      const vel = typeof velocityRef.current === 'number' 
        ? velocityRef.current 
        : 0;
      
      const { value: newValue, newVelocity } = calculateSpring(
        current,
        target,
        vel,
        springConfig
      );
      
      velocityRef.current = newVelocity;
      valueRef.current = newValue;
      setValue(newValue);
      setVelocity(newVelocity);
      onUpdate?.(newValue);
      
      // Check if settled (velocity near zero and close to target)
      if (Math.abs(newVelocity) < 0.01 && Math.abs(newValue - target) < 0.01) {
        setValue(target);
        setVelocity(0);
        setIsAnimating(false);
        onSettle?.(target);
        return;
      }
    }
    
    rafRef.current = requestAnimationFrame(step);
  }, [isSingleValue, springConfig, onUpdate, onSettle]);
  
  const start = useCallback(() => {
    if (rafRef.current) return;
    setIsAnimating(true);
    rafRef.current = requestAnimationFrame(step);
  }, [step]);
  
  const stop = useCallback(() => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    setIsAnimating(false);
  }, []);
  
  const set = useCallback((newTarget: number | Record<string, number>) => {
    targetRef.current = newTarget;
    if (!isAnimating) {
      start();
    }
  }, [isAnimating, start]);
  
  const reset = useCallback(() => {
    stop();
    setValue(initialFrom);
    setVelocity(typeof initialFrom === 'number' ? 0 : {});
    targetRef.current = initialTo;
  }, [stop, initialFrom, initialTo]);
  
  useEffect(() => {
    if (immediate) {
      start();
    }
    return () => stop();
  }, []);
  
  return {
    value,
    set,
    velocity,
    isAnimating,
    stop,
    reset,
  };
}

// ── Hook: useStagger ────────────────────────────────────────

interface UseStaggerOptions {
  /** Number of items to stagger */
  count: number;
  /** Stagger configuration */
  config?: StaggerConfig;
  /** Animation preset for each item */
  animationPreset?: KeyframeAnimation;
  /** Start stagger automatically */
  autoStart?: boolean;
}

interface UseStaggerReturn {
  /** Get animation style for specific index */
  getStyle: (index: number) => React.CSSProperties;
  /** All items have completed animation */
  isComplete: boolean;
  /** Restart stagger from beginning */
  restart: () => void;
  /** Current visible indices */
  visibleIndices: number[];
}

export function useStagger(options: UseStaggerOptions): UseStaggerReturn {
  const {
    count,
    config = STAGGER_PRESETS.normal,
    animationPreset = PRESETS.fadeUp,
    autoStart = true,
  } = options;
  
  const [visibleIndices, setVisibleIndices] = useState<number[]>([]);
  const [isComplete, setIsComplete] = useState(false);
  const timeoutsRef = useRef<NodeJS.Timeout[]>([]);
  
  const clearAllTimeouts = useCallback(() => {
    timeoutsRef.current.forEach(clearTimeout);
    timeoutsRef.current = [];
  }, []);
  
  const getStyle = useCallback((index: number): React.CSSProperties => {
    if (prefersReducedMotion()) {
      return { opacity: 1 };
    }
    
    const delay = getStaggerDelay(index, config);
    return getAnimationStyle(animationPreset, delay);
  }, [config, animationPreset]);
  
  const start = useCallback(() => {
    clearAllTimeouts();
    setVisibleIndices([]);
    setIsComplete(false);
    
    const totalDuration = getStaggerDelay(count - 1, config) + animationPreset.duration;
    
    for (let i = 0; i < count; i++) {
      const delay = getStaggerDelay(i, config);
      const timeout = setTimeout(() => {
        setVisibleIndices(prev => [...prev, i]);
      }, delay);
      timeoutsRef.current.push(timeout);
    }
    
    const completeTimeout = setTimeout(() => {
      setIsComplete(true);
    }, totalDuration + 50); // Small buffer
    
    timeoutsRef.current.push(completeTimeout);
  }, [count, config, animationPreset, clearAllTimeouts]);
  
  const restart = useCallback(() => {
    start();
  }, [start]);
  
  useEffect(() => {
    if (autoStart) {
      start();
    }
    return clearAllTimeouts;
  }, []);
  
  return {
    getStyle,
    isComplete,
    restart,
    visibleIndices,
  };
}

// ── Hook: useScrollAnimation ────────────────────────────────

interface UseScrollAnimationOptions {
  /** Threshold for intersection (0-1) */
  threshold?: number;
  /** Root margin */
  rootMargin?: string;
  /** Only trigger once */
  once?: boolean;
  /** Animation class to add */
  animationClass?: string;
  /** Custom enter callback */
  onEnter?: (entry: IntersectionObserverEntry) => void;
  /** Custom leave callback */
  onLeave?: (entry: IntersectionObserverEntry) => void;
}

interface UseScrollAnimationReturn {
  ref: React.RefObject<HTMLElement | null>;
  /** Is element in viewport */
  isInView: boolean;
  /** Has been viewed at least once */
  hasBeenInView: boolean;
  /** Entry data from observer */
  entry: IntersectionObserverEntry | null;
}

export function useScrollAnimation(
  options: UseScrollAnimationOptions = {}
): UseScrollAnimationReturn {
  const {
    threshold = 0.1,
    rootMargin = '0px',
    once = true,
    onEnter,
    onLeave,
  } = options;
  
  const ref = useRef<HTMLElement | null>(null);
  const [isInView, setIsInView] = useState(false);
  const [hasBeenInView, setHasBeenInView] = useState(false);
  const [entry, setEntry] = useState<IntersectionObserverEntry | null>(null);
  
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    
    const observer = new IntersectionObserver(
      ([entry]) => {
        setEntry(entry);
        setIsInView(entry.isIntersecting);
        
        if (entry.isIntersecting) {
          setHasBeenInView(true);
          onEnter?.(entry);
          
          if (once) {
            observer.unobserve(element);
          }
        } else if (!once) {
          onLeave?.(entry);
        }
      },
      { threshold, rootMargin }
    );
    
    observer.observe(element);
    
    return () => observer.disconnect();
  }, [threshold, rootMargin, once, onEnter, onLeave]);
  
  return { ref, isInView, hasBeenInView, entry };
}

// ── Hook: useReducedMotion ──────────────────────────────────

interface UseReducedMotionReturn {
  /** User prefers reduced motion */
  prefersReducedMotion: boolean;
  /** Should disable animations */
  shouldReduceMotion: boolean;
  /** Get safe animation style (fallback if reduced motion) */
  getSafeStyle: (style: React.CSSProperties) => React.CSSProperties;
}

export function useReducedMotion(): UseReducedMotionReturn {
  const [prefersReduced, setPrefersReduced] = useState(false);
  
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setPrefersReduced(mq.matches);
    
    const handler = (e: MediaQueryListEvent) => setPrefersReduced(e.matches);
    mq.addEventListener('change', handler);
    
    return () => mq.removeEventListener('change', handler);
  }, []);
  
  const getSafeStyle = useCallback(
    (style: React.CSSProperties): React.CSSProperties => {
      if (prefersReduced) {
        return { ...style, animation: 'none', transition: 'none' };
      }
      return style;
    },
    [prefersReduced]
  );
  
  return {
    prefersReducedMotion: prefersReduced,
    shouldReduceMotion: prefersReduced,
    getSafeStyle,
  };
}

// ── Hook: useHoverAnimation ─────────────────────────────────

interface UseHoverAnimationOptions {
  /** Scale on hover */
  scale?: number;
  /** Y translation on hover */
  translateY?: number;
  /** Shadow on hover */
  elevation?: number;
  /** Duration */
  duration?: number;
  /** Enable for touch devices */
  enableOnTouch?: boolean;
}

interface UseHoverAnimationReturn {
  style: React.CSSProperties;
  handlers: {
    onMouseEnter: () => void;
    onMouseLeave: () => void;
    onTouchStart: () => void;
    onTouchEnd: () => void;
  };
  isHovered: boolean;
}

export function useHoverAnimation(
  options: UseHoverAnimationOptions = {}
): UseHoverAnimationReturn {
  const {
    scale = 1.02,
    translateY = -4,
    elevation = 8,
    duration = DURATIONS.normal,
    enableOnTouch = false,
  } = options;
  
  const [isHovered, setIsHovered] = useState(false);
  const [isTouch, setIsTouch] = useState(false);
  
  useEffect(() => {
    const checkTouch = () => {
      setIsTouch('ontouchstart' in window || navigator.maxTouchPoints > 0);
    };
    checkTouch();
  }, []);
  
  const shouldAnimate = enableOnTouch || !isTouch;
  
  const style: React.CSSProperties = isHovered && shouldAnimate
    ? {
        transform: `translateY(${translateY}px) scale(${scale})`,
        boxShadow: `0 ${elevation}px ${elevation * 2}px rgba(0, 0, 0, 0.12)`,
        transition: `transform ${duration}ms ${EASING.easeOut}, box-shadow ${duration}ms ${EASING.easeOut}`,
      }
    : {
        transform: 'translateY(0) scale(1)',
        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.08)',
        transition: `transform ${duration}ms ${EASING.easeOut}, box-shadow ${duration}ms ${EASING.easeOut}`,
      };
  
  const handlers = {
    onMouseEnter: () => shouldAnimate && setIsHovered(true),
    onMouseLeave: () => shouldAnimate && setIsHovered(false),
    onTouchStart: () => enableOnTouch && setIsHovered(true),
    onTouchEnd: () => enableOnTouch && setTimeout(() => setIsHovered(false), 150),
  };
  
  return { style, handlers, isHovered };
}

// ── Hook: usePressAnimation ─────────────────────────────────

interface UsePressAnimationOptions {
  /** Scale when pressed */
  scale?: number;
  /** Duration */
  duration?: number;
}

interface UsePressAnimationReturn {
  style: React.CSSProperties;
  handlers: {
    onMouseDown: () => void;
    onMouseUp: () => void;
    onMouseLeave: () => void;
    onTouchStart: () => void;
    onTouchEnd: () => void;
  };
  isPressed: boolean;
}

export function usePressAnimation(
  options: UsePressAnimationOptions = {}
): UsePressAnimationReturn {
  const { scale = 0.97, duration = DURATIONS.fast } = options;
  const [isPressed, setIsPressed] = useState(false);
  
  const style: React.CSSProperties = isPressed
    ? {
        transform: `scale(${scale})`,
        transition: `transform ${duration}ms ${EASING.easeIn}`,
      }
    : {
        transform: 'scale(1)',
        transition: `transform ${duration}ms ${EASING.easeIn}`,
      };
  
  const activate = () => setIsPressed(true);
  const deactivate = () => setIsPressed(false);
  
  const handlers = {
    onMouseDown: activate,
    onMouseUp: deactivate,
    onMouseLeave: deactivate,
    onTouchStart: activate,
    onTouchEnd: deactivate,
  };
  
  return { style, handlers, isPressed };
}

// ── Hook: useNumberAnimation ─────────────────────────────────

interface UseNumberAnimationOptions {
  /** Target number */
  target: number;
  /** Starting number */
  from?: number;
  /** Duration in ms */
  duration?: number;
  /** Decimal places */
  decimals?: number;
  /** Prefix (e.g., "$") */
  prefix?: string;
  /** Suffix (e.g., "%") */
  suffix?: string;
  /** Auto-start */
  autoStart?: boolean;
  /** Format with locale */
  locale?: string;
}

interface UseNumberAnimationReturn {
  /** Current animated value */
  value: number;
  /** Formatted string display */
  display: string;
  /** Start/restart animation */
  start: () => void;
  /** Is animating */
  isAnimating: boolean;
  /** Progress 0-1 */
  progress: number;
}

export function useNumberAnimation(
  options: UseNumberAnimationOptions
): UseNumberAnimationReturn {
  const {
    target,
    from = 0,
    duration = DURATIONS.slow * 4, // Longer duration for counting effect
    decimals = 0,
    prefix = '',
    suffix = '',
    autoStart = true,
    locale = 'ar-EG',
  } = options;
  
  const [value, setValue] = useState(from);
  const [isAnimating, setIsAnimating] = useState(false);
  const [progress, setProgress] = useState(0);
  const startTimeRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);
  
  const easeOutCubic = (t: number): number => 1 - Math.pow(1 - t, 3);
  
  const animate = useCallback((timestamp: number) => {
    if (!startTimeRef.current) startTimeRef.current = timestamp;
    
    const elapsed = timestamp - startTimeRef.current;
    const rawProgress = Math.min(elapsed / duration, 1);
    const easedProgress = easeOutCubic(rawProgress);
    
    const currentValue = from + (target - from) * easedProgress;
    setValue(currentValue);
    setProgress(rawProgress);
    
    if (rawProgress < 1) {
      rafRef.current = requestAnimationFrame(animate);
    } else {
      setValue(target);
      setProgress(1);
      setIsAnimating(false);
    }
  }, [from, target, duration]);
  
  const start = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    
    startTimeRef.current = null;
    setValue(from);
    setProgress(0);
    setIsAnimating(true);
    
    rafRef.current = requestAnimationFrame(animate);
  }, [from, animate]);
  
  useEffect(() => {
    if (autoStart) {
      start();
    }
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);
  
  const display = `${prefix}${value.toLocaleString(locale, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}${suffix}`;
  
  return { value, display, start, isAnimating, progress };
}

const useAnimationExports = {
  useAnimation,
  useSpring,
  useStagger,
  useScrollAnimation,
  useReducedMotion,
  useHoverAnimation,
  usePressAnimation,
  useNumberAnimation,
  AnimationProvider,
  useAnimationContext,
};

export default useAnimationExports;

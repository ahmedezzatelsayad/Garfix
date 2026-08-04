/**
 * ═════════════════════════════════════════════════════════════
 * GarfiX DS v4.0 - Animated Container (حاوية متحركة)
 * 
 * Wrapper component that provides animation capabilities:
 * - Enter/exit animations
 * - Stagger children
 * - Scroll-triggered reveals
 * - Reduced motion support
 * ═════════════════════════════════════════════════════════════
 */

'use client';

import React, { useRef, useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import {
  PRESETS,
  STAGGER_PRESETS,
  getAnimationStyle,
  getStaggerDelay,
  prefersReducedMotion,
  injectKeyframes,
  type KeyframeAnimation,
  type StaggerConfig,
} from '@/lib/animations';

// ── Types ───────────────────────────────────────────────────

export interface AnimatedContainerProps {
  /** Container content */
  children: React.ReactNode;
  
  // Animation Presets
  /** Animation preset name or custom config */
  animation?: KeyframeAnimation | keyof typeof PRESETS;
  /** Delay before animation starts */
  delay?: number;
  /** Animation duration override */
  duration?: number;
  
  // Stagger
  /** Enable stagger for children */
  stagger?: boolean | StaggerConfig;
  /** Only animate visible children */
  viewportOnly?: boolean;
  
  // States
  /** Initial visibility */
  initialHidden?: boolean;
  /** Show on mount with animation */
  animateOnMount?: boolean;
  
  // Scroll Trigger
  /** Animate when in viewport */
  scrollAnimate?: boolean;
  /** Intersection threshold */
  threshold?: number;
  /** Only trigger once */
  once?: boolean;
  
  // Styling
  /** Additional CSS classes */
  className?: string;
  /** Inline styles */
  style?: React.CSSProperties;
  /** HTML element to render */
  as?: React.ElementType;
  
  // Callbacks
  /** Called when animation starts */
  onAnimationStart?: () => void;
  /** Called when animation ends */
  onAnimationEnd?: () => void;
  
  // Accessibility
  /** Hide from screen readers while hidden */
  srOnlyWhenHidden?: boolean;
}

// ── Component ───────────────────────────────────────────────

export function GarfixAnimatedContainer({
  children,
  animation = 'fadeUp',
  delay = 0,
  duration,
  stagger = false,
  viewportOnly = false,
  initialHidden = true,
  animateOnMount = true,
  scrollAnimate = false,
  threshold = 0.1,
  once = true,
  className,
  style: customStyle,
  as: Component = 'div',
  onAnimationStart,
  onAnimationEnd,
  srOnlyWhenHidden = false,
}: AnimatedContainerProps) {
  const containerRef = useRef<HTMLElement>(null);
  const [isVisible, setIsVisible] = useState(!initialHidden);
  const [hasAnimated, setHasAnimated] = useState(false);
  
  // Inject keyframes on mount
  useEffect(() => {
    injectKeyframes();
  }, []);
  
  // Handle scroll-triggered animation
  useEffect(() => {
    if (!scrollAnimate || !containerRef.current) return;
    
    const element = containerRef.current;
    
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && (!once || !hasAnimated)) {
          setIsVisible(true);
          setHasAnimated(true);
          onAnimationStart?.();
        }
      },
      { threshold, rootMargin: '0px 0px -50px 0px' }
    );
    
    observer.observe(element);
    
    return () => observer.disconnect();
  }, [scrollAnimate, threshold, once, hasAnimated, onAnimationStart]);
  
  // Handle mount animation
  useEffect(() => {
    if (animateOnMount && !scrollAnimate && initialHidden) {
      const timer = setTimeout(() => {
        setIsVisible(true);
        onAnimationStart?.();
      }, delay + 50); // Small buffer for DOM ready
      
      return () => clearTimeout(timer);
    }
  }, [animateOnMount, scrollAnimate, initialHidden, delay, onAnimationStart]);
  
  // Get animation preset
  const getPreset = (): KeyframeAnimation => {
    if (typeof animation === 'string') {
      return PRESETS[animation] || PRESETS.fadeUp;
    }
    return animation;
  };
  
  // Generate style
  const getStyle = (): React.CSSProperties => {
    const baseStyle: React.CSSProperties = {
      ...customStyle,
    };
    
    // If reduced motion preferred, just show/hide without animation
    if (prefersReducedMotion()) {
      return {
        ...baseStyle,
        opacity: isVisible ? 1 : 0,
        transition: 'opacity 0ms',
      };
    }
    
    if (!isVisible && initialHidden) {
      return {
        ...baseStyle,
        opacity: 0,
        pointerEvents: 'none' as const,
      };
    }
    
    const preset = getPreset();
    const animDuration = duration || preset.duration;
    
    return {
      ...baseStyle,
      ...getAnimationStyle(preset, delay),
      animationDuration: `${animDuration}ms`,
    };
  };
  
  // Handle animation end
  const handleAnimationEnd = () => {
    onAnimationEnd?.();
  };
  
  // Render staggered children
  const renderChildren = () => {
    if (!stagger || !React.Children.count(children)) {
      return children;
    }
    
    const config: StaggerConfig = stagger === true 
      ? STAGGER_PRESETS.normal 
      : stagger;
    
    const preset = getPreset();
    
    return React.Children.map(children, (child, index) => {
      if (!React.isValidElement(child)) return child;
      
      const staggerDelay = getStaggerDelay(index, config);
      
      return (
        <span
          key={index}
          style={getAnimationStyle(preset, staggerDelay)}
          className="inline-block"
        >
          {child}
        </span>
      );
    });
  };
  
  // Build props
  const containerProps = {
    ref: containerRef,
    className: cn(
      'garfix-animated-container',
      isVisible && 'garfix-visible',
      className
    ),
    style: getStyle(),
    onAnimationEnd: handleAnimationEnd,
    ...(srOnlyWhenHidden && !isVisible && { role: 'status', 'aria-hidden': 'true' }),
  };
  
  return (
    <Component {...containerProps}>
      {renderChildren()}
    </Component>
  );
}

// ── Sub-components ──────────────────────────────────────────

/** Fade in animation wrapper */
export function FadeIn(props: Omit<AnimatedContainerProps, 'animation'>) {
  return <GarfixAnimatedContainer {...props} animation="fadeIn" />;
}

/** Fade up animation wrapper */
export function FadeUp(props: Omit<AnimatedContainerProps, 'animation'>) {
  return <GarfixAnimatedContainer {...props} animation="fadeUp" />;
}

/** Scale in animation wrapper */
export function ScaleIn(props: Omit<AnimatedContainerProps, 'animation'>) {
  return <GarfixAnimatedContainer {...props} animation="scaleIn" />;
}

/** Slide down animation (for dropdowns) */
export function SlideDown(props: Omit<AnimatedContainerProps, 'animation'>) {
  return <GarfixAnimatedContainer {...props} animation="slideDown" />;
}

export default GarfixAnimatedContainer;

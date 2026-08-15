/**
 * ═════════════════════════════════════════════════════════════
 * GarfiX DS v4.0 - Page Transition (انتقال الصفحات)
 * 
 * Smooth page transition components:
 * - Page enter/exit animations
 * - Route change transitions
 * - Layout transitions
 * - Loading states with skeleton
 * ═════════════════════════════════════════════════════════════
 */

'use client';

import React, { useState, useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';
import {
  DURATIONS,
  EASING,
  PRESETS,
  getAnimationStyle,
  prefersReducedMotion,
  injectKeyframes,
} from '@/lib/animations';

// ── Types ───────────────────────────────────────────────────

export interface PageTransitionProps {
  /** Current page content */
  children: React.ReactNode;
  
  // Animation Config
  /** Enter animation preset */
  enterAnimation?: 'fade' | 'slideUp' | 'scale' | 'blur' | 'slideRight' | 'none';
  /** Exit animation preset */
  exitAnimation?: 'fade' | 'slideDown' | 'scale' | 'none';
  /** Transition duration */
  duration?: number;
  
  // State
  /** Show loading state during transition */
  showLoading?: boolean;
  /** Loading component */
  loadingComponent?: React.ReactNode;
  /** Minimum display time for loading */
  minDisplayTime?: number;
  
  // Mode
  /** Wait for content to load before entering */
  waitForContent?: boolean;
  /** Content is ready flag */
  isReady?: boolean;
  
  // Styling
  className?: string;
  containerClassName?: string;
  
  // Callbacks
  onEnter?: () => void;
  onExit?: () => void;
  onEnterComplete?: () => void;
}

interface TransitionStage {
  phase: 'exiting' | 'loading' | 'entering' | 'entered' | 'idle';
}

// ── Component ───────────────────────────────────────────────

export function GarfixPageTransition({
  children,
  enterAnimation = 'slideUp',
  exitAnimation = 'fade',
  duration = DURATIONS.slow,
  showLoading = false,
  loadingComponent,
  minDisplayTime = 300,
  waitForContent: _waitForContent = false,
  isReady = true,
  className,
  containerClassName,
  onEnter,
  onExit,
  onEnterComplete,
}: PageTransitionProps) {
  const [stage, setStage] = useState<TransitionStage>({ phase: 'idle' });
  const [displayChildren, setDisplayChildren] = useState<React.ReactNode>(children);
  const [isVisible, setIsVisible] = useState(true);
  const contentRef = useRef<HTMLDivElement>(null);
  const prevChildrenRef = useRef(children);
  
  // Inject keyframes
  useEffect(() => {
    injectKeyframes();
  }, []);
  
  // Get enter animation style
  const getEnterStyle = (): React.CSSProperties => {
    if (prefersReducedMotion()) return {};
    
    switch (enterAnimation) {
      case 'fade':
        return getAnimationStyle(PRESETS.fadeIn, 0);
      case 'slideUp':
        return getAnimationStyle(PRESETS.fadeUp, 0);
      case 'scale':
        return getAnimationStyle(PRESETS.scaleIn, 0);
      case 'blur':
        return {
          opacity: 0,
          filter: 'blur(8px)',
          transform: 'translateY(10px) scale(0.99)',
          animation: `garfix-page-enter ${duration}ms ${EASING.easeOut} forwards`,
        };
      case 'slideRight':
        return getAnimationStyle(PRESETS.fadeInRight, 0);
      default:
        return {};
    }
  };
  
  // Handle children changes (route changes)
  useEffect(() => {
    if (prevChildrenRef.current === children) return;
    
    const handleTransition = async () => {
      // Phase 1: Exit current content
      if (exitAnimation !== 'none') {
        setStage({ phase: 'exiting' });
        setIsVisible(false);
        onExit?.();
        
        await new Promise(resolve => setTimeout(resolve, DURATIONS.fast));
      }
      
      // Phase 2: Show loading (if enabled)
      if (showLoading && !isReady) {
        setStage({ phase: 'loading' });
        
        // Wait for content + minimum display time
        await new Promise(resolve => setTimeout(resolve, minDisplayTime));
      }
      
      // Phase 3: Enter new content
      setStage({ phase: 'entering' });
      setDisplayChildren(children);
      setIsVisible(true);
      onEnter?.();
      
      await new Promise(resolve => setTimeout(resolve, duration));
      
      // Phase 4: Complete
      setStage({ phase: 'entered' });
      onEnterComplete?.();
      
      setTimeout(() => {
        setStage({ phase: 'idle' });
      }, 50);
      
      prevChildrenRef.current = children;
    };
    
    handleTransition();
  }, [children, exitAnimation, showLoading, isReady, duration, minDisplayTime, onExit, onEnter, onEnterComplete]);
  
  // Determine what to render
  const renderContent = () => {
    if (stage.phase === 'loading') {
      return loadingComponent || <DefaultPageLoader />;
    }
    
    return displayChildren;
  };
  
  return (
    <div
      className={cn(
        'garfix-page-transition',
        `phase-${stage.phase}`,
        containerClassName
      )}
      aria-busy={stage.phase === 'loading' || stage.phase === 'entering'}
      aria-live="polite"
    >
      <div
        ref={contentRef}
        className={cn(
          'garfix-page-content',
          isVisible && 'visible',
          !isVisible && 'exiting',
          className
        )}
        style={{
          ...(stage.phase === 'entering' && getEnterStyle()),
          ...(stage.phase === 'exiting' && {
            opacity: 0,
            transform: exitAnimation === 'slideDown' ? 'translateY(-10px)' : undefined,
            transition: `all ${DURATIONS.fast}ms ${EASING.easeIn}`,
          }),
          ...(stage.phase === 'idle' && { opacity: 1 }),
        }}
      >
        {renderContent()}
      </div>
    </div>
  );
}

// ── Default Loader ──────────────────────────────────────────

function DefaultPageLoader() {
  return (
    <div className="flex flex-col items-center justify-center py-20 gap-4" role="status">
      {/* Animated spinner */}
      <div 
        className="w-12 h-12 rounded-full border-3 border-emerald-200 border-t-emerald-600"
        style={{ animation: `garfix-spin 1000ms linear infinite` }}
        aria-label="جاري التحميل..."
      />
      
      {/* Animated dots */}
      <div className="flex gap-1.5">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="w-2 h-2 rounded-full bg-emerald-500"
            style={{
              animation: `garfix-dots 1400ms ease-in-out infinite`,
              animationDelay: `${i * 150}ms`,
            }}
          />
        ))}
      </div>
      
      <span className="text-sm text-gray-500 dark:text-gray-400 mt-2">
        جاري تحميل المحتوى...
      </span>
    </div>
  );
}

// ── Sub-components ──────────────────────────────────────────

/** Fade page transition */
export function FadeTransition(props: Omit<PageTransitionProps, 'enterAnimation'>) {
  return <GarfixPageTransition {...props} enterAnimation="fade" />;
}

/** Slide up page transition (default) */
export function SlideUpTransition(props: Omit<PageTransitionProps, 'enterAnimation'>) {
  return <GarfixPageTransition {...props} enterAnimation="slideUp" />;
}

/** Blur page transition (premium feel) */
export function BlurTransition(props: Omit<PageTransitionProps, 'enterAnimation'>) {
  return <GarfixPageTransition {...props} enterAnimation="blur" />;
}

// ── Layout Transition Wrapper ───────────────────────────────

export interface LayoutTransitionProps {
  children: React.ReactNode;
  layoutId?: string;
  className?: string;
  /** Animate size changes */
  animateSize?: boolean;
  /** Animate position changes */
  animatePosition?: boolean;
}

export function GarfixLayoutTransition({
  children,
  layoutId,
  className,
  animateSize = true,
  animatePosition = true,
}: LayoutTransitionProps) {
  return (
    <div
      data-layout-id={layoutId}
      className={cn('garfix-layout-transition', className)}
      style={{
        transition: [
          animateSize && `width ${DURATIONS.smooth}ms ${EASING.easeOut}`,
          animateSize && `height ${DURATIONS.smooth}ms ${EASING.easeOut}`,
          animatePosition && `transform ${DURATIONS.smooth}ms ${EASING.easeOut}`,
        ].filter(Boolean).join(', '),
      }}
    >
      {children}
    </div>
  );
}

export default GarfixPageTransition;

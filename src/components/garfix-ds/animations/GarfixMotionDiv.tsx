/**
 * ═════════════════════════════════════════════════════════════
 * GarfiX DS v4.0 - Motion Div (عنصر حركي)
 * 
 * High-level motion component with gesture support:
 * - Hover animations (lift, glow, scale)
 * - Press/tap animations
 * - Drag support
 * - Layout animations
 * - Motion values
 * ═════════════════════════════════════════════════════════════
 */

'use client';

import React, { useState, useCallback, useRef } from 'react';
import { cn } from '@/lib/utils';
import {
  DURATIONS,
  EASING,
  prefersReducedMotion,
} from '@/lib/animations';
import {
  useHoverAnimation,
  usePressAnimation,
} from '@/hooks/useAnimation';

// ── Types ───────────────────────────────────────────────────

interface MotionDivProps {
  children: React.ReactNode;
  
  // Hover Effects
  /** Enable hover lift effect */
  hoverLift?: boolean;
  /** Custom hover scale */
  hoverScale?: number;
  /** Hover Y translation */
  hoverY?: number;
  /** Add shadow on hover */
  hoverElevation?: boolean | number;
  
  // Press Effects
  /** Enable press scale effect */
  pressScale?: boolean;
  /** Custom press scale value */
  pressScaleValue?: number;
  
  // Drag
  /** Enable dragging */
  draggable?: boolean;
  /** Axis constraint ('x' | 'y' | 'both') */
  dragAxis?: 'x' | 'y' | 'both';
  /** Drag boundary element selector */
  dragBoundary?: string;
  /** On drag callback */
  onDrag?: (delta: { x: number; y: number }) => void;
  /** On drag end callback */
  onDragEnd?: (delta: { x: number; y: number }) => void;
  
  // Initial Animation
  /** Initial state animation */
  initial?: 'fadeIn' | 'fadeUp' | 'scaleIn' | 'none';
  /** Delay before initial animation */
  initialDelay?: number;
  
  // Layout
  /** Animate layout changes */
  layout?: boolean;
  /** Layout animation type */
  layoutId?: string;
  
  // Styling
  className?: string;
  style?: React.CSSProperties;
  
  // Events
  onClick?: () => void;
  onFocus?: () => void;
  onBlur?: () => void;
  
  // Accessibility
  /** Role attribute */
  role?: string;
  /** Tab index */
  tabIndex?: number;
  /** ARIA label */
  ariaLabel?: string;
}

// ── Component ───────────────────────────────────────────────

export function GarfixMotionDiv({
  children,
  hoverLift = false,
  hoverScale = 1.02,
  hoverY = -4,
  hoverElevation = false,
  pressScale = true,
  pressScaleValue = 0.97,
  draggable = false,
  dragAxis = 'both',
  dragBoundary,
  onDrag,
  onDragEnd,
  initial = 'none',
  initialDelay = 0,
  layout = false,
  layoutId,
  className,
  style: customStyle,
  onClick,
  onFocus,
  onBlur,
  role,
  tabIndex,
  ariaLabel,
}: MotionDivProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [dragDelta, setDragDelta] = useState({ x: 0, y: 0 });
  const divRef = useRef<HTMLDivElement>(null);
  
  // Hover animation hook
  const { style: hoverStyle, handlers: hoverHandlers } = useHoverAnimation({
    scale: hoverScale,
    translateY: hoverY,
    elevation: typeof hoverElevation === 'number' ? hoverElevation : hoverElevation ? 8 : 0,
    enableOnTouch: false,
  });
  
  // Press animation hook
  const { style: pressStyle, handlers: pressHandlers } = usePressAnimation({
    scale: pressScaleValue,
  });
  
  // Drag handlers
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (!draggable) return;
    
    e.preventDefault();
    setIsDragging(true);
    setDragStart({ x: e.clientX, y: e.clientY });
    setDragDelta({ x: 0, y: 0 });
    
    divRef.current?.setPointerCapture(e.pointerId);
  }, [draggable]);
  
  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!isDragging) return;
    
    let deltaX = e.clientX - dragStart.x;
    let deltaY = e.clientY - dragStart.y;
    
    // Apply axis constraints
    if (dragAxis === 'x') deltaY = 0;
    if (dragAxis === 'y') deltaX = 0;
    
    // Apply boundary constraints
    if (dragBoundary && divRef.current) {
      const boundary = document.querySelector(dragBoundary);
      if (boundary) {
        const rect = boundary.getBoundingClientRect();
        const elemRect = divRef.current.getBoundingClientRect();
        
        deltaX = Math.max(-elemRect.left + rect.left, Math.min(deltaX, rect.right - elemRect.right));
        deltaY = Math.max(-elemRect.top + rect.top, Math.min(deltaY, rect.bottom - elemRect.bottom));
      }
    }
    
    setDragDelta({ x: deltaX, y: deltaY });
    onDrag?.({ x: deltaX, y: deltaY });
  }, [isDragging, dragStart, dragAxis, dragBoundary, onDrag]);
  
  const handlePointerUp = useCallback(() => {
    if (!isDragging) return;
    
    setIsDragging(false);
    onDragEnd?.(dragDelta);
    
    // Snap back animation could go here
    setTimeout(() => setDragDelta({ x: 0, y: 0 }), 150);
  }, [isDragging, dragDelta, onDragEnd]);
  
  // Compute final style
  const computeStyle = (): React.CSSProperties => {
    // Base style
    let style: React.CSSProperties = {
      ...customStyle,
      position: draggable ? 'relative' : (customStyle?.position || 'relative'),
      cursor: draggable ? (isDragging ? 'grabbing' : 'grab') : undefined,
      userSelect: isDragging ? 'none' : undefined,
      touchAction: draggable ? 'none' : undefined,
      
      // Reduced motion fallback
      ...(prefersReducedMotion() && {
        transition: 'transform 0ms',
        animation: 'none',
      }),
    };
    
    // Apply hover styles
    if (hoverLift && !isDragging) {
      style = { ...style, ...hoverStyle };
    }
    
    // Apply press styles (override hover when pressed)
    // Note: In a real implementation, you'd track press state separately
    
    // Apply drag transform
    if (isDragging && (dragDelta.x !== 0 || dragDelta.y !== 0)) {
      const currentTransform = style.transform || '';
      style.transform = `translate(${dragDelta.x}px, ${dragDelta.y}px) ${currentTransform}`;
      style.zIndex = 1000;
    }
    
    // Initial animation state
    if (initial !== 'none') {
      style.animationDelay = `${initialDelay}ms`;
    }
    
    // Layout animation
    if (layout) {
      style.transition = `${style.transition || ''}, 
        width ${DURATIONS.smooth}ms ${EASING.easeOut}, 
        height ${DURATIONS.smooth}ms ${EASING.easeOut}`;
    }
    
    return style;
  };
  
  // Get initial animation class
  const getInitialClass = (): string => {
    switch (initial) {
      case 'fadeIn':
        return 'animate-[garfix-fade-in_150ms_ease-out_both]';
      case 'fadeUp':
        return 'animate-[garfix-fade-up_220ms_ease-out_both]';
      case 'scaleIn':
        return 'animate-[garfix-scale-in_150ms_spring_both]';
      default:
        return '';
    }
  };
  
  return (
    <div
      ref={divRef}
      role={role}
      tabIndex={tabIndex}
      aria-label={ariaLabel}
      className={cn(
        'garfix-motion-div',
        hoverLift && 'hover-lift-enabled',
        pressScale && 'press-scale-enabled',
        draggable && 'draggable',
        isDragging && 'is-dragging',
        getInitialClass(),
        className
      )}
      style={computeStyle()}
      onClick={onClick}
      onFocus={onFocus}
      onBlur={onBlur}
      onMouseEnter={hoverHandlers.onMouseEnter}
      onMouseLeave={hoverHandlers.onMouseLeave}
      onMouseDown={pressHandlers.onMouseDown}
      onMouseUp={pressHandlers.onMouseUp}
      onMouseLeaveCapture={pressHandlers.onMouseLeave}
      onTouchStart={pressHandlers.onTouchStart}
      onTouchEnd={pressHandlers.onTouchEnd}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    >
      {children}
    </div>
  );
}

// ── Preset Variants ────────────────────────────────────────

/** Card-like motion wrapper with hover and press effects */
export function MotionCard({ children, className, ...props }: Omit<MotionDivProps, 'hoverLift' | 'pressScale'>) {
  return (
    <GarfixMotionDiv
      hoverLift
      pressScale
      hoverElevation={12}
      hoverY={-6}
      className={cn('rounded-xl', className)}
      {...props}
    >
      {children}
    </GarfixMotionDiv>
  );
}

/** Button-like motion wrapper */
export function MotionButton({ children, className, ...props }: Omit<MotionDivProps, 'pressScale'>) {
  return (
    <GarfixMotionDiv
      pressScale
      pressScaleValue={0.95}
      hoverScale={1.05}
      className={cn('inline-flex items-center justify-center', className)}
      {...props}
    >
      {children}
    </GarfixMotionDiv>
  );
}

/** List item with stagger-ready animation */
export function MotionListItem({ 
  children, 
  index = 0, 
  className, 
  ...props 
}: Omit<MotionDivProps, 'initialDelay'> & { index?: number }) {
  return (
    <GarfixMotionDiv
      initial="fadeUp"
      initialDelay={index * 60}
      className={cn('block', className)}
      {...props}
    >
      {children}
    </GarfixMotionDiv>
  );
}

export default GarfixMotionDiv;

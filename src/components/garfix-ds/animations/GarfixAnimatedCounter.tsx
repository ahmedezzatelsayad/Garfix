/**
 * ═════════════════════════════════════════════════════════════
 * GarfiX DS v4.0 - Animated Counter (عداد متحرك)
 * 
 * Number animation component:
 * - Animated counting up/down
 * - Percentage display with ring
 * - Currency formatting
 * - Locale support (Arabic)
 * ═════════════════════════════════════════════════════════════
 */

'use client';

import React, { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import {
  DURATIONS,
  EASING,
  prefersReducedMotion,
} from '@/lib/animations';

// ── Types ───────────────────────────────────────────────────

export interface AnimatedCounterProps {
  /** Target value */
  value: number;
  /** Starting value */
  from?: number;
  
  // Formatting
  /** Decimal places */
  decimals?: number;
  /** Prefix string (e.g., "$", "EGP ") */
  prefix?: string;
  /** Suffix string (e.g., "%", "K") */
  suffix?: string;
  /** Locale for number formatting */
  locale?: string;
  /** Abbreviate large numbers */
  abbreviate?: boolean;
  
  // Animation
  /** Animation duration in ms */
  duration?: number;
  /** Auto-start on mount */
  autoStart?: boolean;
  /** Easing function */
  easing?: (t: number) => number;
  
  // Styling
  className?: string;
  /** Style for the value container */
  valueClassName?: string;
  /** Show color change based on trend */
  trend?: 'up' | 'down' | 'neutral';
  
  // Callbacks
  onComplete?: (finalValue: number) => void;
}

export interface CircularProgressProps {
  /** Progress percentage 0-100 */
  progress: number;
  /** Size in pixels */
  size?: number;
  /** Stroke width */
  strokeWidth?: number;
  /** Primary color */
  color?: string;
  /** Track/background color */
  trackColor?: string;
  /** Show percentage text */
  showLabel?: boolean;
  /** Label formatter */
  labelFormatter?: (value: number) => string;
  className?: string;
}

// ── Helper Functions ────────────────────────────────────────

/**
 * Easing functions for counter animation
 */
const EASING_FUNCTIONS = {
  linear: (t: number) => t,
  easeOut: (t: number) => 1 - Math.pow(1 - t, 3),
  easeInOut: (t: number) => t < 0.5 
    ? 4 * t * t * t 
    : 1 - Math.pow(-2 * t + 2, 3) / 2,
};

/**
 * Abbreviate large numbers (e.g., 1500 -> 1.5K)
 */
function abbreviateNumber(num: number, decimals: number = 1): string {
  const absNum = Math.abs(num);
  
  if (absNum >= 1_000_000_000) {
    return `${(num / 1_000_000_000).toFixed(decimals)}B`;
  }
  if (absNum >= 1_000_000) {
    return `${(num / 1_000_000).toFixed(decimals ?? 1)}M`;
  }
  if (absNum >= 1_000) {
    return `${(num / 1_000).toFixed(decimals)}K`;
  }
  
  return num.toFixed(decimals);
}

// ── Component: AnimatedCounter ──────────────────────────────

export function GarfixAnimatedCounter({
  value,
  from = 0,
  decimals = 0,
  prefix = '',
  suffix = '',
  locale = 'ar-EG',
  abbreviate = false,
  duration = DURATIONS.slow * 5,
  autoStart = true,
  easing = EASING_FUNCTIONS.easeOut,
  className,
  valueClassName,
  trend = 'neutral',
  onComplete,
}: AnimatedCounterProps) {
  const [displayValue, setDisplayValue] = useState(from);
  const startTimeRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);
  const hasCompleted = useRef(false);
  
  useEffect(() => {
    if (prefersReducedMotion()) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- animation: set final value immediately when reduced motion is preferred
      setDisplayValue(value);
      onComplete?.(value);
      return;
    }
    
    if (!autoStart) return;
    
    const animate = (timestamp: number) => {
      if (!startTimeRef.current) startTimeRef.current = timestamp;
      
      const elapsed = timestamp - startTimeRef.current;
      const rawProgress = Math.min(elapsed / duration, 1);
      const easedProgress = easing(rawProgress);
      
      const currentValue = from + (value - from) * easedProgress;
      setDisplayValue(currentValue);
      
      if (rawProgress < 1) {
        rafRef.current = requestAnimationFrame(animate);
      } else {
        setDisplayValue(value);
        hasCompleted.current = true;
        onComplete?.(value);
      }
    };
    
    rafRef.current = requestAnimationFrame(animate);
    
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [value, from, duration, autoStart, easing, onComplete]);
  
  // Format the display value
  const formatValue = (val: number): string => {
    const formatted = abbreviate
      ? abbreviateNumber(val, decimals)
      : val.toLocaleString(locale, {
          minimumFractionDigits: decimals,
          maximumFractionDigits: decimals,
        });
    
    return `${prefix}${formatted}${suffix}`;
  };
  
  // Trend colors
  const trendColors = {
    up: 'text-emerald-600 dark:text-emerald-400',
    down: 'text-red-500 dark:text-red-400',
    neutral: '',
  };
  
  return (
    <span
      className={cn(
        'garfix-animated-counter',
        'tabular-nums',
        trendColors[trend],
        className
      )}
      role="status"
      aria-live="polite"
      aria-label={`${prefix}${value.toLocaleString(locale)}${suffix}`}
    >
      <span className={cn('counter-value', valueClassName)}>
        {formatValue(displayValue)}
      </span>
    </span>
  );
}

// ── Component: CircularProgress ─────────────────────────────

export function GarfixCircularProgress({
  progress,
  size = 120,
  strokeWidth = 8,
  color = '#047857',
  trackColor = 'rgba(0, 0, 0, 0.08)',
  showLabel = true,
  labelFormatter,
  className,
}: CircularProgressProps) {
  // Clamp progress between 0-100
  const clampedProgress = Math.max(0, Math.min(100, progress));
  
  // SVG calculations
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (clampedProgress / 100) * circumference;
  const center = size / 2;
  
  // Animated offset
  const [animatedOffset, setAnimatedOffset] = useState(circumference);
  const [_isVisible, setIsVisible] = useState(false);
  
  useEffect(() => {
    if (prefersReducedMotion()) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- animation: set final value immediately when reduced motion is preferred
      setAnimatedOffset(offset);
      return;
    }
    
    setIsVisible(true);
    
    const startTime = performance.now();
    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const animProgress = Math.min(elapsed / DURATIONS.slow / 3, 1);
      const easedProgress = 1 - Math.pow(1 - animProgress, 3); // easeOut
      
      const currentOffset = circumference - (circumference - offset) * easedProgress;
      setAnimatedOffset(currentOffset);
      
      if (animProgress < 1) {
        requestAnimationFrame(animate);
      }
    };
    
    requestAnimationFrame(animate);
  }, [offset, circumference]);
  
  // Determine color based on progress
  const getProgressColor = (): string => {
    if (clampedProgress >= 80) return '#047857'; // Emerald for high
    if (clampedProgress >= 50) return '#d4a574'; // Gold for medium
    return '#dc2626'; // Red for low
  };
  
  const currentColor = color || getProgressColor();
  
  return (
    <div
      className={cn('garfix-circular-progress', 'inline-flex items-center justify-center', className)}
      role="progressbar"
      aria-valuenow={Math.round(clampedProgress)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={`${Math.round(clampedProgress)}%`}
    >
      <svg
        width={size}
        height={size}
        className="-rotate-90"
        viewBox={`0 0 ${size} ${size}`}
      >
        {/* Background track */}
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke={trackColor}
          strokeWidth={strokeWidth}
        />
        
        {/* Progress arc */}
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke={currentColor}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={animatedOffset}
          style={{
            transition: `stroke-dashoffset ${DURATIONS.smooth}ms ${EASING.easeOut}`,
          }}
        />
      </svg>
      
      {/* Center label */}
      {showLabel && (
        <span className="absolute text-sm font-semibold tabular-nums">
          {labelFormatter ? labelFormatter(clampedProgress) : `${Math.round(clampedProgress)}%`}
        </span>
      )}
    </div>
  );
}

// ── Component: StatCounter ──────────────────────────────────

export interface StatCounterProps {
  /** Current value */
  value: number;
  /** Previous value for comparison */
  previousValue?: number;
  /** Label */
  label?: string;
  /** Prefix */
  prefix?: string;
  /** Suffix */
  suffix?: string;
  /** Show trend indicator */
  showTrend?: boolean;
  /** Format as currency */
  isCurrency?: boolean;
  /** Currency code */
  currency?: string;
  className?: string;
}

export function GarfixStatCounter({
  value,
  previousValue,
  label,
  prefix,
  suffix,
  showTrend = true,
  isCurrency = false,
  currency = 'EGP',
  className,
}: StatCounterProps) {
  // Calculate change
  const change = previousValue !== undefined ? value - previousValue : 0;
  const changePercent = previousValue !== undefined && previousValue !== 0
    ? ((change / Math.abs(previousValue)) * 100)
    : 0;
  const isPositive = change > 0;
  
  // Format options
  const _formatOptions: Intl.NumberFormatOptions = {
    minimumFractionDigits: isCurrency ? 2 : 0,
    maximumFractionDigits: isCurrency ? 2 : 1,
  };
  
  const formattedPrefix = isCurrency ? `${currency} ` : (prefix || '');
  
  return (
    <div className={cn('garfix-stat-counter flex flex-col gap-1', className)}>
      {label && (
        <span className="text-xs font-medium text-muted-foreground">
          {label}
        </span>
      )}
      
      <div className="flex items-baseline gap-2">
        <GarfixAnimatedCounter
          value={value}
          prefix={formattedPrefix}
          suffix={suffix}
          decimals={isCurrency ? 2 : 1}
          trend={showTrend && previousValue !== undefined 
            ? (isPositive ? 'up' : change < 0 ? 'down' : 'neutral')
            : 'neutral'
          }
          className="text-2xl font-bold"
        />
        
        {showTrend && previousValue !== undefined && change !== 0 && (
          <span
            className={cn(
              'inline-flex items-center gap-0.5 text-xs font-medium px-1.5 py-0.5 rounded-full',
              isPositive
                ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                : 'bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-400'
            )}
          >
            {isPositive ? '↑' : '↓'}
            {Math.abs(changePercent).toFixed(1)}%
          </span>
        )}
      </div>
    </div>
  );
}

export default GarfixAnimatedCounter;

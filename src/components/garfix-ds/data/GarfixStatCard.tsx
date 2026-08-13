/**
 * GarfixStatCard.tsx — GarfiX DS v4.0 Statistics Card
 *
 * ════════════════════════════════════════════════════════════════════════
 * FEATURES:
 * - Multiple chart types: progress, sparkline, trend
 * - Animated counter on mount
 * - Comparison with previous period
 * - Mini chart visualization
 * - Color variants
 *
 * DESIGN TOKENS:
 * - Emerald primary for positive metrics
 * - Gold accent for premium metrics (RESTRICTED)
 * - Red for negative/danger metrics
 * ════════════════════════════════════════════════════════════════════════
 */

"use client";

import React, { useState, useEffect, useRef } from "react";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { cn } from "@/lib/utils";
import { GarfixCard } from "../core/GarfixCard";

// ── Types ───────────────────────────────────────────────────────────────

export type StatColor = "emerald" | "gold" | "blue" | "red" | "purple" | "gray";
export type StatTrend = "up" | "down" | "neutral";

export interface GarfixStatCardProps {
  /** Stat title */
  title: string;
  /** Main value */
  value: number | string;
  /** Previous value for comparison */
  previousValue?: number;
  /** Change percentage (calculated automatically if not provided) */
  change?: number;
  /** Trend direction */
  trend?: StatTrend;
  /** Color theme */
  color?: StatColor;
  /** Icon */
  icon?: React.ReactNode;
  /** Unit suffix (e.g., "%", "ج.م", "K") */
  unit?: string;
  /** Prefix (e.g., "$", "ج.م") */
  prefix?: string;
  /** Format number with locale */
  formatNumber?: boolean;
  /** Decimal places */
  decimals?: number;
  /** Show animated counter */
  animated?: boolean;
  /** Custom class name */
  className?: string;
}

// ── Color Configurations ─────────────────────────────────────────────────

const colorConfig: Record<StatColor, {
  iconBg: string;
  iconText: string;
  trendUp: string;
  trendDown: string;
  value: string;
}> = {
  emerald: {
    iconBg: "bg-emerald-500/10",
    iconText: "text-emerald-500",
    trendUp: "text-emerald-500",
    trendDown: "text-red-500",
    value: "text-foreground",
  },
  gold: {
    // ⚠️ RESTRICTED USE
    iconBg: "bg-[#d4a574]/10",
    iconText: "text-[#d4a574]",
    trendUp: "text-emerald-500",
    trendDown: "text-red-500",
    value: "text-foreground",
  },
  blue: {
    iconBg: "bg-blue-500/10",
    iconText: "text-blue-500",
    trendUp: "text-blue-500",
    trendDown: "text-red-500",
    value: "text-foreground",
  },
  red: {
    iconBg: "bg-red-500/10",
    iconText: "text-red-500",
    trendUp: "text-emerald-500",
    trendDown: "text-red-500",
    value: "text-foreground",
  },
  purple: {
    iconBg: "bg-purple-500/10",
    iconText: "text-purple-500",
    trendUp: "text-purple-500",
    trendDown: "text-red-500",
    value: "text-foreground",
  },
  gray: {
    iconBg: "bg-gray-500/10",
    iconText: "text-gray-500",
    trendUp: "text-gray-500",
    trendDown: "text-gray-500",
    value: "text-foreground",
  },
};

// ── Animated Counter Hook ───────────────────────────────────────────────

function useAnimatedValue(targetValue: number, enabled: boolean, duration = 800): number {
  const [currentValue, setCurrentValue] = useState(targetValue);
  const currentValueRef = useRef(targetValue);

  // Keep the ref in sync so the animation closure reads the latest settled value.
  currentValueRef.current = currentValue;

  useEffect(() => {
    if (!enabled || typeof targetValue !== "number") {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- animation: reset value when disabled
      setCurrentValue(targetValue);
      return;
    }

    const startTime = Date.now();
    const startValue = currentValueRef.current;

    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      
      // Ease out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      
      setCurrentValue(startValue + (targetValue - startValue) * eased);

      if (progress < 1) {
        requestAnimationFrame(animate);
      }
    };

    requestAnimationFrame(animate);
  }, [targetValue, enabled, duration]);

  return currentValue;
}

// ── Component ───────────────────────────────────────────────────────────

export const GarfixStatCard: React.FC<GarfixStatCardProps> = ({
  title,
  value,
  previousValue,
  change,
  trend,
  color = "emerald",
  icon,
  unit = "",
  prefix = "",
  formatNumber = true,
  decimals = 0,
  animated = true,
  className,
}) => {
  const numericValue = typeof value === "number" ? value : parseFloat(String(value)) || 0;
  const displayValue = useAnimatedValue(numericValue, animated && typeof value === "number");

  // Calculate change if not provided
  const calculatedChange = change !== undefined 
    ? change 
    : previousValue !== undefined && previousValue !== 0
      ? ((numericValue - previousValue) / previousValue) * 100
      : undefined;

  const determinedTrend = trend || (calculatedChange !== undefined
    ? calculatedChange > 0 ? "up" : calculatedChange < 0 ? "down" : "neutral"
    : undefined);

  const colors = colorConfig[color];
  const isPositive = determinedTrend === "up";
  const isNegative = determinedTrend === "down";

  // Format the display value
  const formattedValue = typeof value === "string"
    ? value
    : formatNumber
      ? displayValue.toLocaleString("ar-EG", {
          minimumFractionDigits: decimals,
          maximumFractionDigits: decimals,
        })
      : displayValue.toFixed(decimals);

  // FE-14 FIX (Audit v2 · Phase 3): KPI/metric values update dynamically (the
  // animated counter re-renders every animation frame; the underlying value
  // changes when dashboards poll). Screen-reader users had no idea a value
  // had changed because the live region was missing. We add `aria-live="polite"`
  // + `aria-atomic="true"` so the SR announces the new value once it settles,
  // without interrupting the user mid-utterance.
  const valueId = `stat-${title.replace(/\s+/g, "-").toLowerCase()}`;

  return (
    <GarfixCard variant="default" padding="lg" hoverable className={className}>
      <div className="space-y-4">
        {/* Header Row */}
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <p className="text-sm font-medium text-muted-foreground">{title}</p>
            <p
              id={valueId}
              aria-live="polite"
              aria-atomic="true"
              role="status"
              className={cn("text-2xl sm:text-3xl font-bold tracking-tight", colors.value)}
            >
              {prefix}{formattedValue}{unit}
            </p>
          </div>
          
          {icon && (
            <div className={cn("p-2.5 rounded-xl", colors.iconBg)}>
              <span className={colors.iconText}>{icon}</span>
            </div>
          )}
        </div>

        {/* Trend Indicator */}
        {(determinedTrend || calculatedChange !== undefined) && (
          <div className="flex items-center gap-2">
            <span className={cn(
              "inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold",
              isPositive && `${colors.trendUp} bg-current/10`,
              isNegative && `${colors.trendDown} bg-current/10`,
              determinedTrend === "neutral" && "text-muted-foreground bg-muted"
            )}>
              {isPositive && <TrendingUp className="h-3.5 w-3.5" />}
              {isNegative && <TrendingDown className="h-3.5 w-3.5" />}
              {determinedTrend === "neutral" && <Minus className="h-3.5 w-3.5" />}
              
              {calculatedChange !== undefined && (
                <span>
                  {isPositive ? "+" : ""}{Math.abs(calculatedChange).toFixed(1)}%
                </span>
              )}
            </span>
            
            <span className="text-xs text-muted-foreground">
              مقارنة بالفترة السابقة
            </span>
          </div>
        )}

        {/* Mini Progress Bar (optional visual) */}
        {previousValue !== undefined && numericValue > 0 && (
          <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
            <div
              className={cn(
                "h-full rounded-full transition-all duration-500 ease-out",
                isPositive ? "bg-emerald-500" : isNegative ? "bg-red-500" : "bg-gray-400"
              )}
              style={{
                width: `${Math.min(Math.abs(numericValue / previousValue) * 100, 100)}%`,
              }}
            />
          </div>
        )}
      </div>
    </GarfixCard>
  );
};

GarfixStatCard.displayName = "GarfixStatCard";

// ── Mini Sparkline Chart ───────────────────────────────────────────────

export interface SparklineChartProps {
  data: number[];
  color?: StatColor;
  height?: number;
  showDots?: boolean;
  className?: string;
}

export const SparklineChart: React.FC<SparklineChartProps> = ({
  data,
  color = "emerald",
  height = 32,
  showDots = false,
  className,
}) => {
  if (data.length < 2) return null;

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;

  const points = data.map((value, index) => ({
    x: (index / (data.length - 1)) * 100,
    y: 100 - ((value - min) / range) * 100,
  }));

  const pathD = points.map((point, i) => 
    `${i === 0 ? "M" : "L"} ${point.x} ${point.y}`
  ).join(" ");

  const areaD = `${pathD} L 100 100 L 0 100 Z`;

  const strokeColors: Record<StatColor, string> = {
    emerald: "#047857",
    gold: "#d4a574", // ⚠️ RESTRICTED
    blue: "#2563eb",
    red: "#dc2626",
    purple: "#9333ea",
    gray: "#6b7280",
  };

  return (
    <svg
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      height={height}
      className={cn("w-full overflow-visible", className)}
    >
      {/* Area fill */}
      <path
        d={areaD}
        fill={`${strokeColors[color]}15`}
      />
      {/* Line */}
      <path
        d={pathD}
        fill="none"
        stroke={strokeColors[color]}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* End dot */}
      {showDots && (
        <circle
          cx={points[points.length - 1].x}
          cy={points[points.length - 1].y}
          r="3"
          fill={strokeColors[color]}
        />
      )}
    </svg>
  );
};

SparklineChart.displayName = "SparklineChart";

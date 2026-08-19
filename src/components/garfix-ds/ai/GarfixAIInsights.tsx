/**
 * GarfixAIInsights.tsx — GarfiX DS v4.0 AI Insights Panel
 *
 * ════════════════════════════════════════════════════════════════════════
 * Displays AI-generated insights and actionable intelligence
 *
 * FEATURES:
 * - Multiple insight types (anomaly, trend, optimization, alert)
 * - Priority-based ordering
 * - Dismiss/Acknowledge actions
 * - Confidence indicators
 * - Animated entrance
 * - RTL support
 *
 * ════════════════════════════════════════════════════════════════════════
 */

"use client";

import React, { useState } from "react";
import {
  Lightbulb,
  TrendingUp,
  AlertTriangle,
  Sparkles,
  Target,
  ChevronDown,
  ChevronUp,
  X,
  CheckCircle2,
  Clock,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAIPersonalization, AIInsight } from "@/lib/ai-personalization/AIPersonalizationProvider";
import { GarfixCard } from "../core/GarfixCard";
import { GarfixBadge } from "../core/GarfixBadge";

// ── Types ───────────────────────────────────────────────────────────────

export interface GarfixAIInsightsProps {
  /** Maximum insights to show */
  maxItems?: number;
  /** Filter by category */
  category?: string;
  /** Show only new/unread */
  unreadOnly?: boolean;
  /** Compact mode */
  compact?: boolean;
  /** Show header */
  showHeader?: boolean;
  /** Custom class name */
  className?: string;
}

// ── Insight Type Config ─────────────────────────────────────────────────

const insightTypeConfig: Record<AIInsight["type"], { icon: React.ElementType; color: string; bg: string }> = {
  anomaly_detection: {
    icon: AlertTriangle,
    color: "text-amber-500",
    bg: "bg-cardmber-500/10",
  },
  trend_prediction: {
    icon: TrendingUp,
    color: "text-emerald-500",
    bg: "bg-mutedmerald-500/10",
  },
  optimization_suggestion: {
    icon: Zap,
    color: "text-blue-500",
    bg: "bg-mutedackgroundlue-500/10",
  },
  alert: {
    icon: AlertTriangle,
    color: "text-red-500",
    bg: "bg-red-500/10",
  },
  milestone: {
    icon: Sparkles,
    color: "text-[#d4a574]",
    bg: "bg-[#d4a574]/10", // Gold ⚠️ RESTRICTED
  },
  comparison: {
    icon: TrendingUp,
    color: "text-purple-500",
    bg: "bg-purple-500/10",
  },
  pattern_recognition: {
    icon: Target,
    color: "text-cyan-500",
    bg: "bg-cyan-500/10",
  },
  recommendation: {
    icon: Lightbulb,
    color: "text-yellow-500",
    bg: "bg-yellow-500/10",
  },
};

// ── Priority Badge ──────────────────────────────────────────────────────

const priorityConfig = {
  critical: { label: "حرج", variant: "error" as const },
  high: { label: "عالي", variant: "warning" as const },
  medium: { label: "متوسط", variant: "info" as const },
  low: { label: "منخفض", variant: "default" as const },
};

// ── Component ───────────────────────────────────────────────────────────

export const GarfixAIInsights: React.FC<GarfixAIInsightsProps> = ({
  maxItems = 5,
  category,
  unreadOnly = false,
  compact = false,
  showHeader = true,
  className,
}) => {
  const { insights, dismissInsight, acknowledgeInsight, isLearning } = useAIPersonalization();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Filter insights
  let filteredInsights = [...insights];

  if (category) {
    filteredInsights = filteredInsights.filter(i => i.category === category);
  }

  if (unreadOnly) {
    filteredInsights = filteredInsights.filter(i => i.status === "new");
  }

  // Sort by priority then confidence
  const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
  filteredInsights.sort((a, b) => {
    const aPriority = priorityOrder[a.priority] ?? 99;
    const bPriority = priorityOrder[b.priority] ?? 99;
    return aPriority - bPriority || b.confidence - a.confidence;
  });

  // Limit items
  const displayInsights = filteredInsights.slice(0, maxItems);

  // Count new insights
  const newCount = displayInsights.filter(i => i.status === "new").length;

  if (displayInsights.length === 0 && !isLearning) {
    return (
      <GarfixCard variant="glass" padding="md" className={cn("text-center", className)}>
        <Sparkles className="h-8 w-8 mx-auto text-muted-foreground/50 mb-2" />
        <p className="text-sm text-muted-foreground">لا توجد رؤى حالياً</p>
        <p className="text-xs text-muted-foreground/70 mt-1">ستظهر هنا رؤى ذكية بناءً على نشاطك</p>
      </GarfixCard>
    );
  }

  return (
    <div className={cn("space-y-3", className)}>
      {/* Header */}
      {showHeader && (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Lightbulb className="h-5 w-5 text-[#d4a574]" /> {/* Gold for AI */}
            <h3 className="font-semibold text-foreground">رؤى ذكية</h3>
            {newCount > 0 && (
              <GarfixBadge variant="primary" size="sm" dot pulse>
                {newCount}
              </GarfixBadge>
            )}
          </div>
          
          {isLearning && (
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Clock className="h-3.5 w-3.5 animate-spin" />
              جارٍ التحليل...
            </span>
          )}
        </div>
      )}

      {/* Insights List */}
      <div className={cn("space-y-3", compact && "space-y-2")}>
        {displayInsights.map((insight) => {
          const config = insightTypeConfig[insight.type];
          const IconComponent = config.icon;
          const isExpanded = expandedId === insight.id;
          const priority = priorityConfig[insight.priority];

          return (
            <GarfixCard
              key={insight.id}
              variant={insight.status === "new" ? "default" : "glass"}
              padding={compact ? "sm" : "md"}
              className={cn(
                "transition-all duration-200 cursor-pointer hover-lift",
                insight.status === "new" && "border-primary/30"
              )}
              onClick={() => setExpandedId(isExpanded ? null : insight.id)}
            >
              <div className="flex gap-3">
                {/* Icon */}
                <div className={cn("p-2 rounded-lg flex-shrink-0", config.bg)}>
                  <IconComponent className={cn("h-4 w-4", config.color)} />
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0 space-y-1.5">
                  {/* Title Row */}
                  <div className="flex items-start justify-between gap-2">
                    <h4 className={cn(
                      "font-medium text-foreground leading-tight",
                      compact ? "text-sm" : "text-sm"
                    )}>
                      {insight.title}
                    </h4>

                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <GarfixBadge
                        variant={priority.variant}
                        size="xs"
                        dot
                      >
                        {priority.label}
                      </GarfixBadge>
                      
                      {/* Expand indicator */}
                      {isExpanded ? (
                        <ChevronUp className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <ChevronDown className="h-4 w-4 text-muted-foreground" />
                      )}
                    </div>
                  </div>

                  {/* Description */}
                  {!compact && (
                    <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">
                      {insight.description}
                    </p>
                  )}

                  {/* Expanded Content */}
                  {isExpanded && !compact && (
                    <div className="pt-2 border-t border-border/50 space-y-3 animate-in slide-in-from-top-1 duration-150">
                      {/* Full description */}
                      <p className="text-sm text-muted-foreground leading-relaxed">
                        {insight.description}
                      </p>

                      {/* Related metrics */}
                      {insight.relatedMetrics && insight.relatedMetrics.length > 0 && (
                        <div className="grid grid-cols-2 gap-2">
                          {insight.relatedMetrics.map((metric, idx) => (
                            <div key={idx} className="bg-muted/50 rounded-lg p-2">
                              <p className="text-xs text-muted-foreground">{metric.name}</p>
                              <p className="text-sm font-semibold text-foreground">
                                {typeof metric.value === 'number' 
                                  ? metric.value.toLocaleString('ar-EG') 
                                  : metric.value}
                                {metric.change !== undefined && (
                                  <span className={cn(
                                    "ms-1 text-xs",
                                    metric.change >= 0 ? "text-emerald-500" : "text-red-500"
                                  )}>
                                    ({metric.change > 0 ? "+" : ""}{metric.change}%)
                                  </span>
                                )}
                              </p>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Actions */}
                      <div className="flex flex-wrap gap-2">
                        {insight.actions.map(action => (
                          <button
                            key={action.id}
                            onClick={(e) => {
                              e.stopPropagation();
                              action.action();
                              acknowledgeInsight(insight.id);
                            }}
                            className={cn(
                              "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors duration-120",
                              action.type === "primary"
                                ? "bg-primary text-primary-foreground hover:bg-primary/90"
                                : action.type === "secondary"
                                  ? "bg-muted hover:bg-muted/80 text-foreground"
                                  : "text-primary hover:underline"
                            )}
                          >
                            {action.label}
                          </button>
                        ))}

                        {/* Dismiss button */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            dismissInsight(insight.id);
                          }}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground transition-colors duration-120"
                        >
                          <X className="h-3.5 w-3.5" />
                          تجاهل
                        </button>
                      </div>

                      {/* Meta info */}
                      <div className="flex items-center justify-between pt-2 border-t border-border/30">
                        <span className="text-xs text-muted-foreground">
                          ثقة: {Math.round(insight.confidence * 100)}%
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {new Date(insight.generatedAt).toLocaleDateString("ar-EG")}
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Quick actions when collapsed */}
                  {!isExpanded && insight.status === "new" && (
                    <div className="flex items-center gap-2 pt-1">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          acknowledgeInsight(insight.id);
                        }}
                        className="p-1 rounded hover:bg-muted transition-colors"
                        title="تأكيد القراءة"
                      >
                        <CheckCircle2 className="h-4 w-4 text-muted-foreground hover:text-emerald-500" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          dismissInsight(insight.id);
                        }}
                        className="p-1 rounded hover:bg-muted transition-colors"
                        title="تجاهل"
                      >
                        <X className="h-4 w-4 text-muted-foreground hover:text-red-500" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </GarfixCard>
          );
        })}
      </div>
    </div>
  );
};

GarfixAIInsights.displayName = "GarfixAIInsights";

// ── Insight Card (Single) ───────────────────────────────────────────────

export interface GarfixInsightCardProps {
  insight: AIInsight;
  onDismiss?: (id: string) => void;
  onAcknowledge?: (id: string) => void;
  className?: string;
}

export const GarfixInsightCard: React.FC<GarfixInsightCardProps> = ({
  insight,
  onDismiss,
  onAcknowledge,
  className,
}) => {
  const config = insightTypeConfig[insight.type];
  const IconComponent = config.icon;

  return (
    <GarfixCard variant="default" padding="md" className={cn(className)}>
      <div className="flex gap-3">
        <div className={cn("p-2 rounded-lg flex-shrink-0", config.bg)}>
          <IconComponent className={cn("h-5 w-5", config.color)} />
        </div>
        
        <div className="flex-1 space-y-2">
          <h4 className="font-medium text-foreground">{insight.title}</h4>
          <p className="text-sm text-muted-foreground leading-relaxed">
            {insight.description}
          </p>
          
          <div className="flex flex-wrap gap-2">
            {insight.actions.map(action => (
              <button
                key={action.id}
                onClick={() => {
                  action.action();
                  onAcknowledge?.(insight.id);
                }}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-xs font-medium transition-colors",
                  action.type === "primary"
                    ? "bg-primary text-white"
                    : "bg-muted hover:bg-muted/80"
                )}
              >
                {action.label}
              </button>
            ))}
            
            {onDismiss && (
              <button
                onClick={() => onDismiss(insight.id)}
                className="px-3 py-1.5 rounded-lg text-xs font-medium text-muted-foreground hover:text-red-500 transition-colors"
              >
                تجاهل
              </button>
            )}
          </div>
        </div>
      </div>
    </GarfixCard>
  );
};

GarfixInsightCard.displayName = "GarfixInsightCard";

/**
 * GarfixSmartRecommendations.tsx — GarfiX DS v4.0 Smart Recommendations
 *
 * ════════════════════════════════════════════════════════════════════════
 * Displays personalized recommendations based on user behavior
 *
 * FEATURES:
 * - Multiple recommendation types
 * - Relevance scoring
 * - Feedback mechanism (thumbs up/down)
 * - Dismiss with reason
 * - Carousel or list view
 * - Animated entrance
 *
 * ════════════════════════════════════════════════════════════════════════
 */

"use client";

import React, { useState } from "react";
import {
  Sparkles,
  ThumbsUp,
  ThumbsDown,
  X,
  ChevronLeft,
  ChevronRight,
  Lightbulb,
  Zap,
  BookOpen,
  LayoutTemplate,
  Wand2,
  TrendingUp,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAIPersonalization, Recommendation } from "@/lib/ai-personalization/AIPersonalizationProvider";
import { GarfixCard } from "../core/GarfixCard";
import { GarfixButton } from "../core/GarfixButton";

// ── Types ───────────────────────────────────────────────────────────────

export interface GarfixSmartRecommendationsProps {
  /** Maximum items to show */
  maxItems?: number;
  /** Filter by type */
  type?: Recommendation["type"];
  /** Display mode */
  mode?: "list" | "carousel" | "grid";
  /** Show feedback buttons */
  showFeedback?: boolean;
  /** Compact mode */
  compact?: boolean;
  /** Custom class name */
  className?: string;
}

// ── Type Icons ──────────────────────────────────────────────────────────

const typeIcons: Record<Recommendation["type"], React.ElementType> = {
  feature_discovery: Sparkles,
  workflow_optimization: Zap,
  data_entry_shortcut: Wand2,
  report_suggestion: Lightbulb,
  template_recommendation: LayoutTemplate,
  action_automation: Zap,
  learning_resource: BookOpen,
  peer_comparison: TrendingUp,
};

const typeLabels: Record<Recommendation["type"], string> = {
  feature_discovery: "ميزة جديدة",
  workflow_optimization: "تحسين سير العمل",
  data_entry_shortcut: "اختصار ذكي",
  report_suggestion: "تقرير مقترح",
  template_recommendation: "قالب مقترح",
  action_automation: "أتمتة",
  learning_resource: "تعلم",
  peer_comparison: "مقارنة",
};

const typeColors: Record<Recommendation["type"], string> = {
  feature_discovery: "text-[#d4a574]", // Gold ⚠️ RESTRICTED
  workflow_optimization: "text-blue-500",
  data_entry_shortcut: "text-emerald-500",
  report_suggestion: "text-purple-500",
  template_recommendation: "text-cyan-500",
  action_automation: "text-orange-500",
  learning_resource: "text-pink-500",
  peer_comparison: "text-indigo-500",
};

// ── Component ───────────────────────────────────────────────────────────

export const GarfixSmartRecommendations: React.FC<GarfixSmartRecommendationsProps> = ({
  maxItems = 4,
  type,
  mode = "list",
  showFeedback = true,
  compact = false,
  className,
}) => {
  const {
    recommendations,
    getRecommendations,
    provideFeedback,
  } = useAIPersonalization();

  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
  const [carouselIndex, setCarouselIndex] = useState(0);

  // Get filtered recommendations
  const allRecs = getRecommendations(type);
  const visibleRecs = allRecs
    .filter(r => !dismissedIds.has(r.id))
    .sort((a, b) => b.relevanceScore - a.relevanceScore)
    .slice(0, maxItems);

  // Carousel logic
  const visibleInCarousel = mode === "carousel" 
    ? visibleRecs.slice(carouselIndex, carouselIndex + 1)
    : visibleRecs;

  const canGoPrev = carouselIndex > 0;
  const canGoNext = carouselIndex < visibleRecs.length - 1;

  // Dismiss handler
  const handleDismiss = (id: string) => {
    setDismissedIds(prev => new Set([...prev, id]));
  };

  if (visibleRecs.length === 0) {
    return null; // Don't render if no recommendations
  }

  return (
    <div className={cn("space-y-3", className)}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-[#d4a574]" /> {/* Gold for AI */}
          <h3 className="font-semibold text-foreground">اقتراحات لك</h3>
        </div>

        {/* Carousel controls */}
        {mode === "carousel" && visibleRecs.length > 1 && (
          <div className="flex items-center gap-1">
            <button
              onClick={() => setCarouselIndex(i => Math.max(0, i - 1))}
              disabled={!canGoPrev}
              className={cn(
                "p-1 rounded-lg transition-colors",
                canGoPrev ? "hover:bg-muted text-foreground" : "text-muted-foreground/30 cursor-not-allowed"
              )}
            >
              <ChevronRight className="h-4 w-4 rtl:rotate-0 ltr:rotate-180" />
            </button>
            
            <span className="text-xs text-muted-foreground">
              {carouselIndex + 1}/{visibleRecs.length}
            </span>
            
            <button
              onClick={() => setCarouselIndex(i => Math.min(visibleRecs.length - 1, i + 1))}
              disabled={!canGoNext}
              className={cn(
                "p-1 rounded-lg transition-colors",
                canGoNext ? "hover:bg-muted text-foreground" : "text-muted-foreground/30 cursor-not-allowed"
              )}
            >
              <ChevronLeft className="h-4 w-4 rtl:rotate-0 ltr:rotate-180" />
            </button>
          </div>
        )}
      </div>

      {/* Recommendations */}
      <div className={cn(
        mode === "grid" && "grid grid-cols-1 sm:grid-cols-2 gap-3"
      )}>
        {visibleInCarousel.map(rec => (
          <RecommendationCard
            key={rec.id}
            recommendation={rec}
            compact={compact}
            showFeedback={showFeedback}
            onFeedback={(feedback) => provideFeedback(rec.id, feedback)}
            onDismiss={() => handleDismiss(rec.id)}
          />
        ))}
      </div>
    </div>
  );
};

GarfixSmartRecommendations.displayName = "GarfixSmartRecommendations";

// ── Individual Recommendation Card ─────────────────────────────────────

interface RecommendationCardProps {
  recommendation: Recommendation;
  compact?: boolean;
  showFeedback?: boolean;
  onFeedback: (feedback: "positive" | "negative") => void;
  onDismiss: () => void;
}

const RecommendationCard: React.FC<RecommendationCardProps> = ({
  recommendation,
  compact,
  showFeedback,
  onFeedback,
  onDismiss,
}) => {
  const [showReason, setShowReason] = useState(false);

  const IconComponent = typeIcons[recommendation.type];
  const iconColor = typeColors[recommendation.type];

  return (
    <GarfixCard
      variant="glass"
      padding={compact ? "sm" : "md"}
      hoverable
      className="group relative overflow-hidden"
    >
      {/* Relevance indicator bar */}
      <div
        className="absolute top-0 start-0 h-full w-full opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"
        style={{
          background: `linear-gradient(to end, ${recommendation.relevanceScore > 0.7 ? 'rgba(4, 120, 87, 0.05)' : 'rgba(212, 165, 116, 0.03)'}, transparent)`,
        }}
      />

      <div className="relative flex gap-3">
        {/* Icon */}
        <div className="p-2 rounded-lg bg-muted flex-shrink-0">
          <IconComponent className={cn("h-5 w-5", iconColor)} />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0 space-y-1.5">
          {/* Type badge + Title */}
          <div className="flex items-start gap-2">
            <h4 className={cn(
              "font-medium text-foreground leading-tight",
              compact ? "text-sm" : "text-sm"
            )}>
              {recommendation.title}
            </h4>
          </div>

          {/* Description */}
          {!compact && recommendation.description && (
            <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">
              {recommendation.description}
            </p>
          )}

          {/* Reason toggle */}
          <button
            onClick={() => setShowReason(!showReason)}
            className="text-xs text-primary hover:underline flex items-center gap-1"
          >
            لماذا هذا مقترح؟
          </button>

          {/* Expanded reason */}
          {showReason && (
            <div className="p-2 bg-muted/50 rounded-lg text-xs text-muted-foreground animate-in slide-in-from-top-1 duration-150">
              💡 {recommendation.reason}
              
              {/* Relevance score */}
              <div className="mt-1.5 pt-1.5 border-t border-border/50">
                <div className="flex items-center justify-between">
                  <span>ملاءمة:</span>
                  <span className="font-medium text-foreground">
                    {Math.round(recommendation.relevanceScore * 100)}%
                  </span>
                </div>
                <div className="mt-1 h-1.5 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary rounded-full transition-all duration-500"
                    style={{ width: `${recommendation.relevanceScore * 100}%` }}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center gap-2 pt-1">
            {/* Primary CTA would go here based on item type */}
            <GarfixButton size="xs" variant="outline">
              تجربة الآن
            </GarfixButton>

            {/* Feedback */}
            {showFeedback && (
              <div className="flex items-center gap-0.5 ms-auto">
                <button
                  onClick={() => onFeedback("positive")}
                  className="p-1 rounded hover:bg-emerald-100 dark:hover:bg-emerald-900/30 text-muted-foreground hover:text-emerald-500 transition-colors"
                  title="مفيد"
                >
                  <ThumbsUp className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => onFeedback("negative")}
                  className="p-1 rounded hover:bg-red-100 dark:hover:bg-red-900/30 text-muted-foreground hover:text-red-500 transition-colors"
                  title="ليس مفيداً"
                >
                  <ThumbsDown className="h-3.5 w-3.5" />
                </button>
              </div>
            )}

            {/* Dismiss */}
            <button
              onClick={onDismiss}
              className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
              title="إخفاء"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Type label */}
      <div className="absolute top-2 end-2">
        <span className={cn(
          "text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-muted",
          iconColor
        )}>
          {typeLabels[recommendation.type]}
        </span>
      </div>
    </GarfixCard>
  );
};

/**
 * GarfixAILearningProgress.tsx — GarfiX DS v4.0 AI Learning Progress
 *
 * ════════════════════════════════════════════════════════════════════════
 * Shows how well the AI has learned user preferences and patterns
 *
 * FEATURES:
 * - Learning progress indicator
 * - Data points collected count
 * - Accuracy metrics
 * - Feature importance visualization
 * - Privacy indicators
 *
 * ════════════════════════════════════════════════════════════════════════
 */

"use client";

import React from "react";
import {
  Brain,
  ShieldCheck,
  Database,
  Sparkles,
  CheckCircle2,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAIPersonalization } from "@/lib/ai-personalization/AIPersonalizationProvider";
import { GarfixCard } from "../core/GarfixCard";
import { GarfixProgressBar } from "../feedback/GarfixProgress";

// ── Types ───────────────────────────────────────────────────────────────

export interface GarfixAILearningProgressProps {
  /** Show detailed breakdown */
  detailed?: boolean;
  /** Compact mode */
  compact?: boolean;
  /** Custom class name */
  className?: string;
}

// ── Component ───────────────────────────────────────────────────────────

export const GarfixAILearningProgress: React.FC<GarfixAILearningProgressProps> = ({
  detailed = false,
  compact = false,
  className,
}) => {
  const { isLearning, adaptiveUI, insights } = useAIPersonalization();

  // Calculate learning metrics (simulated)
  const totalEvents = adaptiveUI.frequentFeatures.reduce(
    (sum, f) => sum + f.useCount,
    0
  );
  
  const featuresLearned = adaptiveUI.frequentFeatures.length;
  const insightsGenerated = insights.length;
  
  // Simulate learning progress (0-100%)
  const learningProgress = Math.min(
    100,
    Math.round(
      (featuresLearned * 10) +
      (Math.min(totalEvents, 100) * 0.5) +
      (insightsGenerated * 5)
    )
  );

  // Learning stage
  const getLearningStage = () => {
    if (learningProgress < 20) return { label: "جمع البيانات", color: "text-blue-500" };
    if (learningProgress < 50) return { label: "تعلم الأنماط", color: "text-amber-500" };
    if (learningProgress < 80) return { label: "تحسين التوصيات", color: "text-emerald-500" };
    return { label: "مُحسّن", color: "text-[#d4a574]" }; // Gold ⚠️ RESTRICTED
  };

  const stage = getLearningStage();

  if (compact) {
    return (
      <div className={cn("flex items-center gap-3", className)}>
        <div className="relative">
          <Brain className={cn("h-5 w-5", isLearning ? "animate-pulse text-primary" : stage.color)} />
          {isLearning && (
            <Loader2 className="absolute inset-0 h-5 w-5 animate-spin text-primary/50" />
          )}
        </div>
        
        <div className="flex-1">
          <GarfixProgressBar
            value={learningProgress}
            size="sm"
            color={learningProgress > 80 ? "emerald" : "blue"}
            showLabel={false}
          />
        </div>
        
        <span className={cn("text-xs font-medium tabular-nums", stage.color)}>
          {learningProgress}%
        </span>
      </div>
    );
  }

  return (
    <GarfixCard variant="glass" padding={detailed ? "lg" : "md"} className={className}>
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className={cn(
            "p-2.5 rounded-xl",
            learningProgress > 80 
              ? "bg-[#d4a574]/10" // Gold ⚠️ RESTRICTED
              : "bg-primary/10"
          )}>
            <Brain className={cn(
              "h-5 w-5",
              isLearning ? "animate-pulse text-primary" : stage.color
            )} />
          </div>
          
          <div>
            <h3 className="font-semibold text-foreground">الذكاء الاصطناعي</h3>
            <p className={cn("text-sm", stage.color)}>{stage.label}</p>
          </div>
        </div>

        {/* Status badge */}
        <div className={cn(
          "px-2 py-1 rounded-full text-xs font-medium flex items-center gap-1.5",
          isLearning
            ? "bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400"
            : learningProgress > 80
              ? "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400"
              : "bg-muted text-muted-foreground"
        )}>
          {isLearning ? (
            <>
              <Loader2 className="h-3 w-3 animate-spin" />
              جارٍ التعلم
            </>
          ) : (
            <>
              <CheckCircle2 className="h-3 w-3" />
              نشط
            </>
          )}
        </div>
      </div>

      {/* Progress bar */}
      <GarfixProgressBar
        value={learningProgress}
        size="md"
        color={learningProgress > 80 ? "emerald" : "primary"}
        labelPosition="top"
        label={`مستوى التعلم: ${learningProgress}%`}
      />

      {/* Detailed breakdown */}
      {detailed && (
        <div className="mt-4 pt-4 border-t border-border/50 space-y-3">
          {/* Metrics grid */}
          <div className="grid grid-cols-3 gap-3">
            <MetricItem
              icon={<Database className="h-4 w-4" />}
              label="حدث مسجل"
              value={totalEvents.toLocaleString("ar-EG")}
            />
            <MetricItem
              icon={<Sparkles className="h-4 w-4" />}
              label="رؤى مولدة"
              value={insightsGenerated.toString()}
            />
            <MetricItem
              icon={<Brain className="h-4 w-4" />}
              label="نمط متعلم"
              value={featuresLearned.toString()}
            />
          </div>

          {/* Privacy note */}
          <div className="flex items-start gap-2 p-3 bg-muted/30 rounded-lg">
            <ShieldCheck className="h-4 w-4 text-emerald-500 mt-0.5 flex-shrink-0" />
            <p className="text-xs text-muted-foreground leading-relaxed">
              جميع بياناتك تُعالج محلياً في متصفحك ولا تُرسل لخوادم خارجية.
              يمكنك إيقاف التعلم من الإعدادات في أي وقت.
            </p>
          </div>
        </div>
      )}
    </GarfixCard>
  );
};

GarfixAILearningProgress.displayName = "GarfixAILearningProgress";

// ── Metric Item Component ──────────────────────────────────────────────

interface MetricItemProps {
  icon: React.ReactNode;
  label: string;
  value: string;
}

const MetricItem: React.FC<MetricItemProps> = ({ icon, label, value }) => (
  <div className="text-center space-y-1">
    <div className="flex justify-center text-muted-foreground">{icon}</div>
    <p className="text-lg font-bold text-foreground tabular-nums">{value}</p>
    <p className="text-xs text-muted-foreground">{label}</p>
  </div>
);

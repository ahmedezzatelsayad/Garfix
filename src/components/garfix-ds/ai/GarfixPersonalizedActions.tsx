/**
 * GarfixPersonalizedActions.tsx — GarfiX DS v4.0 Personalized Quick Actions
 *
 * ════════════════════════════════════════════════════════════════════════
 * Displays personalized quick actions based on user behavior patterns
 *
 * FEATURES:
 * - Frequently used features (smart ordering)
 * - Context-aware suggestions
 * - Time-based shortcuts
 * - Recent items quick access
 * - Pinned items
 * - Animated icons
 *
 * ════════════════════════════════════════════════════════════════════════
 */

"use client";

import React from "react";
import {
  Clock,
  Pin,
  TrendingUp,
  Zap,
  ArrowUpRight,
  Plus,
  FileText,
  Users,
  BarChart3,
  Download,
  Settings,
  Star,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAIPersonalization } from "@/lib/ai-personalization/AIPersonalizationProvider";
import { GarfixButton } from "../core/GarfixButton";

// ── Types ───────────────────────────────────────────────────────────────

export interface GarfixPersonalizedActionsProps {
  /** Maximum actions to show */
  maxActions?: number;
  /** Show section headers */
  showHeaders?: boolean;
  /** Include recent items */
  showRecent?: boolean;
  /** Include pinned items */
  showPinned?: boolean;
  /** Size variant */
  size?: "sm" | "md" | "lg";
  /** Layout direction */
  direction?: "horizontal" | "vertical";
  /** Custom class name */
  className?: string;
}

// ── Default Feature Map (for demo) ───────────────────────────────────────

const featureIconMap: Record<string, React.ElementType> = {
  "create-invoice": FileText,
  "add-client": Users,
  "view-reports": BarChart3,
  "export-data": Download,
  "settings": Settings,
  "new-quote": FileText,
  "add-product": Plus,
  "analytics": TrendingUp,
};

const featureLabelMap: Record<string, string> = {
  "create-invoice": "إنشاء فاتورة",
  "add-client": "إضافة عميل",
  "view-reports": "التقارير",
  "export-data": "تصدير",
  "settings": "الإعدادات",
  "new-quote": "عرض سعر جديد",
  "add-product": "إضافة منتج",
  "analytics": "التحليلات",
};

// ── Component ───────────────────────────────────────────────────────────

export const GarfixPersonalizedActions: React.FC<GarfixPersonalizedActionsProps> = ({
  maxActions = 8,
  showHeaders = true,
  showRecent = true,
  showPinned = true,
  size = "md",
  direction = "horizontal",
  className,
}) => {
  const { adaptiveUI, trackEvent } = useAIPersonalization();

  const { frequentFeatures, recentItems, pinnedItems, suggestedActions } = adaptiveUI;

  // Get top frequent features
  const topFeatures = frequentFeatures.slice(0, Math.min(4, maxActions));
  
  // Get recent items
  const recentToShow = showRecent ? recentItems.slice(0, 3) : [];
  
  // Get pinned items
  const pinnedToShow = showPinned ? pinnedItems.slice(0, 4) : [];

  // Handle action click
  const handleActionClick = (featureId: string, label: string) => {
    trackEvent({
      type: "click",
      context: {
        page: typeof window !== "undefined" ? window.location.pathname : "/",
        component: featureId,
      },
      data: { action: label },
    });
  };

  // No personalized data yet
  if (
    topFeatures.length === 0 &&
    recentToShow.length === 0 &&
    pinnedToShow.length === 0 &&
    suggestedActions.length === 0
  ) {
    return <DefaultActionsGrid size={size} onActionClick={handleActionClick} />;
  }

  return (
    <div className={cn(
      "space-y-4",
      direction === "horizontal" && "flex flex-wrap items-center gap-3",
      className
    )}>
      {/* Frequent Features */}
      {topFeatures.length > 0 && (
        <div className={cn("space-2", direction === "horizontal" && "flex items-center gap-2 flex-wrap")}>
          {showHeaders && direction === "vertical" && (
            <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground mb-1">
              <Zap className="h-3.5 w-3.5" />
              الأكثر استخداماً
            </div>
          )}
          
          {topFeatures.map(feature => {
            const IconComponent = featureIconMap[feature.featureId] || Star;
            const label = featureLabelMap[feature.featureId] || feature.name;

            return (
              <GarfixButton
                key={feature.featureId}
                variant="outline"
                size={size === "lg" ? "sm" : size}
                leadingIcon={<IconComponent className="h-4 w-4" />}
                trailingIcon={
                  feature.trend === "increasing" ? (
                    <TrendingUp className="h-3 w-3 text-emerald-500" />
                  ) : undefined
                }
                onClick={() => handleActionClick(feature.featureId, label)}
                className="hover-lift"
              >
                {!direction || direction === "vertical" ? label : undefined}
              </GarfixButton>
            );
          })}
        </div>
      )}

      {/* Recent Items */}
      {recentToShow.length > 0 && (
        <div className="space-2">
          {showHeaders && (
            <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <Clock className="h-3.5 w-3.5" />
              آخر الاستخدامات
            </div>
          )}
          
          <div className={cn(
            "gap-1.5",
            direction === "horizontal" ? "flex flex-wrap" : "space-y-1"
          )}>
            {recentToShow.map(item => (
              <button
                key={item.id}
                onClick={() => trackEvent({
                  type: "click",
                  context: { page: item.url, component: "recent-item" },
                  data: { itemId: item.id, title: item.title },
                })}
                className={cn(
                  "inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm",
                  "bg-muted hover:bg-muted/80 text-foreground transition-colors duration-120",
                  "max-w-[200px] truncate"
                )}
              >
                <span className="truncate">{item.title}</span>
                <ArrowUpRight className="h-3 w-3 flex-shrink-0 opacity-50" />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Pinned Items */}
      {pinnedToShow.length > 0 && (
        <div className="space-2">
          {showHeaders && (
            <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <Pin className="h-3.5 w-3.5" />
              المثبتة
            </div>
          )}
          
          <div className={cn(
            "gap-1.5",
            direction === "horizontal" ? "flex flex-wrap" : "space-y-1"
          )}>
            {pinnedToShow.map(itemId => (
              <button
                key={itemId}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
              >
                <Pin className="h-3 w-3" />
                {itemId}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Suggested Actions */}
      {suggestedActions.length > 0 && (
        <div className="space-2">
          {showHeaders && (
            <div className="flex items-center gap-1.5 text-xs font-medium text-[#d4a574]">
              {/* Gold for AI suggestions */}
              <Sparkles className="h-3.5 w-3.5" />
              مقترحات ذكية
            </div>
          )}
          
          <div className="space-y-1.5">
            {suggestedActions.slice(0, 2).map(action => (
              <button
                key={action.id}
                onClick={() => {
                  action.action();
                  trackEvent({
                    type: "click",
                    context: { page: "/", component: "suggested-action" },
                    data: { actionId: action.id },
                  });
                }}
                className={cn(
                  "w-full flex items-center gap-3 px-3 py-2 rounded-lg text-start",
                  "bg-gradient-to-r from-[#d4a574]/10 to-transparent", // Gold tint ⚠️ RESTRICTED
                  "hover:from-[#d4a574]/20 border border-[#d4a574]/20",
                  "transition-all duration-150"
                )}
              >
                {action.icon || <Sparkles className="h-4 w-4 text-[#d4a574]" />}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">
                    {action.title}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">
                    {action.description}
                  </p>
                </div>
                <GarfixButton size="xs" variant="primary">
                  تنفيذ
                </GarfixButton>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

GarfixPersonalizedActions.displayName = "GarfixPersonalizedActions";

// ── Default Actions (when no personalization data) ─────────────────────

interface DefaultActionsGridProps {
  size: "sm" | "md" | "lg";
  onActionClick: (featureId: string, label: string) => void;
}

const DefaultActionsGrid: React.FC<DefaultActionsGridProps> = ({
  size,
  onActionClick,
}) => {
  const defaultActions = [
    { id: "create-invoice", icon: FileText, label: "إنشاء فاتورة", primary: true },
    { id: "add-client", icon: Users, label: "إضافة عميل", primary: false },
    { id: "view-reports", icon: BarChart3, label: "التقارير", primary: false },
    { id: "add-product", icon: Plus, label: "إضافة منتج", primary: false },
  ];

  return (
    <div className="flex flex-wrap gap-2">
      {defaultActions.map(action => (
        <GarfixButton
          key={action.id}
          variant={action.primary ? "primary" : "outline"}
          size={size === "lg" ? "sm" : size}
          leadingIcon={<action.icon className="h-4 w-4" />}
          onClick={() => onActionClick(action.id, action.label)}
        >
          {action.label}
        </GarfixButton>
      ))}
    </div>
  );
};

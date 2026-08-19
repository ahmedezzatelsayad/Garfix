/**
 * IntegrationCard.tsx — Individual integration card for founder panel.
 *
 * Displays:
 * - Integration icon and name
 * - Status indicator (configured/not configured)
 * - Health check dot (green/red)
 * - Last tested date
 * - Configure and Test Connection buttons
 *
 * Uses GarfiX DS v4.0 components (GarfixCard, GarfixButton, GarfixBadge).
 */
"use client";

import React from "react";
import { 
  Settings, 
  Plug, 
  Unplug, 
  Activity,
  CheckCircle2,
  XCircle,
  Clock
} from "lucide-react";
import { cn } from "@/lib/utils";
import { GarfixCard } from "@/components/garfix-ds/core/GarfixCard";
import { GarfixButton } from "@/components/garfix-ds/core/GarfixButton";
import { GarfixBadge } from "@/components/garfix-ds/core/GarfixBadge";
import type { IntegrationCategory } from "@/lib/integrations/types";

// ─── Types ───────────────────────────────────────────────────────────────

export interface IntegrationCardData {
  type: string;
  name: string;
  description: string;
  icon: string;
  category: IntegrationCategory;
  requiredFields: Array<{ key: string; label: string; type: string }>;
  optionalFields?: Array<{ key: string; label: string; type: string }>;
  hasCredentials: boolean;
  credentialsLastUpdatedAt: string | null;
  isRegistered: boolean;
}

interface IntegrationCardProps {
  integration: IntegrationCardData;
  onConfigure: (type: string) => void;
  onTestConnection: (type: string) => void;
  onDisconnect?: (type: string) => void;
  isTesting?: boolean;
  testResult?: { success: boolean; details?: string } | null;
}

// ─── Category Color Map ──────────────────────────────────────────────────

const categoryColors: Record<IntegrationCategory, string> = {
  payments: "border-l-blue-500",
  communications: "border-l-emerald-500",
  storage: "border-l-purple-500",
  ai: "border-l-amber-500",
  analytics: "border-l-cyan-500",
};

const categoryBadgeVariants: Record<IntegrationCategory, "primary" | "info" | "success" | "warning" | "gold"> = {
  payments: "info",
  communications: "success",
  storage: "primary",
  ai: "gold",
  analytics: "warning",
};

// ─── Component ───────────────────────────────────────────────────────────

export const IntegrationCard: React.FC<IntegrationCardProps> = ({
  integration,
  onConfigure,
  onTestConnection,
  onDisconnect,
  isTesting = false,
  testResult,
}) => {
  const handleDisconnect = () => {
    if (!onDisconnect) return;
    if (confirm(`هل تريد قطع اتصال "${integration.name}"؟ سيتم حذف بيانات الاعتماد المشفّرة.`)) {
      onDisconnect(integration.type);
    }
  };

  const formatLastUpdated = (dateStr: string | null) => {
    if (!dateStr) return null;
    try {
      return new Date(dateStr).toLocaleString("ar-EG", {
        dateStyle: "medium",
        timeStyle: "short",
      });
    } catch {
      return null;
    }
  };

  return (
    <GarfixCard
      variant="elevated"
      padding="lg"
      hoverable
      className={cn(
        "relative border-l-4 transition-all duration-200",
        categoryColors[integration.category],
        !integration.isRegistered && "opacity-60"
      )}
    >
      {/* Header Row */}
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="flex items-center gap-3">
          {/* Icon */}
          <div className="text-3xl p-2 rounded-xl bg-muted/50">
            {integration.icon}
          </div>
          
          {/* Name + Category */}
          <div className="space-y-1">
            <h3 className="text-base font-bold text-card-foreground flex items-center gap-2">
              {integration.name}
              {!integration.isRegistered && (
                <span className="text-xs text-red-500 font-normal">(غير مسجّل)</span>
              )}
            </h3>
            <GarfixBadge 
              variant={categoryBadgeVariants[integration.category]} 
              size="sm"
            >
              {integration.category}
            </GarfixBadge>
          </div>
        </div>

        {/* Health Indicator */}
        <div className="flex items-center gap-1.5">
          {integration.hasCredentials ? (
            <>
              <CheckCircle2 className="h-5 w-5 text-emerald-500" />
              <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
                مُهيّأ
              </span>
            </>
          ) : (
            <>
              <XCircle className="h-5 w-5 text-muted-foreground" />
              <span className="text-xs font-medium text-muted-foreground">
                غير مُهيّأ
              </span>
            </>
          )}
        </div>
      </div>

      {/* Description */}
      <p className="text-sm text-muted-foreground leading-relaxed mb-4 line-clamp-2">
        {integration.description}
      </p>

      {/* Status Details */}
      {(integration.hasCredentials || testResult) && (
        <div className="space-y-2 mb-4 p-3 rounded-lg bg-muted/30">
          {integration.hasCredentials && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Clock className="h-3.5 w-3.5" />
              <span>
                آخر تحديث: {formatLastUpdated(integration.credentialsLastUpdatedAt) || "غير معروف"}
              </span>
            </div>
          )}
          
          {testResult && (
            <div className={cn(
              "flex items-center gap-2 text-xs font-medium",
              testResult.success ? "text-emerald-600" : "text-red-600"
            )}>
              {testResult.success ? (
                <CheckCircle2 className="h-3.5 w-3.5" />
              ) : (
                <XCircle className="h-3.5 w-3.5" />
              )}
              <span>{testResult.details || (testResult.success ? "اتصال ناجح" : "فشل الاتصال")}</span>
            </div>
          )}
          
          {isTesting && (
            <div className="flex items-center gap-2 text-xs text-amber-600 animate-pulse">
              <Activity className="h-3.5 w-3.5 animate-spin" />
              <span>جارٍ اختبار الاتصال...</span>
            </div>
          )}
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex items-center gap-2 pt-4 border-t border-border/50">
        {integration.hasCredentials ? (
          <>
            <GarfixButton
              variant="outline"
              size="sm"
              onClick={() => onTestConnection(integration.type)}
              isLoading={isTesting}
              leadingIcon={<Activity size={14} />}
            >
              اختبار الاتصال
            </GarfixButton>
            
            <GarfixButton
              variant="secondary"
              size="sm"
              onClick={() => onConfigure(integration.type)}
              leadingIcon={<Settings size={14} />}
            >
              إعدادات
            </GarfixButton>

            {onDisconnect && (
              <button
                onClick={handleDisconnect}
                className="ml-auto p-2 rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20 transition-colors"
                title="قطع الاتصال"
              >
                <Unplug size={16} />
              </button>
            )}
          </>
        ) : (
          <GarfixButton
            variant="primary"
            size="sm"
            onClick={() => onConfigure(integration.type)}
            leadingIcon={<Plug size={14} />}
          >
            تهيئة التكامل
          </GarfixButton>
        )}
      </div>
    </GarfixCard>
  );
};

IntegrationCard.displayName = "IntegrationCard";

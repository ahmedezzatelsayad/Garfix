"use client";

/**
 * MatchStatusBadge — شارة حالة المطابقة للمنتجات في BulkInput
 *
 * يعرض حالة كل بند بعد الاستخراج:
 * - ✅ مطابق (matched) - تم ربطه بمنتج موجود في الكتالوج
 * - 🧠 متعلم (ml-learned) - تم التعرف عليه عبر التعلم الآلي
 * - 🔵 منتج جديد (new) - سيتم إضافته للمخزن تلقائياً
 * - ⚠️ يحتاج مراجعة (review) - التطابقة غير مؤكدة (AI resolver)
 * - ❌ خطأ (error) - فشل في المطابقة أو الربط
 */

import { CheckCircle2, PlusCircle, AlertTriangle, XCircle, Search, Brain } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

// ─── Types ───────────────────────────────────────────────────────────────

export type MatchStatus = "matched" | "ml-learned" | "new" | "review" | "error" | "pending";

interface MatchStatusBadgeProps {
  status: MatchStatus;
  /** اسم المنتج المطابق (للمطابقات الناجحة) */
  matchedProductName?: string;
  /** مستوى الثقة (0-1) للتطابقات بالذكاء الاصطناعي */
  confidence?: number;
  /** رسالة الخطأ */
  errorMessage?: string;
  /** callback لتغيير المنتج المرتبط */
  onOverride?: () => void;
  /** حجم الشارة */
  size?: "sm" | "md";
  /** عرض زر التغيير */
  showOverride?: boolean;
  /** معرف النمط المتعلم (لحالات ml-learned) */
  patternId?: string;
  /** عدد مرات تأكيد هذا النمط */
  patternConfirmCount?: number;
}

// ─── Status Config ─────────────────────────────────────────────────────

const STATUS_CONFIG: Record<MatchStatus, {
  label: string;
  icon: React.ElementType;
  color: string;
  bgColor: string;
  borderColor: string;
}> = {
  matched: {
    label: "مطابق",
    icon: CheckCircle2,
    color: "text-green-700",
    bgColor: "bg-green-50",
    borderColor: "border-green-200",
  },
  "ml-learned": {
    label: "متعلم 🧠",
    icon: Brain,
    color: "text-purple-700",
    bgColor: "bg-purple-50",
    borderColor: "border-purple-200",
  },
  new: {
    label: "منتج جديد",
    icon: PlusCircle,
    color: "text-blue-700",
    bgColor: "bg-blue-50",
    borderColor: "border-blue-200",
  },
  review: {
    label: "يحتاج مراجعة",
    icon: AlertTriangle,
    color: "text-yellow-700",
    bgColor: "bg-yellow-50",
    borderColor: "border-yellow-200",
  },
  error: {
    label: "خطأ",
    icon: XCircle,
    color: "text-red-700",
    bgColor: "bg-red-50",
    borderColor: "border-red-200",
  },
  pending: {
    label: "قيد المعالجة",
    icon: Search,
    color: "text-gray-600",
    bgColor: "bg-gray-50",
    borderColor: "border-gray-200",
  },
};

// ─── Component ──────────────────────────────────────────────────────────

export function MatchStatusBadge({
  status,
  matchedProductName,
  confidence,
  errorMessage,
  onOverride,
  size = "sm",
  showOverride = true,
  patternId,
  patternConfirmCount,
}: MatchStatusBadgeProps) {
  const config = STATUS_CONFIG[status];
  const Icon = config.icon;

  // ─── Confidence Display ─────────────────────────────────────────────

  const renderConfidence = () => {
    if (confidence === undefined || confidence === null) return null;
    
    const pct = Math.round(confidence * 100);
    let color = "text-green-600";
    if (pct < 70) color = "text-red-600";
    else if (pct < 85) color = "text-yellow-600";

    return (
      <span className={cn("font-mono text-xs", color)}>({pct}%)</span>
    );
  };

  // ─── Size Classes ──────────────────────────────────────────────────

  const sizeClasses = {
    sm: "px-2 py-0.5 text-[11px] gap-1",
    md: "px-3 py-1.5 text-[13px] gap-1.5",
  };

  // ─── Render ──────────────────────────────────────────────────────────

  return (
    <div className={cn("flex items-center gap-2 flex-wrap")}>
      {/* Main Badge */}
      <Badge
        variant="outline"
        className={cn(
          sizeClasses[size],
          config.color,
          config.bgColor,
          config.borderColor,
          "font-medium border cursor-default select-none",
          status === "ml-learned" && "animate-pulse"
        )}
        title={status === "ml-learned" ? `نمط متعلم #${patternId?.slice(0, 8)} - مؤكد ${patternConfirmCount || 0} مرة` : undefined}
      >
        <Icon size={size === "sm" ? 12 : 14} />
        <span>{config.label}</span>
        {renderConfidence()}
        {/* Pattern confirm count for ML matches */}
        {status === "ml-learned" && patternConfirmCount !== undefined && patternConfirmCount > 1 && (
          <span className="text-[9px] opacity-70">×{patternConfirmCount}</span>
        )}
      </Badge>

      {/* Matched Product Name */}
      {status === "matched" && matchedProductName && (
        <span className="text-xs text-gray-600 truncate max-w-[120px]" title={matchedProductName}>
          → {matchedProductName}
        </span>
      )}

      {/* Error Message */}
      {status === "error" && errorMessage && (
        <span className="text-xs text-red-600 truncate max-w-[150px]" title={errorMessage}>
          {errorMessage}
        </span>
      )}

      {/* Override Button */}
      {showOverride && onOverride && status !== "pending" && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={(e) => {
            e.stopPropagation();
            onOverride();
          }}
          className={cn(
            "h-auto p-1 text-xs hover:text-[#7C3AED]",
            size === "sm" && "text-[10px]"
          )}
          title="تغيير المنتج المرتبط"
        >
          <Search size={size === "sm" ? 10 : 12} />
          تغيير
        </Button>
      )}
    </div>
  );
}

// ─── Helper: Determine status from match result ─────────────────────────

export function getMatchStatusFromResult(result?: {
  method?: string;
  confidence?: number;
  error?: string;
  source?: string;
}): MatchStatus {
  if (!result || !result.method) return "pending";
  
  // Check for ML-based methods first
  if (result.method === "ml-pattern" || result.method === "ml-enhanced") {
    return "ml-learned";
  }
  
  // Check source for ML indication
  if (result.source?.startsWith("ml-")) {
    return "ml-learned";
  }
  
  switch (result.method) {
    case "exact":
    case "norm":
      return "matched";
    case "fuzzy":
      if ((result.confidence ?? 0) >= 0.85) return "matched";
      if ((result.confidence ?? 0) >= 0.70) return "review";
      return "new";
    case "ai":
      if ((result.confidence ?? 0) >= 0.85) return "matched";
      return "review";
    case "new":
      return "new";
    default:
      if (result.error) return "error";
      return "pending";
  }
}

// ─── Export Types ───────────────────────────────────────────────────────

export type { MatchStatusBadgeProps };

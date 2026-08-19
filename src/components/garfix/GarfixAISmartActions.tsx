/**
 * ═══════════════════════════════════════════════════════════════
 * GarfiX AI - Smart Actions Components (Phase 3)
 * 
 * AI-powered smart action components:
 * - Invoice Intelligence (Describe, Extract, Translate, Validate)
 * - Dashboard Insights (Forecast, Alerts, Suggestions)
 * - Smart Navigation & KPI Cards with AI Commentary
 * ═══════════════════════════════════════════════════════════════
 */

"use client";

import * as React from "react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  GarfixAIIcon,
  GarfixAIBadge,
} from "./GarfixAIIcon"



// ═══════════════════════════════════════════════════════════════
// SECTION 1: Invoice Intelligence Components
// ═══════════════════════════════════════════════════════════════

export interface AIInvoiceAssistantProps {
  currentStep?: "client" | "items" | "details" | "review"
  onDescribe?: (description: string) => void
  onExtract?: () => void
  onTranslate?: (direction: "to-en" | "to-ar") => void
  onValidate?: () => void
  onDetectAnomalies?: () => void
  isProcessing?: boolean
  className?: string
}

export function AIInvoiceAssistant({
  currentStep = "client",
  onDescribe,
  onExtract,
  onTranslate,
  onValidate,
  onDetectAnomalies,
  isProcessing = false,
  className,
}: AIInvoiceAssistantProps) {
  const actions = [
    {
      id: "describe",
      label: "وصف باللغة الطبيعية",
      description: "اكتب فاتورتك بالعربي وسيحولها AI",
      icon: "✍️",
      onClick: () => onDescribe?.(""),
      available: true,
    },
    {
      id: "extract",
      label: "استخراج من صورة/PDF",
      description: "ارفع مستند واستخرج البيانات تلقائياً",
      icon: "📷",
      onClick: onExtract,
      available: true,
    },
    {
      id: "translate",
      label: "ترجمة الفاتورة",
      description: "ترجم بين العربية والإنجليزية",
      icon: "🌐",
      onClick: () => onTranslate?.("to-en"),
      available: currentStep === "review",
    },
    {
      id: "validate",
      label: "التحقق من الصحة",
          description: "تأكد من صحة البيانات والضرائب",
      icon: "✅",
      onClick: onValidate,
      available: currentStep === "details" || currentStep === "review",
    },
    {
      id: "anomalies",
      label: "كشف الشذوذ",
      description: "اكتشف أي أخطاء أو تناقضات",
      icon: "🔍",
      onClick: onDetectAnomalies,
      available: currentStep === "review",
    },
  ]

  return (
    <Card className={cn("overflow-hidden", className)} dir="rtl">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-3">
          <GarfixAIIcon size="lg" glow animated />
          <div>
            <CardTitle className="text-base">مساعد الفواتير الذكي</CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">
              استخدم قوة AI لإنشاء فواتير أسرع وأدق
            </p>
          </div>
        </div>
      </CardHeader>

      <CardContent className="pt-0">
        {/* Current Step Indicator */}
        <div className="flex items-center gap-2 mb-4">
          {(["client", "items", "details", "review"] as const).map((step, i) => (
            <React.Fragment key={step}>
              <div className={cn(
                "flex items-center justify-center w-8 h-8 rounded-full text-xs font-medium transition-colors",
                currentStep === step
                  ? "bg-primary text-primary-foreground"
                  : i < ["client", "items", "details", "review"].indexOf(currentStep)
                    ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                    : "bg-muted text-muted-foreground"
              )}>
                {i + 1}
              </div>
              {i < 3 && (
                <div className={cn(
                  "flex-1 h-0.5",
                  i < ["client", "items", "details", "review"].indexOf(currentStep)
                    ? "bg-primary"
                    : "bg-muted"
                )} />
              )}
            </React.Fragment>
          ))}
        </div>

        {/* Action Buttons Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {actions.filter(a => a.available).map((action) => (
            <button
              key={action.id}
              type="button"
              onClick={action.onClick}
              disabled={isProcessing}
              className={cn(
                "flex items-start gap-3 p-3 rounded-lg border text-start transition-all",
                "hover:border-primary/30 hover:bg-primary/5 hover:shadow-g-sm",
                "disabled:opacity-50 disabled:cursor-not-allowed min-h-[60px]",
                "touch-manipulation"
              )}
            >
              <span className="text-xl">{action.icon}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground">{action.label}</p>
                <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-1">
                  {action.description}
                </p>
              </div>
            </button>
          ))}
        </div>

        {/* Processing Indicator */}
        {isProcessing && (
          <div className="mt-4 flex items-center justify-center gap-2 p-3 bg-primary/5 rounded-lg">
            <GarfixAIBadge status="thinking" size="sm" showLabel />
            <span className="text-sm text-primary">جارٍ المعالجة بالذكاء الاصطناعي...</span>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ═══════════════════════════════════════════════════════════════
// SECTION 2: Natural Language Invoice Input
// ═══════════════════════════════════════════════════════════════

export interface AIDescribeInputProps {
  value: string
  onChange: (value: string) => void
  onSubmit: (description: string) => void
  isProcessing?: boolean
  examples?: string[]
  placeholder?: string
  className?: string
}

export function AIDescribeInput({
  value,
  onChange,
  onSubmit,
  isProcessing = false,
  examples = [],
  placeholder = "مثال: فاتورة بيع لأحمد علي بمبلغ 5000 ريال شامل الضريبة...",
  className,
}: AIDescribeInputProps) {
  const [isFocused, setIsFocused] = React.useState(false)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (value.trim() && !isProcessing) {
      onSubmit(value)
    }
  }

  return (
    <div className={cn("space-y-3", className)} dir="rtl">
      <form onSubmit={handleSubmit}>
        <div className="relative">
          <textarea
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            placeholder={placeholder}
            rows={3}
            disabled={isProcessing}
            className={cn(
              "w-full px-4 py-3 rounded-lg border bg-backgroundackground text-foreground resize-none",
              "placeholder:text-muted-foreground transition-all duration-200",
              "focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary",
              "disabled:opacity-50",
              isFocused && "shadow-g-sm ring-2 ring-primary/10"
            )}
          />

          {/* AI Badge */}
          <div className="absolute start-3 top-3">
            <GarfixAIIcon size="sm" className={isFocused ? "text-primary" : "text-muted-foreground"} />
          </div>

          {/* Submit Button */}
          <Button
            type="submit"
            size="sm"
            disabled={!value.trim() || isProcessing}
            className="absolute bottom-3 end-3 min-h-[36px]"
          >
            {isProcessing ? (
              <>
                <GarfixAIBadge status="thinking" size="sm" showLabel={false} className="ms-1" />
                <span>جارٍ...</span>
              </>
            ) : (
              <>
                إنشاء الفاتورة
                <svg className="w-4 h-4 ms-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
              </>
            )}
          </Button>
        </div>
      </form>

      {/* Examples */}
      {examples.length > 0 && !value && (
        <div className="space-y-1.5">
          <p className="text-[11px] text-muted-foreground">أمثلة:</p>
          <div className="flex flex-wrap gap-1.5">
            {examples.map((example, i) => (
              <button
                key={i}
                type="button"
                onClick={() => onChange(example)}
                className="px-2 py-1 text-[11px] rounded-full bg-muted hover:bg-primary/10 text-muted-foreground hover:text-primary transition-colors"
              >
                {example.length > 50 ? example.slice(0, 50) + "..." : example}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// SECTION 3: Dashboard Insights Component
// ═══════════════════════════════════════════════════════════════

export interface InsightItem {
  id: string
  type: "success" | "warning" | "info" | "opportunity"
  title: string
  message: string
  actionLabel?: string
  onAction?: () => void
}

export interface AIDashboardInsightsProps {
  insights: InsightItem[]
  isLoading?: boolean
  onRefresh?: () => void
  maxItems?: number
  className?: string
}

const insightConfig = {
  success: {
    icon: "✅",
    bgColor: "bg-emerald-50 dark:bg-emerald-900/20",
    borderColor: "border-emerald-200 dark:border-emerald-800",
    textColor: "text-emerald-700 dark:text-emerald-400",
  },
  warning: {
    icon: "⚠️",
    bgColor: "bg-cardmber-50 dark:bg-cardmber-900/20",
    borderColor: "border-amber-200 dark:border-amber-800",
    textColor: "text-amber-700 dark:text-amber-400",
  },
  info: {
    icon: "ℹ️",
    bgColor: "bg-backgroundlue-50 dark:bg-backgroundlue-900/20",
    borderColor: "border-blue-200 dark:border-blue-800",
    textColor: "text-blue-700 dark:text-blue-400",
  },
  opportunity: {
    icon: "💡",
    bgColor: "bg-violet-50 dark:bg-violet-900/20",
    borderColor: "border-violet-200 dark:border-violet-800",
    textColor: "text-violet-700 dark:text-violet-400",
  },
}

export function AIDashboardInsights({
  insights,
  isLoading,
  onRefresh,
  maxItems = 4,
  className,
}: AIDashboardInsightsProps) {
  const displayInsights = insights.slice(0, maxItems)

  return (
    <Card className={cn("overflow-hidden", className)} dir="rtl">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <GarfixAIIcon size="md" glow />
            <CardTitle className="text-base">رؤى ذكية</CardTitle>
          </div>
          
          {onRefresh && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onRefresh}
              disabled={isLoading}
              className="h-8 w-8 p-0"
            >
              <svg className={cn("w-4 h-4", isLoading && "animate-spin")} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </Button>
          )}
        </div>
      </CardHeader>

      <CardContent className="pt-0 space-y-2">
        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-16 bg-muted rounded-lg animate-pulse" />
            ))}
          </div>
        ) : displayInsights.length > 0 ? (
          displayInsights.map((insight) => {
            const config = insightConfig[insight.type]
            
            return (
              <div
                key={insight.id}
                className={cn(
                  "p-3 rounded-lg border transition-all hover:shadow-g-sm",
                  config.bgColor,
                  config.borderColor
                )}
              >
                <div className="flex items-start gap-3">
                  <span className="text-lg">{config.icon}</span>
                  <div className="flex-1 min-w-0">
                    <p className={cn("font-medium text-sm", config.textColor)}>
                      {insight.title}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {insight.message}
                    </p>
                    
                    {insight.actionLabel && insight.onAction && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={insight.onAction}
                        className={cn("mt-2 h-7 text-xs", config.textColor, `hover:${config.bgColor}`)}
                      >
                        {insight.actionLabel}
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            )
          })
        ) : (
          <div className="text-center py-6 text-muted-foreground">
            <GarfixAIIcon size="lg" className="mx-auto mb-2 opacity-30" />
            <p className="text-sm">لا توجد رؤى حالياً</p>
            <p className="text-xs mt-1">ستظهر هنا رؤى AI بناءً على بياناتك</p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ═══════════════════════════════════════════════════════════════
// SECTION 4: AI-Powered KPI Card
// ═══════════════════════════════════════════════════════════════

export interface AIKpiCardProps {
  title: string
  value: number | string
  format?: "number" | "currency" | "percentage"
  change?: number
  changeType?: "positive" | "negative" | "neutral"
  /** AI-generated commentary */
  aiCommentary?: string
  /** AI trend prediction */
  aiTrend?: "up" | "down" | "stable"
  trendConfidence?: number
  onClick?: () => void
  className?: string
}

export function AIKpiCard({
  title,
  value,
  format = "number",
  change,
  changeType = "neutral",
  aiCommentary,
  aiTrend,
  trendConfidence,
  onClick: _onClick,
  className,
}: AIKpiCardProps) {
  const [showCommentary, setShowCommentary] = React.useState(false)

  const formatValue = () => {
    if (typeof value === "string") return value
    
    switch (format) {
      case "currency":
        return new Intl.NumberFormat("ar-SA", {
          style: "currency",
          currency: "SAR",
        }).format(value)
      case "percentage":
        return `${value}%`
      default:
        return new Intl.NumberFormat("ar-SA").format(value)
    }
  }

  return (
    <Card
      className={cn(
        "overflow-hidden cursor-pointer transition-all hover:shadow-g-md hover:-translate-y-0.5",
        className
      )}
      onClick={() => setShowCommentary(!showCommentary)}
      dir="rtl"
    >
      <CardContent className="p-4 space-y-3">
        {/* Header */}
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground font-medium">{title}</p>
          {aiTrend && (
            <AITooltip content={`توقع AI: ${aiTrend === "up" ? "صعود" : aiTrend === "down" ? "هبوط" : "استقرار"} (${trendConfidence}% ثقة)`}>
              <div className={cn(
                "w-6 h-6 rounded-full flex items-center justify-center",
                aiTrend === "up" && "bg-emerald-100 text-emerald-600",
                aiTrend === "down" && "bg-red-100 text-red-600",
                aiTrend === "stable" && "bg-muted text-muted-foreground"
              )}>
                {aiTrend === "up" && <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" /></svg>}
                {aiTrend === "down" && <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" /></svg>}
                {aiTrend === "stable" && <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14" /></svg>}
              </div>
            </AITooltip>
          )}
        </div>

        {/* Value */}
        <div className="flex items-baseline gap-2">
          <p className="text-2xl font-bold text-foreground">{formatValue()}</p>
          
          {change !== undefined && (
            <Badge
              variant={changeType === "positive" ? "default" : changeType === "negative" ? "destructive" : "secondary"}
              className="text-[10px]"
            >
              {changeType === "positive" ? "+" : ""}{change}%
            </Badge>
          )}
        </div>

        {/* AI Commentary (Expandable) */}
        {aiCommentary && (
          <div className={cn(
            "overflow-hidden transition-all duration-300",
            showCommentary ? "max-h-20 opacity-100" : "max-h-0 opacity-0"
          )}>
            <div className="flex items-start gap-2 pt-2 border-t">
              <GarfixAIIcon size="xs" className="mt-0.5 shrink-0" />
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                {aiCommentary}
              </p>
            </div>
          </div>
        )}

        {/* Click Hint */}
        {aiCommentary && !showCommentary && (
          <p className="text-[10px] text-primary/60 text-center">انقر للرؤية الذكية</p>
        )}
      </CardContent>
    </Card>
  )
}

// ═══════════════════════════════════════════════════════════════
// SECTION 5: Smart Navigation Helper
// ═══════════════════════════════════════════════════════════════

export interface AISmartNavProps {
  suggestions: Array<{
    id: string
    label: string
    description: string
    icon?: string
    href: string
  }>
  onSelect: (href: string) => void
  className?: string
}

export function AISmartNav({
  suggestions,
  onSelect,
  className,
}: AISmartNavProps) {
  return (
    <div className={cn("space-y-2", className)} dir="rtl">
      <div className="flex items-center gap-2 text-xs text-muted-foreground px-2">
        <GarfixAIIcon size="xs" />
        <span>اقتراحات التنقل</span>
      </div>
      
      {suggestions.map((suggestion) => (
        <button
          key={suggestion.id}
          type="button"
          onClick={() => onSelect(suggestion.href)}
          className={cn(
            "w-full flex items-center gap-3 p-2.5 rounded-lg text-start transition-all",
            "hover:bg-muted hover:shadow-g-sm",
            "min-h-[44px] touch-manipulation"
          )}
        >
          <span className="text-lg">{suggestion.icon || "📄"}</span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground truncate">
              {suggestion.label}
            </p>
            <p className="text-[11px] text-muted-foreground truncate">
              {suggestion.description}
            </p>
          </div>
          <svg className="w-4 h-4 text-muted-foreground shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
      ))}
    </div>
  )
}

// Small wrapper for AITooltip to avoid import issues here
function AITooltip({ children, content }: { children: React.ReactNode; content: string }) {
  const [show, setShow] = React.useState(false)
  
  return (
    <div className="relative inline-block" onMouseEnter={() => setShow(true)} onMouseLeave={() => setShow(false)}>
      {children}
      {show && (
        <div className="absolute bottom-full right-1/2 translate-x-1/2 mb-2 w-max max-w-xs p-2 bg-popover border rounded shadow-brand-lg z-50 text-xs">
          {content}
          <div className="absolute top-full right-1/2 translate-x-1/2 -mt-1 w-2 h-2 bg-popover border-r border-b rotate-45" />
        </div>
      )}
    </div>
  )
}

// End of GarfixAISmartActions.tsx

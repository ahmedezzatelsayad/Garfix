/**
 * ═══════════════════════════════════════════════════════════════
 * GarfiX AI - Contextual Integration Components (Phase 2)
 * 
 * AI-enhanced UI components:
 * - Empty States with AI onboarding
 * - Smart Form fields (Auto-fill, Validate, Categorize)
 * - Table AI features (Search, Summarize, Export)
 * ═══════════════════════════════════════════════════════════════
 */

"use client";

import * as React from "react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { 
  GarfixAIIcon, 
  GarfixAIBadge,
} from "./GarfixAIIcon"
import {
  AIInlineSuggestion,
  AITooltip,
} from "./GarfixAIComponents"
import { Badge } from "@/components/ui/badge"

// ═══════════════════════════════════════════════════════════════
// SECTION 1: AI-Enhanced Empty States
// ═══════════════════════════════════════════════════════════════

export interface AIEmptyStateProps {
  type: "invoices" | "clients" | "products" | "reports" | "search" | "general"
  title?: string
  description?: string
  primaryAction?: {
    label: string
    onClick: () => void
    variant?: "default" | "gradient" | "outline"
  }
  aiAction?: {
    label: string
    onClick: () => void
    description?: string
  }
  suggestions?: Array<{
    id: string
    label: string
    onClick: () => void
  }>
  compact?: boolean
  className?: string
}

const emptyStateConfig = {
  invoices: {
    title: "لا توجد فواتير بعد",
    description: "ابدأ بإنشاء فاتورتك الأولى أو دع GarfiX AI يساعدك",
    icon: "📄" as const,
  },
  clients: {
    title: "لا يوجد عملاء بعد",
    description: "أضف عميلك الأول لبدء إدارة أعمالك بذكاء",
    icon: "👥" as const,
  },
  products: {
    title: "لا توجد منتجات بعد",
    description: "أضف منتجاتك أو خدماتك إلى الكتالوج",
    icon: "📦" as const,
  },
  reports: {
    title: "لا توجد تقارير متاحة",
    description: "ابدأ بإضافة البيانات لإنشاء تقارير ذكية",
    icon: "📊" as const,
  },
  search: {
    title: "لا توجد نتائج",
    description: "جرب كلمات مختلفة أو استخدم البحث الذكي باللغة الطبيعية",
    icon: "🔍" as const,
  },
  general: {
    title: "لا توجد بيانات",
    description: "ابدأ بإضافة بياناتك الأولى",
    icon: "✨" as const,
  },
}

export function AIEmptyState({
  type = "general",
  title,
  description,
  primaryAction,
  aiAction,
  suggestions = [],
  compact = false,
  className,
}: AIEmptyStateProps) {
  const config = emptyStateConfig[type]

  return (
    <div 
      className={cn(
        "flex flex-col items-center justify-center py-12 px-4 text-center",
        compact && "py-6",
        className
      )}
      dir="rtl"
    >
      {/* AI Illustration */}
      <div className="relative mb-6">
        <div className={cn(
          "rounded-full flex items-center justify-center",
          "bg-gradient-to-br from-violet-100 to-purple-100 dark:from-violet-900/30 dark:to-purple-900/30",
          compact ? "w-16 h-16" : "w-24 h-24"
        )}>
          <span className={compact ? "text-2xl" : "text-4xl"}>{config.icon}</span>
        </div>
        
        {/* AI Badge */}
        <div className="absolute -bottom-1 -start-1">
          <GarfixAIIcon size="xs" glow />
        </div>
      </div>

      {/* Content */}
      <h3 className={cn(
        "font-semibold text-foreground mb-2",
        compact ? "text-base" : "text-xl"
      )}>
        {title || config.title}
      </h3>
      
      <p className={cn(
        "text-muted-foreground mb-6 max-w-sm",
        compact ? "text-xs" : "text-sm"
      )}>
        {description || config.description}
      </p>

      {/* Actions */}
      <div className="flex flex-wrap items-center justify-center gap-3">
        {primaryAction && (
          <Button
            variant={primaryAction.variant === "gradient" ? "default" : primaryAction.variant || "default"}
            onClick={primaryAction.onClick}
            className={cn(
              primaryAction.variant === "gradient" && "bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700",
              "min-h-[44px] touch-lg"
            )}
          >
            {primaryAction.label}
          </Button>
        )}

        {aiAction && (
          <Button
            variant="outline"
            onClick={aiAction.onClick}
            className="min-h-[44px] touch-lg border-primary/20 hover:bg-primary/5"
          >
            <GarfixAIIcon size="sm" className="ms-2" />
            {aiAction.label}
          </Button>
        )}
      </div>

      {/* AI Suggestions Grid */}
      {suggestions.length > 0 && !compact && (
        <div className="mt-8 w-full max-w-md">
          <p className="text-xs text-muted-foreground mb-3">اقتراحات سريعة:</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {suggestions.map((suggestion) => (
              <AIInlineSuggestion
                key={suggestion.id}
                label={suggestion.label}
                onClick={suggestion.onClick}
                variant="subtle"
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// SECTION 2: Smart Form Fields with AI
// ═══════════════════════════════════════════════════════════════

export interface AIFormFieldProps {
  label: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  type?: "text" | "number" | "email" | "tel"
  /** Enable auto-fill from AI */
  enableAutoFill?: boolean
  onAutoFill?: () => void
  /** Enable real-time validation */
  enableValidation?: boolean
  validationStatus?: "valid" | "invalid" | "loading"
  validationMessage?: string
  /** AI explanation tooltip */
  explanation?: string
  disabled?: boolean
  required?: boolean
  className?: string
}

export function AIFormField({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  enableAutoFill,
  onAutoFill,
  enableValidation,
  validationStatus,
  validationMessage,
  explanation,
  disabled,
  required,
  className,
}: AIFormFieldProps) {
  const [isFocused, setIsFocused] = React.useState(false)

  return (
    <div className={cn("space-y-2", className)} dir="rtl">
      {/* Label with AI indicator */}
      <div className="flex items-center gap-2">
        <label className="text-sm font-medium text-foreground">
          {label}
          {required && <span className="text-destructive ms-1">*</span>}
        </label>
        
        {enableAutoFill && (
          <AITooltip content="يمكن لـ AI ملء هذا الحقل تلقائياً بناءً على سياقك">
            <button
              type="button"
              onClick={onAutoFill}
              className="text-primary hover:text-primary/80 transition-colors"
              disabled={disabled}
            >
              <GarfixAIIcon size="xs" />
            </button>
          </AITooltip>
        )}

        {explanation && (
          <AITooltip content={explanation}>
            <span className="text-muted-foreground cursor-help text-xs">ℹ️</span>
          </AITooltip>
        )}
      </div>

      {/* Input Container */}
      <div className="relative">
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          className={cn(
            "w-full min-h-[44px] px-3 py-2 rounded-lg border bg-backgroundackground text-foreground",
            "placeholder:text-muted-foreground transition-all duration-200",
            "focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary",
            "disabled:opacity-50 disabled:cursor-not-allowed",
            isFocused && "shadow-g-sm",
            validationStatus === "valid" && "border-emerald-500 bg-emerald-50/50 dark:bg-emerald-900/10",
            validationStatus === "invalid" && "border-destructive bg-destructive/5",
            validationStatus === "loading" && "border-primary animate-pulse-slow"
          )}
        />

        {/* Validation Status Icon */}
        {enableValidation && validationStatus && (
          <div className="absolute start-3 top-1/2 -translate-y-1/2">
            {validationStatus === "valid" && (
              <svg className="w-4 h-4 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 6" />
              </svg>
            )}
            {validationStatus === "invalid" && (
              <svg className="w-4 h-4 text-destructive" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            )}
            {validationStatus === "loading" && (
              <GarfixAIBadge status="thinking" size="sm" showLabel={false} />
            )}
          </div>
        )}
      </div>

      {/* Validation Message */}
      {validationMessage && (
        <p className={cn(
          "text-xs",
          validationStatus === "invalid" ? "text-destructive" : "text-muted-foreground"
        )}>
          {validationMessage}
        </p>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// SECTION 3: AI-Powered Categorizer
// ═══════════════════════════════════════════════════════════════

export interface AICategorizerProps {
  categories: string[]
  selected: string[]
  onSelect: (selected: string[]) => void
  allowAISuggest?: boolean
  onSuggestCategories?: () => void
  isSuggesting?: boolean
  aiSuggestions?: string[]
  multiSelect?: boolean
  className?: string
}

export function AICategorizer({
  categories,
  selected,
  onSelect,
  allowAISuggest,
  onSuggestCategories,
  isSuggesting,
  aiSuggestions = [],
  multiSelect = true,
  className,
}: AICategorizerProps) {
  const [showAISuggestions, setShowAISuggestions] = React.useState(false)

  const toggleCategory = (category: string) => {
    if (multiSelect) {
      if (selected.includes(category)) {
        onSelect(selected.filter(c => c !== category))
      } else {
        onSelect([...selected, category])
      }
    } else {
      onSelect([category])
    }
  }

  const allCategories = showAISuggestions && aiSuggestions.length > 0
    ? [...new Set([...categories, ...aiSuggestions])]
    : categories

  return (
    <div className={cn("space-y-3", className)} dir="rtl">
      {/* Header with AI Suggest Button */}
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-foreground">التصنيف</label>
        
        {allowAISuggest && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              if (showAISuggestions) {
                onSuggestCategories?.()
              } else {
                setShowAISuggestions(true)
                onSuggestCategories?.()
              }
            }}
            disabled={isSuggesting}
            className="text-primary hover:text-primary/80 h-8 px-2"
          >
            {isSuggesting ? (
              <>
                <GarfixAIBadge status="thinking" size="sm" showLabel={false} className="ms-1" />
                <span className="text-xs">جارٍ التحليل...</span>
              </>
            ) : (
              <>
                <GarfixAIIcon size="xs" className="ms-1" />
                <span className="text-xs">اقتراح ذكي</span>
              </>
            )}
          </Button>
        )}
      </div>

      {/* Categories Grid */}
      <div className="flex flex-wrap gap-2">
        {allCategories.map((category) => {
          const isSelected = selected.includes(category)
          const isAISuggested = aiSuggestions.includes(category) && !categories.includes(category)
          
          return (
            <button
              key={category}
              type="button"
              onClick={() => toggleCategory(category)}
              className={cn(
                "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm transition-all min-h-[36px]",
                "border cursor-pointer touch-manipulation",
                isSelected
                  ? "bg-primary text-primary-foreground border-primary shadow-g-sm"
                  : "bg-backgroundackground text-foreground border-border hover:border-primary/30 hover:bg-primary/5",
                isAISuggested && !isSelected && "border-primary/40 bg-primary/5"
              )}
            >
              {isAISuggested && <GarfixAIIcon size="xs" />}
              {category}
              {isSelected && (
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 6" />
                </svg>
              )}
            </button>
          )
        })}
      </div>

      {/* Empty State */}
      {categories.length === 0 && !isSuggesting && (
        <p className="text-xs text-muted-foreground text-center py-4">
          لا توجد تصنيفات.{" "}
          {allowAISuggest && (
            <button
              onClick={onSuggestCategories}
              className="text-primary hover:underline"
            >
              اطلب اقتراحات من AI
            </button>
          )}
        </p>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// SECTION 4: AI Search Bar for Tables
// ═══════════════════════════════════════════════════════════════

export interface AISearchBarProps {
  query: string
  onQueryChange: (query: string) => void
  onSearch: (query: string) => void
  enableAINaturalSearch?: boolean
  onAISearch?: (naturalQuery: string) => void
  suggestions?: string[]
  recentSearches?: string[]
  isLoading?: boolean
  placeholder?: string
  className?: string
}

export function AISearchBar({
  query,
  onQueryChange,
  onSearch,
  enableAINaturalSearch,
  onAISearch,
  suggestions = [],
  recentSearches = [],
  isLoading,
  placeholder = "بحث...",
  className,
}: AISearchBarProps) {
  const [isFocused, setIsFocused] = React.useState(false)
  const [showSuggestions, setShowSuggestions] = React.useState(false)
  const inputRef = React.useRef<HTMLInputElement>(null)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (query.trim()) {
      if (enableAINaturalSearch && isFocused) {
        onAISearch?.(query)
      } else {
        onSearch(query)
      }
      setShowSuggestions(false)
    }
  }

  const handleSuggestionClick = (suggestion: string) => {
    onQueryChange(suggestion)
    onSearch(suggestion)
    setShowSuggestions(false)
  }

  return (
    <div className={cn("relative", className)} dir="rtl">
      <form onSubmit={handleSubmit}>
        <div className="relative">
          {/* Search Icon */}
          <div className="absolute end-3 top-1/2 -translate-y-1/2 text-muted-foreground">
            {isLoading ? (
              <GarfixAIBadge status="thinking" size="sm" showLabel={false} />
            ) : (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            )}
          </div>

          {/* Input */}
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            onFocus={() => {
              setIsFocused(true)
              setShowSuggestions(true)
            }}
            onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
            placeholder={placeholder}
            className={cn(
              "w-full min-h-[44px] pe-10 ps-4 pr-10 rounded-lg border bg-backgroundackground text-foreground",
              "placeholder:text-muted-foreground transition-all duration-200",
              "focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary",
              isFocused && enableAINaturalSearch && "shadow-g-sm ring-2 ring-primary/10"
            )}
          />

          {/* AI Badge when focused in natural search mode */}
          {isFocused && enableAINaturalSearch && (
            <div className="absolute start-3 top-1/2 -translate-y-1/2">
              <GarfixAIBadge status="active" size="sm" showLabel={false} />
            </div>
          )}

          {/* Keyboard Shortcut Hint */}
          {!isFocused && (
            <kbd className="hidden sm:inline-flex absolute start-3 top-1/2 -translate-y-1/2 items-center px-1.5 py-0.5 rounded bg-muted border border-border text-[10px] font-mono text-muted-foreground">
              ⌘K
            </kbd>
          )}
        </div>
      </form>

      {/* Suggestions Dropdown */}
      {showSuggestions && (suggestions.length > 0 || recentSearches.length > 0) && (
        <div className="absolute top-full mt-2 w-full bg-popover border rounded-lg shadow-brand-lg z-50 overflow-hidden">
          {/* Recent Searches */}
          {recentSearches.length > 0 && (
            <div className="p-2">
              <p className="text-xs text-muted-foreground px-2 py-1">عمليات البحث الأخيرة</p>
              {recentSearches.slice(0, 5).map((search, i) => (
                <button
                  key={`recent-${i}`}
                  type="button"
                  onClick={() => handleSuggestionClick(search)}
                  className="w-full text-start px-2 py-1.5 text-sm rounded hover:bg-muted transition-colors flex items-center gap-2"
                >
                  <svg className="w-3 h-3 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  {search}
                </button>
              ))}
            </div>
          )}

          {/* AI Suggestions */}
          {suggestions.length > 0 && (
            <div className="p-2 border-t">
              <p className="text-xs text-muted-foreground px-2 py-1 flex items-center gap-1">
                <GarfixAIIcon size="xs" />
                اقتراحات ذكية
              </p>
              {suggestions.slice(0, 5).map((suggestion, i) => (
                <button
                  key={`suggest-${i}`}
                  type="button"
                  onClick={() => handleSuggestionClick(suggestion)}
                  className="w-full text-start px-2 py-1.5 text-sm rounded hover:bg-primary/5 transition-colors flex items-center gap-2"
                >
                  <GarfixAIIcon size="xs" />
                  {suggestion}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// SECTION 5: AI Summary Card for Data Tables
// ═══════════════════════════════════════════════════════════════

export interface AISummaryCardProps {
  title: string
  summary: string
  metrics?: Array<{
    label: string
    value: string
    change?: number
    changeType?: "positive" | "negative" | "neutral"
  }>
  insights?: string[]
  actions?: Array<{
    label: string
    onClick: () => void
  }>
  isLoading?: boolean
  onRegenerate?: () => void
  className?: string
}

export function AISummaryCard({
  title,
  summary,
  metrics = [],
  insights = [],
  actions = [],
  isLoading,
  onRegenerate,
  className,
}: AISummaryCardProps) {
  return (
    <Card className={cn("overflow-hidden", className)} dir="rtl">
      {/* Gradient Header */}
      <div className="bg-gradient-to-r from-violet-600 to-purple-600 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <GarfixAIIcon size="md" className="text-foreground" />
            <h3 className="font-semibold text-foreground">{title}</h3>
          </div>
          
          {onRegenerate && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onRegenerate}
              className="text-foreground/80 hover:text-foreground hover:bg-white/10"
              disabled={isLoading}
            >
              <svg className={cn("w-4 h-4", isLoading && "animate-spin")} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              <span className="hidden sm:inline ms-1 text-xs">إعادة توليد</span>
            </Button>
          )}
        </div>
      </div>

      <CardContent className="p-6 space-y-4">
        {/* Loading State */}
        {isLoading ? (
          <div className="space-y-3">
            <div className="h-4 bg-muted rounded animate-pulse w-full" />
            <div className="h-4 bg-muted rounded animate-pulse w-3/4" />
            <div className="h-4 bg-muted rounded animate-pulse w-1/2" />
          </div>
        ) : (
          <>
            {/* Summary Text */}
            <p className="text-sm text-foreground leading-relaxed">{summary}</p>

            {/* Metrics Grid */}
            {metrics.length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {metrics.map((metric, i) => (
                  <div key={i} className="p-3 rounded-lg bg-muted/50 space-y-1">
                    <p className="text-xs text-muted-foreground">{metric.label}</p>
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-foreground">{metric.value}</p>
                      {metric.change !== undefined && (
                        <Badge
                          variant={metric.changeType === "positive" ? "default" : metric.changeType === "negative" ? "destructive" : "secondary"}
                          className="text-[10px]"
                        >
                          {metric.changeType === "positive" ? "+" : ""}{metric.change}%
                        </Badge>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Insights List */}
            {insights.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-medium text-foreground flex items-center gap-1">
                  <GarfixAIIcon size="xs" />
                  رؤى ذكية
                </p>
                {insights.map((insight, i) => (
                  <div key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                    <span className="text-primary mt-1">•</span>
                    <span>{insight}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Action Buttons */}
            {actions.length > 0 && (
              <div className="flex flex-wrap gap-2 pt-4 border-t">
                {actions.map((action, i) => (
                  <Button
                    key={i}
                    variant="outline"
                    size="sm"
                    onClick={action.onClick}
                    className="min-h-[36px]"
                  >
                    {action.label}
                  </Button>
                ))}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}

// ═══════════════════════════════════════════════════════════════
// Pre-configured Empty States for Quick Use
// ═══════════════════════════════════════════════════════════════

export function EmptyInvoices(props: Partial<AIEmptyStateProps>) {
  return <AIEmptyState type="invoices" {...props} />
}

export function EmptyClients(props: Partial<AIEmptyStateProps>) {
  return <AIEmptyState type="clients" {...props} />
}

export function EmptyProducts(props: Partial<AIEmptyStateProps>) {
  return <AIEmptyState type="products" {...props} />
}

export function EmptyReports(props: Partial<AIEmptyStateProps>) {
  return <AIEmptyState type="reports" {...props} />
}

export function EmptySearch(props: Partial<AIEmptyStateProps>) {
  return <AIEmptyState type="search" {...props} />
}

// End of GarfixAIContextual.tsx

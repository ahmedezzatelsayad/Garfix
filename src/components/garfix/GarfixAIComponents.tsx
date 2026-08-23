import * as React from "react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { GarfixAIIcon, GarfixAIBadge } from "./GarfixAIIcon"

/**
 * GarfiX AI Copilot Bubble — Main conversational interface
 * 
 * Floating chat bubble that provides AI assistance throughout the app.
 * Can be triggered from anywhere and maintains context.
 */

interface AICopilotBubbleProps {
  /** Whether the bubble is open/expanded */
  isOpen?: boolean
  /** Current AI status */
  status?: "idle" | "thinking" | "active" | "error"
  /** Current conversation messages */
  messages?: AIMessage[]
  /** On toggle open/close */
  onToggle?: () => void
  /** On send message */
  onSend?: (message: string) => void
  /** Suggested actions */
  suggestions?: AISuggestion[]
  /** Custom class */
  className?: string
}

export interface AIMessage {
  id: string
  role: "user" | "assistant" | "system"
  content: string
  timestamp?: Date
  actions?: AIAction[]
}

export interface AISuggestion {
  id: string
  label: string
  icon?: React.ReactNode
  onClick: () => void
  variant?: "default" | "primary" | "outline"
}

export interface AIAction {
  id: string
  label: string
  onClick: () => void
  type?: "button" | "link" | "confirm"
}

export function AICopilotBubble({
  isOpen = false,
  status = "idle",
  messages = [],
  onToggle,
  onSend,
  suggestions = [],
  className,
}: AICopilotBubbleProps) {
  const [inputValue, setInputValue] = React.useState("")
  
  // Mobile: full screen, Desktop: floating panel
  return (
    <div
      className={cn(
        // Positioning
        "fixed z-50",
        // Mobile (full screen from bottom)
        "inset-x-0 bottom-0 sm:inset-auto",
        "sm:end-4 sm:bottom-4",
        // Sizing
        isOpen 
          ? "h-[85vh] sm:h-[600px] w-full sm:w-[400px]" 
          : "h-auto w-auto",
        // Transitions
        "transition-all duration-300 ease-out",
        className
      )}
    >
      {/* Toggle Button (when closed) */}
      {!isOpen && (
        <Button
          onClick={onToggle}
          size="icon"
          className="gradient-primary shadow-brand-lg hover:shadow-brand-xl h-14 w-14 rounded-full"
        >
          <GarfixAIIcon size="md" glow animated />
          <span className="sr-only">افتح GarfiX AI</span>
        </Button>
      )}

      {/* Chat Panel (when open) */}
      {isOpen && (
        <div className="flex flex-col h-full bg-card rounded-2xl border shadow-brand-xl overflow-hidden animate-fade-in">
          {/* ═══ Header ═══ */}
          <div className="flex items-center justify-between p-4 border-b bg-gradient-to-r from-primary/5 to-transparent">
            <div className="flex items-center gap-3">
              <GarfixAIIcon size="sm" glow animated={status === "thinking"} />
              <div>
                <h3 className="font-semibold text-sm">GarfiX AI</h3>
                <p className="text-xs text-muted-foreground">
                  {status === "thinking" ? "يفكر..." :
                   status === "active" ? "نشط" :
                   status === "error" ? "حدث خطأ" :
                   "جاهز للمساعدة"}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <GarfixAIBadge status={status} showLabel={false} />
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={onToggle}
                aria-label="إغلاق"
              >
                ✕
              </Button>
            </div>
          </div>

          {/* ═══ Messages Area ═══ */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 garfix-scroll">
            {messages.length === 0 ? (
              /* Empty state with welcome */
              <div className="flex flex-col items-center justify-center h-full text-center py-8">
                <GarfixAIIcon size="lg" glow animated className="mb-4" />
                <h4 className="font-semibold text-lg mb-2">مرحباً! 👋</h4>
                <p className="text-sm text-muted-foreground mb-6 max-w-[280px]">
                  أنا GarfiX AI، مساعدك الذكي. يمكنني مساعدتك في:
                </p>
                <ul className="text-sm text-left space-y-2 w-full max-w-[280px]">
                  <li className="flex items-start gap-2">
                    <span className="text-primary">•</span>
                    إنشاء وتحرير الفواتير
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-primary">•</span>
                    تحليل البيانات المالية
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-primary">•</span>
                    الإجابة على أسئلتك المحاسبية
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-primary">•</span>
                    اقتراحات لتحسين أعمالك
                  </li>
                </ul>
              </div>
            ) : (
              /* Message list */
              messages.map((msg) => (
                <div
                  key={msg.id}
                  className={cn(
                    "flex gap-3 animate-fade-in",
                    msg.role === "user" ? "flex-row-reverse" : "flex-row"
                  )}
                >
                  {/* Avatar */}
                  <div className={cn(
                    "size-8 rounded-full flex items-center justify-center shrink-0",
                    msg.role === "assistant" && "bg-primary/10"
                  )}>
                    {msg.role === "assistant" ? (
                      <GarfixAIIcon size="xs" />
                    ) : (
                      <span className="text-sm font-medium">أنت</span>
                    )}
                  </div>

                  {/* Message content */}
                  <div className={cn(
                    "max-w-[80%] rounded-2xl px-4 py-2.5",
                    msg.role === "user"
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted"
                  )}>
                    <p className="text-sm leading-relaxed">{msg.content}</p>
                    
                    {/* Actions for assistant messages */}
                    {msg.role === "assistant" && msg.actions && (
                      <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-border/50">
                        {msg.actions.map((action) => (
                          <Button
                            key={action.id}
                            variant="outline"
                            size="sm"
                            onClick={action.onClick}
                            className="text-xs h-7"
                          >
                            {action.label}
                          </Button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}

            {/* Thinking indicator */}
            {status === "thinking" && (
              <div className="flex gap-3 animate-fade-in">
                <GarfixAIIcon size="xs" />
                <div className="bg-muted rounded-2xl px-4 py-3">
                  <div className="flex gap-1.5">
                    <span className="size-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="size-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="size-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* ═══ Suggestions (when no input) ═══ */}
          {suggestions.length > 0 && !inputValue && (
            <div className="px-4 pb-2">
              <div className="flex flex-wrap gap-2">
                {suggestions.map((suggestion) => (
                  <Button
                    key={suggestion.id}
                    variant={suggestion.variant === "primary" ? "gradient" : suggestion.variant === "outline" ? "outline" : "secondary"}
                    size="sm"
                    onClick={suggestion.onClick}
                    className="text-xs"
                  >
                    {suggestion.icon}
                    {suggestion.label}
                  </Button>
                ))}
              </div>
            </div>
          )}

          {/* ═══ Input Area ═══ */}
          <div className="p-4 border-t safe-area-bottom">
            <form
              onSubmit={(e) => {
                e.preventDefault()
                if (inputValue.trim()) {
                  onSend?.(inputValue.trim())
                  setInputValue("")
                }
              }}
              className="relative"
            >
              <div className="relative flex items-end gap-2 bg-muted rounded-2xl border focus-within:border-primary/50 focus-within:ring-2 focus-within:ring-primary/20 transition-all">
                <textarea
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  placeholder="اسأل GarfiX AI أي شيء..."
                  rows={1}
                  className="flex-1 bg-transparent resize-none px-4 py-3 text-sm placeholder:text-muted-foreground focus:outline-none max-h-24"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault()
                      if (inputValue.trim()) {
                        onSend?.(inputValue.trim())
                        setInputValue("")
                      }
                    }
                  }}
                />
                
                {/* Send button */}
                <Button
                  type="submit"
                  size="icon-sm"
                  disabled={!inputValue.trim() || status === "thinking"}
                  className="mb-2 me-2 gradient-primary shrink-0"
                  aria-label="إرسال"
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <path d="M2 2L14 8L8 9L6 14L2 2Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
                  </svg>
                </Button>
              </div>
              
              {/* Hint text */}
              <p className="text-[10px] text-muted-foreground mt-1.5 px-1">
                اضغط Enter للإرسال · Shift+Enter لسطر جديد
              </p>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * AI Inline Suggestion — Contextual smart chip
 * Appears inline within forms, tables, or content areas.
 */

interface AIInlineSuggestionProps {
  /** Suggestion text */
  label: string
  /** Click handler */
  onClick: () => void
  /** Icon (optional) */
  icon?: React.ReactNode
  /** Variant */
  variant?: "default" | "subtle" | "prominent"
  /** Show sparkle animation */
  animated?: boolean
  className?: string
}

export function AIInlineSuggestion({
  label,
  onClick,
  icon,
  variant = "default",
  animated = false,
  className,
}: AIInlineSuggestionProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-200",
        "hover-scale active-press focus-ring",
        // Variants
        variant === "default" && [
          "bg-primary/10 text-primary hover:bg-primary/15",
          "border border-primary/20"
        ],
        variant === "subtle" && [
          "bg-muted text-muted-foreground hover:bg-accent hover:text-accent-foreground"
        ],
        variant === "prominent" && [
          "gradient-primary text-foreground shadow-brand-sm hover:shadow-brand-md"
        ],
        className
      )}
    >
      {animated && (
        <span className="relative flex size-3 items-center justify-center">
          <GarfixAIIcon size="xs" className="absolute inset-0" />
        </span>
      )}
      {icon && !animated && icon}
      <span>{label}</span>
    </button>
  )
}

/**
 * AI Command Input — Smart command palette trigger
 * For use in search bars or command palettes.
 */

interface AICommandInputProps {
  /** Placeholder text */
  placeholder?: string
  /** Value */
  value?: string
  /** On change */
  onChange?: (value: string) => void
  /** On submit */
  onSubmit?: (query: string) => void
  /** Show AI badge */
  showAIBadge?: boolean
  /** Loading state */
  isLoading?: boolean
  className?: string
}

export function AICommandInput({
  placeholder = "اسأل GarfiX AI أو ابحث...",
  value,
  onChange,
  onSubmit,
  showAIBadge = true,
  isLoading = false,
  className,
}: AICommandInputProps) {
  const [focused, setFocused] = React.useState(false)

  return (
    <div
      className={cn(
        "relative flex items-center gap-3 px-4 py-3 bg-backgroundackground rounded-xl border transition-all duration-200",
        focused
          ? "border-primary ring-2 ring-primary/20 shadow-brand-sm"
          : "border-border hover:border-border/80",
        className
      )}
    >
      {/* Search/AI Icon */}
      <div className="start-0 flex items-center justify-center">
        {isLoading ? (
          <div className="size-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        ) : focused ? (
          <GarfixAIIcon size="xs" animated />
        ) : (
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" className="text-muted-foreground">
            <circle cx="9" cy="9" r="6" stroke="currentColor" strokeWidth="1.5"/>
            <path d="M13.5 13.5L17 17" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
        )}
      </div>

      {/* Input */}
      <input
        type="text"
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && value?.trim()) {
            onSubmit?.(value.trim())
          }
        }}
        placeholder={placeholder}
        className="flex-1 bg-transparent text-sm placeholder:text-muted-foreground focus:outline-none"
      />

      {/* AI Badge when focused */}
      {showAIBadge && focused && (
        <div className="animate-fade-in">
          <GarfixAIBadge size="sm" status="idle" showLabel />
        </div>
      )}

      {/* Keyboard shortcut hint */}
      {!focused && (
        <kbd className="hidden sm:inline-flex items-center px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground bg-muted rounded">
          ⌘K
        </kbd>
      )}
    </div>
  )
}

/**
 * AI Status Bar — Persistent AI presence indicator
 * Shows in topbar or sidebar to indicate AI availability.
 */

interface AIStatusBarProps {
  /** Current status */
  status?: "online" | "busy" | "offline" | "error"
  /** Last activity description */
  lastActivity?: string
  /** On click (opens AI panel) */
  onClick?: () => void
  /** Compact mode for small spaces */
  compact?: boolean
  className?: string
}

export function AIStatusBar({
  status = "online",
  lastActivity,
  onClick,
  compact = false,
  className,
}: AIStatusBarProps) {
  const statusConfig = {
    online: { color: "bg-emerald-500", label: "متصل", pulse: true },
    busy: { color: "bg-amber-500", label: "مشغول", pulse: true },
    offline: { color: "bg-gray-400", label: "غير متصل", pulse: false },
    error: { color: "bg-red-500", label: "خطأ", pulse: true },
  }

  const config = statusConfig[status]

  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-2 px-3 py-1.5 rounded-lg transition-colors",
        "hover:bg-accent active-press cursor-pointer focus-ring",
        compact ? "gap-1.5 px-2 py-1" : "",
        className
      )}
      title={`GarfiX AI - ${config.label}`}
    >
      {/* Status dot */}
      <span className="relative flex size-2">
        <span className={cn(
          "absolute inline-flex h-full w-full rounded-full opacity-75",
          config.color,
          config.pulse && "animate-ping"
        )} />
        <span className={cn("relative inline-flex size-2 rounded-full", config.color)} />
      </span>

      {/* Icon + Label */}
      {!compact && (
        <>
          <GarfixAIIcon size="xs" />
          <span className="text-xs font-medium text-foreground">
            GarfiX AI
          </span>
        </>
      )}

      {/* Last activity */}
      {lastActivity && !compact && (
        <span className="text-[10px] text-muted-foreground truncate max-w-[120px]">
          {lastActivity}
        </span>
      )}
    </button>
  )
}

/**
 * AI Tooltip — Hover-triggered AI insight
 * Shows contextual AI information on hover/focus.
 */

interface AITooltipProps {
  /** Trigger element (child) */
  children: React.ReactNode
  /** AI insight/content */
  content: string
  /** Optional action */
  action?: { label: string; onClick: () => void }
  /** Position */
  position?: "top" | "bottom" | "left" | "right"
  className?: string
}

export function AITooltip({
  children,
  content,
  action,
  position = "top",
  className,
}: AITooltipProps) {
  const [visible, setVisible] = React.useState(false)

  const positions = {
    top: "bottom-full left-1/2 -translate-x-1/2 mb-2",
    bottom: "top-full left-1/2 -translate-x-1/2 mt-2",
    left: "right-full top-1/2 -translate-y-1/2 me-2",
    right: "left-full top-1/2 -translate-y-1/2 ms-2",
  }

  return (
    <div
      className={cn("relative inline-block", className)}
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
      onFocus={() => setVisible(true)}
      onBlur={() => setVisible(false)}
    >
      {children}
      
      {visible && (
        <div
          className={cn(
            "absolute z-50 w-64 p-3 rounded-lg bg-popover border shadow-brand-md animate-fade-in",
            positions[position]
          )}
        >
          {/* AI indicator */}
          <div className="flex items-center gap-1.5 mb-2">
            <GarfixAIIcon size="xs" />
            <span className="text-[10px] font-medium text-primary">GarfiX AI Insight</span>
          </div>
          
          {/* Content */}
          <p className="text-xs text-popover-foreground leading-relaxed">
            {content}
          </p>
          
          {/* Action button */}
          {action && (
            <Button
              variant="ghost"
              size="sm"
              onClick={action.onClick}
              className="w-full mt-2 text-xs h-7"
            >
              {action.label}
            </Button>
          )}
          
          {/* Arrow */}
          <div className={cn(
            "absolute w-2 h-2 bg-popover border-r border-b rotate-45",
            position === "top" && "bottom-[-5px] left-1/2 -translate-x-1/2",
            position === "bottom" && "top-[-5px] left-1/2 -translate-x-1/2 rotate-[225deg]",
            position === "left" && "top-1/2 -translate-y-1/2 right-[-5px] rotate-[315deg]",
            position === "right" && "top-1/2 -translate-y-1/2 left-[-5px] rotate-[135deg]"
          )} />
        </div>
      )}
    </div>
  )
}

// Default export
export default AICopilotBubble

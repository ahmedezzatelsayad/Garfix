/**
 * ═══════════════════════════════════════════════════════════════
 * GarfiX AI - Proactive Intelligence Components (Phase 4)
 * 
 * This file contains proactive AI components:
 * - Smart Notifications with AI insights
 * - Conversational Memory & Context Awareness
 * - Voice Input for AI commands
 * 
 * ═══════════════════════════════════════════════════════════════
 */

"use client";

import * as React from "react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  GarfixAIIcon,
  GarfixAIBadge,
} from "./GarfixAIIcon"



// ═══════════════════════════════════════════════════════════════
// SECTION 1: Proactive Notification Components
// ═══════════════════════════════════════════════════════════════

/** Notification type */
interface AINotification {
  id: string
  type: "insight" | "alert" | "achievement" | "reminder" | "suggestion"
  title: string
  message: string
  /** Timestamp of the event */
  timestamp: Date
  /** Action user can take */
  action?: {
    label: string
    onClick: () => void
  }
  /** Whether it's been read */
  read?: boolean
  /** Priority level */
  priority?: "low" | "medium" | "high" | "urgent"
  /** AI confidence in this notification (0-100) */
  confidence?: number
}

interface AINotificationCenterProps {
  /** List of notifications */
  notifications: AINotification[]
  /** On mark as read */
  onMarkRead?: (id: string) => void
  /** On mark all read */
  onMarkAllRead?: () => void
  /** On dismiss/dismiss */
  onDismiss?: (id: string) => void
  /** Is loading more */
  isLoading?: boolean
  /** Has more notifications to load */
  hasMore?: boolean
  /** Load more handler */
  onLoadMore?: () => void
  /** Compact mode (for dropdown) */
  compact?: boolean
  className?: string
}

export function AINotificationCenter({
  notifications,
  onMarkRead,
  onMarkAllRead,
  onDismiss,
  isLoading = false,
  hasMore = false,
  onLoadMore,
  compact = false,
  className,
}: AINotificationCenterProps) {

  const unreadCount = notifications.filter(n => !n.read).length

  // Type-specific styling
  const typeStyles = {
    insight: {
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10"/>
          <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/>
          <circle cx="12" cy="17" r="0.5" fill="currentColor"/>
        </svg>
      ),
      bg: "bg-blue-50 dark:bg-blue-950/30",
      border: "border-blue-200 dark:border-blue-800",
      text: "text-blue-700 dark:text-blue-300",
    },
    alert: {
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
          <line x1="12" y1="9" x2="12" y2="13"/>
          <line x1="12" y1="17" x2="12.01" y2="17"/>
        </svg>
      ),
      bg: "bg-amber-50 dark:bg-amber-950/30",
      border: "border-amber-200 dark:border-amber-800",
      text: "text-amber-700 dark:text-amber-300",
    },
    achievement: {
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="8" r="6"/>
          <path d="M15.477 12.89 17 22l-5-1.128a2 2 0 0 0-1.727.196l-2.273 1.632-2.273-1.632a2 2 0 0 0-1.727-.196L7 22l1.523-9.11"/>
        </svg>
      ),
      bg: "bg-emerald-50 dark:bg-emerald-950/30",
      border: "border-emerald-200 dark:border-emerald-800",
      text: "text-emerald-700 dark:text-emerald-300",
    },
    reminder: {
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
          <line x1="16" y1="2" x2="16" y2="6"/>
          <line x1="8" y1="2" x2="8" y2="6"/>
          <line x1="3" y1="10" x2="21" y2="10"/>
        </svg>
      ),
      bg: "bg-purple-50 dark:bg-purple-950/30",
      border: "border-purple-200 dark:border-purple-800",
      text: "text-purple-700 dark:text-purple-300",
    },
    suggestion: {
      icon: (
        <GarfixAIIcon size="xs" />
      ),
      bg: "bg-violet-50 dark:bg-violet-950/30",
      border: "border-violet-200 dark:border-violet-800",
      text: "text-violet-700 dark:text-violet-300",
    },
  }

  const formatTime = (date: Date) => {
    const now = new Date()
    const diff = now.getTime() - date.getTime()
    const minutes = Math.floor(diff / 60000)
    const hours = Math.floor(diff / 3600000)
    const days = Math.floor(diff / 86400000)

    if (minutes < 1) return 'الآن'
    if (minutes < 60) return `منذ ${minutes} دقيقة`
    if (hours < 24) return `منذ ${hours} ساعة`
    if (days < 7) return `منذ ${days} يوم`
    return date.toLocaleDateString('ar-SA', { day: 'numeric', month: 'short' })
  }

  if (compact) {
    return (
      <div className={cn("w-80", className)}>
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <div className="flex items-center gap-2">
            <GarfixAIIcon size="sm" glow />
            <span className="font-semibold text-sm">إشعارات AI</span>
            {unreadCount > 0 && (
              <span className="size-5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center">
                {unreadCount}
              </span>
            )}
          </div>
          
          {unreadCount > 0 && onMarkAllRead && (
            <button
              onClick={onMarkAllRead}
              className="text-xs text-primary hover:underline"
            >
              قراءة الكل
            </button>
          )}
        </div>

        {/* Notifications List */}
        <div className="max-h-80 overflow-y-auto garfix-scroll">
          {notifications.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              <GarfixAIIcon size="md" className="mx-auto mb-2 opacity-50" />
              <p className="text-sm">لا توجد إشعارات</p>
            </div>
          ) : (
            notifications.slice(0, compact ? 5 : undefined).map((notification) => {
              const style = typeStyles[notification.type]
              
              return (
                <div
                  key={notification.id}
                  className={cn(
                    "flex items-start gap-3 px-4 py-3 border-b last:border-b-0 transition-colors hover:bg-accent/30 cursor-pointer",
                    !notification.read && "bg-primary/5"
                  )}
                  onClick={() => onMarkRead?.(notification.id)}
                >
                  {/* Icon */}
                  <div className={cn(
                    "size-8 rounded-full flex items-center justify-center shrink-0 mt-0.5",
                    style?.bg
                  )}>
                    <span className={style?.text}>{style?.icon}</span>
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <p className={cn(
                      "text-sm font-medium truncate",
                      !notification.read && "text-foreground"
                    )}>
                      {notification.title}
                    </p>
                    <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
                      {notification.message}
                    </p>
                    
                    {/* Meta */}
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-[10px] text-muted-foreground">
                        {formatTime(notification.timestamp)}
                      </span>
                      
                      {notification.confidence && (
                        <span className="text-[10px] text-muted-foreground">
                          ثقة {notification.confidence}%
                        </span>
                      )}
                    </div>

                    {/* Action */}
                    {notification.action && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 text-[10px] mt-1 px-2"
                        onClick={(e) => {
                          e.stopPropagation()
                          notification.action?.onClick()
                        }}
                      >
                        {notification.action.label}
                      </Button>
                    )}
                  </div>

                  {/* Dismiss button */}
                  {onDismiss && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        onDismiss(notification.id)
                      }}
                      className="shrink-0 p-1 opacity-40 hover:opacity-100 transition-opacity"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <line x1="18" y1="6" x2="6" y2="18"/>
                        <line x1="6" y1="6" x2="18" y2="18"/>
                      </svg>
                    </button>
                  )}
                </div>
              )
            })
          )}
        </div>

        {/* Footer */}
        {hasMore && (
          <button
            onClick={onLoadMore}
            disabled={isLoading}
            className="w-full py-2 text-xs text-primary hover:underline border-t"
          >
            {isLoading ? 'جاري التحميل...' : 'عرض المزيد'}
          </button>
        )}
      </div>
    )
  }

  // Full mode
  return (
    <Card variant="elevated" className={cn("overflow-hidden", className)}>
      <div className="h-1 gradient-primary" />
      
      <CardContent className="p-6 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <GarfixAIIcon size="lg" glow animated />
            <div>
              <h2 className="text-lg font-semibold">مركز إشعارات GarfiX AI</h2>
              <p className="text-xs text-muted-foreground">
                تنبيهات واقتراحات ذكية مبنية على نشاطك
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {unreadCount > 0 && (
              <>
                <Badge variant="default" className="gradient-primary">
                  {unreadCount} غير مقروء
                </Badge>
                {onMarkAllRead && (
                  <Button variant="outline" size="sm" onClick={onMarkAllRead}>
                    قراءة الكل
                  </Button>
                )}
              </>
            )}
          </div>
        </div>

        {/* Notifications Grid */}
        <div className="space-y-3">
          {notifications.map((notification) => {
            const style = typeStyles[notification.type]
            
            return (
              <div
                key={notification.id}
                className={cn(
                  "flex items-start gap-4 p-4 rounded-xl border transition-all duration-200",
                  !notification.read && "bg-primary/5 shadow-brand-sm",
                  notification.priority === "urgent" && "ring-2 ring-destructive/20",
                  "hover:shadow-md"
                )}
              >
                {/* Icon */}
                <div className={cn(
                  "size-12 rounded-xl flex items-center justify-center shrink-0",
                  style?.bg
                )}>
                  <span className={cn("text-lg", style?.text)}>{style?.icon}</span>
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className={cn(
                      "font-semibold",
                      !notification.read ? "text-foreground" : "text-foreground/80"
                    )}>
                      {notification.title}
                    </h3>
                    
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-[10px] text-muted-foreground">
                        {formatTime(notification.timestamp)}
                      </span>
                      
                      {onDismiss && (
                        <button
                          onClick={() => onDismiss(notification.id)}
                          className="p-1 opacity-40 hover:opacity-100 transition-opacity"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  </div>
                  
                  <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
                    {notification.message}
                  </p>

                  {/* Meta row */}
                  <div className="flex items-center gap-3 mt-2">
                    <Badge variant="secondary" className="text-[10px]">
                      {notification.type === "insight" && "رؤية"}
                      {notification.type === "alert" && "تنبيه"}
                      {notification.type === "achievement" && "إنجاز"}
                      {notification.type === "reminder" && "تذكير"}
                      {notification.type === "suggestion" && "اقتراح AI"}
                    </Badge>

                    {notification.confidence && (
                      <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                        <GarfixAIIcon size="xs" />
                        ثقة {notification.confidence}%
                      </span>
                    )}

                    {notification.priority === "high" && (
                      <Badge variant="destructive" className="text-[10px]">
                        مهم
                      </Badge>
                    )}
                  </div>

                  {/* Action */}
                  {notification.action && (
                    <Button
                      variant={notification.type === "achievement" ? "gradient" : "outline"}
                      size="sm"
                      onClick={notification.action.onClick}
                      className="mt-3"
                    >
                      {notification.action.label}
                    </Button>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        {/* Empty State */}
        {notifications.length === 0 && (
          <div className="text-center py-12">
            <GarfixAIIcon size="xl" className="mx-auto mb-4 opacity-50" />
            <h3 className="font-semibold mb-2">لا توجد إشعارات</h3>
            <p className="text-sm text-muted-foreground mb-4">
              سأرسلك GarfiX AI إشعارات ذكية عند حدوث أحداث مهمة
            </p>
          </div>
        )}

        {/* Load More */}
        {hasMore && (
          <Button
            variant="outline"
            onClick={onLoadMore}
            disabled={isLoading}
            className="w-full"
          >
            {isLoading ? 'جاري التحميل...' : 'تحميل المزيد'}
          </Button>
        )}
      </CardContent>
    </Card>
  )
}

// ═══════════════════════════════════════════════════════════════
// SECTION 2: Conversational Memory Components
// ═══════════════════════════════════════════════════════════════

/** Conversation context entry */
interface ConversationMemoryEntry {
  id: string
  role: "user" | "assistant"
  content: string
  timestamp: Date
  /** Context tags for retrieval */
  tags?: string[]
  /** Session identifier */
  sessionId: string
}

interface AIMemoryContextProps {
  /** Current conversation memory entries */
  memories: ConversationMemoryEntry[]
  /** Clear all memories */
  onClear?: () => void
  /** Delete specific memory */
  onDelete?: (id: string) => void
  /** Export conversation */
  onExport?: () => void
  /** Show session info */
  showSessionInfo?: boolean
  /** Session ID */
  sessionId?: string
  /** Total messages count */
  messageCount?: number
  className?: string
}

export function AIMemoryContext({
  memories,
  onClear,
  onDelete,
  onExport,
  showSessionInfo = true,
  sessionId,
  messageCount: _messageCount,
  className,
}: AIMemoryContextProps) {

  const [expanded, setExpanded] = React.useState(false)

  return (
    <div className={cn("rounded-xl border bg-card overflow-hidden", className)}>
      {/* Header - Always visible */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between p-4 hover:bg-accent/50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <GarfixAIIcon size="sm" />
          <div className="text-start">
            <p className="text-sm font-medium">ذاكرة المحادثة</p>
            <p className="text-[10px] text-muted-foreground">
              {memories.length} رسالة مخزنة
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {showSessionInfo && (
            <span className="text-[10px] text-muted-foreground font-mono hidden sm:inline">
              {sessionId?.slice(0, 8)}...
            </span>
          )}
          
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className={cn(
              "text-muted-foreground transition-transform",
              expanded && "rotate-180"
            )}
          >
            <polyline points="6 9 12 15 18 9"/>
          </svg>
        </div>
      </button>

      {/* Expanded Content */}
      {expanded && (
        <div className="border-t animate-fade-in">
          {/* Actions Bar */}
          <div className="flex items-center justify-between px-4 py-2 border-b bg-muted/30">
            <span className="text-xs text-muted-foreground">
              آخر تحديث: {new Date().toLocaleTimeString('ar-SA')}
            </span>
            
            <div className="flex items-center gap-2">
              {onExport && (
                <Button variant="ghost" size="sm" onClick={onExport} className="text-xs h-7">
                  تصدير
                </Button>
              )}
              {onClear && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onClear}
                  className="text-xs h-7 text-destructive hover:text-destructive"
                >
                  مسح الكل
                </Button>
              )}
            </div>
          </div>

          {/* Messages List */}
          <div className="max-h-60 overflow-y-auto p-4 space-y-2 garfix-scroll">
            {memories.map((memory, _index) => (
              <div
                key={memory.id}
                className={cn(
                  "flex items-start gap-2 p-2 rounded-lg text-sm",
                  memory.role === "user"
                    ? "bg-primary/5 me-8"
                    : "bg-muted/50 ms-8"
                )}
              >
                <div className={cn(
                  "size-6 rounded-full flex items-center justify-center shrink-0 mt-0.5 text-[10px]",
                  memory.role === "user"
                    ? "bg-primary text-primary-foreground"
                    : "bg-gradient-to-br from-primary to-accent text-white"
                )}>
                  {memory.role === "user" ? "أنت" : "AI"}
                </div>
                
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-muted-foreground mb-1 line-clamp-2">
                    {memory.content}
                  </p>
                  
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-[10px] text-muted-foreground">
                      {memory.timestamp.toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    
                    {memory.tags?.slice(0, 2).map((tag) => (
                      <span key={tag} className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                        {tag}
                      </span>
                    ))}
                    
                    {onDelete && (
                      <button
                        onClick={() => onDelete(memory.id)}
                        className="opacity-0 group-hover:opacity-100 text-[10px] text-muted-foreground hover:text-destructive transition-all ms-auto"
                      >
                        حذف
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// SECTION 3: Voice Input Component
// ═══════════════════════════════════════════════════════════════

interface AIVoiceInputProps {
  /** On transcript received */
  onTranscript: (text: string) => void
  /** On submit voice command */
  onSubmit: (command: string) => void
  /** Is listening */
  isListening?: boolean
  /** Toggle listening */
  onToggleListening?: () => void
  /** Supported language */
  language?: "ar" | "en" | "auto"
  /** Show visualizer */
  showVisualizer?: boolean
  /** Disabled state */
  disabled?: boolean
  className?: string
}

export function AIVoiceInput({
  onTranscript,
  onSubmit,
  isListening = false,
  onToggleListening,
  language = "ar",
  showVisualizer = true,
  disabled = false,
  className,
}: AIVoiceInputProps) {

  const [transcript, setTranscript] = React.useState("")
  const [isSupported, setIsSupported] = React.useState(true)
  // Pre-compute visualizer bar geometry once per mount (Math.random is impure).
  const [visualizerBars] = React.useState(() =>
    Array.from({ length: 7 }, () => ({
      height: Math.random() * 80 + 20,
      duration: Math.random() * 500 + 300,
    }))
  )

  // Check browser support
  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time browser capability check on mount
    setIsSupported(
      typeof window !== 'undefined' && 
      ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)
    )
  }, [])

  // Simulated voice input for demo (replace with real Web Speech API)
  const startListening = async () => {
    if (!isSupported || disabled) return
    
    setTranscript("")
    onToggleListening?.()

    // Demo: simulate voice recognition after 1 second
    setTimeout(() => {
      const demoText = language === "ar" 
        ? "أريد إنشاء فاتورة جديدة" 
        : "I want to create a new invoice"
      
      setTranscript(demoText)
      onTranscript(demoText)
    }, 1500)
  }

  const stopListening = () => {
    onToggleListening?.()
    
    if (transcript.trim()) {
      onSubmit(transcript)
      setTranscript("")
    }
  }

  return (
    <div className={cn("space-y-3", className)}>
      {/* Main Button */}
      <div className="flex items-center gap-3">
        <button
          onClick={isListening ? stopListening : startListening}
          disabled={disabled || !isSupported}
          className={cn(
            "relative size-14 rounded-full flex items-center justify-center transition-all duration-300",
            "focus-ring active-press",
            isListening
              ? [
                  "bg-red-500 text-white shadow-lg shadow-red-500/30",
                  "animate-pulse-slow"
                ]
              : [
                  "gradient-primary text-white shadow-brand-md hover:shadow-brand-lg hover:scale-105",
                  "disabled:opacity-50 disabled:cursor-not-allowed"
                ]
          )}
          title={
            isListening 
              ? "إيقاف الاستماع" 
              : isSupported 
                ? "ابدأ الاستماع الصوتي" 
                : "المتصفح لا يدعم التعرف الصوتي"
          }
        >
          {isListening ? (
            /* Stop icon */
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <rect x="6" y="6" width="12" height="12" rx="1"/>
            </svg>
          ) : (
            /* Mic icon */
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
              <path d="M19 10v1a7 7 0 0 1-14 0v-1"/>
              <line x1="12" y1="19" x2="12" y2="23"/>
              <line x1="8" y1="23" x2="16" y2="23"/>
            </svg>
          )}
          
          {/* Pulse rings when listening */}
          {isListening && (
            <>
              <span className="absolute inset-0 rounded-full bg-red-400 animate-ping opacity-30" />
              <span className="absolute inset-0 rounded-full bg-red-400 animate-ping opacity-20" style={{ animationDelay: '0.5s' }} />
            </>
          )}
        </button>

        {/* Status text */}
        <div className="flex-1">
          {isListening ? (
            <div className="flex items-center gap-2">
              <GarfixAIBadge status="thinking" showLabel={false} />
              <span className="text-sm font-medium text-red-600 dark:text-red-400">
                يستمع...
              </span>
            </div>
          ) : (
            <div>
              <p className="text-sm font-medium">دخول صوتي</p>
              <p className="text-xs text-muted-foreground">
                اضغط على الميكروفون وتحدث
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Visualizer */}
      {showVisualizer && isListening && (
        <div className="flex items-center justify-center gap-1 h-16 px-4 rounded-xl bg-muted/50 animate-fade-in">
          {/* Sound wave bars */}
          {[...Array(7)].map((_, i) => (
            <div
              key={i}
              className="w-1 bg-primary rounded-full animate-bounce"
              style={{
                height: `${visualizerBars[i].height}%`,
                animationDelay: `${i * 100}ms`,
                animationDuration: `${visualizerBars[i].duration}ms`,
              }}
            />
          ))}
        </div>
      )}

      {/* Transcript display */}
      {transcript && (
        <div className="animate-fade-in">
          <div className="flex items-start gap-2 p-3 rounded-lg bg-muted/50 border">
            <GarfixAIIcon size="xs" className="mt-0.5" />
            <div className="flex-1">
              <p className="text-xs text-muted-foreground mb-1">ما قلته:</p>
              <p className="text-sm">{transcript}</p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onSubmit(transcript)}
              className="shrink-0 h-7 text-xs"
            >
              أرسل
            </Button>
          </div>
        </div>
      )}

      {/* Language indicator */}
      <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10"/>
          <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1-4-10z"/>
        </svg>
        اللغة: {language === "ar" ? "العربية" : language === "en" ? "English" : "تلقائي"}
        
        {!isSupported && (
          <span className="text-amber-600">(غير مدعوم في هذا المتصفح)</span>
        )}
      </div>
    </div>
  )
}

// Exports
export {
  type AINotification,
  type AINotificationCenterProps,
  type ConversationMemoryEntry,
  type AIMemoryContextProps,
  type AIVoiceInputProps,
}

export default AINotificationCenter

/**
 * ═══════════════════════════════════════════════════════════════
 * GarfiX AI - Polish & Launch Components (Phase 5)
 * 
 * This file contains polish and launch components:
 * - Celebration animations (confetti, success effects)
 * - Onboarding tour/walkthrough
 * - Feature discovery tooltips
 * - Performance monitoring hooks
 * 
 * ═══════════════════════════════════════════════════════════════
 */

"use client";

import * as React from "react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  GarfixAIIcon,
} from "./GarfixAIIcon"

// ═══════════════════════════════════════════════════════════════
// SECTION 1: Celebration & Delight Animations
// ═══════════════════════════════════════════════════════════════

/**
 * AICelebration - Celebration animation for achievements/success
 */
interface AICelebrationProps {
  /** Type of celebration */
  type?: "confetti" | "sparkles" | "checkmark" | "trophy"
  /** Show animation */
  show: boolean
  /** Duration in ms (0 = indefinite) */
  duration?: number
  /** Size of the celebration area */
  size?: "sm" | "md" | "lg"
  /** Custom message */
  message?: string
  /** On complete callback */
  onComplete?: () => void
  className?: string
}

export function AICelebration({
  type = "confetti",
  show,
  duration = 3000,
  size = "md",
  message,
  onComplete,
  className,
}: AICelebrationProps) {

  const [isVisible, setIsVisible] = React.useState(false)

  React.useEffect(() => {
    if (show) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- timer-driven animation state
      setIsVisible(true)
      
      if (duration > 0) {
        const timer = setTimeout(() => {
          setIsVisible(false)
          onComplete?.()
        }, duration)
        
        return () => clearTimeout(timer)
      }
    } else {
      setIsVisible(false)
    }
  }, [show, duration, onComplete])

  if (!isVisible) return null

  const sizeClasses = {
    sm: "w-32 h-32",
    md: "w-48 h-48",
    lg: "w-64 h-64",
  }

  return (
    <div className={cn(
      "fixed inset-0 z-[100] flex items-center justify-center pointer-events-none",
      className
    )}>
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" />
      
      {/* Content */}
      <div className={cn(
        "relative flex flex-col items-center justify-center animate-fade-in",
        sizeClasses[size]
      )}>
        {/* Animation based on type */}
        {type === "confetti" && (
          <ConfettiAnimation size={size} />
        )}
        
        {type === "sparkles" && (
          <SparklesAnimation size={size} />
        )}
        
        {type === "checkmark" && (
          <CheckmarkAnimation size={size} />
        )}
        
        {type === "trophy" && (
          <TrophyAnimation size={size} />
        )}

        {/* Message */}
        {message && (
          <p className="mt-4 text-lg font-semibold text-center animate-fade-in">
            {message}
          </p>
        )}
      </div>
    </div>
  )
}

/** Confetti particles */
const CONFETTI_COLORS = ["#7c3aed", "#a78bfa", "#f59e0b", "#10b981", "#ef4444"] as const
function ConfettiAnimation({ size }: { size: "sm" | "md" | "lg" }) {
  const particleCount = size === "sm" ? 20 : size === "md" ? 40 : 60

  // Generate random particle positions ONCE per mount via a lazy useState
  // initializer. Math.random is impure and must not run during render —
  // useState's initializer is called only on the first render and the
  // result is captured for the component's lifetime.
  const [particles] = React.useState(() =>
    Array.from({ length: particleCount }, (_, i) => ({
      backgroundColor: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
      top: `${Math.random() * 100}%`,
      left: `${Math.random() * 100}%`,
      animationDelay: `${Math.random() * 500}ms`,
      animationDuration: `${1500 + Math.random() * 1000}ms`,
      transform: `rotate(${Math.random() * 360}deg)`,
    })),
  )

  return (
    <div className="absolute inset-0 overflow-hidden rounded-full">
      {particles.map((p, i) => (
        <div
          key={i}
          className="absolute w-2 h-2 rounded-sm animate-confetti"
          style={p}
        />
      ))}
    </div>
  )
}

/** Sparkles effect */
function SparklesAnimation({ size }: { size: "sm" | "md" | "lg" }) {
  const sparkleCount = size === "sm" ? 8 : size === "md" ? 12 : 16

  // Random sparkle positions are computed once per mount via lazy useState
  // initializer (Math.random is impure and cannot run during render).
  const [sparkles] = React.useState(() =>
    Array.from({ length: sparkleCount }, (_, i) => ({
      top: `${20 + Math.random() * 60}%`,
      left: `${20 + Math.random() * 60}%`,
      animationDelay: `${i * 100}ms`,
    })),
  )

  return (
    <div className="relative size-full flex items-center justify-center">
      <GarfixAIIcon size={size === "sm" ? "lg" : "xl"} glow animated />
      
      {sparkles.map((s, i) => (
        <span
          key={i}
          className="absolute w-1.5 h-1.5 rounded-full bg-yellow-400 animate-sparkle"
          style={s}
        />
      ))}
    </div>
  )
}

/** Checkmark success animation */
function CheckmarkAnimation({ size }: { size: "sm" | "md" | "lg" }) {
  const iconSize = size === "sm" ? "text-3xl" : size === "md" ? "text-5xl" : "text-6xl"
  
  return (
    <div className={cn(
      "size-20 md:size-24 lg:size-32 rounded-full bg-emerald-100 dark:bg-emerald-900/30",
      "flex items-center justify-center animate-bounce-in"
    )}>
      <svg 
        className={cn("text-emerald-600 dark:text-emerald-400 checkmark-draw", iconSize)}
        viewBox="0 0 24 24" 
        fill="none" 
        stroke="currentColor" 
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M5 13l4 4L19 6"/>
      </svg>
    </div>
  )
}

/** Trophy achievement animation */
function TrophyAnimation({ size }: { size: "sm" | "md" | "lg" }) {
  // Random star positions are computed once per mount via lazy useState
  // initializer (Math.random is impure and cannot run during render).
  const [stars] = React.useState(() =>
    Array.from({ length: 5 }, (_, i) => ({
      top: `${10 + Math.random() * 30}%`,
      left: `${10 + Math.random() * 80}%`,
      animationDelay: `${i * 200}ms`,
    })),
  )

  return (
    <div className="relative flex flex-col items-center">
      <div className="animate-float">
        <svg 
          width={size === "sm" ? 48 : size === "md" ? 64 : 80}
          height={size === "sm" ? 48 : size === "md" ? 64 : 80}
          viewBox="0 0 24 24" 
          fill="none" 
          stroke="currentColor" 
          strokeWidth="1.5"
          className="text-amber-500"
        >
          <path d="M6 9H4.5a.5.5 0 0 1 0-1H6V3a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v5h1.5a.5.5 0 0 1 0 1H18"/>
          <path d="M12 3v6"/>
          <path d="M8 14l4 4 4-4"/>
          <path d="M8 21h8"/>
          <path d="M9 18h6"/>
          <path d="M5 9c0 3.5 2 6 7 6s7-2.5 7-6"/>
        </svg>
      </div>
      
      {/* Stars around trophy */}
      {stars.map((s, i) => (
        <span
          key={i}
          className="absolute text-yellow-400 text-lg animate-sparkle"
          style={s}
        >
          ★
        </span>
      ))}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// SECTION 2: Onboarding Tour Components
// ═══════════════════════════════════════════════════════════════

interface TourStep {
  id: string
  target: string // CSS selector or element ID
  title: string
  content: string
  /** Optional image/illustration */
  illustration?: React.ReactNode
  /** Position relative to target */
  position?: "top" | "bottom" | "left" | "right" | "center"
  /** Action button */
  action?: {
    label: string
    onClick: () => void
  }
  /** Skip this step? */
  skippable?: boolean
}

interface AIOnboardingTourProps {
  /** Tour steps */
  steps: TourStep[]
  /** Current step index */
  currentStep?: number
  /** On next step */
  onNext?: () => void
  /** On previous step */
  onPrev?: () => void
  /** On skip all */
  onSkip?: () => void
  /** On finish */
  onFinish?: () => void
  /** Is tour active */
  isActive?: boolean
  /** Show progress indicator */
  showProgress?: boolean
  className?: string
}

export function AIOnboardingTour({
  steps,
  currentStep = 0,
  onNext,
  onPrev,
  onSkip,
  onFinish,
  isActive = true,
  showProgress = true,
  className,
}: AIOnboardingTourProps) {

  if (!isActive || steps.length === 0) return null

  const step = steps[currentStep]
  const isLastStep = currentStep === steps.length - 1
  const isFirstStep = currentStep === 0

  return (
    <div className={cn(
      "fixed inset-0 z-[90] flex items-end sm:items-center justify-center p-4",
      className
    )}>
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onSkip} />

      {/* Tour Card */}
      <div className="relative bg-card rounded-2xl shadow-brand-xl border max-w-md w-full animate-slide-up">
        {/* Progress bar */}
        {showProgress && (
          <div className="h-1 bg-muted rounded-t-2xl overflow-hidden">
            <div 
              className="h-full gradient-primary transition-all duration-300"
              style={{ width: `${((currentStep + 1) / steps.length) * 100}%` }}
            />
          </div>
        )}

        <div className="p-6 space-y-4">
          {/* Header */}
          <div className="flex items-start gap-4">
            {/* AI Avatar */}
            <div className="shrink-0">
              <GarfixAIIcon size="lg" glow animated />
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <h3 className="font-semibold text-lg">{step.title}</h3>
                <Badge variant="secondary" className="text-xs">
                  {currentStep + 1} / {steps.length}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {step.content}
              </p>
              
              {/* Illustration */}
              {step.illustration && (
                <div className="mt-3">{step.illustration}</div>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-between pt-4 border-t">
            <div className="flex items-center gap-2">
              {!isFirstStep && (
                <Button variant="ghost" size="sm" onClick={onPrev}>
                  السابق
                </Button>
              )}
              
              {(step.skippable || !isLastStep) && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onSkip}
                  className="text-muted-foreground"
                >
                  تخطي
                </Button>
              )}
            </div>

            <div className="flex items-center gap-2">
              {step.action && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={step.action.onClick}
                >
                  {step.action.label}
                </Button>
              )}
              
              {isLastStep ? (
                <Button
                  size="sm"
                  onClick={onFinish}
                  className="gradient-primary"
                >
                  ابدأ الاستخدام! 🎉
                </Button>
              ) : (
                <Button
                  size="sm"
                  onClick={onNext}
                  className="gradient-primary"
                >
                  التالي
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// SECTION 3: Feature Discovery Tooltips
// ═══════════════════════════════════════════════════════════════

interface AIFeatureDiscoveryProps {
  /** Feature name */
  feature: string
  /** Short description */
  description: string
  /** Detailed explanation */
  explanation: string
  /** Tips or shortcuts */
  tips?: string[]
  /** Link to learn more */
  learnMoreUrl?: string
  /** Position */
  position?: "top" | "bottom" | "left" | "right"
  /** Trigger children */
  children: React.ReactNode
  /** Show once per session (localStorage) */
  showOnce?: boolean
  className?: string
}

export function AIFeatureDiscovery({
  feature,
  description,
  explanation,
  tips,
  learnMoreUrl,
  position = "top",
  children,
  showOnce = true,
  className,
}: AIFeatureDiscoveryProps) {

  const [visible, setVisible] = React.useState(false)
  const [dismissed, setDismissed] = React.useState(false)

  // Check localStorage for dismissal
  React.useEffect(() => {
    if (showOnce) {
      const key = `ai-feature-seen-${feature}`
      const wasSeen = localStorage.getItem(key)
      if (wasSeen) {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time localStorage check on mount
        setDismissed(true)
      }
    }
  }, [feature, showOnce])

  const handleDismiss = () => {
    setVisible(false)
    if (showOnce) {
      localStorage.setItem(`ai-feature-seen-${feature}`, 'true')
    }
    setDismissed(true)
  }

  if (dismissed) {
    return <>{children}</>
  }

  return (
    <div className={cn("relative inline-block", className)}>
      <div
        onMouseEnter={() => setVisible(true)}
        onMouseLeave={() => setVisible(false)}
        onFocus={() => setVisible(true)}
        onBlur={() => setVisible(false)}
      >
        {children}
        
        {/* New badge */}
        <span className="absolute -top-1 -end-1 size-4 rounded-full bg-primary text-primary-foreground text-[9px] font-bold flex items-center justify-center animate-pulse-slow">
          جديد
        </span>
      </div>

      {/* Tooltip */}
      {visible && (
        <div className={cn(
          "absolute z-50 w-72 p-4 bg-popover border rounded-xl shadow-brand-lg animate-fade-in",
          position === "top" && "bottom-full mb-2",
          position === "bottom" && "top-full mt-2",
          position === "left" && "right-full me-2",
          position === "right" && "left-full ms-2",
        )}>
          {/* AI Header */}
          <div className="flex items-center gap-2 mb-3 pb-2 border-b">
            <GarfixAIIcon size="xs" />
            <span className="text-xs font-semibold text-primary">ميزة جديدة</span>
            <button
              onClick={handleDismiss}
              className="ms-auto text-[10px] text-muted-foreground hover:text-foreground"
            >
              لا أرى هذا مرة أخرى
            </button>
          </div>

          {/* Title & Description */}
          <h4 className="font-semibold text-sm mb-1">{feature}</h4>
          <p className="text-xs text-muted-foreground mb-2">{description}</p>
          
          {/* Explanation */}
          <p className="text-xs leading-relaxed text-foreground/80 mb-3">
            {explanation}
          </p>

          {/* Tips */}
          {tips && tips.length > 0 && (
            <div className="space-y-1 mb-3">
              {tips.map((tip, i) => (
                <div key={i} className="flex items-start gap-2 text-[11px] text-muted-foreground">
                  <span className="text-primary">💡</span>
                  {tip}
                </div>
              ))}
            </div>
          )}

          {/* Learn more link */}
          {learnMoreUrl && (
            <a
              href={learnMoreUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
            >
              تعلم المزيد
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M7 17L17 7M7 7h10v10"/>
              </svg>
            </a>
          )}

          {/* Arrow */}
          <div className={cn(
            "absolute w-3 h-3 bg-popover border-r border-b rotate-45",
            position === "top" && "bottom-[-6px] left-1/2 -translate-x-1/2",
            position === "bottom" && "top-[-6px] left-1/2 -translate-x-1/2 rotate-[225deg]",
            position === "left" && "top-1/2 -translate-y-1/2 right-[-6px] rotate-[315deg]",
            position === "right" && "top-1/2 -translate-y-1/2 left-[-6px] rotate-[135deg]"
          )} />
        </div>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// SECTION 4: Performance Monitoring Hook
// ═══════════════════════════════════════════════════════════════

/**
 * useAIPerformance - Monitor AI component performance
 */
export function useAIPerformance(_componentName: string) {
  const renderCount = React.useRef(0)
  const lastRenderTime = React.useRef<number>(0)
  const [metrics, setMetrics] = React.useState({
    renderCount: 0,
    avgRenderTime: 0,
    lastRenderTime: 0,
  })

  React.useEffect(() => {
    renderCount.current += 1
    const now = Date.now()
    const renderTime = lastRenderTime.current === 0 ? 0 : now - lastRenderTime.current
    lastRenderTime.current = now

    setMetrics(prev => ({
      renderCount: prev.renderCount + 1,
      avgRenderTime: (prev.avgRenderTime * (prev.renderCount - 1) + renderTime) / prev.renderCount,
      lastRenderTime: renderTime,
    }))
  }, [])

  return {
    ...metrics,
    isSlow: metrics.avgRenderTime > 100, // More than 100ms is considered slow
  }
}

// ═══════════════════════════════════════════════════════════════
// CSS Keyframes (add these to globals.css if not already present)
// ═══════════════════════════════════════════════════════════════

/*
Add these keyframes to globals.css under @layer utilities:

@keyframes confetti {
  0% { transform: translate(0, 0) rotate(0deg); opacity: 1; }
  100% { transform: translate(var(--tx, 100px), var(--ty, -200px) rotate(720deg); opacity: 0; }
}

@keyframes sparkle {
  0%, 100% { transform: scale(0) rotate(0deg); opacity: 0; }
  50% { transform: scale(1) rotate(180deg); opacity: 1; }
}

@keyframes bounce-in {
  0% { transform: scale(0.3); opacity: 0; }
  50% { transform: scale(1.05); }
  70% { transform: scale(0.95); }
  100% { transform: scale(1); opacity: 1; }
}

@keyframes checkmark-draw {
  0% { stroke-dashoffset: 30; }
  100% { stroke-dashoffset: 0; }
}

@keyframes slide-up {
  from { transform: translateY(20px); opacity: 0; }
  to { transform: translateY(0); opacity: 1; }
}
*/

// Exports
export {
  type AICelebrationProps,
  type TourStep,
  type AIOnboardingTourProps,
  type AIFeatureDiscoveryProps,
}

export default AICelebration

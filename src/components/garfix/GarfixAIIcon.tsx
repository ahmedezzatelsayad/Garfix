import * as React from "react"
import { cn } from "@/lib/utils"

/**
 * GarfiX AI Icon — Unique & Memorable
 * 
 * Design Concept:
 * - "G" letterform with neural network nodes
 * - Central brain/AI core with connecting synapses
 * - Gradient violet-to-purple with glow effect
 * - Animated pulse when active
 * 
 * Size Variants:
 * - xs: 16px (inline, badges)
 * - sm: 24px (sidebar, menu)
 * - md: 32px (default, headers)
 * - lg: 48px (hero, splash)
 * - xl: 64px (marketing, large displays)
 */

interface GarfixAIIconProps {
  /** Icon size variant */
  size?: "xs" | "sm" | "md" | "lg" | "xl" | number
  /** Show animated pulse effect */
  animated?: boolean
  /** Show glow effect */
  glow?: boolean
  /** Custom class names */
  className?: string
  /** Click handler */
  onClick?: () => void
}

export function GarfixAIIcon({ 
  size = "md", 
  animated = false,
  glow = false,
  className,
  onClick 
}: GarfixAIIconProps) {
  
  // Size mappings
  const sizeMap = {
    xs: 16,
    sm: 24,
    md: 32,
    lg: 48,
    xl: 64,
  }
  
  const pixelSize = typeof size === "number" ? size : sizeMap[size]
  
  // ViewBox maintains 32x32 coordinate system regardless of render size
  return (
    <div 
      className={cn(
        "relative inline-flex items-center justify-center",
        animated && "animate-pulse-slow",
        onClick && "cursor-pointer hover-scale",
        className
      )}
      onClick={onClick}
      style={{ width: pixelSize, height: pixelSize }}
      role="img"
      aria-label="GarfiX AI"
    >
      <svg
        width={pixelSize}
        height={pixelSize}
        viewBox="0 0 32 32"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={cn(
          glow && "drop-shadow-glow-purple"
        )}
      >
        {/* Definitions */}
        <defs>
          {/* Main gradient */}
          <linearGradient id="gai-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#8B5CF6" />
            <stop offset="50%" stopColor="#7C3AED" />
            <stop offset="100%" stopColor="#6D28D9" />
          </linearGradient>
          
          {/* Glow gradient */}
          <radialGradient id="gai-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#A78BFA" stopOpacity="0.6" />
            <stop offset="100%" stopColor="#7C3AED" stopOpacity="0" />
          </radialGradient>
          
          {/* Inner highlight */}
          <linearGradient id="gai-highlight" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="white" stopOpacity="0.3" />
            <stop offset="100%" stopColor="white" stopOpacity="0" />
          </linearGradient>

          {/* Animated gradient for pulse */}
          <linearGradient id="gai-animated" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#A78BFA">
              {animated && <animate attributeName="stop-color" values="#A78BFA;#C4B5FD;#A78BFA" dur="2s" repeatCount="indefinite" />}
            </stop>
            <stop offset="100%" stopColor="#7C3AED">
              {animated && <animate attributeName="stop-color" values="#7C3AED;#8B5CF6;#7C3AED" dur="2s" repeatCount="indefinite" />}
            </stop>
          </linearGradient>
        </defs>

        {/* Background circle with glow */}
        {glow && (
          <circle
            cx="16"
            cy="16"
            r="15"
            fill="url(#gai-glow)"
            className={cn(animated && "animate-ping-slow")}
          />
        )}
        
        {/* Main background circle */}
        <circle
          cx="16"
          cy="16"
          r="14"
          fill={animated ? "url(#gai-animated)" : "url(#gai-gradient)"}
        />

        {/* Inner highlight for depth */}
        <circle
          cx="16"
          cy="12"
          r="10"
          fill="url(#gai-highlight)"
        />

        {/* ═══ G Letterform + Neural Network ═══ */}
        
        {/* Main G shape */}
        <path
          d="M12 10 L12 22 L20 22"
          stroke="white"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
        
        {/* G crossbar with node */}
        <path
          d="M17 18 L21 18"
          stroke="white"
          strokeWidth="2"
          strokeLinecap="round"
        />
        
        {/* Neural network nodes on the G */}
        {/* Top node */}
        <circle cx="12" cy="10" r="2" fill="white" opacity="0.9">
          {animated && (
            <animate 
              attributeName="r" 
              values="2;2.5;2" 
              dur="1.5s" 
              repeatCount="indefinite" 
            />
          )}
        </circle>
        
        {/* Bottom node */}
        <circle cx="12" cy="22" r="2" fill="white" opacity="0.9">
          {animated && (
            <animate 
              attributeName="r" 
              values="2;2.5;2" 
              dur="1.5s" 
              repeatCount="indefinite" 
              begin="0.3s"
            />
          )}
        </circle>
        
        {/* Crossbar node (connection point) */}
        <circle cx="21" cy="18" r="1.5" fill="#FCD34D" opacity="0.95">
          {animated && (
            <animate 
              attributeName="opacity" 
              values="0.95;0.6;0.95" 
              dur="1s" 
              repeatCount="indefinite" 
            />
          )}
        </circle>

        {/* Neural connections (synapses) */}
        <g stroke="white" strokeWidth="0.75" opacity="0.4">
          {/* Connection from top to center-right */}
          <line x1="13.5" y1="11" x2="19" y2="15">
            {animated && (
              <animate 
                attributeName="opacity" 
                values="0.4;0.8;0.4" 
                dur="2s" 
                repeatCount="indefinite" 
              />
            )}
          </line>
          
          {/* Connection from bottom to center-right */}
          <line x1="13.5" y1="21" x2="19" y2="19">
            {animated && (
              <animate 
                attributeName="opacity" 
                values="0.4;0.8;0.4" 
                dur="2s" 
                repeatCount="indefinite" 
                begin="0.5s"
              />
            )}
          </line>
          
          {/* Small decorative nodes at connection ends */}
          <circle cx="19" cy="15" r="1" fill="white" opacity="0.6" />
          <circle cx="19" cy="19" r="1" fill="white" opacity="0.6" />
        </g>

        {/* Sparkle accent (shows intelligence) */}
        <g fill="#FCD34D">
          {/* Top right sparkle */}
          <path d="M23 9 L23.5 10.5 L25 11 L23.5 11.5 L23 13 L22.5 11.5 L21 11 L22.5 10.5 Z" opacity="0.8">
            {animated && (
              <animate 
                attributeName="opacity" 
                values="0.8;0.3;0.8" 
                dur="1.8s" 
                repeatCount="indefinite" 
              />
            )}
            {animated && (
              <animateTransform 
                attributeName="transform" 
                type="rotate"
                values="0 23 11;180 23 11;360 23 11"
                dur="4s"
                repeatCount="indefinite"
              />
            )}
          </path>
        </g>
      </svg>
    </div>
  )
}

/**
 * GarfiX AI Logo — Full logo with text
 */
interface GarfixAILogoProps {
  /** Show tagline below */
  showTagline?: boolean
  /** Layout direction */
  layout?: "horizontal" | "vertical"
  /** Size variant */
  size?: "sm" | "md" | "lg"
  /** Custom class */
  className?: string
}

export function GarfixAILogo({
  showTagline = false,
  layout = "horizontal",
  size = "md",
  className
}: GarfixAILogoProps) {
  
  const iconSizes = { sm: 24, md: 32, lg: 48 }
  const textSizes = { sm: "text-lg", md: "text-2xl", lg: "text-4xl" }
  
  return (
    <div className={cn(
      "flex items-center gap-3",
      layout === "vertical" ? "flex-col" : "flex-row",
      className
    )}>
      <GarfixAIIcon size={iconSizes[size]} glow animated />
      
      <div className={cn(
        "flex flex-col",
        layout === "vertical" ? "items-center text-center" : "items-start"
      )}>
        <h1 className={cn(
          "font-bold tracking-tight text-gradient-primary",
          textSizes[size]
        )}>
          GarfiX<span className="text-primary"> AI</span>
        </h1>
        
        {showTagline && (
          <p className="text-xs text-muted-foreground mt-0.5">
            ذكاء اصطناعي يفهم عملك
          </p>
        )}
      </div>
    </div>
  )
}

/**
 * GarfiX AI Badge — Small indicator badge
 */
interface GarfixAIBadgeProps {
  /** Status state */
  status?: "idle" | "thinking" | "active" | "error"
  /** Show label */
  showLabel?: boolean
  /** Size */
  size?: "sm" | "md"
  className?: string
}

export function GarfixAIBadge({
  status = "idle",
  showLabel = true,
  size = "sm",
  className
}: GarfixAIBadgeProps) {
  
  const statusColors = {
    idle: "bg-primary/10 text-primary",
    thinking: "bg-cyan-500/10 text-cyan-600 dark:text-cyan-400",
    active: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    error: "bg-red-500/10 text-red-600 dark:text-red-400",
  }

  const statusDots = {
    idle: "bg-primary",
    thinking: "bg-cyan-500 animate-pulse",
    active: "bg-emerald-500",
    error: "bg-red-500 animate-pulse",
  }

  const iconSizes = { sm: 14, md: 18 }

  return (
    <div className={cn(
      "inline-flex items-center gap-1.5 px-2 py-1 rounded-full font-medium transition-colors",
      statusColors[status],
      size === "md" ? "text-xs" : "text-[10px]",
      className
    )}>
      <GarfixAIIcon 
        size={iconSizes[size]} 
        animated={status === "thinking"} 
      />
      
      {/* Status indicator dot */}
      <span className={cn(
        "size-1.5 rounded-full",
        statusDots[status]
      )} />
      
      {showLabel && (
        <span>
          {status === "thinking" ? "يفكر..." :
           status === "active" ? "نشط" :
           status === "error" ? "خطأ" :
           "GarfiX AI"}
        </span>
      )}
    </div>
  )
}

export default GarfixAIIcon

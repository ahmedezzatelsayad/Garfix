/**
 * GarfixAvatar.tsx — GarfiX DS v4.0 Avatar System
 *
 * ════════════════════════════════════════════════════════════════════════
 * FEATURES:
 * - Image, initials, or icon fallback
 * - 6 Sizes: xs, sm, md, lg, xl, 2xl
 * - Status indicator (online, offline, away, busy)
 * - Group avatars with overlap
 * - RTL-aware positioning
 *
 * DESIGN TOKENS:
 * - Colors based on name hash for consistency
 * - Status colors: emerald (online), gray (offline), amber (away), red (busy)
 * ════════════════════════════════════════════════════════════════════════
 */

"use client";

import React from "react";
import { cn } from "@/lib/utils";

// ── Types ───────────────────────────────────────────────────────────────

export type AvatarSize = "xs" | "sm" | "md" | "lg" | "xl" | "2xl";
export type AvatarStatus = "online" | "offline" | "away" | "busy" | undefined;

export interface GarfixAvatarProps {
  /** Image source URL */
  src?: string;
  /** Alt text */
  alt?: string;
  /** Fallback initials (max 2 chars) */
  fallback?: string;
  /** Avatar size */
  size?: AvatarSize;
  /** Status indicator */
  status?: AvatarStatus;
  /** Custom class name */
  className?: string;
}

// ── Color Palette for Initials ───────────────────────────────────────────

const colorPalette = [
  { bg: "#047857", text: "#ffffff" }, // Emerald
  { bg: "#2563eb", text: "#ffffff" }, // Blue
  { bg: "#9333ea", text: "#ffffff" }, // Purple
  { bg: "#dc2626", text: "#ffffff" }, // Red
  { bg: "#d4a574", text: "#0b1220" }, // Gold ⚠️ RESTRICTED
  { bg: "#0891b2", text: "#ffffff" }, // Cyan
  { bg: "#ea580c", text: "#ffffff" }, // Orange
  { bg: "#16a34a", text: "#ffffff" }, // Green
];

function getColorFromName(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colorPalette[Math.abs(hash) % colorPalette.length];
}

// ── Size Styles ─────────────────────────────────────────────────────────

const sizeStyles: Record<AvatarSize, { container: string; text: string; status: string; statusPosition: string }> = {
  xs: { container: "h-6 w-6 text-[10px]", text: "text-[10px]", status: "h-1.5 w-1.5", statusPosition: "-bottom-0.5 -end-0.5" },
  sm: { container: "h-8 w-8 text-xs", text: "text-xs", status: "h-2 w-2", statusPosition: "-bottom-0.5 -end-0.5" },
  md: { container: "h-10 w-10 text-sm", text: "text-sm", status: "h-2.5 w-2.5", statusPosition: "-bottom-0.5 -end-0.5" },
  lg: { container: "h-12 w-12 text-base", text: "text-base", status: "h-3 w-3", statusPosition: "-bottom-1 -end-1" },
  xl: { container: "h-16 w-16 text-lg", text: "text-lg", status: "h-3.5 w-3.5", statusPosition: "-bottom-1 -end-1" },
  "2xl": { container: "h-20 w-20 text-xl", text: "text-xl", status: "h-4 w-4", statusPosition: "-bottom-1 -end-1" },
};

// ── Status Colors ───────────────────────────────────────────────────────

const statusColors: Record<Exclude<AvatarStatus, undefined>, string> = {
  online: "bg-emerald-500 ring-2 ring-background",
  offline: "bg-gray-400 ring-2 ring-background",
  away: "bg-amber-500 ring-2 ring-background",
  busy: "bg-red-500 ring-2 ring-background",
};

// ── Component ───────────────────────────────────────────────────────────

export const GarfixAvatar: React.FC<GarfixAvatarProps> = ({
  src,
  alt = "",
  fallback,
  size = "md",
  status,
  className,
}) => {
  const [imageError, setImageError] = React.useState(false);
  const showImage = src && !imageError;
  
  // Generate initials from fallback or alt
  const initials = fallback || (alt ? alt.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase() : "");
  const colors = getColorFromName(initials || "U");

  return (
    <div className={cn("relative inline-flex flex-shrink-0", className)}>
      <span
        className={cn(
          "relative inline-flex items-center justify-center overflow-hidden rounded-full font-medium select-none",
          sizeStyles[size].container,
          showImage ? "bg-muted" : `${colors.bg} ${colors.text}`
        )}
      >
        {showImage ? (
          <img
            src={src}
            alt={alt}
            onError={() => setImageError(true)}
            className="h-full w-full object-cover"
          />
        ) : (
          <span aria-hidden="true">{initials || "?"}</span>
        )}
      </span>

      {/* Status Indicator */}
      {status && (
        <span
          className={cn(
            "absolute rounded-full",
            sizeStyles[size].status,
            sizeStyles[size].statusPosition,
            statusColors[status]
          )}
          aria-label={`الحالة: ${status}`}
        />
      )}
    </div>
  );
};

GarfixAvatar.displayName = "GarfixAvatar";

// ── Avatar Group ────────────────────────────────────────────────────────

export interface AvatarGroupProps {
  avatars: Array<{
    src?: string;
    alt?: string;
    fallback?: string;
  }>;
  max?: number;
  size?: AvatarSize;
  className?: string;
}

export const GarfixAvatarGroup: React.FC<AvatarGroupProps> = ({
  avatars,
  max = 4,
  size = "md",
  className,
}) => {
  const visibleAvatars = avatars.slice(0, max);
  const remaining = avatars.length - max;

  return (
    <div className={cn("flex items-center -space-x-2 rtl:space-x-reverse", className)}>
      {visibleAvatars.map((avatar, index) => (
        <GarfixAvatar
          key={index}
          src={avatar.src}
          alt={avatar.alt}
          fallback={avatar.fallback}
          size={size}
          className="ring-2 ring-background"
        />
      ))}
      {remaining > 0 && (
        <div
          className={cn(
            "relative inline-flex items-center justify-center rounded-full font-medium",
            "bg-muted text-muted-foreground ring-2 ring-background",
            sizeStyles[size].container
          )}
          aria-label={`${remaining} مستخدمين إضافيين`}
        >
          +{remaining}
        </div>
      )}
    </div>
  );
};

GarfixAvatarGroup.displayName = "GarfixAvatarGroup";

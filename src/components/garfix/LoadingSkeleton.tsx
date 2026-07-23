/**
 * LoadingSkeleton — animated placeholder rows while data is loading.
 *
 * Renders `rows` rows × `cols` shimmering blocks. Uses the same `pulse`
 * animation that shadcn/ui ships with via Tailwind's `animate-pulse`.
 */
"use client";

export interface LoadingSkeletonProps {
  rows?: number;
  cols?: number;
}

export function LoadingSkeleton({ rows = 5, cols = 4 }: LoadingSkeletonProps) {
  return (
    <div>
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="flex gap-3 py-3 border-b border-border"
        >
          {Array.from({ length: cols }).map((_, j) => (
            <div
              key={j}
              className="animate-pulse flex-1 h-4 rounded bg-muted"
            />
          ))}
        </div>
      ))}
    </div>
  );
}

export default LoadingSkeleton;

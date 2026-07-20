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
          style={{
            display: "flex",
            gap: "12px",
            padding: "12px 0",
            borderBottom: "1px solid var(--border)",
          }}
        >
          {Array.from({ length: cols }).map((_, j) => (
            <div
              key={j}
              className="animate-pulse"
              style={{
                flex: 1,
                height: "16px",
                borderRadius: "4px",
                background: "var(--muted)",
              }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

export default LoadingSkeleton;

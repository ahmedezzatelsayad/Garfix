/**
 * ErrorState — friendly error placeholder with optional retry.
 *
 * Drop this anywhere a fetch failed. The retry button calls `onRetry`
 * (typically a re-fetch callback).
 */
"use client";

import { AlertCircle } from "lucide-react";

export interface ErrorStateProps {
  message: string;
  onRetry?: () => void;
}

export function ErrorState({ message, onRetry }: ErrorStateProps) {
  return (
    <div style={{ padding: "48px", textAlign: "center" }}>
      <AlertCircle
        size={36}
        style={{ color: "var(--destructive)", marginBottom: "12px" }}
      />
      <div
        style={{
          fontSize: "14px",
          fontWeight: 700,
          color: "var(--foreground)",
          marginBottom: "4px",
        }}
      >
        {message}
      </div>
      {onRetry && (
        <button
          onClick={onRetry}
          style={{
            marginTop: "12px",
            padding: "8px 16px",
            borderRadius: "8px",
            background: "var(--primary)",
            color: "var(--primary-foreground)",
            border: "none",
            fontFamily: "inherit",
            fontSize: "12px",
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          حاول تاني
        </button>
      )}
    </div>
  );
}

export default ErrorState;

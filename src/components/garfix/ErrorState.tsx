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
    <div className="p-12 text-center">
      <AlertCircle
        size={36}
        className="text-[var(--destructive)] mb-3"
      />
      <div className="text-sm font-bold text-[var(--foreground)] mb-1">
        {message}
      </div>
      {onRetry && (
        <button
          onClick={onRetry}
          className="mt-3 py-2 px-4 rounded-lg bg-[var(--primary)] text-[var(--primary-foreground)] border-none font-inherit text-xs font-bold cursor-pointer"
        >
          حاول تاني
        </button>
      )}
    </div>
  );
}

export default ErrorState;

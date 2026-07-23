"use client";

import React, { Component, type ReactNode } from "react";
import { AlertCircle, RefreshCw } from "lucide-react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("[ErrorBoundary] caught:", error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: undefined });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <div
          dir="rtl"
          className="min-h-[60vh] flex flex-col items-center justify-center gap-4 p-12 text-center"
        >
          <AlertCircle size={48} className="text-[var(--destructive)]" />
          <div>
            <h2 className="text-xl font-extrabold mb-2">
              حدث خطأ غير متوقع
            </h2>
            <p className="text-[13px] text-[var(--muted-foreground)] max-w-[400px]">
              {this.state.error?.message || "يرجى تحديث الصفحة أو المحاولة مرة أخرى"}
            </p>
          </div>
          <button
            onClick={() => window.location.reload()}
            className="inline-flex items-center gap-1.5 py-2.5 px-5 rounded-[10px] bg-[var(--primary)] text-[var(--primary-foreground)] border-none font-inherit text-[13px] font-bold cursor-pointer"
          >
            <RefreshCw size={14} />
            تحديث الصفحة
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;

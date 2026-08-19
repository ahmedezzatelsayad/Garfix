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
          className="min-h-[60vh] flex flex-col items-center justify-center gap-4 p-12 text-center bg-background"
        >
          <div className="w-20 h-20 rounded-full bg-emerald-500/10 flex items-center justify-center shadow-brand-lg">
            <AlertCircle size={40} className="text-emerald-500" />
          </div>
          <div className="max-w-md space-y-2 glass rounded-2xl p-6" role="alert" aria-live="assertive">
            {/* FE a11y sweep FIX (Audit v2 · Phase 2): added role=alert + aria-live */}
            <h2 className="text-xl font-extrabold text-foreground mb-2">
              عذراً، حدث خطأ غير متوقع! 😔
            </h2>
            <p className="text-[13px] text-emerald-100/70 max-w-[400px] leading-relaxed">
              {this.state.error?.message || "نعتذر عن هذا الإزعاج. يرجى تحديث الصفحة أو المحاولة مرة أخرى، وإذا استمرت المشكلة تواصل مع فريق الدعم."}
            </p>
            {this.state.error && (
              <details className="mt-3 text-right">
                <summary className="text-xs text-emerald-400/60 cursor-pointer hover:text-emerald-300 transition-colors">
                  عرض تفاصيل الخطأ التقنية
                </summary>
                <pre className="mt-2 text-[11px] text-red-300/80 bg-red-950/30 p-3 rounded-lg overflow-auto direction-ltr" dir="ltr">
                  {this.state.error.stack || this.state.error.message}
                </pre>
              </details>
            )}
          </div>
          <button
            onClick={this.handleReset}
            className="inline-flex items-center gap-1.5 py-2.5 px-5 rounded-[10px] bg-gradient-to-r from-emerald-600 to-emerald-700 text-foreground border-none font-inherit text-[13px] font-bold cursor-pointer active-press duration-150 shadow-brand-sm hover:shadow-brand-md transition-shadow mt-2"
          >
            <RefreshCw size={14} />
            إعادة المحاولة
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;

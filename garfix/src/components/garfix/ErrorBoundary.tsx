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
          style={{
            minHeight: "60vh",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: "16px",
            padding: "48px",
            textAlign: "center",
          }}
        >
          <AlertCircle size={48} style={{ color: "var(--destructive)" }} />
          <div>
            <h2 style={{ fontSize: "20px", fontWeight: 800, marginBottom: "8px" }}>
              حدث خطأ غير متوقع
            </h2>
            <p style={{ fontSize: "13px", color: "var(--muted-foreground)", maxWidth: "400px" }}>
              {this.state.error?.message || "يرجى تحديث الصفحة أو المحاولة مرة أخرى"}
            </p>
          </div>
          <button
            onClick={() => window.location.reload()}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              padding: "10px 20px",
              borderRadius: "10px",
              background: "var(--primary)",
              color: "var(--primary-foreground)",
              border: "none",
              fontFamily: "inherit",
              fontSize: "13px",
              fontWeight: 700,
              cursor: "pointer",
            }}
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

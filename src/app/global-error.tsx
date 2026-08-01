"use client";

/**
 * global-error.tsx — Root-level error boundary (P3.7, Cycle 5).
 *
 * Next.js requires `global-error.tsx` (separate from `error.tsx`) to catch
 * errors thrown by the ROOT LAYOUT itself — e.g. if `Providers`, `BrandContext`,
 * `ThemeProvider`, or the `<html>`/`<body>` wrapper fails. Without this file,
 * a root-layout crash shows Next.js's default English error page instead of
 * the branded Arabic RTL one.
 *
 * This file MUST render its own `<html>` and `<body>` because the root layout
 * is the thing that crashed — Next.js does not wrap global-error in the layout.
 *
 * See: https://nextjs.org/docs/app/api-reference/file-conventions/error
 */
import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[GlobalError/root]", error);
  }, [error]);

  return (
    <html lang="ar" dir="rtl">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#0a0a0a",
          color: "#fafafa",
          fontFamily:
            "system-ui, -apple-system, 'Segoe UI', Tahoma, Arial, sans-serif",
          padding: "1.5rem",
        }}
      >
        <div style={{ maxWidth: "28rem", textAlign: "center" }}>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: "4rem",
              height: "4rem",
              borderRadius: "1rem",
              background: "rgba(239, 68, 68, 0.1)",
              color: "#ef4444",
              fontWeight: 800,
              fontSize: "1.5rem",
              marginBottom: "1.5rem",
            }}
          >
            !
          </div>
          <h1 style={{ fontSize: "1.5rem", fontWeight: 800, margin: "0 0 0.5rem" }}>
            تعذّر تحميل التطبيق
          </h1>
          <p style={{ color: "#a1a1aa", fontSize: "0.875rem", margin: "0 0 1rem" }}>
            حدث خطأ في الطبقة الجذرية. يرجى تحديث الصفحة أو المحاولة مرة أخرى.
          </p>
          {error.digest && (
            <p
              style={{
                fontSize: "0.6875rem",
                color: "#71717a",
                fontFamily: "ui-monospace, monospace",
                direction: "ltr",
                margin: "0 0 1.5rem",
              }}
            >
              digest: {error.digest}
            </p>
          )}
          <button
            onClick={reset}
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: "0.375rem",
              background: "#fafafa",
              color: "#0a0a0a",
              padding: "0.5rem 1rem",
              fontSize: "0.875rem",
              fontWeight: 700,
              border: "none",
              cursor: "pointer",
            }}
          >
            إعادة المحاولة
          </button>
        </div>
      </body>
    </html>
  );
}

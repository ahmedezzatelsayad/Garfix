/**
 * global-error.tsx — Root-level error boundary
 *
 * Renders OUTSIDE the root layout — must include its own <html> and <body>.
 * Uses only inline CSS to avoid any module resolution during prerender.
 */
"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[GlobalError]", error);
  }, [error]);

  return (
    <html lang="ar" dir="rtl">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <title>Error - GarfiX EOS</title>
      </head>
      <body style={{
        margin: 0, padding: "2rem",
        minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
        background: "#0b1220", color: "#f3f4f6", fontFamily: "system-ui, sans-serif",
      }}>
        <div style={{ textAlign: "center", maxWidth: "28rem" }}>
          <h1 style={{ fontSize: "1.5rem", fontWeight: 800, marginBottom: "0.5rem" }}>
            تعذر تحميل التطبيق
          </h1>
          <p style={{ color: "#9ca3af", fontSize: "0.875rem", marginBottom: "1.5rem" }}>
            حدث خطأ غير متوقع. حاول تحديث الصفحة.
          </p>
          {error.digest && (
            <p style={{ fontSize: "0.7rem", color: "#4b5563", fontFamily: "monospace", marginBottom: "1rem" }}>
              digest: {error.digest}
            </p>
          )}
          <button
            onClick={reset}
            style={{
              padding: "0.75rem 1.5rem", background: "#059669", color: "white",
              border: "none", borderRadius: "0.5rem", fontSize: "0.875rem",
              fontWeight: 700, cursor: "pointer",
            }}
          >
            إعادة المحاولة
          </button>
        </div>
      </body>
    </html>
  );
}

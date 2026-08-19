/**
 * global-error.tsx — Root-level error boundary
 *
 * Renders OUTSIDE the root layout — must include its own <html> and <body>.
 * Uses inline CSS + prefers-color-scheme to support light/dark mode
 * without relying on CSS variables from the theme system.
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
        <style>{`
          body { margin: 0; padding: 2rem; min-height: 100vh; display: flex; align-items: center; justify-content: center; font-family: system-ui, sans-serif; }
          @media (prefers-color-scheme: dark) { body { background: #0b1220; color: #f3f4f6; } }
          @media (prefers-color-scheme: light) { body { background: #ffffff; color: #111827; } }
          .err-muted { color: #6b7280; }
          .err-digest { font-size: 0.7rem; color: #9ca3af; font-family: monospace; margin-bottom: 1rem; }
          .err-btn { padding: 0.75rem 1.5rem; background: #059669; color: white; border: none; border-radius: 0.5rem; font-size: 0.875rem; font-weight: 700; cursor: pointer; }
          .err-btn:hover { background: #047857; }
        `}</style>
      </head>
      <body>
        <div style={{ textAlign: "center", maxWidth: "28rem" }}>
          <h1 style={{ fontSize: "1.5rem", fontWeight: 800, marginBottom: "0.5rem" }}>
            تعذر تحميل التطبيق
          </h1>
          <p className="err-muted" style={{ fontSize: "0.875rem", marginBottom: "1.5rem" }}>
            حدث خطأ غير متوقع. حاول تحديث الصفحة.
          </p>
          {error.digest && (
            <p className="err-digest">
              digest: {error.digest}
            </p>
          )}
          <button onClick={reset} className="err-btn">
            إعادة المحاولة
          </button>
        </div>
      </body>
    </html>
  );
}

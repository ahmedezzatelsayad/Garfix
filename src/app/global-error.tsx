/**
 * global-error.tsx — Root-level error boundary (DS v4.0 Enhanced)
 *
 * Enhanced with:
 * - Full HTML wrapper (required by Next.js for root errors)
 * - Brand-consistent dark emerald theme
 * - Actionable error messages
 * - Mobile-responsive layout
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
    console.error("[GlobalError/root]", error);
  }, [error]);

  return (
    <html lang="ar" dir="rtl">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <title>خطأ - GarfiX EOS</title>
        <style>{`
          * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
          }
          
          body {
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            background: #0b1220;
            color: #f3f4f6;
            font-family: system-ui, -apple-system, 'Segoe UI', Tahoma, Arial, sans-serif;
            padding: 1rem;
            padding-top: max(1rem, env(safe-area-inset-top));
            padding-bottom: max(1rem, env(safe-area-inset-bottom));
          }
          
          .error-container {
            max-width: 28rem;
            width: 100%;
            text-align: center;
          }
          
          .error-card {
            background: rgba(17, 24, 39, 0.8);
            backdrop-filter: blur(12px);
            border: 1px solid rgba(239, 68, 68, 0.2);
            border-radius: 1rem;
            padding: 2rem;
            box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.3), 0 8px 10px -6px rgba(0, 0, 0, 0.3);
          }
          
          .error-icon-wrapper {
            position: relative;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            width: 5rem;
            height: 5rem;
            border-radius: 50%;
            background: linear-gradient(135deg, rgba(239, 68, 68, 0.15), rgba(220, 38, 38, 0.1));
            border: 1px solid rgba(239, 68, 68, 0.25);
            margin-bottom: 1.5rem;
            animation: pulse-slow 2s ease-in-out infinite;
          }
          
          .error-badge {
            position: absolute;
            top: -0.25rem;
            right: -0.25rem;
            width: 1.75rem;
            height: 1.75rem;
            border-radius: 50%;
            background: #ef4444;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 0.75rem;
            font-weight: bold;
            color: white;
            animation: bounce-slow 1.5s ease-in-out infinite;
          }
          
          h1 {
            font-size: 1.5rem;
            font-weight: 800;
            margin-bottom: 0.5rem;
            color: #f9fafb;
          }
          
          .message {
            font-size: 0.875rem;
            color: #9ca3af;
            line-height: 1.6;
            margin-bottom: 1.5rem;
          }
          
          .solution-box {
            background: rgba(4, 120, 87, 0.08);
            border: 1px solid rgba(4, 120, 87, 0.2);
            border-radius: 0.75rem;
            padding: 0.875rem 1rem;
            margin-bottom: 1.5rem;
            text-align: right;
          }
          
          .solution-label {
            display: flex;
            align-items: center;
            gap: 0.5rem;
            font-size: 0.75rem;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.05em;
            color: #34d399;
            margin-bottom: 0.375rem;
          }
          
          .solution-text {
            font-size: 0.8125rem;
            color: #6ee7b7;
            line-height: 1.5;
          }
          
          .digest-info {
            font-size: 0.6875rem;
            color: #4b5563;
            font-family: ui-monospace, monospace;
            direction: ltr;
            margin-bottom: 1.5rem;
            opacity: 0.7;
          }
          
          .btn-primary {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            gap: 0.5rem;
            width: 100%;
            padding: 0.875rem 1.5rem;
            background: linear-gradient(to right, #059669, #047857);
            color: white;
            font-size: 0.875rem;
            font-weight: 700;
            border: none;
            border-radius: 0.75rem;
            cursor: pointer;
            transition: all 150ms cubic-bezier(0.4, 0, 0.2, 1);
            min-height: 44px; /* Touch target */
          }
          
          .btn-primary:hover {
            background: linear-gradient(to right, #10b981, #059669);
            transform: translateY(-1px);
            box-shadow: 0 10px 15px -3px rgba(4, 120, 87, 0.3);
          }
          
          .btn-primary:active {
            transform: scale(0.98);
          }
          
          .footer-note {
            margin-top: 1.5rem;
            font-size: 0.75rem;
            color: #4b5563;
          }
          
          .footer-note a {
            color: #6b7280;
            text-decoration: underline;
            transition: color 120ms ease;
          }
          
          .footer-note a:hover {
            color: #9ca3af;
          }
          
          @keyframes pulse-slow {
            0%, 100% { opacity: 1; transform: scale(1); }
            50% { opacity: 0.85; transform: scale(0.98); }
          }
          
          @keyframes bounce-slow {
            0%, 100% { transform: translateY(0); }
            50% { transform: translateY(-4px); }
          }
        `}</style>
      </head>
      <body>
        <div className="error-container">
          <div className="error-card">
            
            {/* Animated Icon */}
            <div className="error-icon-wrapper">
              <svg 
                width="32" 
                height="32" 
                viewBox="0 0 24 24" 
                fill="none" 
                stroke="#f87171" 
                strokeWidth="2"
                strokeLinecap="round" 
                strokeLinejoin="round"
              >
                <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                <line x1="12" y1="9" x2="12" y2="13" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
              <div className="error-badge">!</div>
            </div>

            {/* Title & Message */}
            <h1>تعذّر تحميل التطبيق</h1>
            <p className="message">
              حدث خطأ في الطبقة الجذرية للنظام. 
              هذا قد يكون بسبب مشكلة مؤقتة في الاتصال أو تحديث للنظام.
            </p>

            {/* Solution Hint */}
            <div className="solution-box">
              <div className="solution-label">
                <span>💡</span>
                <span>الحل المقترح</span>
              </div>
              <p className="solution-text">
                حاول تحديث الصفحة. إذا استمرت المشكلة، امسح ذاكرة التخزين المؤقت وأعد المحاولة.
              </p>
            </div>

            {/* Technical Digest */}
            {error.digest && (
              <p className="digest-info">
                digest: {error.digest}
              </p>
            )}

            {/* Retry Button */}
            <button onClick={reset} className="btn-primary">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M21 12a9 9 0 11-9-9c2.52 0 4.93 1 6.74 2.74L21 8" />
                <path d="M21 3v5h-5" />
              </svg>
              إعادة المحاولة
            </button>
          </div>

          {/* Footer */}
          <p className="footer-note">
            GarfiX EOS v4.0 · إذا استمرت المشكلة،{" "}
            <a href="/contact">تواصل مع الدعم الفني</a>
          </p>
        </div>
      </body>
    </html>
  );
}

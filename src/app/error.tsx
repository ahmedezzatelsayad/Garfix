/**
 * /error — GarfiX Global Error Boundary (DS v4.0 Enhanced)
 *
 * Enhanced error experience with:
 * - Clear, actionable error messages
 * - Solution suggestions
 * - Brand-consistent dark emerald theme
 * - Helpful recovery actions
 */
"use client";

import { useEffect } from "react";
import Link from "next/link";
import { 
  RefreshCw, 
  Home, 
  ArrowRight,
  LifeBuoy,
  ShieldAlert
} from "lucide-react";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[ErrorPage]", error);
  }, [error]);

  // Determine error type for better messaging
  const isNetworkError = error.message?.includes('fetch') || error.message?.includes('network');
  const isAuthError = error.message?.includes('auth') || error.message?.includes('unauthorized');
  
  const getErrorConfig = () => {
    if (isNetworkError) {
      return {
        icon: '🌐',
        title: 'مشكلة في الاتصال',
        message: 'تعذر الاتصال بالخادم. تأكد من اتصالك بالإنترنت.',
        solution: 'تحقق من شبكة الإنترنت وحاول مرة أخرى'
      };
    }
    if (isAuthError) {
      return {
        icon: '🔐',
        title: 'جلسة منتهية',
        message: 'انتهت صلاحية جلستك. يرجى تسجيل الدخول مرة أخرى.',
        solution: 'سجّل دخولك للمتابعة'
      };
    }
    return {
      icon: '⚠️',
      title: 'حدث خطأ غير متوقع',
      message: error.message || 'تعذّر تحميل هذه الصفحة. حاول مرة أخرى.',
      solution: 'إذا استمرت المشكلة، تواصل مع الدعم الفني'
    };
  };

  const config = getErrorConfig();

  return (
    <div
      className="min-h-dvh flex items-center justify-center bg-[#0b1220] text-foreground p-6"
      dir="rtl"
    >
      <div className="max-w-md w-full">
        
        {/* ── Main Error Card (DS v4.0 Glass) ── */}
        <div className="glass-strong rounded-2xl border border-red-500/20 p-8 space-y-6 shadow-brand-lg">
          
          {/* Header with Icon */}
          <div className="text-center space-y-4">
            {/* Animated Error Icon */}
            <div className="mx-auto relative">
              <div className="h-20 w-20 rounded-full bg-gradient-to-br from-red-500/20 to-red-600/10 flex items-center justify-center animate-pulse-slow border border-red-500/20">
                <ShieldAlert className="h-10 w-10 text-red-400" />
              </div>
              {/* Floating badge */}
              <div className="absolute -top-1 -right-1 h-7 w-7 rounded-full bg-red-500 flex items-center justify-center shadow-lg animate-bounce-slow">
                <span className="text-xs font-bold text-white">!</span>
              </div>
            </div>

            {/* Error Title & Message */}
            <div className="space-y-2">
              <h1 className="text-2xl font-extrabold text-foreground">
                {config.title}
              </h1>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {config.message}
              </p>
            </div>
          </div>

          {/* Solution Hint */}
          <div className="rounded-xl bg-emerald-500/5 border border-emerald-500/20 p-4 space-y-2">
            <div className="flex items-center gap-2 text-emerald-400">
              <LifeBuoy className="h-4 w-4" />
              <span className="text-xs font-semibold uppercase tracking-wide">الحل المقترح</span>
            </div>
            <p className="text-sm text-emerald-300/80 leading-relaxed">
              💡 {config.solution}
            </p>
          </div>

          {/* Technical Details (Collapsible) */}
          {error.digest && (
            <details className="group">
              <summary className="cursor-pointer text-xs text-muted-foreground/60 hover:text-muted-foreground transition-colors font-mono select-none">
                تفاصيل تقنية ({error.digest.slice(0, 8)}…)
              </summary>
              <pre className="mt-2 p-3 rounded-lg bg-[#0b1220] border border-border text-[11px] text-red-400/70 overflow-x-auto" dir="ltr">
                {error.stack || error.message}
              </pre>
            </details>
          )}

          {/* Action Buttons */}
          <div className="space-y-3">
            {/* Primary Action: Retry */}
            <button
              onClick={reset}
              className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-500 hover:to-emerald-600 text-white px-6 py-3.5 text-sm font-bold shadow-brand-md hover:shadow-brand-lg active:scale-[0.98] transition-all duration-150 hover-lift"
            >
              <RefreshCw className="h-4 w-4" />
              إعادة المحاولة
            </button>

            {/* Secondary Actions Row */}
            <div className="grid grid-cols-2 gap-3">
              <Link
                href="/"
                className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-emerald-500/30 bg-emerald-500/5 px-4 py-2.5 text-sm font-semibold text-emerald-400 hover:bg-emerald-500/10 hover:border-emerald-500/50 transition-all duration-150"
              >
                <Home className="h-4 w-4" />
                الرئيسية
              </Link>
              
              <Link
                href="/help"
                className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-border bg-surface px-4 py-2.5 text-sm font-semibold text-muted-foreground hover:bg-elevated hover:text-foreground transition-all duration-150"
              >
                <LifeBuoy className="h-4 w-4" />
                مركز المساعدة
                <ArrowRight className="h-3 w-3 rtl:rotate-0" />
              </Link>
            </div>
          </div>
        </div>

        {/* Footer Note */}
        <p className="text-center text-xs text-muted-foreground/40 mt-6">
          GarfiX EOS v4.0 · إذا استمرت المشكلة،{" "}
          <Link href="/contact" className="underline hover:text-muted-foreground transition-colors">
            تواصل معنا
          </Link>
        </p>
      </div>

      {/* Phase 2 P2 fix: replaced style-jsx with a regular style tag.
          styled-jsx adds ~5KB to this page's bundle and is unusual in a
          Tailwind 4 codebase. Regular <style> with dangerouslySetInnerHTML
          achieves the same result without the styled-jsx runtime. */}
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes pulse-slow { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.8; transform: scale(0.98); } }
        @keyframes bounce-slow { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-4px); } }
        .animate-pulse-slow { animation: pulse-slow 2s ease-in-out infinite; }
        .animate-bounce-slow { animation: bounce-slow 1.5s ease-in-out infinite; }
      `}} />
    </div>
  );
}

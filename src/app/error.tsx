"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.error("[GlobalError]", error);
  }, [error]);

  return (
    <div
      className="min-h-dvh flex items-center justify-center bg-background text-foreground p-6"
      dir="rtl"
    >
      <div className="max-w-md w-full text-center space-y-6">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-destructive/10 text-destructive font-extrabold text-2xl">
          !
        </div>
        <div className="space-y-2">
          <h1 className="text-2xl font-extrabold">حدث خطأ غير متوقع</h1>
          <p className="text-muted-foreground text-sm">
            {error.message || "تعذّر تحميل هذه الصفحة. حاول مرة أخرى."}
          </p>
          {error.digest && (
            <p className="text-[11px] text-muted-foreground/60 font-mono" dir="ltr">
              digest: {error.digest}
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <button
            onClick={reset}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-bold text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            إعادة المحاولة
          </button>
          <Link
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-border px-4 py-2 text-sm font-bold text-foreground hover:bg-accent transition-colors"
          >
            العودة للرئيسية
          </Link>
        </div>
      </div>
    </div>
  );
}
